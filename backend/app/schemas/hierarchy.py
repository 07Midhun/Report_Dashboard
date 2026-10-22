from pydantic import BaseModel, ConfigDict
from typing import List, Optional
from datetime import datetime

class WardBase(BaseModel):
    ward_number: str
    ward_name: str
    ward_code: str

class WardCreate(WardBase):
    pass

class WardOut(WardBase):
    id: int
    region_id: int
    created_at: datetime
    active_reports_count: Optional[int] = 0
    total_poles_count: Optional[int] = 0
    zone_name: Optional[str] = None
    division: Optional[str] = None
    corporation: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)

class RegionBase(BaseModel):
    region_code: str
    region_name: str
    corporation: Optional[str] = "Bangalore (BBMP)"
    division: Optional[str] = "East"

class RegionCreate(RegionBase):
    pass

class RegionOut(RegionBase):
    id: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

class RegionWithWardsOut(RegionOut):
    wards: List[WardOut] = []

    model_config = ConfigDict(from_attributes=True)
