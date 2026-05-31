from pydantic import BaseModel, UUID4, condecimal
from typing import Optional, List
from datetime import datetime


# ── Single item inside a purchase return request ──────────────────────────────
class PurchaseReturnItemCreate(BaseModel):
    product_id: UUID4
    return_qty: int
    refund_amount: condecimal(max_digits=10, decimal_places=2)  # refund per unit


# ── Request body when creating a purchase return ──────────────────────────────
class PurchaseReturnCreate(BaseModel):
    pur_id: UUID4
    return_reason: Optional[str] = None
    return_status: Optional[str] = "pending"   # user can set: pending / approved / rejected
    restock: bool = True
    refund_method: Optional[str] = "cash"
    items: List[PurchaseReturnItemCreate]


# ── Request body when updating a purchase return ──────────────────────────────
class PurchaseReturnUpdate(BaseModel):
    return_status: str                          # pending / approved / rejected
    restock: bool = True
    rejected_reason: Optional[str] = None


# ── Response for a single return item ─────────────────────────────────────────
class PurchaseReturnItemResponse(BaseModel):
    return_item_id: UUID4
    return_id: UUID4
    product_id: UUID4
    product_name: Optional[str] = None
    return_qty: int
    refund_amount: condecimal(max_digits=10, decimal_places=2)
    return_item_subtotal: Optional[condecimal(max_digits=10, decimal_places=2)] = None

    class Config:
        from_attributes = True


# ── Response for a full purchase return ───────────────────────────────────────
class PurchaseReturnResponse(BaseModel):
    return_id: UUID4
    business_id: UUID4
    pur_id: UUID4
    return_reason: Optional[str] = None
    return_status: str
    restock: bool
    stock_updated: bool
    refund_method: Optional[str] = None
    approved_by: Optional[UUID4] = None
    approved_at: Optional[datetime] = None
    rejected_reason: Optional[str] = None
    return_amount: Optional[float] = None
    return_created_at: datetime
    created_by: UUID4
    items: Optional[List[PurchaseReturnItemResponse]] = []

    class Config:
        from_attributes = True