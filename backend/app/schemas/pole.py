from pydantic import BaseModel, ConfigDict
from typing import Optional, Dict, Any, List
from datetime import datetime

class PoleOut(BaseModel):
    id: Optional[int] = None
    ward_id: int
    pole_number: str
    latitude: float
    longitude: float
    connectivity_status: str  # connected, disconnected, pending, unknown
    source: Optional[str] = "installed_lamp"  # installed_lamp, extracted_survey
    source_report_id: Optional[int] = None
    additional_attributes: Optional[Dict[str, Any]] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)

class PoleSummaryOut(BaseModel):
    ward_id: int
    total_poles: int
    installed_lamp_count: Optional[int] = 0
    extracted_survey_count: Optional[int] = 0
    connected_poles: int
    disconnected_poles: int
    pending_poles: int
    unknown_poles: int
    has_valid_coordinates: bool
    center_latitude: Optional[float] = None
    center_longitude: Optional[float] = None
    available_reports: List[str] = []

class ColumnMappingConfig(BaseModel):
    pole_number_col: Optional[str] = None
    latitude_col: Optional[str] = None
    longitude_col: Optional[str] = None
    status_col: Optional[str] = None
    wattage_col: Optional[str] = None
    switchpoint_col: Optional[str] = None

class PoleImportRequest(BaseModel):
    report_type: Optional[str] = None  # pole_report, lamp_installation, commission_integrated (default uses best available)
    custom_mappings: Optional[ColumnMappingConfig] = None
