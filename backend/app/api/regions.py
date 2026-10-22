from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from ..database import get_db
from ..models.region import Region
from ..models.ward import Ward
from ..models.user import User
from ..schemas.hierarchy import RegionOut, RegionCreate, RegionWithWardsOut, WardOut, WardCreate
from ..services.auth_service import get_current_user, get_current_admin

router = APIRouter(prefix="/api/regions", tags=["Regions & Wards Hierarchy"])

@router.get("", response_model=List[RegionWithWardsOut])
def list_regions_with_wards(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Returns full hierarchy of regions and wards.
    Requires authentication.
    """
    regions = db.query(Region).order_by(Region.region_name).all()
    # Populate stats per ward
    results = []
    for reg in regions:
        wards_out = []
        for w in reg.wards:
            w_out = WardOut(
                id=w.id,
                region_id=w.region_id,
                ward_number=w.ward_number,
                ward_name=w.ward_name,
                ward_code=w.ward_code,
                created_at=w.created_at,
                active_reports_count=len([r for r in w.reports if r.is_active]),
                total_poles_count=len(w.poles),
                zone_name=reg.region_name,
                division=getattr(reg, "division", "East"),
                corporation=getattr(reg, "corporation", "Bangalore (BBMP)")
            )
            wards_out.append(w_out)
        
        reg_dict = RegionWithWardsOut(
            id=reg.id,
            region_code=reg.region_code,
            region_name=reg.region_name,
            corporation=getattr(reg, "corporation", "Bangalore (BBMP)"),
            division=getattr(reg, "division", "East"),
            created_at=reg.created_at,
            wards=wards_out
        )
        results.append(reg_dict)
    return results

@router.post("", response_model=RegionOut, status_code=status.HTTP_201_CREATED)
def create_region(
    data: RegionCreate,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin)
):
    """Create a new region. Admin only."""
    existing = db.query(Region).filter(Region.region_code == data.region_code.strip().upper()).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Region code '{data.region_code}' already exists"
        )
    region = Region(
        region_code=data.region_code.strip().upper(),
        region_name=data.region_name.strip()
    )
    db.add(region)
    db.commit()
    db.refresh(region)
    return region

@router.get("/{region_id}/wards", response_model=List[WardOut])
def list_wards_for_region(
    region_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """List all wards under a specific region."""
    region = db.query(Region).filter(Region.id == region_id).first()
    if not region:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Region with ID {region_id} not found"
        )
    wards = db.query(Ward).filter(Ward.region_id == region_id).order_by(Ward.ward_number).all()
    results = []
    for w in wards:
        w_out = WardOut(
            id=w.id,
            region_id=w.region_id,
            ward_number=w.ward_number,
            ward_name=w.ward_name,
            ward_code=w.ward_code,
            created_at=w.created_at,
            active_reports_count=len([r for r in w.reports if r.is_active]),
            total_poles_count=len(w.poles)
        )
        results.append(w_out)
    return results

@router.post("/{region_id}/wards", response_model=WardOut, status_code=status.HTTP_201_CREATED)
def create_ward(
    region_id: int,
    data: WardCreate,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin)
):
    """Create a new ward under a region. Admin only."""
    region = db.query(Region).filter(Region.id == region_id).first()
    if not region:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Region with ID {region_id} not found"
        )
    existing_code = db.query(Ward).filter(Ward.ward_code == data.ward_code.strip().upper()).first()
    if existing_code:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Ward code '{data.ward_code}' already exists"
        )
    existing_number = db.query(Ward).filter(
        Ward.region_id == region_id,
        Ward.ward_number == data.ward_number.strip()
    ).first()
    if existing_number:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Ward number '{data.ward_number}' already exists in this region"
        )

    ward = Ward(
        region_id=region_id,
        ward_number=data.ward_number.strip(),
        ward_name=data.ward_name.strip(),
        ward_code=data.ward_code.strip().upper()
    )
    db.add(ward)
    db.commit()
    db.refresh(ward)
    return WardOut(
        id=ward.id,
        region_id=ward.region_id,
        ward_number=ward.ward_number,
        ward_name=ward.ward_name,
        ward_code=ward.ward_code,
        created_at=ward.created_at,
        active_reports_count=0,
        total_poles_count=0
    )
