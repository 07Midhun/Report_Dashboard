from typing import List, Dict, Any, Optional
from pathlib import Path
from sqlalchemy.orm import Session
from sqlalchemy import func
from ..models.pole import Pole
from ..models.report import Report, ReportType
from ..models.ward import Ward
from ..models.audit_log import AuditLog
from ..schemas.pole import PoleSummaryOut, ColumnMappingConfig
from .excel_parser import extract_poles_from_excel, is_valid_lat_long

LEGACY_WARD_MAP = {
    "W61": 1, "W62": 2, "W63": 3, "W64": 4,
    "W65": 32, "W66": 33, "W67": 34, "W68": 35,
    "W69": 36, "W70": 37, "W71": 38, "W72": 39,
    "W73": 40, "W74": 41, "W75": 42,
    "W76": 43, "W77": 44, "W78": 45, "W79": 46,
    "W80": 47, "W81": 48, "W82": 49, "W83": 50,
    "W84": 51, "W85": 52
}

def extract_lamp_report_count_from_file(file_path: Path) -> int:
    """Extracts total valid installed lamp rows from an uploaded Lamp Installation Report."""
    try:
        import openpyxl
        wb = openpyxl.load_workbook(file_path, read_only=True, data_only=True)
        sheet = wb.active
        
        all_rows = []
        for r in sheet.iter_rows(values_only=True):
            if r and any(c is not None and str(c).strip() not in ("", "none", "-", "nan") for c in r):
                all_rows.append(r)
        wb.close()
        
        if not all_rows:
            return 0

        header_keywords = ["pole", "lamp", "sl", "s.no", "id", "watt", "lat", "long", "lng", "road", "ward", "light", "status"]
        
        header_idx = 0
        best_score = 0
        for i in range(min(5, len(all_rows))):
            score = sum(1 for c in all_rows[i] if c and any(k in str(c).strip().lower() for k in header_keywords))
            if score > best_score:
                best_score = score
                header_idx = i

        data_rows = all_rows[header_idx + 1:]
        valid_cnt = 0
        for row in data_rows:
            if any(c is not None and str(c).strip() not in ("", "none", "-", "nan") for c in row):
                valid_cnt += 1

        return valid_cnt
    except Exception:
        try:
            import pandas as pd
            df = pd.read_excel(file_path)
            df = df.dropna(how="all")
            return len(df)
        except Exception:
            return 0

