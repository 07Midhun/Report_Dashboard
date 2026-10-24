from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session
from sqlalchemy import func
from ..models.pole import Pole
from ..models.report import Report, ReportType
from ..models.ward import Ward
from ..models.audit_log import AuditLog
from ..schemas.pole import PoleSummaryOut, ColumnMappingConfig
from .excel_parser import extract_poles_from_excel, is_valid_lat_long

def get_ward_pole_summary(db: Session, ward_id: int) -> PoleSummaryOut:
    """Computes connectivity and coordinate summary for the selected ward, prioritizing merged data."""
    from pathlib import Path
    import json
    from ..config import settings

    merged_dir = Path(settings.STORAGE_ROOT) / "merged"
    meta_path = merged_dir / f"ward_{ward_id}_master_merged_led.json"
    poles_cache_path = merged_dir / f"ward_{ward_id}_master_merged_poles.json"

    if meta_path.exists() and poles_cache_path.exists():
        try:
            with open(meta_path, "r", encoding="utf-8") as f:
                meta = json.load(f)
            with open(poles_cache_path, "r", encoding="utf-8") as pf:
                poles_data = json.load(pf)

            valid_coords = [
                p for p in poles_data 
                if p.get("latitude") and p.get("longitude") 
                and is_valid_lat_long(float(p["latitude"]), float(p["longitude"]))
            ]
            has_valid = len(valid_coords) > 0
            center_lat = sum(float(p["latitude"]) for p in valid_coords) / len(valid_coords) if has_valid else None
            center_lon = sum(float(p["longitude"]) for p in valid_coords) / len(valid_coords) if has_valid else None

            tot = meta.get("total_merged_count", len(poles_data))
            lamp_cnt = meta.get("lamp_rows_count", 0)
            survey_cnt = meta.get("pole_led_rows_count", 0)

            return PoleSummaryOut(
                ward_id=ward_id,
                total_poles=tot,
                installed_lamp_count=lamp_cnt,
                extracted_survey_count=survey_cnt,
                connected_poles=tot,
                disconnected_poles=0,
                pending_poles=0,
                unknown_poles=0,
                has_valid_coordinates=has_valid,
                center_latitude=center_lat,
                center_longitude=center_lon,
                available_reports=["master_merged_led"]
            )
        except Exception:
            pass

    poles = db.query(Pole).filter(Pole.ward_id == ward_id).all()
    
    total = len(poles)
    connected = sum(1 for p in poles if p.connectivity_status == "connected")
    disconnected = sum(1 for p in poles if p.connectivity_status == "disconnected")
    pending = sum(1 for p in poles if p.connectivity_status == "pending")
    unknown = sum(1 for p in poles if p.connectivity_status == "unknown")

    valid_coords = [p for p in poles if is_valid_lat_long(p.latitude, p.longitude)]
    has_valid = len(valid_coords) > 0

    center_lat = None
    center_lon = None
    if has_valid:
        center_lat = sum(p.latitude for p in valid_coords) / len(valid_coords)
        center_lon = sum(p.longitude for p in valid_coords) / len(valid_coords)

    # Check available active reports
    reports = db.query(Report).filter(
        Report.ward_id == ward_id, 
        Report.is_active == True
    ).all()
    available_reports = [r.report_type for r in reports]

    return PoleSummaryOut(
        ward_id=ward_id,
        total_poles=total,
        installed_lamp_count=0,
        extracted_survey_count=total,
        connected_poles=connected,
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

    merged_dir = Path(settings.STORAGE_ROOT) / "merged"
    poles_cache_path = merged_dir / f"ward_{ward_id}_master_merged_poles.json"

    if poles_cache_path.exists():
        try:
            with open(poles_cache_path, "r", encoding="utf-8") as pf:
                poles_data = json.load(pf)

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
    return query.order_by(Pole.pole_number).all()

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
