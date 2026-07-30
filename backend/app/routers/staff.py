# app/routers/staff.py
#
# Staff management API — admin only (requires staff.manage permission).
#
# Uses SUPABASE_SERVICE_ROLE_KEY to call Supabase Auth Admin API
# to create real Supabase Auth users for each new staff/manager.
#
# Flow for creating a staff member:
#   1. Admin POSTs full_name, email, password, role
#   2. Backend calls Supabase Auth Admin API → creates auth.users row
#   3. Backend gets back the new auth user id
#   4. Backend inserts into profiles with that id as profiles.id
#   5. Returns the new profile

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from pydantic import BaseModel, EmailStr, field_validator
from typing import Optional
import httpx
import os
import re

from app.database import get_async_db
from app.middleware.rbac import require_permission
from app.middleware.auth import clear_user_cache
from app.utils.response import success_response, error_response
from app.utils.pagination import paginate_async, pagination_response
from app.utils.timestamp import fmt_ts
from app.utils.staff_limits import get_staff_limits
import logging

router = APIRouter(prefix="/v1/staff", tags=["Staff"])

SUPABASE_URL             = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY     = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

VALID_ROLES = {"admin", "manager", "staff"}

MIN_PASSWORD_LENGTH = 8


# ── Schemas ───────────────────────────────────────────────────────────────────

class CreateStaffRequest(BaseModel):
    full_name: str
    email:     EmailStr
    password:  str
    role:      str

    @field_validator("password")
    @classmethod
    def password_strength(cls, v):
        if len(v) < MIN_PASSWORD_LENGTH:
            raise ValueError(f"Password must be at least {MIN_PASSWORD_LENGTH} characters")
        if not re.search(r"[A-Z]", v):
            raise ValueError("Password must contain an uppercase letter")
        if not re.search(r"[a-z]", v):
            raise ValueError("Password must contain a lowercase letter")
        if not re.search(r"\d", v):
            raise ValueError("Password must contain a digit")
        return v


class UpdateStaffRequest(BaseModel):
    full_name: Optional[str] = None
    role:      Optional[str] = None
    is_active: Optional[bool] = None


# ── Helpers ───────────────────────────────────────────────────────────────────

def get_supabase_admin_headers():
    """Headers for Supabase Auth Admin API calls."""
    return {
        "apikey":        SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
        "Content-Type":  "application/json",
    }


async def create_supabase_auth_user(email: str, password: str, full_name: str) -> dict:
    """
    Call Supabase Auth Admin API to create a new auth user.
    Returns the created user dict including id.
    Raises ValueError on failure.
    """
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        raise ValueError("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing in .env")

    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{SUPABASE_URL}/auth/v1/admin/users",
            headers=get_supabase_admin_headers(),
            json={
                "email":            email,
                "password":         password,
                "email_confirm":    True,        # skip email verification for staff
                "user_metadata":    {"full_name": full_name},
            },
            timeout=10,
        )

    if response.status_code not in (200, 201):
        detail = response.json().get("message") or response.text
        raise ValueError(f"Supabase Auth error: {detail}")

    return response.json()


async def delete_supabase_auth_user(auth_user_id: str):
    """
    Delete a Supabase Auth user by id.
    Called on rollback if profile insert fails after auth user creation.
    """
    async with httpx.AsyncClient() as client:
        await client.delete(
            f"{SUPABASE_URL}/auth/v1/admin/users/{auth_user_id}",
            headers=get_supabase_admin_headers(),
            timeout=10,
        )


# ── POST /staff — Create new staff/manager account ───────────────────────────

