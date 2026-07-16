# app/routers/supplier.py
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
#
# SCALABILITY UPDATE:
#   GET /suppliers/ now accepts the same server-side filter params as
#   GET /customers/ and GET /categories/.
#
#   New query params:
#     search       — ILIKE on supp_name, supp_phone, supp_email
#     updated_from — filter updated_at >= YYYY-MM-DD
#     updated_to   — filter updated_at <= YYYY-MM-DD (inclusive, end-of-day)
#     sort_by      — whitelist-validated column name
#     sort_dir     — asc | desc
#
#   The frontend no longer fetches limit=10000 and filters in JavaScript.
#   It sends page=N, limit=20 plus any active filters and receives only
#   the rows it needs. Export sends limit=10000 with the same filter params.
#
#   The COUNT query uses the same WHERE clauses as the data query so that
#   the pagination total always reflects the filtered result set.

from fastapi import APIRouter, Depends, Query, File, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError
from app.database import get_async_db
from app.middleware.rbac import require_permission, async_set_rls_gucs_after_commit
from app.models.supplier import Supplier
from app.schemas.supplier import SupplierCreate, SupplierUpdate
from app.utils.response import success_response, error_response
from app.utils.pagination import paginate_async, pagination_response
from app.utils.timestamp import fmt_ts
from app.utils.usage_limits import check_create_allowed_async, fetch_subscription_type_async
from app.utils.bulk_import import parse_csv_file, validate_rows, check_bulk_create_allowed, chunk_list
from app.schemas.validators import strip_and_escape_html
from typing import Optional
import uuid

router = APIRouter(prefix="/v1/suppliers", tags=["Suppliers"])


# ─────────────────────────────────────────
# HELPER — Format supplier as dict
# ─────────────────────────────────────────
def supplier_to_dict(s, last_updated_by=None) -> dict:
    return {
        "supp_id":           str(s.supp_id),
        "business_id":       str(s.business_id),
        "supp_name":         s.supp_name,
        "supp_phone":        s.supp_phone,
        "supp_email":        s.supp_email,
        "supp_address":      s.supp_address,
        "supp_state":        s.supp_state,
        "supp_country_code": s.supp_country_code,
        "supp_tax_number":   s.supp_tax_number,
        "is_deleted":        s.is_deleted,
        "supp_created_at":   fmt_ts(s.supp_created_at),
        "updated_at":        fmt_ts(s.updated_at),
        "updated_by":        str(s.updated_by) if s.updated_by else None,
        "last_updated_by":   last_updated_by,
    }


# ══════════════════════════════════════════════════════════════════
# POST /suppliers → Create new supplier
# ══════════════════════════════════════════════════════════════════
@router.post("/")
async def create_supplier(
    data:         SupplierCreate,
    current_user: dict = Depends(require_permission("suppliers.manage")),
    db:           AsyncSession = Depends(get_async_db)
):
    business_id = current_user["business_id"]

    # ── Subscription tier limit check ─────────────────────────────────────────
    sub_type = current_user.get("subscription_type") or await fetch_subscription_type_async(db, business_id)
    allowed, msg = await check_create_allowed_async(db, business_id, sub_type, "max_suppliers", "suppliers")
    if not allowed:
        return error_response(msg, status_code=403)

    if data.supp_phone:
        result = await db.execute(
            select(Supplier).where(
                Supplier.business_id == business_id,
                Supplier.supp_phone  == data.supp_phone,
                Supplier.is_deleted  == False
            )
        )
        existing = result.scalar_one_or_none()
        if existing:
            return error_response("Supplier with this phone already exists", 400)

    new_supplier = Supplier(
        business_id       = business_id,
        supp_name         = data.supp_name,
        supp_phone        = data.supp_phone,
        supp_email        = data.supp_email,
        supp_address      = data.supp_address,
        supp_state        = data.supp_state,
        supp_country_code = data.supp_country_code,
        supp_tax_number   = data.supp_tax_number,
        updated_by        = current_user["user_id"]
    )

    db.add(new_supplier)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        return error_response("Supplier with this phone already exists", 400)
    # Re-set GUCs after commit (SET LOCAL is transaction-scoped)
    await async_set_rls_gucs_after_commit(db, current_user)
    await db.refresh(new_supplier)

    creator_name = (await db.execute(
        text("SELECT full_name FROM profiles WHERE id = CAST(:uid AS uuid)"),
        {"uid": str(current_user["user_id"])}
    )).scalar()

    return success_response({
        "message":  "Supplier created successfully",
        "supplier": supplier_to_dict(new_supplier, last_updated_by=creator_name)
    }, status_code=201)


