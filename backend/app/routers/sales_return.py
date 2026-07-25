# app/routers/sales_return.py
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
# NOTE: This file does NOT use bulk_stock_adjust.py.  Sales return restocking
# is handled entirely by the DB trigger fn_sales_return_stock (AFTER UPDATE
# on sales_returns).  No manual Python stock-adjustment logic is needed here.
#

from fastapi import APIRouter, Depends, Query
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, text
from app.database import get_async_db
from app.middleware.rbac import require_permission, async_set_rls_gucs_after_commit
from app.models.sales_return import SalesReturn
from app.models.sale import Sale
from app.schemas.sales_return import SalesReturnCreate, SalesReturnUpdate
from app.utils.response import success_response, error_response
from app.utils.pagination import paginate_async, pagination_response
from app.utils.timestamp import fmt_ts
from app.utils.payment_helpers import record_payment_and_sync_async, calculate_payment_status
from datetime import datetime, timezone
import logging
from decimal import Decimal
import uuid

router = APIRouter(prefix="/v1/sales-returns", tags=["Sales Returns"])


# ─────────────────────────────────────────
# HELPER: Fetch return items via raw SQL
# FIX: Now reads from sales_return_items (the table the DB triggers use),
#      not return_items (the orphan table that has no trigger connection).
# ─────────────────────────────────────────
async def fetch_return_items(db: AsyncSession, return_id: str):
    return (await db.execute(
        text("""
            SELECT sri.return_item_id, sri.product_id,
                   p.prod_name AS product_name,
                   sri.return_qty, sri.unit_price AS refund_amount,
                   (sri.return_qty * sri.unit_price) AS return_item_subtotal
            FROM sales_return_items sri
            LEFT JOIN products p ON p.prod_id = sri.product_id
            WHERE sri.return_id = CAST(:rid AS uuid)
        """),
        {"rid": return_id}
    )).fetchall()


# ─────────────────────────────────────────
# HELPER: Format return row as dict
# ─────────────────────────────────────────
def return_to_dict(r, items):
    invoice_no = getattr(r, 'invoice_no', None)
    return {
        "return_id": str(r.return_id),
        "business_id": str(r.business_id),
        "sale_id": str(r.sale_id),
        "invoice_no": invoice_no,
        "return_amount": float(r.return_amount),
        "return_reason": r.return_reason,
        "return_status": r.return_status,
        "restock": r.restock,
        "stock_updated": r.stock_updated,
        "refund_method": r.refund_method,
        "approved_by": getattr(r, 'approved_by_name', None) or (str(r.approved_by) if r.approved_by else None),
        "approved_at": fmt_ts(r.approved_at),
        "rejected_reason": r.rejected_reason,
        "return_created_at": fmt_ts(r.return_created_at),
        "created_by": str(r.created_by) if r.created_by else None,
        "updated_at": fmt_ts(r.updated_at) if hasattr(r, "updated_at") else None,
        "last_updated_by": r.last_updated_by if hasattr(r, "last_updated_by") else None,
        "items": [return_item_to_dict(i) for i in items]
    }


# ─────────────────────────────────────────
# HELPER: Format return item as dict
# ─────────────────────────────────────────
def return_item_to_dict(row):
    return {
        "return_item_id": str(row.return_item_id),
        "product_id": str(row.product_id),
        "product_name": row.product_name,
        "return_qty": float(row.return_qty),
        "refund_amount": float(row.refund_amount),
        "return_item_subtotal": float(row.return_item_subtotal) if row.return_item_subtotal else None
    }


