# app/schemas/supplier.py

from pydantic import BaseModel, EmailStr, field_validator
from typing import Optional
from uuid import UUID
from datetime import datetime


# ── Used when CREATING a new supplier ────────────────────────────────────────
class SupplierCreate(BaseModel):
    supp_name:         str
    supp_phone:        Optional[str]      = None
    supp_email:        Optional[EmailStr] = None
    supp_address:      Optional[str]      = None
    supp_state:        Optional[str]      = None  # ← NEW: for GST interstate detection
    supp_country_code: Optional[str]      = None
    supp_tax_number:   Optional[str]      = None

    @field_validator('supp_email', mode='before')
    @classmethod
    def empty_email_to_none(cls, v):
        # Frontend sends "" for empty email; EmailStr rejects "".
        # Convert empty string → None so validation passes.
        if v == '' or (isinstance(v, str) and not v.strip()):
            return None
        return v


# ── Used when UPDATING an existing supplier ───────────────────────────────────
class SupplierUpdate(BaseModel):
    supp_name:         Optional[str]      = None
    supp_phone:        Optional[str]      = None
    supp_email:        Optional[EmailStr] = None
    supp_address:      Optional[str]      = None
    supp_state:        Optional[str]      = None  # ← NEW
    supp_country_code: Optional[str]      = None
    supp_tax_number:   Optional[str]      = None

    @field_validator('supp_email', mode='before')
    @classmethod
    def empty_email_to_none(cls, v):
        if v == '' or (isinstance(v, str) and not v.strip()):
            return None
        return v


# ── Used when RETURNING supplier data in response ─────────────────────────────
class SupplierOut(BaseModel):
    supp_id:           UUID
    business_id:       UUID
    supp_name:         str
    supp_phone:        Optional[str]      = None
    supp_email:        Optional[str]      = None
    supp_address:      Optional[str]      = None
    supp_state:        Optional[str]      = None  # ← NEW
    supp_country_code: Optional[str]      = None
    supp_tax_number:   Optional[str]      = None
    is_deleted:        bool
    supp_created_at:   Optional[datetime] = None

    class Config:
        from_attributes = True