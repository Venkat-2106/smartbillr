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
#
# ─── WHY load_permissions() WAS REMOVED ─────────────────────────────────────
#
#   verify_token() in auth.py already loads the full permissions set using
#   STRING_AGG in a single query, and stores it in the returned dict under
#   the key "permissions".
#
#   The old fallback pattern:
#       user_permissions = current_user.get("permissions")
#       if user_permissions is None:
#           user_permissions = load_permissions(...)    ← second DB query
#
#   Was dead code. current_user["permissions"] is ALWAYS populated by
#   verify_token. The fallback fired a redundant DB query on a path that
#   was never actually reached, and load_permissions used INNER JOINs
#   (vs LEFT JOINs in verify_token) so it was also inconsistent.
#
#   Removing it makes the auth flow simpler and strictly faster.

from fastapi import HTTPException, Depends
from app.middleware.auth import verify_token
from app.dependencies.subscription import verify_subscription


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

    PERFORMANCE NOTE:
        verify_token already loaded all permissions in one DB query.
        This function just reads from that result — zero extra DB queries.

    SUBSCRIPTION NOTE:
        verify_subscription runs automatically to validate the tenant's
        subscription status.  Routers that need to skip this check (e.g.
        billing checkout) should use verify_token directly instead.
    """
    def dependency(
        _sub: None = Depends(verify_subscription),
        current_user: dict = Depends(verify_token),
    ) -> dict:
        if permission_code not in current_user["permissions"]:
            raise HTTPException(
                status_code=403,
                detail=f"Access denied. Required permission: '{permission_code}'"
            )
        return current_user

    return dependency


def require_any_permission(*permission_codes: str):
    """
    Passes if the user has AT LEAST ONE of the listed permissions.

    Use case: an endpoint accessible to managers AND admins but not staff.

    Usage:
        current_user = Depends(require_any_permission("sales.edit", "sales.delete"))
    """
    def dependency(
        _sub: None = Depends(verify_subscription),
        current_user: dict = Depends(verify_token),
    ) -> dict:
        if not any(code in current_user["permissions"] for code in permission_codes):
            raise HTTPException(
                status_code=403,
                detail=f"Access denied. Required one of: {list(permission_codes)}"
            )
        return current_user

    return dependency


def require_all_permissions(*permission_codes: str):
    """
    Passes only if the user has ALL of the listed permissions.

    Use case: an endpoint that requires both editing and financial access.

    Usage:
        current_user = Depends(require_all_permissions("sales.edit", "dashboard.financial"))
    """
    def dependency(
        _sub: None = Depends(verify_subscription),
        current_user: dict = Depends(verify_token),
    ) -> dict:
        missing = [code for code in permission_codes if code not in current_user["permissions"]]
        if missing:
            raise HTTPException(
                status_code=403,
                detail=f"Access denied. Missing permissions: {missing}"
            )
        return current_user

    return dependency


def get_current_user_with_permissions(
    current_user: dict = Depends(verify_token),
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

    PERFORMANCE NOTE:
        verify_token already loaded all permissions. This is a pass-through.
        Zero extra DB queries.

    NOTE:
        This helper intentionally does NOT include verify_subscription
        because it is a "soft" permission helper — the route itself decides
        how to use permissions.  Routes that need subscription gating should
        use require_permission() or add verify_subscription explicitly.
    """
    return current_user