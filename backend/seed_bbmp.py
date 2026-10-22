import sys
from pathlib import Path

# Add project root to path
ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from backend.app.database import engine, Base, SessionLocal
from backend.app.models.region import Region
from backend.app.models.ward import Ward
from sqlalchemy import text

# Hierarchical specification directly from requirements:
# Bangalore (BBMP) -> Bommanahalli & East
# Bommanahalli -> Bommanahalli-Z1 (W202 - W212)
# East ->
#   CVRamanNagar (W108 - W115)
#   Hebbal (W61 - W68)
#   PulakeshiNagar (W69 - W74)
#   SarvagnaNagar (W76 - W85)
#   ShanthiNagar (W166 - W172)
#   SivajiNagar (W116 - W121)

BBMP_HIERARCHY = [
    {
        "division": "Bommanahalli",
        "zones": [
            {
                "code": "BOM-Z1",
                "name": "Bommanahalli-Z1",
                "start_ward": 202,
                "end_ward": 212
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
                "end_ward": 115
            },
            {
                "code": "HEB",
                "name": "Hebbal",
                "start_ward": 61,
                "end_ward": 68
            },
            {
                "code": "PKN",
                "name": "PulakeshiNagar",
                "start_ward": 69,
                "end_ward": 74
            },
            {
                "code": "SVN",
                "name": "SarvagnaNagar",
                "start_ward": 76,
                "end_ward": 85
            },
            {
                "code": "STN",
                "name": "ShanthiNagar",
                "start_ward": 166,
                "end_ward": 172
            },
            {
                "code": "SJN",
                "name": "SivajiNagar",
                "start_ward": 116,
                "end_ward": 121
            }
        ]
    }
]

def seed_bbmp():
    # 1. Ensure table structure is up to date
    with engine.connect() as conn:
        conn.execute(text("ALTER TABLE regions ADD COLUMN IF NOT EXISTS corporation VARCHAR(100) DEFAULT 'Bangalore (BBMP)' NOT NULL;"))
        conn.execute(text("ALTER TABLE regions ADD COLUMN IF NOT EXISTS division VARCHAR(100) DEFAULT 'East' NOT NULL;"))
        conn.commit()

    db = SessionLocal()
    try:
        # Keep valid codes
        valid_codes = []
        for div in BBMP_HIERARCHY:
            for z in div["zones"]:
                valid_codes.append(z["code"])

        # Update or create regions
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

                # Seed wards for this zone
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

                # Clean up any extraneous wards not in required range (unless they have reports)
                valid_w_codes = [f"W{w_num}" for w_num in range(z["start_ward"], z["end_ward"] + 1)]
                extraneous_wards = db.query(Ward).filter(
                    Ward.region_id == region.id,
                    ~Ward.ward_number.in_(valid_w_codes)
                ).all()
                for ew in extraneous_wards:
                    if not ew.reports:
                        db.delete(ew)

        # Deactivate or remove any old temporary regions outside BBMP
        old_regions = db.query(Region).filter(~Region.region_code.in_(valid_codes)).all()
        for r in old_regions:
            has_reports = any(len(w.reports) > 0 for w in r.wards)
            if not has_reports:
                db.delete(r)

        db.commit()
        print("Bangalore (BBMP) hierarchy seeded successfully:")
        for r in db.query(Region).order_by(Region.division, Region.region_name).all():
            wards_list = [w.ward_number for w in r.wards]
            print(f"[{r.corporation}] -> {r.division} -> {r.region_name} ({r.region_code}): {len(r.wards)} wards ({wards_list[0]} to {wards_list[-1]})")

    finally:
        db.close()

if __name__ == "__main__":
    seed_bbmp()
