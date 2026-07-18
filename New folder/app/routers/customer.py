# app/routers/customer.py
# OPTIMIZED VERSION
# Changes:
#   1. Added `search` query param to GET /customers/ — filters name, phone, email via ILIKE
#   2. Replaced N+1 per-sale loop in GET /customers/{id} with 3 batch SQL queries
#      (one for all items, one for all payment summaries, one for all returns)
#      reducing from 3*N queries to 3 fixed queries regardless of sales count
#   3. Pagination `le` raised to 100 (20 is default, 100 is max — removes need for limit=1000)
#   4. [NEW] customer_to_dict now returns updated_at + last_updated_by
#   5. [NEW] GET /customers/ batch-resolves last_updated_by names via profiles JOIN
#   6. [NEW] PUT /customers/{id} sets updated_by = current_user["user_id"],
#            fetches updater name, returns it in response
#            (DB trigger trg_customers_updated_at auto-sets updated_at on commit)
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
#   - Every await db.commit() must be followed by
#     await async_set_rls_gucs_after_commit(db, current_user) when further
#     queries follow in the same request.  set_config(is_local=true) values
#     are transaction-scoped and are cleared by Postgres on commit.
# ─────────────────────────────────────────────────────────────────────────────

from fastapi import APIRouter, Depends, Query, File, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text, select
from sqlalchemy.exc import IntegrityError
from app.database import get_async_db
from app.middleware.rbac import require_permission, async_set_rls_gucs_after_commit
from app.models.customer import Customer
from app.schemas.customer import CustomerCreate, CustomerUpdate
from app.utils.response import success_response, error_response
from app.utils.pagination import paginate_async, pagination_response
from app.utils.timestamp import fmt_ts
from app.utils.subscription_features import check_feature_access
from app.utils.usage_limits import check_create_allowed_async, fetch_subscription_type_async
from app.utils.bulk_import import parse_csv_file, validate_rows, check_bulk_create_allowed, chunk_list
from app.schemas.validators import strip_and_escape_html, strip_and_escape_csv_value
from typing import Optional
import uuid

router = APIRouter(prefix="/v1/customers", tags=["Customers"])


# ─────────────────────────────────────────
# HELPER — Format customer as dict
# Accepts optional last_updated_by name string (resolved by caller via JOIN).
# ─────────────────────────────────────────
def customer_to_dict(c, last_updated_by=None) -> dict:
    return {
        "cust_id":           str(c.cust_id),
        "business_id":       str(c.business_id),
        "cust_name":         c.cust_name,
        "cust_phone":        c.cust_phone,
        "cust_email":        c.cust_email,
        "cust_address":      c.cust_address,
        "cust_state":        c.cust_state,
        "cust_country_code": c.cust_country_code,
        "cust_tax_number":   c.cust_tax_number,
        "is_deleted":        c.is_deleted,
        "cust_created_at":   fmt_ts(c.cust_created_at),
        "updated_at":        fmt_ts(c.updated_at),
        "updated_by":        str(c.updated_by)      if c.updated_by      else None,
        "last_updated_by":   last_updated_by,
    }


# ══════════════════════════════════════════════════════════════════
# POST /customers → Create new customer
# ══════════════════════════════════════════════════════════════════
@router.post("/")
async def create_customer(
    data:         CustomerCreate,
    current_user: dict = Depends(require_permission("customers.manage")),
    db:           AsyncSession = Depends(get_async_db)
):
    business_id = current_user["business_id"]

    # ── Subscription tier limit check ─────────────────────────────────────────
    sub_type = current_user.get("subscription_type") or await fetch_subscription_type_async(db, business_id)
    allowed, msg = await check_create_allowed_async(db, business_id, sub_type, "max_customers", "customers")
    if not allowed:
        return error_response(msg, status_code=403)

    if data.cust_phone:
        existing = (await db.execute(select(Customer).where(
            Customer.business_id == business_id,
            Customer.cust_phone  == data.cust_phone,
            Customer.is_deleted  == False
        ))).scalar_one_or_none()
        if existing:
            return error_response("Customer with this phone already exists", 400)

    new_customer = Customer(
        business_id       = business_id,
        cust_name         = data.cust_name,
        cust_phone        = data.cust_phone,
        cust_email        = data.cust_email,
        cust_address      = data.cust_address,
        cust_state        = data.cust_state,
        cust_country_code = data.cust_country_code,
        cust_tax_number   = data.cust_tax_number,
        updated_by        = current_user["user_id"]   # Track who created this customer
    )

    db.add(new_customer)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        return error_response("Customer with this phone already exists", 400)
    # Re-set GUCs after commit (SET LOCAL is transaction-scoped)
    await async_set_rls_gucs_after_commit(db, current_user)
    await db.refresh(new_customer)

    # Fetch the creator's name so the table shows it immediately after creation
    creator_name = current_user.get("full_name")

    return success_response({
        "message":  "Customer created successfully",
        "customer": customer_to_dict(new_customer, last_updated_by=creator_name)
    }, status_code=201)


