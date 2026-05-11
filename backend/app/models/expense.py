from sqlalchemy import Column, String, Boolean, Text, Numeric, Date
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base
import uuid


class Expense(Base):
    __tablename__ = "expenses"

    expense_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    business_id = Column(UUID(as_uuid=True), nullable=True)
    expense_category = Column(String, nullable=True)
    expense_amount = Column(Numeric, nullable=False)
    expense_date = Column(Date, nullable=True)
    expense_notes = Column(Text, nullable=True)
    is_deleted = Column(Boolean, default=False)
    created_at = Column(String, nullable=True)
    created_by = Column(UUID(as_uuid=True), nullable=True)