from sqlalchemy import Column, String, Boolean, DateTime, Text
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base
import uuid
from datetime import datetime

class Business(Base):
    __tablename__ = "businesses"

    business_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    business_name = Column(String, nullable=False)
    business_email = Column(String, nullable=False)
    business_phone = Column(String, nullable=True)
    business_address = Column(Text, nullable=True)
    business_state = Column(String, nullable=True)
    gstin = Column(String, nullable=True)
    is_gst_registered = Column(Boolean, default=False)
    is_deleted = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)