import os
import openpyxl
import pandas as pd
from typing import List, Dict, Any, Optional, Tuple
from ..schemas.pole import ColumnMappingConfig

# Synonyms for auto-detection
POLE_NUMBER_CANDIDATES = [
    "pole number", "pole no.", "pole no", "pole_number", "pole_no", 
    "pole id", "poleid", "new pole number", "panel uid", "uid"
]
LATITUDE_CANDIDATES = [
    "latitude", "lat", "latitude (deg)", "pole_latitude", "y"
]
LONGITUDE_CANDIDATES = [
    "longitude", "long", "lng", "lon", "longitude (deg)", "pole_longitude", "x"
]
STATUS_CANDIDATES = [
    "connectivity status", "connectivity", "light status", "status", 
    "pole condition", "operational status", "connection status"
]
WARD_CANDIDATES = [
    "ward number", "ward no", "ward", "ward_number", "ward_no", "ward id"
]
SWITCHPOINT_CANDIDATES = [
    "sp no", "switchpoint no.", "switch point no", "switch point", "sp_no", "switchpoint"
]
WATTAGE_CANDIDATES = [
    "wattage", "light wattage", "lamp wattage"
]

def normalize_header(header: Any) -> str:
    """Normalizes header string for comparison."""
    if header is None:
        return ""
    return str(header).strip().lower()

def find_matching_column(columns: List[str], candidates: List[str]) -> Optional[str]:
    """Finds best matching column name based on candidate lists."""
    normalized_cols = {normalize_header(col): col for col in columns if col is not None}
    for candidate in candidates:
        if candidate in normalized_cols:
            return normalized_cols[candidate]
    # Partial substring match
    for col_norm, original in normalized_cols.items():
        for candidate in candidates:
            if candidate in col_norm:
                return original
    return None

def detect_column_mappings(columns: List[str], custom: Optional[ColumnMappingConfig] = None) -> Dict[str, Optional[str]]:
    """Determines column mapping with custom override support."""
    mapping = {
        "pole_number": None,
        "latitude": None,
        "longitude": None,
        "status": None,
        "ward": None,
        "switchpoint": None,
        "wattage": None
    }
    
    # Auto-detect
    mapping["pole_number"] = find_matching_column(columns, POLE_NUMBER_CANDIDATES)
    mapping["latitude"] = find_matching_column(columns, LATITUDE_CANDIDATES)
    mapping["longitude"] = find_matching_column(columns, LONGITUDE_CANDIDATES)
    mapping["status"] = find_matching_column(columns, STATUS_CANDIDATES)
    mapping["ward"] = find_matching_column(columns, WARD_CANDIDATES)
    mapping["switchpoint"] = find_matching_column(columns, SWITCHPOINT_CANDIDATES)
    mapping["wattage"] = find_matching_column(columns, WATTAGE_CANDIDATES)

    # Custom override if provided
    if custom:
        if custom.pole_number_col and custom.pole_number_col in columns:
            mapping["pole_number"] = custom.pole_number_col
        if custom.latitude_col and custom.latitude_col in columns:
            mapping["latitude"] = custom.latitude_col
        if custom.longitude_col and custom.longitude_col in columns:
            mapping["longitude"] = custom.longitude_col
        if custom.status_col and custom.status_col in columns:
            mapping["status"] = custom.status_col
        if custom.switchpoint_col and custom.switchpoint_col in columns:
            mapping["switchpoint"] = custom.switchpoint_col
        if custom.wattage_col and custom.wattage_col in columns:
            mapping["wattage"] = custom.wattage_col

    return mapping

def normalize_status(val: Any) -> str:
    """Classifies connectivity / operational status safely."""
    if val is None or pd.isna(val):
        return "unknown"
    val_str = str(val).strip().lower()
    if val_str in ("connected", "working", "on", "active", "integrated", "glow", "glowing", "ok"):
        return "connected"
    if val_str in ("disconnected", "not working", "off", "faulty", "inactive", "damaged", "fail", "failed"):
        return "disconnected"
    if val_str in ("pending", "under survey", "in progress", "wip", "surveyed"):
        return "pending"
    return "unknown"

def parse_coordinate(val: Any) -> Optional[float]:
    """Parses and validates a floating point coordinate."""
    if val is None or pd.isna(val):
        return None
    try:
        coord = float(str(val).strip())
        return coord
    except (ValueError, TypeError):
        return None

def is_valid_lat_long(lat: Optional[float], lon: Optional[float]) -> bool:
    """Validates real geographical bounds (ignores 0,0 and out-of-range coords)."""
    if lat is None or lon is None:
        return False
    if lat == 0.0 and lon == 0.0:
        return False
    # Reasonable world coordinates
    if -90.0 <= lat <= 90.0 and -180.0 <= lon <= 180.0:
        return True
    return False

def extract_poles_from_excel(
    file_path: str,
    custom_mapping: Optional[ColumnMappingConfig] = None
) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    """
    Reads workbook and extracts pole records with robust validation.
    Returns (extracted_records, metadata_summary).
    """
    if not os.path.isfile(file_path):
        raise FileNotFoundError(f"Excel file not found at {file_path}")

    # Load dataframe using openpyxl or pandas
    df = pd.read_excel(file_path, sheet_name=0, dtype=object)
    columns = [str(col) for col in df.columns]
    mapping = detect_column_mappings(columns, custom_mapping)

    pole_col = mapping["pole_number"]
    lat_col = mapping["latitude"]
    lon_col = mapping["longitude"]
    status_col = mapping["status"]

    if not pole_col:
        raise ValueError(f"Could not identify a Pole Number column in workbook. Available columns: {columns}")

    extracted_poles: List[Dict[str, Any]] = []
    seen_pole_numbers = set()
    total_rows = len(df)
    valid_coords_count = 0
    missing_coords_count = 0

    for idx, row in df.iterrows():
        raw_pole_id = row.get(pole_col)
        if raw_pole_id is None or pd.isna(raw_pole_id) or str(raw_pole_id).strip() == "":
            continue

        pole_number = str(raw_pole_id).strip()
        # Deduplicate per sheet
        if pole_number in seen_pole_numbers:
            continue
        seen_pole_numbers.add(pole_number)

        lat = parse_coordinate(row.get(lat_col)) if lat_col else None
        lon = parse_coordinate(row.get(lon_col)) if lon_col else None

        valid_coords = is_valid_lat_long(lat, lon)
        if valid_coords:
            valid_coords_count += 1
        else:
            missing_coords_count += 1
            # If coordinates are missing or invalid, do NOT invent them!
            lat = lat if valid_coords else 0.0
            lon = lon if valid_coords else 0.0

        status_val = row.get(status_col) if status_col else None
        connectivity = normalize_status(status_val)

        # Store additional attributes
        extra_attrs: Dict[str, Any] = {}
        for col in columns:
            if col not in (pole_col, lat_col, lon_col):
                val = row.get(col)
                if val is not None and not pd.isna(val):
                    extra_attrs[col] = str(val)

        extracted_poles.append({
            "pole_number": pole_number,
            "latitude": lat,
            "longitude": lon,
            "connectivity_status": connectivity,
            "has_valid_coords": valid_coords,
            "additional_attributes": extra_attrs
        })

    summary = {
        "total_rows": total_rows,
        "extracted_poles": len(extracted_poles),
        "valid_coords_count": valid_coords_count,
        "missing_coords_count": missing_coords_count,
        "detected_mapping": mapping
    }

    return extracted_poles, summary
