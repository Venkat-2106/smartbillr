from sqlalchemy import Column, String, Boolean, DateTime, Text
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base
import uuid


class Business(Base):
    __tablename__ = "businesses"

    business_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    business_name = Column(String, nullable=False)
    # FIX: DB has is_nullable=YES for business_email — was incorrectly nullable=False
    business_email = Column(String, nullable=True)
    business_phone = Column(String, nullable=True)
    business_address = Column(Text, nullable=True)
    business_state = Column(String, nullable=True)
    gstin = Column(String, nullable=True)
    is_gst_registered = Column(Boolean, default=False)
    is_deleted = Column(Boolean, default=False)
    created_at = Column(DateTime, nullable=True)
    # FIX: Added missing column — purchase router reads this via raw SQL but model was missing it
    business_country_code = Column(String(5), nullable=True)
