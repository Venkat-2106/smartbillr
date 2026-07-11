# app/schemas/product.py
#
# VALIDATION CHANGES (2026-06-06):
#
#   prod_name — new strip_and_validate_name validator:
#     - Trims leading/trailing whitespace BEFORE min-length check runs
#     - Rejects blank/whitespace-only names (" " → error)
#     - Applies to BOTH ProductCreate and ProductUpdate
#     - This is the first line of defence before the backend duplicate check
#       and before the DB unique index fires
#
# NOTE: The DB unique index (uix_products_name_business) enforces
#   LOWER(TRIM(prod_name)) uniqueness at the DB level.
#   The backend router does the explicit duplicate check BEFORE the INSERT/UPDATE
#   so the user gets a clean "A product with this name already exists." message
#   rather than a raw IntegrityError.

from pydantic import BaseModel, field_validator, model_validator, ConfigDict
from typing import Optional
from uuid import UUID
from decimal import Decimal
from app.schemas.validators import strip_and_escape_html


# ─────────────────────────────────────────────────────────────────────────────
# ProductCreate — used when creating a new product (POST /products/)
# ─────────────────────────────────────────────────────────────────────────────
class ProductCreate(BaseModel):
    category_id:          Optional[UUID]    = None
    prod_name:            str
    prod_sell_price:      Decimal
    prod_cost_price:      Decimal
    # MRP FEATURE: optional Maximum Retail Price.
    # None / not supplied → no MRP set (fine — existing products stay unchanged).
    # Must be >= 0 when supplied. Typical: prod_mrp >= prod_sell_price >= prod_cost_price.
    prod_mrp:             Optional[Decimal] = None
    prod_stock_qty:       Optional[int]     = 0
    prod_low_stock_alert: Optional[int]     = 10
    tax_rate:             Optional[Decimal] = Decimal("0")
    tax_code:             Optional[str]     = None
    barcode:              Optional[str]     = None
    unit:                 Optional[str]     = "pcs"

    # ── NEW: Trim and validate product name ───────────────────────────────────
    # Runs BEFORE any other check on prod_name.
    # Strips whitespace so " Laptop " is treated as "Laptop".
    # Raises if the name is blank after stripping (e.g. "   ").
    @field_validator("prod_name")
    @classmethod
    def strip_and_validate_name(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Product name cannot be blank")
        return strip_and_escape_html(v)

    @field_validator("barcode", "unit", "tax_code")
    @classmethod
    def sanitize_strings(cls, v):
        return strip_and_escape_html(v)

    # ── Price / qty guards ─────────────────────────────────────────────────────
    @field_validator("prod_sell_price", "prod_cost_price", "prod_mrp")
    @classmethod
    def must_be_positive(cls, v):
        if v is not None and v < 0:
            raise ValueError("Price cannot be negative")
        return v

    @field_validator("prod_stock_qty", "prod_low_stock_alert")
    @classmethod
    def must_be_non_negative(cls, v):
        if v is not None and v < 0:
            raise ValueError("Quantity cannot be negative")
        return v

    @model_validator(mode="after")
    def mrp_not_below_sell_price(self):
        if self.prod_mrp is not None and self.prod_sell_price is not None:
            if self.prod_mrp < self.prod_sell_price:
                raise ValueError("MRP cannot be less than the selling price")
        return self


# ─────────────────────────────────────────────────────────────────────────────
# ProductUpdate — used when editing an existing product (PUT /products/{id})
# All fields optional — only supplied fields are updated.
# ─────────────────────────────────────────────────────────────────────────────
class ProductUpdate(BaseModel):
    category_id:          Optional[UUID]    = None
    prod_name:            Optional[str]     = None
    prod_sell_price:      Optional[Decimal] = None
    prod_cost_price:      Optional[Decimal] = None
    prod_mrp:             Optional[Decimal] = None   # MRP FEATURE: pass null to clear MRP
    prod_low_stock_alert: Optional[int]     = None
    tax_rate:             Optional[Decimal] = None
    tax_code:             Optional[str]     = None
    barcode:              Optional[str]     = None
    unit:                 Optional[str]     = None

    # ── NEW: Trim and validate product name on update ─────────────────────────
    # Only runs when prod_name is actually supplied (not None).
    # Pydantic skips the validator when the field is None/omitted.
    @field_validator("prod_name")
    @classmethod
    def strip_and_validate_name(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            v = v.strip()
            if not v:
                raise ValueError("Product name cannot be blank")
            v = strip_and_escape_html(v)
        return v

    @field_validator("barcode", "unit", "tax_code")
    @classmethod
    def sanitize_strings(cls, v):
        return strip_and_escape_html(v)

    # ── Price guard ────────────────────────────────────────────────────────────
    @field_validator("prod_sell_price", "prod_cost_price", "prod_mrp")
    @classmethod
    def must_be_positive(cls, v):
        if v is not None and v < 0:
            raise ValueError("Price cannot be negative")
        return v

    @model_validator(mode="after")
    def mrp_not_below_sell_price(self):
        if self.prod_mrp is not None and self.prod_sell_price is not None:
            if self.prod_mrp < self.prod_sell_price:
                raise ValueError("MRP cannot be less than the selling price")
        return self


# ─────────────────────────────────────────────────────────────────────────────
# ProductOut — response shape (used for type hints; actual responses use
# row_to_dict() in the router for flexibility)
# ─────────────────────────────────────────────────────────────────────────────
class ProductOut(BaseModel):
    prod_id:              UUID
    business_id:          UUID
    category_id:          Optional[UUID]    = None
    prod_name:            str
    prod_sell_price:      Decimal
    prod_cost_price:      Decimal
    prod_mrp:             Optional[Decimal] = None   # MRP FEATURE
    prod_profit:          Optional[Decimal] = None
    prod_stock_qty:       int
    prod_low_stock_alert: int
    tax_rate:             Decimal
    tax_code:             Optional[str]     = None
    barcode:              Optional[str]     = None
    unit:                 Optional[str]     = None
    is_deleted:           bool
    prod_created_at:      Optional[str]     = None
    updated_at:           Optional[str]     = None

    model_config = ConfigDict(from_attributes=True)