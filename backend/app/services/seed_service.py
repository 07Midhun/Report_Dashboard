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
                "code": "BMH",
                "name": "Bommanahalli",
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
                "code": "PN",
                "name": "Pulakeshi Nagar",
                "start_ward": 69,
                "end_ward": 75   # 7 wards (W69 - W75, including newly added W75)
            },
            {
                "code": "SN",
                "name": "Sarvagna Nagar",
                "start_ward": 76,
                "end_ward": 85   # 10 wards (W76 - W85)
            },
            {
                "code": "SNTR",
                "name": "ShanthiNagar",
                "start_ward": 166,
                "end_ward": 172  # 7 wards (W166 - W172)
            },
            {
                "code": "SVJR",
                "name": "Sivaji Nagar",
                "start_ward": 116,
                "end_ward": 121  # 6 wards (W116 - W121)
            }
        ]
    }
]

def restore_database_backup_if_empty(db: Session) -> bool:
    """
    Disabled on production/Render to strictly prevent out-of-memory (OOM) crashes on 512MB RAM containers.
    """
    return False

def seed_bbmp_hierarchy(db: Session):
    """
    Seeds and synchronizes the complete BBMP hierarchy:
    2 zones, 7 constituencies, and 57 wards (including W75 in PulakeshiNagar).
    This function is completely idempotent and safe to run on every startup.
    Runs with near-zero memory footprint (<5MB RAM).
    """
    try:
        # Migrate old constituency codes to the new short forms
        old_to_new_codes = {
            "BOM-Z1": "BMH",
            "BOM": "BMH",
            "PKN": "PN",
            "SVN": "SN",
            "STN": "SNTR",
            "SJN": "SVJR"
        }
        for old_c, new_c in old_to_new_codes.items():
            old_r = db.query(Region).filter(Region.region_code == old_c).first()
            if old_r:
                existing_new = db.query(Region).filter(Region.region_code == new_c).first()
                if not existing_new:
                    old_r.region_code = new_c
                    db.flush()
                else:
                    for w in old_r.wards:
                        w.region_id = existing_new.id
                    db.delete(old_r)
                    db.flush()

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
                    # Also try matching by name
                    region = db.query(Region).filter(Region.region_name.ilike(name.replace(" ", ""))).first()
                if not region:
                    region = db.query(Region).filter(Region.region_name.ilike(f"%{name}%")).first()

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
                    region.region_code = code
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

