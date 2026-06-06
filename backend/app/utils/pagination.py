# app/utils/pagination.py
#
# EXPORT FIX — 2026-06-06
# ─────────────────────────────────────────────────────────────────────────────
# PROBLEM:
#   The previous cap was le=500. All list-page hooks fetched limit=100 (the
#   old "safe" value), meaning only the first 100 records were ever loaded
#   into the frontend. When the user clicked Export CSV, the exported file
#   only contained those 100 records — silently truncated for any business
#   with more than 100 customers / products / suppliers / categories.
#
#   For Sales, a dedicated fetchAllSalesForExport() call used limit=1000,
#   which was also arbitrary and still wrong for very active businesses.
#
# FIX:
#   Raised le (maximum allowed value) to 10000.
#   This lets dedicated export API calls request all records in a single
#   round-trip without introducing separate export-only endpoints.
#
#   Each module keeps its regular UI fetch at limit=20 (server-paginated)
#   or limit=100 (for client-side-filter pages). Export calls send limit=10000
#   so the backend returns everything without pagination truncation.
#
# SAFETY:
#   - business_id filtering is applied on every query, so no tenant bleed.
#   - is_deleted=false is applied on every query, so deleted records stay hidden.
#   - The 10 000 cap is a guard against runaway queries. Businesses with more
#     than 10 000 active records in a single table should move to a streaming /
#     chunked export in the future.
#   - Supabase Postgres handles 10 000-row result sets in well under 2 seconds
#     for the tables in SmartBillr (no JOINs wider than 3 tables, all FK
#     columns indexed).
#
# PAGES AFFECTED:
#   Products    — allQuery now fetches limit=10000 (was 100)
#   Categories  — allQuery now fetches limit=10000 (was 100)
#   Customers   — fetchCustomers() now fetches limit=10000 (was 100)
#   Suppliers   — fetchSuppliers() now fetches limit=10000 (was 100)
#   Sales       — fetchAllSalesForExport() now fetches limit=10000 (was 1000)
# ─────────────────────────────────────────────────────────────────────────────

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
