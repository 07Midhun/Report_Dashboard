import os
import io
import re
from pathlib import Path
from sqlalchemy.orm import Session
from sqlalchemy import text

from ..database import engine, Base
from ..models.region import Region
from ..models.ward import Ward
from ..models.pole import Pole
from ..models.report import Report
from ..models.user import User

# Exact BBMP hierarchy required:
# 2 Zones / Divisions: Bommanahalli (1 constituency, 11 wards) & East (6 constituencies, 46 wards) = 7 constituencies, 57 wards total.
BBMP_HIERARCHY = [
    {
        "division": "Bommanahalli",
        "zones": [
            {
                "code": "BOM-Z1",
                "name": "Bommanahalli-Z1",
                "start_ward": 202,
                "end_ward": 212  # 11 wards (W202 - W212)
            }
        ]
    },
    {
        "division": "East",
        "zones": [
            {
                "code": "CVRN",
                "name": "CVRamanNagar",
                "start_ward": 108,
                "end_ward": 115  # 8 wards (W108 - W115)
            },
            {
                "code": "HEB",
                "name": "Hebbal",
                "start_ward": 61,
                "end_ward": 68   # 8 wards (W61 - W68)
            },
            {
                "code": "PKN",
                "name": "PulakeshiNagar",
                "start_ward": 69,
                "end_ward": 75   # 7 wards (W69 - W75, including newly added W75)
            },
            {
                "code": "SVN",
                "name": "SarvagnaNagar",
                "start_ward": 76,
                "end_ward": 85   # 10 wards (W76 - W85)
            },
            {
                "code": "STN",
                "name": "ShanthiNagar",
                "start_ward": 166,
                "end_ward": 172  # 7 wards (W166 - W172)
            },
            {
                "code": "SJN",
                "name": "SivajiNagar",
                "start_ward": 116,
                "end_ward": 121  # 6 wards (W116 - W121)
            }
        ]
    }
]

def restore_database_backup_if_empty(db: Session) -> bool:
    """
    If the database is brand new (e.g. freshly deployed on Render), restores
    data from database_backup.sql (including 42,000+ poles and existing reports).
    Uses PostgreSQL cursor.copy_expert for high-speed streaming.
    """
    try:
        # Check if database already has poles
        existing_poles = db.query(Pole).count()
        if existing_poles > 0:
            return False

        # Locate database_backup.sql
        possible_paths = [
            Path("database_backup.sql"),
            Path(__file__).resolve().parent.parent.parent.parent / "database_backup.sql",
            Path(__file__).resolve().parent.parent.parent / "database_backup.sql",
        ]
        backup_file = None
        for p in possible_paths:
            if p.is_file() and p.stat().st_size > 1000:
                backup_file = p
                break

        if not backup_file:
            print("[Seed] No database_backup.sql file found; skipping backup restore.", flush=True)
            return False

        print(f"[Seed] Empty database detected. Restoring from {backup_file}...", flush=True)

        with open(backup_file, "r", encoding="utf-8", errors="ignore") as f:
            content = f.read()

        # Find all COPY statements: COPY public.<table_name> (<cols>) FROM stdin; ... \.
        copy_pattern = re.compile(r'COPY\s+public\.(\w+)\s*\(([^)]+)\)\s*FROM\s+stdin;(.*?)\\\.', re.DOTALL)
        copy_blocks = {}
        for match in copy_pattern.finditer(content):
            table_name = match.group(1).lower()
            columns_str = match.group(2).strip()
            data_str = match.group(3).strip()
            if data_str:
                copy_blocks[table_name] = (columns_str, data_str)

        # Restore in strict foreign-key dependency order
        load_order = [
            "users",
            "regions",
            "wards",
            "reports",
            "report_versions",
            "poles",
            "audit_logs",
            "alembic_version"
        ]

        # Get underlying DBAPI connection (psycopg2)
        raw_conn = db.connection().connection
        restored_tables = []

        with raw_conn.cursor() as cur:
            for tbl in load_order:
                if tbl in copy_blocks:
                    cols, data = copy_blocks[tbl]
                    # Only insert if table is currently empty
                    cur.execute(f"SELECT COUNT(*) FROM public.{tbl};")
                    count = cur.fetchone()[0]
                    if count == 0:
                        stream = io.StringIO(data + "\n")
                        copy_sql = f"COPY public.{tbl} ({cols}) FROM stdin"
                        cur.copy_expert(copy_sql, stream)
                        restored_tables.append(tbl)

            # Reset serial sequences for PostgreSQL
            for tbl in ["users", "regions", "wards", "reports", "report_versions", "poles", "audit_logs"]:
                try:
                    cur.execute(f"SELECT setval(pg_get_serial_sequence('{tbl}', 'id'), COALESCE(MAX(id), 1)) FROM public.{tbl};")
                except Exception:
                    pass

        raw_conn.commit()
        print(f"[Seed] Successfully restored tables from backup: {restored_tables}", flush=True)
        return True

    except Exception as e:
        print(f"[Seed] Notice: Could not restore from database_backup.sql: {e}", flush=True)
        try:
            db.rollback()
        except Exception:
            pass
        return False

