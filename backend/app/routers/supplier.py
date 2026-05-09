from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.database import get_db
from app.middleware.auth import verify_token
from app.models.supplier import Supplier
from app.schemas.supplier import SupplierCreate, SupplierUpdate
from app.utils.response import success_response, error_response
from app.utils.pagination import paginate, pagination_response

router = APIRouter(prefix="/suppliers", tags=["Suppliers"])


# ─────────────────────────────────────────
# POST /suppliers → Create new supplier
# ─────────────────────────────────────────
@router.post("/")
def create_supplier(
    data: SupplierCreate,
    current_user: dict = Depends(verify_token),
    db: Session = Depends(get_db)
):
    business_id = current_user["business_id"]

    new_supplier = Supplier(
        business_id=business_id,
        supp_name=data.supp_name,
        supp_phone=data.supp_phone,
        supp_email=data.supp_email,
        supp_address=data.supp_address,
        supp_country_code=data.supp_country_code,
        supp_tax_number=data.supp_tax_number
    )

    db.add(new_supplier)
    db.commit()
    db.refresh(new_supplier)

    return success_response({
        "message": "Supplier created successfully",
        "supplier": {
            "supp_id": new_supplier.supp_id,
            "supp_name": new_supplier.supp_name,
            "supp_phone": new_supplier.supp_phone,
            "supp_email": new_supplier.supp_email,
            "supp_address": new_supplier.supp_address,
            "supp_country_code": new_supplier.supp_country_code,
            "supp_tax_number": new_supplier.supp_tax_number,
            "supp_created_at": new_supplier.supp_created_at
        }
    }, status_code=201)


# ─────────────────────────────────────────
# GET /suppliers → Get all suppliers
# ─────────────────────────────────────────
@router.get("/")
def get_all_suppliers(
    current_user: dict = Depends(verify_token),
    db: Session = Depends(get_db),
    pagination: dict = Depends(paginate)
):
    business_id = current_user["business_id"]

    total = db.query(func.count(Supplier.supp_id)).filter(
        Supplier.business_id == business_id,
        Supplier.is_deleted == False
    ).scalar()

    suppliers = db.query(Supplier).filter(
        Supplier.business_id == business_id,
        Supplier.is_deleted == False
    ).offset(pagination["offset"]).limit(pagination["limit"]).all()

    data = [
        {
            "supp_id": s.supp_id,
            "supp_name": s.supp_name,
            "supp_phone": s.supp_phone,
            "supp_email": s.supp_email,
            "supp_address": s.supp_address,
            "supp_country_code": s.supp_country_code,
            "supp_tax_number": s.supp_tax_number,
            "supp_created_at": s.supp_created_at
        }
        for s in suppliers
    ]

    return success_response(
        pagination_response(data, total, pagination["page"], pagination["limit"])
    )


# ─────────────────────────────────────────
# GET /suppliers/{supp_id} → Get one supplier
# ─────────────────────────────────────────
@router.get("/{supp_id}")
def get_supplier(
    supp_id: str,
    current_user: dict = Depends(verify_token),
    db: Session = Depends(get_db)
):
    business_id = current_user["business_id"]

    supplier = db.query(Supplier).filter(
        Supplier.supp_id == supp_id,
        Supplier.business_id == business_id,
        Supplier.is_deleted == False
    ).first()

    if not supplier:
        return error_response("Supplier not found", status_code=404)

    return success_response({
        "supp_id": supplier.supp_id,
        "supp_name": supplier.supp_name,
        "supp_phone": supplier.supp_phone,
        "supp_email": supplier.supp_email,
        "supp_address": supplier.supp_address,
        "supp_country_code": supplier.supp_country_code,
        "supp_tax_number": supplier.supp_tax_number,
        "supp_created_at": supplier.supp_created_at
    })


# ─────────────────────────────────────────
# PUT /suppliers/{supp_id} → Update supplier
# ─────────────────────────────────────────
@router.put("/{supp_id}")
def update_supplier(
    supp_id: str,
    data: SupplierUpdate,
    current_user: dict = Depends(verify_token),
    db: Session = Depends(get_db)
):
    business_id = current_user["business_id"]

    supplier = db.query(Supplier).filter(
        Supplier.supp_id == supp_id,
        Supplier.business_id == business_id,
        Supplier.is_deleted == False
    ).first()

    if not supplier:
        return error_response("Supplier not found", status_code=404)

    # Only update fields that were actually sent
    if data.supp_name is not None:
        supplier.supp_name = data.supp_name
    if data.supp_phone is not None:
        supplier.supp_phone = data.supp_phone
    if data.supp_email is not None:
        supplier.supp_email = data.supp_email
    if data.supp_address is not None:
        supplier.supp_address = data.supp_address
    if data.supp_country_code is not None:
        supplier.supp_country_code = data.supp_country_code
    if data.supp_tax_number is not None:
        supplier.supp_tax_number = data.supp_tax_number

    db.commit()
    db.refresh(supplier)

    return success_response({
        "message": "Supplier updated successfully",
        "supplier": {
            "supp_id": supplier.supp_id,
            "supp_name": supplier.supp_name,
            "supp_phone": supplier.supp_phone,
            "supp_email": supplier.supp_email,
            "supp_address": supplier.supp_address,
            "supp_country_code": supplier.supp_country_code,
            "supp_tax_number": supplier.supp_tax_number,
            "supp_created_at": supplier.supp_created_at
        }
    })


# ─────────────────────────────────────────
# DELETE /suppliers/{supp_id} → Soft delete
# ─────────────────────────────────────────
@router.delete("/{supp_id}")
def delete_supplier(
    supp_id: str,
    current_user: dict = Depends(verify_token),
    db: Session = Depends(get_db)
):
    business_id = current_user["business_id"]

    supplier = db.query(Supplier).filter(
        Supplier.supp_id == supp_id,
        Supplier.business_id == business_id,
        Supplier.is_deleted == False
    ).first()

    if not supplier:
        return error_response("Supplier not found", status_code=404)

    # Soft delete — never permanently remove!
    supplier.is_deleted = True
    db.commit()

    return success_response({
        "message": "Supplier deleted successfully"
    })