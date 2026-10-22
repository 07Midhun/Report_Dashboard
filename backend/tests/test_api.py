import io
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
import pandas as pd

from backend.app.main import app
from backend.app.database import Base, get_db
from backend.app.models import User, Region, Ward, Report, ReportVersion, Pole
from backend.app.services.auth_service import get_password_hash, create_access_token

# Use in-memory SQLite with StaticPool so all connections share the same memory instance
TEST_DATABASE_URL = "sqlite:///:memory:"
test_engine = create_engine(
    TEST_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)

def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()

app.dependency_overrides[get_db] = override_get_db

@pytest.fixture(autouse=True)
def setup_test_db():
    Base.metadata.create_all(bind=test_engine)
    db = TestingSessionLocal()
    
    # Create test users
    admin = User(
        username="test_admin",
        password_hash=get_password_hash("AdminPass123!"),
        role="admin",
        is_active=True
    )
    user = User(
        username="test_user",
        password_hash=get_password_hash("UserPass123!"),
        role="user",
        is_active=True
    )
    db.add_all([admin, user])
    db.commit()

    # Create test regions and wards
    reg = Region(
        corporation="Bangalore (BBMP)",
        division="East",
        region_code="REG1",
        region_name="Region One"
    )
    db.add(reg)
    db.flush()

    ward1 = Ward(region_id=reg.id, ward_number="W1", ward_name="Ward 1", ward_code="REG1-W1")
    ward2 = Ward(region_id=reg.id, ward_number="W2", ward_name="Ward 2", ward_code="REG1-W2")
    db.add_all([ward1, ward2])
    db.commit()

    db.close()
    yield
    Base.metadata.drop_all(bind=test_engine)

client = TestClient(app)

def get_auth_header(username: str, role: str):
    token = create_access_token({"sub": username, "role": role})
    return {"Authorization": f"Bearer {token}"}

def test_auth_login():
    """Verify login with correct credentials returns valid JWT."""
    res = client.post("/api/auth/login", json={"username": "test_admin", "password": "AdminPass123!"})
    assert res.status_code == 200
    data = res.json()
    assert "access_token" in data
    assert data["user"]["role"] == "admin"

    # Bad login
    bad_res = client.post("/api/auth/login", json={"username": "test_admin", "password": "wrong"})
    assert bad_res.status_code == 401

def test_regions_and_ward_hierarchy():
    """Verify regions endpoint returns hierarchy with wards, corporation, and division."""
    user_header = get_auth_header("test_user", "user")
    res = client.get("/api/regions", headers=user_header)
    assert res.status_code == 200
    regions = res.json()
    assert len(regions) >= 1
    assert regions[0]["corporation"] == "Bangalore (BBMP)"
    assert regions[0]["division"] == "East"
    assert regions[0]["region_code"] == "REG1"
    assert len(regions[0]["wards"]) == 2