def seed_bbmp_hierarchy(db: Session):
    """
    Seeds and synchronizes the complete BBMP hierarchy:
    2 zones, 7 constituencies, and 57 wards (including W75 in PulakeshiNagar).
    This function is completely idempotent and safe to run on every startup.
    """
    try:
        # First, attempt to restore backup if DB is completely clean
        restore_database_backup_if_empty(db)

        valid_region_codes = []
        for div in BBMP_HIERARCHY:
            for z in div["zones"]:
                valid_region_codes.append(z["code"])

        # 1. Update or create regions (Constituencies)
        for div in BBMP_HIERARCHY:
            division_name = div["division"]
            for z in div["zones"]:
                code = z["code"]
                name = z["name"]

                region = db.query(Region).filter(Region.region_code == code).first()
                if not region:
                    region = Region(
                        region_code=code,
                        region_name=name,
                        division=division_name,
                        corporation="Bangalore (BBMP)"
                    )
                    db.add(region)
                    db.flush()
                else:
                    region.region_name = name
                    region.division = division_name
                    region.corporation = "Bangalore (BBMP)"
                    db.flush()

                # 2. Seed wards for this constituency
                for w_num in range(z["start_ward"], z["end_ward"] + 1):
                    w_code = f"W{w_num}"
                    w_full_code = f"{code}-W{w_num}"
                    w_name = w_code

                    ward = db.query(Ward).filter(Ward.region_id == region.id, Ward.ward_number == w_code).first()
                    if not ward:
                        ward = Ward(
                            region_id=region.id,
                            ward_number=w_code,
                            ward_name=w_name,
                            ward_code=w_full_code
                        )
                        db.add(ward)
                    else:
                        ward.ward_name = w_name
                        ward.ward_code = w_full_code

                # Clean up extraneous wards in this zone that have no reports
                valid_w_codes = [f"W{w_num}" for w_num in range(z["start_ward"], z["end_ward"] + 1)]
                extraneous = db.query(Ward).filter(
                    Ward.region_id == region.id,
                    ~Ward.ward_number.in_(valid_w_codes)
                ).all()
                for ew in extraneous:
                    if not ew.reports:
                        db.delete(ew)

        # 3. Clean up any invalid temporary regions without reports
        old_regions = db.query(Region).filter(~Region.region_code.in_(valid_region_codes)).all()
        for r in old_regions:
            has_reports = any(len(w.reports) > 0 for w in r.wards)
            if not has_reports:
                db.delete(r)

        db.commit()

        total_regions = db.query(Region).count()
        total_wards = db.query(Ward).count()
        print(f"[Seed] BBMP hierarchy verified: {total_regions} constituencies, {total_wards} wards ready.", flush=True)

    except Exception as e:
        db.rollback()
        print(f"[Seed] Error ensuring BBMP hierarchy: {e}", flush=True)
