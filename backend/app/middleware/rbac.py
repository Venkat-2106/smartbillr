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
from sqlalchemy.orm import Session
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from app.database import get_db
from app.middleware.auth import verify_token, verify_super_admin
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


# ══════════════════════════════════════════════════════════════════════════════
# SYNC RLS CONTEXT — Fixes the cross-engine GUC gap
# ══════════════════════════════════════════════════════════════════════════════
#
# PROBLEM:
#   verify_token() is async and sets app.current_user_id / app.current_business_id
#   GUCs on its AsyncSession (async engine). Sync routers use a completely
#   separate Session (sync engine, different connection pool). The GUCs are
#   invisible to the sync connection, so RLS policies silently filter out
#   every row — queries return empty/None, routes return 404.
#
# SOLUTION:
#   Composed dependencies that call the existing auth deps (verify_token /
#   require_permission / verify_super_admin) then set the GUCs on the sync
#   db session. Composition over duplication — the existing dependency does
#   all auth + permission checking; we only add the missing GUC setup.
#
#   SET LOCAL (transaction-scoped) works fine on the sync path because
#   psycopg2 substitutes bind params client-side before sending to Postgres.
# ══════════════════════════════════════════════════════════════════════════════

_SET_RLS_SQL = text(
    "SET LOCAL app.current_user_id = :uid"
)
_SET_BID_SQL = text(
    "SET LOCAL app.current_business_id = :bid"
)


def set_rls_gucs(db: Session, current_user: dict) -> None:
    """Set tenant RLS GUCs on a sync db session. Call BEFORE any queries."""
    db.execute(_SET_RLS_SQL, {"uid": str(current_user["user_id"])})
    db.execute(_SET_BID_SQL, {"bid": str(current_user["business_id"])})


def set_rls_gucs_after_commit(db: Session, current_user: dict) -> None:
    """Re-set tenant RLS GUCs after db.commit().

    SET LOCAL is transaction-scoped — the values are lost when the
    transaction ends. Call this after every commit that is followed by
    further queries on the same sync session.
    """
    set_rls_gucs(db, current_user)


async def async_set_rls_gucs(db: AsyncSession, current_user: dict) -> None:
    """Set tenant RLS GUCs on an async db session. Call BEFORE any queries.

    Uses set_config() instead of SET LOCAL with bind params because asyncpg
    sends bind params server-side ($1), and Postgres's SET/SET LOCAL grammar
    doesn't accept parameters — it throws a syntax error. set_config() is an
    ordinary function call that does accept real bind parameters.
    """
    await db.execute(
        text("SELECT set_config('app.current_user_id', :uid, true)"),
        {"uid": str(current_user["user_id"])},
    )
    await db.execute(
        text("SELECT set_config('app.current_business_id', :bid, true)"),
        {"bid": str(current_user["business_id"])},
    )


async def async_set_rls_gucs_after_commit(db: AsyncSession, current_user: dict) -> None:
    """Re-set tenant RLS GUCs on an async session after await db.commit().

    set_config(name, value, is_local=true) is transaction-scoped — the values
    are lost when the transaction ends. Call this after every commit that is
    followed by further queries on the same async session.
    """
    await async_set_rls_gucs(db, current_user)


def require_permission_with_rls(permission_code: str):
    """
    Drop-in replacement for require_permission() that also sets RLS GUCs
    on the sync db session used by the route handler.

    Composition: calls the existing require_permission() for auth + permission
    check, then sets GUCs on the sync session.

    Usage in any sync router:
        @router.get("/items")
        def list_items(
            current_user: dict = Depends(require_permission_with_rls("items.view")),
            db: Session = Depends(get_db),
        ):
    """
    def dependency(
        current_user: dict = Depends(require_permission(permission_code)),
        db: Session = Depends(get_db),
    ) -> dict:
        set_rls_gucs(db, current_user)
        return current_user

    return dependency


def require_any_permission_with_rls(*permission_codes: str):
    """
    Sync-safe version of require_any_permission() — sets RLS GUCs on the
    sync db session.
    """
    def dependency(
        current_user: dict = Depends(require_any_permission(*permission_codes)),
        db: Session = Depends(get_db),
    ) -> dict:
        set_rls_gucs(db, current_user)
        return current_user

    return dependency


def require_all_permissions_with_rls(*permission_codes: str):
    """
    Sync-safe version of require_all_permissions() — sets RLS GUCs on the
    sync db session.
    """
    def dependency(
        current_user: dict = Depends(require_all_permissions(*permission_codes)),
        db: Session = Depends(get_db),
    ) -> dict:
        set_rls_gucs(db, current_user)
        return current_user

    return dependency


def get_current_user_with_permissions_rls(
    current_user: dict = Depends(verify_token),
    db: Session = Depends(get_db),
) -> dict:
    """
    Sync-safe version of get_current_user_with_permissions() — sets RLS GUCs
    on the sync db session for the soft-check permission pattern.
    """
    set_rls_gucs(db, current_user)
    return current_user


def verify_token_with_rls(
    current_user: dict = Depends(verify_token),
    db: Session = Depends(get_db),
) -> dict:
    """
    Sync-safe verify_token — sets RLS GUCs on the sync db session.

    Use this in sync routers that call verify_token directly (not via
    require_permission), e.g. profiles, subscription, billing checkout.
    """
    set_rls_gucs(db, current_user)
    return current_user


def verify_super_admin_with_rls(
    current_user: dict = Depends(verify_super_admin),
    db: Session = Depends(get_db),
) -> dict:
    """
    Sync-safe verify_super_admin — sets super-admin RLS GUCs on the sync
    db session (app.current_user_id + app.is_super_admin).

    Use this in sync superadmin routers and subscription admin routes.
    """
    db.execute(_SET_RLS_SQL, {"uid": str(current_user["user_id"])})
    db.execute(text("SET LOCAL app.is_super_admin = 'true'"))
    return current_user


def set_superadmin_rls_gucs_after_commit(db: Session, current_user: dict) -> None:
    """Re-set super-admin RLS GUCs after db.commit()."""
    db.execute(_SET_RLS_SQL, {"uid": str(current_user["user_id"])})
    db.execute(text("SET LOCAL app.is_super_admin = 'true'"))


async def async_set_superadmin_rls_gucs_after_commit(db: AsyncSession, current_user: dict) -> None:
    """Re-set super-admin RLS GUCs on an async session after await db.commit()."""
    await db.execute(
        text("SELECT set_config('app.current_user_id', :uid, true)"),
        {"uid": str(current_user["user_id"])},
    )
    await db.execute(text("SELECT set_config('app.is_super_admin', 'true', true)"))