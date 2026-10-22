import urllib.parse
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from ..database import get_db
from ..models.report import Report, ReportVersion, ReportType
from ..models.ward import Ward
from ..models.user import User
import pandas as pd
import numpy as np
from ..models.audit_log import AuditLog
from ..schemas.report import (
    WardReportSlotsResponse, ReportSlot, ReportOut, 
    ReportUploadResponse, ReportHistoryItem, ReportDataResponse
)
from ..services.auth_service import get_current_user, get_current_admin
from ..services.storage_service import (
    save_uploaded_file, resolve_physical_file, delete_physical_file
)
from ..services.pole_service import import_poles_for_ward

router = APIRouter(tags=["Reports Management"])

REPORT_METADATA = [
    {"key": "lamp_installation", "title": "Lamp Installation Report"},
    {"key": "pole_report", "title": "Pole Report"},
    {"key": "commission_integrated", "title": "Commission and Integrated Pole Report"}
]

VALID_REPORT_TYPES = {m["key"] for m in REPORT_METADATA}

def validate_ward_exists(db: Session, ward_id: int) -> Ward:
    ward = db.query(Ward).filter(Ward.id == ward_id).first()
    if not ward:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Ward with ID {ward_id} was not found"
        )
    return ward

def validate_report_type(report_type: str):
    if report_type not in VALID_REPORT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid report type '{report_type}'. Allowed types: {list(VALID_REPORT_TYPES)}"
        )

