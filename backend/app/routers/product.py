# app/routers/product.py
#
# Audit fields tracked:
#   created_by    → set in POST; never changed again
#   prod_created_at → set in POST (DB DEFAULT now() is safety net)
#   updated_by    → set in PUT; initially same as created_by on first save
#   updated_at    → maintained automatically by DB trigger fn_set_updated_at
#
# Every read query that returns a product JOINs profiles TWICE:
#   pr1 → resolves updated_by  → last_updated_by
#   pr2 → resolves created_by  → created_by_name
# This is a single efficient JOIN — no N+1 queries.
#
# ── PROFIT PERMISSION GATE ────────────────────────────────────────────────────
#
# Permission code: 'view_product_profit'
# Granted to:      admin, manager  (NOT staff)
#
# When a user LACKS this permission:
#   - prod_cost_price  → returned as null
#   - prod_profit      → returned as null
#
# When a user HAS this permission:
#   - prod_cost_price  → full value returned
#   - prod_profit      → full value returned
#
# ── VALIDATION CHANGES (2026-06-06) ──────────────────────────────────────────
#
# 1. DUPLICATE NAME CHECK (Feature 2):
#    Added before INSERT (POST) and before UPDATE (PUT).
#    Checks: LOWER(TRIM(prod_name)) = LOWER(TRIM(:name)) within same business,
#    excluding soft-deleted products and (for PUT) the product being edited.
#    Returns HTTP 400 with "A product with this name already exists." on match.
#
#    The DB unique index (uix_products_name_business) acts as the final safety
#    net for concurrent inserts — the explicit check here gives a clean error
#    message before that index can fire.
#
#    IntegrityError handling updated to distinguish barcode vs. name constraint.
#
# 2. NOTE — Loss price validation (Feature 1):
#    The "sell < cost" check is intentionally a UI-only confirmation dialog.
#    Selling below cost is a valid business decision (clearance sales, etc).
#    The backend does NOT reject such requests. The frontend shows a warning
#    popup and the user explicitly confirms before the API call is made.
#    No backend change needed for Feature 1.
#
# ── BARCODE CHANGES (2026-06-06) ─────────────────────────────────────────────
#
# 1. _find_duplicate_barcode() helper — explicit pre-INSERT/PUT check.
#    Same pattern as _find_duplicate_name(). Returns a clean 400 BEFORE the
#    DB constraint fires so the user sees a precise, friendly message.
#    The DB unique index (uix_products_barcode_business) is the safety net
#    for concurrent race-condition inserts.
#
# 2. GET /products/barcode/{code} — exact barcode lookup endpoint.
#    Declared BEFORE /{prod_id} so FastAPI does not try to parse "barcode"
#    as a UUID. Scoped to the caller's business_id (no cross-tenant leakage).
#    Returns 404 when no active product matches.
#
# 3. POST: added explicit barcode duplicate check after name check.
# 4. PUT:  added explicit barcode duplicate check with exclude_id pattern.
# ─────────────────────────────────────────────────────────────────────────────

from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session
from sqlalchemy import func, text
from app.database import get_db
from app.middleware.rbac import require_permission, get_current_user_with_permissions
from app.models.product import Product
from app.models.category import Category
from app.schemas.product import ProductCreate, ProductUpdate
from app.utils.response import success_response, error_response
from app.utils.pagination import paginate, pagination_response
from app.utils.timestamp import fmt_ts
from app.utils.usage_limits import check_create_allowed, fetch_subscription_type
from sqlalchemy.exc import IntegrityError
from typing import Optional

router = APIRouter(prefix="/v1/products", tags=["Products"])

# ── Permission code constant ─────────────────────────────────────────────────
PROFIT_PERMISSION = "view_product_profit"


# ── Helper: fetch one product row — all fields + both JOIN names ───────────
def get_product_with_profit(db: Session, prod_id, business_id: str):
    row = db.execute(
        text("""
            SELECT
                p.prod_id, p.business_id, p.category_id, p.prod_name,
                p.prod_sell_price, p.prod_mrp,
                p.prod_cost_price, p.prod_profit,
                p.prod_stock_qty, p.prod_low_stock_alert, p.tax_rate,
                p.tax_code, p.barcode, p.unit, p.is_deleted,
                p.prod_created_at, p.updated_at,
                p.created_by,  p.updated_by,
                c.category_name,
                pr1.full_name AS last_updated_by,
                pr2.full_name AS created_by_name
            FROM products p
            LEFT JOIN categories c   ON c.category_id  = p.category_id
            LEFT JOIN profiles   pr1 ON pr1.id = p.updated_by
            LEFT JOIN profiles   pr2 ON pr2.id = p.created_by
            WHERE p.prod_id = :prod_id
              AND p.business_id = CAST(:bid AS uuid)
        """),
        {"prod_id": str(prod_id), "bid": business_id}
    ).fetchone()
    return row


