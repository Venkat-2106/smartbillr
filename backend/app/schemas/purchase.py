from pydantic import BaseModel, field_validator, model_validator, ConfigDict
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
# Purchase Payment schema
# ─────────────────────────────────────────

class PurchasePaymentCreate(BaseModel):
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
        allowed = ["cash", "upi", "card", "bank", "split", "adjustment"]
        if v is not None and v not in allowed:
            raise ValueError(f"Payment method must be one of: {allowed}")
        return v


# ─────────────────────────────────────────
# Purchase schemas
# ─────────────────────────────────────────

class PurchaseCreate(BaseModel):
    supp_id: Optional[UUID] = None
    pur_discount: Optional[Decimal] = Decimal("0")
    pur_payment_status: Optional[str] = "pending"
    paid_amount: Optional[Decimal] = None
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

    @field_validator("paid_amount")
    @classmethod
    def paid_amount_must_be_positive(cls, v):
        if v is not None and v <= 0:
            raise ValueError("Paid amount must be greater than zero")
        return v

    @model_validator(mode="after")
    def validate_paid_amount_for_status(self):
        if self.pur_payment_status == "partial":
            if self.paid_amount is None or self.paid_amount <= 0:
                raise ValueError("paid_amount is required and must be > 0 when payment status is 'partial'")
        elif self.paid_amount is not None:
            raise ValueError("paid_amount must only be provided when payment status is 'partial'")
        return self


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