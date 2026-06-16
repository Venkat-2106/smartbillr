from pydantic import BaseModel, EmailStr, field_validator, ConfigDict
from typing import Optional
from uuid import UUID
from datetime import datetime

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