@router.post("")
async def create_staff(
    body:         CreateStaffRequest,
    current_user: dict    = Depends(require_permission("staff.manage")),
    db:           AsyncSession = Depends(get_async_db),
):
    business_id = current_user["business_id"]

    # Validate role
    if body.role not in VALID_ROLES:
        return error_response(f"Invalid role. Must be one of: {', '.join(VALID_ROLES)}", 400)

    # Prevent creating another admin (only one admin per business)
    if body.role == "admin":
        existing_admin = (await db.execute(
            text("""
                SELECT id FROM profiles
                WHERE business_id = :business_id
                  AND role = 'admin'
                  AND is_active = true
                LIMIT 1
            """),
            {"business_id": business_id}
        )).fetchone()
        if existing_admin:
            return error_response("A business can only have one admin account", 400)

    # Check email not already used in this business
    existing = (await db.execute(
        text("""
            SELECT id FROM profiles
            WHERE LOWER(email) = LOWER(:email)
              AND business_id = :business_id
        """),
        {"email": body.email, "business_id": business_id}
    )).fetchone()
    if existing:
        return error_response("This email is already registered in your business", 400)

    # ── Subscription tier limit check ────────────────────────────────────
    if body.role in ("staff", "manager"):
        biz_row = (await db.execute(
            text("""
                SELECT subscription_type
                FROM businesses
                WHERE business_id = CAST(:bid AS uuid)
                  AND (is_deleted = false OR is_deleted IS NULL)
                LIMIT 1
            """),
            {"bid": str(business_id)}
        )).fetchone()

        if not biz_row:
            return error_response("Business not found", 404)

        subscription_type = biz_row.subscription_type
        limits = get_staff_limits(subscription_type)
        role_limit = limits.get(body.role)

        if role_limit is not None and role_limit == 0:
            return error_response(
                f"Your {subscription_type.capitalize()} plan does not allow creating {body.role} accounts. "
                f"Upgrade your subscription to add team members.",
                status_code=403,
            )

        if role_limit is not None:
            current_count = (await db.execute(
                text("""
                    SELECT COUNT(*) FROM profiles
                    WHERE business_id = CAST(:bid AS uuid)
                      AND role = :role
                      AND is_active = true
                """),
                {"bid": str(business_id), "role": body.role}
            )).scalar() or 0

            if current_count >= role_limit:
                upgrade_tier = "Pro" if subscription_type == "basic" else "a higher plan"
                return error_response(
                    f"Your {subscription_type.capitalize()} plan allows a maximum of {role_limit} "
                    f"{'staff member' if role_limit == 1 else 'staff members'} "
                    f"with the role '{body.role}'. "
                    f"Upgrade to {upgrade_tier} for unlimited team members.",
                    status_code=403,
                )
    # ── End of tier limit check ──────────────────────────────────────────

    # Step 1: Create Supabase Auth user
    try:
        auth_user = await create_supabase_auth_user(body.email, body.password, body.full_name)
    except ValueError as e:
        logging.exception(e)
        return error_response("An unexpected error occurred. Please try again.", status_code=400)

    auth_user_id = auth_user["id"]

    # Step 2: Insert into profiles using auth user id as profiles.id
    try:
        role_row = (await db.execute(
            text("SELECT id FROM roles WHERE name = :role LIMIT 1"),
            {"role": body.role}
        )).fetchone()

        if not role_row:
            await delete_supabase_auth_user(auth_user_id)
            return error_response(f"Role '{body.role}' not found in roles table", 500)

        await db.execute(
            text("""
                INSERT INTO profiles (id, business_id, full_name, email, role, role_id, is_active)
                VALUES (:id, :business_id, :full_name, :email, :role, :role_id, true)
            """),
            {
                "id":          auth_user_id,
                "business_id": business_id,
                "full_name":   body.full_name,
                "email":       body.email,
                "role":        body.role,
                "role_id":     role_row.id,
            }
        )
        await db.commit()

    except Exception as e:
        await db.rollback()
        # Rollback: delete the Supabase auth user we just created
        await delete_supabase_auth_user(auth_user_id)
        logging.exception(e)
        return error_response("An unexpected error occurred. Please try again.", status_code=500)

    return success_response({
        "id":          auth_user_id,
        "full_name":   body.full_name,
        "email":       body.email,
        "role":        body.role,
        "business_id": business_id,
        "is_active":   True,
    }, status_code=201)


# ── GET /staff — List all staff in this business (paginated) ──────────────────

@router.get("")
async def list_staff(
    current_user: dict    = Depends(require_permission("staff.manage")),
    db:           AsyncSession = Depends(get_async_db),
    pagination:   dict    = Depends(paginate_async),
    search:       Optional[str] = Query(default=None),
    is_active:    Optional[bool] = Query(default=None),
):
    business_id = current_user["business_id"]

    extra_where = ""
    params = {"business_id": business_id}

    if search and search.strip():
        extra_where += " AND (p.full_name ILIKE :search OR p.email ILIKE :search)"
        params["search"] = f"%{search.strip()}%"

    if is_active is not None:
        extra_where += " AND p.is_active = :is_active"
        params["is_active"] = is_active

    count_sql = f"""
        SELECT COUNT(p.id)
        FROM profiles p
        WHERE p.business_id = :business_id
        {extra_where}
    """
    total = (await db.execute(text(count_sql), params)).scalar() or 0

    params["offset"] = pagination["offset"]
    params["limit"] = pagination["limit"]

    list_sql = f"""
        SELECT
            p.id,
            p.full_name,
            p.email,
            p.role,
            p.is_active,
            p.created_at,
            r.name AS role_name
        FROM profiles p
        LEFT JOIN roles r ON r.id = p.role_id
        WHERE p.business_id = :business_id
        {extra_where}
        ORDER BY p.created_at ASC
        OFFSET :offset LIMIT :limit
    """
    rows = (await db.execute(text(list_sql), params)).fetchall()

    staff_list = [
        {
            "id":         str(row.id),
            "full_name":  row.full_name,
            "email":      row.email,
            "role":       row.role_name or row.role,
            "is_active":  row.is_active,
            "created_at": fmt_ts(row.created_at),
        }
        for row in rows
    ]

    return success_response(
        pagination_response(staff_list, total, pagination["page"], pagination["limit"], capped=pagination["_capped"])
    )


