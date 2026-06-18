# app/routers/profiles.py
#
# Profile API — returns logged-in user's identity, role, and permissions.
# The frontend uses the permissions array to show/hide UI elements.
#
# WHY profiles returns permissions:
#   After login, the frontend calls GET /profiles/me once.
#   The permissions array is stored in Zustand/localStorage.
#   Every UI element (button, page, nav link) checks this array
#   to decide whether to show or hide — no extra API calls needed.

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
from app.database import get_db
from app.middleware.auth import verify_token
from app.utils.response import success_response, error_response
import logging

router = APIRouter(prefix="/profiles", tags=["Profiles"])


# ─── GET /profiles/me ─────────────────────────────────────────────────────────
@router.get("/me")
def get_my_profile(
    current_user: dict = Depends(verify_token),
    db: Session = Depends(get_db),
):
    """
    Returns the logged-in user's full profile including:
    - full_name, email, role
    - permissions array (all permission codes this user has)

    The frontend stores this on login and uses permissions to control
    which nav links, buttons, and pages are visible.
    """
    try:
        user_id     = current_user["user_id"]
        business_id = current_user["business_id"]

        result = db.execute(
            text("""
                SELECT
                    p.id,
                    p.full_name,
                    p.role,
                    p.email,
                    p.is_active,
                    p.business_id,
                    r.name AS role_name
                FROM profiles p
                LEFT JOIN roles r ON r.id = p.role_id
                WHERE p.id          = :user_id
                  AND p.business_id = :business_id
                  AND p.is_active   = true
                LIMIT 1
            """),
            {"user_id": user_id, "business_id": business_id}
        ).fetchone()

        if not result:
            return error_response("Profile not found", 404)

        # Permissions were already loaded by verify_token dependency.
        # We pass them through directly — no extra DB query needed.
        permissions = list(current_user.get("permissions", []))

        return success_response({
            "id":          str(result.id),
            "full_name":   result.full_name,
            "role":        result.role_name or result.role,
            "email":       result.email,
            "is_active":   result.is_active,
            "business_id": str(result.business_id),
            "permissions": permissions,
            # Convenience boolean flags for common UI checks
            # Frontend can use: profile.is_admin instead of permissions.includes("settings.manage")
            "is_admin":    (result.role_name or result.role) == "admin",
            "is_manager":  (result.role_name or result.role) == "manager",
            "is_staff":    (result.role_name or result.role) == "staff",
        })

    except Exception as e:
        logging.exception(e)
        return error_response("An unexpected error occurred. Please try again.", status_code=500)


# ─── GET /profiles/check-email ────────────────────────────────────────────────
# Public endpoint — NO auth required.
# Used by the password reset flow to verify email exists before sending reset.
@router.get("/check-email")
def check_email_exists(
    email: str = Query(..., description="Email address to check"),
    db: Session = Depends(get_db),
):
    try:
        result = db.execute(
            text("""
                SELECT id FROM profiles
                WHERE LOWER(email) = LOWER(:email)
                  AND is_active = true
                LIMIT 1
            """),
            {"email": email.strip()}
        ).fetchone()

        if not result:
            return error_response("This email is not registered with SmartBillr", 404)

        return success_response({"exists": True})

    except Exception as e:
        logging.exception(e)
        return error_response("An unexpected error occurred. Please try again.", status_code=500)