# ══════════════════════════════════════════════════════════════════
# POST /customers/import → Bulk import customers from CSV
# ══════════════════════════════════════════════════════════════════
@router.post("/import")
async def import_customers(
    file: UploadFile = File(...),
    current_user: dict = Depends(require_permission("customers.manage")),
    db: AsyncSession = Depends(get_async_db)
):
    business_id = current_user["business_id"]
    user_id = current_user["user_id"]

    # ── 1. Parse CSV ──────────────────────────────────────────────────────────
    file_bytes = await file.read()
    rows, parse_error = parse_csv_file(file_bytes)
    if parse_error:
        return error_response(parse_error, 400)

    # ── 2. Row transform: validate & sanitize each row ────────────────────────
    def row_transform(row: dict, row_num: int):
        # Required field: cust_name
        name = (row.get("cust_name") or row.get("name") or row.get("Customer Name") or "").strip()
        if not name:
            return None, "cust_name is required"

        # Optional fields with sanitization
        phone = (row.get("cust_phone") or row.get("phone") or row.get("Phone") or "").strip() or None
        email = (row.get("cust_email") or row.get("email") or row.get("Email") or "").strip() or None
        address = (row.get("cust_address") or row.get("address") or row.get("Address") or "").strip() or None
        state = (row.get("cust_state") or row.get("state") or row.get("State") or "").strip() or None
        country_code = (row.get("cust_country_code") or row.get("country_code") or row.get("Country Code") or "").strip() or None
        tax_number = (row.get("cust_tax_number") or row.get("tax_number") or row.get("Tax Number") or "").strip() or None

        # Sanitize all string fields (CSV-safe: strips formula-injection characters)
        name = strip_and_escape_csv_value(name)
        if phone:
            phone = strip_and_escape_csv_value(phone)
        if email:
            email = strip_and_escape_csv_value(email)
        if address:
            address = strip_and_escape_csv_value(address)
        if state:
            state = strip_and_escape_csv_value(state)
        if country_code:
            country_code = strip_and_escape_csv_value(country_code)
        if tax_number:
            tax_number = strip_and_escape_csv_value(tax_number)

        # Validate email format if provided
        if email and "@" not in email:
            return None, "invalid email format"

        return {
            "cust_name": name,
            "cust_phone": phone,
            "cust_email": email,
            "cust_address": address,
            "cust_state": state,
            "cust_country_code": country_code,
            "cust_tax_number": tax_number,
            "_row_number": row_num
        }, None

    valid_rows, errors = validate_rows(rows, row_transform)

    # ── 3. Check bulk create tier limit ───────────────────────────────────────
    sub_type = current_user.get("subscription_type") or await fetch_subscription_type_async(db, business_id)
    allowed_count, limit_msg = await check_bulk_create_allowed(
        db, business_id, sub_type, "max_customers", "customers", len(valid_rows)
    )
    if allowed_count == 0:
        return error_response(limit_msg, 403)

    # Trim valid_rows to allowed_count if partial import
    if allowed_count < len(valid_rows):
        valid_rows = valid_rows[:allowed_count]
        errors.append({"row": 0, "message": limit_msg})

    # ── 4. Fetch existing phones for duplicate detection (single query) ───────
    existing_phones = {}
    if valid_rows:
        phone_list = [r["cust_phone"] for r in valid_rows if r.get("cust_phone")]
        if phone_list:
            placeholders = ", ".join([f":phone_{i}" for i in range(len(phone_list))])
            params = {"bid": business_id}
            for i, p in enumerate(phone_list):
                params[f"phone_{i}"] = p

            existing_rows = (await db.execute(text(f"""
                SELECT cust_id, cust_phone
                FROM customers
                WHERE business_id = CAST(:bid AS uuid)
                  AND cust_phone IN ({placeholders})
                  AND is_deleted = false
            """), params)).fetchall()

            for r in existing_rows:
                existing_phones[r.cust_phone] = str(r.cust_id)

    # ── 5. Upsert in chunks ───────────────────────────────────────────────────
    created = 0
    updated = 0
    upsert_errors = []

    for chunk in chunk_list(valid_rows):
        for row in chunk:
            row_num = row.pop("_row_number")
            phone = row.get("cust_phone")

            try:
                if phone and phone in existing_phones:
                    # UPDATE existing
                    cust_id = existing_phones[phone]
                    await db.execute(text("""
                        UPDATE customers
                        SET cust_name = :name,
                            cust_email = :email,
                            cust_address = :address,
                            cust_state = :state,
                            cust_country_code = :country_code,
                            cust_tax_number = :tax_number,
                            updated_by = CAST(:uid AS uuid)
                        WHERE cust_id = CAST(:cid AS uuid)
                          AND business_id = CAST(:bid AS uuid)
                    """), {**row, "cid": cust_id, "bid": business_id, "uid": user_id})
                    updated += 1
                else:
                    # INSERT new
                    new_cust_id = str(uuid.uuid4())
                    await db.execute(text("""
                        INSERT INTO customers (
                            cust_id, business_id, cust_name, cust_phone, cust_email,
                            cust_address, cust_state, cust_country_code, cust_tax_number,
                            updated_by
                        ) VALUES (
                            CAST(:cid AS uuid), CAST(:bid AS uuid), :name, :phone, :email,
                            :address, :state, :country_code, :tax_number,
                            CAST(:uid AS uuid)
                        )
                    """), {**row, "cid": new_cust_id, "bid": business_id, "uid": user_id})
                    if phone:
                        existing_phones[phone] = new_cust_id  # prevent dup within same import
                    created += 1
            except Exception as e:
                upsert_errors.append({"row": row_num, "message": str(e)})

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


