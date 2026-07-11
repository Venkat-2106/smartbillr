from pydantic import BaseModel, ConfigDict
from typing import Optional
from uuid import UUID
from datetime import datetime


class PlanOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    plan_id: UUID
    plan_code: str
    display_name: str
    billing_cycle: str
    price_inr: Optional[float] = None
    price_usd: Optional[float] = None
    feature_limits: dict
    sort_order: int


class CheckoutRequest(BaseModel):
    plan_code: str
    billing_cycle: Optional[str] = None


class CheckoutResponse(BaseModel):
    provider: str
    payment_id: str
    razorpay_order_id: Optional[str] = None
    razorpay_key_id: Optional[str] = None
    amount: Optional[int] = None
    currency: Optional[str] = None
    checkout_url: Optional[str] = None


class ChangePlanRequest(BaseModel):
    plan_code: str


class CancelSubscriptionRequest(BaseModel):
    reason: Optional[str] = None
