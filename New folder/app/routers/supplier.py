# app/routers/supplier.py

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.database import get_db
from app.middleware.rbac import require_permission
from app.models.supplier import Supplier
from app.schemas.supplier import SupplierCreate, SupplierUpdate
from app.utils.response import success_response, error_response
from app.utils.pagination import paginate, pagination_response
from typing import Optional

router = APIRouter(prefix="/suppliers", tags=["Suppliers"])


# ─────────────────────────────────────────
# HELPER — Format supplier as dict
# WHY a helper: every endpoint returns the same fields.
# Writing it once here means if we add a column later,
# we update ONE place, not five.
# ─────────────────────────────────────────
def supplier_to_dict(s) -> dict:
    return {
        "supp_id":           str(s.supp_id),
        "business_id":       str(s.business_id),
        "supp_name":         s.supp_name,
        "supp_phone":        s.supp_phone,
        "supp_email":        s.supp_email,
        "supp_address":      s.supp_address,
        "supp_state":        s.supp_state,        # ← NEW
        "supp_country_code": s.supp_country_code,
        "supp_tax_number":   s.supp_tax_number,
        "is_deleted":        s.is_deleted,
        "supp_created_at":   str(s.supp_created_at) if s.supp_created_at else None
    }


# ══════════════════════════════════════════════════════════════════
# POST /suppliers → Create new supplier
# ══════════════════════════════════════════════════════════════════
@router.post("/")
def create_supplier(
    data:         SupplierCreate,
    current_user: dict = Depends(require_permission("suppliers.manage")),
    db:           Session = Depends(get_db)
):
    business_id = current_user["business_id"]

    # Block duplicate phone within same business
    if data.supp_phone:
        existing = db.query(Supplier).filter(
            Supplier.business_id == business_id,
            Supplier.supp_phone  == data.supp_phone,
            Supplier.is_deleted  == False
        ).first()
        if existing:
            return error_response("Supplier with this phone already exists", 400)

    new_supplier = Supplier(
        business_id       = business_id,
        supp_name         = data.supp_name,
        supp_phone        = data.supp_phone,
        supp_email        = data.supp_email,
        supp_address      = data.supp_address,
        supp_state        = data.supp_state,        # ← NEW
        supp_country_code = data.supp_country_code,
        supp_tax_number   = data.supp_tax_number
    )

    db.add(new_supplier)
    db.commit()
    db.refresh(new_supplier)

    return success_response({
        "message":  "Supplier created successfully",
        "supplier": supplier_to_dict(new_supplier)
    }, status_code=201)


# ══════════════════════════════════════════════════════════════════
# GET /suppliers → Get all suppliers (paginated)
# Also supports: GET /suppliers?phone=9876543210
#
# WHY phone search here and not a separate endpoint:
# The frontend search bar on the supplier list page types a phone
# number and needs instant lookup. Adding ?phone= as a filter on
# the existing list endpoint means:
#   - No extra route to maintain
#   - Pagination still works if there are multiple matches
#   - Works exactly the same way as the customer phone search
# ══════════════════════════════════════════════════════════════════
@router.get("/")
def get_all_suppliers(
    current_user: dict = Depends(require_permission("suppliers.manage")),
    db:           Session        = Depends(get_db),
    pagination:   dict           = Depends(paginate),
    phone:        Optional[str]  = Query(default=None, description="Search supplier by phone number")
):
    business_id = current_user["business_id"]

    # Base filter — always scoped to this business, never deleted
    base = db.query(Supplier).filter(
        Supplier.business_id == business_id,
        Supplier.is_deleted  == False
    )

    # If phone is provided, filter by exact phone match
    # WHY exact match and not LIKE:
    # Phone numbers are unique identifiers — a partial match would be
    # ambiguous and could return the wrong supplier. The user should
    # type the full number they are looking for.
    if phone:
        base = base.filter(Supplier.supp_phone == phone)

    total     = base.count()
    suppliers = base.order_by(Supplier.supp_name.asc())\
                    .offset(pagination["offset"])\
                    .limit(pagination["limit"])\
                    .all()

    return success_response(
        pagination_response(
            [supplier_to_dict(s) for s in suppliers],
            total,
            pagination["page"],
            pagination["limit"]
        )
    )


