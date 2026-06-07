# app/utils/pagination.py
#
# ARCHITECTURE RULE:
#   - Normal UI requests: page=N, limit=15 or 20 → backend returns one page only
#   - Export requests:    page=1, limit=10000    → backend returns all matching rows
#   - The 10 000 cap is a hard guard. The `truncated` field in pagination_response
#     tells the frontend when a result was silently capped so it can show a warning.
#
# Usage in every router:
#   pagination: dict = Depends(paginate)
#   ...
#   return success_response(
#       pagination_response(data, total, pagination["page"], pagination["limit"])
#   )

from fastapi import Query


def paginate(
    page:  int = Query(default=1,  ge=1,          description="Page number"),
    limit: int = Query(default=20, ge=1, le=10000, description="Items per page (max 10000)")
):
    offset = (page - 1) * limit
    return {
        "page":   page,
        "limit":  limit,
        "offset": offset,
    }


def pagination_response(data: list, total: int, page: int, limit: int):
    total_pages = (total + limit - 1) // limit
    # truncated = True when a bulk/export request hit the 10 000 cap.
    # The frontend should show a warning toast when this is True.
    truncated = limit >= 10000 and total > 10000
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