from pydantic import BaseModel, field_validator, ConfigDict
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

    model_config = ConfigDict(from_attributes=True)


# ─────────────────────────────────────────
# Sale schemas
# ─────────────────────────────────────────

class SaleCreate(BaseModel):
    customer_id: Optional[UUID] = None
    sales_discount: Optional[Decimal] = Decimal("0")
    sales_payment_method: Optional[str] = None
    sales_payment_status: Optional[str] = "pending"

    # paid_amount: sent only when sales_payment_status = "partial".
    # Records how much the customer paid upfront at invoice creation time.
    # The DB has no notes column on the sales table — intentionally absent.
    paid_amount: Optional[Decimal] = None

    # allow_stock_override: sent as True only after the cashier confirms the
    # stock override dialog in the frontend.
    # Default False → normal stock check applies.
    # When True → over-stock items are allowed through and a manual adjustment
    # stock movement record is written in Step 5.5 of the router.
    allow_stock_override: bool = False

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

    @field_validator("sales_payment_method")
    @classmethod
    def valid_payment_method(cls, v):
        # Must match DB check constraint exactly
        allowed = ["cash", "upi", "card", "bank", "split"]
        if v is not None and v not in allowed:
            raise ValueError(f"Payment method must be one of: {allowed}")
        return v

    @field_validator("sales_payment_status")
    @classmethod
    def valid_payment_status(cls, v):
        allowed = ["pending", "paid", "partial"]
        if v is not None and v not in allowed:
            raise ValueError(f"Payment status must be one of: {allowed}")
        return v

    @field_validator("paid_amount")
    @classmethod
    def paid_amount_must_be_positive(cls, v):
        # Allow None (not provided), but if provided must be > 0
        if v is not None and v <= 0:
            raise ValueError("Paid amount must be greater than zero")
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

    model_config = ConfigDict(from_attributes=True)