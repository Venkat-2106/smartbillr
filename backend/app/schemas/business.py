from pydantic import BaseModel, EmailStr, field_validator, ConfigDict
from typing import Optional
from uuid import UUID
from datetime import datetime
from app.schemas.validators import strip_and_escape_html


class BusinessCreate(BaseModel):
    business_name: str
    business_email: Optional[EmailStr] = None
    business_phone: Optional[str] = None
    business_address: Optional[str] = None
    business_state: Optional[str] = None
    gstin: Optional[str] = None
    is_gst_registered: Optional[bool] = False
    business_country_code: Optional[str] = None

    @field_validator("business_name")
    @classmethod
    def sanitize_name(cls, v: str) -> str:
        return strip_and_escape_html(v)

    @field_validator("business_phone", "business_address", "business_state", "gstin", "business_country_code")
    @classmethod
    def sanitize_optional_strings(cls, v):
        return strip_and_escape_html(v)


class BusinessUpdate(BaseModel):
    business_name: Optional[str] = None
    business_email: Optional[EmailStr] = None
    business_phone: Optional[str] = None
    business_address: Optional[str] = None
    business_state: Optional[str] = None
    gstin: Optional[str] = None
    is_gst_registered: Optional[bool] = None
    business_country_code: Optional[str] = None

    @field_validator("business_name")
    @classmethod
    def sanitize_name(cls, v: Optional[str]) -> Optional[str]:
        return strip_and_escape_html(v)

    @field_validator("business_phone", "business_address", "business_state", "gstin", "business_country_code")
    @classmethod
    def sanitize_optional_strings(cls, v):
        return strip_and_escape_html(v)


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