# ─────────────────────────────────────────
# HELPER: Validate return items against original sale
# FIX: Now queries sales_return_items and uses sale_item_id for lookups,
#      matching the DB trigger's validation logic exactly.
#
# CONCURRENCY SAFETY:
#   FOR UPDATE OF si serialises concurrent return-creation/approval requests
#   on the same sale_items rows. Without it, two concurrent requests both
#   read stale "already_returned" totals and both approve returns that
#   together exceed the original sale quantity — the DB trigger would then
#   add stock back twice (double-restock bug).
#
#   Matching the pattern in purchase_return.py validate_return_items (which
#   uses FOR UPDATE OF pi).
#
# TRANSACTION OWNERSHIP:
#   This function MUST only be called inside a transaction controlled by the
#   caller (inside the caller's try block, before its db.commit()). The row
#   lock acquired here is held until that commit. If called outside a
#   transaction — or if the caller commits before calling this — the lock
#   is released immediately and provides no protection.
# ─────────────────────────────────────────
async def validate_return_items(db: AsyncSession, sale_id: str, business_id: str, items, exclude_return_id: str = None):
    # Batch Step 1 → Fetch ALL sale items for this sale in one query
    prod_ids = [str(item.product_id) for item in items]
    sale_item_map = {}
    already_returned_map = {}

    if prod_ids:
        rows = (await db.execute(
            text("""
                SELECT si.product_id, si.sale_item_id, si.sale_item_quantity,
                       si.sale_item_unit_price, p.prod_name
                FROM sale_items si
                JOIN products p ON p.prod_id = si.product_id
                WHERE si.sale_id = CAST(:sale_id AS uuid)
                  AND si.business_id = CAST(:bid AS uuid)
                  AND si.product_id = ANY(CAST(:pids AS uuid[]))
                -- FIXED added FOR UPDATE OF si for concurrency safety
                FOR UPDATE OF si  -- serialises concurrent return requests on the same sale (see comment above)
            """),
            # BUG FIX: asyncpg expects a Python list for array params, not a
            # manually-formatted "{uuid1,uuid2}" string (causes DataError).
            {"sale_id": sale_id, "bid": business_id, "pids": prod_ids}
        )).fetchall()
        sale_item_map = {str(r.product_id): r for r in rows}

        # Batch Step 2 → Fetch ALL already-returned quantities in one GROUP BY query
        q = """
            SELECT sri.product_id, COALESCE(SUM(sri.return_qty), 0) AS total_returned
            FROM sales_return_items sri
            JOIN sales_returns sr ON sr.return_id = sri.return_id
            WHERE sri.product_id = ANY(CAST(:pids AS uuid[]))
              AND sr.business_id = CAST(:bid AS uuid)
              AND sr.return_status != 'rejected'
        """
        # BUG FIX: asyncpg expects a Python list for array params, not a
        # manually-formatted "{uuid1,uuid2}" string (causes DataError).
        params = {"pids": prod_ids, "bid": business_id}
        if exclude_return_id:
            q += " AND sr.return_id != CAST(:return_id AS uuid)"
            params["return_id"] = exclude_return_id
        q += " GROUP BY sri.product_id"
        for row in (await db.execute(text(q), params)).fetchall():
            already_returned_map[str(row.product_id)] = float(row.total_returned)

    for item in items:
        product_id = str(item.product_id)
        sale_item = sale_item_map.get(product_id)

        if not sale_item:
            return f"Product '{product_id}' was not part of this sale"

        already_returned = already_returned_map.get(product_id, 0)
        available = float(sale_item.sale_item_quantity) - already_returned

        if item.return_qty > available:
            return (
                f"'{sale_item.prod_name}' return qty ({item.return_qty}) exceeds "
                f"available qty ({available}). Already returned: {int(already_returned)} "
                f"of {sale_item.sale_item_quantity}."
            )

        if float(item.refund_amount) > float(sale_item.sale_item_unit_price):
            return (
                f"'{sale_item.prod_name}' refund amount ({item.refund_amount}) cannot exceed "
                f"original sale price ({float(sale_item.sale_item_unit_price)})"
            )

    return None


