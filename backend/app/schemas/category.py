from pydantic import BaseModel, field_validator, ConfigDict
from typing import Optional
from uuid import UUID
from datetime import datetime
from app.schemas.validators import strip_and_escape_html

class CategoryCreate(BaseModel):
    category_name: str

    @field_validator("category_name")
    @classmethod
    def sanitize_name(cls, v: str) -> str:
        v = strip_and_escape_html(v)
        if len(v) > 50:
            raise ValueError("Category name must not exceed 50 characters")
        return v

class CategoryUpdate(BaseModel):
    category_name: Optional[str] = None

    @field_validator("category_name")
    @classmethod
    def sanitize_name(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            v = strip_and_escape_html(v)
            if len(v) > 50:
                raise ValueError("Category name must not exceed 50 characters")
        return v

class CategoryResponse(BaseModel):
    category_id: UUID
    business_id: Optional[UUID] = None
    category_name: str
    is_deleted: bool
    # FIX: was required datetime, DB default hasn't fired yet on fresh ORM object
    created_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)