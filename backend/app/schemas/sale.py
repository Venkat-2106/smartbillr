from pydantic import BaseModel, field_validator
from typing import Optional, List
from uuid import UUID
from decimal import Decimal


# ─────────────────────────────────────────
# Sale Item schemas
# ─────────────────────────────────────────

class SaleItemCreate(BaseModel):
    product_id: UUID
    sale_item_quantity: int
    sale_item_unit_price: Decimal

    @field_validator("sale_item_quantity")
    @classmethod
    def quantity_must_be_positive(cls, v):
        if v <= 0:
            raise ValueError("Quantity must be greater than zero")
        return v

    @field_validator("sale_item_unit_price")
    @classmethod
    def price_must_be_positive(cls, v):
        if v <= 0:
            raise ValueError("Unit price must be greater than zero")
        return v


class SaleItemOut(BaseModel):
    sale_item_id: UUID
    product_id: UUID
    sale_item_quantity: int
    sale_item_unit_price: Decimal
    sale_item_subtotal: Optional[Decimal] = None
    gst_rate: Optional[Decimal] = None
    cgst_amount: Optional[Decimal] = None
    sgst_amount: Optional[Decimal] = None
    igst_amount: Optional[Decimal] = None
    tax_amount: Optional[Decimal] = None
    item_tax_total: Optional[Decimal] = None
    item_total_with_tax: Optional[Decimal] = None

    class Config:
        from_attributes = True


# ─────────────────────────────────────────
# Sale schemas
# ─────────────────────────────────────────

class SaleCreate(BaseModel):
    customer_id: Optional[UUID] = None
    sales_discount: Optional[Decimal] = Decimal("0")
    sales_payment_method: Optional[str] = None
    sales_payment_status: Optional[str] = "pending"
    items: List[SaleItemCreate]

    @field_validator("items")
    @classmethod
    def items_must_not_be_empty(cls, v):
        if len(v) == 0:
            raise ValueError("Sale must have at least one item")
        return v

    @field_validator("sales_discount")
    @classmethod
    def discount_must_be_non_negative(cls, v):
        if v is not None and v < 0:
            raise ValueError("Discount cannot be negative")
        return v

    @field_validator("sales_payment_status")
    @classmethod
    def valid_payment_status(cls, v):
        allowed = ["pending", "paid", "partial"]
        if v is not None and v not in allowed:
            raise ValueError(f"Payment status must be one of: {allowed}")
        return v


class SaleOut(BaseModel):
    sales_id: UUID
    business_id: UUID
    customer_id: Optional[UUID] = None
    invoice_no: Optional[str] = None
    sales_total_amount: Decimal
    sales_discount: Optional[Decimal] = None
    cgst_total: Optional[Decimal] = None
    sgst_total: Optional[Decimal] = None
    igst_total: Optional[Decimal] = None
    tax_total: Optional[Decimal] = None
    sales_final_amount: Optional[Decimal] = None
    sales_payment_method: Optional[str] = None
    sales_payment_status: Optional[str] = None
    is_deleted: bool
    sales_created_at: Optional[str] = None
    created_by: Optional[UUID] = None
    items: Optional[List[SaleItemOut]] = []

    class Config:
        from_attributes = True