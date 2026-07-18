from pydantic import BaseModel, EmailStr, field_validator, ConfigDict
from typing import Optional, Literal
from uuid import UUID
from datetime import datetime
from app.schemas.validators import strip_and_escape_html
import re

GSTIN_PATTERN = re.compile(
    r"^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$"
)


class BusinessCreate(BaseModel):
    business_name: str
    owner_name: str
    owner_email: EmailStr
    owner_password: str
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

    @field_validator("owner_name")
    @classmethod
    def sanitize_owner_name(cls, v: str) -> str:
        return strip_and_escape_html(v)

    @field_validator("owner_password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        import re
        if not re.search(r"[A-Z]", v):
            raise ValueError("Password must contain an uppercase letter")
        if not re.search(r"[a-z]", v):
            raise ValueError("Password must contain a lowercase letter")
        if not re.search(r"\d", v):
            raise ValueError("Password must contain a digit")
        return v

    @field_validator("gstin")
    @classmethod
    def validate_gstin(cls, v):
        if v is None:
            return v
        v = strip_and_escape_html(v).upper().replace(" ", "")
        if v and not GSTIN_PATTERN.match(v):
            raise ValueError(
                "Invalid GSTIN format. Expected format: 22AAAAA0000A1Z5"
            )
        return v

    @field_validator("business_phone")
    @classmethod
    def validate_phone(cls, v):
        if v is None:
            return v
        v = strip_and_escape_html(v)
        digits_only = re.sub(r"[\s\-\(\)\+]", "", v)
        if digits_only and (len(digits_only) < 7 or len(digits_only) > 15 or not digits_only.isdigit()):
            raise ValueError("Business phone must be 7-15 digits")
        return v

    @field_validator("business_address", "business_state", "business_country_code")
    @classmethod
    def sanitize_optional_strings(cls, v):
        return strip_and_escape_html(v)


class BusinessUpdate(BaseModel):
    business_name: Optional[str] = None
    business_phone: Optional[str] = None
    business_address: Optional[str] = None
    gstin: Optional[str] = None
    is_gst_registered: Optional[bool] = None

    @field_validator("business_name")
    @classmethod
    def sanitize_name(cls, v: Optional[str]) -> Optional[str]:
        return strip_and_escape_html(v)

    @field_validator("gstin")
    @classmethod
    def validate_gstin(cls, v):
        if v is None:
            return v
        v = strip_and_escape_html(v).upper().replace(" ", "")
        if v and not GSTIN_PATTERN.match(v):
            raise ValueError(
                "Invalid GSTIN format. Expected format: 22AAAAA0000A1Z5"
            )
        return v

    @field_validator("business_phone")
    @classmethod
    def validate_phone(cls, v):
        if v is None:
            return v
        v = strip_and_escape_html(v)
        digits_only = re.sub(r"[\s\-\(\)\+]", "", v)
        if digits_only and (len(digits_only) < 7 or len(digits_only) > 15 or not digits_only.isdigit()):
            raise ValueError("Business phone must be 7-15 digits")
        return v

    @field_validator("business_address")
    @classmethod
    def sanitize_optional_strings(cls, v):
        return strip_and_escape_html(v)


class BusinessResponse(BaseModel):
    business_id: UUID
    business_name: str
    business_email: Optional[str] = None
    business_phone: Optional[str] = None
    business_address: Optional[str] = None
    business_state: Optional[str] = None
    gstin: Optional[str] = None
    is_gst_registered: Optional[bool] = None
    created_at: Optional[datetime] = None
    business_country_code: Optional[str] = None
    subscription_type: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class BusinessRegistrationResponse(BaseModel):
    business_id: UUID
    business_name: str
    owner_email: str
    trial_end_at: datetime
    subscription_type: str = "trial"


class SubscriptionResponse(BaseModel):
    payment_status: str
    subscription_type: str
    subscription_start_at: Optional[datetime] = None
    subscription_end_at: Optional[datetime] = None
    trial_start_at: Optional[datetime] = None
    trial_end_at: Optional[datetime] = None
    is_active: bool
    days_remaining: Optional[int] = None
    is_expired: bool

    model_config = ConfigDict(from_attributes=True)


VALID_PAYMENT_STATUSES = ("pending", "paid", "suspended")
VALID_SUBSCRIPTION_TYPES = ("trial", "monthly", "annual", "lifetime")


class SubscriptionUpdate(BaseModel):
    payment_status: Optional[Literal["pending", "paid", "suspended"]] = None
    subscription_type: Optional[Literal["trial", "monthly", "annual", "lifetime"]] = None
    subscription_start_at: Optional[datetime] = None
    subscription_end_at: Optional[datetime] = None
    is_active: Optional[bool] = None

    @field_validator("subscription_end_at")
    @classmethod
    def end_at_required_for_paid(cls, v, info):
        return v
