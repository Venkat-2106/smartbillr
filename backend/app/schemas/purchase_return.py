# app/schemas/purchase_return.py
from pydantic import BaseModel, UUID4, field_validator, ConfigDict
from typing import Optional, List
from datetime import datetime
from decimal import Decimal


# ── Single item inside a purchase return request ──────────────────────────────
class PurchaseReturnItemCreate(BaseModel):
    product_id:    UUID4
    return_qty:    int
    refund_amount: Decimal  # refund per unit

    @field_validator("return_qty")
    @classmethod
    def qty_must_be_positive(cls, v):
        if v <= 0:
            raise ValueError("Return quantity must be greater than zero")
        return v

    @field_validator("refund_amount")
    @classmethod
    def amount_must_be_non_negative(cls, v):
        # Zero is allowed: returning a defective item for replacement
        # with no cash refund is a valid business workflow.
        # Negative refund_amount has no meaning and is never allowed.
        if v < 0:
            raise ValueError("Refund amount cannot be negative")
        return v


# ── Request body when creating a purchase return ──────────────────────────────
class PurchaseReturnCreate(BaseModel):
    pur_id:        UUID4
    return_reason: Optional[str] = None
    return_status: Optional[str] = "pending"
    restock:       bool = True
    refund_method: Optional[str] = "cash"
    items:         List[PurchaseReturnItemCreate]

    @field_validator("items")
    @classmethod
    def items_must_not_be_empty(cls, v):
        if len(v) == 0:
            raise ValueError("Return must have at least one item")
        return v

    @field_validator("return_status")
    @classmethod
    def valid_status(cls, v):
        allowed = ["pending", "approved", "rejected"]
        if v is not None and v not in allowed:
            raise ValueError(f"Status must be one of: {allowed}")
        return v


# ── Request body when updating a purchase return ──────────────────────────────
class PurchaseReturnUpdate(BaseModel):
    return_status:   str
    restock:         bool = True
    rejected_reason: Optional[str] = None

    @field_validator("return_status")
    @classmethod
    def valid_status(cls, v):
        allowed = ["pending", "approved", "rejected"]
        if v not in allowed:
            raise ValueError(f"Status must be one of: {allowed}")
        return v


# ── Response for a single return item ─────────────────────────────────────────
class PurchaseReturnItemResponse(BaseModel):
    return_item_id:       UUID4
    return_id:            UUID4
    product_id:           UUID4
    product_name:         Optional[str] = None
    return_qty:           int
    refund_amount:        Decimal
    return_item_subtotal: Optional[Decimal] = None

    model_config = ConfigDict(from_attributes=True)


# ── Response for a full purchase return ───────────────────────────────────────
class PurchaseReturnResponse(BaseModel):
    return_id:         UUID4
    business_id:       UUID4
    pur_id:            UUID4
    return_reason:     Optional[str] = None
    return_status:     str
    restock:           bool
    stock_updated:     bool
    refund_method:     Optional[str] = None
    approved_by:       Optional[UUID4] = None
    approved_at:       Optional[datetime] = None
    rejected_reason:   Optional[str] = None
    return_amount:     Optional[float] = None
    return_created_at: datetime
    created_by:        UUID4
    items:             Optional[List[PurchaseReturnItemResponse]] = []

    model_config = ConfigDict(from_attributes=True)