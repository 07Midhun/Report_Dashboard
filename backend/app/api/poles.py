from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from ..database import get_db
from ..models.pole import Pole
from ..models.ward import Ward
from ..models.user import User
from ..schemas.pole import PoleOut, PoleSummaryOut, PoleImportRequest
from ..services.auth_service import get_current_user, get_current_admin
from ..services.pole_service import get_ward_pole_summary, import_poles_for_ward, get_ward_poles_list

router = APIRouter(prefix="/api/wards/{ward_id}/poles", tags=["Pole Connectivity & Map"])

def validate_ward(db: Session, ward_id: int) -> Ward:
    ward = db.query(Ward).filter(Ward.id == ward_id).first()
    if not ward:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Ward with ID {ward_id} was not found"
        )
    return ward

@router.get("", response_model=List[PoleOut])
def list_ward_poles(
    ward_id: int,
    status_filter: Optional[str] = None,
    source_filter: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Returns poles belonging to the selected ward.
    Strictly isolated per ward.
    Supports filtering by source ('installed_lamp', 'extracted_survey') and connectivity status.
    """
    validate_ward(db, ward_id)
    return get_ward_poles_list(db, ward_id, status_filter=status_filter, source_filter=source_filter)

@router.get("/summary", response_model=PoleSummaryOut)
def get_pole_summary(
    ward_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Returns summary statistics for the selected ward:
    - total poles
    - connected, disconnected, pending, unknown counts
    - map center coordinates
    - valid coordinate status
    """
    validate_ward(db, ward_id)
    return get_ward_pole_summary(db, ward_id)

@router.post("/import")
def trigger_pole_import(
    ward_id: int,
    request: PoleImportRequest = PoleImportRequest(),
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin)
):
    """
    Explicitly trigger or refresh pole extraction from uploaded Excel reports.
    Admin only!
    Supports custom column mappings if Excel column names differ from defaults.
    """
    validate_ward(db, ward_id)
    try:
        result = import_poles_for_ward(
            db=db,
            ward_id=ward_id,
            user_id=admin.id,
            preferred_report_type=request.report_type,
            custom_mappings=request.custom_mappings
        )
        return result
    except ValueError as ve:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))