# ══════════════════════════════════════════════════════════════════
# GET /suppliers/search/phone?phone=9876543210
#
# WHY a dedicated search endpoint in addition to the list filter:
# The purchase creation form needs to do a quick lookup —
# "find supplier by phone, return their full profile in one call."
# This endpoint returns a single supplier object directly (not a list),
# which is simpler for the frontend to consume when auto-filling
# the supplier field in a purchase form.
# ══════════════════════════════════════════════════════════════════
@router.get("/search/phone")
def search_supplier_by_phone(
    phone:        str,
    current_user: dict = Depends(require_permission("suppliers.manage")),
    db:           Session = Depends(get_db)
):
    business_id = current_user["business_id"]

    if not phone or not phone.strip():
        return error_response("Phone number is required", 400)

    supplier = db.query(Supplier).filter(
        Supplier.business_id == business_id,
        Supplier.supp_phone  == phone.strip(),
        Supplier.is_deleted  == False
    ).first()

    if not supplier:
        return error_response(
            f"No supplier found with phone number '{phone}'", 404
        )

    return success_response(supplier_to_dict(supplier))


# ══════════════════════════════════════════════════════════════════
# GET /suppliers/{supp_id} → Get one supplier by ID
# ══════════════════════════════════════════════════════════════════
@router.get("/{supp_id}")
def get_supplier(
    supp_id:      str,
    current_user: dict = Depends(require_permission("suppliers.manage")),
    db:           Session = Depends(get_db)
):
    business_id = current_user["business_id"]

    supplier = db.query(Supplier).filter(
        Supplier.supp_id     == supp_id,
        Supplier.business_id == business_id,
        Supplier.is_deleted  == False
    ).first()

    if not supplier:
        return error_response("Supplier not found", 404)

    return success_response(supplier_to_dict(supplier))


# ══════════════════════════════════════════════════════════════════
# PUT /suppliers/{supp_id} → Update supplier
# ══════════════════════════════════════════════════════════════════
@router.put("/{supp_id}")
def update_supplier(
    supp_id:      str,
    data:         SupplierUpdate,
    current_user: dict = Depends(require_permission("suppliers.manage")),
    db:           Session = Depends(get_db)
):
    business_id = current_user["business_id"]

    supplier = db.query(Supplier).filter(
        Supplier.supp_id     == supp_id,
        Supplier.business_id == business_id,
        Supplier.is_deleted  == False
    ).first()

    if not supplier:
        return error_response("Supplier not found", 404)

    # Block duplicate phone (excluding this supplier's own current phone)
    if data.supp_phone:
        existing = db.query(Supplier).filter(
            Supplier.business_id == business_id,
            Supplier.supp_id     != supp_id,
            Supplier.supp_phone  == data.supp_phone,
            Supplier.is_deleted  == False
        ).first()
        if existing:
            return error_response("Supplier with this phone already exists", 400)

    # Only update fields that were actually sent in the request
    if data.supp_name         is not None: supplier.supp_name         = data.supp_name
    if data.supp_phone        is not None: supplier.supp_phone        = data.supp_phone
    if data.supp_email        is not None: supplier.supp_email        = data.supp_email
    if data.supp_address      is not None: supplier.supp_address      = data.supp_address
    if data.supp_state        is not None: supplier.supp_state        = data.supp_state   # ← NEW
    if data.supp_country_code is not None: supplier.supp_country_code = data.supp_country_code
    if data.supp_tax_number   is not None: supplier.supp_tax_number   = data.supp_tax_number

    db.commit()
    db.refresh(supplier)

    return success_response({
        "message":  "Supplier updated successfully",
        "supplier": supplier_to_dict(supplier)
    })


# ══════════════════════════════════════════════════════════════════
# DELETE /suppliers/{supp_id} → Soft delete
# ══════════════════════════════════════════════════════════════════
@router.delete("/{supp_id}")
def delete_supplier(
    supp_id:      str,
    current_user: dict = Depends(require_permission("suppliers.manage")),
    db:           Session = Depends(get_db)
):
    business_id = current_user["business_id"]

    supplier = db.query(Supplier).filter(
        Supplier.supp_id     == supp_id,
        Supplier.business_id == business_id,
        Supplier.is_deleted  == False
    ).first()

    if not supplier:
        return error_response("Supplier not found", 404)

    supplier.is_deleted = True
    db.commit()

    return success_response({"message": "Supplier deleted successfully"})