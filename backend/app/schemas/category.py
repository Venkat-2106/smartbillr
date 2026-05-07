from pydantic import BaseModel
from typing import Optional
from uuid import UUID
from datetime import datetime

# Used when CREATING a new category
class CategoryCreate(BaseModel):
    category_name: str

# Used when UPDATING a category
class CategoryUpdate(BaseModel):
    category_name: Optional[str] = None

# Used when RETURNING category data in response
class CategoryResponse(BaseModel):
    category_id: UUID
    business_id: UUID
    category_name: str
    is_deleted: bool
    created_at: datetime

    class Config:
        from_attributes = True