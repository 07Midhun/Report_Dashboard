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

import json
from pathlib import Path
from ..config import settings

@router.get("/summary")
def get_hierarchy_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Returns aggregated lamps and poles counts across all divisions, constituencies, and wards.
    Allows instant lookup of counts when clicking a region (e.g. East) or constituency (e.g. Hebbal).
    """
    merged_dir = Path(settings.STORAGE_ROOT) / "merged"
    regions = db.query(Region).order_by(Region.region_name).all()

    divisions_map = {}
    constituencies_map = {}

    grand_installed_lamps = 0
    grand_surveyed_leds = 0
    grand_total_poles = 0
    grand_total_wards = 0

    for reg in regions:
        division_name = getattr(reg, "division", "East") or "East"
        if division_name not in divisions_map:
            divisions_map[division_name] = {
                "name": division_name,
                "total_constituencies": 0,
                "total_wards": 0,
                "installed_lamps": 0,
                "surveyed_leds": 0,
                "total_poles": 0,
                "constituency_ids": [],
                "constituency_names": []
            }

        c_installed = 0
        c_surveyed = 0
        c_total_poles = 0
        wards_summary = []

        for w in reg.wards:
            grand_total_wards += 1
            meta_path = merged_dir / f"ward_{w.id}_master_merged_led.json"
            w_lamp = 0
            w_survey = 0
            w_tot = 0
            is_merged_avail = False

            if meta_path.exists():
                try:
                    with open(meta_path, "r", encoding="utf-8") as f:
                        meta = json.load(f)
                    w_lamp = meta.get("lamp_rows_count", 0)
                    w_survey = meta.get("pole_led_rows_count", 0)
                    w_tot = meta.get("total_merged_count", w_lamp + w_survey)
                    is_merged_avail = True
                except Exception:
                    pass
            
            if not is_merged_avail and len(w.poles) > 0:
                w_tot = len(w.poles)

            c_installed += w_lamp
            c_surveyed += w_survey
            c_total_poles += w_tot

            active_reps = len([r for r in w.reports if r.is_active])
            wards_summary.append({
                "id": w.id,
                "ward_number": w.ward_number,
                "ward_name": w.ward_name,
                "ward_code": w.ward_code,
                "active_reports_count": active_reps,
                "installed_lamps": w_lamp,
                "surveyed_leds": w_survey,
                "total_poles": w_tot,
                "is_merged_available": is_merged_avail
            })

        constituencies_map[reg.region_name] = {
            "id": reg.id,
            "name": reg.region_name,
            "code": reg.region_code,
            "division": division_name,
            "total_wards": len(reg.wards),
            "installed_lamps": c_installed,
            "surveyed_leds": c_surveyed,
            "total_poles": c_total_poles,
            "wards": wards_summary
        }

        # Accumulate in division
        div = divisions_map[division_name]
        div["total_constituencies"] += 1
        div["total_wards"] += len(reg.wards)
        div["installed_lamps"] += c_installed
        div["surveyed_leds"] += c_surveyed
        div["total_poles"] += c_total_poles
        div["constituency_ids"].append(reg.id)
        div["constituency_names"].append(reg.region_name)

        # Accumulate grand totals
        grand_installed_lamps += c_installed
        grand_surveyed_leds += c_surveyed
        grand_total_poles += c_total_poles

    return {
        "total_zones": len(divisions_map), # e.g. 2: Bommanahalli, East
        "total_constituencies": len(regions), # e.g. 7
        "total_wards": grand_total_wards, # e.g. 57
        "total_installed_lamps": grand_installed_lamps,
        "total_surveyed_leds": grand_surveyed_leds,
        "total_poles": grand_total_poles,
        "divisions": divisions_map,
        "constituencies": constituencies_map
    }

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
