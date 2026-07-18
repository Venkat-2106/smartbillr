from pydantic import BaseModel, field_validator, ConfigDict
from typing import Optional, List
from uuid import UUID
from decimal import Decimal


# ─────────────────────────────────────────
# Purchase Item schemas
# ─────────────────────────────────────────

class PurchaseItemCreate(BaseModel):
    product_id: UUID
    pur_item_qty: int
    item_unit_price: Decimal

    @field_validator("pur_item_qty")
    @classmethod
    def quantity_must_be_positive(cls, v):
        if v <= 0:
            raise ValueError("Quantity must be greater than zero")
        return v

    @field_validator("item_unit_price")
    @classmethod
    def price_must_be_positive(cls, v):
        if v <= 0:
            raise ValueError("Unit price must be greater than zero")
        return v


class PurchaseItemOut(BaseModel):
    item_id: UUID
    product_id: UUID
    pur_item_qty: int
    item_unit_price: Decimal
    item_subtotal: Optional[Decimal] = None
    gst_rate: Optional[Decimal] = None
    cgst_amount: Optional[Decimal] = None
    sgst_amount: Optional[Decimal] = None
    igst_amount: Optional[Decimal] = None
    pur_tax_total: Optional[Decimal] = None
    item_tax_total: Optional[Decimal] = None
    item_total_with_tax: Optional[Decimal] = None

    model_config = ConfigDict(from_attributes=True)


# ─────────────────────────────────────────
# Purchase schemas
# ─────────────────────────────────────────

class PurchaseCreate(BaseModel):
    supp_id: Optional[UUID] = None
    pur_discount: Optional[Decimal] = Decimal("0")
    pur_payment_status: Optional[str] = "pending"
    items: List[PurchaseItemCreate]

    @field_validator("items")
    @classmethod
    def items_must_not_be_empty(cls, v):
        if len(v) == 0:
            raise ValueError("Purchase must have at least one item")
        return v

    @field_validator("pur_discount")
    @classmethod
    def discount_must_be_non_negative(cls, v):
        if v is not None and v < 0:
            raise ValueError("Discount cannot be negative")
        return v

    @field_validator("pur_payment_status")
    @classmethod
    def valid_payment_status(cls, v):
        allowed = ["pending", "paid", "partial"]
        if v is not None and v not in allowed:
            raise ValueError(f"Payment status must be one of: {allowed}")
        return v


class PurchaseOut(BaseModel):
    pur_id: UUID
    business_id: UUID
    supp_id: Optional[UUID] = None
    pur_total_amount: Decimal
    pur_discount: Optional[Decimal] = None
    pur_cgst_total: Optional[Decimal] = None
    pur_sgst_total: Optional[Decimal] = None
    pur_igst_total: Optional[Decimal] = None
    pur_tax_total: Optional[Decimal] = None
    pur_final_amount: Optional[Decimal] = None
    pur_payment_status: Optional[str] = None
    is_deleted: bool
    pur_created_at: Optional[str] = None
    created_by: Optional[UUID] = None
    items: Optional[List[PurchaseItemOut]] = []

    model_config = ConfigDict(from_attributes=True)