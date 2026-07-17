# app/schemas/supplier.py

from pydantic import BaseModel, EmailStr, field_validator, ConfigDict
from typing import Optional
from uuid import UUID
from datetime import datetime
from app.schemas.validators import strip_and_escape_html


# ── Used when CREATING a new supplier ────────────────────────────────────────
class SupplierCreate(BaseModel):
    supp_name:         str
    supp_phone:        Optional[str]      = None
    supp_email:        Optional[EmailStr] = None
    supp_address:      Optional[str]      = None
    supp_state:        Optional[str]      = None
    supp_country_code: Optional[str]      = None
    supp_tax_number:   Optional[str]      = None

    @field_validator('supp_email', mode='before')
    @classmethod
    def empty_email_to_none(cls, v):
        if v == '' or (isinstance(v, str) and not v.strip()):
            return None
        return v

    @field_validator("supp_name")
    @classmethod
    def sanitize_name(cls, v: str) -> str:
        v = strip_and_escape_html(v)
        if len(v) > 100:
            raise ValueError("Supplier name must not exceed 100 characters")
        return v

    @field_validator("supp_phone", "supp_address", "supp_state", "supp_country_code", "supp_tax_number")
    @classmethod
    def sanitize_optional_strings(cls, v):
        return strip_and_escape_html(v)


# ── Used when UPDATING an existing supplier ───────────────────────────────────
class SupplierUpdate(BaseModel):
    supp_name:         Optional[str]      = None
    supp_phone:        Optional[str]      = None
    supp_email:        Optional[EmailStr] = None
    supp_address:      Optional[str]      = None
    supp_state:        Optional[str]      = None
    supp_country_code: Optional[str]      = None
    supp_tax_number:   Optional[str]      = None

    @field_validator('supp_email', mode='before')
    @classmethod
    def empty_email_to_none(cls, v):
        if v == '' or (isinstance(v, str) and not v.strip()):
            return None
        return v

    @field_validator("supp_name")
    @classmethod
    def sanitize_name(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            v = strip_and_escape_html(v)
            if len(v) > 100:
                raise ValueError("Supplier name must not exceed 100 characters")
        return v

    @field_validator("supp_phone", "supp_address", "supp_state", "supp_country_code", "supp_tax_number")
    @classmethod
    def sanitize_optional_strings(cls, v):
        return strip_and_escape_html(v)


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

    model_config = ConfigDict(from_attributes=True)