def get_ward_pole_summary(db: Session, ward_id: int) -> PoleSummaryOut:
    """Computes connectivity and coordinate summary for the selected ward, prioritizing merged data."""
    from pathlib import Path
    import json
    import openpyxl
    from ..config import settings
    from .storage_service import resolve_physical_file

    ward = db.query(Ward).filter(Ward.id == ward_id).first()
    merged_dir = Path(settings.STORAGE_ROOT) / "merged"

    cand_metas = []
    cand_poles = []
    if ward:
        cand_metas.append(merged_dir / f"ward_{ward.ward_number}_master_merged_led.json")
        cand_poles.append(merged_dir / f"ward_{ward.ward_number}_master_merged_poles.json")
        if ward.ward_number in LEGACY_WARD_MAP:
            cand_metas.append(merged_dir / f"ward_{LEGACY_WARD_MAP[ward.ward_number]}_master_merged_led.json")
            cand_poles.append(merged_dir / f"ward_{LEGACY_WARD_MAP[ward.ward_number]}_master_merged_poles.json")
    cand_metas.append(merged_dir / f"ward_{ward_id}_master_merged_led.json")
    cand_poles.append(merged_dir / f"ward_{ward_id}_master_merged_poles.json")

    found_meta = None
    for cm in cand_metas:
        if cm.exists():
            found_meta = cm
            break

    found_poles_cache = None
    for cp in cand_poles:
        if cp.exists():
            found_poles_cache = cp
            break

    lamp_cnt = 0
    survey_cnt = 0
    merged_tot = 0
    has_meta = False

    if found_meta:
        try:
            with open(found_meta, "r", encoding="utf-8") as f:
                meta = json.load(f)
            lamp_cnt = meta.get("lamp_rows_count", 0)
            survey_cnt = meta.get("pole_led_rows_count", 0)
            merged_tot = meta.get("total_merged_count", lamp_cnt + survey_cnt)
            has_meta = True
        except Exception:
            pass

    # Check active lamp report in DB - extract total count directly from uploaded lamp installation report
    lamp_rep = db.query(Report).filter(
        Report.ward_id == ward_id,
        Report.report_type == "lamp_installation",
        Report.is_active == True
    ).first()
    if lamp_rep:
        try:
            from .storage_service import safe_resolve_path
            lamp_phys = safe_resolve_path(lamp_rep.storage_key)
            if lamp_phys and lamp_phys.exists():
                direct_cnt = extract_lamp_report_count_from_file(lamp_phys)
                if direct_cnt > 0:
                    lamp_cnt = direct_cnt
        except Exception:
            pass

        if lamp_cnt == 0:
            db_lamp_poles = db.query(Pole).filter(Pole.ward_id == ward_id, Pole.source_report_id == lamp_rep.id).count()
            if db_lamp_poles > 0:
                lamp_cnt = db_lamp_poles

    poles = db.query(Pole).filter(Pole.ward_id == ward_id).all()
    total_db_poles = len(poles)

    connected = sum(1 for p in poles if p.connectivity_status == "connected")
    disconnected = sum(1 for p in poles if p.connectivity_status == "disconnected")
    pending = sum(1 for p in poles if p.connectivity_status == "pending")
    unknown = sum(1 for p in poles if p.connectivity_status == "unknown")

    # Extract coordinates from poles cache if available, else DB poles
    valid_coords = []
    if found_poles_cache:
        try:
            with open(found_poles_cache, "r", encoding="utf-8") as pf:
                poles_data = json.load(pf)
            valid_coords = [
                p for p in poles_data 
                if p.get("latitude") and p.get("longitude") 
                and is_valid_lat_long(float(p["latitude"]), float(p["longitude"]))
            ]
        except Exception:
            valid_coords = []

    if not valid_coords and poles:
        valid_coords = [
            {"latitude": p.latitude, "longitude": p.longitude}
            for p in poles if is_valid_lat_long(p.latitude, p.longitude)
        ]

    has_valid = len(valid_coords) > 0
    center_lat = sum(float(p["latitude"]) for p in valid_coords) / len(valid_coords) if has_valid else None
    center_lon = sum(float(p["longitude"]) for p in valid_coords) / len(valid_coords) if has_valid else None

    # Check available active reports
    reports = db.query(Report).filter(
        Report.ward_id == ward_id, 
        Report.is_active == True
    ).all()
    available_reports = [r.report_type for r in reports]

    # If NO reports have been uploaded for this ward and no merged report exists, return 0 across all metrics
    if not reports and not has_meta:
        return PoleSummaryOut(
            ward_id=ward_id,
            total_poles=0,
            installed_lamp_count=0,
            extracted_survey_count=0,
            connected_poles=0,
            disconnected_poles=0,
            pending_poles=0,
            unknown_poles=0,
            has_valid_coordinates=False,
            center_latitude=None,
            center_longitude=None,
            available_reports=[]
        )

    if has_meta and "master_merged_led" not in available_reports:
        available_reports.append("master_merged_led")

    # Display counts strictly prioritizing Master Merged Report
    if has_meta and merged_tot > 0:
        display_lamp = lamp_cnt
        display_survey = survey_cnt
        display_total = merged_tot
    else:
        display_lamp = lamp_cnt
        display_survey = survey_cnt if survey_cnt > 0 else (total_db_poles if not lamp_cnt else max(0, total_db_poles - lamp_cnt))
        display_total = (display_lamp + display_survey) if (display_lamp + display_survey) > 0 else total_db_poles

    return PoleSummaryOut(
        ward_id=ward_id,
        total_poles=display_total,
        installed_lamp_count=display_lamp,
        extracted_survey_count=display_survey,
        connected_poles=display_total if connected == 0 and total_db_poles == 0 else (connected if connected > 0 else display_total),
        disconnected_poles=disconnected,
        pending_poles=pending,
        unknown_poles=unknown,
        has_valid_coordinates=has_valid,
        center_latitude=center_lat,
        center_longitude=center_lon,
        available_reports=available_reports
    )

