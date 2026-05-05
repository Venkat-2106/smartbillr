from fastapi import Query

def paginate(
    page: int = Query(default=1, ge=1, description="Page number"),
    limit: int = Query(default=20, ge=1, le=100, description="Items per page")
):
    offset = (page - 1) * limit
    return {
        "page": page,
        "limit": limit,
        "offset": offset
    }

def pagination_response(data: list, total: int, page: int, limit: int):
    total_pages = (total + limit - 1) // limit
    return {
        "items": data,
        "pagination": {
            "total": total,
            "page": page,
            "limit": limit,
            "total_pages": total_pages,
            "has_next": page < total_pages,
            "has_prev": page > 1
        }
    }