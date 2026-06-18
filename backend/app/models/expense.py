from sqlalchemy import Column, String, Boolean, Text, Numeric, Date, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base
import uuid


class Expense(Base):
    __tablename__ = "expenses"

    expense_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # FIX: Added ForeignKey — DB has FK constraint to businesses.business_id
    business_id = Column(UUID(as_uuid=True), ForeignKey("businesses.business_id"), nullable=True)
    expense_category = Column(String(50), nullable=True)
    expense_amount = Column(Numeric(10, 2), nullable=False)
    expense_date = Column(Date, nullable=True)
    expense_notes = Column(Text, nullable=True)
    is_deleted = Column(Boolean, default=False)
    # FIX: DB type is timestamp without time zone — was incorrectly String
    created_at = Column(DateTime, nullable=True)
    created_by = Column(UUID(as_uuid=True), nullable=True)
    updated_at = Column(DateTime, nullable=True)
    updated_by = Column(UUID(as_uuid=True), ForeignKey("profiles.id"), nullable=True)