# ══════════════════════════════════════════════════════════════════
# GET /customers → Paginated list with server-side search
#
# FIX: Added `search` param — filters name, phone, email via ILIKE.
#      phone param kept for backward compat (sale form auto-fill).
# NEW: Batch-resolves last_updated_by names via LEFT JOIN to profiles.
#      No N+1 — one SQL query returns all names at once.
# ══════════════════════════════════════════════════════════════════
@router.get("/")
async def get_all_customers(
    current_user: dict          = Depends(require_permission("customers.manage")),
    db:           AsyncSession  = Depends(get_async_db),
    pagination:   dict          = Depends(paginate_async),
    search:       Optional[str] = Query(default=None, description="Search by name, phone, or email"),
    phone:        Optional[str] = Query(default=None, description="Exact phone match (for sale form auto-fill)"),
    updated_from: Optional[str] = Query(default=None, description="Filter updated_at >= YYYY-MM-DD"),
    updated_to:   Optional[str] = Query(default=None, description="Filter updated_at <= YYYY-MM-DD"),
    sort_by:      Optional[str] = Query(default="cust_name", description="Column to sort by"),
    sort_dir:     Optional[str] = Query(default="asc",       description="asc or desc"),
):
    business_id = current_user["business_id"]

    SORTABLE = {
        "cust_name":       "c.cust_name",
        "cust_phone":      "c.cust_phone",
        "cust_email":      "c.cust_email",
        "cust_state":      "c.cust_state",
        "cust_created_at": "c.cust_created_at",
        "updated_at":      "c.updated_at",
    }
    order_col = SORTABLE.get(sort_by, "c.updated_at")
    order_dir = "DESC" if str(sort_dir).lower() == "desc" else "ASC"

    extra_where = ""
    params: dict = {
        "bid":    business_id,
        "offset": pagination["offset"],
        "limit":  pagination["limit"],
    }

    if search and search.strip():
        extra_where += """
            AND (
                c.cust_name  ILIKE :search_q
             OR c.cust_phone ILIKE :search_q
             OR c.cust_email ILIKE :search_q
            )
        """
        params["search_q"] = f"%{search.strip()}%"

    if phone:
        extra_where += " AND c.cust_phone = :exact_phone"
        params["exact_phone"] = phone

    # TIMEZONE FIX:
    # The frontend sends full UTC ISO strings (e.g. "2026-06-07T18:30:00.000Z")
    # representing the user's local day boundaries converted to UTC.
    # We compare directly against the timestamptz column — no CAST to date,
    # which would apply server/UTC midnight boundaries instead of user boundaries.
    # This mirrors the pattern in sale.py (the reference implementation).
    if updated_from:
        extra_where += " AND c.updated_at >= :updated_from"
        params["updated_from"] = updated_from

    if updated_to:
        extra_where += " AND c.updated_at <= :updated_to"
        params["updated_to"] = updated_to

    rows = (await db.execute(
        text(f"""
            SELECT
                c.cust_id, c.business_id,
                c.cust_name, c.cust_phone, c.cust_email,
                c.cust_address, c.cust_state, c.cust_country_code,
                c.cust_tax_number,
                c.cust_created_at,
                c.updated_at,
                c.updated_by,
                prof.full_name AS last_updated_by,
                COUNT(*) OVER() AS total_count
            FROM customers c
            LEFT JOIN profiles prof ON prof.id = c.updated_by
            WHERE c.business_id = CAST(:bid AS uuid)
              AND c.is_deleted   = false
              {extra_where}
            ORDER BY {order_col} {order_dir}
            OFFSET :offset LIMIT :limit
        """),
        params
    )).fetchall()

    total = rows[0].total_count if rows else 0

    data = [
        {
            "cust_id":           str(r.cust_id),
            "business_id":       str(r.business_id),
            "cust_name":         r.cust_name,
            "cust_phone":        r.cust_phone,
            "cust_email":        r.cust_email,
            "cust_address":      r.cust_address,
            "cust_state":        r.cust_state,
            "cust_country_code": r.cust_country_code,
            "cust_tax_number":   r.cust_tax_number,
            "cust_created_at":   fmt_ts(r.cust_created_at),
            "updated_at":        fmt_ts(r.updated_at),
            "updated_by":        str(r.updated_by)  if r.updated_by  else None,
            "last_updated_by":   r.last_updated_by,
        }
        for r in rows
    ]

    return success_response(
        pagination_response(data, total, pagination["page"], pagination["limit"], capped=pagination["_capped"])
    )


