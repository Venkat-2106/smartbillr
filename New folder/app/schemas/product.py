from pydantic import BaseModel, field_validator
from typing import Optional
from uuid import UUID
from decimal import Decimal

# --- Used when CREATING a new product ---
class ProductCreate(BaseModel):
    category_id: Optional[UUID] = None
    prod_name: str
    prod_sell_price: Decimal
    prod_cost_price: Decimal
    prod_stock_qty: Optional[int] = 0
    prod_low_stock_alert: Optional[int] = 10
    tax_rate: Optional[Decimal] = Decimal("0")
    tax_code: Optional[str] = None
    barcode: Optional[str] = None
    unit: Optional[str] = "pcs"

    @field_validator("prod_sell_price", "prod_cost_price")
    @classmethod
    def must_be_positive(cls, v):
        if v < 0:
            raise ValueError("Price cannot be negative")
        return v

    @field_validator("prod_stock_qty", "prod_low_stock_alert")
    @classmethod
    def must_be_non_negative(cls, v):
        if v is not None and v < 0:
            raise ValueError("Quantity cannot be negative")
        return v


# --- Used when UPDATING an existing product ---
class ProductUpdate(BaseModel):
    category_id: Optional[UUID] = None
    prod_name: Optional[str] = None
    prod_sell_price: Optional[Decimal] = None
    prod_cost_price: Optional[Decimal] = None
    prod_low_stock_alert: Optional[int] = None
    tax_rate: Optional[Decimal] = None
    tax_code: Optional[str] = None
    barcode: Optional[str] = None
    unit: Optional[str] = None

    @field_validator("prod_sell_price", "prod_cost_price")
    @classmethod
    def must_be_positive(cls, v):
        if v is not None and v < 0:
            raise ValueError("Price cannot be negative")
        return v


# --- Used when RETURNING product data in response ---
class ProductOut(BaseModel):
    prod_id: UUID
    business_id: UUID
    category_id: Optional[UUID] = None
    prod_name: str
    prod_sell_price: Decimal
    prod_cost_price: Decimal
    prod_profit: Optional[Decimal] = None
    prod_stock_qty: int
    prod_low_stock_alert: int
    tax_rate: Decimal
    tax_code: Optional[str] = None
    barcode: Optional[str] = None
    unit: Optional[str] = None
    is_deleted: bool
    prod_created_at: Optional[str] = None
    updated_at: Optional[str] = None

    class Config:
        from_attributes = True