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
#
# ── ASYNC MIGRATION NOTE (2026-07) ──────────────────────────────────────────
#
# This router was migrated from sync SQLAlchemy (psycopg2) to async
# (asyncpg).  Key patterns to be aware of:
#
#   - All Session usage → AsyncSession (get_async_db dependency).
#   - db.execute(...) → await db.execute(...).
#   - paginate() → paginate_async() (avoids opening a second sync conn).
#   - SET LOCAL with bind params is NOT supported by asyncpg (server-side
#     binding sends $1 which SET grammar rejects).  All GUC-setting uses
#     set_config() instead — see middleware/rbac.py for the canonical pattern.
#   - paginate_async lives in utils/pagination.py and is shared by all
#     async routers (customer, product, sale).  Don't add a local copy.
#
# ─────────────────────────────────────────────────────────────────────────────

from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query, Request, File, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import func, select, text
from app.database import get_async_db
from app.middleware.rbac import require_permission, get_current_user_with_permissions, async_set_rls_gucs_after_commit
from app.models.product import Product
from app.models.category import Category
from app.schemas.product import ProductCreate, ProductUpdate
from app.utils.response import success_response, error_response
from app.utils.pagination import paginate_async, pagination_response
from app.utils.queries import fetch_stock_kpi_counts_async
from app.utils.timestamp import fmt_ts
from app.utils.usage_limits import check_create_allowed_async, fetch_subscription_type_async
from app.utils.subscription_features import check_feature_access
from app.utils.bulk_import import parse_csv_file, validate_rows, check_bulk_create_allowed, friendly_db_error, check_required_headers, validate_upload_file, MAX_IMPORT_FILE_BYTES
from app.schemas.validators import strip_and_escape_html, strip_and_escape_csv_value
from sqlalchemy.exc import IntegrityError
from typing import Optional
import uuid

router = APIRouter(prefix="/v1/products", tags=["Products"])

REQUIRED_PRODUCT_COLUMNS = [
    {"names": ["prod_name", "name", "Product Name"]},
    {"names": ["category_name", "Category", "Category Name"]},
    {"names": ["prod_sell_price", "sell_price", "Sell Price"]},
    {"names": ["prod_cost_price", "cost_price", "Cost Price"]},
]

# ── Permission code constant ─────────────────────────────────────────────────
PROFIT_PERMISSION = "view_product_profit"


# ── Helper: fetch one product row — all fields + both JOIN names ───────────
async def get_product_with_profit(db: AsyncSession, prod_id, business_id: str):
    row = (await db.execute(
        text("""
            SELECT
                p.prod_id, p.business_id, p.category_id, p.prod_name,
                p.prod_sell_price, p.prod_mrp,
                p.prod_cost_price,
                (p.prod_sell_price - p.prod_cost_price) AS prod_profit,
                CASE WHEN p.prod_sell_price > 0
                  THEN ROUND(((p.prod_sell_price - p.prod_cost_price) / p.prod_sell_price) * 100, 2)
                  ELSE 0
                END AS prod_profit_margin,
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
              AND p.is_deleted = false
        """),
        {"prod_id": str(prod_id), "bid": business_id}
    )).fetchone()
    return row