# ── Helper: format one product row as a dict ──────────────────────────────
def row_to_dict(row, show_profit: bool = True):
    return {
        "prod_id":              str(row.prod_id),
        "business_id":          str(row.business_id),
        "category_id":          str(row.category_id) if row.category_id else None,
        "category_name":        row.category_name if row.category_name else None,
        "prod_name":            row.prod_name,
        "prod_sell_price":      float(row.prod_sell_price),
        # MRP FEATURE: None when not set — frontend treats None as "no MRP"
        "prod_mrp":             float(row.prod_mrp) if row.prod_mrp is not None else None,
        "prod_cost_price":      float(row.prod_cost_price) if show_profit else None,
        "prod_profit":          float(row.prod_profit) if (show_profit and row.prod_profit is not None) else None,
        "prod_stock_qty":       row.prod_stock_qty,
        "prod_low_stock_alert": row.prod_low_stock_alert,
        "tax_rate":             float(row.tax_rate) if row.tax_rate is not None else 0,
        "tax_code":             row.tax_code,
        "barcode":              row.barcode,
        "unit":                 row.unit,
        "is_deleted":           row.is_deleted,
        "prod_created_at":      fmt_ts(row.prod_created_at),
        "created_by":           str(row.created_by)  if row.created_by  else None,
        "created_by_name":      row.created_by_name  if row.created_by_name  else None,
        "updated_at":           fmt_ts(row.updated_at),
        "updated_by":           str(row.updated_by)  if row.updated_by  else None,
        "last_updated_by":      row.last_updated_by  if row.last_updated_by  else None,
    }


# ── Helper: format one product row for list response ─────────────────────
def row_to_dict_list(row, show_profit: bool = True):
    return {
        "prod_id":              str(row.prod_id),
        "business_id":          str(row.business_id),
        "category_id":          str(row.category_id) if row.category_id else None,
        "category_name":        row.category_name if row.category_name else None,
        "prod_name":            row.prod_name,
        "prod_sell_price":      float(row.prod_sell_price),
        "prod_mrp":             float(row.prod_mrp) if row.prod_mrp is not None else None,
        "prod_cost_price":      float(row.prod_cost_price) if show_profit else None,
        "prod_profit":          float(row.prod_profit) if (show_profit and row.prod_profit is not None) else None,
        "prod_stock_qty":       row.prod_stock_qty,
        "prod_low_stock_alert": row.prod_low_stock_alert,
        "tax_rate":             float(row.tax_rate) if row.tax_rate is not None else 0,
        "tax_code":             row.tax_code,
        "barcode":              row.barcode,
        "unit":                 row.unit,
        "prod_created_at":      fmt_ts(row.prod_created_at),
        "updated_at":           fmt_ts(row.updated_at),
        "updated_by":           str(row.updated_by)  if row.updated_by  else None,
        "last_updated_by":      row.last_updated_by  if row.last_updated_by  else None,
    }


# ── Helper: check for duplicate product name within a business ────────────────
# Returns the conflicting prod_id (truthy) if a duplicate exists, else None.
#
# exclude_id: pass the current product's prod_id on PUT so a product isn't
#             flagged as a duplicate of itself.
#
# Why LOWER(TRIM(...)) on both sides?
#   - LOWER  → case-insensitive: "Laptop" == "laptop" == "LAPTOP"
#   - TRIM   → ignores leading/trailing spaces: " Laptop " == "Laptop"
#   The DB index (uix_products_name_business) uses the same expression, so
#   this query hits the index efficiently.
def _find_duplicate_name(
    db:         Session,
    business_id: str,
    name:        str,
    exclude_id:  Optional[str] = None
):
    sql = """
        SELECT prod_id FROM products
        WHERE business_id       = CAST(:bid AS uuid)
          AND LOWER(TRIM(prod_name)) = LOWER(TRIM(:name))
          AND is_deleted         = false
    """
    params = {"bid": business_id, "name": name}

    if exclude_id:
        sql += " AND prod_id != CAST(:exclude_id AS uuid)"
        params["exclude_id"] = exclude_id

    # BUG FIX: the original function was missing this return statement.
    # Without it the function always returned None, so duplicate name checks
    # on POST and PUT never blocked conflicting names (only the DB index did,
    # which produces a raw IntegrityError instead of a clean 400 response).
    return db.execute(text(sql), params).fetchone()



