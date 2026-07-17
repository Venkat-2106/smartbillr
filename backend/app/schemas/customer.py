from pydantic import BaseModel, EmailStr, field_validator, ConfigDict
from typing import Optional
from uuid import UUID
from datetime import datetime
from app.schemas.validators import strip_and_escape_html


class CustomerCreate(BaseModel):
    cust_name: str
    cust_phone: Optional[str] = None
    cust_email: Optional[EmailStr] = None
    cust_address: Optional[str] = None
    cust_state: Optional[str] = None        # ← ADD THIS
    cust_country_code: Optional[str] = None
    cust_tax_number: Optional[str] = None

    @field_validator('cust_email', mode='before')
    @classmethod
    def empty_email_to_none(cls, v):
        if v == '' or (isinstance(v, str) and not v.strip()):
            return None
        return v

    @field_validator("cust_name")
    @classmethod
    def sanitize_name(cls, v: str) -> str:
        if len(v) > 100:
            raise ValueError("Customer name must not exceed 100 characters")
        return strip_and_escape_html(v)

    @field_validator("cust_phone", "cust_address", "cust_state", "cust_country_code", "cust_tax_number")
    @classmethod
    def sanitize_optional_strings(cls, v):
        return strip_and_escape_html(v)


class CustomerUpdate(BaseModel):
    cust_name: Optional[str] = None
    cust_phone: Optional[str] = None
    cust_email: Optional[EmailStr] = None
    cust_address: Optional[str] = None
    cust_state: Optional[str] = None        # ← ADD THIS
    cust_country_code: Optional[str] = None
    cust_tax_number: Optional[str] = None

    @field_validator('cust_email', mode='before')
    @classmethod
    def empty_email_to_none(cls, v):
        if v == '' or (isinstance(v, str) and not v.strip()):
            return None
        return v

    @field_validator("cust_name")
    @classmethod
    def sanitize_name(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and len(v) > 100:
            raise ValueError("Customer name must not exceed 100 characters")
        return strip_and_escape_html(v)

    @field_validator("cust_phone", "cust_address", "cust_state", "cust_country_code", "cust_tax_number")
    @classmethod
    def sanitize_optional_strings(cls, v):
        return strip_and_escape_html(v)

class CustomerOut(BaseModel):
    cust_id: UUID
    business_id: UUID
    cust_name: str
    cust_phone: Optional[str] = None
    cust_email: Optional[str] = None
    cust_address: Optional[str] = None
    cust_state: Optional[str] = None        # ← ADD THIS
    cust_country_code: Optional[str] = None
    cust_tax_number: Optional[str] = None
    is_deleted: bool
    cust_created_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)