import os
import openpyxl
import pandas as pd
import numpy as np
from pathlib import Path
from datetime import datetime
from typing import Dict, Any, Tuple, Optional
from sqlalchemy.orm import Session
from fastapi import HTTPException, status

from ..config import settings
from ..models.report import Report
from ..models.ward import Ward
from ..models.region import Region
from ..schemas.report import ReportDataResponse

def get_merged_storage_dir() -> Path:
    merged_dir = Path(settings.STORAGE_ROOT) / "merged"
    merged_dir.mkdir(parents=True, exist_ok=True)
    return merged_dir

def find_col_idx(headers: list, candidates: list) -> int:
    for idx, h in enumerate(headers):
        h_str = str(h).strip().lower()
        for cand in candidates:
            if cand.lower() in h_str:
                return idx
    return -1

def get_or_create_merged_led_report(
    db: Session, 
    ward_id: int, 
    force_regenerate: bool = False
) -> Dict[str, Any]:
    """
    Takes the Lamp Installation / LED Report fully, extracts all surveyed poles 
    from the Pole Survey Report where the lamp/pole type is LED, and merges them 
    by appending the extracted LED poles at the end ("at the last") into a single, 
    complete master LED report workbook.
    """
    ward = db.query(Ward).filter(Ward.id == ward_id).first()
    if not ward:
        raise HTTPException(status_code=404, detail="Ward not found")

    region = db.query(Region).filter(Region.id == ward.region_id).first()

    lamp_rep = db.query(Report).filter(
        Report.ward_id == ward_id,
        Report.report_type == "lamp_installation",
        Report.is_active == True
    ).first()

    pole_rep = db.query(Report).filter(
        Report.ward_id == ward_id,
        Report.report_type == "pole_report",
        Report.is_active == True
    ).first()

    if not lamp_rep or not pole_rep:
        return {
            "is_available": False,
            "ward_id": ward_id,
            "ward_number": ward.ward_number,
            "reason": "Both Lamp Installation Report and Pole Survey Report must be uploaded to generate the Merged LED Report.",
            "lamp_uploaded": lamp_rep is not None,
            "pole_uploaded": pole_rep is not None,
            "lamp_rows_count": 0,
            "pole_led_rows_count": 0,
            "total_merged_count": 0,
            "file_path": None,
            "filename": None,
            "file_size": 0,
            "generated_at": None,
        }

    merged_dir = get_merged_storage_dir()
    output_filename = f"Ward_{ward.ward_number}_Master_Merged_LED_Report.xlsx"
    output_path = merged_dir / f"ward_{ward_id}_master_merged_led.xlsx"

    # Check if cache is still valid
    source_latest_mtime = max(
        os.path.getmtime(lamp_rep.storage_key) if os.path.exists(lamp_rep.storage_key) else 0,
        os.path.getmtime(pole_rep.storage_key) if os.path.exists(pole_rep.storage_key) else 0,
    )

    if (
        not force_regenerate 
        and output_path.exists() 
        and os.path.getmtime(output_path) >= source_latest_mtime
    ):
        # Read summary from existing file
        file_size = os.path.getsize(output_path)
        mtime_dt = datetime.fromtimestamp(os.path.getmtime(output_path)).isoformat()
        
        # Count rows quickly
        wb_check = openpyxl.load_workbook(output_path, read_only=True)
        sheet_check = wb_check.active
        total_rows = max(0, (sheet_check.max_row or 2) - 2)
        wb_check.close()

        return {
            "is_available": True,
            "ward_id": ward_id,
            "ward_number": ward.ward_number,
            "lamp_uploaded": True,
            "pole_uploaded": True,
            "lamp_rows_count": None,
            "pole_led_rows_count": None,
            "total_merged_count": total_rows,
            "file_path": str(output_path),
            "filename": output_filename,
            "file_size": file_size,
            "generated_at": mtime_dt,
        }

    # 1. Read Lamp Report (LED Report)
    wb_lamp = openpyxl.load_workbook(lamp_rep.storage_key, data_only=True)
    sheet_lamp = wb_lamp.active

    # Create target merged workbook
    wb_out = openpyxl.Workbook()
    sheet_out = wb_out.active
    sheet_out.title = "Master Merged LED Report"

    # Copy row 1 and row 2 headers and existing rows from Lamp Report
    existing_poles = set()
    lamp_rows_count = 0

    for r_idx, row in enumerate(sheet_lamp.iter_rows(values_only=True), start=1):
        sheet_out.append(list(row))
        if r_idx >= 3:
            lamp_rows_count += 1
            pole_val = row[5] if len(row) > 5 else None
            if pole_val:
                existing_poles.add(str(pole_val).strip())

    # Get header row 2 to determine column count
    lamp_headers = [c for c in sheet_lamp.iter_rows(min_row=2, max_row=2, values_only=True)][0]
    num_cols = len(lamp_headers)
    wb_lamp.close()

    # 2. Read Pole Report and extract LED poles
    wb_pole = openpyxl.load_workbook(pole_rep.storage_key, data_only=True)
    sheet_pole = wb_pole.active
    pole_headers = [str(c).strip() if c else "" for c in next(sheet_pole.iter_rows(min_row=1, max_row=1, values_only=True))]

    p_id_c = find_col_idx(pole_headers, ["pole id", "pole number", "poleid"])
    p_sp_c = find_col_idx(pole_headers, ["switch point", "switchpoint", "sp no"])
    p_type_c = find_col_idx(pole_headers, ["poletype", "pole type", "pole_type"])
    p_lamp_c = find_col_idx(pole_headers, ["lamp type", "lamptype", "mt,nl,led"])
    p_mt_c = find_col_idx(pole_headers, ["mt,nl,led", "lamp type"])
    p_watt_c = find_col_idx(pole_headers, ["lamp wattage", "wattage"])
    p_road_c = find_col_idx(pole_headers, ["road category", "road type"])
    p_lat_c = find_col_idx(pole_headers, ["latitude"])
    p_lng_c = find_col_idx(pole_headers, ["longitude"])
    p_span_c = find_col_idx(pole_headers, ["pole span", "span"])
    p_img1_c = find_col_idx(pole_headers, ["image 1"])
    p_img2_c = find_col_idx(pole_headers, ["image 2"])
    p_img3_c = find_col_idx(pole_headers, ["image 3"])

    sr_no = lamp_rows_count + 1
    added_pole_led_count = 0

    for row in sheet_pole.iter_rows(min_row=2, values_only=True):
        pid = str(row[p_id_c]).strip() if p_id_c >= 0 and row[p_id_c] else ""
        if not pid or pid.lower() == "none":
            continue

        l_type = str(row[p_lamp_c]).strip() if p_lamp_c >= 0 and row[p_lamp_c] else ""
        m_type = str(row[p_mt_c]).strip() if p_mt_c >= 0 and row[p_mt_c] else ""
        pole_val = str(row[p_type_c]).strip() if p_type_c >= 0 and row[p_type_c] else ""

        is_led = "led" in l_type.lower() or "led" in m_type.lower() or "led" in pole_val.lower()

        if is_led and pid not in existing_poles:
            existing_poles.add(pid)
            new_row = [None] * num_cols
            new_row[0] = sr_no
            new_row[1] = region.division if region and region.division else "EAST"
            new_row[2] = region.region_name if region and region.region_name else "Hebbal"
            new_row[3] = ward.ward_code or ward.ward_number
            new_row[4] = row[p_sp_c] if p_sp_c >= 0 else None
            new_row[5] = pid
            new_row[6] = row[p_type_c] if p_type_c >= 0 else "LED"
            new_row[7] = "LED"
            new_row[8] = "LED"
            new_row[9] = row[p_watt_c] if p_watt_c >= 0 else None
            new_row[10] = row[p_span_c] if p_span_c >= 0 else None
            new_row[11] = row[p_road_c] if p_road_c >= 0 else None
            new_row[12] = row[p_lat_c] if p_lat_c >= 0 else None
            new_row[13] = row[p_lng_c] if p_lng_c >= 0 else None
            new_row[14] = row[p_img1_c] if p_img1_c >= 0 else None
            new_row[15] = row[p_img1_c] if p_img1_c >= 0 else None
            new_row[16] = row[p_img2_c] if p_img2_c >= 0 else None
            new_row[17] = row[p_img2_c] if p_img2_c >= 0 else None
            new_row[18] = row[p_img3_c] if p_img3_c >= 0 else None
            new_row[19] = row[p_img3_c] if p_img3_c >= 0 else None
            new_row[20] = "Surveyed Existing LED"
            new_row[21] = row[p_watt_c] if p_watt_c >= 0 else None
            new_row[22] = "Surveyed Existing LED"
            if len(new_row) > 26:
                new_row[26] = "Extracted from Pole Survey (Existing LED)"

            sheet_out.append(new_row)
            sr_no += 1
            added_pole_led_count += 1

    wb_pole.close()

    # Save merged file
    wb_out.save(str(output_path))
    wb_out.close()

    total_count = lamp_rows_count + added_pole_led_count
    file_size = os.path.getsize(output_path)
    now_dt = datetime.utcnow().isoformat()

    return {
        "is_available": True,
        "ward_id": ward_id,
        "ward_number": ward.ward_number,
        "lamp_uploaded": True,
        "pole_uploaded": True,
        "lamp_rows_count": lamp_rows_count,
        "pole_led_rows_count": added_pole_led_count,
        "total_merged_count": total_count,
        "file_path": str(output_path),
        "filename": output_filename,
        "file_size": file_size,
        "generated_at": now_dt,
    }