# ─────────────────────────────────────────
# POST /sales-returns → Create sales return
# FIX: Now inserts into sales_return_items (trigger-compatible) with all required
#      columns (sale_item_id, unit_price, business_id, original_qty, original_unit_price).
#      The DB trigger trg_sales_return_stock fires on sales_returns UPDATE to handle
#      stock restocking when status changes to 'approved'.
# ── PERMISSION SPLIT (2026-07) ──────────────────────────────────────────────
# Requires "sales_returns.manage" (staff, manager, admin).
# If the caller lacks "sales_returns.approve", any non-pending status is
# silently downgraded to "pending" so staff can create but not approve.
# ─────────────────────────────────────────
@router.post("/")
async def create_sales_return(
    data: SalesReturnCreate,
    current_user: dict = Depends(require_permission("sales_returns.manage")),
    db: AsyncSession = Depends(get_async_db)
):
    business_id = current_user["business_id"]
    user_id = current_user["user_id"]

    # ── PERMISSION SPLIT (2026-07) ──────────────────────────────────────────
    # Staff with manage-only cannot approve on create — silently downgrade.
    can_approve = "sales_returns.approve" in current_user["permissions"]
    requested_status = data.return_status or "pending"
    if requested_status != "pending" and not can_approve:
        requested_status = "pending"

    try:
        # Step 1 → Validate sale exists
        result = await db.execute(
            select(Sale).where(
                Sale.sales_id == data.sale_id,
                Sale.business_id == business_id,
                Sale.is_deleted == False
            )
        )
        sale = result.scalar_one_or_none()

        if not sale:
            return error_response("Sale not found", status_code=404)

        # Step 2 → Validate return items
        error = await validate_return_items(db=db, sale_id=str(data.sale_id), business_id=business_id, items=data.items)
        if error:
            return error_response(error, status_code=400)

        # Step 3 → Resolve sale_item_id and calc totals for each return item
        # BATCH: single query for all items instead of N individual lookups
        total_refund = Decimal("0")
        calculated_items = []

        sale_item_rows = {}
        if data.items:
            prod_ids = [str(item.product_id) for item in data.items]
            rows = (await db.execute(
                text("""
                    SELECT product_id, sale_item_id, sale_item_quantity, sale_item_unit_price
                    FROM sale_items
                    WHERE sale_id = CAST(:sale_id AS uuid)
                      AND product_id = ANY(CAST(:pids AS uuid[]))
                """),
                # BUG FIX: asyncpg expects a Python list for array params, not a
                # manually-formatted "{uuid1,uuid2}" string (causes DataError).
                {"sale_id": str(data.sale_id), "pids": prod_ids}
            )).fetchall()
            sale_item_rows = {str(r.product_id): r for r in rows}

        for item in data.items:
            sale_item = sale_item_rows.get(str(item.product_id))
            if not sale_item:
                return error_response(
                    f"Product '{item.product_id}' was not part of this sale",
                    status_code=400
                )

            total_refund += item.refund_amount * item.return_qty
            calculated_items.append({
                "sale_item_id": str(sale_item.sale_item_id),
                "product_id": str(item.product_id),
                "return_qty": item.return_qty,
                "refund_amount": item.refund_amount,
                "original_qty": sale_item.sale_item_quantity,
                "original_unit_price": sale_item.sale_item_unit_price
            })

        # Step 4 → Insert sales return header
        new_return_id = str(uuid.uuid4())

        await db.execute(
            text("""
                INSERT INTO sales_returns (
                    return_id, business_id, sale_id,
                    return_amount, return_reason,
                    return_status, restock, created_by
                ) VALUES (
                    CAST(:return_id AS uuid),
                    CAST(:business_id AS uuid),
                    CAST(:sale_id AS uuid),
                    :return_amount, :return_reason,
                    :return_status, :restock,
                    CAST(:created_by AS uuid)
                )
            """),
            {
                "return_id": new_return_id,
                "business_id": business_id,
                "sale_id": str(data.sale_id),
                "return_amount": str(total_refund),
                "return_reason": data.return_reason,
                "return_status": requested_status,
                "restock": data.restock,
                "created_by": user_id
            }
        )

        # Step 5 → Insert return items into sales_return_items
        # This table is what the DB trigger trg_validate_sales_return_items watches.
        # Required columns: sale_item_id, unit_price, original_qty, original_unit_price, business_id
        if calculated_items:
            value_clauses = []
            params: dict = {"rid": new_return_id, "bid": business_id}
            for i, calc in enumerate(calculated_items):
                tag = f"i{i}"
                value_clauses.append(
                    f"(CAST(:{tag}_id AS uuid), CAST(:rid AS uuid), "
                    f" CAST(:{tag}_sid AS uuid), CAST(:{tag}_pid AS uuid), "
                    f" :{tag}_qty, :{tag}_up, :{tag}_oq, :{tag}_oup, "
                    f" CAST(:bid AS uuid))"
                )
                params[f"{tag}_id"]  = str(uuid.uuid4())
                params[f"{tag}_sid"] = calc["sale_item_id"]
                params[f"{tag}_pid"] = calc["product_id"]
                params[f"{tag}_qty"] = calc["return_qty"]
                params[f"{tag}_up"]  = str(calc["refund_amount"])
                params[f"{tag}_oq"]  = calc["original_qty"]
                params[f"{tag}_oup"] = str(calc["original_unit_price"])

            await db.execute(text(f"""
                INSERT INTO sales_return_items (
                    return_item_id, return_id, sale_item_id,
                    product_id, return_qty, unit_price,
                    original_qty, original_unit_price, business_id
                ) VALUES {", ".join(value_clauses)}
            """), params)

        await db.commit()

        # Re-set GUCs after commit (SET LOCAL is transaction-scoped)
        await async_set_rls_gucs_after_commit(db, current_user)

        result = await db.execute(
            select(SalesReturn).where(SalesReturn.return_id == new_return_id)
        )
        return_row = result.scalar_one_or_none()

        item_rows = await fetch_return_items(db, new_return_id)

        return success_response({
            "message": "Sales return created successfully",
            "return": return_to_dict(return_row, item_rows)
        }, status_code=201)

    except Exception as e:
        await db.rollback()
        logging.exception(e)
        return error_response("An unexpected error occurred. Please try again.", status_code=500)


