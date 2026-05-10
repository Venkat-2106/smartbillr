from pydantic import BaseModel, field_validator
from typing import Optional
from uuid import UUID
from decimal import Decimal


# --- Used when CREATING a new payment ---
class PaymentCreate(BaseModel):
    sale_id: UUID
    payment_amount: Decimal
    payment_method: Optional[str] = None

    @field_validator("payment_amount")
    @classmethod
    def amount_must_be_positive(cls, v):
        if v <= 0:
            raise ValueError("Payment amount must be greater than zero")
        return v

    @field_validator("payment_method")
    @classmethod
    def valid_payment_method(cls, v):
        allowed = ["cash", "card", "upi", "bank_transfer", "cheque", "other"]
        if v is not None and v not in allowed:
            raise ValueError(f"Payment method must be one of: {allowed}")
        return v


# --- Used when RETURNING payment data in response ---
class PaymentOut(BaseModel):
    payment_id: UUID
    business_id: UUID
    sale_id: UUID
    payment_amount: Decimal
    payment_method: Optional[str] = None
    payment_paid_at: Optional[str] = None

    class Config:
        from_attributes = True