# ── Helper: format one product row as a dict ──────────────────────────────
def row_to_dict(row, show_profit: bool = True, include_audit: bool = True):
    """Convert a product query row to a JSON-safe dict.

    show_profit  — when False, cost_price and profit are omitted (non-admin staff).
    include_audit — when False, created_by/created_by_name are omitted; used by
                     the list endpoint which doesn't JOIN the profiles table for
                     created_by (saves one JOIN).  The detail endpoint passes
                     True (default) since it already JOINs both pr1 and pr2.
    """
    d = {
        "prod_id":              str(row.prod_id),
        "business_id":          str(row.business_id),
        "category_id":          str(row.category_id) if row.category_id else None,
        "category_name":        row.category_name if row.category_name else None,
        "prod_name":            row.prod_name,
        "prod_sell_price":      float(row.prod_sell_price),
        # MRP FEATURE: None when not set — frontend treats None as "no MRP"
        "prod_mrp":             float(row.prod_mrp) if row.prod_mrp is not None else None,
        "prod_cost_price":      float(row.prod_cost_price) if show_profit else None,
        "prod_profit":          float(row.prod_profit) if show_profit else None,
        "prod_profit_margin":   float(row.prod_profit_margin) if show_profit else None,
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
    # is_deleted is only selected by the detail query (get_product_with_profit);
    # list queries filter it out and don't SELECT it, so guard with hasattr.
    if hasattr(row, "is_deleted"):
        d["is_deleted"] = row.is_deleted
    if include_audit:
        d["created_by"] = str(row.created_by) if row.created_by else None
        d["created_by_name"] = row.created_by_name if row.created_by_name else None
    return d


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
async def _find_duplicate_name(
    db:         AsyncSession,
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
    return (await db.execute(text(sql), params)).fetchone()



# ── Helper: check for duplicate barcode within a business ────────────────────
# Returns the conflicting prod_id (truthy) if a duplicate exists, else None.
# Only called when barcode is a non-empty string.
# exclude_id: pass the current prod_id on PUT so a product is not flagged as
#             a duplicate of its own unchanged barcode.
# Exact = match (not ILIKE): barcodes are case-sensitive. Also hits the
# btree index (business_id, barcode) directly — no full table scan.
async def _find_duplicate_barcode(
    db:          AsyncSession,
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
    return (await db.execute(text(sql), params)).fetchone()


# ─────────────────────────────────────────
# POST /products → Create new product
# ─────────────────────────────────────────
@router.post("/")
async def create_product(
    data: ProductCreate,
    current_user: dict = Depends(require_permission("products.edit")),
    db: AsyncSession = Depends(get_async_db)
):
    business_id = current_user["business_id"]
    show_profit = check_feature_access(current_user, "product_profit_view")["allowed"]

    # ── 0. Subscription tier limit check ──────────────────────────────────────
    sub_type = current_user.get("subscription_type") or await fetch_subscription_type_async(db, business_id)
    allowed, msg = await check_create_allowed_async(db, business_id, sub_type, "max_products", "products")
    if not allowed:
        return error_response(msg, status_code=403)

    # ── 1. Validate category belongs to this business ─────────────────────────
    if data.category_id:
        category = (await db.execute(select(Category).where(
            Category.category_id == data.category_id,
            Category.business_id == business_id,
            Category.is_deleted == False
        ))).scalar_one_or_none()
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
    dup = await _find_duplicate_name(db, business_id, data.prod_name)
    if dup:
        return error_response("A product with this name already exists.", 400)

    # ── 3. Duplicate barcode check (BARCODE FIX) ──────────────────────────────
    # Only runs when a barcode was actually supplied. Empty/None barcodes are
    # allowed on multiple products — not every product has a barcode.
    if data.barcode and data.barcode.strip():
        data.barcode = data.barcode.strip()
        dup_bc = await _find_duplicate_barcode(db, business_id, data.barcode)
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
        prod_created_at       = datetime.now(timezone.utc).replace(tzinfo=None),
        created_by            = current_user["user_id"],
        updated_by            = current_user["user_id"],
    )

    try:
        db.add(new_product)
        await db.flush()  # assign prod_id while session is still open
        new_prod_id = new_product.prod_id
        await db.commit()
    except IntegrityError as e:
        await db.rollback()
        # Distinguish between the two unique constraints so the user gets
        # a precise error message rather than a generic one.
        err_str = str(e.orig).lower()
        if "uix_products_name_business" in err_str:
            # Race condition: another request inserted the same name between
            # our check above and our INSERT. Extremely rare but handled.
            return error_response("A product with this name already exists.", 400)
        # Default → barcode uniqueness violation
        return error_response("A product with this barcode already exists.", 400)

    # Re-set GUCs after commit (SET LOCAL is transaction-scoped)
    await async_set_rls_gucs_after_commit(db, current_user)

    row = await get_product_with_profit(db, new_prod_id, business_id)

    return success_response({
        "message": "Product created successfully",
        "product": row_to_dict(row, show_profit=show_profit)
    }, 201)


# ══════════════════════════════════════════════════════════════════
# POST /products/import → Bulk import products from CSV
# ══════════════════════════════════════════════════════════════════
@router.post("/import/")
@router.post("/import")
async def import_products(
    file: UploadFile = File(...),
    current_user: dict = Depends(require_permission("products.edit")),
    db: AsyncSession = Depends(get_async_db)
):
    business_id = current_user["business_id"]
    user_id = current_user["user_id"]

    # ── 0. Validate upload file type & size ───────────────────────────────────
    file_error = validate_upload_file(file)
    if file_error:
        return error_response(file_error, 400)

    # ── 1. Parse CSV ──────────────────────────────────────────────────────────
    file_bytes = await file.read()

    if len(file_bytes) > MAX_IMPORT_FILE_BYTES:
        return error_response("File is too large — maximum 5 MB.", 400)

    rows, fieldnames, parse_error = parse_csv_file(file_bytes)
    if parse_error:
        return error_response(parse_error, 400)

    header_error = check_required_headers(fieldnames, REQUIRED_PRODUCT_COLUMNS)
    if header_error:
        return error_response(header_error, 400)

    # ── 2. Row transform: validate & sanitize each row ────────────────────────
    def row_transform(row: dict, row_num: int):
        # Required field: prod_name
        name = (row.get("prod_name") or row.get("name") or row.get("Product Name") or "").strip()
        if not name:
            return None, "Product Name is required"

        category_name = (row.get("category_name") or row.get("Category") or "").strip()
        if not category_name:
            return None, "Category is required"

        sell_price = row.get("prod_sell_price") or row.get("sell_price") or row.get("Sell Price")
        if sell_price is None or str(sell_price).strip() == "":
            return None, "Sell Price is required"

        cost_price = row.get("prod_cost_price") or row.get("cost_price") or row.get("Cost Price")
        if cost_price is None or str(cost_price).strip() == "":
            return None, "Cost Price is required"

        # Optional fields with sanitization
        mrp = row.get("prod_mrp") or row.get("mrp") or row.get("MRP")
        stock_qty = row.get("prod_stock_qty") or row.get("stock_qty") or row.get("Stock Qty") or "0"
        low_stock_alert = row.get("prod_low_stock_alert") or row.get("low_stock_alert") or row.get("Low Stock Alert") or "10"
        tax_rate = row.get("tax_rate") or row.get("Tax Rate") or "0"
        tax_code = (row.get("tax_code") or row.get("Tax Code") or "").strip() or None
        barcode = (row.get("barcode") or row.get("Barcode") or "").strip() or None
        unit = (row.get("unit") or row.get("Unit") or "pcs").strip()

        # Sanitize strings (CSV-safe: strips formula-injection characters)
        name = strip_and_escape_csv_value(name)
        category_name = strip_and_escape_csv_value(category_name)
        if tax_code:
            tax_code = strip_and_escape_csv_value(tax_code)
        if barcode:
            barcode = strip_and_escape_csv_value(barcode)
        if unit:
            unit = strip_and_escape_csv_value(unit)

        # Validate numeric fields
        try:
            sell_price = float(sell_price)
            cost_price = float(cost_price)
            mrp = float(mrp) if mrp is not None and mrp != "" else None
            stock_qty = int(float(stock_qty)) if stock_qty is not None and stock_qty != "" else 0
            low_stock_alert = int(float(low_stock_alert)) if low_stock_alert is not None and low_stock_alert != "" else 10
            tax_rate = float(tax_rate) if tax_rate is not None and tax_rate != "" else 0.0
        except ValueError:
            return None, "invalid numeric value in price, stock, or tax fields"

        if sell_price < 0 or cost_price < 0 or (mrp is not None and mrp < 0):
            return None, "prices cannot be negative"
        if stock_qty < 0 or low_stock_alert < 0:
            return None, "stock quantities cannot be negative"
        if tax_rate < 0 or tax_rate > 100:
            return None, "tax_rate must be between 0 and 100"

        return {
            "prod_name": name,
            "category_name": category_name,
            "prod_sell_price": sell_price,
            "prod_cost_price": cost_price,
            "prod_mrp": mrp,
            "prod_stock_qty": stock_qty,
            "prod_low_stock_alert": low_stock_alert,
            "tax_rate": tax_rate,
            "tax_code": tax_code,
            "barcode": barcode,
            "unit": unit,
            "_row_number": row_num
        }, None

    valid_rows, errors = validate_rows(rows, row_transform)

    # ── 3. Check bulk create tier limit ───────────────────────────────────────
    sub_type = current_user.get("subscription_type") or await fetch_subscription_type_async(db, business_id)
    allowed_count, limit_msg = await check_bulk_create_allowed(
        db, business_id, sub_type, "max_products", "products", len(valid_rows)
    )
    if allowed_count == 0:
        return error_response(limit_msg, 403)

    # Trim valid_rows to allowed_count if partial import
    if allowed_count < len(valid_rows):
        valid_rows = valid_rows[:allowed_count]
        errors.append({"row": 0, "message": limit_msg})

    # ── 4. Resolve category names to category_ids (batch) ─────────────────────
    category_map = {}  # category_name (lower) -> category_id
    if valid_rows:
        category_names = list(set(r["category_name"] for r in valid_rows if r.get("category_name")))
        if category_names:
            placeholders = ", ".join([f":cat_{i}" for i in range(len(category_names))])
            params = {"bid": business_id}
            for i, cn in enumerate(category_names):
                params[f"cat_{i}"] = cn

            cat_rows = (await db.execute(text(f"""
                SELECT category_id, category_name
                FROM categories
                WHERE business_id = CAST(:bid AS uuid)
                  AND category_name IN ({placeholders})
                  AND is_deleted = false
            """), params)).fetchall()

            for r in cat_rows:
                category_map[r.category_name.lower()] = str(r.category_id)

    # ── 4b. Verify every row's category exists — reject unmatched names ─────
    unmatched_cat_errors = []
    filtered_rows = []
    for r in valid_rows:
        cat_name = r.get("category_name")
        if cat_name and cat_name.lower() not in category_map:
            unmatched_cat_errors.append({
                "row": r["_row_number"],
                "message": f'Category "{cat_name}" does not exist. Leave this column blank to import without a category, or add the category first.'
            })
        else:
            filtered_rows.append(r)

    if unmatched_cat_errors:
        errors.extend(unmatched_cat_errors)
    valid_rows = filtered_rows

    if not valid_rows:
        return success_response({
            "message": f"Import completed: 0 created, 0 updated, {len(errors)} errors",
            "summary": {"total_rows": 0, "valid_rows": 0, "created": 0, "updated": 0, "errors": len(errors)},
            "errors": errors
        })

    # ── 5. Fetch existing product names & barcodes for duplicate detection (batch) ──────
    existing_names = {}
    existing_barcodes = {}
    if valid_rows:
        name_list = [r["prod_name"] for r in valid_rows]
        barcode_list = [r["barcode"] for r in valid_rows if r.get("barcode")]

        if name_list:
            placeholders = ", ".join([f":name_{i}" for i in range(len(name_list))])
            params = {"bid": business_id}
            for i, n in enumerate(name_list):
                params[f"name_{i}"] = n.lower()

            existing_rows = (await db.execute(text(f"""
                SELECT prod_id, LOWER(prod_name) as lname
                FROM products
                WHERE business_id = CAST(:bid AS uuid)
                  AND LOWER(prod_name) IN ({placeholders})
                  AND is_deleted = false
            """), params)).fetchall()

            for r in existing_rows:
                existing_names[r.lname] = str(r.prod_id)

        if barcode_list:
            placeholders = ", ".join([f":bc_{i}" for i in range(len(barcode_list))])
            params = {"bid": business_id}
            for i, b in enumerate(barcode_list):
                params[f"bc_{i}"] = b

            existing_rows = (await db.execute(text(f"""
                SELECT prod_id, barcode
                FROM products
                WHERE business_id = CAST(:bid AS uuid)
                  AND barcode IN ({placeholders})
                  AND is_deleted = false
            """), params)).fetchall()

            for r in existing_rows:
                existing_barcodes[r.barcode] = str(r.prod_id)

    # ── 6. Batch upsert — single multi-row INSERT + UPDATE ─────────────────────
    # Same batch pattern as customer/supplier.py, but more complex:
    #   - Duplicate key = prod_name (lowercased), with secondary barcode dedup
    #   - category_name resolved to category_id via category_map (can be None → NULL)
    #   - prod_profit is DB-generated (computed column) — excluded from INSERT
    #   - 11 updatable columns vs 7 in customer/supplier
    #   - category_id uses CAST(:param AS uuid) (handles NULL → NULL safely in PG)
    new_rows = []
    update_rows = []
    upsert_errors = []
    # Track barcodes seen in this import batch to catch in-file duplicates
    # before they hit the DB (complements existing_barcodes from DB lookup).
    batch_barcodes = {}
    # Track product names seen in this import file to catch in-file duplicates.
    # If two rows share the same name, only the first is used — the later
    # duplicate is skipped with a clear error message.
    seen_in_file_names = {}

    for row in valid_rows:
        row_num = row.pop("_row_number")
        name = row["prod_name"]
        name_lower = name.lower()
        barcode = row.get("barcode")
        category_name = row.get("category_name")
        category_id = category_map.get(category_name.lower()) if category_name else None

        # ── Barcode uniqueness pre-check ──────────────────────────────────────
        # Check both DB-existing barcodes AND in-batch duplicates. This prevents
        # DB-level IntegrityError (uix_products_barcode_business) entirely.
        if barcode:
            if barcode in existing_barcodes:
                upsert_errors.append({"row": row_num, "message": f'Barcode "{barcode}" is already used by another product.'})
                continue
            if barcode in batch_barcodes:
                upsert_errors.append({"row": row_num, "message": f'Barcode "{barcode}" is duplicated in this import file.'})
                continue

        # ── In-file name duplicate check ──────────────────────────────────────
        # Two rows in the same CSV sharing a product name → skip the later one.
        if name_lower in seen_in_file_names:
            upsert_errors.append({"row": row_num, "message": f'Duplicate product name "{name}" also appears on row {seen_in_file_names[name_lower]} — only the first occurrence will be imported.'})
            continue

        if name_lower in existing_names:
            update_rows.append({"pid": existing_names[name_lower], "uid": user_id, "cat_id": category_id, **row})
        else:
            new_prod_id = str(uuid.uuid4())
            new_rows.append({"pid": new_prod_id, "bid": business_id, "uid": user_id, "cat_id": category_id, **row})
            existing_names[name_lower] = new_prod_id
            seen_in_file_names[name_lower] = row_num
            if barcode:
                existing_barcodes[barcode] = new_prod_id
                batch_barcodes[barcode] = new_prod_id

    created = 0
    updated = 0

    # --- Per-row INSERT for new products (SAVEPOINT per row) ---
    # Each row gets its own SAVEPOINT via db.begin_nested(). If one row fails
    # (e.g. unforeseen unique constraint), only that row is rolled back — the
    # rest of the batch continues. This replaces the single multi-row INSERT
    # that would kill the entire batch on one conflict.
    # Excludes prod_profit — it's a DB-generated/computed column.
    for i, r in enumerate(new_rows):
        try:
            async with db.begin_nested():
                await db.execute(text("""
                    INSERT INTO products (
                        prod_id, business_id, category_id, prod_name,
                        prod_sell_price, prod_mrp, prod_cost_price,
                        prod_stock_qty, prod_low_stock_alert, tax_rate,
                        tax_code, barcode, unit,
                        prod_created_at, created_by, updated_by
                    ) VALUES (
                        CAST(:pid AS uuid), CAST(:bid AS uuid), CAST(:cat_id AS uuid),
                        :name, :sell_price, :mrp, :cost_price,
                        :stock_qty, :low_stock_alert, :tax_rate,
                        :tax_code, :barcode, :unit,
                        NOW(), CAST(:uid AS uuid), CAST(:uid AS uuid)
                    )
                """), {
                    "pid": r["pid"], "bid": business_id, "cat_id": r["cat_id"],
                    "name": r["prod_name"], "sell_price": r["prod_sell_price"],
                    "mrp": r["prod_mrp"], "cost_price": r["prod_cost_price"],
                    "stock_qty": r["prod_stock_qty"], "low_stock_alert": r["prod_low_stock_alert"],
                    "tax_rate": r["tax_rate"], "tax_code": r["tax_code"],
                    "barcode": r["barcode"], "unit": r["unit"], "uid": r["uid"],
                })
                created += 1
        except Exception as e:
            upsert_errors.append({"row": r.get("_row_number", i + 1), "message": friendly_db_error(e, context=f"product insert row {r.get('_row_number', i + 1)}")})

    # --- Per-row UPDATE for existing products (SAVEPOINT per row) ---
    # Same SAVEPOINT pattern as INSERT: one failed update doesn't kill the batch.
    for i, r in enumerate(update_rows):
        try:
            async with db.begin_nested():
                await db.execute(text("""
                    UPDATE products
                    SET prod_sell_price      = :sell_price,
                        prod_cost_price      = :cost_price,
                        prod_mrp             = :mrp,
                        prod_low_stock_alert = :low_stock_alert,
                        tax_rate             = :tax_rate,
                        tax_code             = :tax_code,
                        barcode              = :barcode,
                        unit                 = :unit,
                        category_id          = CAST(:cat_id AS uuid),
                        updated_by           = CAST(:uid AS uuid)
                    WHERE prod_id = CAST(:pid AS uuid)
                      AND business_id = CAST(:bid AS uuid)
                """), {
                    "pid": r["pid"], "bid": business_id,
                    "sell_price": r["prod_sell_price"], "cost_price": r["prod_cost_price"],
                    "mrp": r["prod_mrp"], "low_stock_alert": r["prod_low_stock_alert"],
                    "tax_rate": r["tax_rate"], "tax_code": r["tax_code"],
                    "barcode": r["barcode"], "unit": r["unit"],
                    "cat_id": r["cat_id"], "uid": r["uid"],
                })
                updated += 1
        except Exception as e:
            upsert_errors.append({"row": r.get("_row_number", i + 1), "message": friendly_db_error(e, context=f"product update row {r.get('_row_number', i + 1)}")})

    await db.commit()
    await async_set_rls_gucs_after_commit(db, current_user)

    all_errors = errors + upsert_errors

    return success_response({
        "message": f"Import completed: {created} created, {updated} updated, {len(all_errors)} errors",
        "summary": {
            "total_rows": len(rows),
            "valid_rows": len(valid_rows),
            "created": created,
            "updated": updated,
            "errors": len(all_errors)
        },
        "errors": all_errors
    })


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
async def get_all_products(
    current_user: dict          = Depends(require_permission("products.view")),
    db:           AsyncSession  = Depends(get_async_db),
    pagination:   dict          = Depends(paginate_async),
    search:       Optional[str] = Query(default=None, description="Search by name or barcode"),
    updated_from: Optional[str] = Query(default=None, description="Filter updated_at >= this date (YYYY-MM-DD)"),
    updated_to:   Optional[str] = Query(default=None, description="Filter updated_at <= this date (YYYY-MM-DD)"),
    sort_by:      Optional[str] = Query(default="prod_name", description="Column to sort by"),
    sort_dir:     Optional[str] = Query(default="asc",  description="asc or desc"),
):
    business_id = current_user["business_id"]
    show_profit = check_feature_access(current_user, "product_profit_view")["allowed"]

    # ── Whitelist sort column to prevent SQL injection ────────────────────────
    SORTABLE = {
        "prod_name":            "p.prod_name",
        "prod_sell_price":      "p.prod_sell_price",
        "prod_mrp":             "p.prod_mrp",
        "prod_cost_price":      "p.prod_cost_price",
        "prod_profit":          "(p.prod_sell_price - p.prod_cost_price)",
        "prod_profit_margin":   "CASE WHEN p.prod_sell_price > 0 THEN ROUND(((p.prod_sell_price - p.prod_cost_price) / p.prod_sell_price) * 100, 2) ELSE 0 END",
        "prod_stock_qty":       "p.prod_stock_qty",
        "tax_rate":             "p.tax_rate",
        "updated_at":           "p.updated_at",
        "prod_created_at":      "p.prod_created_at",
        "category_name":        "c.category_name",
    }
    if not show_profit:
        SORTABLE.pop("prod_cost_price", None)
        SORTABLE.pop("prod_profit", None)
        SORTABLE.pop("prod_profit_margin", None)
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
        params["updated_from"] = datetime.fromisoformat(updated_from.replace("Z", "+00:00"))

    if updated_to:
        extra_where += " AND p.updated_at <= :updated_to"
        params["updated_to"] = datetime.fromisoformat(updated_to.replace("Z", "+00:00"))

    rows = (await db.execute(
        text(f"""
            SELECT
                p.prod_id, p.business_id, p.category_id, p.prod_name,
                p.prod_sell_price, p.prod_mrp,
                p.prod_cost_price,
                (p.prod_sell_price - p.prod_cost_price) AS prod_profit,
                CASE WHEN p.prod_sell_price > 0
                  THEN ROUND(((p.prod_sell_price - p.prod_cost_price) / p.prod_sell_price) * 100, 2)
                  ELSE 0
                END AS prod_profit_margin,
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
    )).fetchall()

    total = rows[0].total_count if rows else 0

    return success_response(
        pagination_response(
            [row_to_dict(r, show_profit=show_profit, include_audit=False) for r in rows],
            total,
            pagination["page"],
            pagination["limit"],
            capped=pagination["_capped"]
        )
    )


# ── GET /products/summary → KPI cards for products page ─────────────
@router.get("/summary")
async def get_product_summary_kpi(
    current_user: dict = Depends(require_permission("products.view")),
    db: AsyncSession = Depends(get_async_db)
):
    bid = current_user["business_id"]
    show_profit = check_feature_access(current_user, "product_profit_view")["allowed"]

    counts = await fetch_stock_kpi_counts_async(db, bid)

    return success_response({
        "total_count":       counts["total_count"],
        "stock_value":       counts["stock_value"] if show_profit else None,
        "low_stock_count":   counts["low_stock_count"],
        "out_of_stock_count": counts["out_of_stock_count"],
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
async def search_products_lean(
    q:            str           = Query(default="", description="Search by name or barcode (min 2 chars)"),
    limit:        int           = Query(default=20,  ge=1, le=50, description="Max results to return"),
    current_user: dict          = Depends(require_permission("products.view")),
    db:           AsyncSession  = Depends(get_async_db)
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

    rows = (await db.execute(
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
    )).fetchall()

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
async def get_product_by_barcode(
    code: str,
    current_user: dict = Depends(require_permission("products.view")),
    db: AsyncSession = Depends(get_async_db)
):
    business_id = current_user["business_id"]

    # PERF: No profile JOINs, no category JOIN, no audit fields.
    # Uses idx_products_business_barcode_active (business_id, barcode)
    # partial index for a single index scan — no heap access needed.
    row = (await db.execute(
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
    )).fetchone()

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
async def get_product(
    prod_id: str,
    current_user: dict = Depends(require_permission("products.view")),
    db: AsyncSession = Depends(get_async_db)
):
    business_id = current_user["business_id"]
    show_profit = check_feature_access(current_user, "product_profit_view")["allowed"]

    row = (await db.execute(
        text("""
            SELECT
                p.prod_id, p.business_id, p.category_id, p.prod_name,
                p.prod_sell_price, p.prod_mrp,
                p.prod_cost_price,
                (p.prod_sell_price - p.prod_cost_price) AS prod_profit,
                CASE WHEN p.prod_sell_price > 0
                  THEN ROUND(((p.prod_sell_price - p.prod_cost_price) / p.prod_sell_price) * 100, 2)
                  ELSE 0
                END AS prod_profit_margin,
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
    )).fetchone()

    if not row:
        return error_response("Product not found", status_code=404)

    stock_rows = (await db.execute(
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
    )).fetchall()

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
        audit_rows = (await db.execute(
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
                LIMIT 100
            """),
            {"prod_id": prod_id, "bid": business_id}
        )).fetchall()

        # Safe float parser for audit old_data/new_data values.
        # Defined once outside the loop to avoid re-creating the closure
        # on every iteration.  Returns None for missing or unparseable values.
        def to_float(v):
            try:
                return float(v) if v is not None else None
            except (TypeError, ValueError):
                return None

        for a in audit_rows:
            old_data = a.old_data or {}
            new_data = a.new_data or {}

            old_sell = to_float(old_data.get("prod_sell_price"))
            new_sell = to_float(new_data.get("prod_sell_price"))
            old_cost = to_float(old_data.get("prod_cost_price"))
            new_cost = to_float(new_data.get("prod_cost_price"))

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
async def update_product(
    prod_id: str,
    data: ProductUpdate,
    current_user: dict = Depends(require_permission("products.edit")),
    db: AsyncSession = Depends(get_async_db)
):
    business_id = current_user["business_id"]
    show_profit = check_feature_access(current_user, "product_profit_view")["allowed"]

    product = (await db.execute(select(Product).where(
        Product.prod_id      == prod_id,
        Product.business_id  == business_id,
        Product.is_deleted   == False
    ))).scalar_one_or_none()

    if not product:
        return error_response("Product not found", status_code=404)

    # ── Validate category if being updated ───────────────────────────────────
    if data.category_id:
        category = (await db.execute(select(Category).where(
            Category.category_id == data.category_id,
            Category.business_id == business_id,
            Category.is_deleted  == False
        ))).scalar_one_or_none()
        if not category:
            return error_response("Category not found", status_code=404)
        product.category_id = data.category_id

    # ── Duplicate name check on update ───────────────────────────────────────
    # Only runs when the caller is actually changing the name.
    # exclude_id = prod_id so a product isn't flagged as a duplicate of itself
    # (i.e. editing "Laptop" and saving as "Laptop" again is fine).
    if data.prod_name is not None:
        dup = await _find_duplicate_name(db, business_id, data.prod_name, exclude_id=prod_id)
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
            dup_bc = await _find_duplicate_barcode(db, business_id, clean_bc, exclude_id=prod_id)
            if dup_bc:
                return error_response("A product with this barcode already exists.", 400)
        product.barcode = clean_bc or None
    if data.unit                 is not None: product.unit                 = data.unit

    # Track who last updated — created_by is intentionally left unchanged
    product.updated_by = current_user["user_id"]

    try:
        await db.commit()
    except IntegrityError as e:
        await db.rollback()
        err_str = str(e.orig).lower()
        if "uix_products_name_business" in err_str:
            return error_response("A product with this name already exists.", 400)
        return error_response("A product with this barcode already exists.", 400)

    # Re-set GUCs after commit (SET LOCAL is transaction-scoped)
    await async_set_rls_gucs_after_commit(db, current_user)

    row = await get_product_with_profit(db, product.prod_id, business_id)

    return success_response({
        "message": "Product updated successfully",
        "product": row_to_dict(row, show_profit=show_profit)
    })


# ─────────────────────────────────────────
# DELETE /products/{prod_id} → Soft delete
# ─────────────────────────────────────────
@router.delete("/{prod_id}")
async def delete_product(
    prod_id: str,
    current_user: dict = Depends(require_permission("products.edit")),
    db: AsyncSession = Depends(get_async_db)
):
    business_id = current_user["business_id"]

    product = (await db.execute(select(Product).where(
        Product.prod_id     == prod_id,
        Product.business_id == business_id,
        Product.is_deleted  == False
    ))).scalar_one_or_none()

    if not product:
        return error_response("Product not found", status_code=404)

    product.is_deleted = True
    product.updated_by = current_user["user_id"]
    await db.commit()
    # RLS: SET LOCAL/set_config GUCs are transaction-scoped and are cleared
    # by this commit. Re-set them in case any future code adds a query after
    # this point (matches the convention in create_product, update_product).
    await async_set_rls_gucs_after_commit(db, current_user)

    return success_response({"message": "Product deleted successfully"})