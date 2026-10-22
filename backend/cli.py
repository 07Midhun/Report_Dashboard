import sys
import os
import argparse
from pathlib import Path

# Add project root to path
ROOT_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT_DIR))

from backend.app.database import engine, SessionLocal, Base
from backend.app.models import User, Region, Ward, Report, ReportVersion, Pole, AuditLog
from backend.app.services.auth_service import get_password_hash
from backend.app.services.pole_service import import_poles_for_ward
import shutil

def init_db():
    """Initializes tables in PostgreSQL."""
    print("Initializing database tables...")
    Base.metadata.create_all(bind=engine)
    print("Database tables created successfully!")

def create_admin(username=None, password=None):
    """Creates or updates an administrator account."""
    db = SessionLocal()
    try:
        username = username or os.getenv("ADMIN_USERNAME")
        password = password or os.getenv("ADMIN_PASSWORD")

        if not username:
            username = input("Enter admin username: ").strip()
        if not password:
            import getpass
            password = getpass.getpass("Enter admin password: ").strip()

        if not username or not password:
            print("Error: Username and password are required.")
            return False

        existing = db.query(User).filter(User.username == username).first()
        hashed = get_password_hash(password)
        if existing:
            existing.password_hash = hashed
            existing.role = "admin"
            existing.is_active = True
            db.commit()
            print(f"Updated existing user '{username}' with admin role and new password.")
        else:
            user = User(
                username=username,
                password_hash=hashed,
                role="admin",
                is_active=True
            )
            db.add(user)
            db.commit()
            print(f"Admin user '{username}' created successfully!")
        return True
    finally:
        db.close()