# ─────────────────────────────────────────
# GET /sales-returns → Get all sales returns
# ─────────────────────────────────────────
@router.get("/")
async def get_all_sales_returns(
    current_user: dict = Depends(require_permission("sales_returns.manage")),
    db: AsyncSession = Depends(get_async_db),
    pagination: dict = Depends(paginate_async),
    search: Optional[str] = Query(default=None),
    status: Optional[str] = Query(default=None),
    sort_by: Optional[str] = Query(default="return_created_at"),
    sort_dir: Optional[str] = Query(default="desc"),
    date_from: Optional[str] = Query(default=None),
    date_to: Optional[str] = Query(default=None),
):
    business_id = current_user["business_id"]

    SORTABLE = {
        "return_created_at": "sr.return_created_at",
        "return_status":     "sr.return_status",
        "return_amount":     "sr.return_amount",
    }
    order_col = SORTABLE.get(sort_by, "sr.return_created_at")
    order_dir = "DESC" if str(sort_dir).lower() == "desc" else "ASC"

    extra_where = ""
    params = {"bid": business_id}

    if search and search.strip():
        extra_where += " AND (sr.return_reason ILIKE :search OR s.invoice_no ILIKE :search)"
        params["search"] = f"%{search.strip()}%"

    if status and status.strip():
        extra_where += " AND sr.return_status = :status"
        params["status"] = status.strip()

    if date_from:
        extra_where += " AND sr.return_created_at >= :date_from"
        params["date_from"] = datetime.fromisoformat(date_from.replace("Z", ""))

    if date_to:
        extra_where += " AND sr.return_created_at <= :date_to"
        params["date_to"] = datetime.fromisoformat(date_to.replace("Z", ""))

    params["offset"] = pagination["offset"]
    params["limit"] = pagination["limit"]

    list_sql = f"""
        SELECT sr.*, s.invoice_no,
               prof.full_name AS last_updated_by,
               prof2.full_name AS approved_by_name,
               COUNT(*) OVER() AS total_count
        FROM sales_returns sr
        LEFT JOIN sales s ON s.sales_id = sr.sale_id
        LEFT JOIN profiles prof ON prof.id = sr.updated_by
        LEFT JOIN profiles prof2 ON prof2.id = sr.approved_by
        WHERE sr.business_id = CAST(:bid AS uuid)
        {extra_where}
        ORDER BY {order_col} {order_dir}
        OFFSET :offset LIMIT :limit
    """
    returns = (await db.execute(text(list_sql), params)).fetchall()
    total = returns[0].total_count if returns else 0

    # BATCH: fetch all return items for this page in one query
    ret_ids = [str(r.return_id) for r in returns]
    all_items = []
    if ret_ids:
        all_items = (await db.execute(
            text("""
                SELECT sri.return_item_id, sri.return_id, sri.product_id,
                       p.prod_name AS product_name,
                       sri.return_qty, sri.unit_price AS refund_amount,
                       (sri.return_qty * sri.unit_price) AS return_item_subtotal
                FROM sales_return_items sri
                LEFT JOIN products p ON p.prod_id = sri.product_id
                WHERE sri.return_id = ANY(CAST(:ids AS uuid[]))
            """),
            # BUG FIX: asyncpg expects a Python list for array params, not a
            # manually-formatted "{uuid1,uuid2}" string (causes DataError).
            {"ids": ret_ids}
        )).fetchall()

    items_by_ret = {}
    for it in all_items:
        key = str(it.return_id)
        items_by_ret.setdefault(key, []).append(it)

    result = []
    for r in returns:
        items = items_by_ret.get(str(r.return_id), [])
        result.append(return_to_dict(r, items))

    return success_response(
        pagination_response(result, total, pagination["page"], pagination["limit"], capped=pagination["_capped"])
    )


