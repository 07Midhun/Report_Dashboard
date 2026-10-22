from datetime import datetime
from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Enum
from sqlalchemy.orm import relationship
import enum
from ..database import Base

class ReportType(str, enum.Enum):
    LAMP_INSTALLATION = "lamp_installation"
    POLE_REPORT = "pole_report"
    COMMISSION_INTEGRATED = "commission_integrated"

class Report(Base):
    __tablename__ = "reports"

    id = Column(Integer, primary_key=True, index=True)
    ward_id = Column(Integer, ForeignKey("wards.id", ondelete="CASCADE"), nullable=False, index=True)
    report_type = Column(String(50), nullable=False, index=True)  # lamp_installation, pole_report, commission_integrated
    original_filename = Column(String(255), nullable=False)
    storage_key = Column(String(500), nullable=False)
    file_extension = Column(String(20), nullable=False)
    file_size = Column(Integer, nullable=False)
    mime_type = Column(String(100), default="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    uploaded_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    uploaded_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)

    ward = relationship("Ward", back_populates="reports")
    uploader = relationship("User", back_populates="reports")
    versions = relationship("ReportVersion", back_populates="report", cascade="all, delete-orphan", order_by="desc(ReportVersion.version_number)")
    poles = relationship("Pole", back_populates="source_report")

class ReportVersion(Base):
    __tablename__ = "report_versions"

    id = Column(Integer, primary_key=True, index=True)
    report_id = Column(Integer, ForeignKey("reports.id", ondelete="CASCADE"), nullable=False, index=True)
    original_filename = Column(String(255), nullable=False)
    storage_key = Column(String(500), nullable=False)
    file_size = Column(Integer, nullable=False)
    uploaded_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    uploaded_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    version_number = Column(Integer, nullable=False)

    report = relationship("Report", back_populates="versions")
    uploader = relationship("User")
