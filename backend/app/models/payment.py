from sqlalchemy import Column, String, Numeric
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base
import uuid


class Payment(Base):
    __tablename__ = "payments"

    payment_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    business_id = Column(UUID(as_uuid=True), nullable=True)
    sale_id = Column(UUID(as_uuid=True), nullable=True)
    payment_amount = Column(Numeric, nullable=False)
    payment_method = Column(String, nullable=True)
    payment_paid_at = Column(String, nullable=True)