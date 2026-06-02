# app/utils/pagination.py
# limit cap: 500 max per page.
# Default is 20 for list pages. Create Invoice uses 500 to load all
# customers and products into the dropdown without server-side search.

from fastapi import Query

def paginate(
    page:  int = Query(default=1,  ge=1,        description="Page number"),
    limit: int = Query(default=20, ge=1, le=500, description="Items per page (max 500)")
):
    offset = (page - 1) * limit
    return {
        "page":   page,
        "limit":  limit,
        "offset": offset,
    }

def pagination_response(data: list, total: int, page: int, limit: int):
    total_pages = (total + limit - 1) // limit
    return {
        "items": data,
        "pagination": {
            "total":       total,
            "page":        page,
            "limit":       limit,
            "total_pages": total_pages,
            "has_next":    page < total_pages,
            "has_prev":    page > 1,
        },
    }
