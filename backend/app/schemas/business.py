from pydantic import BaseModel, EmailStr
from typing import Optional
from uuid import UUID
from datetime import datetime

# Used when CREATING a new business
class BusinessCreate(BaseModel):
    business_name: str
    business_email: EmailStr
    business_phone: Optional[str] = None
    business_address: Optional[str] = None
    business_state: Optional[str] = None
    gstin: Optional[str] = None
    is_gst_registered: Optional[bool] = False

# Used when UPDATING a business
class BusinessUpdate(BaseModel):
    business_name: Optional[str] = None
    business_email: Optional[EmailStr] = None
    business_phone: Optional[str] = None
    business_address: Optional[str] = None
    business_state: Optional[str] = None
    gstin: Optional[str] = None
    is_gst_registered: Optional[bool] = None

# Used when RETURNING business data in response
class BusinessResponse(BaseModel):
    business_id: UUID
    business_name: str
    business_email: str
    business_phone: Optional[str]
    business_address: Optional[str]
    business_state: Optional[str]
    gstin: Optional[str]
    is_gst_registered: bool
    created_at: datetime

    class Config:
        from_attributes = True