# ── GET /staff/summary → KPI cards for staff page ───────────────────
@router.get("/summary")
async def get_staff_summary_kpi(
    current_user: dict = Depends(require_permission("staff.manage")),
    db: AsyncSession = Depends(get_async_db)
):
    bid = current_user["business_id"]

    biz_row = (await db.execute(
        text("SELECT subscription_type FROM businesses WHERE business_id = CAST(:bid AS uuid) LIMIT 1"),
        {"bid": bid}
    )).fetchone()

    subscription_type = biz_row.subscription_type if biz_row else "trial"
    limits = get_staff_limits(subscription_type)

    counts = (await db.execute(text("""
        SELECT
            COUNT(*)                                    AS total_count,
            COUNT(*) FILTER (WHERE is_active = true)   AS active_count,
            COUNT(*) FILTER (WHERE role = 'staff'  AND is_active = true) AS staff_count,
            COUNT(*) FILTER (WHERE role = 'manager' AND is_active = true) AS manager_count
        FROM profiles
        WHERE business_id = CAST(:bid AS uuid)
    """), {"bid": bid})).fetchone()

    return success_response({
        "total_count":     int(counts.total_count),
        "active_count":    int(counts.active_count),
        "staff_count":     int(counts.staff_count),
        "manager_count":   int(counts.manager_count),
        "subscription_type": subscription_type,
        "limits": {
            "staff":   limits["staff"],
            "manager": limits["manager"],
        },
    })


# ── PATCH /staff/{id} — Update staff name, role, or active status ─────────────

@router.patch("/{staff_id}")
async def update_staff(
    staff_id:     str,
    body:         UpdateStaffRequest,
    current_user: dict    = Depends(require_permission("staff.manage")),
    db:           AsyncSession = Depends(get_async_db),
):
    business_id = current_user["business_id"]

    # Cannot edit yourself
    if staff_id == current_user["user_id"]:
        return error_response("You cannot edit your own account from here", 400)

    # Confirm staff belongs to this business
    existing = (await db.execute(
        text("""
            SELECT id, role FROM profiles
            WHERE id = :id AND business_id = :business_id
        """),
        {"id": staff_id, "business_id": business_id}
    )).fetchone()

    if not existing:
        return error_response("Staff member not found", 404)

    # Build update fields
    updates = {}
    if body.full_name is not None:
        updates["full_name"] = body.full_name
    if body.is_active is not None:
        updates["is_active"] = body.is_active
    if body.role is not None:
        if body.role not in VALID_ROLES:
            return error_response(f"Invalid role. Must be one of: {', '.join(VALID_ROLES)}", 400)
        role_row = (await db.execute(
            text("SELECT id FROM roles WHERE name = :role LIMIT 1"),
            {"role": body.role}
        )).fetchone()
        if not role_row:
            # FIXED role and role_id must stay in sync — both updated together
            return error_response("Role not found — contact support", 400)
        updates["role"]     = body.role
        updates["role_id"]  = role_row.id

    if not updates:
        return error_response("No fields to update", 400)

    set_clause = ", ".join(f"{k} = :{k}" for k in updates)
    updates["id"] = staff_id

    try:
        updates["business_id"] = business_id
        await db.execute(
            text(f"UPDATE profiles SET {set_clause} WHERE id = :id AND business_id = :business_id"),
            updates
        )
        await db.commit()

        clear_user_cache(staff_id)
        from app.middleware.subscription import clear_subscription_user_cache
        clear_subscription_user_cache(staff_id)
    except Exception as e:
        await db.rollback()
        logging.exception(e)
        return error_response("An unexpected error occurred. Please try again.", status_code=500)

    return success_response({"message": "Staff updated successfully"})


# ── DELETE /staff/{id} — Deactivate (soft delete) ────────────────────────────

@router.delete("/{staff_id}")
async def deactivate_staff(
    staff_id:     str,
    current_user: dict    = Depends(require_permission("staff.manage")),
    db:           AsyncSession = Depends(get_async_db),
):
    business_id = current_user["business_id"]

    if staff_id == current_user["user_id"]:
        return error_response("You cannot deactivate your own account", 400)

    existing = (await db.execute(
        text("""
            SELECT id FROM profiles
            WHERE id = :id AND business_id = :business_id AND is_active = true
        """),
        {"id": staff_id, "business_id": business_id}
    )).fetchone()

    if not existing:
        return error_response("Active staff member not found", 404)

    try:
        await db.execute(
            text("UPDATE profiles SET is_active = false WHERE id = :id AND business_id = :business_id"),
            {"id": staff_id, "business_id": business_id}
        )
        await db.commit()

        clear_user_cache(staff_id)
        from app.middleware.subscription import clear_subscription_user_cache
        clear_subscription_user_cache(staff_id)
    except Exception as e:
        await db.rollback()
        logging.exception(e)
        return error_response("An unexpected error occurred. Please try again.", status_code=500)

    return success_response({"message": "Staff account deactivated successfully"})