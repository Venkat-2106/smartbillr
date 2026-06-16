from pydantic import BaseModel, EmailStr, ConfigDict
from typing import Optional
from uuid import UUID
from datetime import datetime


class BusinessCreate(BaseModel):
    business_name: str
    business_email: Optional[EmailStr] = None  # FIX: nullable in DB
    business_phone: Optional[str] = None
    business_address: Optional[str] = None
    business_state: Optional[str] = None
    gstin: Optional[str] = None
    is_gst_registered: Optional[bool] = False
    business_country_code: Optional[str] = None  # FIX: added missing field


class BusinessUpdate(BaseModel):
    business_name: Optional[str] = None
    business_email: Optional[EmailStr] = None
    business_phone: Optional[str] = None
    business_address: Optional[str] = None
    business_state: Optional[str] = None
    gstin: Optional[str] = None
    is_gst_registered: Optional[bool] = None
    business_country_code: Optional[str] = None  # FIX: added missing field


class BusinessResponse(BaseModel):
    business_id: UUID
    business_name: str
    business_email: Optional[str] = None  # FIX: nullable in DB
    business_phone: Optional[str] = None
    business_address: Optional[str] = None
    business_state: Optional[str] = None
    gstin: Optional[str] = None
    is_gst_registered: Optional[bool] = None
    created_at: Optional[datetime] = None
    # FIX: Added missing field — needed for tax logic in purchases
    business_country_code: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)
