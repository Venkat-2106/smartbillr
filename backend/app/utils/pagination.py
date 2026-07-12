# app/utils/pagination.py
#
# ARCHITECTURE RULE:
#   - Normal UI requests: page=N, limit=15 or 20 → backend returns one page only
#   - Export requests:    page=1, limit=max     → backend returns all matching rows
#   - The 10 000 cap is a hard FastAPI guard. The `truncated` field in
#     pagination_response tells the frontend when the result was silently capped.
#   - Tier export limits (e.g., trial = 500) are applied inside paginate() by
#     reading the business's subscription_type. No endpoint changes needed.

from fastapi import Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db, get_async_db
from app.middleware.auth import verify_token
from app.utils.usage_limits import fetch_subscription_type, fetch_subscription_type_async
from app.utils.subscription_features import get_feature_limits


def paginate(
    page:  int = Query(default=1,  ge=1,          description="Page number"),
    limit: int = Query(default=20, ge=1, le=10000, description="Items per page (max 10000)"),
    current_user: dict = Depends(verify_token),
    db: Session = Depends(get_db),
):
    # Apply tier-based export row cap
    business_id = current_user["business_id"]
    sub_type = fetch_subscription_type(db, business_id)
    tier_limits = get_feature_limits(sub_type)
    max_rows = tier_limits.get("max_export_rows")
    capped = False
    if max_rows is not None and limit > max_rows:
        limit = max_rows
        capped = True

    offset = (page - 1) * limit
    return {
        "page":        page,
        "limit":       limit,
        "offset":      offset,
        "_capped":     capped,
    }


async def paginate_async(
    page:  int = Query(default=1,  ge=1,          description="Page number"),
    limit: int = Query(default=20, ge=1, le=10000, description="Items per page (max 10000)"),
    current_user: dict = Depends(verify_token),
    db: AsyncSession = Depends(get_async_db),
):
    """Async variant of paginate() for async route handlers.

    Uses the async session (get_async_db) so paginated async routes open
    only one DB connection instead of two (async + sync).  The tier-based
    export cap is fetched via fetch_subscription_type_async.
    """
    business_id = current_user["business_id"]
    sub_type = await fetch_subscription_type_async(db, business_id)
    tier_limits = get_feature_limits(sub_type)
    max_rows = tier_limits.get("max_export_rows")
    capped = False
    if max_rows is not None and limit > max_rows:
        limit = max_rows
        capped = True

    offset = (page - 1) * limit
    return {
        "page":        page,
        "limit":       limit,
        "offset":      offset,
        "_capped":     capped,
    }


def pagination_response(data: list, total: int, page: int, limit: int, capped: bool = False):
    total_pages = (total + limit - 1) // limit
    # truncated = True when a bulk/export request was capped by the tier or system limit.
    # The frontend should show a warning toast when this is True.
    truncated = capped or (limit >= 10000 and total > limit)
    return {
        "items": data,
        "pagination": {
            "total":       total,
            "page":        page,
            "limit":       limit,
            "total_pages": total_pages,
            "has_next":    page < total_pages,
            "has_prev":    page > 1,
            "truncated":   truncated,
        },
    }