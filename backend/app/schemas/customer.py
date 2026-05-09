from pydantic import BaseModel, EmailStr
from typing import Optional
from uuid import UUID
from datetime import datetime

# Used when CREATING a new customer
class CustomerCreate(BaseModel):
    cust_name: str
    cust_phone: Optional[str] = None
    cust_email: Optional[EmailStr] = None
    cust_tax_number: Optional[str] = None
    cust_address: Optional[str] = None

# Used when UPDATING a customer
class CustomerUpdate(BaseModel):
    cust_name: Optional[str] = None
    cust_phone: Optional[str] = None
    cust_email: Optional[EmailStr] = None
    cust_tax_number: Optional[str] = None
    cust_address: Optional[str] = None

# Used when RETURNING customer data in response
class CustomerResponse(BaseModel):
    cust_id: UUID
    business_id: UUID
    cust_name: str
    cust_phone: Optional[str]
    cust_email: Optional[str]
    cust_tax_number: Optional[str]
    cust_address: Optional[str]
    is_deleted: bool
    cust_created_at: datetime

    class Config:
        from_attributes = True