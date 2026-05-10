from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.database import get_db
from app.middleware.auth import verify_token
from app.models.customer import Customer
from app.schemas.customer import CustomerCreate, CustomerUpdate
from app.utils.response import success_response, error_response
from app.utils.pagination import paginate, pagination_response

router = APIRouter(prefix="/customers", tags=["Customers"])


# ─────────────────────────────────────────
# HELPER: Format customer as dict
# ─────────────────────────────────────────
def customer_to_dict(c):
    return {
        "cust_id": str(c.cust_id),
        "business_id": str(c.business_id),
        "cust_name": c.cust_name,
        "cust_phone": c.cust_phone,
        "cust_email": c.cust_email,
        "cust_address": c.cust_address,
        "cust_state": c.cust_state,
        "cust_country_code": c.cust_country_code,
        "cust_tax_number": c.cust_tax_number,
        "is_deleted": c.is_deleted,
        "cust_created_at": str(c.cust_created_at) if c.cust_created_at else None
    }


# ─────────────────────────────────────────
# POST /customers → Create new customer
# ─────────────────────────────────────────
@router.post("/")
def create_customer(
    data: CustomerCreate,
    current_user: dict = Depends(verify_token),
    db: Session = Depends(get_db)
):
    business_id = current_user["business_id"]

    # Check duplicate phone within same business
    if data.cust_phone:
        existing = db.query(Customer).filter(
            Customer.business_id == business_id,
            Customer.cust_phone == data.cust_phone,
            Customer.is_deleted == False
        ).first()
        if existing:
            return error_response(
                "Customer with this phone already exists",
                status_code=400
            )

    new_customer = Customer(
        business_id=business_id,
        cust_name=data.cust_name,
        cust_phone=data.cust_phone,
        cust_email=data.cust_email,
        cust_address=data.cust_address,
        cust_state=data.cust_state,
        cust_country_code=data.cust_country_code,
        cust_tax_number=data.cust_tax_number
    )

    db.add(new_customer)
    db.commit()
    db.refresh(new_customer)

    return success_response({
        "message": "Customer created successfully",
        "customer": customer_to_dict(new_customer)
    }, status_code=201)


# ─────────────────────────────────────────
# GET /customers → Get all customers
# ─────────────────────────────────────────
@router.get("/")
def get_all_customers(
    current_user: dict = Depends(verify_token),
    db: Session = Depends(get_db),
    pagination: dict = Depends(paginate)
):
    business_id = current_user["business_id"]

    total = db.query(func.count(Customer.cust_id)).filter(
        Customer.business_id == business_id,
        Customer.is_deleted == False
    ).scalar()

    customers = db.query(Customer).filter(
        Customer.business_id == business_id,
        Customer.is_deleted == False
    ).offset(pagination["offset"]).limit(pagination["limit"]).all()

    return success_response(
        pagination_response(
            [customer_to_dict(c) for c in customers],
            total,
            pagination["page"],
            pagination["limit"]
        )
    )


# ─────────────────────────────────────────
# GET /customers/{cust_id} → Get one customer
# ─────────────────────────────────────────
@router.get("/{cust_id}")
def get_customer(
    cust_id: str,
    current_user: dict = Depends(verify_token),
    db: Session = Depends(get_db)
):
    business_id = current_user["business_id"]

    customer = db.query(Customer).filter(
        Customer.cust_id == cust_id,
        Customer.business_id == business_id,
        Customer.is_deleted == False
    ).first()

    if not customer:
        return error_response("Customer not found", status_code=404)

    return success_response(customer_to_dict(customer))


# ─────────────────────────────────────────
# PUT /customers/{cust_id} → Update customer
# ─────────────────────────────────────────
@router.put("/{cust_id}")
def update_customer(
    cust_id: str,
    data: CustomerUpdate,
    current_user: dict = Depends(verify_token),
    db: Session = Depends(get_db)
):
    business_id = current_user["business_id"]

    # Find customer first
    customer = db.query(Customer).filter(
        Customer.cust_id == cust_id,
        Customer.business_id == business_id,
        Customer.is_deleted == False
    ).first()

    if not customer:
        return error_response("Customer not found", status_code=404)

    # Update only fields that were sent
    if data.cust_name is not None:
        customer.cust_name = data.cust_name
    if data.cust_phone is not None:
        customer.cust_phone = data.cust_phone
    if data.cust_email is not None:
        customer.cust_email = data.cust_email
    if data.cust_address is not None:
        customer.cust_address = data.cust_address
    if data.cust_state is not None:
        customer.cust_state = data.cust_state
    if data.cust_country_code is not None:
        customer.cust_country_code = data.cust_country_code
    if data.cust_tax_number is not None:
        customer.cust_tax_number = data.cust_tax_number

    db.commit()
    db.refresh(customer)

    return success_response({
        "message": "Customer updated successfully",
        "customer": customer_to_dict(customer)
    })


# ─────────────────────────────────────────
# DELETE /customers/{cust_id} → Soft delete
# ─────────────────────────────────────────
@router.delete("/{cust_id}")
def delete_customer(
    cust_id: str,
    current_user: dict = Depends(verify_token),
    db: Session = Depends(get_db)
):
    business_id = current_user["business_id"]

    customer = db.query(Customer).filter(
        Customer.cust_id == cust_id,
        Customer.business_id == business_id,
        Customer.is_deleted == False
    ).first()

    if not customer:
        return error_response("Customer not found", status_code=404)

    customer.is_deleted = True
    db.commit()

    return success_response({
        "message": "Customer deleted successfully"
    })