# ══════════════════════════════════════════════════════════════════
# GET /customers/lean → Lean dropdown list for sales creation form
#
# PERF FIX (2026-06):
#   The old fetchCustomersForSale() called GET /customers with
#   limit=500. That endpoint returns full customer objects:
#   address, state, country_code, cust_tax_number, audit fields,
#   last_updated_by (profile JOIN), etc.
#
#   500 full objects × ~20 fields each = large JSON payload that
#   blocks the Create Invoice page from rendering.
#
#   This lean endpoint returns ONLY the 3 fields the dropdown needs:
#   cust_id, cust_name, cust_phone.  No profile JOIN. No audit fields.
#   No address fields.
#
#   Uses idx_customers_lean_dropdown covering index:
#     (business_id, cust_name, cust_phone, cust_id)
#   → Postgres satisfies the entire query from the index alone
#     (index-only scan — never touches the heap).
#
# DECLARED BEFORE /{cust_id} so FastAPI does not treat "lean"
# as a UUID parameter.
# ══════════════════════════════════════════════════════════════════
@router.get("/lean")
async def get_customers_lean(
    current_user: dict          = Depends(require_permission("customers.manage")),
    db:           AsyncSession  = Depends(get_async_db),
    search:       Optional[str] = Query(default=None, description="Filter by name or phone"),
):
    """
    Returns a minimal customer list for the sales creation dropdown.
    Only returns: cust_id, cust_name, cust_phone.
    Capped at 1000 rows — the frontend filters client-side.

    """
    business_id = current_user["business_id"]
    params: dict = {"bid": business_id}
    where_extra = ""

    if search and search.strip():
        where_extra = """ AND (c.cust_name ILIKE :q OR c.cust_phone ILIKE :q)"""
        params["q"] = f"%{search.strip()}%"

    rows = (await db.execute(
        text(f"""
            SELECT cust_id, cust_name, cust_phone
            FROM customers c
            WHERE business_id = CAST(:bid AS uuid)
              AND is_deleted   = false
              {where_extra}
            ORDER BY cust_name ASC
            LIMIT 1000
        """),
        params
    )).fetchall()

    return success_response([
        {
            "cust_id":    str(r.cust_id),
            "cust_name":  r.cust_name,
            "cust_phone": r.cust_phone,
        }
        for r in rows
    ])


