from pydantic import BaseModel, field_validator
from typing import Optional
from uuid import UUID
from decimal import Decimal
from datetime import date


# --- Used when CREATING a new expense ---
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


# --- Used when UPDATING an existing expense ---
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


# --- Used when RETURNING expense data in response ---
class ExpenseOut(BaseModel):
    expense_id: UUID
    business_id: UUID
    expense_category: Optional[str] = None
    expense_amount: Decimal
    expense_date: Optional[date] = None
    expense_notes: Optional[str] = None
    is_deleted: bool
    created_at: Optional[str] = None
    created_by: Optional[UUID] = None

    class Config:
        from_attributes = True