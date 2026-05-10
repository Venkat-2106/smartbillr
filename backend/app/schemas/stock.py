from pydantic import BaseModel, field_validator
from typing import Optional
from uuid import UUID
from decimal import Decimal


# ─────────────────────────────────────────
# Stock Movement schemas
# ─────────────────────────────────────────

class StockAdjustment(BaseModel):
    product_id: UUID
    move_qty: int
    move_notes: Optional[str] = None

    @field_validator("move_qty")
    @classmethod
    def qty_cannot_be_zero(cls, v):
        if v == 0:
            raise ValueError("Adjustment quantity cannot be zero")
        return v


class StockMovementOut(BaseModel):
    move_id: UUID
    business_id: UUID
    product_id: UUID
    move_type: str
    move_qty: int
    move_prev_stock: int
    move_new_stock: Optional[int] = None
    sale_reference_id: Optional[UUID] = None
    purchase_reference_id: Optional[UUID] = None
    move_notes: Optional[str] = None
    move_created_at: Optional[str] = None
    move_created_by: Optional[UUID] = None

    class Config:
        from_attributes = True


# ─────────────────────────────────────────
# Low Stock Alert schemas
# ─────────────────────────────────────────

class LowStockAlertOut(BaseModel):
    alert_id: UUID
    business_id: UUID
    product_id: UUID
    alert_stock_qty: int
    alert_threshold: int
    alert_status: str
    alert_created_at: Optional[str] = None

    class Config:
        from_attributes = True


# ─────────────────────────────────────────
# Current Stock schema
# ─────────────────────────────────────────

class CurrentStockOut(BaseModel):
    prod_id: UUID
    prod_name: str
    prod_stock_qty: int
    prod_low_stock_alert: int
    unit: Optional[str] = None
    is_low_stock: bool

    class Config:
        from_attributes = True