# ── Helper: check for duplicate barcode within a business ────────────────────
# Returns the conflicting prod_id (truthy) if a duplicate exists, else None.
# Only called when barcode is a non-empty string.
# exclude_id: pass the current prod_id on PUT so a product is not flagged as
#             a duplicate of its own unchanged barcode.
# Exact = match (not ILIKE): barcodes are case-sensitive. Also hits the
# btree index (business_id, barcode) directly — no full table scan.
def _find_duplicate_barcode(
    db:          Session,
    business_id: str,
    barcode:     str,
    exclude_id:  str = None
):
    sql = """
        SELECT prod_id FROM products
        WHERE business_id = CAST(:bid AS uuid)
          AND barcode     = :barcode
          AND is_deleted  = false
    """
    params = {"bid": business_id, "barcode": barcode}
    if exclude_id:
        sql += " AND prod_id != CAST(:exclude_id AS uuid)"
        params["exclude_id"] = exclude_id
    return db.execute(text(sql), params).fetchone()


# ─────────────────────────────────────────
# POST /products → Create new product
# ─────────────────────────────────────────
@router.post("/")
def create_product(
    data: ProductCreate,
    current_user: dict = Depends(require_permission("products.edit")),
    db: Session = Depends(get_db)
):
    business_id = current_user["business_id"]
    show_profit = PROFIT_PERMISSION in current_user.get("permissions", set())

    # ── 0. Subscription tier limit check ──────────────────────────────────────
    sub_type = fetch_subscription_type(db, business_id)
    allowed, msg = check_create_allowed(db, business_id, sub_type, "max_products", "products")
    if not allowed:
        return error_response(msg, status_code=403)

    # ── 1. Validate category belongs to this business ─────────────────────────
    if data.category_id:
        category = db.query(Category).filter(
            Category.category_id == data.category_id,
            Category.business_id == business_id,
            Category.is_deleted == False
        ).first()
        if not category:
            return error_response("Category not found", 404)

    # ── 2. Duplicate name check ───────────────────────────────────────────────
    # The schema validator already stripped the name. We check for an existing
    # active product with the same normalised name within this business.
    #
    # WHY HERE AND NOT JUST RELY ON THE DB INDEX?
    #   The DB index (uix_products_name_business) would catch it eventually,
    #   but raises a raw IntegrityError with a Postgres error string.
    #   Checking explicitly here lets us return a clean, user-friendly message.
    #   The index is the final safety net for concurrent race-condition inserts.
    dup = _find_duplicate_name(db, business_id, data.prod_name)
    if dup:
        return error_response("A product with this name already exists.", 400)

    # ── 3. Duplicate barcode check (BARCODE FIX) ──────────────────────────────
    # Only runs when a barcode was actually supplied. Empty/None barcodes are
    # allowed on multiple products — not every product has a barcode.
    if data.barcode and data.barcode.strip():
        data.barcode = data.barcode.strip()
        dup_bc = _find_duplicate_barcode(db, business_id, data.barcode)
        if dup_bc:
            return error_response("A product with this barcode already exists.", 400)

    # ── 4. Create the product ─────────────────────────────────────────────────
    new_product = Product(
        business_id           = business_id,
        category_id           = data.category_id,
        prod_name             = data.prod_name,          # already stripped by schema
        prod_sell_price       = data.prod_sell_price,
        # MRP FEATURE: None is fine — means no MRP set for this product
        prod_mrp              = data.prod_mrp,
        prod_cost_price       = data.prod_cost_price,
        prod_stock_qty        = data.prod_stock_qty,
        prod_low_stock_alert  = data.prod_low_stock_alert,
        tax_rate              = data.tax_rate,
        tax_code              = data.tax_code,
        barcode               = data.barcode,
        unit                  = data.unit,
        prod_created_at       = datetime.now(timezone.utc),
        created_by            = current_user["user_id"],
        updated_by            = current_user["user_id"],
    )

    try:
        db.add(new_product)
        db.commit()
    except IntegrityError as e:
        db.rollback()
        # Distinguish between the two unique constraints so the user gets
        # a precise error message rather than a generic one.
        err_str = str(e.orig).lower()
        if "uix_products_name_business" in err_str:
            # Race condition: another request inserted the same name between
            # our check above and our INSERT. Extremely rare but handled.
            return error_response("A product with this name already exists.", 400)
        # Default → barcode uniqueness violation
        return error_response("A product with this barcode already exists.", 400)

    row = get_product_with_profit(db, new_product.prod_id, business_id)

    return success_response({
        "message": "Product created successfully",
        "product": row_to_dict(row, show_profit=show_profit)
    }, 201)


