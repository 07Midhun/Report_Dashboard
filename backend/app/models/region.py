from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime
from sqlalchemy.orm import relationship
from ..database import Base

class Region(Base):
    __tablename__ = "regions"

    id = Column(Integer, primary_key=True, index=True)
    region_code = Column(String(50), unique=True, index=True, nullable=False)
    region_name = Column(String(150), nullable=False)
    corporation = Column(String(100), default="Bangalore (BBMP)", nullable=False)
    division = Column(String(100), default="East", nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    wards = relationship("Ward", back_populates="region", cascade="all, delete-orphan", order_by="Ward.ward_number")