# ─────────────────────────────────────────
# GET /sales-returns/by-sale/{sale_id} → All returns for a sale (drawer)
# ─────────────────────────────────────────
@router.get("/by-sale/{sale_id}")
async def get_sales_returns_by_sale(
    sale_id: str,
    current_user: dict = Depends(require_permission("sales.view")),
    db: AsyncSession = Depends(get_async_db),
):
    business_id = current_user["business_id"]

    return_rows = (await db.execute(text("""
        SELECT sr.return_id, sr.sale_id, sr.return_amount,
               sr.return_reason, sr.return_status,
               sr.return_created_at
        FROM sales_returns sr
        WHERE sr.sale_id      = CAST(:sid AS uuid)
          AND sr.business_id  = CAST(:bid AS uuid)
        ORDER BY sr.return_created_at DESC
    """), {"sid": sale_id, "bid": business_id})).fetchall()

    result = [
        {
            "return_id":         str(r.return_id),
            "return_amount":     float(r.return_amount),
            "return_reason":     r.return_reason,
            "return_status":     r.return_status,
            "return_created_at": fmt_ts(r.return_created_at),
        }
        for r in return_rows
    ]

    return success_response(result)


# ─────────────────────────────────────────
# GET /sales-returns/{return_id} → Get one
# ─────────────────────────────────────────
@router.get("/{return_id}")
async def get_sales_return(
    return_id: str,
    current_user: dict = Depends(require_permission("sales_returns.manage")),
    db: AsyncSession = Depends(get_async_db)
):
    business_id = current_user["business_id"]

    row = (await db.execute(
        text("""
            SELECT sr.*, s.invoice_no,
                   prof.full_name AS last_updated_by,
                   prof2.full_name AS approved_by_name
            FROM sales_returns sr
            LEFT JOIN sales s ON s.sales_id = sr.sale_id
            LEFT JOIN profiles prof ON prof.id = sr.updated_by
            LEFT JOIN profiles prof2 ON prof2.id = sr.approved_by
            WHERE sr.return_id = CAST(:rid AS uuid)
              AND sr.business_id = CAST(:bid AS uuid)
        """),
        {"rid": return_id, "bid": business_id}
    )).fetchone()

    if not row:
        return error_response("Sales return not found", status_code=404)

    items = await fetch_return_items(db, return_id)
    return success_response(return_to_dict(row, items))