# ─────────────────────────────────────────
# GET /products → Get all products (paginated)
#
# SCALABILITY UPDATE:
#   Added server-side filter params so the frontend never needs to fetch all
#   records to the browser. All filtering, searching, date-ranging, and sorting
#   now execute at the database level before pagination is applied.
#
#   New query params:
#     search       — ILIKE on prod_name OR barcode OR category_name (JOIN)
#     updated_from — ISO date string "YYYY-MM-DD"; filters updated_at >= local midnight
#     updated_to   — ISO date string "YYYY-MM-DD"; filters updated_at <= local end-of-day
#     sort_by      — column name to sort by (whitelist-validated)
#     sort_dir     — "asc" or "desc"
#
#   The COUNT query uses the same WHERE clauses as the data query so the
#   total in the pagination envelope always reflects the filtered result set.
# ─────────────────────────────────────────
@router.get("/")
def get_all_products(
    current_user: dict          = Depends(require_permission("products.view")),
    db:           Session       = Depends(get_db),
    pagination:   dict          = Depends(paginate),
    search:       Optional[str] = Query(default=None, description="Search by name or barcode"),
    updated_from: Optional[str] = Query(default=None, description="Filter updated_at >= this date (YYYY-MM-DD)"),
    updated_to:   Optional[str] = Query(default=None, description="Filter updated_at <= this date (YYYY-MM-DD)"),
    sort_by:      Optional[str] = Query(default="prod_name", description="Column to sort by"),
    sort_dir:     Optional[str] = Query(default="asc",  description="asc or desc"),
):
    business_id = current_user["business_id"]
    show_profit = PROFIT_PERMISSION in current_user.get("permissions", set())

    # ── Whitelist sort column to prevent SQL injection ────────────────────────
    SORTABLE = {
        "prod_name":            "p.prod_name",
        "prod_sell_price":      "p.prod_sell_price",
        "prod_mrp":             "p.prod_mrp",
        "prod_cost_price":      "p.prod_cost_price",
        "prod_profit":          "p.prod_profit",
        "prod_stock_qty":       "p.prod_stock_qty",
        "tax_rate":             "p.tax_rate",
        "updated_at":           "p.updated_at",
        "prod_created_at":      "p.prod_created_at",
        "category_name":        "c.category_name",
    }
    order_col = SORTABLE.get(sort_by, "p.prod_name")
    order_dir = "DESC" if str(sort_dir).lower() == "desc" else "ASC"

    # ── Build dynamic WHERE clauses ───────────────────────────────────────────
    extra_where = ""
    params = {
        "business_id": business_id,
        "offset":      pagination["offset"],
        "limit":       pagination["limit"],
    }

    if search and search.strip():
        extra_where += " AND (p.prod_name ILIKE :search OR p.barcode ILIKE :search OR c.category_name ILIKE :search)"
        params["search"] = f"%{search.strip()}%"

    # TIMEZONE FIX: frontend sends UTC ISO strings (local day start/end converted
    # to UTC). Compare directly — no CAST to date (which would use server UTC timezone).
    if updated_from:
        extra_where += " AND p.updated_at >= :updated_from"
        params["updated_from"] = updated_from

    if updated_to:
        extra_where += " AND p.updated_at <= :updated_to"
        params["updated_to"] = updated_to

    rows = db.execute(
        text(f"""
            SELECT
                p.prod_id, p.business_id, p.category_id, p.prod_name,
                p.prod_sell_price, p.prod_mrp,
                p.prod_cost_price, p.prod_profit,
                p.prod_stock_qty, p.prod_low_stock_alert, p.tax_rate,
                p.tax_code, p.barcode, p.unit,
                p.prod_created_at, p.updated_at,
                p.updated_by,
                c.category_name,
                pr.full_name AS last_updated_by,
                COUNT(*) OVER() AS total_count
            FROM products p
            LEFT JOIN categories c ON c.category_id = p.category_id
            LEFT JOIN profiles   pr ON pr.id = p.updated_by
            WHERE p.business_id = CAST(:business_id AS uuid)
              AND p.is_deleted   = false
              {extra_where}
            ORDER BY {order_col} {order_dir}
            OFFSET :offset LIMIT :limit
        """),
        params
    ).fetchall()

    total = rows[0].total_count if rows else 0

    return success_response(
        pagination_response(
            [row_to_dict_list(r, show_profit=show_profit) for r in rows],
            total,
            pagination["page"],
            pagination["limit"],
            capped=pagination["_capped"]
        )
    )