def test_get_ward_report_tabular_data():
    """Verify operator can fetch parsed tabular Excel data for a ward report."""
    admin_header = get_auth_header("test_admin", "admin")
    user_header = get_auth_header("test_user", "user")

    # Admin uploads sample excel report
    df = pd.DataFrame({
        "Pole ID": ["P-101", "P-102"],
        "Height (m)": [9.0, 12.5],
        "Pole Type": ["Steel Octagonal", "Tubular"],
        "Operational Status": ["Active", "Maintenance"]
    })
    excel_buffer = io.BytesIO()
    with pd.ExcelWriter(excel_buffer, engine="openpyxl") as writer:
        df.to_excel(writer, index=False)
    excel_buffer.seek(0)

    upload_res = client.post(
        "/api/wards/1/reports/pole_report",
        headers=admin_header,
        files={"file": ("Poles_Data_W1.xlsx", excel_buffer.getvalue(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
    )
    assert upload_res.status_code == 200
    report_id = upload_res.json()["report"]["id"]

    # Operator fetches tabular data by category
    cat_data_res = client.get("/api/wards/1/reports/pole_report/data", headers=user_header)
    assert cat_data_res.status_code == 200
    cat_json = cat_data_res.json()
    assert cat_json["report_id"] == report_id
    assert cat_json["total_rows"] == 2
    assert "Pole ID" in cat_json["columns"]
    assert len(cat_json["rows"]) == 2
    assert cat_json["rows"][0]["Pole ID"] == "P-101"

    # Operator fetches tabular data directly by report ID
    rep_data_res = client.get(f"/api/reports/{report_id}/data", headers=user_header)
    assert rep_data_res.status_code == 200
    rep_json = rep_data_res.json()
    assert rep_json["report_id"] == report_id
    assert rep_json["total_rows"] == 2
    assert rep_json["rows"][1]["Pole ID"] == "P-102"

def test_normal_user_permission_denied_on_upload():
    """Verify normal user cannot upload or replace reports (Strict RBAC)."""
    user_header = get_auth_header("test_user", "user")
    
    files = {"file": ("test_report.xlsx", io.BytesIO(b"dummy content"), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
    res = client.post("/api/wards/1/reports/pole_report", headers=user_header, files=files)
    assert res.status_code == 403
    assert "Administrator access required" in res.json()["detail"]

def test_admin_upload_and_filename_preservation():
    """Verify admin can upload Excel report, preserve original filename, and download it."""
    admin_header = get_auth_header("test_admin", "admin")

    # Create small valid Excel file in memory with pandas
    df = pd.DataFrame({
        "Pole Number": ["P001", "P002"],
        "Latitude": [13.0123, 13.0124],
        "Longitude": [77.6123, 77.6124],
        "Light Status": ["Connected", "Disconnected"]
    })
    excel_buffer = io.BytesIO()
    with pd.ExcelWriter(excel_buffer, engine="openpyxl") as writer:
        df.to_excel(writer, index=False)
    excel_buffer.seek(0)

    original_name = "Pole_Survey_Test_Original.xlsx"
    files = {"file": (original_name, excel_buffer.getvalue(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
    
    upload_res = client.post("/api/wards/1/reports/pole_report", headers=admin_header, files=files)
    assert upload_res.status_code == 200
    data = upload_res.json()
    assert data["report"]["original_filename"] == original_name
    report_id = data["report"]["id"]

    # Test download by normal user
    user_header = get_auth_header("test_user", "user")
    dl_res = client.get(f"/api/reports/{report_id}/download", headers=user_header)
    assert dl_res.status_code == 200
    # Content-Disposition header must preserve original filename
    content_disp = dl_res.headers.get("content-disposition", "")
    assert original_name in content_disp

def test_duplicate_upload_conflict_and_replace():
    """Verify uploading same report type returns 409 conflict, and replace succeeds with version 2."""
    admin_header = get_auth_header("test_admin", "admin")

    # Initial upload
    excel_buffer = io.BytesIO()
    pd.DataFrame({"Pole Number": ["P1"], "Latitude": [13.1], "Longitude": [77.1]}).to_excel(excel_buffer, index=False)
    excel_data = excel_buffer.getvalue()

    client.post(
        "/api/wards/1/reports/pole_report",
        headers=admin_header,
        files={"file": ("file_v1.xlsx", excel_data, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
    )

    # Duplicate upload should return 409 Conflict
    dup_res = client.post(
        "/api/wards/1/reports/pole_report",
        headers=admin_header,
        files={"file": ("file_v2.xlsx", excel_data, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
    )
    assert dup_res.status_code == 409

    # Safe replace endpoint should succeed and increment version
    replace_res = client.post(
        "/api/wards/1/reports/pole_report/replace",
        headers=admin_header,
        files={"file": ("file_v2.xlsx", excel_data, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
    )
    assert replace_res.status_code == 200
    rep_data = replace_res.json()
    assert rep_data["is_replacement"] is True
    assert rep_data["report"]["original_filename"] == "file_v2.xlsx"
    assert rep_data["report"]["versions_count"] == 2

def test_ward_data_isolation():
    """Verify pole datasets and reports of ward 1 are strictly isolated from ward 2."""
    admin_header = get_auth_header("test_admin", "admin")

    excel_buffer1 = io.BytesIO()
    pd.DataFrame({"Pole Number": ["W1_P100"], "Latitude": [13.2], "Longitude": [77.2]}).to_excel(excel_buffer1, index=False)
    client.post(
        "/api/wards/1/reports/pole_report",
        headers=admin_header,
        files={"file": ("w1_report.xlsx", excel_buffer1.getvalue(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
    )

    excel_buffer2 = io.BytesIO()
    pd.DataFrame({"Pole Number": ["W2_P200"], "Latitude": [13.3], "Longitude": [77.3]}).to_excel(excel_buffer2, index=False)
    client.post(
        "/api/wards/2/reports/pole_report",
        headers=admin_header,
        files={"file": ("w2_report.xlsx", excel_buffer2.getvalue(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
    )

    # Query ward 1 poles
    user_header = get_auth_header("test_user", "user")
    w1_poles_res = client.get("/api/wards/1/poles", headers=user_header)
    w1_poles = w1_poles_res.json()
    assert len(w1_poles) == 1
    assert w1_poles[0]["pole_number"] == "W1_P100"

    # Query ward 2 poles
    w2_poles_res = client.get("/api/wards/2/poles", headers=user_header)
    w2_poles = w2_poles_res.json()
    assert len(w2_poles) == 1
    assert w2_poles[0]["pole_number"] == "W2_P200"

    # Ensure no cross-contamination
    assert all(p["pole_number"] != "W2_P200" for p in w1_poles)
    assert all(p["pole_number"] != "W1_P100" for p in w2_poles)

def test_delete_report_permissions():
    """Verify normal user cannot delete reports; admin can delete and reset slot."""
    admin_header = get_auth_header("test_admin", "admin")
    user_header = get_auth_header("test_user", "user")

    excel_buffer = io.BytesIO()
    pd.DataFrame({"Pole Number": ["P_DEL"], "Latitude": [13.4], "Longitude": [77.4]}).to_excel(excel_buffer, index=False)
    
    upload_res = client.post(
        "/api/wards/1/reports/lamp_installation",
        headers=admin_header,
        files={"file": ("to_delete.xlsx", excel_buffer.getvalue(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
    )
    report_id = upload_res.json()["report"]["id"]

    # Normal user try to delete
    del_forbidden = client.delete(f"/api/reports/{report_id}", headers=user_header)
    assert del_forbidden.status_code == 403

    # Admin delete
    del_res = client.delete(f"/api/reports/{report_id}", headers=admin_header)
    assert del_res.status_code == 200

    # Verify slot is reset
    slots_res = client.get("/api/wards/1/reports", headers=user_header)
    slots = slots_res.json()["slots"]
    lamp_slot = next(s for s in slots if s["category_key"] == "lamp_installation")
    assert lamp_slot["is_uploaded"] is False

def test_invalid_file_extension():
    """Verify uploading a non-excel file returns 400 Bad Request."""
    admin_header = get_auth_header("test_admin", "admin")
    res = client.post(
        "/api/wards/1/reports/pole_report",
        headers=admin_header,
        files={"file": ("malicious.exe", b"not an excel file", "application/octet-stream")}
    )
    assert res.status_code == 400
    assert "Only Excel files (.xlsx, .xls) are permitted" in res.json()["detail"]