# ─────────────────────────────────────────
# PUT /sales-returns/{return_id} → Update status
# The DB trigger trg_sales_return_stock fires on UPDATE to sales_returns.
# When status becomes 'approved' and restock=true, it adds stock back automatically.
# When status rolls back from 'approved', it reverses the stock addition.
# ── PERMISSION SPLIT (2026-07) ──────────────────────────────────────────────
# Requires "sales_returns.approve" — only admin/manager can approve/reject.
# Staff with manage-only are blocked here (403).
# ─────────────────────────────────────────
@router.put("/{return_id}")
async def update_sales_return(
    return_id: str,
    data: SalesReturnUpdate,
    current_user: dict = Depends(require_permission("sales_returns.approve")),
    db: AsyncSession = Depends(get_async_db)
):
    business_id = current_user["business_id"]
    user_id     = current_user["user_id"]

    result = await db.execute(
        select(SalesReturn).where(
            SalesReturn.return_id == return_id,
            SalesReturn.business_id == business_id
        )
    )
    sales_return = result.scalar_one_or_none()

    if not sales_return:
        return error_response("Sales return not found", status_code=404)

    if sales_return.return_status == "approved":
        return error_response("Cannot update return — already approved", status_code=400)

    try:
        if data.return_status == "approved":
            item_rows = await fetch_return_items(db, return_id)

            class ItemLike:
                def __init__(self, product_id, return_qty, refund_amount):
                    self.product_id = product_id
                    self.return_qty = return_qty
                    self.refund_amount = refund_amount

            items_to_validate = [
                ItemLike(row.product_id, row.return_qty, row.refund_amount)
                for row in item_rows
            ]

            error = await validate_return_items(
                db=db,
                sale_id=str(sales_return.sale_id),
                business_id=business_id,
                items=items_to_validate,
                exclude_return_id=return_id
            )
            if error:
                return error_response(error, status_code=400)

        # Update status, restock, and approval fields — DB triggers fire automatically
        restock_provided = data.restock is not None
        await db.execute(
            text("""
                UPDATE sales_returns
                SET return_status = CAST(:status AS text),
                    -- FIXED restock only written when explicitly provided (guarded by restock_provided)
                    restock = CASE WHEN :restock_provided THEN :restock ELSE restock END,
                    approved_by = CASE WHEN CAST(:status AS text) = 'approved' THEN CAST(:approved_by AS uuid) ELSE approved_by END,
                    approved_at = CASE WHEN CAST(:status AS text) = 'approved' THEN NOW() ELSE approved_at END,
                    -- FIXED stock_updated only set on approved+restock
                    stock_updated = CASE WHEN CAST(:status AS text) = 'approved' AND :restock_provided AND :restock = true THEN true ELSE stock_updated END
                WHERE return_id = CAST(:return_id AS uuid)
                  AND business_id = CAST(:bid AS uuid)
            """),
            {
                "status":             data.return_status,
                "restock":            data.restock,
                "restock_provided":   restock_provided,
                "approved_by":        str(user_id),
                "return_id":          return_id,
                "bid":                business_id
            }
        )

        # ── Process refund: reduce what customer owes or create expense for excess ──
        #
        # APPROVAL REFUND LOGIC (2026-07):
        # When a sales return is approved, the refund amount either:
        #   (a) Reduces the remaining amount the customer owes
        #       (covered_by_reducing = min(return_amount, remaining))
        #   (b) Exceeds what's still owed — the excess is refunded to the
        #       customer as an expense (source_type = "sales_return",
        #       category = "other").
        #
        # The covered portion is recorded as an adjustment payment via
        # record_payment_and_sync_async(), which updates cumulative_paid
        # (read by dashboard, reports, and mv_dashboard_summary for
        # outstanding_receivables) and derives sales_payment_status from
        # calculate_payment_status() — the single source of truth.
        #
        # Formula:
        #   remaining_before  = sale_final - total_paid - other_refunded
        #   covered_by_reducing = min(return_amount, remaining_before)
        #   excess_refund     = return_amount - covered_by_reducing
        #
        # other_refunded excludes THIS return (it hasn't been committed
        # yet at this point in the flow).
        return_amount = Decimal(str(sales_return.return_amount or 0))

        if return_amount > 0:
            # Lock the sale row to serialize concurrent return approvals.
            # Without this, two pending returns on the same sale approved
            # simultaneously could both read stale total_paid/other_refunded
            # and double-credit the sale. Same pattern as create_payment's
            # FOR UPDATE lock on the sale row.
            await db.execute(
                text("SELECT 1 FROM sales WHERE sales_id = CAST(:sid AS uuid) AND business_id = CAST(:bid AS uuid) FOR UPDATE"),
                {"sid": str(sales_return.sale_id), "bid": str(business_id)}
            )

            # Fetch sale final amount
            sale_row = (await db.execute(
                text("""
                    SELECT sales_final_amount
                    FROM sales
                    WHERE sales_id    = CAST(:sid AS uuid)
                      AND business_id = CAST(:bid AS uuid)
                """),
                {"sid": str(sales_return.sale_id), "bid": str(business_id)}
            )).fetchone()
            sale_final = Decimal(str(sale_row.sales_final_amount)) if sale_row and sale_row.sales_final_amount else Decimal("0")

            # Fetch cumulative paid
            pay_row = (await db.execute(
                text("""
                    SELECT COALESCE(cumulative_paid, 0) AS total_paid
                    FROM payments
                    WHERE sale_id     = CAST(:sid AS uuid)
                      AND business_id = CAST(:bid AS uuid)
                      AND is_active   = true
                """),
                {"sid": str(sales_return.sale_id), "bid": str(business_id)}
            )).fetchone()
            total_paid = Decimal(str(pay_row.total_paid)) if pay_row and pay_row.total_paid else Decimal("0")

            # Fetch total refunded from OTHER already-approved returns (excluding this one)
            other_ref_row = (await db.execute(
                text("""
                    SELECT COALESCE(SUM(return_amount), 0) AS other_refunded
                    FROM sales_returns
                    WHERE sale_id       = CAST(:sid AS uuid)
                      AND business_id   = CAST(:bid AS uuid)
                      AND return_status = 'approved'
                      AND return_id    != CAST(:rid AS uuid)
                """),
                {"sid": str(sales_return.sale_id), "bid": str(business_id), "rid": return_id}
            )).fetchone()
            other_refunded = Decimal(str(other_ref_row.other_refunded)) if other_ref_row and other_ref_row.other_refunded else Decimal("0")

            remaining_before    = max(Decimal("0"), sale_final - total_paid - other_refunded)
            covered_by_reducing = min(return_amount, remaining_before)
            excess_refund       = (return_amount - covered_by_reducing).quantize(Decimal("0.01"))

            # Record adjustment payment for the portion that reduces outstanding balance
            if covered_by_reducing > 0:
                new_cumulative = (total_paid + covered_by_reducing).quantize(Decimal("0.01"))
                new_status     = calculate_payment_status(new_cumulative, sale_final)

                await record_payment_and_sync_async(
                    db=db,
                    business_id=business_id,
                    sale_id=str(sales_return.sale_id),
                    payment_amount=covered_by_reducing,
                    payment_method="adjustment",
                    new_status=new_status,
                    cumulative_paid=new_cumulative,
                )

            # Expense only for the excess (actual money back to customer)
            if excess_refund > 0:
                cust_row = (await db.execute(
                    text("""
                        SELECT c.cust_name
                        FROM sales s
                        LEFT JOIN customers c ON c.cust_id = s.customer_id
                        WHERE s.sales_id    = CAST(:sid AS uuid)
                          AND s.business_id = CAST(:bid AS uuid)
                    """),
                    {"sid": str(sales_return.sale_id), "bid": str(business_id)}
                )).fetchone()
                customer_label = "Walk-in"
                if cust_row and cust_row.cust_name:
                    customer_label = cust_row.cust_name

                await db.execute(
                    text("""
                        INSERT INTO expenses (
                            expense_id, business_id, expense_category,
                            expense_amount, expense_notes, created_by,
                            source_type, source_id
                        ) VALUES (
                            CAST(:expense_id AS uuid),
                            CAST(:business_id AS uuid),
                            :expense_category,
                            :expense_amount,
                            :expense_notes,
                            CAST(:created_by AS uuid),
                            :source_type,
                            CAST(:source_id AS uuid)
                        )
                        ON CONFLICT (business_id, source_type, source_id)
                        WHERE is_deleted = false AND source_type IS NOT NULL
                        DO NOTHING
                    """),
                    {
                        "expense_id":       str(uuid.uuid4()),
                        "business_id":      business_id,
                        "expense_category": "other",
                        "expense_amount":   str(excess_refund),
                        "expense_notes":    f"Refund issued to {customer_label} — sales return {return_id}",
                        "created_by":       user_id,
                        "source_type":      "sales_return",
                        "source_id":        return_id
                    }
                )

        await db.commit()
        # Re-set GUCs after commit (SET LOCAL is transaction-scoped)
        await async_set_rls_gucs_after_commit(db, current_user)

        items = await fetch_return_items(db, return_id)

        return success_response({
            "message": f"Sales return {data.return_status} successfully",
            "return": return_to_dict(sales_return, items)
        })

    except Exception as e:
        await db.rollback()
        logging.exception(e)
        return error_response("An unexpected error occurred. Please try again.", status_code=500)