# ══════════════════════════════════════════════════════════════════
# GET /customers/search/phone?phone=9876543210
# ══════════════════════════════════════════════════════════════════
@router.get("/search/phone")
async def search_customer_by_phone(
    phone:        str,
    current_user: dict = Depends(require_permission("customers.manage")),
    db:           AsyncSession = Depends(get_async_db)
):
    business_id = current_user["business_id"]

    if not phone or not phone.strip():
        return error_response("Phone number is required", 400)

    customer = (await db.execute(select(Customer).where(
        Customer.business_id == business_id,
        Customer.cust_phone  == phone.strip(),
        Customer.is_deleted  == False
    ))).scalar_one_or_none()

    if not customer:
        return error_response(f"No customer found with phone number '{phone}'", 404)

    return success_response(customer_to_dict(customer))


# ── GET /customers/summary → KPI cards for customers page ──────────
@router.get("/summary")
async def get_customer_summary_kpi(
    current_user: dict = Depends(require_permission("customers.manage")),
    db: AsyncSession = Depends(get_async_db)
):
    bid = current_user["business_id"]
    can_financial = check_feature_access(current_user, "financial_reports")["allowed"]

    row = (await db.execute(text("""
        WITH customer_counts AS (
            SELECT
                COUNT(*)                                                        AS total_count,
                COUNT(*) FILTER (WHERE date_trunc('month', cust_created_at) = date_trunc('month', CURRENT_DATE)) AS new_this_month
            FROM customers c
            WHERE c.business_id = CAST(:bid AS uuid)
              AND c.is_deleted  = false
        )
        SELECT
            cc.total_count,
            cc.new_this_month,
            COALESCE((
                SELECT SUM(s.sales_final_amount - COALESCE(pay.cumulative_paid, 0))
                FROM sales s
                LEFT JOIN LATERAL (
                    SELECT cumulative_paid FROM payments
                    WHERE sale_id = s.sales_id AND is_active = true
                    LIMIT 1
                ) pay ON true
                WHERE s.business_id = CAST(:bid AS uuid)
                  AND s.is_deleted  = false
                  AND s.sales_payment_status IN ('pending', 'partial')
            ), 0) AS outstanding_balance
        FROM customer_counts cc
    """), {"bid": bid})).fetchone()

    return success_response({
        "total_count":        int(row.total_count),
        "new_this_month":     int(row.new_this_month),
        "outstanding_balance": str(row.outstanding_balance) if can_financial else None,
    })


