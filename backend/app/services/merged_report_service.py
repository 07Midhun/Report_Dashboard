import os
import json
import openpyxl
from openpyxl.styles import Alignment
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

    poles_cache_path = merged_dir / f"ward_{ward_id}_master_merged_poles.json"

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
        and poles_cache_path.exists()
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
    poles_cache = []

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
    lamp_p_c = find_col_idx(lamp_headers, ["pole number", "pole id", "poleid", "pole_number"])
    if lamp_p_c < 0:
        lamp_p_c = 5

    lamp_lat_c = find_col_idx(lamp_headers, ["latitude", "lat"])
    lamp_lng_c = find_col_idx(lamp_headers, ["longitude", "long", "lng"])
    lamp_sp_c = find_col_idx(lamp_headers, ["switch point", "switchpoint", "sp no"])
    lamp_lt_c = find_col_idx(lamp_headers, ["light's /empty pole", "lamp type", "light"])
    lamp_watt_c = find_col_idx(lamp_headers, ["new light's wattage", "old light wattage", "wattage"])
    lamp_road_c = find_col_idx(lamp_headers, ["road category", "road type"])

    # Copy only VALID rows from Lamp Report (skip trailing blank / empty rows)
    for row in lamp_rows_iter:
        if not row:
            continue
        pole_val = row[lamp_p_c] if len(row) > lamp_p_c and row[lamp_p_c] is not None else None
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

        # Collect pole for map cache
        lat_v = row[lamp_lat_c] if lamp_lat_c >= 0 and len(row) > lamp_lat_c else None
        lng_v = row[lamp_lng_c] if lamp_lng_c >= 0 and len(row) > lamp_lng_c else None
        sp_v = row[lamp_sp_c] if lamp_sp_c >= 0 and len(row) > lamp_sp_c else ""
        lt_v = row[lamp_lt_c] if lamp_lt_c >= 0 and len(row) > lamp_lt_c else "LED"
        watt_v = row[lamp_watt_c] if lamp_watt_c >= 0 and len(row) > lamp_watt_c else ""
        road_v = row[lamp_road_c] if lamp_road_c >= 0 and len(row) > lamp_road_c else ""

        try:
            f_lat = float(lat_v) if lat_v is not None else 0.0
            f_lng = float(lng_v) if lng_v is not None else 0.0
        except (ValueError, TypeError):
            f_lat, f_lng = 0.0, 0.0

        poles_cache.append({
            "id": len(poles_cache) + 1,
            "ward_id": ward_id,
            "pole_number": pole_str,
            "latitude": f_lat,
            "longitude": f_lng,
            "source": "installed_lamp",
            "connectivity_status": "connected",
            "additional_attributes": {
                "Switch Point No": str(sp_v) if sp_v else "-",
                "Lamp Type": str(lt_v) if lt_v else "LED",
                "Wattage": str(watt_v) if watt_v else "-",
                "Road Category": str(road_v) if road_v else "-",
                "Source": "Installed Lamp Report"
            }
        })

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

    # Output target column indices matched dynamically against lamp_headers
    out_sr_c = find_col_idx(lamp_headers, ["sr #", "sr no", "sl no"])
    out_corp_c = find_col_idx(lamp_headers, ["corporation"])
    out_const_c = find_col_idx(lamp_headers, ["constituency"])
    out_ward_c = find_col_idx(lamp_headers, ["ward no", "ward number", "ward"])
    out_sp_c = find_col_idx(lamp_headers, ["switch point", "switchpoint", "sp no"])
    out_pole_c = find_col_idx(lamp_headers, ["pole number", "pole id", "poleid"])
    out_type_c = find_col_idx(lamp_headers, ["pole type", "poletype"])
    out_light_c = find_col_idx(lamp_headers, ["light's /empty pole", "light's /empty", "type of lamp", "lamp type"])
    out_old_watt_c = find_col_idx(lamp_headers, ["old light wattage", "wattage", "lamp wattage"])
    out_span_c = find_col_idx(lamp_headers, ["gap/pole span", "pole span", "span"])
    out_road_c = find_col_idx(lamp_headers, ["road category", "road type"])
    out_lat_c = find_col_idx(lamp_headers, ["latitude", "lat"])
    out_lng_c = find_col_idx(lamp_headers, ["longitude", "long", "lng"])
    out_before_img1_c = find_col_idx(lamp_headers, ["before installation image 1", "image 1"])
    out_before_img1_link_c = find_col_idx(lamp_headers, ["before installation image 1 link", "image 1 link"])
    out_before_img2_c = find_col_idx(lamp_headers, ["before installation image 2", "image 2"])
    out_before_img2_link_c = find_col_idx(lamp_headers, ["before installation image 2 link", "image 2 link"])
    out_before_img3_c = find_col_idx(lamp_headers, ["before installation image 3", "image 3"])
    out_before_img3_link_c = find_col_idx(lamp_headers, ["before installation image 3 link", "image 3 link"])
    out_old_arm_c = find_col_idx(lamp_headers, ["old arm status", "arm status", "arm condition"])
    out_new_watt_c = find_col_idx(lamp_headers, ["new light's wattage", "new wattage"])
    out_new_arm_c = find_col_idx(lamp_headers, ["new arm status"])
    out_after_img1_c = find_col_idx(lamp_headers, ["after installation image 1"])
    out_after_img1_link_c = find_col_idx(lamp_headers, ["after installation image 1 link"])
    out_tree_c = find_col_idx(lamp_headers, ["tree cuting", "tree cutting"])
    out_remark_c = find_col_idx(lamp_headers, ["remark", "remarks"])
    out_lamp_id_c = find_col_idx(lamp_headers, ["lamp id", "lamp_id"])

    sr_no = lamp_rows_count + 1
    added_pole_led_count = 0
    survey_poles_seen = set()

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
            l_lower == "led" 
            or l_lower == "fl led" 
            or l_lower == "fl-led"
            or l_lower in ("led", "fl led", "fl-led")
            or "fl led" in l_lower
            or "fl-led" in l_lower
        )

        clean_pid = pid.split()[0].split("(")[0].strip()

        if is_led and clean_pid not in survey_poles_seen:
            survey_poles_seen.add(clean_pid)
            survey_poles_seen.add(pid)

            # Retrieve arm count from pole report
            arm_raw = str(row[p_arm_c]).strip() if p_arm_c >= 0 and row[p_arm_c] is not None else "1"
            try:
                arm_num = int(float(arm_raw))
            except (ValueError, TypeError):
                arm_num = 1

            if arm_num <= 0:
                arm_num = 1

            # Base pole ID without any existing parenthetical suffix
            clean_base_id = pid.split("(")[0].strip()

            # If arm count is N (e.g. 2), put all arm lines inside the SAME box/cell separated by newline:
            # GBA-SNL-W69-P2060-SP106(1)
            # GBA-SNL-W69-P2060-SP106(2)
            arm_pole_ids = [f"{clean_base_id}({arm_idx})" for arm_idx in range(1, arm_num + 1)]
            formatted_pid = "\n".join(arm_pole_ids)

            new_row = [None] * num_cols
            def set_cell(col_idx, val):
                if 0 <= col_idx < num_cols:
                    new_row[col_idx] = val

            set_cell(out_sr_c if out_sr_c >= 0 else 0, sr_no)
            set_cell(out_corp_c if out_corp_c >= 0 else 1, getattr(region, "division", "EAST") or "EAST")
            set_cell(out_const_c if out_const_c >= 0 else 2, region.region_name if region and region.region_name else "PulakeshiNagar")
            set_cell(out_ward_c if out_ward_c >= 0 else 3, ward.ward_code or ward.ward_number)
            set_cell(out_sp_c if out_sp_c >= 0 else 4, row[p_sp_c] if p_sp_c >= 0 else None)
            set_cell(out_pole_c if out_pole_c >= 0 else 5, formatted_pid)
            set_cell(out_type_c if out_type_c >= 0 else 6, row[p_type_c] if p_type_c >= 0 and row[p_type_c] else "RCC")
            set_cell(out_light_c if out_light_c >= 0 else 7, l_type if l_type else "LED")
            set_cell(out_old_watt_c if out_old_watt_c >= 0 else 9, row[p_watt_c] if p_watt_c >= 0 else None)
            set_cell(out_span_c if out_span_c >= 0 else 10, row[p_span_c] if p_span_c >= 0 else None)
            set_cell(out_road_c if out_road_c >= 0 else 11, row[p_road_c] if p_road_c >= 0 else None)
            set_cell(out_lat_c if out_lat_c >= 0 else 12, row[p_lat_c] if p_lat_c >= 0 else None)
            set_cell(out_lng_c if out_lng_c >= 0 else 13, row[p_lng_c] if p_lng_c >= 0 else None)
            set_cell(out_before_img1_c if out_before_img1_c >= 0 else 14, row[p_img1_c] if p_img1_c >= 0 else None)
            set_cell(out_before_img1_link_c if out_before_img1_link_c >= 0 else 15, row[p_img1_c] if p_img1_c >= 0 else None)
            set_cell(out_before_img2_c if out_before_img2_c >= 0 else 16, row[p_img2_c] if p_img2_c >= 0 else None)
            set_cell(out_before_img2_link_c if out_before_img2_link_c >= 0 else 17, row[p_img2_c] if p_img2_c >= 0 else None)
            set_cell(out_before_img3_c if out_before_img3_c >= 0 else 18, row[p_img3_c] if p_img3_c >= 0 else None)
            set_cell(out_before_img3_link_c if out_before_img3_link_c >= 0 else 19, row[p_img3_c] if p_img3_c >= 0 else None)
            set_cell(out_old_arm_c if out_old_arm_c >= 0 else 20, row[p_arm_cond_c] if p_arm_cond_c >= 0 else "Good")
            set_cell(out_new_watt_c if out_new_watt_c >= 0 else 21, row[p_watt_c] if p_watt_c >= 0 else "Existing LED")
            set_cell(out_new_arm_c if out_new_arm_c >= 0 else 22, "Existing")
            set_cell(out_after_img1_c if out_after_img1_c >= 0 else 23, row[p_img1_c] if p_img1_c >= 0 else None)
            set_cell(out_after_img1_link_c if out_after_img1_link_c >= 0 else 24, row[p_img1_c] if p_img1_c >= 0 else None)
            set_cell(out_tree_c if out_tree_c >= 0 else 25, "-")
            set_cell(out_remark_c if out_remark_c >= 0 else 26, "Surveyed Existing LED")
            set_cell(out_lamp_id_c if out_lamp_id_c >= 0 else 27, formatted_pid)

            sheet_out.append(new_row)
            if arm_num > 1:
                cur_r = sheet_out.max_row
                p_col_target = (out_pole_c + 1) if out_pole_c >= 0 else 6
                sheet_out.cell(row=cur_r, column=p_col_target).alignment = Alignment(wrap_text=True, vertical="center")
                if out_lamp_id_c >= 0:
                    sheet_out.cell(row=cur_r, column=out_lamp_id_c + 1).alignment = Alignment(wrap_text=True, vertical="center")

            # Collect pole for map cache
            s_lat_v = row[p_lat_c] if p_lat_c >= 0 else None
            s_lng_v = row[p_lng_c] if p_lng_c >= 0 else None
            try:
                sf_lat = float(s_lat_v) if s_lat_v is not None else 0.0
                sf_lng = float(s_lng_v) if s_lng_v is not None else 0.0
            except (ValueError, TypeError):
                sf_lat, sf_lng = 0.0, 0.0

            poles_cache.append({
                "id": len(poles_cache) + 1,
                "ward_id": ward_id,
                "pole_number": formatted_pid,
                "latitude": sf_lat,
                "longitude": sf_lng,
                "source": "extracted_survey",
                "connectivity_status": "connected",
                "additional_attributes": {
                    "Switch Point No": str(row[p_sp_c]) if p_sp_c >= 0 and row[p_sp_c] else "-",
                    "Lamp Type": l_type if l_type else "LED",
                    "Wattage": str(row[p_watt_c]) if p_watt_c >= 0 and row[p_watt_c] else "-",
                    "Road Category": str(row[p_road_c]) if p_road_c >= 0 and row[p_road_c] else "-",
                    "Source": "Extracted Surveyed LED"
                }
            })

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

    # Save poles cache for fast map rendering
    try:
        with open(poles_cache_path, "w", encoding="utf-8") as pf:
            json.dump(poles_cache, pf, indent=2)
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