# ─────────────────────────────────────────
# DELETE /sales-returns/{return_id} → Delete pending return only
# WHY: Once a return is approved or rejected, it becomes part of the
# business record and must not be deleted. Only pending returns
# (not yet actioned) are safe to delete.
# ─────────────────────────────────────────
@router.delete("/{return_id}")
async def delete_sales_return(
    return_id: str,
    current_user: dict = Depends(require_permission("sales_returns.manage")),
    db: AsyncSession = Depends(get_async_db)
):
    business_id = current_user["business_id"]

    # Step 1 → Check the return exists and belongs to this business
    result = await db.execute(
        select(SalesReturn).where(
            SalesReturn.return_id == return_id,
            SalesReturn.business_id == business_id
        )
    )
    sales_return = result.scalar_one_or_none()

    if not sales_return:
        return error_response("Sales return not found", status_code=404)

    # Step 2 → Block deletion if not pending
    if sales_return.return_status != "pending":
        return error_response(
            f"Cannot delete a return with status '{sales_return.return_status}'. "
            "Only pending returns can be deleted.",
            status_code=400
        )

    try:
        # Step 3 → Delete return items first (FK constraint)
        await db.execute(
            text("""
                DELETE FROM sales_return_items
                WHERE return_id   = CAST(:return_id AS uuid)
                  AND business_id = CAST(:bid AS uuid)
            """),
            {"return_id": return_id, "bid": business_id}
        )

        # Step 4 → Delete the return header
        await db.execute(
            text("""
                DELETE FROM sales_returns
                WHERE return_id = CAST(:return_id AS uuid)
                  AND business_id = CAST(:bid AS uuid)
            """),
            {"return_id": return_id, "bid": business_id}
        )

        await db.commit()
        return success_response({"message": "Sales return deleted successfully"})

    except Exception as e:
        await db.rollback()
        logging.exception(e)
        return error_response("An unexpected error occurred. Please try again.", status_code=500)