def get_merged_led_table_data(db: Session, ward_id: int) -> ReportDataResponse:
    """Reads the merged excel report and returns clean column names and row records."""
    summary = get_or_create_merged_led_report(db, ward_id)
    if not summary["is_available"] or not summary["file_path"]:
        return ReportDataResponse(
            uploaded=False,
            message=summary.get("reason", "Merged report not available"),
            ward_id=ward_id,
            report_type="merged_led_report",
            total_rows=0,
            columns=[],
            rows=[]
        )

    file_path = summary["file_path"]
    try:
        # Use header=1 to capture row 2 headers ('Sr #', 'Corporation', 'Constituency', etc.)
        df = pd.read_excel(file_path, header=1)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to read Merged LED report: {str(e)}"
        )

    # Clean column names
    cleaned_columns = [
        str(col).strip() if str(col).strip() != "" and not str(col).startswith("Unnamed:") else f"Column_{i+1}"
        for i, col in enumerate(df.columns)
    ]
    df.columns = cleaned_columns

    # Format datetime / timestamp objects into ISO string
    for col in df.select_dtypes(include=["datetime", "datetimetz"]).columns:
        df[col] = df[col].dt.strftime("%Y-%m-%d %H:%M:%S")

    # Replace NaN, NaT, Inf with None for valid JSON serialization
    df = df.replace({np.nan: None, np.inf: None, -np.inf: None})
    df = df.where(pd.notnull(df), None)

    rows = df.to_dict(orient="records")

    return ReportDataResponse(
        uploaded=True,
        report_id=999900 + ward_id,
        ward_id=ward_id,
        report_type="merged_led_report",
        original_filename=summary["filename"],
        file_size=summary["file_size"],
        uploaded_at=datetime.utcnow(),
        version_number=1,
        total_rows=len(rows),
        columns=cleaned_columns,
        rows=rows
    )