def seed_data():
    """Seeds realistic regions and wards, an admin user, and normal user."""
    db = SessionLocal()
    try:
        # 1. Create default admin and normal user if not existing
        admin_user = db.query(User).filter(User.username == "admin").first()
        if not admin_user:
            admin_user = User(
                username="admin",
                password_hash=get_password_hash("Admin@12345"),
                role="admin",
                is_active=True
            )
            db.add(admin_user)
            print("Created default admin user: admin / Admin@12345")

        operator_user = db.query(User).filter(User.username == "operator").first()
        if not operator_user:
            operator_user = User(
                username="operator",
                password_hash=get_password_hash("User@12345"),
                role="user",
                is_active=True
            )
            db.add(operator_user)
            print("Created normal user: operator / User@12345")

        db.commit()

        # 2. Seed Regions and Wards (based on real domain data found in D:\SCHNELL)
        regions_data = [
            {
                "code": "HEB",
                "name": "Hebbal Region (HEB)",
                "wards": [
                    {"number": "W61", "name": "W61", "code": "HEB-W61"},
                    {"number": "W62", "name": "W62", "code": "HEB-W62"},
                    {"number": "W63", "name": "W63", "code": "HEB-W63"},
                    {"number": "W64", "name": "W64", "code": "HEB-W64"},
                ]
            },
            {
                "code": "CBE",
                "name": "Coimbatore Corporation (CBE)",
                "wards": [
                    {"number": "W110", "name": "Ward 110 - Singanallur", "code": "CBE-W110"},
                    {"number": "W111", "name": "Ward 111 - Ramanathapuram", "code": "CBE-W111"},
                    {"number": "W112", "name": "Ward 112 - Peelamedu", "code": "CBE-W112"},
                ]
            },
            {
                "code": "PN",
                "name": "Periyanayakkanpalayam (PN)",
                "wards": [
                    {"number": "W70", "name": "Ward 70 - North Sector", "code": "PN-W70"},
                    {"number": "W71", "name": "Ward 71 - Central Sector", "code": "PN-W71"},
                    {"number": "W72", "name": "Ward 72 - South Sector", "code": "PN-W72"},
                ]
            },
            {
                "code": "CVRN",
                "name": "CV Raman Nagar (CVRN)",
                "wards": [
                    {"number": "W167", "name": "Ward 167 - Kaggadasapura", "code": "CVRN-W167"},
                    {"number": "W169", "name": "Ward 169 - Binnamangala", "code": "CVRN-W169"},
                ]
            }
        ]

        for r_item in regions_data:
            reg = db.query(Region).filter(Region.region_code == r_item["code"]).first()
            if not reg:
                reg = Region(region_code=r_item["code"], region_name=r_item["name"])
                db.add(reg)
                db.flush()
                print(f"Created region: {reg.region_name}")

            for w_item in r_item["wards"]:
                ward = db.query(Ward).filter(Ward.ward_code == w_item["code"]).first()
                if not ward:
                    ward = Ward(
                        region_id=reg.id,
                        ward_number=w_item["number"],
                        ward_name=w_item["name"],
                        ward_code=w_item["code"]
                    )
                    db.add(ward)
                    print(f"  Created ward: {ward.ward_name} ({ward.ward_code})")

        db.commit()

        # 3. Check if real HEB W64 Excel reports are present in D:\SCHNELL\HEB and attach them!
        heb_w64 = db.query(Ward).filter(Ward.ward_code == "HEB-W64").first()
        admin_ref = db.query(User).filter(User.username == "admin").first()

        sample_source_dir = Path("D:/SCHNELL/HEB")
        if heb_w64 and admin_ref and sample_source_dir.is_dir():
            print("\nAttaching sample real reports for HEB-W64...")
            from backend.app.config import settings
            import uuid

            sample_files = [
                {
                    "category": "pole_report",
                    "filename": "Pole_survey_report(w64).xlsx",
                    "source": sample_source_dir / "Pole_survey_report(w64).xlsx"
                },
                {
                    "category": "lamp_installation",
                    "filename": "Lamp_report(W64).xlsx",
                    "source": sample_source_dir / "Lamp_report(W64).xlsx"
                },
                {
                    "category": "commission_integrated",
                    "filename": "Commission_Integrated_HEB_W64.xlsx",
                    "source": sample_source_dir / "HEB-W64_mapping-summary.xlsx"
                }
            ]

            for s_info in sample_files:
                if s_info["source"].is_file():
                    # Check if already in DB
                    existing_rep = db.query(Report).filter(
                        Report.ward_id == heb_w64.id,
                        Report.report_type == s_info["category"]
                    ).first()

                    if not existing_rep:
                        unique_id = uuid.uuid4().hex
                        target_dir = Path(settings.STORAGE_ROOT) / "reports" / f"region_{heb_w64.region_id}" / f"ward_{heb_w64.id}" / unique_id
                        target_dir.mkdir(parents=True, exist_ok=True)
                        dest_file = target_dir / f"report_{unique_id}.xlsx"
                        shutil.copyfile(s_info["source"], dest_file)

                        file_size = os.path.getsize(dest_file)
                        rep = Report(
                            ward_id=heb_w64.id,
                            report_type=s_info["category"],
                            original_filename=s_info["filename"],
                            storage_key=str(dest_file.resolve()),
                            file_extension=".xlsx",
                            file_size=file_size,
                            uploaded_by=admin_ref.id
                        )
                        db.add(rep)
                        db.flush()

                        v1 = ReportVersion(
                            report_id=rep.id,
                            original_filename=s_info["filename"],
                            storage_key=str(dest_file.resolve()),
                            file_size=file_size,
                            uploaded_by=admin_ref.id,
                            version_number=1
                        )
                        db.add(v1)
                        print(f"  Attached {s_info['category']}: {s_info['filename']}")

            db.commit()

            # Trigger pole extraction for HEB-W64
            try:
                print("Extracting pole markers for HEB-W64...")
                import_res = import_poles_for_ward(db, heb_w64.id, admin_ref.id, preferred_report_type="pole_report")
                print(f"Imported {import_res['imported_count']} poles with real coordinates!")
            except Exception as e:
                print(f"Warning during initial pole extraction: {e}")

        print("\nSeed process completed successfully!")
    finally:
        db.close()

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Ward-Wise Pole Management Backend CLI")
    subparsers = parser.add_subparsers(dest="command")

    # init-db
    subparsers.add_parser("init-db", help="Create database tables")

    # create-admin
    admin_parser = subparsers.add_parser("create-admin", help="Create or update administrator account")
    admin_parser.add_argument("--username", help="Admin username")
    admin_parser.add_argument("--password", help="Admin password")

    # seed
    subparsers.add_parser("seed", help="Seed database with sample regions, wards, users and real data")

    args = parser.parse_args()

    if args.command == "init-db":
        init_db()
    elif args.command == "create-admin":
        create_admin(args.username, args.password)
    elif args.command == "seed":
        init_db()
        seed_data()
    else:
        parser.print_help()