# ── GET /products/summary → KPI cards for products page ─────────────
@router.get("/summary")
def get_product_summary_kpi(
    current_user: dict = Depends(require_permission("products.view")),
    db: Session = Depends(get_db)
):
    bid = current_user["business_id"]
    show_profit = "view_product_profit" in current_user.get("permissions", set())

    row = db.execute(text("""
        SELECT
            COUNT(*)                                                              AS total_count,
            COALESCE(SUM(prod_stock_qty * prod_cost_price), 0)                    AS stock_value,
            COUNT(*) FILTER (WHERE prod_stock_qty <= prod_low_stock_alert)        AS low_stock_count,
            COUNT(*) FILTER (WHERE prod_stock_qty = 0)                            AS out_of_stock_count
        FROM products
        WHERE business_id = CAST(:bid AS uuid)
          AND is_deleted  = false
    """), {"bid": bid}).fetchone()

    return success_response({
        "total_count":       int(row.total_count),
        "stock_value":       float(row.stock_value) if show_profit else None,
        "low_stock_count":   int(row.low_stock_count),
        "out_of_stock_count": int(row.out_of_stock_count),
    })


# ══════════════════════════════════════════════════════════════════
# GET /products/search → Lean product search for sales entry
#
# WHY THIS EXISTS (performance):
#   The full GET /products endpoint JOINs profiles twice (created_by + updated_by),
#   JOINs categories, and returns audit fields — all useless during invoice creation.
#   For live search while typing in the sales form, we only need 8 fields.
#   This endpoint skips all JOINs and returns a flat lean payload.
#
# SCALABILITY:
#   Both prod_name and barcode have GIN trigram indexes — ILIKE on either field
#   hits the index. LIMIT 20 hard cap means response size is always bounded.
#   Works correctly at 1,000 / 10,000 / 100,000 / 1,000,000+ product catalogs.
#
# DECLARED BEFORE /barcode/{code} AND /{prod_id}:
#   FastAPI matches routes top-down. "search" must be declared before {prod_id}
#   or the literal string "search" would be treated as a UUID and fail parsing.
# ══════════════════════════════════════════════════════════════════
@router.get("/search")
def search_products_lean(
    q:            str           = Query(default="", description="Search by name or barcode (min 2 chars)"),
    limit:        int           = Query(default=20,  ge=1, le=50, description="Max results to return"),
    current_user: dict          = Depends(require_permission("products.view")),
    db:           Session       = Depends(get_db)
):
    """
    Lean product search for the sales creation form.
    Returns only the fields needed to add a line item: no audit fields, no JOINs to profiles.
    Minimum 2 characters required to prevent accidental full-table scans.
    """
    business_id = current_user["business_id"]

    # Require at least 2 characters — empty / single-char queries return nothing
    # to prevent full-table ILIKE scans on large catalogs.
    q = q.strip()
    if len(q) < 2:
        return success_response([])

    rows = db.execute(
        text("""
            SELECT
                p.prod_id,
                p.prod_name,
                p.prod_sell_price,
                p.prod_mrp,
                p.tax_rate,
                p.barcode,
                p.unit,
                p.prod_stock_qty
            FROM products p
            WHERE p.business_id = CAST(:bid AS uuid)
              AND p.is_deleted   = false
              AND (
                    p.prod_name ILIKE :q
                 OR p.barcode   ILIKE :q
              )
            ORDER BY p.prod_name ASC
            LIMIT :lim
        """),
        {
            "bid": business_id,
            "q":   f"%{q}%",
            "lim": limit,
        }
    ).fetchall()

    return success_response([
        {
            "prod_id":         str(r.prod_id),
            "prod_name":       r.prod_name,
            "prod_sell_price": float(r.prod_sell_price),
            "prod_mrp":        float(r.prod_mrp) if r.prod_mrp is not None else None,
            "tax_rate":        float(r.tax_rate) if r.tax_rate is not None else 0,
            "barcode":         r.barcode,
            "unit":            r.unit,
            "prod_stock_qty":  r.prod_stock_qty,
        }
        for r in rows
    ])


