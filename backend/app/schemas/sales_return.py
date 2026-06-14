# app/schemas/sales_return.py
from pydantic import BaseModel, field_validator
from typing import Optional, List
from uuid import UUID
from decimal import Decimal
from datetime import datetime


class ReturnItemCreate(BaseModel):
    product_id:    UUID
    return_qty:    int
    refund_amount: Decimal

    @field_validator("return_qty")
    @classmethod
    def qty_must_be_positive(cls, v):
        if v <= 0:
            raise ValueError("Return quantity must be greater than zero")
        return v

    @field_validator("refund_amount")
    @classmethod
    def amount_must_be_non_negative(cls, v):
        # Zero is valid: returns for replacement/warranty with no cash refund.
        # Negative refund amounts are never valid here.
        if v < 0:
            raise ValueError("Refund amount cannot be negative")
        return v


class ReturnItemOut(BaseModel):
    return_item_id:        UUID
    product_id:            UUID
    return_qty:            float
    refund_amount:         Decimal
    return_item_subtotal:  Optional[Decimal] = None

    class Config:
        from_attributes = True


class SalesReturnCreate(BaseModel):
    sale_id:       UUID
    return_reason: Optional[str] = None
    return_status: Optional[str] = "pending"
    restock:       Optional[bool] = False
    items:         List[ReturnItemCreate]

    @field_validator("items")
    @classmethod
    def items_must_not_be_empty(cls, v):
        if len(v) == 0:
            raise ValueError("Return must have at least one item")
        return v

    @field_validator("return_status")
    @classmethod
    def valid_create_status(cls, v):
        allowed = ["pending", "approved", "rejected", "done"]
        if v is not None and v not in allowed:
            raise ValueError(f"Status must be one of: {allowed}")
        return v


class SalesReturnUpdate(BaseModel):
    return_status: str
    restock:       Optional[bool] = False

    @field_validator("return_status")
    @classmethod
    def valid_status(cls, v):
        allowed = ["pending", "approved", "rejected", "done"]
        if v not in allowed:
            raise ValueError(f"Status must be one of: {allowed}")
        return v


class SalesReturnOut(BaseModel):
    return_id:        UUID
    business_id:      UUID
    sale_id:          UUID
    return_amount:    Decimal
    return_reason:    Optional[str] = None
    return_status:    str
    restock:          Optional[bool] = False
    stock_updated:    Optional[bool] = False
    refund_method:    Optional[str] = None
    approved_by:      Optional[UUID] = None
    approved_at:      Optional[datetime] = None
    rejected_reason:  Optional[str] = None
    return_created_at: Optional[str] = None
    created_by:       Optional[UUID] = None
    items:            Optional[List[ReturnItemOut]] = []

    class Config:
        from_attributes = True