@router.get("/api/wards/{ward_id}/reports", response_model=WardReportSlotsResponse)
def get_ward_reports(
    ward_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Returns the three fixed report slots for the selected ward.
    Shows whether each slot is uploaded and the active report metadata.
    """
    ward = validate_ward_exists(db, ward_id)

    active_reports = db.query(Report).filter(
        Report.ward_id == ward_id,
        Report.is_active == True
    ).all()

    report_map = {r.report_type: r for r in active_reports}

    slots = []
    for meta in REPORT_METADATA:
        key = meta["key"]
        rep = report_map.get(key)
        rep_out = None
        if rep:
            uploader_name = rep.uploader.username if rep.uploader else None
            rep_out = ReportOut(
                id=rep.id,
                ward_id=rep.ward_id,
                report_type=rep.report_type,
                original_filename=rep.original_filename,
                file_extension=rep.file_extension,
                file_size=rep.file_size,
                mime_type=rep.mime_type,
                uploaded_by=rep.uploaded_by,
                uploader_name=uploader_name,
                uploaded_at=rep.uploaded_at,
                updated_at=rep.updated_at,
                is_active=rep.is_active,
                versions_count=len(rep.versions)
            )

        slots.append(ReportSlot(
            category_key=key,
            display_title=meta["title"],
            is_uploaded=rep is not None,
            current_report=rep_out
        ))

    return WardReportSlotsResponse(
        ward_id=ward.id,
        ward_code=ward.ward_code,
        ward_name=ward.ward_name,
        slots=slots
    )

@router.post("/api/wards/{ward_id}/reports/{report_type}", response_model=ReportUploadResponse)
def upload_report(
    ward_id: int,
    report_type: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin)
):
    """
    Upload a new report for the selected ward.
    Admin only!
    If an active report of this type already exists, returns 409 Conflict prompting replacement.
    """
    validate_report_type(report_type)
    ward = validate_ward_exists(db, ward_id)

    # Check duplicate
    existing = db.query(Report).filter(
        Report.ward_id == ward_id,
        Report.report_type == report_type,
        Report.is_active == True
    ).first()

    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"A '{report_type}' already exists for ward {ward.ward_code} ('{existing.original_filename}'). Please use the replace option to overwrite or update version."
        )

    # Save physical file
    storage_key, ext, file_size, unique_id = save_uploaded_file(file, ward.region_id, ward.id)

    try:
        new_report = Report(
            ward_id=ward.id,
            report_type=report_type,
            original_filename=file.filename,
            storage_key=storage_key,
            file_extension=ext,
            file_size=file_size,
            uploaded_by=admin.id
        )
        db.add(new_report)
        db.flush()

        # Add initial version 1
        v1 = ReportVersion(
            report_id=new_report.id,
            original_filename=file.filename,
            storage_key=storage_key,
            file_size=file_size,
            uploaded_by=admin.id,
            version_number=1
        )
        db.add(v1)

        # Audit log
        audit = AuditLog(
            user_id=admin.id,
            action="upload_report",
            entity_type="report",
            entity_id=new_report.id,
            details={
                "ward_id": ward.id,
                "ward_code": ward.ward_code,
                "report_type": report_type,
                "filename": file.filename,
                "file_size": file_size
            }
        )
        db.add(audit)
        db.commit()
        db.refresh(new_report)

        # Try automatic pole extraction if this is a pole survey report
        try:
            import_poles_for_ward(db, ward.id, admin.id, preferred_report_type=report_type)
        except Exception:
            pass  # Do not block upload if parsing fails; user can manually trigger or configure mappings

        rep_out = ReportOut(
            id=new_report.id,
            ward_id=new_report.ward_id,
            report_type=new_report.report_type,
            original_filename=new_report.original_filename,
            file_extension=new_report.file_extension,
            file_size=new_report.file_size,
            mime_type=new_report.mime_type,
            uploaded_by=new_report.uploaded_by,
            uploader_name=admin.username,
            uploaded_at=new_report.uploaded_at,
            updated_at=new_report.updated_at,
            is_active=new_report.is_active,
            versions_count=1
        )

        return ReportUploadResponse(
            message=f"Successfully uploaded {new_report.original_filename}",
            report=rep_out,
            is_replacement=False
        )
    except Exception as e:
        db.rollback()
        delete_physical_file(storage_key)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database error while saving report: {str(e)}"
        )

@router.post("/api/wards/{ward_id}/reports/{report_type}/replace", response_model=ReportUploadResponse)
def replace_report(
    ward_id: int,
    report_type: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin)
):
    """
    Safely replace an existing report with versioning.
    Admin only!
    Previous physical file is preserved in version history.
    """
    validate_report_type(report_type)
    ward = validate_ward_exists(db, ward_id)

    existing = db.query(Report).filter(
        Report.ward_id == ward_id,
        Report.report_type == report_type,
        Report.is_active == True
    ).first()

    if not existing:
        # If none exists yet, route directly to fresh upload
        return upload_report(ward_id, report_type, file, db, admin)

    # Save new physical file
    storage_key, ext, file_size, unique_id = save_uploaded_file(file, ward.region_id, ward.id)

    try:
        prev_version_number = len(existing.versions)
        new_version_number = prev_version_number + 1

        # Update current report
        existing.original_filename = file.filename
        existing.storage_key = storage_key
        existing.file_extension = ext
        existing.file_size = file_size
        existing.uploaded_by = admin.id

        # Record new version
        new_version = ReportVersion(
            report_id=existing.id,
            original_filename=file.filename,
            storage_key=storage_key,
            file_size=file_size,
            uploaded_by=admin.id,
            version_number=new_version_number
        )
        db.add(new_version)

        # Audit log
        audit = AuditLog(
            user_id=admin.id,
            action="replace_report",
            entity_type="report",
            entity_id=existing.id,
            details={
                "ward_id": ward.id,
                "ward_code": ward.ward_code,
                "report_type": report_type,
                "new_filename": file.filename,
                "version": new_version_number
            }
        )
        db.add(audit)
        db.commit()
        db.refresh(existing)

        # Auto-refresh poles
        try:
            import_poles_for_ward(db, ward.id, admin.id, preferred_report_type=report_type)
        except Exception:
            pass

        rep_out = ReportOut(
            id=existing.id,
            ward_id=existing.ward_id,
            report_type=existing.report_type,
            original_filename=existing.original_filename,
            file_extension=existing.file_extension,
            file_size=existing.file_size,
            mime_type=existing.mime_type,
            uploaded_by=existing.uploaded_by,
            uploader_name=admin.username,
            uploaded_at=existing.uploaded_at,
            updated_at=existing.updated_at,
            is_active=existing.is_active,
            versions_count=new_version_number
        )

        return ReportUploadResponse(
            message=f"Successfully updated to Version {new_version_number} ({file.filename})",
            report=rep_out,
            is_replacement=True,
            previous_version_number=prev_version_number
        )
    except Exception as e:
        db.rollback()
        delete_physical_file(storage_key)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Replacement failed: {str(e)}"
        )

@router.get("/api/reports/{report_id}/download")
def download_report(
    report_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Downloads an uploaded report preserving exact original filename via Content-Disposition header.
    Accessible to authorized Admin and Normal Users.
    """
    report = db.query(Report).filter(Report.id == report_id).first()
    if not report:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Report with ID {report_id} was not found"
        )

    file_path = resolve_physical_file(report.storage_key)

    # Encode filename safely for Content-Disposition
    encoded_filename = urllib.parse.quote(report.original_filename)

    headers = {
        "Content-Disposition": f"attachment; filename=\"{report.original_filename}\"; filename*=UTF-8''{encoded_filename}",
        "Access-Control-Expose-Headers": "Content-Disposition"
    }

    return FileResponse(
        path=file_path,
        media_type=report.mime_type or "application/octet-stream",
        filename=report.original_filename,
        headers=headers
    )