# ══════════════════════════════════════════════════════════════════
# GET /products/barcode/{code} → Lookup product by exact barcode
# ══════════════════════════════════════════════════════════════════
# DECLARED BEFORE /{prod_id}: FastAPI matches routes top-down. If this route
# were below /{prod_id}, the string "barcode" in the URL would be passed as
# prod_id and fail UUID parsing.
#
# Used by: CreateSalePage scanner for hardware barcode gun input.
# Returns 404 when no active product with this barcode exists in this business.
# Scoped to caller's business_id — no cross-tenant data leakage.
#
# PERF FIX (2026-06):
#   Old query joined categories + profiles × 2 and returned the full
#   row_to_dict() payload (18+ fields including audit fields).
#   The sales form only needs 7 fields to add a line item.
#   Two LEFT JOINs to profiles are eliminated — each JOIN is a
#   separate index scan on the profiles table.
#   In a retail environment with rapid barcode scanning, every
#   millisecond of scan latency is felt by the cashier.
#
#   Fields returned: prod_id, prod_name, prod_sell_price, prod_mrp,
#                    tax_rate, barcode, unit, prod_stock_qty
#   These are identical to the /products/search lean response.
@router.get("/barcode/{code}")
def get_product_by_barcode(
    code: str,
    current_user: dict = Depends(require_permission("products.view")),
    db: Session = Depends(get_db)
):
    business_id = current_user["business_id"]

    # PERF: No profile JOINs, no category JOIN, no audit fields.
    # Uses idx_products_business_barcode_active (business_id, barcode)
    # partial index for a single index scan — no heap access needed.
    row = db.execute(
        text("""
            SELECT
                p.prod_id,
                p.prod_name,
                p.prod_sell_price,
                p.prod_mrp,
                p.tax_rate,
                p.barcode,
                p.unit,
                p.prod_stock_qty
            FROM products p
            WHERE p.business_id = CAST(:business_id AS uuid)
              AND p.barcode      = :barcode
              AND p.is_deleted   = false
            LIMIT 1
        """),
        {"business_id": business_id, "barcode": code.strip()}
    ).fetchone()

    if not row:
        return error_response(f"No product found with barcode: {code}", status_code=404)

    return success_response({
        "prod_id":         str(row.prod_id),
        "prod_name":       row.prod_name,
        "prod_sell_price": float(row.prod_sell_price),
        "prod_mrp":        float(row.prod_mrp) if row.prod_mrp is not None else None,
        "tax_rate":        float(row.tax_rate) if row.tax_rate is not None else 0,
        "barcode":         row.barcode,
        "unit":            row.unit,
        "prod_stock_qty":  row.prod_stock_qty,
    })


