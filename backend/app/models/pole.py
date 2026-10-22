from datetime import datetime
from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, JSON
from sqlalchemy.orm import relationship
from ..database import Base

class Pole(Base):
    __tablename__ = "poles"

    id = Column(Integer, primary_key=True, index=True)
    ward_id = Column(Integer, ForeignKey("wards.id", ondelete="CASCADE"), nullable=False, index=True)
    pole_number = Column(String(100), nullable=False, index=True)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    connectivity_status = Column(String(50), default="unknown", nullable=False)  # connected, disconnected, pending, unknown
    source_report_id = Column(Integer, ForeignKey("reports.id", ondelete="SET NULL"), nullable=True)
    additional_attributes = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    ward = relationship("Ward", back_populates="poles")
    source_report = relationship("Report", back_populates="poles")