@router.delete("/api/reports/{report_id}")
def delete_report(
    report_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin)
):
    """
    Deletes an uploaded report. Admin only!
    """
    report = db.query(Report).filter(Report.id == report_id).first()
    if not report:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Report with ID {report_id} was not found"
        )

    ward = report.ward
    storage_key = report.storage_key
    filename = report.original_filename

    # Delete physical version files
    for v in report.versions:
        delete_physical_file(v.storage_key)

    # Audit log
    audit = AuditLog(
        user_id=admin.id,
        action="delete_report",
        entity_type="report",
        entity_id=report_id,
        details={
            "ward_id": ward.id if ward else None,
            "filename": filename
        }
    )
    db.add(audit)
    db.delete(report)
    db.commit()

    delete_physical_file(storage_key)
    return {"success": True, "message": f"Report '{filename}' deleted successfully"}

@router.get("/api/wards/{ward_id}/reports/history", response_model=List[ReportHistoryItem])
def get_ward_report_history(
    ward_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Returns complete version history of all reports uploaded for the selected ward.
    """
    validate_ward_exists(db, ward_id)

    versions = (
        db.query(ReportVersion, Report.report_type)
        .join(Report, ReportVersion.report_id == Report.id)
        .filter(Report.ward_id == ward_id)
        .order_by(ReportVersion.uploaded_at.desc())
        .all()
    )

    history = []
    for ver, r_type in versions:
        history.append(ReportHistoryItem(
            version_id=ver.id,
            report_id=ver.report_id,
            report_type=r_type,
            original_filename=ver.original_filename,
            file_size=ver.file_size,
            version_number=ver.version_number,
            uploaded_at=ver.uploaded_at,
            uploader_name=ver.uploader.username if ver.uploader else None
        ))
    return history


def extract_report_table_data(report: Report) -> ReportDataResponse:
    """Reads physical excel report file and returns clean column names and row records."""
    physical_path = resolve_physical_file(report.storage_key)
    if not physical_path or not physical_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Report file '{report.original_filename}' was not found in storage."
        )

    try:
        df = pd.read_excel(physical_path)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to read Excel report: {str(e)}"
        )

    # Clean column names
    cleaned_columns = [str(col).strip() if str(col).strip() != "" else f"Column_{i+1}" for i, col in enumerate(df.columns)]
    df.columns = cleaned_columns

    # Format datetime / timestamp objects into ISO string
    for col in df.select_dtypes(include=["datetime", "datetimetz"]).columns:
        df[col] = df[col].dt.strftime("%Y-%m-%d %H:%M:%S")

    # Replace NaN, NaT, Inf with None for valid JSON serialization
    df = df.replace({np.nan: None, np.inf: None, -np.inf: None})
    df = df.where(pd.notnull(df), None)

    rows = df.to_dict(orient="records")
    active_ver = report.versions[-1].version_number if report.versions else 1

    return ReportDataResponse(
        uploaded=True,
        report_id=report.id,
        ward_id=report.ward_id,
        report_type=report.report_type,
        original_filename=report.original_filename,
        file_size=report.file_size,
        uploaded_at=report.uploaded_at,
        version_number=active_ver,
        total_rows=len(rows),
        columns=cleaned_columns,
        rows=rows
    )

@router.get("/api/wards/{ward_id}/reports/{category_key}/data", response_model=ReportDataResponse)
def get_ward_report_data(
    ward_id: int,
    category_key: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Returns actual tabular data (rows and columns) of the uploaded report for the given ward and category.
    Returns empty state if no report is currently uploaded. Accessible to both Admin and Operator.
    """
    validate_ward_exists(db, ward_id)
    validate_report_type(category_key)

    report = db.query(Report).filter(
        Report.ward_id == ward_id,
        Report.report_type == category_key,
        Report.is_active == True
    ).first()

    if not report:
        return ReportDataResponse(
            uploaded=False,
            message=f"No {category_key} report has been uploaded for this ward yet.",
            ward_id=ward_id,
            report_type=category_key,
            total_rows=0,
            columns=[],
            rows=[]
        )

    return extract_report_table_data(report)

@router.get("/api/reports/{report_id}/data", response_model=ReportDataResponse)
def get_report_data_by_id(
    report_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Returns actual tabular data (rows and columns) of an uploaded report by report ID.
    Accessible to both Admin and Operator.
    """
    report = db.query(Report).filter(Report.id == report_id).first()
    if not report:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Report with ID {report_id} was not found"
        )
    return extract_report_table_data(report)


# =========================================================================
# MASTER MERGED LED REPORT ENDPOINTS (Available to Admin & Operator)
# =========================================================================

from ..services.merged_report_service import (
    get_or_create_merged_led_report,
    get_merged_led_table_data
)

@router.get("/api/wards/{ward_id}/merged-led-report/summary")
def get_ward_merged_led_summary(
    ward_id: int,
    force_regenerate: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Returns availability, file metadata, and statistics for the Merged LED Report.
    Accessible to both Admin and Operator.
    """
    validate_ward_exists(db, ward_id)
    return get_or_create_merged_led_report(db, ward_id, force_regenerate=force_regenerate)

@router.get("/api/wards/{ward_id}/merged-led-report/data", response_model=ReportDataResponse)
def get_ward_merged_led_data(
    ward_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Returns tabular rows and columns of the Master Merged LED Report for interactive table viewing.
    Accessible to both Admin and Operator.
    """
    validate_ward_exists(db, ward_id)
    return get_merged_led_table_data(db, ward_id)

@router.get("/api/wards/{ward_id}/merged-led-report/download")
def download_ward_merged_led_report(
    ward_id: int,
    force_regenerate: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Downloads the merged Excel report (.xlsx) combining the Lamp report with surveyed LED poles.
    Accessible to both Admin and Operator.
    """
    summary = get_or_create_merged_led_report(db, ward_id, force_regenerate=force_regenerate)
    if not summary["is_available"] or not summary["file_path"]:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=summary.get("reason", "Merged report not available")
        )

    file_path = summary["file_path"]
    filename = summary["filename"]
    encoded_filename = urllib.parse.quote(filename)

    headers = {
        "Content-Disposition": f"attachment; filename=\"{filename}\"; filename*=UTF-8''{encoded_filename}",
        "Access-Control-Expose-Headers": "Content-Disposition",
        "Cache-Control": "no-cache"
    }

    return FileResponse(
        path=file_path,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        filename=filename,
        headers=headers
    )


