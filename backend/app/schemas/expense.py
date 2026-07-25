from pydantic import BaseModel, field_validator, ConfigDict
from typing import Optional
from uuid import UUID
from decimal import Decimal
from datetime import date, datetime
from app.schemas.validators import strip_and_escape_html

# ALLOWED_CATEGORIES must stay in sync with:
#   - DB CHECK constraint: expenses_expense_category_check  (via ALTER TABLE)
#   - Frontend: ExpensesPage.jsx ALLOWED_CATEGORIES
#   - Frontend: ExpenseDetailDrawer.jsx CATEGORY_LABELS
# "purchase_refund" is system-generated only (negative amount, not user-created).
ALLOWED_CATEGORIES = ["rent", "salary", "electricity", "internet", "maintenance", "marketing", "purchase", "other"]

class ExpenseCreate(BaseModel):
    expense_category: Optional[str] = None
    expense_amount: Decimal
    expense_date: Optional[date] = None
    expense_notes: Optional[str] = None

    @field_validator("expense_amount")
    @classmethod
    def amount_must_be_positive(cls, v):
        if v <= 0:
            raise ValueError("Expense amount must be greater than zero")
        return v

    @field_validator("expense_category")
    @classmethod
    def valid_category(cls, v):
        if v is not None and v not in ALLOWED_CATEGORIES:
            raise ValueError(f"expense_category must be one of: {ALLOWED_CATEGORIES}")
        return v

    @field_validator("expense_notes")
    @classmethod
    def sanitize_notes(cls, v):
        return strip_and_escape_html(v)

class ExpenseUpdate(BaseModel):
    expense_category: Optional[str] = None
    expense_amount: Optional[Decimal] = None
    expense_date: Optional[date] = None
    expense_notes: Optional[str] = None

    @field_validator("expense_amount")
    @classmethod
    def amount_must_be_positive(cls, v):
        if v is not None and v <= 0:
            raise ValueError("Expense amount must be greater than zero")
        return v

    @field_validator("expense_category")
    @classmethod
    def valid_category(cls, v):
        if v is not None and v not in ALLOWED_CATEGORIES:
            raise ValueError(f"expense_category must be one of: {ALLOWED_CATEGORIES}")
        return v

    @field_validator("expense_notes")
    @classmethod
    def sanitize_notes(cls, v):
        return strip_and_escape_html(v)

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
    source_type: Optional[str] = None
    source_id: Optional[UUID] = None

    model_config = ConfigDict(from_attributes=True)