def get_ward_poles_list(
    db: Session,
    ward_id: int,
    status_filter: Optional[str] = None,
    source_filter: Optional[str] = None
) -> List[Any]:
    """Returns poles for a ward, prioritizing Master Merged poles cache with fast source filtering."""
    from pathlib import Path
    import json
    from ..config import settings

    ward = db.query(Ward).filter(Ward.id == ward_id).first()
    merged_dir = Path(settings.STORAGE_ROOT) / "merged"
    
    cand_poles = []
    if ward:
        cand_poles.append(merged_dir / f"ward_{ward.ward_number}_master_merged_poles.json")
        if ward.ward_number in LEGACY_WARD_MAP:
            cand_poles.append(merged_dir / f"ward_{LEGACY_WARD_MAP[ward.ward_number]}_master_merged_poles.json")
    cand_poles.append(merged_dir / f"ward_{ward_id}_master_merged_poles.json")

    for cp in cand_poles:
        if cp.exists():
            try:
                with open(cp, "r", encoding="utf-8") as pf:
                    poles_data = json.load(pf)

                if status_filter and status_filter.lower() != "all":
                    st_lower = status_filter.lower()
                    poles_data = [p for p in poles_data if p.get("connectivity_status", "").lower() == st_lower]

                if source_filter and source_filter.lower() != "all":
                    s_lower = source_filter.lower()
                    poles_data = [p for p in poles_data if p.get("source", "").lower() == s_lower]

                return poles_data
            except Exception:
                pass

    # Fallback to DB query
    query = db.query(Pole).filter(Pole.ward_id == ward_id)
    if status_filter and status_filter.lower() != "all":
        query = query.filter(Pole.connectivity_status == status_filter.lower())
    poles = query.order_by(Pole.pole_number).all()

    # Determine active lamp report
    lamp_rep = db.query(Report).filter(
        Report.ward_id == ward_id,
        Report.report_type == "lamp_installation",
        Report.is_active == True
    ).first()
    lamp_rep_id = lamp_rep.id if lamp_rep else None

    result = []
    for p in poles:
        p_src = "installed_lamp" if (lamp_rep_id and p.source_report_id == lamp_rep_id) else "extracted_survey"
        p_dict = {
            "id": p.id,
            "ward_id": p.ward_id,
            "pole_number": p.pole_number,
            "latitude": p.latitude,
            "longitude": p.longitude,
            "connectivity_status": p.connectivity_status,
            "source": p_src,
            "source_report_id": p.source_report_id,
            "additional_attributes": p.additional_attributes,
            "created_at": p.created_at,
            "updated_at": p.updated_at
        }
        if source_filter and source_filter.lower() != "all":
            if p_src.lower() != source_filter.lower():
                continue
        result.append(p_dict)

    return result

