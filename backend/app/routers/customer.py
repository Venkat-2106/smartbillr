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
from app.utils.bulk_import import parse_csv_file, validate_rows, check_bulk_create_allowed, friendly_db_error, check_required_headers, validate_upload_file, MAX_IMPORT_FILE_BYTES, bulk_import_scaffold, make_tier_limit_fn
from app.schemas.validators import strip_and_escape_html, strip_and_escape_csv_value
from typing import Optional
from datetime import datetime, timezone, timedelta
import uuid
import json

router = APIRouter(prefix="/v1/customers", tags=["Customers"])

REQUIRED_CUSTOMER_COLUMNS = [
    {"names": ["cust_name", "name", "Customer Name"]},
]


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
@router.post("/import/")
@router.post("/import")
async def import_customers(
    file: UploadFile = File(...),
    current_user: dict = Depends(require_permission("customers.manage")),
    db: AsyncSession = Depends(get_async_db),
    mode: Optional[str] = Query(default="create", description="Import mode: 'create' (default) or 'update'"),
):
    is_update_mode = (mode or "").lower() == "update"

    def row_transform(row: dict, row_num: int):
        name = (row.get("cust_name") or row.get("name") or row.get("Customer Name") or "").strip()
        if not name:
            return None, "cust_name is required"

        phone = (row.get("cust_phone") or row.get("phone") or row.get("Phone") or "").strip() or None
        email = (row.get("cust_email") or row.get("email") or row.get("Email") or "").strip() or None
        address = (row.get("cust_address") or row.get("address") or row.get("Address") or "").strip() or None
        state = (row.get("cust_state") or row.get("state") or row.get("State") or "").strip() or None
        country_code = (row.get("cust_country_code") or row.get("country_code") or row.get("Country Code") or "").strip() or None
        tax_number = (row.get("cust_tax_number") or row.get("tax_number") or row.get("Tax Number") or "").strip() or None

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

    async def upsert(valid_rows, db, business_id, user_id):
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

        existing_names = {}
        if valid_rows and is_update_mode:
            name_list = [r["cust_name"] for r in valid_rows if r.get("cust_name")]
            if name_list:
                placeholders = ", ".join([f":name_{i}" for i in range(len(name_list))])
                params = {"bid": business_id}
                for i, n in enumerate(name_list):
                    params[f"name_{i}"] = n.lower()

                existing_rows = (await db.execute(text(f"""
                    SELECT cust_id, LOWER(cust_name) as lname
                    FROM customers
                    WHERE business_id = CAST(:bid AS uuid)
                      AND LOWER(cust_name) IN ({placeholders})
                      AND is_deleted = false
                """), params)).fetchall()

                for r in existing_rows:
                    existing_names[r.lname] = str(r.cust_id)

        new_rows = []
        update_rows = []
        seen_in_file = {}
        upsert_errors = []

        for row in valid_rows:
            row_num = row.pop("_row_number")
            phone = row.get("cust_phone")

            if phone and phone in seen_in_file:
                upsert_errors.append({"row": row_num, "message": f'Duplicate phone "{phone}" also appears on row {seen_in_file[phone]} — only the first occurrence will be imported.'})
                continue

            matched = False
            if phone and phone in existing_phones:
                if not is_update_mode:
                    upsert_errors.append({"row": row_num, "message": f'Customer with phone "{phone}" already exists. Existing customers cannot be imported using Bulk Create. Please use Bulk Update instead.'})
                    continue
                update_rows.append({"cid": existing_phones[phone], "uid": user_id, **row})
                matched = True
            elif is_update_mode:
                name_lower = row.get("cust_name", "").lower()
                if name_lower in existing_names:
                    update_rows.append({"cid": existing_names[name_lower], "uid": user_id, **row})
                    matched = True
                else:
                    upsert_errors.append({"row": row_num, "message": f'Customer "{row.get("cust_name")}" does not exist. Only existing customers can be updated.'})
                    continue

            if not matched:
                new_cust_id = str(uuid.uuid4())
                new_rows.append({"cid": new_cust_id, "bid": business_id, "uid": user_id, **row})
                if phone:
                    existing_phones[phone] = new_cust_id
                    seen_in_file[phone] = row_num

        created = 0
        updated = 0

        if new_rows:
            placeholders = ", ".join([
                f"(:cid_{i}, CAST(:bid AS uuid), :name_{i}, :phone_{i}, :email_{i}, :address_{i}, :state_{i}, :country_code_{i}, :tax_number_{i}, CAST(:uid_{i} AS uuid))"
                for i in range(len(new_rows))
            ])
            params = {"bid": business_id}
            for i, r in enumerate(new_rows):
                params[f"cid_{i}"] = r["cid"]
                params[f"name_{i}"] = r["cust_name"]
                params[f"phone_{i}"] = r["cust_phone"]
                params[f"email_{i}"] = r["cust_email"]
                params[f"address_{i}"] = r["cust_address"]
                params[f"state_{i}"] = r["cust_state"]
                params[f"country_code_{i}"] = r["cust_country_code"]
                params[f"tax_number_{i}"] = r["cust_tax_number"]
                params[f"uid_{i}"] = r["uid"]

            try:
                await db.execute(text(f"""
                    INSERT INTO customers (
                        cust_id, business_id, cust_name, cust_phone, cust_email,
                        cust_address, cust_state, cust_country_code, cust_tax_number,
                        updated_by
                    ) VALUES {placeholders}
                """), params)
                created = len(new_rows)
            except Exception as e:
                upsert_errors.append({"row": 0, "message": friendly_db_error(e, context="customer insert batch")})

        if update_rows:
            case_name = []
            case_email = []
            case_address = []
            case_state = []
            case_country = []
            case_tax = []
            case_uid = []
            params = {"bid": business_id}
            for i, r in enumerate(update_rows):
                case_name.append(f"WHEN cust_id = CAST(:cid_{i} AS uuid) THEN :name_{i}")
                case_email.append(f"WHEN cust_id = CAST(:cid_{i} AS uuid) THEN :email_{i}")
                case_address.append(f"WHEN cust_id = CAST(:cid_{i} AS uuid) THEN :address_{i}")
                case_state.append(f"WHEN cust_id = CAST(:cid_{i} AS uuid) THEN :state_{i}")
                case_country.append(f"WHEN cust_id = CAST(:cid_{i} AS uuid) THEN :country_code_{i}")
                case_tax.append(f"WHEN cust_id = CAST(:cid_{i} AS uuid) THEN :tax_number_{i}")
                case_uid.append(f"WHEN cust_id = CAST(:cid_{i} AS uuid) THEN CAST(:uid_{i} AS uuid)")
                params[f"cid_{i}"] = r["cid"]
                params[f"name_{i}"] = r["cust_name"]
                params[f"email_{i}"] = r["cust_email"]
                params[f"address_{i}"] = r["cust_address"]
                params[f"state_{i}"] = r["cust_state"]
                params[f"country_code_{i}"] = r["cust_country_code"]
                params[f"tax_number_{i}"] = r["cust_tax_number"]
                params[f"uid_{i}"] = r["uid"]

            cid_list = ", ".join([f"CAST(:cid_{i} AS uuid)" for i in range(len(update_rows))])

            try:
                await db.execute(text(f"""
                    UPDATE customers
                    SET cust_name         = CASE {" ".join(case_name)} END,
                        cust_email        = CASE {" ".join(case_email)} END,
                        cust_address      = CASE {" ".join(case_address)} END,
                        cust_state        = CASE {" ".join(case_state)} END,
                        cust_country_code = CASE {" ".join(case_country)} END,
                        cust_tax_number   = CASE {" ".join(case_tax)} END,
                        updated_by        = CASE {" ".join(case_uid)} END
                    WHERE business_id = CAST(:bid AS uuid)
                      AND cust_id IN ({cid_list})
                """), params)
                updated = len(update_rows)
            except Exception as e:
                upsert_errors.append({"row": 0, "message": friendly_db_error(e, context="customer update batch")})

        return created, updated, upsert_errors

    return await bulk_import_scaffold(
        file=file,
        db=db,
        current_user=current_user,
        row_transform=row_transform,
        required_columns=REQUIRED_CUSTOMER_COLUMNS,
        required_columns_update=[{"names": ["cust_name", "name", "Customer Name"]}],
        upsert_fn=upsert,
        is_update_mode=is_update_mode,
        tier_limit_fn=make_tier_limit_fn(db, current_user["business_id"], "max_customers", "customers"),
    )


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
        params["updated_from"] = datetime.fromisoformat(updated_from.replace("Z", ""))

    if updated_to:
        extra_where += " AND c.updated_at <= :updated_to"
        params["updated_to"] = datetime.fromisoformat(updated_to.replace("Z", ""))

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
    tz_offset_minutes: int = Query(0),
    current_user: dict = Depends(require_permission("customers.manage")),
    db: AsyncSession = Depends(get_async_db)
):
    bid = current_user["business_id"]
    fin_access = check_feature_access(current_user, "financial_reports")
    can_financial = fin_access["allowed"]

    utc_now = datetime.now(timezone.utc)
    user_now = utc_now - timedelta(minutes=tz_offset_minutes)
    user_today = user_now.date()
    loc_offset = -tz_offset_minutes

    row = (await db.execute(text("""
        WITH customer_counts AS (
            SELECT
                COUNT(*)                                                        AS total_count,
                COUNT(*) FILTER (
                    WHERE date_trunc('month', cust_created_at + (:loc_offset * INTERVAL '1 minute'))
                        = date_trunc('month', CAST(:user_today AS date))
                ) AS new_this_month
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
    """), {"bid": bid, "loc_offset": loc_offset, "user_today": user_today})).fetchone()

    return success_response({
        "total_count":        int(row.total_count),
        "new_this_month":     int(row.new_this_month),
        "outstanding_balance": str(row.outstanding_balance) if can_financial else None,
        "financial_locked_reason": fin_access["locked_reason"],
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
# CTE OPTIMIZATION (2026-07): Replaced 5-8 sequential DB round-trips
# with 2 CTE-based queries. Query 1 fuses customer + summary aggregates
# (total_sales, total_spent, total_paid, total_returns) into a single
# CTE. Query 2 fetches paginated sales with items, payments, and
# returns via correlated subqueries in one round-trip (was 4 batch
# queries). Both queries fire sequentially but each is a single DB
# round-trip — down from 5-8 total.
# ══════════════════════════════════════════════════════════════════
@router.get("/{cust_id}")
async def get_customer(
    cust_id:      str,
    current_user: dict = Depends(require_permission("customers.manage")),
    db:           AsyncSession = Depends(get_async_db),
    pagination:   dict = Depends(paginate_async)
):
    business_id = current_user["business_id"]

    # ── Query 1: Customer + summary aggregates (1 round-trip, was 4) ──────
    result = await db.execute(
        text("""
            WITH cust_cte AS (
                SELECT c.cust_id, c.business_id, c.cust_name, c.cust_phone,
                       c.cust_email, c.cust_address, c.cust_state,
                       c.cust_country_code, c.cust_tax_number, c.is_deleted,
                       c.cust_created_at, c.updated_at, c.updated_by,
                       pr.full_name AS last_updated_by
                FROM customers c
                LEFT JOIN profiles pr ON pr.id = c.updated_by
                WHERE c.cust_id     = CAST(:cid AS uuid)
                  AND c.business_id = CAST(:bid AS uuid)
                  AND c.is_deleted  = false
            ),
            agg_cte AS (
                SELECT
                    COUNT(*)                                  AS total_sales,
                    COALESCE(SUM(sales_final_amount), 0)      AS total_spent
                FROM sales
                WHERE customer_id = CAST(:cid AS uuid)
                  AND business_id = CAST(:bid AS uuid)
                  AND is_deleted  = false
            ),
            paid_cte AS (
                SELECT COALESCE(SUM(p.cumulative_paid), 0) AS total_paid
                FROM payments p
                JOIN sales s ON s.sales_id = p.sale_id
                WHERE s.customer_id = CAST(:cid AS uuid)
                  AND s.business_id = CAST(:bid AS uuid)
                  AND s.is_deleted  = false
                  AND p.is_active   = true
            ),
            ret_cte AS (
                SELECT COALESCE(SUM(sr.return_amount), 0) AS total_returns
                FROM sales_returns sr
                JOIN sales s ON s.sales_id = sr.sale_id
                WHERE s.customer_id    = CAST(:cid AS uuid)
                  AND s.business_id    = CAST(:bid AS uuid)
                  AND s.is_deleted     = false
                  AND sr.return_status = 'approved'
            )
            SELECT
                (SELECT row_to_json(cust_cte)::text FROM cust_cte) AS cust_json,
                (SELECT row_to_json(agg_cte)::text  FROM agg_cte)  AS agg_json,
                (SELECT row_to_json(paid_cte)::text FROM paid_cte) AS paid_json,
                (SELECT row_to_json(ret_cte)::text  FROM ret_cte)  AS ret_json
        """),
        {"cid": cust_id, "bid": business_id}
    )
    row = result.fetchone()

    if not row or not row.cust_json:
        return error_response("Customer not found", 404)

    cust  = json.loads(row.cust_json)
    agg   = json.loads(row.agg_json)
    paid  = json.loads(row.paid_json) if row.paid_json else None
    ret   = json.loads(row.ret_json)  if row.ret_json  else None

    total_sales  = agg.get("total_sales", 0) or 0
    total_spent  = float(agg.get("total_spent", 0) or 0)
    total_paid   = float(paid.get("total_paid", 0)) if paid else 0.0
    total_returns = float(ret.get("total_returns", 0)) if ret else 0.0
    outstanding  = round(total_spent - total_paid, 2)

    # ── Query 2: Paginated sales + items/payments/returns (1 round-trip, was 4) ──
    sale_result = await db.execute(
        text("""
            WITH sale_page AS (
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
            )
            SELECT
                (SELECT COALESCE(json_agg(sale_page), '[]'::json)::text
                 FROM sale_page) AS sales_json,
                (SELECT COALESCE(json_agg(q), '[]'::json)::text FROM (
                    SELECT si.sale_id,
                           json_agg(json_build_object(
                               'sale_item_id',        si.sale_item_id,
                               'product_id',          si.product_id,
                               'prod_name',           p.prod_name,
                               'qty',                 si.sale_item_quantity,
                               'unit_price',          si.sale_item_unit_price,
                               'subtotal',            si.sale_item_subtotal,
                               'item_tax_total',      si.item_tax_total,
                               'item_total_with_tax',  si.item_total_with_tax
                           )) AS items
                    FROM sale_items si
                    LEFT JOIN products p ON p.prod_id = si.product_id
                    WHERE si.sale_id IN (SELECT sales_id FROM sale_page)
                      AND si.business_id = CAST(:bid AS uuid)
                    GROUP BY si.sale_id
                ) q) AS items_json,
                (SELECT COALESCE(json_agg(q), '[]'::json)::text FROM (
                    SELECT pay.sale_id,
                           json_build_object(
                               'total_paid_amount', COALESCE(MAX(pay.cumulative_paid), 0),
                               'current_status',    MAX(CASE WHEN pay.is_active = true THEN pay.payment_status END),
                               'payment_count',     COUNT(*)
                           ) AS summary
                    FROM payments pay
                    WHERE pay.sale_id IN (SELECT sales_id FROM sale_page)
                      AND pay.business_id = CAST(:bid AS uuid)
                    GROUP BY pay.sale_id
                ) q) AS payments_json,
                (SELECT COALESCE(json_agg(q), '[]'::json)::text FROM (
                    SELECT sr.sale_id,
                           json_agg(json_build_object(
                               'return_id',         sr.return_id,
                               'return_amount',     sr.return_amount,
                               'return_reason',     sr.return_reason,
                               'return_status',     sr.return_status,
                               'refund_method',     sr.refund_method,
                               'restock',           sr.restock,
                               'return_created_at', sr.return_created_at
                           ) ORDER BY sr.return_created_at DESC) AS returns
                    FROM sales_returns sr
                    WHERE sr.sale_id IN (SELECT sales_id FROM sale_page)
                      AND sr.business_id = CAST(:bid AS uuid)
                    GROUP BY sr.sale_id
                ) q) AS returns_json
        """),
        {
            "cid":    cust_id,
            "bid":    business_id,
            "offset": pagination["offset"],
            "limit":  pagination["limit"],
        }
    )
    sale_row = sale_result.fetchone()

    sales_raw   = json.loads(sale_row.sales_json)   if sale_row.sales_json   else []
    items_raw   = json.loads(sale_row.items_json)   if sale_row.items_json   else []
    payments_raw = json.loads(sale_row.payments_json) if sale_row.payments_json else []
    returns_raw = json.loads(sale_row.returns_json) if sale_row.returns_json else []

    items_map   = {r["sale_id"]: r["items"]    for r in items_raw}
    payments_map = {r["sale_id"]: r["summary"] for r in payments_raw}
    returns_map = {r["sale_id"]: r["returns"]  for r in returns_raw}

    total_count = sales_raw[0].get("total_count", 0) if sales_raw else 0

    sales_history = []
    for s in sales_raw:
        sale_id    = s["sales_id"]
        sale_final = float(s["sales_final_amount"]) if s["sales_final_amount"] else 0.0
        pay = payments_map.get(sale_id)
        paid_for_sale = float(pay["total_paid_amount"]) if pay else 0.0

        sales_history.append({
            "sales_id":             sale_id,
            "invoice_no":           s["invoice_no"],
            "sales_total_amount":   float(s["sales_total_amount"]),
            "sales_discount":       float(s["sales_discount"]) if s["sales_discount"] else 0,
            "tax_total":            float(s["tax_total"]) if s["tax_total"] else 0,
            "sales_final_amount":   sale_final,
            "sales_payment_method": s["sales_payment_method"],
            "sales_payment_status": s["sales_payment_status"],
            "sales_created_at":     fmt_ts(s["sales_created_at"]),
            "payment_summary": {
                "total_paid":        round(paid_for_sale, 2),
                "remaining_balance": max(0, round(sale_final - paid_for_sale, 2)),
                "payment_count":     pay["payment_count"] if pay else 0,
                "current_status":    (pay["current_status"] if pay and pay["current_status"]
                                      else s["sales_payment_status"]),
            },
            "items":   items_map.get(sale_id, []),
            "returns": returns_map.get(sale_id, []),
        })

    total_pages = (total_count + pagination["limit"] - 1) // pagination["limit"]
    can_financial = check_feature_access(current_user, "financial_reports")["allowed"]

    return success_response({
        "cust_id":           str(cust["cust_id"]),
        "business_id":       str(cust["business_id"]),
        "cust_name":         cust["cust_name"],
        "cust_phone":        cust["cust_phone"],
        "cust_email":        cust["cust_email"],
        "cust_address":      cust["cust_address"],
        "cust_state":        cust["cust_state"],
        "cust_country_code": cust["cust_country_code"],
        "cust_tax_number":   cust["cust_tax_number"],
        "is_deleted":        cust["is_deleted"],
        "cust_created_at":   fmt_ts(cust["cust_created_at"]),
        "updated_at":        fmt_ts(cust["updated_at"]),
        "updated_by":        str(cust["updated_by"]) if cust["updated_by"] else None,
        "last_updated_by":   cust.get("last_updated_by"),
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