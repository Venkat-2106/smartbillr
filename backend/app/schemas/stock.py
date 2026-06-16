from pydantic import BaseModel, field_validator, ConfigDict
from typing import Optional
from uuid import UUID
from enum import Enum


# ─────────────────────────────────────────
# FIX 5 — Professional Stock Adjustment
#
# OLD design (not professional):
#   move_qty: int  →  user sends -5 to remove, +10 to add
#   Problem: negative numbers confuse staff, easy to make mistakes
#
# NEW design (professional):
#   adjustment_type: "add" | "remove" | "set"
#   qty: int  →  always a positive number
#
#   "add"    → stock increases by qty   (received new goods)
#   "remove" → stock decreases by qty   (damaged/lost/expired)
#   "set"    → stock is SET to exactly this value (physical count override)
#
# WHY "set"?
# Once a year, most businesses do a physical stock count and find the
# actual shelf count differs from the system. "set" lets them correct
# the system to the real number directly without calculating the diff.
# ─────────────────────────────────────────
class AdjustmentType(str, Enum):
    add    = "add"
    remove = "remove"
    set    = "set"


class StockAdjustment(BaseModel):
    product_id:       UUID
    adjustment_type:  AdjustmentType   # "add", "remove", or "set"
    qty:              int               # always a positive number
    move_notes:       Optional[str] = None

    @field_validator("qty")
    @classmethod
    def qty_must_be_positive(cls, v):
        if v <= 0:
            raise ValueError("qty must be a positive number greater than zero")
        return v


# ── Output schemas (unchanged) ───────────────────────────────
class StockMovementOut(BaseModel):
    move_id:               UUID
    business_id:           UUID
    product_id:            UUID
    move_type:             str
    move_qty:              int
    move_prev_stock:       int
    move_new_stock:        Optional[int] = None
    sale_reference_id:     Optional[UUID] = None
    purchase_reference_id: Optional[UUID] = None
    reference_type:        Optional[str] = None
    reference_id:          Optional[UUID] = None
    move_notes:            Optional[str] = None
    move_created_at:       Optional[str] = None
    move_created_by:       Optional[UUID] = None

    model_config = ConfigDict(from_attributes=True)


class LowStockAlertOut(BaseModel):
    alert_id:        UUID
    business_id:     UUID
    product_id:      UUID
    alert_stock_qty: int
    alert_threshold: int
    alert_status:    str
    alert_created_at: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class CurrentStockOut(BaseModel):
    prod_id:             UUID
    prod_name:           str
    prod_stock_qty:      int
    prod_low_stock_alert: int
    unit:                Optional[str] = None
    is_low_stock:        bool

    model_config = ConfigDict(from_attributes=True)