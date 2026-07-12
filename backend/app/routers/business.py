from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import Optional
from app.database import get_db
from app.middleware.rbac import require_permission_with_rls, set_rls_gucs_after_commit
from app.utils.response import success_response, error_response
from app.utils.pagination import paginate, pagination_response
from app.schemas.business import BusinessCreate, BusinessUpdate, BusinessResponse
from app.models.business import Business
from app.utils.timestamp import fmt_ts
import uuid

router = APIRouter(
    prefix="/v1/businesses",
    tags=["Businesses"]
)

# ─── GET MY BUSINESS ───────────────────────────────────────────
@router.get("/me")
def get_my_business(
    current_user: dict = Depends(require_permission_with_rls("dashboard.view")),
    db: Session = Depends(get_db)
):
    business = db.query(Business).filter(
        Business.business_id == current_user["business_id"],
        Business.is_deleted == False
    ).first()

    if not business:
        return error_response("Business not found", 404)

    return success_response(BusinessResponse.from_orm(business).dict())


# ─── UPDATE MY BUSINESS ────────────────────────────────────────
@router.put("/me")
def update_my_business(
    payload: BusinessUpdate,
    current_user: dict = Depends(require_permission_with_rls("settings.manage")),
    db: Session = Depends(get_db)
):
    business = db.query(Business).filter(
        Business.business_id == current_user["business_id"],
        Business.is_deleted == False
    ).first()

    if not business:
        return error_response("Business not found", 404)

    # Only update fields that were actually sent
    update_data = payload.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(business, field, value)

    db.commit()
    set_rls_gucs_after_commit(db, current_user)
    db.refresh(business)

    return success_response(BusinessResponse.from_orm(business).dict())


# ─── GET ALL STAFF OF MY BUSINESS ──────────────────────────────
@router.get("/staff")
def get_staff(
    current_user: dict = Depends(require_permission_with_rls("settings.manage")),
    db: Session = Depends(get_db),
    pagination: dict = Depends(paginate),
    search: Optional[str] = Query(default=None),
    is_active: Optional[bool] = Query(default=None),
):
    business_id = current_user["business_id"]

    extra_where = ""
    params = {"business_id": business_id}

    if search and search.strip():
        extra_where += " AND (full_name ILIKE :search OR email ILIKE :search)"
        params["search"] = f"%{search.strip()}%"

    if is_active is not None:
        extra_where += " AND is_active = :is_active"
        params["is_active"] = is_active

    count_sql = f"SELECT COUNT(*) FROM profiles WHERE business_id = :business_id {extra_where}"
    total = db.execute(text(count_sql), params).scalar() or 0

    params["offset"] = pagination["offset"]
    params["limit"] = pagination["limit"]

    list_sql = f"""
        SELECT id, full_name, email, role, is_active, created_at
        FROM profiles
        WHERE business_id = :business_id {extra_where}
        ORDER BY created_at ASC
        OFFSET :offset LIMIT :limit
    """
    rows = db.execute(text(list_sql), params).fetchall()
    staff_list = [{"id": str(r.id), "full_name": r.full_name, "role": r.role,
                   "is_active": r.is_active, "created_at": fmt_ts(r.created_at)} for r in rows]

    return success_response(pagination_response(staff_list, total, pagination["page"], pagination["limit"], capped=pagination["_capped"]))