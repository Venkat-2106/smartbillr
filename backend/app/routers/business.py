from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, text
from typing import Optional
from app.database import get_async_db
from app.middleware.rbac import require_permission, async_set_rls_gucs_after_commit
from app.utils.response import success_response, error_response
from app.utils.pagination import paginate_async, pagination_response
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
async def get_my_business(
    current_user: dict = Depends(require_permission("dashboard.view")),
    db: AsyncSession = Depends(get_async_db)
):
    result = await db.execute(
        select(Business).where(
            Business.business_id == current_user["business_id"],
            Business.is_deleted == False
        )
    )
    business = result.scalar_one_or_none()

    if not business:
        return error_response("Business not found", 404)

    return success_response(BusinessResponse.from_orm(business).dict())


# ─── UPDATE MY BUSINESS ────────────────────────────────────────
@router.put("/me")
async def update_my_business(
    payload: BusinessUpdate,
    current_user: dict = Depends(require_permission("settings.manage")),
    db: AsyncSession = Depends(get_async_db)
):
    result = await db.execute(
        select(Business).where(
            Business.business_id == current_user["business_id"],
            Business.is_deleted == False
        )
    )
    business = result.scalar_one_or_none()

    if not business:
        return error_response("Business not found", 404)

    # ── FIX 3: Validate GST registration consistency ──
    # Prevent toggling is_gst_registered=true for non-Indian businesses
    # or when GSTIN is empty (the backend is the source of truth for business_country_code).
    update_data = payload.dict(exclude_unset=True)
    new_is_gst = update_data.get("is_gst_registered")
    new_gstin  = update_data.get("gstin")
    effective_country = business.business_country_code or "IN"
    effective_gst_registered = new_is_gst if new_is_gst is not None else (business.is_gst_registered or False)
    effective_gstin = new_gstin if new_gstin is not None else (business.gstin or "")

    if effective_gst_registered:
        if effective_country != "IN":
            return error_response("GST registration is only available for Indian businesses.", 400)
        if not effective_gstin:
            return error_response("GSTIN is required when GST registration is enabled.", 400)

    for field, value in update_data.items():
        setattr(business, field, value)

    await db.commit()
    await async_set_rls_gucs_after_commit(db, current_user)
    await db.refresh(business)

    return success_response(BusinessResponse.from_orm(business).dict())


# ─── GET ALL STAFF OF MY BUSINESS ──────────────────────────────
@router.get("/staff")
async def get_staff(
    current_user: dict = Depends(require_permission("settings.manage")),
    db: AsyncSession = Depends(get_async_db),
    pagination: dict = Depends(paginate_async),
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
    total = (await db.execute(text(count_sql), params)).scalar() or 0

    params["offset"] = pagination["offset"]
    params["limit"] = pagination["limit"]

    list_sql = f"""
        SELECT id, full_name, email, role, is_active, created_at
        FROM profiles
        WHERE business_id = :business_id {extra_where}
        ORDER BY created_at ASC
        OFFSET :offset LIMIT :limit
    """
    rows = (await db.execute(text(list_sql), params)).fetchall()
    staff_list = [{"id": str(r.id), "full_name": r.full_name, "role": r.role,
                   "is_active": r.is_active, "created_at": fmt_ts(r.created_at)} for r in rows]

    return success_response(pagination_response(staff_list, total, pagination["page"], pagination["limit"], capped=pagination["_capped"]))


# ─── DELETE MY BUSINESS (soft-delete) ──────────────────────────
@router.delete("/me")
async def delete_my_business(
    current_user: dict = Depends(require_permission("settings.manage")),
    db: AsyncSession = Depends(get_async_db)
):
    business_id = current_user["business_id"]

    biz = (await db.execute(
        select(Business).where(
            Business.business_id == business_id,
            Business.is_deleted == False
        )
    )).scalar_one_or_none()

    if not biz:
        return error_response("Business not found", 404)

    try:
        # 1. Soft-delete the business itself
        biz.is_deleted = True

        # 2. Soft-delete all child rows that carry is_deleted
        await db.execute(
            text("UPDATE categories SET is_deleted = true WHERE business_id = CAST(:bid AS uuid) AND is_deleted = false"),
            {"bid": business_id}
        )
        await db.execute(
            text("UPDATE customers   SET is_deleted = true WHERE business_id = CAST(:bid AS uuid) AND is_deleted = false"),
            {"bid": business_id}
        )
        await db.execute(
            text("UPDATE expenses    SET is_deleted = true WHERE business_id = CAST(:bid AS uuid) AND is_deleted = false"),
            {"bid": business_id}
        )
        await db.execute(
            text("UPDATE products    SET is_deleted = true WHERE business_id = CAST(:bid AS uuid) AND is_deleted = false"),
            {"bid": business_id}
        )
        await db.execute(
            text("UPDATE purchases   SET is_deleted = true WHERE business_id = CAST(:bid AS uuid) AND is_deleted = false"),
            {"bid": business_id}
        )
        await db.execute(
            text("UPDATE sales       SET is_deleted = true WHERE business_id = CAST(:bid AS uuid) AND is_deleted = false"),
            {"bid": business_id}
        )
        await db.execute(
            text("UPDATE suppliers   SET is_deleted = true WHERE business_id = CAST(:bid AS uuid) AND is_deleted = false"),
            {"bid": business_id}
        )

        # 3. Deactivate all staff profiles (is_active column — no is_deleted)
        await db.execute(
            text("UPDATE profiles SET is_active = false WHERE business_id = CAST(:bid AS uuid) AND is_active = true"),
            {"bid": business_id}
        )

        await db.commit()
        await async_set_rls_gucs_after_commit(db, current_user)

        return success_response({"message": "Business deleted successfully"})

    except Exception as e:
        await db.rollback()
        return error_response("An unexpected error occurred. Please try again.", status_code=500)