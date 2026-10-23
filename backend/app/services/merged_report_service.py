import os
import json
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
        if not h:
            continue
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
    Takes the Lamp Installation / LED Report fully (skipping empty rows), extracts all surveyed poles 
    from the Pole Survey Report where the lamp/pole type is LED or FL LED, formats their pole numbers
    with their arm count e.g. 'GBA-SNL-W69-P2060-SP106 (1)' or 'GBA-SNL-W69-P2060-SP106 (2)', and merges 
    them by appending the extracted LED poles at the end ("at the last") into a single master LED report.
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
    meta_path = merged_dir / f"ward_{ward_id}_master_merged_led.json"

    # Check source file modification times
    source_latest_mtime = max(
        os.path.getmtime(lamp_rep.storage_key) if os.path.exists(lamp_rep.storage_key) else 0,
        os.path.getmtime(pole_rep.storage_key) if os.path.exists(pole_rep.storage_key) else 0,
    )

    # Return cached result if valid and meta exists
    if (
        not force_regenerate 
        and output_path.exists() 
        and meta_path.exists()
        and os.path.getmtime(output_path) >= source_latest_mtime
    ):
        try:
            with open(meta_path, "r", encoding="utf-8") as f:
                meta = json.load(f)
            return {
                "is_available": True,
                "ward_id": ward_id,
                "ward_number": ward.ward_number,
                "lamp_uploaded": True,
                "pole_uploaded": True,
                "lamp_rows_count": meta.get("lamp_rows_count", 0),
                "pole_led_rows_count": meta.get("pole_led_rows_count", 0),
                "total_merged_count": meta.get("total_merged_count", 0),
                "file_path": str(output_path),
                "filename": output_filename,
                "file_size": meta.get("file_size", os.path.getsize(output_path)),
                "generated_at": meta.get("generated_at"),
            }
        except Exception:
            pass

    # 1. Read Lamp Report (LED Report)
    wb_lamp = openpyxl.load_workbook(lamp_rep.storage_key, data_only=True)
    sheet_lamp = wb_lamp.active

    # Create target merged workbook
    wb_out = openpyxl.Workbook()
    sheet_out = wb_out.active
    sheet_out.title = "Master Merged LED Report"

    existing_poles = set()
    lamp_rows_count = 0

    # Determine header rows (row 1 category headers, row 2 column headers)
    lamp_rows_iter = sheet_lamp.iter_rows(values_only=True)
    row_1 = next(lamp_rows_iter, None)
    row_2 = next(lamp_rows_iter, None)

    if row_1:
        sheet_out.append(list(row_1))
    if row_2:
        sheet_out.append(list(row_2))
        lamp_headers = list(row_2)
    else:
        lamp_headers = []
    
    num_cols = len(lamp_headers) if lamp_headers else 27

    # Copy only VALID rows from Lamp Report (skip trailing blank / empty rows)
    for row in lamp_rows_iter:
        if not row:
            continue
        pole_val = row[5] if len(row) > 5 and row[5] is not None else None
        pole_str = str(pole_val).strip() if pole_val is not None else ""
        
        # If pole number is empty, null, or placeholder '-', skip it
        if not pole_str or pole_str.lower() in ("none", "-", "nan"):
            continue

        sheet_out.append(list(row))
        lamp_rows_count += 1
        existing_poles.add(pole_str)
        # Also track base pole number without parenthetical suffix
        clean_base = pole_str.split()[0].split("(")[0].strip()
        if clean_base:
            existing_poles.add(clean_base)

    wb_lamp.close()

    # 2. Read Pole Report and extract LED and FL LED poles
    wb_pole = openpyxl.load_workbook(pole_rep.storage_key, data_only=True)
    sheet_pole = wb_pole.active
    pole_headers = [str(c).strip() if c else "" for c in next(sheet_pole.iter_rows(min_row=1, max_row=1, values_only=True))]

    p_id_c = find_col_idx(pole_headers, ["pole id", "pole number", "poleid"])
    p_sp_c = find_col_idx(pole_headers, ["switch point", "switchpoint", "sp no"])
    p_type_c = find_col_idx(pole_headers, ["poletype", "pole type", "pole_type"])
    p_lamp_c = find_col_idx(pole_headers, ["lamp type", "lamptype", "mt,nl,led", "type of lamp"])
    p_watt_c = find_col_idx(pole_headers, ["lamp wattage", "wattage"])
    p_arm_c = find_col_idx(pole_headers, ["arm count", "no of arms", "armcount", "number of arms", "arms count"])
    p_arm_cond_c = find_col_idx(pole_headers, ["arm condition", "arm status"])
    p_road_c = find_col_idx(pole_headers, ["road category", "road type"])
    p_lat_c = find_col_idx(pole_headers, ["latitude"])
    p_lng_c = find_col_idx(pole_headers, ["longitude"])
    p_span_c = find_col_idx(pole_headers, ["pole span", "span"])
    p_img1_c = find_col_idx(pole_headers, ["image 1", "image1"])
    p_img2_c = find_col_idx(pole_headers, ["image 2", "image2"])
    p_img3_c = find_col_idx(pole_headers, ["image 3", "image3"])

    sr_no = lamp_rows_count + 1
    added_pole_led_count = 0

    for row in sheet_pole.iter_rows(min_row=2, values_only=True):
        if not row:
            continue
        pid = str(row[p_id_c]).strip() if p_id_c >= 0 and row[p_id_c] is not None else ""
        if not pid or pid.lower() in ("none", "-", "nan"):
            continue

        l_type = str(row[p_lamp_c]).strip() if p_lamp_c >= 0 and row[p_lamp_c] is not None else ""
        p_type = str(row[p_type_c]).strip() if p_type_c >= 0 and row[p_type_c] is not None else ""

        l_lower = l_type.lower()
        p_lower = p_type.lower()

        # Check for both LED and FL LED
        is_led = (
            "led" in l_lower 
            or "fl led" in l_lower 
            or "fl-led" in l_lower 
            or "led" in p_lower
        )

        clean_pid = pid.split()[0].split("(")[0].strip()

        if is_led and pid not in existing_poles and clean_pid not in existing_poles:
            existing_poles.add(pid)
            existing_poles.add(clean_pid)

            # Retrieve arm count from pole report
            arm_raw = str(row[p_arm_c]).strip() if p_arm_c >= 0 and row[p_arm_c] is not None else "1"
            if arm_raw in ("0", "", "None", "nan", "-"):
                arm_val = "1"
            else:
                # Extract numeric integer if available (e.g. 1.0 -> 1)
                try:
                    arm_val = str(int(float(arm_raw)))
                except ValueError:
                    arm_val = arm_raw

            # Name pole like GBA-SNL-W69-P2060-SP106 (1)
            if "(" in pid:
                formatted_pid = pid
            else:
                formatted_pid = f"{pid} ({arm_val})"

            new_row = [None] * num_cols
            if len(new_row) > 0: new_row[0] = sr_no
            if len(new_row) > 1: new_row[1] = getattr(region, "division", "EAST") or "EAST"
            if len(new_row) > 2: new_row[2] = region.region_name if region and region.region_name else "PulakeshiNagar"
            if len(new_row) > 3: new_row[3] = ward.ward_code or ward.ward_number
            if len(new_row) > 4: new_row[4] = row[p_sp_c] if p_sp_c >= 0 else None
            if len(new_row) > 5: new_row[5] = formatted_pid
            if len(new_row) > 6: new_row[6] = row[p_type_c] if p_type_c >= 0 and row[p_type_c] else "RCC"
            if len(new_row) > 7: new_row[7] = l_type if l_type else "LED"
            if len(new_row) > 8: new_row[8] = row[p_watt_c] if p_watt_c >= 0 else None
            if len(new_row) > 9: new_row[9] = row[p_span_c] if p_span_c >= 0 else None
            if len(new_row) > 10: new_row[10] = row[p_road_c] if p_road_c >= 0 else None
            if len(new_row) > 11: new_row[11] = row[p_lat_c] if p_lat_c >= 0 else None
            if len(new_row) > 12: new_row[12] = row[p_lng_c] if p_lng_c >= 0 else None
            if len(new_row) > 13: new_row[13] = row[p_img1_c] if p_img1_c >= 0 else None
            if len(new_row) > 14: new_row[14] = row[p_img1_c] if p_img1_c >= 0 else None
            if len(new_row) > 15: new_row[15] = row[p_img2_c] if p_img2_c >= 0 else None
            if len(new_row) > 16: new_row[16] = row[p_img2_c] if p_img2_c >= 0 else None
            if len(new_row) > 17: new_row[17] = row[p_img3_c] if p_img3_c >= 0 else None
            if len(new_row) > 18: new_row[18] = row[p_img3_c] if p_img3_c >= 0 else None
            if len(new_row) > 19: new_row[19] = row[p_arm_cond_c] if p_arm_cond_c >= 0 else "Good"
            if len(new_row) > 20: new_row[20] = row[p_watt_c] if p_watt_c >= 0 else "Existing LED"
            if len(new_row) > 21: new_row[21] = "Existing"
            if len(new_row) > 22: new_row[22] = row[p_img1_c] if p_img1_c >= 0 else None
            if len(new_row) > 23: new_row[23] = row[p_img1_c] if p_img1_c >= 0 else None
            if len(new_row) > 24: new_row[24] = "-"
            if len(new_row) > 25: new_row[25] = "Surveyed Existing LED"
            if len(new_row) > 26: new_row[26] = formatted_pid

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

    # Save metadata sidecar
    try:
        with open(meta_path, "w", encoding="utf-8") as f:
            json.dump({
                "lamp_rows_count": lamp_rows_count,
                "pole_led_rows_count": added_pole_led_count,
                "total_merged_count": total_count,
                "file_size": file_size,
                "generated_at": now_dt
            }, f, indent=2)
    except Exception:
        pass

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
