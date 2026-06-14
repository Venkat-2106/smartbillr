from pydantic import BaseModel, field_validator
from typing import Optional
from uuid import UUID
from decimal import Decimal
from datetime import date, datetime

ALLOWED_CATEGORIES = ["rent", "salary", "electricity", "internet", "maintenance", "marketing", "purchase", "other"]

class ExpenseCreate(BaseModel):
    expense_category: Optional[str] = None
    expense_amount: Decimal
    expense_date: Optional[date] = None
    expense_notes: Optional[str] = None

    @field_validator("expense_category")
    @classmethod
    def valid_category(cls, v):
        if v is not None and v not in ALLOWED_CATEGORIES:
            raise ValueError(f"expense_category must be one of: {ALLOWED_CATEGORIES}")
        return v

class ExpenseUpdate(BaseModel):
    expense_category: Optional[str] = None
    expense_amount: Optional[Decimal] = None
    expense_date: Optional[date] = None
    expense_notes: Optional[str] = None

    @field_validator("expense_category")
    @classmethod
    def valid_category(cls, v):
        if v is not None and v not in ALLOWED_CATEGORIES:
            raise ValueError(f"expense_category must be one of: {ALLOWED_CATEGORIES}")
        return v

class ExpenseOut(BaseModel):
    expense_id: UUID
    business_id: UUID
    expense_category: Optional[str] = None
    expense_amount: Decimal
    expense_date: Optional[date] = None
    expense_notes: Optional[str] = None
    is_deleted: bool
    created_at: Optional[datetime] = None
    created_by: Optional[UUID] = None

    class Config:
        from_attributes = True