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
    Returns full hierarchy of regions and wards with lightning-fast aggregate queries.
    Requires authentication.
    """
    from sqlalchemy import func
    from ..models.pole import Pole
    from ..models.report import Report
    from ..services.seed_service import seed_bbmp_hierarchy

    # Ensure hierarchy is seeded if database is clean
    if db.query(Region).count() == 0:
        seed_bbmp_hierarchy(db)

    # Pre-fetch counts in single fast GROUP BY queries to avoid loading 42,000+ ORM objects
    try:
        pole_counts = dict(
            db.query(Pole.ward_id, func.count(Pole.id))
            .group_by(Pole.ward_id)
            .all()
        )
    except Exception:
        pole_counts = {}

    try:
        active_report_counts = dict(
            db.query(Report.ward_id, func.count(Report.id))
            .filter(Report.is_active == True)
            .group_by(Report.ward_id)
            .all()
        )
    except Exception:
        active_report_counts = {}

    regions = db.query(Region).order_by(Region.division, Region.region_name).all()
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
                active_reports_count=active_report_counts.get(w.id, 0),
                total_poles_count=pole_counts.get(w.id, 0),
                zone_name=reg.region_name,
                division=getattr(reg, "division", "East") or "East",
                corporation=getattr(reg, "corporation", "Bangalore (BBMP)") or "Bangalore (BBMP)"
            )
            wards_out.append(w_out)
        
        reg_dict = RegionWithWardsOut(
            id=reg.id,
            region_code=reg.region_code,
            region_name=reg.region_name,
            corporation=getattr(reg, "corporation", "Bangalore (BBMP)") or "Bangalore (BBMP)",
            division=getattr(reg, "division", "East") or "East",
            created_at=reg.created_at,
            wards=wards_out
        )
        results.append(reg_dict)
    return results

import json
from pathlib import Path
from ..config import settings
from ..models.pole import Pole
from ..models.report import Report

LEGACY_WARD_MAP = {
    "W61": 1, "W62": 2, "W63": 3, "W64": 4,
    "W65": 32, "W66": 33, "W67": 34, "W68": 35,
    "W69": 36, "W70": 37, "W71": 38, "W72": 39,
    "W73": 40, "W74": 41, "W75": 42,
    "W76": 43, "W77": 44, "W78": 45, "W79": 46,
    "W80": 47, "W81": 48, "W82": 49, "W83": 50,
    "W84": 51, "W85": 52
}

@router.get("/summary")
def get_hierarchy_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Returns aggregated lamps and poles counts across all divisions, constituencies, and wards.
    Allows instant lookup of counts when clicking a region (e.g. East) or constituency (e.g. Hebbal).
    """
    from ..services.seed_service import seed_bbmp_hierarchy
    if db.query(Region).count() == 0:
        seed_bbmp_hierarchy(db)

    merged_dir = Path(settings.STORAGE_ROOT) / "merged"
    regions = db.query(Region).order_by(Region.region_name).all()

    try:
        pole_counts = dict(
            db.query(Pole.ward_id, func.count(Pole.id))
            .group_by(Pole.ward_id)
            .all()
        )
    except Exception:
        pole_counts = {}

    try:
        active_report_counts = dict(
            db.query(Report.ward_id, func.count(Report.id))
            .filter(Report.is_active == True)
            .group_by(Report.ward_id)
            .all()
        )
    except Exception:
        active_report_counts = {}

    divisions_map = {}
    constituencies_map = {}

    grand_installed_lamps = 0
    grand_surveyed_leds = 0
    grand_total_poles = 0
    grand_total_wards = 0

    for reg in regions:
        raw_div = getattr(reg, "division", "") or ""
        if raw_div.strip().lower() == "bommanahalli" or reg.region_code in ("BMH", "BOM-Z1", "BOM") or "bommanahalli" in reg.region_name.lower():
            division_name = "Bommanahalli"
        else:
            division_name = "East"

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
            
            # Lookup candidate metadata files
            cand_paths = [
                merged_dir / f"ward_{w.ward_number}_master_merged_led.json",
            ]
            if w.ward_number in LEGACY_WARD_MAP:
                cand_paths.append(merged_dir / f"ward_{LEGACY_WARD_MAP[w.ward_number]}_master_merged_led.json")
            cand_paths.append(merged_dir / f"ward_{w.id}_master_merged_led.json")

            w_lamp = 0
            w_survey = 0
            w_tot = 0
            is_merged_avail = False

            for cp in cand_paths:
                if cp.exists():
                    try:
                        with open(cp, "r", encoding="utf-8") as f:
                            meta = json.load(f)
                        w_lamp = meta.get("lamp_rows_count", 0)
                        w_survey = meta.get("pole_led_rows_count", 0)
                        w_tot = meta.get("total_merged_count", w_lamp + w_survey)
                        is_merged_avail = True
                        break
                    except Exception:
                        pass
            
            # Fallback to DB poles count if survey poles exist without a 2-way merged report
            p_cnt = pole_counts.get(w.id, len(w.poles))
            if not is_merged_avail or (w_tot == 0 and w_survey == 0 and p_cnt > 0):
                if p_cnt > 0:
                    w_survey = p_cnt
                    w_tot = p_cnt
                    is_merged_avail = True

            c_installed += w_lamp
            c_surveyed += w_survey
            c_total_poles += w_tot

            active_reps = active_report_counts.get(w.id, len([r for r in w.reports if r.is_active]))
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

        const_entry = {
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
        constituencies_map[reg.region_name] = const_entry
        if reg.region_code:
            constituencies_map[reg.region_code] = const_entry

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
