from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
from ..database import Base

class Ward(Base):
    __tablename__ = "wards"

    id = Column(Integer, primary_key=True, index=True)
    region_id = Column(Integer, ForeignKey("regions.id", ondelete="CASCADE"), nullable=False, index=True)
    ward_number = Column(String(50), nullable=False)
    ward_name = Column(String(150), nullable=False)
    ward_code = Column(String(50), unique=True, index=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    region = relationship("Region", back_populates="wards")
    reports = relationship("Report", back_populates="ward", cascade="all, delete-orphan")
    poles = relationship("Pole", back_populates="ward", cascade="all, delete-orphan")

    __table_args__ = (
        UniqueConstraint("region_id", "ward_number", name="uq_region_ward_number"),
    )