# ══════════════════════════════════════════════════════════════════
# GET /products/{prod_id} → Single product WITH full history
# ══════════════════════════════════════════════════════════════════
@router.get("/{prod_id}")
def get_product(
    prod_id: str,
    current_user: dict = Depends(require_permission("products.view")),
    db: Session = Depends(get_db)
):
    business_id = current_user["business_id"]
    show_profit = PROFIT_PERMISSION in current_user.get("permissions", set())

    row = db.execute(
        text("""
            SELECT
                p.prod_id, p.business_id, p.category_id, p.prod_name,
                p.prod_sell_price, p.prod_mrp,
                p.prod_cost_price, p.prod_profit,
                p.prod_stock_qty, p.prod_low_stock_alert, p.tax_rate,
                p.tax_code, p.barcode, p.unit, p.is_deleted,
                p.prod_created_at, p.updated_at,
                p.created_by,  p.updated_by,
                c.category_name,
                pr1.full_name AS last_updated_by,
                pr2.full_name AS created_by_name
            FROM products p
            LEFT JOIN categories c   ON c.category_id  = p.category_id
            LEFT JOIN profiles   pr1 ON pr1.id = p.updated_by
            LEFT JOIN profiles   pr2 ON pr2.id = p.created_by
            WHERE p.prod_id     = CAST(:prod_id AS uuid)
              AND p.business_id = CAST(:bid AS uuid)
              AND p.is_deleted  = false
        """),
        {"prod_id": prod_id, "bid": business_id}
    ).fetchone()

    if not row:
        return error_response("Product not found", status_code=404)

    stock_rows = db.execute(
        text("""
            SELECT
                sm.move_id,
                sm.move_type,
                sm.move_qty,
                sm.move_prev_stock,
                sm.move_new_stock,
                sm.reference_type,
                sm.reference_id,
                sm.sale_reference_id,
                sm.purchase_reference_id,
                sm.move_notes,
                sm.move_created_at,
                COALESCE(p.full_name, 'System') AS changed_by,
                s.invoice_no
            FROM stock_movements sm
            LEFT JOIN profiles p ON p.id = sm.move_created_by
            LEFT JOIN sales    s ON s.sales_id = sm.sale_reference_id
            WHERE sm.product_id  = CAST(:prod_id AS uuid)
              AND sm.business_id = CAST(:bid AS uuid)
            ORDER BY sm.move_created_at DESC
            LIMIT 100
        """),
        {"prod_id": prod_id, "bid": business_id}
    ).fetchall()

    stock_history = []
    for s in stock_rows:
        if s.move_qty > 0:
            direction = "in"
        elif s.move_qty < 0:
            direction = "out"
        else:
            direction = "none"

        type_label_map = {
            "sale":             "Sold to customer",
            "purchase":         "Received from supplier",
            "adjustment":       "Manual stock adjustment",
            "stock_override":   "System-generated stock increase to allow a sale exceeding available inventory",
            "sales_return":     "Customer return — stock added back",
            "purchase_return":  "Returned to supplier — stock removed",
        }
        event_label = type_label_map.get(s.move_type, s.move_type)

        stock_history.append({
            "move_id":               str(s.move_id),
            "event":                 event_label,
            "move_type":             s.move_type,
            "direction":             direction,
            "qty_changed":           abs(s.move_qty),
            "stock_before":          s.move_prev_stock,
            "stock_after":           s.move_new_stock,
            "reference_type":        s.reference_type,
            "reference_id":          str(s.reference_id) if s.reference_id else None,
            "sale_reference_id":     str(s.sale_reference_id) if s.sale_reference_id else None,
            "purchase_reference_id": str(s.purchase_reference_id) if s.purchase_reference_id else None,
            "notes":                 s.move_notes,
            "changed_by":            s.changed_by,
            "changed_at":            fmt_ts(s.move_created_at),
            "invoice_no":            s.invoice_no if s.invoice_no else None,
        })

    price_history = []

    if show_profit:
        audit_rows = db.execute(
            text("""
                SELECT
                    al.audit_id,
                    al.action_type,
                    al.old_data,
                    al.new_data,
                    al.created_at,
                    COALESCE(p.full_name, 'System') AS changed_by
                FROM audit_logs al
                LEFT JOIN profiles p ON p.id = al.user_id
                WHERE al.table_name  = 'products'
                  AND al.record_id   = CAST(:prod_id AS uuid)
                  AND al.business_id = CAST(:bid AS uuid)
                  AND al.action_type = 'update'
                ORDER BY al.created_at DESC
            """),
            {"prod_id": prod_id, "bid": business_id}
        ).fetchall()

        for a in audit_rows:
            old_data = a.old_data or {}
            new_data = a.new_data or {}

            old_sell = old_data.get("prod_sell_price")
            new_sell = new_data.get("prod_sell_price")
            old_cost = old_data.get("prod_cost_price")
            new_cost = new_data.get("prod_cost_price")

            def to_float(v):
                try:
                    return float(v) if v is not None else None
                except (TypeError, ValueError):
                    return None

            old_sell = to_float(old_sell)
            new_sell = to_float(new_sell)
            old_cost = to_float(old_cost)
            new_cost = to_float(new_cost)

            sell_changed = old_sell is not None and new_sell is not None and old_sell != new_sell
            cost_changed = old_cost is not None and new_cost is not None and old_cost != new_cost

            if not sell_changed and not cost_changed:
                continue

            changes = []
            if sell_changed:
                changes.append({
                    "field":      "prod_sell_price",
                    "label":      "Selling Price",
                    "old_value":  old_sell,
                    "new_value":  new_sell,
                    "difference": round(new_sell - old_sell, 2)
                })
            if cost_changed:
                changes.append({
                    "field":      "prod_cost_price",
                    "label":      "Cost Price",
                    "old_value":  old_cost,
                    "new_value":  new_cost,
                    "difference": round(new_cost - old_cost, 2)
                })

            price_history.append({
                "audit_id":   str(a.audit_id),
                "changes":    changes,
                "changed_by": a.changed_by,
                "changed_at": fmt_ts(a.created_at)
            })

    total_sold     = sum(abs(s["qty_changed"]) for s in stock_history if s["move_type"] == "sale")
    total_received = sum(s["qty_changed"]      for s in stock_history if s["move_type"] == "purchase")
    total_returned = sum(s["qty_changed"]      for s in stock_history if s["move_type"] == "sales_return")

    return success_response({
        **row_to_dict(row, show_profit=show_profit),

        "history_summary": {
            "total_units_sold":     total_sold,
            "total_units_received": total_received,
            "total_units_returned": total_returned,
            "price_change_count":   len(price_history),
            "stock_event_count":    len(stock_history)
        },

        "stock_history":      stock_history,
        "stock_history_has_more": len(stock_history) == 100,
        "price_history":  price_history,
        "can_view_profit": show_profit,
    })


