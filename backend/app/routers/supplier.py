# app/routers/supplier.py

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, text
from app.database import get_db
from app.middleware.rbac import require_permission
from app.models.supplier import Supplier
from app.schemas.supplier import SupplierCreate, SupplierUpdate
from app.utils.response import success_response, error_response
from app.utils.pagination import paginate, pagination_response
from app.utils.timestamp import fmt_ts
from typing import Optional

router = APIRouter(prefix="/suppliers", tags=["Suppliers"])


# ─────────────────────────────────────────
# HELPER — Format supplier as dict
# Accepts optional last_updated_by name string (resolved by caller via JOIN).
# WHY a helper: every endpoint returns the same fields.
# Writing it once here means if we add a column later,
# we update ONE place, not five.
# ─────────────────────────────────────────
def supplier_to_dict(s, last_updated_by=None) -> dict:
    return {
        "supp_id":           str(s.supp_id),
        "business_id":       str(s.business_id),
        "supp_name":         s.supp_name,
        "supp_phone":        s.supp_phone,
        "supp_email":        s.supp_email,
        "supp_address":      s.supp_address,
        "supp_state":        s.supp_state,
        "supp_country_code": s.supp_country_code,
        "supp_tax_number":   s.supp_tax_number,
        "is_deleted":        s.is_deleted,
        "supp_created_at":   fmt_ts(s.supp_created_at),
        # DB trigger trg_suppliers_updated_at auto-sets updated_at on every UPDATE.
        # We never set updated_at manually in Python — the trigger handles it.
        "updated_at":        fmt_ts(s.updated_at),
        "updated_by":        str(s.updated_by) if s.updated_by else None,
        "last_updated_by":   last_updated_by,
    }


# ══════════════════════════════════════════════════════════════════
# POST /suppliers → Create new supplier
# Sets updated_by = current_user["user_id"] so we track who created.
# Fetches creator name to return last_updated_by immediately.
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
        supp_state        = data.supp_state,
        supp_country_code = data.supp_country_code,
        supp_tax_number   = data.supp_tax_number,
        updated_by        = current_user["user_id"]   # Track who created this supplier
    )

    db.add(new_supplier)
    db.commit()
    db.refresh(new_supplier)

    # Fetch the creator's name so the table shows it immediately after creation
    creator_name = db.execute(
        text("SELECT full_name FROM profiles WHERE id = CAST(:uid AS uuid)"),
        {"uid": str(current_user["user_id"])}
    ).scalar()

    return success_response({
        "message":  "Supplier created successfully",
        "supplier": supplier_to_dict(new_supplier, last_updated_by=creator_name)
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
#
# NEW: Batch-resolves last_updated_by names via LEFT JOIN to profiles.
# No N+1 — one SQL query returns all names at once.
# ══════════════════════════════════════════════════════════════════
@router.get("/")
def get_all_suppliers(
    current_user: dict = Depends(require_permission("suppliers.manage")),
    db:           Session        = Depends(get_db),
    pagination:   dict           = Depends(paginate),
    phone:        Optional[str]  = Query(default=None, description="Search supplier by phone number")
):
    business_id = current_user["business_id"]

    # Count total (for pagination) — ORM is fine for the count query
    base = db.query(Supplier).filter(
        Supplier.business_id == business_id,
        Supplier.is_deleted  == False
    )
    if phone:
        base = base.filter(Supplier.supp_phone == phone)

    total = base.count()

    # Use raw SQL for the list so we can LEFT JOIN profiles in one query
    # and resolve last_updated_by names without an N+1 loop.
    phone_clause = ""
    params: dict = {
        "bid":    str(business_id),
        "offset": pagination["offset"],
        "limit":  pagination["limit"],
    }
    if phone:
        phone_clause = "AND s.supp_phone = :phone"
        params["phone"] = phone

    rows = db.execute(
        text(f"""
            SELECT
                s.supp_id, s.business_id,
                s.supp_name, s.supp_phone, s.supp_email,
                s.supp_address, s.supp_state, s.supp_country_code,
                s.supp_tax_number, s.is_deleted,
                s.supp_created_at, s.updated_at, s.updated_by,
                p.full_name AS last_updated_by
            FROM suppliers s
            LEFT JOIN profiles p ON p.id = s.updated_by
            WHERE s.business_id = CAST(:bid AS uuid)
              AND s.is_deleted   = false
              {phone_clause}
            ORDER BY s.updated_at DESC
            OFFSET :offset LIMIT :limit
        """),
        params
    ).fetchall()

    data = [
        {
            "supp_id":           str(r.supp_id),
            "business_id":       str(r.business_id),
            "supp_name":         r.supp_name,
            "supp_phone":        r.supp_phone,
            "supp_email":        r.supp_email,
            "supp_address":      r.supp_address,
            "supp_state":        r.supp_state,
            "supp_country_code": r.supp_country_code,
            "supp_tax_number":   r.supp_tax_number,
            "is_deleted":        r.is_deleted,
            "supp_created_at":   fmt_ts(r.supp_created_at),
            "updated_at":        fmt_ts(r.updated_at),
            "updated_by":        str(r.updated_by)       if r.updated_by       else None,
            "last_updated_by":   r.last_updated_by       if r.last_updated_by  else None,
        }
        for r in rows
    ]

    return success_response(
        pagination_response(data, total, pagination["page"], pagination["limit"])
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
# Sets updated_by = current_user["user_id"]
# DB trigger auto-sets updated_at on commit (never set it manually)
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
    if data.supp_state        is not None: supplier.supp_state        = data.supp_state
    if data.supp_country_code is not None: supplier.supp_country_code = data.supp_country_code
    if data.supp_tax_number   is not None: supplier.supp_tax_number   = data.supp_tax_number

    # Track who last updated this supplier
    # updated_at is set automatically by DB trigger trg_suppliers_updated_at
    supplier.updated_by = current_user["user_id"]

    db.commit()
    db.refresh(supplier)

    # Fetch the updater's name to return in response
    updated_by_name = db.execute(
        text("SELECT full_name FROM profiles WHERE id = CAST(:uid AS uuid)"),
        {"uid": str(supplier.updated_by)}
    ).scalar()

    return success_response({
        "message":  "Supplier updated successfully",
        "supplier": supplier_to_dict(supplier, last_updated_by=updated_by_name)
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