from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.database import get_db
from app.middleware.auth import verify_token
from app.utils.response import success_response, error_response
from app.utils.pagination import paginate, pagination_response
from app.schemas.customer import CustomerCreate, CustomerUpdate, CustomerResponse
from app.models.customer import Customer
import uuid

router = APIRouter(
    prefix="/customers",
    tags=["Customers"]
)

# ─── CREATE CUSTOMER ───────────────────────────────────────────
@router.post("/")
def create_customer(
    payload: CustomerCreate,
    current_user: dict = Depends(verify_token),
    db: Session = Depends(get_db)
):
    # Check if customer with same phone already exists
    if payload.cust_phone:
        existing = db.query(Customer).filter(
            Customer.business_id == current_user["business_id"],
            Customer.cust_phone == payload.cust_phone,
            Customer.is_deleted == False
        ).first()
        if existing:
            return error_response("Customer with this phone already exists", 400)

    new_customer = Customer(
        cust_id=uuid.uuid4(),
        business_id=current_user["business_id"],
        cust_name=payload.cust_name,
        cust_phone=payload.cust_phone,
        cust_email=payload.cust_email,
        cust_tax_number=payload.cust_tax_number,
        cust_address=payload.cust_address
    )

    db.add(new_customer)
    db.commit()
    db.refresh(new_customer)

    return success_response(CustomerResponse.from_orm(new_customer).dict(), 201)


# ─── GET ALL CUSTOMERS ─────────────────────────────────────────
@router.get("/")
def get_customers(
    current_user: dict = Depends(verify_token),
    pagination: dict = Depends(paginate),
    db: Session = Depends(get_db)
):
    base_query = db.query(Customer).filter(
        Customer.business_id == current_user["business_id"],
        Customer.is_deleted == False
    )

    total = base_query.count()
    customers = base_query.offset(pagination["offset"]).limit(pagination["limit"]).all()

    data = [CustomerResponse.from_orm(c).dict() for c in customers]

    return success_response(
        pagination_response(
            data=data,
            total=total,
            page=pagination["page"],
            limit=pagination["limit"]
        )
    )


# ─── GET ONE CUSTOMER ──────────────────────────────────────────
@router.get("/{cust_id}")
def get_customer(
    cust_id: str,
    current_user: dict = Depends(verify_token),
    db: Session = Depends(get_db)
):
    customer = db.query(Customer).filter(
        Customer.cust_id == cust_id,
        Customer.business_id == current_user["business_id"],
        Customer.is_deleted == False
    ).first()

    if not customer:
        return error_response("Customer not found", 404)

    return success_response(CustomerResponse.from_orm(customer).dict())


# ─── UPDATE CUSTOMER ───────────────────────────────────────────
@router.put("/{cust_id}")
def update_customer(
    cust_id: str,
    payload: CustomerUpdate,
    current_user: dict = Depends(verify_token),
    db: Session = Depends(get_db)
):
    customer = db.query(Customer).filter(
        Customer.cust_id == cust_id,
        Customer.business_id == current_user["business_id"],
        Customer.is_deleted == False
    ).first()

    if not customer:
        return error_response("Customer not found", 404)

    update_data = payload.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(customer, field, value)

    db.commit()
    db.refresh(customer)

    return success_response(CustomerResponse.from_orm(customer).dict())


# ─── DELETE CUSTOMER (SOFT) ────────────────────────────────────
@router.delete("/{cust_id}")
def delete_customer(
    cust_id: str,
    current_user: dict = Depends(verify_token),
    db: Session = Depends(get_db)
):
    customer = db.query(Customer).filter(
        Customer.cust_id == cust_id,
        Customer.business_id == current_user["business_id"],
        Customer.is_deleted == False
    ).first()

    if not customer:
        return error_response("Customer not found", 404)

    customer.is_deleted = True
    db.commit()

    return success_response({"message": "Customer deleted successfully"})