# app/routers/superadmin.py
#
# Platform-level super admin routes — manage all businesses, subscriptions,
# and tenant lifecycle. No business_id in the token; all targets come from
# path parameters.
#
# SECURITY:
#   All routes use Depends(verify_super_admin_with_rls_async) which authenticates via JWT
#   + super_admins table lookup. It does NOT query profiles, does NOT carry
#   a business_id, and does NOT pass require_permission() checks.
#
#   SubscriptionMiddleware excludes /v1/superadmin/* paths.

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from datetime import datetime, timezone
from typing import Optional

from app.database import get_async_db
from app.middleware.auth import clear_user_cache, clear_business_users_cache
from app.middleware.rbac import verify_super_admin_with_rls_async
from app.middleware.subscription import clear_subscription_business_cache
from app.utils.response import success_response, error_response
from app.schemas.business import SubscriptionUpdate, VALID_PAYMENT_STATUSES, VALID_SUBSCRIPTION_TYPES

router = APIRouter(prefix="/v1/superadmin", tags=["Super Admin"])

SORTABLE_WHITELIST = {
    "created_at",
    "business_name",
    "subscription_type",
    "payment_status",
    "is_active",
}


def _parse_dt(val):
    if val is None:
        return None
    if isinstance(val, datetime):
        return val
    if isinstance(val, str):
        for fmt in ("%Y-%m-%d %H:%M:%S.%f", "%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S.%f", "%Y-%m-%dT%H:%M:%S"):
            try:
                return datetime.strptime(val, fmt).replace(tzinfo=timezone.utc)
            except ValueError:
                continue
    return val


# ─── POST /superadmin/logout — Logout with revocation ───────────────────────

@router.post("/logout")
async def super_admin_logout(
    current_user: dict = Depends(verify_super_admin_with_rls_async),
    db: AsyncSession = Depends(get_async_db),
):
    user_id = current_user["user_id"]
    now = datetime.now(timezone.utc)
    await db.execute(
        text("UPDATE super_admins SET last_logout_at = :now WHERE user_id = :uid"),
        {"now": now, "uid": user_id},
    )
    await db.commit()
    clear_user_cache(user_id)
    return success_response({"message": "Logged out successfully"})


# ─── GET /superadmin/businesses — List all businesses (paginated, sortable) ──

@router.get("/businesses")
async def list_businesses(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=1000),
    sort_by: str = Query(default="created_at"),
    sort_order: str = Query(default="desc", pattern="^(asc|desc)$"),
    search: Optional[str] = Query(default=None),
    current_user: dict = Depends(verify_super_admin_with_rls_async),
    db: AsyncSession = Depends(get_async_db),
):
    if sort_by not in SORTABLE_WHITELIST:
        return error_response(f"Invalid sort_by. Allowed: {', '.join(sorted(SORTABLE_WHITELIST))}", 400)

    safe_sort_col = sort_by
    safe_sort_dir = "DESC" if sort_order == "desc" else "ASC"

    params = {}
    where_clauses = ["(b.is_deleted = false OR b.is_deleted IS NULL)"]

    if search and search.strip():
        where_clauses.append("b.business_name ILIKE :search")
        params["search"] = f"%{search.strip()}%"

    where_sql = " AND ".join(where_clauses)

    count_sql = f"SELECT COUNT(*) FROM businesses b WHERE {where_sql}"
    total = (await db.execute(text(count_sql), params)).scalar() or 0

    offset = (page - 1) * limit
    params["offset"] = offset
    params["limit"] = limit

    list_sql = f"""
        SELECT
            b.business_id,
            b.business_name,
            b.business_email,
            b.payment_status,
            b.subscription_type,
            b.subscription_start_at,
            b.subscription_end_at,
            b.trial_start_at,
            b.trial_end_at,
            b.is_active,
            b.created_at
        FROM businesses b
        WHERE {where_sql}
        ORDER BY b.{safe_sort_col} {safe_sort_dir}
        OFFSET :offset LIMIT :limit
    """
    rows = (await db.execute(text(list_sql), params)).fetchall()

    items = []
    for row in rows:
        items.append({
            "business_id": str(row.business_id),
            "business_name": row.business_name,
            "business_email": row.business_email,
            "payment_status": row.payment_status,
            "subscription_type": row.subscription_type,
            "subscription_start_at": _parse_dt(row.subscription_start_at).isoformat() if _parse_dt(row.subscription_start_at) else None,
            "subscription_end_at": _parse_dt(row.subscription_end_at).isoformat() if _parse_dt(row.subscription_end_at) else None,
            "trial_start_at": _parse_dt(row.trial_start_at).isoformat() if _parse_dt(row.trial_start_at) else None,
            "trial_end_at": _parse_dt(row.trial_end_at).isoformat() if _parse_dt(row.trial_end_at) else None,
            "is_active": bool(row.is_active),
            "created_at": _parse_dt(row.created_at).isoformat() if _parse_dt(row.created_at) else None,
        })

    total_pages = (total + limit - 1) // limit
    return success_response({
        "items": items,
        "pagination": {
            "total": total,
            "page": page,
            "limit": limit,
            "total_pages": total_pages,
            "has_next": page < total_pages,
            "has_prev": page > 1,
        },
    })


# ─── GET /superadmin/businesses/{id} — Single business detail w/ owner ───────