# ─────────────────────────────────────────
# PUT /products/{prod_id} → Update product
# ─────────────────────────────────────────
# Sets updated_by = current_user["user_id"].
# DB trigger fn_set_updated_at auto-sets updated_at on commit.
# created_by is NEVER changed — it records the original creator.
@router.put("/{prod_id}")
def update_product(
    prod_id: str,
    data: ProductUpdate,
    current_user: dict = Depends(require_permission("products.edit")),
    db: Session = Depends(get_db)
):
    business_id = current_user["business_id"]
    show_profit = PROFIT_PERMISSION in current_user.get("permissions", set())

    product = db.query(Product).filter(
        Product.prod_id      == prod_id,
        Product.business_id  == business_id,
        Product.is_deleted   == False
    ).first()

    if not product:
        return error_response("Product not found", status_code=404)

    # ── Validate category if being updated ───────────────────────────────────
    if data.category_id:
        category = db.query(Category).filter(
            Category.category_id == data.category_id,
            Category.business_id == business_id,
            Category.is_deleted  == False
        ).first()
        if not category:
            return error_response("Category not found", status_code=404)
        product.category_id = data.category_id

    # ── Duplicate name check on update ───────────────────────────────────────
    # Only runs when the caller is actually changing the name.
    # exclude_id = prod_id so a product isn't flagged as a duplicate of itself
    # (i.e. editing "Laptop" and saving as "Laptop" again is fine).
    if data.prod_name is not None:
        dup = _find_duplicate_name(db, business_id, data.prod_name, exclude_id=prod_id)
        if dup:
            return error_response("A product with this name already exists.", 400)
        product.prod_name = data.prod_name   # already stripped by schema validator

    if data.prod_sell_price      is not None: product.prod_sell_price      = data.prod_sell_price
    # MRP FEATURE: allow clearing MRP by passing 0 or null; allow setting/updating it
    if data.prod_mrp             is not None: product.prod_mrp             = data.prod_mrp if data.prod_mrp > 0 else None
    if data.prod_cost_price      is not None: product.prod_cost_price      = data.prod_cost_price
    if data.prod_low_stock_alert is not None: product.prod_low_stock_alert = data.prod_low_stock_alert
    if data.tax_rate             is not None: product.tax_rate             = data.tax_rate
    if data.tax_code             is not None: product.tax_code             = data.tax_code
    # ── Barcode update with duplicate check (BARCODE FIX) ──────────────────────
    # Passing barcode="" or None clears the barcode (allowed on PUT).
    # Non-empty barcodes are validated for uniqueness before saving.
    if data.barcode is not None:
        clean_bc = data.barcode.strip() if data.barcode else None
        if clean_bc:
            dup_bc = _find_duplicate_barcode(db, business_id, clean_bc, exclude_id=prod_id)
            if dup_bc:
                return error_response("A product with this barcode already exists.", 400)
        product.barcode = clean_bc or None
    if data.unit                 is not None: product.unit                 = data.unit

    # Track who last updated — created_by is intentionally left unchanged
    product.updated_by = current_user["user_id"]

    try:
        db.commit()
    except IntegrityError as e:
        db.rollback()
        err_str = str(e.orig).lower()
        if "uix_products_name_business" in err_str:
            return error_response("A product with this name already exists.", 400)
        return error_response("A product with this barcode already exists.", 400)

    db.refresh(product)

    row = get_product_with_profit(db, product.prod_id, business_id)

    return success_response({
        "message": "Product updated successfully",
        "product": row_to_dict(row, show_profit=show_profit)
    })


# ─────────────────────────────────────────
# DELETE /products/{prod_id} → Soft delete
# ─────────────────────────────────────────
@router.delete("/{prod_id}")
def delete_product(
    prod_id: str,
    current_user: dict = Depends(require_permission("products.edit")),
    db: Session = Depends(get_db)
):
    business_id = current_user["business_id"]

    product = db.query(Product).filter(
        Product.prod_id     == prod_id,
        Product.business_id == business_id,
        Product.is_deleted  == False
    ).first()

    if not product:
        return error_response("Product not found", status_code=404)

    product.is_deleted = True
    product.updated_by = current_user["user_id"]
    db.commit()

    return success_response({"message": "Product deleted successfully"})