# ══════════════════════════════════════════════════════════════════
# POST /suppliers/import → Bulk import suppliers from CSV
# ══════════════════════════════════════════════════════════════════
@router.post("/import")
async def import_suppliers(
    file: UploadFile = File(...),
    current_user: dict = Depends(require_permission("suppliers.manage")),
    db: AsyncSession = Depends(get_async_db)
):
    business_id = current_user["business_id"]
    user_id = current_user["user_id"]

    # ── 1. Parse CSV ──────────────────────────────────────────────────────────
    file_bytes = await file.read()
    rows, parse_error = parse_csv_file(file_bytes)
    if parse_error:
        return error_response(parse_error, 400)

    # ── 2. Validate & transform rows ──────────────────────────────────────────
    def row_transform(row: dict, row_num: int):
        name = strip_and_escape_html(row.get("supp_name", "")).strip()
        phone = strip_and_escape_html(row.get("supp_phone", "")).strip() if row.get("supp_phone") else None
        email = strip_and_escape_html(row.get("supp_email", "")).strip() if row.get("supp_email") else None
        address = strip_and_escape_html(row.get("supp_address", "")).strip() if row.get("supp_address") else None
        state = strip_and_escape_html(row.get("supp_state", "")).strip() if row.get("supp_state") else None
        country_code = strip_and_escape_html(row.get("supp_country_code", "")).strip() if row.get("supp_country_code") else None
        tax_number = strip_and_escape_html(row.get("supp_tax_number", "")).strip() if row.get("supp_tax_number") else None

        if not name:
            return None, "supplier name is required"
        if phone and "@" in phone:  # simple sanity check
            return None, "phone appears to be an email"
        if email and "@" not in email:
            return None, "invalid email format"

        return {
            "supp_name": name,
            "supp_phone": phone,
            "supp_email": email,
            "supp_address": address,
            "supp_state": state,
            "supp_country_code": country_code,
            "supp_tax_number": tax_number,
            "_row_number": row_num
        }, None

    valid_rows, errors = validate_rows(rows, row_transform)

    # ── 3. Check bulk create tier limit ───────────────────────────────────────
    sub_type = current_user.get("subscription_type") or await fetch_subscription_type_async(db, business_id)
    allowed_count, limit_msg = await check_bulk_create_allowed(
        db, business_id, sub_type, "max_suppliers", "suppliers", len(valid_rows)
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
        phone_list = [r["supp_phone"] for r in valid_rows if r.get("supp_phone")]
        if phone_list:
            placeholders = ", ".join([f":phone_{i}" for i in range(len(phone_list))])
            params = {"bid": business_id}
            for i, p in enumerate(phone_list):
                params[f"phone_{i}"] = p

            existing_rows = (await db.execute(text(f"""
                SELECT supp_id, supp_phone
                FROM suppliers
                WHERE business_id = CAST(:bid AS uuid)
                  AND supp_phone IN ({placeholders})
                  AND is_deleted = false
            """), params)).fetchall()

            for r in existing_rows:
                existing_phones[r.supp_phone] = str(r.supp_id)

    # ── 5. Upsert in chunks ───────────────────────────────────────────────────
    created = 0
    updated = 0
    upsert_errors = []

    for chunk in chunk_list(valid_rows):
        for row in chunk:
            row_num = row.pop("_row_number")
            phone = row.get("supp_phone")

            try:
                if phone and phone in existing_phones:
                    # UPDATE existing
                    supp_id = existing_phones[phone]
                    await db.execute(text("""
                        UPDATE suppliers
                        SET supp_name = :name,
                            supp_email = :email,
                            supp_address = :address,
                            supp_state = :state,
                            supp_country_code = :country_code,
                            supp_tax_number = :tax_number,
                            -- FIXED added updated_by to match customer.py's bulk-import pattern
                            updated_by = CAST(:uid AS uuid)
                        WHERE supp_id = CAST(:sid AS uuid)
                          AND business_id = CAST(:bid AS uuid)
                    """), {**row, "sid": supp_id, "bid": business_id, "uid": user_id})
                    updated += 1
                else:
                    # INSERT new
                    new_supp_id = str(uuid.uuid4())
                    await db.execute(text("""
                        INSERT INTO suppliers (
                            supp_id, business_id, supp_name, supp_phone, supp_email,
                            supp_address, supp_state, supp_country_code, supp_tax_number,
                            updated_by
                        ) VALUES (
                            CAST(:sid AS uuid), CAST(:bid AS uuid), :name, :phone, :email,
                            :address, :state, :country_code, :tax_number,
                            CAST(:uid AS uuid)
                        )
                    """), {**row, "sid": new_supp_id, "bid": business_id, "uid": user_id})
                    if phone:
                        existing_phones[phone] = new_supp_id  # prevent dup within same import
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
# GET /suppliers/lean → Lean supplier list for create-purchase dropdown
#
# Returns only supp_id, supp_name, supp_phone, supp_state — no JOIN.
# Mirrors the /customers/lean pattern used by the sales creation form.
# Declared BEFORE /{supp_id} so FastAPI matches "lean" as a literal
# path segment, not a UUID.
# ══════════════════════════════════════════════════════════════════
@router.get("/lean")
async def get_suppliers_lean(
    current_user: dict = Depends(require_permission("suppliers.manage")),
    db:           AsyncSession = Depends(get_async_db)
):
    business_id = current_user["business_id"]
    rows = (await db.execute(
        text("""
            SELECT supp_id, supp_name, supp_phone, supp_state
            FROM   suppliers
            WHERE  business_id = CAST(:bid AS uuid)
              AND  is_deleted   = false
            ORDER  BY supp_name ASC
        """),
        {"bid": business_id}
    )).fetchall()

    return success_response([
        {
            "supp_id":    str(r.supp_id),
            "supp_name":  r.supp_name,
            "supp_phone": r.supp_phone,
            "supp_state": r.supp_state,
        }
        for r in rows
    ])


# ══════════════════════════════════════════════════════════════════
# GET /suppliers → Paginated list with server-side search/sort/filter
#
# SCALABILITY: all filtering, sorting, and counting happens in
# PostgreSQL before any rows are sent to the browser.
#
# The COUNT query and the data query share the same params dict and
# the same WHERE clause so pagination totals are always accurate.
# ══════════════════════════════════════════════════════════════════
@router.get("/")
async def get_all_suppliers(
    current_user: dict          = Depends(require_permission("suppliers.manage")),
    db:           AsyncSession  = Depends(get_async_db),
    pagination:   dict          = Depends(paginate_async),
    search:       Optional[str] = Query(default=None, description="Search by name, phone, or email"),
    phone:        Optional[str] = Query(default=None, description="Exact phone match (for purchase form auto-fill)"),
    updated_from: Optional[str] = Query(default=None, description="Filter updated_at >= YYYY-MM-DD"),
    updated_to:   Optional[str] = Query(default=None, description="Filter updated_at <= YYYY-MM-DD"),
    sort_by:      Optional[str] = Query(default="updated_at", description="Column to sort by"),
    sort_dir:     Optional[str] = Query(default="desc",       description="asc or desc"),
):
    business_id = current_user["business_id"]

    # ── Whitelist sort columns to prevent SQL injection ───────────────────
    SORTABLE = {
        "supp_name":         "s.supp_name",
        "supp_phone":        "s.supp_phone",
        "supp_email":        "s.supp_email",
        "supp_state":        "s.supp_state",
        "supp_country_code": "s.supp_country_code",
        "supp_created_at":   "s.supp_created_at",
        "updated_at":        "s.updated_at",
    }
    order_col = SORTABLE.get(sort_by, "s.updated_at")
    order_dir = "DESC" if str(sort_dir).lower() == "desc" else "ASC"

    # ── Build dynamic WHERE clauses ───────────────────────────────────────
    extra_where = ""
    params: dict = {
        "bid":    str(business_id),
        "offset": pagination["offset"],
        "limit":  pagination["limit"],
    }

    if search and search.strip():
        extra_where += """
            AND (
                s.supp_name  ILIKE :search_q
             OR s.supp_phone ILIKE :search_q
             OR s.supp_email ILIKE :search_q
            )
        """
        params["search_q"] = f"%{search.strip()}%"

    if phone:
        extra_where += " AND s.supp_phone = :exact_phone"
        params["exact_phone"] = phone

    # TIMEZONE FIX: frontend sends UTC ISO strings (local day start/end converted
    # to UTC). Compare directly — no CAST to date (which would use server UTC timezone).
    if updated_from:
        extra_where += " AND s.updated_at >= :updated_from"
        params["updated_from"] = updated_from

    if updated_to:
        extra_where += " AND s.updated_at <= :updated_to"
        params["updated_to"] = updated_to

    rows = (await db.execute(
        text(f"""
            SELECT
                s.supp_id, s.business_id,
                s.supp_name, s.supp_phone, s.supp_email,
                s.supp_address, s.supp_state, s.supp_country_code,
                s.supp_tax_number,
                s.supp_created_at,
                s.updated_at,
                s.updated_by,
                prof.full_name AS last_updated_by,
                COUNT(*) OVER() AS total_count
            FROM suppliers s
            LEFT JOIN profiles prof ON prof.id = s.updated_by
            WHERE s.business_id = CAST(:bid AS uuid)
              AND s.is_deleted   = false
              {extra_where}
            ORDER BY {order_col} {order_dir}
            OFFSET :offset LIMIT :limit
        """),
        params
    )).fetchall()

    total = rows[0].total_count if rows else 0

    data = [
        {
            "supp_id":           str(r.supp_id),
            "business_id":       str(r.business_id),
            "supp_name":         r.supp_name,
            "supp_phone":        r.supp_phone,
            "supp_email":        r.supp_email,
            "supp_address":      r.supp_address,
            "supp_state":        r.supp_state,
            "supp_country_code": r.supp_country_code,
            "supp_tax_number":   r.supp_tax_number,
            "supp_created_at":   fmt_ts(r.supp_created_at),
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
# GET /suppliers/search/phone?phone=9876543210
# Used by purchase creation form for quick single-record lookup.
# ══════════════════════════════════════════════════════════════════
@router.get("/search/phone")
async def search_supplier_by_phone(
    phone:        str,
    current_user: dict = Depends(require_permission("suppliers.manage")),
    db:           AsyncSession = Depends(get_async_db)
):
    business_id = current_user["business_id"]

    if not phone or not phone.strip():
        return error_response("Phone number is required", 400)

    result = await db.execute(
        select(Supplier).where(
            Supplier.business_id == business_id,
            Supplier.supp_phone  == phone.strip(),
            Supplier.is_deleted  == False
        )
    )
    supplier = result.scalar_one_or_none()

    if not supplier:
        return error_response(
            f"No supplier found with phone number '{phone}'", 404
        )

    return success_response(supplier_to_dict(supplier))


# ══════════════════════════════════════════════════════════════════
# GET /suppliers/{supp_id} → Single supplier by ID
# ══════════════════════════════════════════════════════════════════
@router.get("/{supp_id}")
async def get_supplier(
    supp_id:      str,
    current_user: dict = Depends(require_permission("suppliers.manage")),
    db:           AsyncSession = Depends(get_async_db)
):
    business_id = current_user["business_id"]

    result = await db.execute(
        select(Supplier).where(
            Supplier.supp_id     == supp_id,
            Supplier.business_id == business_id,
            Supplier.is_deleted  == False
        )
    )
    supplier = result.scalar_one_or_none()

    if not supplier:
        return error_response("Supplier not found", 404)

    return success_response(supplier_to_dict(supplier))


# ══════════════════════════════════════════════════════════════════
# PUT /suppliers/{supp_id} → Update supplier
# ══════════════════════════════════════════════════════════════════
@router.put("/{supp_id}")
async def update_supplier(
    supp_id:      str,
    data:         SupplierUpdate,
    current_user: dict = Depends(require_permission("suppliers.manage")),
    db:           AsyncSession = Depends(get_async_db)
):
    business_id = current_user["business_id"]

    result = await db.execute(
        select(Supplier).where(
            Supplier.supp_id     == supp_id,
            Supplier.business_id == business_id,
            Supplier.is_deleted  == False
        )
    )
    supplier = result.scalar_one_or_none()

    if not supplier:
        return error_response("Supplier not found", 404)

    if data.supp_phone:
        result = await db.execute(
            select(Supplier).where(
                Supplier.business_id == business_id,
                Supplier.supp_id     != supp_id,
                Supplier.supp_phone  == data.supp_phone,
                Supplier.is_deleted  == False
            )
        )
        existing = result.scalar_one_or_none()
        if existing:
            return error_response("Supplier with this phone already exists", 400)

    if data.supp_name         is not None: supplier.supp_name         = data.supp_name
    if data.supp_phone        is not None: supplier.supp_phone        = data.supp_phone
    if data.supp_email        is not None: supplier.supp_email        = data.supp_email
    if data.supp_address      is not None: supplier.supp_address      = data.supp_address
    if data.supp_state        is not None: supplier.supp_state        = data.supp_state
    if data.supp_country_code is not None: supplier.supp_country_code = data.supp_country_code
    if data.supp_tax_number   is not None: supplier.supp_tax_number   = data.supp_tax_number

    # updated_by is auto-set by DB trigger trg_suppliers_updated_by

    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        return error_response("Supplier with this phone already exists", 400)
    # Re-set GUCs after commit (SET LOCAL is transaction-scoped)
    await async_set_rls_gucs_after_commit(db, current_user)
    await db.refresh(supplier)

    updated_by_name = (await db.execute(
        text("SELECT full_name FROM profiles WHERE id = CAST(:uid AS uuid)"),
        {"uid": str(supplier.updated_by)}
    )).scalar()

    return success_response({
        "message":  "Supplier updated successfully",
        "supplier": supplier_to_dict(supplier, last_updated_by=updated_by_name)
    })


# ══════════════════════════════════════════════════════════════════
# DELETE /suppliers/{supp_id} → Soft delete
# ══════════════════════════════════════════════════════════════════
@router.delete("/{supp_id}")
async def delete_supplier(
    supp_id:      str,
    current_user: dict = Depends(require_permission("suppliers.manage")),
    db:           AsyncSession = Depends(get_async_db)
):
    business_id = current_user["business_id"]

    result = await db.execute(
        select(Supplier).where(
            Supplier.supp_id     == supp_id,
            Supplier.business_id == business_id,
            Supplier.is_deleted  == False
        )
    )
    supplier = result.scalar_one_or_none()

    if not supplier:
        return error_response("Supplier not found", 404)

    supplier.is_deleted = True
    # updated_by is auto-set by DB trigger trg_suppliers_updated_by
    await db.commit()

    return success_response({"message": "Supplier deleted successfully"})
