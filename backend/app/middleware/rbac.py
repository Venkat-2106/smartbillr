# app/middleware/rbac.py
#
# Centralized RBAC authorization system for SmartBillr.
#
# ─── HOW IT WORKS ────────────────────────────────────────────────────────────
#
# Every protected endpoint declares which permission it needs:
#
#     @router.post("/sales")
#     def create_sale(
#         current_user: dict = Depends(require_permission("sales.create"))
#     ):
#
# require_permission() returns a FastAPI dependency that:
#   1. Runs verify_token → gets user_id + business_id + permissions (from DB)
#   2. Checks the required permission is in the user's permissions set
#   3. If not → raises HTTP 403 Forbidden
#   4. If yes → returns enriched current_user dict to the route
#
# ─── WHY THIS (not if role == "admin") ───────────────────────────────────────
#
#   BAD:  if current_user["role"] == "admin":          ← hardcoded, scattered
#   GOOD: Depends(require_permission("sales.create"))  ← centralized, DB-driven
#
#   Benefits:
#   - Permissions stored in DB → change access without deploying code
#   - Adding a new role = just insert rows in roles + role_permissions
#   - Every endpoint is self-documenting about what access it requires
#   - One place to audit all authorization logic
#   - Future: custom roles per business, time-limited permissions, etc.

from fastapi import HTTPException, Depends
from sqlalchemy.orm import Session
from sqlalchemy import text
from app.database import get_db
from app.middleware.auth import verify_token
from typing import Set


def load_permissions(user_id: str, db: Session) -> Set[str]:
    """
    Load all permission codes for a given user from the DB.

    Query path:
        profiles.id → profiles.role_id → role_permissions → permissions.code

    Returns a set of permission code strings, e.g.:
        {"sales.view", "sales.create", "dashboard.view", ...}

    WHY a set: O(1) lookup — checking "sales.create" in a set of 20 items
    is instant regardless of how many permissions exist.
    """
    rows = db.execute(
        text("""
            SELECT perm.code
            FROM profiles p
            JOIN role_permissions rp ON rp.role_id = p.role_id
            JOIN permissions perm   ON perm.id = rp.permission_id
            WHERE p.id = :user_id
              AND p.is_active = true
        """),
        {"user_id": user_id}
    ).fetchall()

    return {row.code for row in rows}


def require_permission(permission_code: str):
    """
    FastAPI dependency factory for single-permission enforcement.

    Usage in any router:
        @router.post("/sales")
        def create_sale(
            current_user: dict = Depends(require_permission("sales.create"))
        ):

    What it returns to your route:
        {
            "user_id":     "...",
            "business_id": "...",
            "role":        "admin",
            "permissions": {"sales.create", "sales.view", ...}
        }

    The route can then do additional in-route checks using the permissions set
    without hitting the DB again.
    """
    def dependency(
        current_user: dict = Depends(verify_token),
        db: Session = Depends(get_db),
    ) -> dict:
        # verify_token already loaded permissions — use them if available.
        # This avoids a redundant DB query in most cases.
        user_permissions = current_user.get("permissions")
        if user_permissions is None:
            user_permissions = load_permissions(current_user["user_id"], db)

        if permission_code not in user_permissions:
            raise HTTPException(
                status_code=403,
                detail=f"Access denied. Required permission: '{permission_code}'"
            )

        return {
            **current_user,
            "permissions": user_permissions,
        }

    return dependency


def require_any_permission(*permission_codes: str):
    """
    Passes if the user has AT LEAST ONE of the listed permissions.

    Use case: an endpoint accessible to managers AND admins but not staff.

    Usage:
        current_user = Depends(require_any_permission("sales.edit", "sales.delete"))
    """
    def dependency(
        current_user: dict = Depends(verify_token),
        db: Session = Depends(get_db),
    ) -> dict:
        user_permissions = current_user.get("permissions")
        if user_permissions is None:
            user_permissions = load_permissions(current_user["user_id"], db)

        if not any(code in user_permissions for code in permission_codes):
            raise HTTPException(
                status_code=403,
                detail=f"Access denied. Required one of: {list(permission_codes)}"
            )

        return {**current_user, "permissions": user_permissions}

    return dependency


def require_all_permissions(*permission_codes: str):
    """
    Passes only if the user has ALL of the listed permissions.

    Use case: an endpoint that requires both editing and financial access.

    Usage:
        current_user = Depends(require_all_permissions("sales.edit", "dashboard.financial"))
    """
    def dependency(
        current_user: dict = Depends(verify_token),
        db: Session = Depends(get_db),
    ) -> dict:
        user_permissions = current_user.get("permissions")
        if user_permissions is None:
            user_permissions = load_permissions(current_user["user_id"], db)

        missing = [code for code in permission_codes if code not in user_permissions]
        if missing:
            raise HTTPException(
                status_code=403,
                detail=f"Access denied. Missing permissions: {missing}"
            )

        return {**current_user, "permissions": user_permissions}

    return dependency


def get_current_user_with_permissions(
    current_user: dict = Depends(verify_token),
    db: Session = Depends(get_db),
) -> dict:
    """
    Use this when a route needs to check permissions manually inside the
    function body — e.g. to return different data depending on role.

    Usage:
        current_user = Depends(get_current_user_with_permissions)

        # Show financial data only if user has that permission
        if "dashboard.financial" in current_user["permissions"]:
            data["revenue"] = total_revenue

    This is the "soft check" pattern — no automatic 403, your code decides
    what to include or exclude based on what the user is allowed to see.
    """
    user_permissions = current_user.get("permissions")
    if user_permissions is None:
        user_permissions = load_permissions(current_user["user_id"], db)

    return {**current_user, "permissions": user_permissions}