@router.get("/businesses/{business_id}")
async def get_business(
    business_id: str,
    current_user: dict = Depends(verify_super_admin_with_rls_async),
    db: AsyncSession = Depends(get_async_db),
):
    row = (await db.execute(
        text("""
            SELECT
                b.business_id,
                b.business_name,
                b.business_email,
                b.business_phone,
                b.business_address,
                b.business_state,
                b.gstin,
                b.is_gst_registered,
                b.business_country_code,
                b.payment_status,
                b.subscription_type,
                b.subscription_start_at,
                b.subscription_end_at,
                b.trial_start_at,
                b.trial_end_at,
                b.is_active,
                b.created_at,
                p.id AS owner_id,
                p.full_name AS owner_name,
                p.email AS owner_email,
                p.role AS owner_role
            FROM businesses b
            LEFT JOIN profiles p ON p.business_id = b.business_id AND p.role = 'admin'
            WHERE b.business_id = :bid
              AND (b.is_deleted = false OR b.is_deleted IS NULL)
            LIMIT 1
        """),
        {"bid": business_id},
    )).fetchone()

    if not row:
        return error_response("Business not found", 404)

    return success_response({
        "business_id": str(row.business_id),
        "business_name": row.business_name,
        "business_email": row.business_email,
        "business_phone": row.business_phone,
        "business_address": row.business_address,
        "business_state": row.business_state,
        "gstin": row.gstin,
        "is_gst_registered": bool(row.is_gst_registered) if row.is_gst_registered else False,
        "business_country_code": row.business_country_code,
        "payment_status": row.payment_status,
        "subscription_type": row.subscription_type,
        "subscription_start_at": _parse_dt(row.subscription_start_at).isoformat() if _parse_dt(row.subscription_start_at) else None,
        "subscription_end_at": _parse_dt(row.subscription_end_at).isoformat() if _parse_dt(row.subscription_end_at) else None,
        "trial_start_at": _parse_dt(row.trial_start_at).isoformat() if _parse_dt(row.trial_start_at) else None,
        "trial_end_at": _parse_dt(row.trial_end_at).isoformat() if _parse_dt(row.trial_end_at) else None,
        "is_active": bool(row.is_active),
        "created_at": _parse_dt(row.created_at).isoformat() if _parse_dt(row.created_at) else None,
        "owner": {
            "id": str(row.owner_id) if row.owner_id else None,
            "full_name": row.owner_name,
            "email": row.owner_email,
            "role": row.owner_role,
        } if row.owner_id else None,
    })


# ─── PATCH /superadmin/businesses/{id}/subscription — Change plan/tier ───────

@router.patch("/businesses/{business_id}/subscription")
async def update_business_subscription(
    business_id: str,
    payload: SubscriptionUpdate,
    current_user: dict = Depends(verify_super_admin_with_rls_async),
    db: AsyncSession = Depends(get_async_db),
):
    existing = (await db.execute(
        text("SELECT business_id FROM businesses WHERE business_id = :bid AND (is_deleted = false OR is_deleted IS NULL) LIMIT 1"),
        {"bid": business_id},
    )).fetchone()

    if not existing:
        return error_response("Business not found", 404)

    ALLOWED_COLUMNS = {"payment_status", "subscription_type", "subscription_start_at",
                       "subscription_end_at", "is_active"}

    update_data = payload.model_dump(exclude_unset=True)
    if not update_data:
        return error_response("No fields to update", 400)

    invalid = set(update_data.keys()) - ALLOWED_COLUMNS
    if invalid:
        return error_response(f"Invalid fields: {invalid}", 400)

    set_clause = ", ".join(f"{k} = :{k}" for k in update_data)
    update_data["bid"] = business_id

    try:
        await db.execute(
            text(f"UPDATE businesses SET {set_clause} WHERE business_id = :bid AND (is_deleted = false OR is_deleted IS NULL)"),
            update_data,
        )
        await db.commit()
    except Exception as e:
        await db.rollback()
        import logging
        logging.exception(e)
        return error_response("Failed to update subscription", 500)

    return success_response({"message": "Subscription updated successfully"})


# ─── PATCH /superadmin/businesses/{id}/status — Suspend / reactivate ────────

class StatusUpdate:
    def __init__(self, is_active: bool):
        self.is_active = is_active


@router.patch("/businesses/{business_id}/status")
async def update_business_status(
    business_id: str,
    is_active: bool = Query(..., description="true = activate, false = suspend"),
    current_user: dict = Depends(verify_super_admin_with_rls_async),
    db: AsyncSession = Depends(get_async_db),
):
    existing = (await db.execute(
        text("SELECT business_id, is_active FROM businesses WHERE business_id = :bid AND (is_deleted = false OR is_deleted IS NULL) LIMIT 1"),
        {"bid": business_id},
    )).fetchone()

    if not existing:
        return error_response("Business not found", 404)

    try:
        await db.execute(
            text("UPDATE businesses SET is_active = :active WHERE business_id = :bid"),
            {"active": is_active, "bid": business_id},
        )
        await db.commit()
    except Exception as e:
        await db.rollback()
        import logging
        logging.exception(e)
        return error_response("Failed to update business status", 500)

    clear_business_users_cache(business_id)
    clear_subscription_business_cache(business_id)

    action = "activated" if is_active else "suspended"
    return success_response({"message": f"Business {action} successfully"})
