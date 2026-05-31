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

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import text
from pydantic import BaseModel, EmailStr
from typing import Optional
import httpx
import os

from app.database import get_db
from app.middleware.rbac import require_permission
from app.utils.response import success_response, error_response

router = APIRouter(prefix="/staff", tags=["Staff"])

SUPABASE_URL             = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY     = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

VALID_ROLES = {"admin", "manager", "staff"}


# ── Schemas ───────────────────────────────────────────────────────────────────

class CreateStaffRequest(BaseModel):
    full_name: str
    email:     EmailStr
    password:  str
    role:      str          # "manager" or "staff"


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


def create_supabase_auth_user(email: str, password: str, full_name: str) -> dict:
    """
    Call Supabase Auth Admin API to create a new auth user.
    Returns the created user dict including id.
    Raises ValueError on failure.
    """
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        raise ValueError("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing in .env")

    response = httpx.post(
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


def delete_supabase_auth_user(auth_user_id: str):
    """
    Delete a Supabase Auth user by id.
    Called on rollback if profile insert fails after auth user creation.
    """
    httpx.delete(
        f"{SUPABASE_URL}/auth/v1/admin/users/{auth_user_id}",
        headers=get_supabase_admin_headers(),
        timeout=10,
    )


# ── POST /staff — Create new staff/manager account ───────────────────────────

@router.post("")
def create_staff(
    body:         CreateStaffRequest,
    current_user: dict    = Depends(require_permission("staff.manage")),
    db:           Session = Depends(get_db),
):
    business_id = current_user["business_id"]

    # Validate role
    if body.role not in VALID_ROLES:
        return error_response(f"Invalid role. Must be one of: {', '.join(VALID_ROLES)}", 400)

    # Prevent creating another admin (only one admin per business)
    if body.role == "admin":
        existing_admin = db.execute(
            text("""
                SELECT id FROM profiles
                WHERE business_id = :business_id
                  AND role = 'admin'
                  AND is_active = true
                LIMIT 1
            """),
            {"business_id": business_id}
        ).fetchone()
        if existing_admin:
            return error_response("A business can only have one admin account", 400)

    # Check email not already used in this business
    existing = db.execute(
        text("""
            SELECT id FROM profiles
            WHERE LOWER(email) = LOWER(:email)
              AND business_id = :business_id
        """),
        {"email": body.email, "business_id": business_id}
    ).fetchone()
    if existing:
        return error_response("This email is already registered in your business", 400)

    # Step 1: Create Supabase Auth user
    try:
        auth_user = create_supabase_auth_user(body.email, body.password, body.full_name)
    except ValueError as e:
        return error_response(str(e), 400)

    auth_user_id = auth_user["id"]

    # Step 2: Insert into profiles using auth user id as profiles.id
    try:
        role_row = db.execute(
            text("SELECT id FROM roles WHERE name = :role LIMIT 1"),
            {"role": body.role}
        ).fetchone()

        if not role_row:
            delete_supabase_auth_user(auth_user_id)
            return error_response(f"Role '{body.role}' not found in roles table", 500)

        db.execute(
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
        db.commit()

    except Exception as e:
        db.rollback()
        # Rollback: delete the Supabase auth user we just created
        delete_supabase_auth_user(auth_user_id)
        return error_response(f"Could not create profile: {str(e)}", 500)

    return success_response({
        "id":          auth_user_id,
        "full_name":   body.full_name,
        "email":       body.email,
        "role":        body.role,
        "business_id": business_id,
        "is_active":   True,
    }, status_code=201)


# ── GET /staff — List all staff in this business ──────────────────────────────

@router.get("")
def list_staff(
    current_user: dict    = Depends(require_permission("staff.manage")),
    db:           Session = Depends(get_db),
):
    business_id = current_user["business_id"]

    rows = db.execute(
        text("""
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
            ORDER BY p.created_at ASC
        """),
        {"business_id": business_id}
    ).fetchall()

    return success_response([
        {
            "id":        str(row.id),
            "full_name": row.full_name,
            "email":     row.email,
            "role":      row.role_name or row.role,
            "is_active": row.is_active,
            "created_at": row.created_at.isoformat() if row.created_at else None,
        }
        for row in rows
    ])


# ── PATCH /staff/{id} — Update staff name, role, or active status ─────────────

@router.patch("/{staff_id}")
def update_staff(
    staff_id:     str,
    body:         UpdateStaffRequest,
    current_user: dict    = Depends(require_permission("staff.manage")),
    db:           Session = Depends(get_db),
):
    business_id = current_user["business_id"]

    # Cannot edit yourself
    if staff_id == current_user["user_id"]:
        return error_response("You cannot edit your own account from here", 400)

    # Confirm staff belongs to this business
    existing = db.execute(
        text("""
            SELECT id, role FROM profiles
            WHERE id = :id AND business_id = :business_id
        """),
        {"id": staff_id, "business_id": business_id}
    ).fetchone()

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
        updates["role"] = body.role
        role_row = db.execute(
            text("SELECT id FROM roles WHERE name = :role LIMIT 1"),
            {"role": body.role}
        ).fetchone()
        if role_row:
            updates["role_id"] = role_row.id

    if not updates:
        return error_response("No fields to update", 400)

    set_clause = ", ".join(f"{k} = :{k}" for k in updates)
    updates["id"] = staff_id

    try:
        db.execute(
            text(f"UPDATE profiles SET {set_clause} WHERE id = :id"),
            updates
        )
        db.commit()
    except Exception as e:
        db.rollback()
        return error_response(f"Could not update staff: {str(e)}", 500)

    return success_response({"message": "Staff updated successfully"})


# ── DELETE /staff/{id} — Deactivate (soft delete) ────────────────────────────

@router.delete("/{staff_id}")
def deactivate_staff(
    staff_id:     str,
    current_user: dict    = Depends(require_permission("staff.manage")),
    db:           Session = Depends(get_db),
):
    business_id = current_user["business_id"]

    if staff_id == current_user["user_id"]:
        return error_response("You cannot deactivate your own account", 400)

    existing = db.execute(
        text("""
            SELECT id FROM profiles
            WHERE id = :id AND business_id = :business_id AND is_active = true
        """),
        {"id": staff_id, "business_id": business_id}
    ).fetchone()

    if not existing:
        return error_response("Active staff member not found", 404)

    try:
        db.execute(
            text("UPDATE profiles SET is_active = false WHERE id = :id"),
            {"id": staff_id}
        )
        db.commit()
    except Exception as e:
        db.rollback()
        return error_response(f"Could not deactivate staff: {str(e)}", 500)

    return success_response({"message": "Staff account deactivated successfully"})