def import_poles_for_ward(
    db: Session,
    ward_id: int,
    user_id: int,
    preferred_report_type: Optional[str] = None,
    custom_mappings: Optional[ColumnMappingConfig] = None
) -> Dict[str, Any]:
    """
    Imports or refreshes pole records for a ward within an atomic transaction.
    Inspects Pole Report first, then enriches with coordinates or attributes from others.
    If parsing fails, existing records are preserved.
    """
    ward = db.query(Ward).filter(Ward.id == ward_id).first()
    if not ward:
        raise ValueError(f"Ward with ID {ward_id} does not exist")

    # Get active reports for this ward
    active_reports = db.query(Report).filter(
        Report.ward_id == ward_id,
        Report.is_active == True
    ).all()

    if not active_reports:
        raise ValueError(f"No active reports uploaded for ward {ward.ward_name} ({ward.ward_code}). Upload a Pole Report first.")

    # Select primary report to import from
    primary_report: Optional[Report] = None
    report_by_type = {r.report_type: r for r in active_reports}

    if preferred_report_type and preferred_report_type in report_by_type:
        primary_report = report_by_type[preferred_report_type]
    elif "pole_report" in report_by_type:
        primary_report = report_by_type["pole_report"]
    elif "commission_integrated" in report_by_type:
        primary_report = report_by_type["commission_integrated"]
    elif "lamp_installation" in report_by_type:
        primary_report = report_by_type["lamp_installation"]
    else:
        primary_report = active_reports[0]

    # Parse primary report
    extracted_poles, summary = extract_poles_from_excel(
        primary_report.storage_key,
        custom_mappings
    )

    if not extracted_poles:
        raise ValueError("No pole records could be extracted from the selected report.")

    pole_map: Dict[str, Dict[str, Any]] = {p["pole_number"]: p for p in extracted_poles}

    # If some poles are missing coordinates, check secondary reports to enrich them
    secondary_reports = [r for r in active_reports if r.id != primary_report.id]
    for sec_report in secondary_reports:
        try:
            sec_poles, _ = extract_poles_from_excel(sec_report.storage_key)
            for sp in sec_poles:
                p_num = sp["pole_number"]
                if p_num in pole_map:
                    target = pole_map[p_num]
                    # Fill missing coordinates
                    if not target["has_valid_coords"] and sp["has_valid_coords"]:
                        target["latitude"] = sp["latitude"]
                        target["longitude"] = sp["longitude"]
                        target["has_valid_coords"] = True
                    # Fill unknown status
                    if target["connectivity_status"] == "unknown" and sp["connectivity_status"] != "unknown":
                        target["connectivity_status"] = sp["connectivity_status"]
                    # Merge extra attributes
                    target["additional_attributes"].update(sp["additional_attributes"])
                else:
                    # Pole found in secondary report but not in primary
                    pole_map[p_num] = sp
        except Exception:
            # Continue if secondary report fails
            pass

    # Save within database transaction
    try:
        # Clear existing poles for this ward to ensure clean replacement
        db.query(Pole).filter(Pole.ward_id == ward_id).delete()

        # Insert new poles
        new_pole_objects = []
        for p_data in pole_map.values():
            pole_obj = Pole(
                ward_id=ward_id,
                pole_number=p_data["pole_number"],
                latitude=p_data["latitude"],
                longitude=p_data["longitude"],
                connectivity_status=p_data["connectivity_status"],
                source_report_id=primary_report.id,
                additional_attributes=p_data["additional_attributes"]
            )
            new_pole_objects.append(pole_obj)

        db.add_all(new_pole_objects)

        # Audit log entry
        audit = AuditLog(
            user_id=user_id,
            action="import_poles",
            entity_type="ward",
            entity_id=ward_id,
            details={
                "ward_code": ward.ward_code,
                "primary_report_id": primary_report.id,
                "primary_report_type": primary_report.report_type,
                "imported_count": len(new_pole_objects),
                "valid_coords_count": sum(1 for p in pole_map.values() if p["has_valid_coords"])
            }
        )
        db.add(audit)
        db.commit()

        return {
            "success": True,
            "ward_id": ward_id,
            "imported_count": len(new_pole_objects),
            "primary_source": primary_report.original_filename,
            "valid_coords_count": sum(1 for p in pole_map.values() if p["has_valid_coords"])
        }
    except Exception as e:
        db.rollback()
        raise RuntimeError(f"Database import transaction failed: {str(e)}")