# ══════════════════════════════════════════════════════════════════
# GET /customers/{cust_id} → Detail + summary + paginated sales history
#
# Architecture:
#   Summary aggregates (total_sales, total_spent, total_paid,
#   total_returns) are computed across ALL of the customer's sales
#   via aggregate SQL queries — no N+1, no client-side summing.
#
#   Sales history is paginated server-side. The items, payments,
#   and returns queries only cover the current page, keeping
#   batch size small regardless of total sales volume.
#
#   For full transaction export, use a dedicated export endpoint
#   (see recommendations below) rather than page=1&limit=10000.
# ══════════════════════════════════════════════════════════════════
@router.get("/{cust_id}")
async def get_customer(
    cust_id:      str,
    current_user: dict = Depends(require_permission("customers.manage")),
    db:           AsyncSession = Depends(get_async_db),
    pagination:   dict = Depends(paginate_async)
):
    business_id = current_user["business_id"]

    customer = (await db.execute(select(Customer).where(
        Customer.cust_id     == cust_id,
        Customer.business_id == business_id,
        Customer.is_deleted  == False
    ))).scalar_one_or_none()

    if not customer:
        return error_response("Customer not found", 404)

    # ── Summary aggregates (over ALL sales, not just current page) ──
    agg = (await db.execute(
        text("""
            SELECT
                COUNT(*)                                  AS total_sales,
                COALESCE(SUM(sales_final_amount), 0)      AS total_spent
            FROM sales
            WHERE customer_id = CAST(:cid AS uuid)
              AND business_id = CAST(:bid AS uuid)
              AND is_deleted  = false
        """),
        {"cid": cust_id, "bid": business_id}
    )).fetchone()

    total_sales = agg.total_sales if agg and agg.total_sales else 0
    total_spent = float(agg.total_spent) if agg and agg.total_spent else 0.0

    total_paid = 0.0
    total_returns = 0.0

    if total_sales > 0:
        paid_row = (await db.execute(
            text("""
                SELECT COALESCE(SUM(p.cumulative_paid), 0) AS total_paid
                FROM payments p
                JOIN sales s ON s.sales_id = p.sale_id
                WHERE s.customer_id = CAST(:cid AS uuid)
                  AND s.business_id = CAST(:bid AS uuid)
                  AND s.is_deleted  = false
                  AND p.is_active   = true
            """),
            {"cid": cust_id, "bid": business_id}
        )).fetchone()
        total_paid = float(paid_row.total_paid) if paid_row else 0.0

        ret_row = (await db.execute(
            text("""
                SELECT COALESCE(SUM(sr.return_amount), 0) AS total_returns
                FROM sales_returns sr
                JOIN sales s ON s.sales_id = sr.sale_id
                WHERE s.customer_id    = CAST(:cid AS uuid)
                  AND s.business_id    = CAST(:bid AS uuid)
                  AND s.is_deleted     = false
                  AND sr.return_status = 'approved'
            """),
            {"cid": cust_id, "bid": business_id}
        )).fetchone()
        total_returns = float(ret_row.total_returns) if ret_row else 0.0

    outstanding = round(total_spent - total_paid, 2)

    # ── Paginated sales query ──────────────────────────────────────
    sale_rows = (await db.execute(
        text("""
            SELECT
                sales_id, invoice_no,
                sales_total_amount, sales_discount,
                cgst_total, sgst_total, igst_total, tax_total,
                sales_final_amount, sales_payment_method,
                sales_payment_status, sales_created_at,
                COUNT(*) OVER() AS total_count
            FROM sales
            WHERE customer_id = CAST(:cid AS uuid)
              AND business_id = CAST(:bid AS uuid)
              AND is_deleted  = false
            ORDER BY sales_created_at DESC
            OFFSET :offset LIMIT :limit
        """),
        {
            "cid":    cust_id,
            "bid":    business_id,
            "offset": pagination["offset"],
            "limit":  pagination["limit"],
        }
    )).fetchall()

    total_count = sale_rows[0].total_count if sale_rows else 0

    sales_history = []
    if sale_rows:
        sale_ids = [str(r.sales_id) for r in sale_rows]

        # ── Items for paginated sales (batch) ────────────────────
        items_rows = (await db.execute(
            text("""
                SELECT
                    si.sale_id,
                    si.sale_item_id, si.product_id, p.prod_name,
                    si.sale_item_quantity, si.sale_item_unit_price,
                    si.sale_item_subtotal, si.item_tax_total, si.item_total_with_tax
                FROM sale_items si
                LEFT JOIN products p ON p.prod_id = si.product_id
                WHERE si.sale_id = ANY(CAST(:ids AS uuid[]))
                  AND si.business_id = CAST(:bid AS uuid)
            """),
            # BUG FIX: asyncpg expects a Python list for array params, not a
            # manually-formatted "{uuid1,uuid2}" string (causes DataError).
            {"ids": sale_ids, "bid": business_id}
        )).fetchall()

        items_by_sale: dict = {}
        for i in items_rows:
            key = str(i.sale_id)
            items_by_sale.setdefault(key, []).append({
                "sale_item_id":        str(i.sale_item_id),
                "product_id":          str(i.product_id),
                "prod_name":           i.prod_name,
                "qty":                 i.sale_item_quantity,
                "unit_price":          float(i.sale_item_unit_price),
                "subtotal":            float(i.sale_item_subtotal)       if i.sale_item_subtotal      else None,
                "item_tax_total":      float(i.item_tax_total)           if i.item_tax_total          else 0,
                "item_total_with_tax": float(i.item_total_with_tax)      if i.item_total_with_tax     else None,
            })

        # ── Payment summary for paginated sales (batch GROUP BY) ──
        pay_rows = (await db.execute(
            text("""
                SELECT
                    sale_id,
                    COALESCE(MAX(cumulative_paid), 0)                      AS total_paid_amount,
                    MAX(CASE WHEN is_active = true THEN payment_status END) AS current_status,
                    COUNT(*)                                                AS payment_count
                FROM payments
                WHERE sale_id = ANY(CAST(:ids AS uuid[]))
                  AND business_id = CAST(:bid AS uuid)
                GROUP BY sale_id
            """),
            # BUG FIX: asyncpg expects a Python list for array params, not a
            # manually-formatted "{uuid1,uuid2}" string (causes DataError).
            {"ids": sale_ids, "bid": business_id}
        )).fetchall()

        pay_by_sale = {str(r.sale_id): r for r in pay_rows}

        # ── Returns for paginated sales (batch) ──────────────────
        return_rows = (await db.execute(
            text("""
                SELECT
                    sale_id, return_id, return_amount, return_reason,
                    return_status, refund_method, restock, return_created_at
                FROM sales_returns
                WHERE sale_id = ANY(CAST(:ids AS uuid[]))
                  AND business_id = CAST(:bid AS uuid)
                ORDER BY return_created_at DESC
            """),
            # BUG FIX: asyncpg expects a Python list for array params, not a
            # manually-formatted "{uuid1,uuid2}" string (causes DataError).
            {"ids": sale_ids, "bid": business_id}
        )).fetchall()

        returns_by_sale: dict = {}
        for r in return_rows:
            key = str(r.sale_id)
            returns_by_sale.setdefault(key, []).append({
                "return_id":         str(r.return_id),
                "return_amount":     float(r.return_amount),
                "return_reason":     r.return_reason,
                "return_status":     r.return_status,
                "refund_method":     r.refund_method,
                "restock":           r.restock,
                "return_created_at": fmt_ts(r.return_created_at)
            })

        # ── Build sales_history for current page ─────────────────
        for sale in sale_rows:
            sale_id    = str(sale.sales_id)
            sale_final = float(sale.sales_final_amount) if sale.sales_final_amount else 0.0

            pay = pay_by_sale.get(sale_id)
            paid_for_sale = float(pay.total_paid_amount) if pay else 0.0
            remaining     = round(sale_final - paid_for_sale, 2)

            payment_summary = {
                "total_paid":        round(paid_for_sale, 2),
                "remaining_balance": remaining if remaining > 0 else 0,
                "payment_count":     pay.payment_count if pay else 0,
                "current_status":    (pay.current_status if pay and pay.current_status
                                      else sale.sales_payment_status),
            }

            sales_history.append({
                "sales_id":             sale_id,
                "invoice_no":           sale.invoice_no,
                "sales_total_amount":   float(sale.sales_total_amount),
                "sales_discount":       float(sale.sales_discount) if sale.sales_discount else 0,
                "tax_total":            float(sale.tax_total) if sale.tax_total else 0,
                "sales_final_amount":   sale_final,
                "sales_payment_method": sale.sales_payment_method,
                "sales_payment_status": sale.sales_payment_status,
                "sales_created_at":     fmt_ts(sale.sales_created_at),
                "payment_summary":      payment_summary,
                "items":                items_by_sale.get(sale_id, []),
                "returns":              returns_by_sale.get(sale_id, []),
            })

    total_pages = (total_count + pagination["limit"] - 1) // pagination["limit"]
    can_financial = check_feature_access(current_user, "financial_reports")["allowed"]

    return success_response({
        **customer_to_dict(customer),
        "summary": {
            "total_sales":         total_sales if can_financial else None,
            "total_spent":         round(total_spent, 2) if can_financial else None,
            "total_paid":          round(total_paid, 2) if can_financial else None,
            "outstanding_balance": (outstanding if outstanding > 0 else 0) if can_financial else None,
            "total_returns":       round(total_returns, 2) if can_financial else None
        },
        "sales_history": sales_history,
        "pagination": {
            "total":       total_count,
            "page":        pagination["page"],
            "limit":       pagination["limit"],
            "total_pages": total_pages,
            "has_next":    pagination["page"] < total_pages,
            "has_prev":    pagination["page"] > 1,
        }
    })


