from pydantic import BaseModel, EmailStr
from typing import Optional
from uuid import UUID
from datetime import datetime

# --- Used when CREATING a new supplier ---
class SupplierCreate(BaseModel):
    supp_name: str
    supp_phone: Optional[str] = None
    supp_email: Optional[EmailStr] = None
    supp_address: Optional[str] = None
    supp_country_code: Optional[str] = None
    supp_tax_number: Optional[str] = None

# --- Used when UPDATING an existing supplier ---
class SupplierUpdate(BaseModel):
    supp_name: Optional[str] = None
    supp_phone: Optional[str] = None
    supp_email: Optional[EmailStr] = None
    supp_address: Optional[str] = None
    supp_country_code: Optional[str] = None
    supp_tax_number: Optional[str] = None

# --- Used when RETURNING supplier data in response ---
class SupplierOut(BaseModel):
    supp_id: UUID
    business_id: UUID
    supp_name: str
    supp_phone: Optional[str] = None
    supp_email: Optional[str] = None
    supp_address: Optional[str] = None
    supp_country_code: Optional[str] = None
    supp_tax_number: Optional[str] = None
    is_deleted: bool
    supp_created_at: Optional[datetime] = None

    class Config:
        from_attributes = True