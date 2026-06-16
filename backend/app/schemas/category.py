from pydantic import BaseModel, ConfigDict
from typing import Optional
from uuid import UUID
from datetime import datetime

class CategoryCreate(BaseModel):
    category_name: str

class CategoryUpdate(BaseModel):
    category_name: Optional[str] = None

class CategoryResponse(BaseModel):
    category_id: UUID
    business_id: Optional[UUID] = None
    category_name: str
    is_deleted: bool
    # FIX: was required datetime, DB default hasn't fired yet on fresh ORM object
    created_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)