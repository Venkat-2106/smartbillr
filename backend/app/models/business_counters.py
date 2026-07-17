from sqlalchemy import Column, Integer, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base


class BusinessCounters(Base):
    __tablename__ = "business_counters"

    business_id = Column(UUID(as_uuid=True), ForeignKey("businesses.business_id"), primary_key=True, nullable=False)
    invoice_counter = Column(Integer, default=0)
    purchase_counter = Column(Integer, default=0)
    customer_counter = Column(Integer, default=0)
    # FIX: Added missing updated_at — DB has this column; sale router writes it via raw SQL
    updated_at = Column(DateTime, nullable=True)