# ══════════════════════════════════════════════════════════════════
# PUT /customers/{cust_id} → Update customer
# NEW: sets updated_by = current_user["user_id"]
#      DB trigger trg_customers_updated_at auto-sets updated_at on commit
# ══════════════════════════════════════════════════════════════════
@router.put("/{cust_id}")
async def update_customer(
    cust_id:      str,
    data:         CustomerUpdate,
    current_user: dict = Depends(require_permission("customers.manage")),
    db:           AsyncSession = Depends(get_async_db)
):
    business_id = current_user["business_id"]

    customer = (await db.execute(select(Customer).where(
        Customer.cust_id     == cust_id,
        Customer.business_id == business_id,
        Customer.is_deleted  == False
    ))).scalar_one_or_none()

    if not customer:
        return error_response("Customer not found", 404)

    if data.cust_phone:
        existing = (await db.execute(select(Customer).where(
            Customer.business_id == business_id,
            Customer.cust_id     != cust_id,
            Customer.cust_phone  == data.cust_phone,
            Customer.is_deleted  == False
        ))).scalar_one_or_none()
        if existing:
            return error_response("Customer with this phone already exists", 400)

    if data.cust_name         is not None: customer.cust_name         = data.cust_name
    if data.cust_phone        is not None: customer.cust_phone        = data.cust_phone
    if data.cust_email        is not None: customer.cust_email        = data.cust_email
    if data.cust_address      is not None: customer.cust_address      = data.cust_address
    if data.cust_state        is not None: customer.cust_state        = data.cust_state
    if data.cust_country_code is not None: customer.cust_country_code = data.cust_country_code
    if data.cust_tax_number   is not None: customer.cust_tax_number   = data.cust_tax_number

    # Track who last updated this customer
    # updated_at is set automatically by DB trigger trg_customers_updated_at
    customer.updated_by = current_user["user_id"]

    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        return error_response("Customer with this phone already exists", 400)
    # Re-set GUCs after commit (SET LOCAL is transaction-scoped)
    await async_set_rls_gucs_after_commit(db, current_user)
    await db.refresh(customer)

    # Fetch the updater's name to return in response
    updated_by_name = current_user.get("full_name")

    return success_response({
        "message":  "Customer updated successfully",
        "customer": customer_to_dict(customer, last_updated_by=updated_by_name)
    })


# ══════════════════════════════════════════════════════════════════
# DELETE /customers/{cust_id} → Soft delete
# ══════════════════════════════════════════════════════════════════
@router.delete("/{cust_id}")
async def delete_customer(
    cust_id:      str,
    current_user: dict = Depends(require_permission("customers.manage")),
    db:           AsyncSession = Depends(get_async_db)
):
    business_id = current_user["business_id"]

    customer = (await db.execute(select(Customer).where(
        Customer.cust_id     == cust_id,
        Customer.business_id == business_id,
        Customer.is_deleted  == False
    ))).scalar_one_or_none()

    if not customer:
        return error_response("Customer not found", 404)

    customer.is_deleted = True
    customer.updated_by = current_user["user_id"]
    await db.commit()
    # RLS: SET LOCAL/set_config GUCs are transaction-scoped and are cleared
    # by this commit. Re-set them in case any future code adds a query after
    # this point (matches the convention in create_customer, update_customer).
    await async_set_rls_gucs_after_commit(db, current_user)

    return success_response({"message": "Customer deleted successfully"})