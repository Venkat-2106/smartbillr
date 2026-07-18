from sqlalchemy import Column, String, Boolean, DateTime, Text
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base
import uuid


class Business(Base):
    __tablename__ = "businesses"

    business_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    business_name = Column(String, nullable=False)
    business_email = Column(String, nullable=True)
    business_phone = Column(String, nullable=True)
    business_address = Column(Text, nullable=True)
    business_state = Column(String, nullable=True)
    gstin = Column(String, nullable=True)
    is_gst_registered = Column(Boolean, default=False)
    is_deleted = Column(Boolean, default=False)
    created_at = Column(DateTime, nullable=True)
    business_country_code = Column(String(5), nullable=True)

    payment_status = Column(String(20), nullable=False, default="pending")
    subscription_type = Column(String(20), nullable=False, default="trial")
    subscription_start_at = Column(DateTime, nullable=True)
    subscription_end_at = Column(DateTime, nullable=True)
    trial_start_at = Column(DateTime, nullable=True)
    trial_end_at = Column(DateTime, nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
