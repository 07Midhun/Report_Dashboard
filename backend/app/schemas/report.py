from pydantic import BaseModel, ConfigDict
from typing import Optional, List
from datetime import datetime

class ReportVersionOut(BaseModel):
    id: int
    report_id: int
    original_filename: str
    file_size: int
    uploaded_by: Optional[int] = None
    uploader_name: Optional[str] = None
    uploaded_at: datetime
    version_number: int

    model_config = ConfigDict(from_attributes=True)

class ReportOut(BaseModel):
    id: int
    ward_id: int
    report_type: str
    original_filename: str
    file_extension: str
    file_size: int
    mime_type: str
    uploaded_by: Optional[int] = None
    uploader_name: Optional[str] = None
    uploaded_at: datetime
    updated_at: datetime
    is_active: bool
    versions_count: int = 1

    model_config = ConfigDict(from_attributes=True)

class ReportSlot(BaseModel):
    category_key: str  # lamp_installation, pole_report, commission_integrated
    display_title: str  # "Lamp Installation Report", "Pole Report", "Commission and Integrated Pole Report"
    is_uploaded: bool
    current_report: Optional[ReportOut] = None

class WardReportSlotsResponse(BaseModel):
    ward_id: int
    ward_code: str
    ward_name: str
    slots: List[ReportSlot]

class ReportHistoryItem(BaseModel):
    version_id: int
    report_id: int
    report_type: str
    original_filename: str
    file_size: int
    version_number: int
    uploaded_at: datetime
    uploader_name: Optional[str] = None

class ReportUploadResponse(BaseModel):
    message: str
    report: ReportOut
    is_replacement: bool = False
    previous_version_number: Optional[int] = None

class ReportDataResponse(BaseModel):
    uploaded: bool
    message: Optional[str] = None
    report_id: Optional[int] = None
    ward_id: Optional[int] = None
    report_type: Optional[str] = None
    original_filename: Optional[str] = None
    file_size: Optional[int] = None
    uploaded_at: Optional[datetime] = None
    version_number: Optional[int] = None
    total_rows: Optional[int] = 0
    columns: Optional[List[str]] = []
    rows: Optional[List[dict]] = []

    model_config = ConfigDict(from_attributes=True)
