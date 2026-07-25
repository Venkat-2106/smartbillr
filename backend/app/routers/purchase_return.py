# app/routers/purchase_return.py
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

from fastapi import APIRouter, Depends, Query
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, text
from app.database import get_async_db
from app.middleware.rbac import require_permission, async_set_rls_gucs_after_commit
from app.models.purchase_return import PurchaseReturn
from app.schemas.purchase_return import PurchaseReturnCreate, PurchaseReturnUpdate
from app.utils.response import success_response, error_response
from app.utils.pagination import paginate_async, pagination_response
from app.utils.timestamp import fmt_ts
from app.utils.bulk_stock_adjust import bulk_check_and_reduce_stock
from decimal import Decimal
from datetime import datetime, timezone
import uuid
import logging

router = APIRouter(prefix="/v1/purchase-returns", tags=["Purchase Returns"])


# ─────────────────────────────────────────────
# HELPER — fetch return items with product name
# ─────────────────────────────────────────────
async def fetch_return_items(db: AsyncSession, return_id: str):
    return (await db.execute(text("""
        SELECT
            pri.return_item_id,
            pri.return_id,
            pri.product_id,
            p.prod_name AS product_name,
            pri.return_qty,
            pri.refund_amount,
            pri.return_item_subtotal
        FROM purchase_return_items pri
        JOIN products p ON p.prod_id = pri.product_id
        WHERE pri.return_id = CAST(:rid AS uuid)
    """), {"rid": return_id})).fetchall()


# ─────────────────────────────────────────────
# HELPER — format return row as dict
# ─────────────────────────────────────────────
def return_to_dict(r, items):
    supp_name = getattr(r, 'supp_name', None)
    # approved_by_name comes from the LEFT JOIN profiles ap query alias.
    # Falls back to raw UUID string if the JOIN wasn't performed (e.g.
    # when called from create_purchase_return's ORM result).
    approved_by_name = getattr(r, 'approved_by_name', None)
    return {
        "return_id":         str(r.return_id),
        "business_id":       str(r.business_id),
        "pur_id":            str(r.pur_id),
        "supp_name":         supp_name,
        "return_reason":     r.return_reason,
        "return_status":     r.return_status,
        "restock":           r.restock,
        "stock_updated":     r.stock_updated,
        "refund_method":     r.refund_method,
        "approved_by":       approved_by_name or (str(r.approved_by) if r.approved_by else None),
        "approved_at":       fmt_ts(r.approved_at),
        "rejected_reason":   r.rejected_reason,
        "return_amount":     float(r.return_amount) if r.return_amount else 0.0,
        "return_created_at": fmt_ts(r.return_created_at),
        "created_by":        str(r.created_by) if r.created_by else None,
        "updated_at":        fmt_ts(r.updated_at) if hasattr(r, "updated_at") else None,
        "last_updated_by":   r.last_updated_by if hasattr(r, "last_updated_by") else None,
        "items":             [return_item_to_dict(i) for i in items]
    }


# ─────────────────────────────────────────────
# HELPER — format return item row as dict
# ─────────────────────────────────────────────
def return_item_to_dict(row):
    return {
        "return_item_id":       str(row.return_item_id),
        "product_id":           str(row.product_id),
        "product_name":         row.product_name,
        "return_qty":           row.return_qty,
        "refund_amount":        float(row.refund_amount) if row.refund_amount else 0.0,
        "return_item_subtotal": float(row.return_item_subtotal) if row.return_item_subtotal else None
    }


# ─────────────────────────────────────────────
# HELPER — validate return items against original purchase
# Checks:
#   1. Product was part of the original purchase
#   2. refund_amount <= original purchase unit price
#   3. return_qty <= (purchased_qty - already_returned_qty)
# ─────────────────────────────────────────────
async def validate_return_items(
    db: AsyncSession,
    pur_id: str,
    business_id: str,
    items,
    exclude_return_id: str = None
):
    # Batch Step 1 → Fetch ALL purchase items for this purchase in one query
    prod_ids = [str(item.product_id) for item in items]
    purchase_items = {}
    if prod_ids:
        # TOCTOU FIX: FOR UPDATE OF pi serializes concurrent return-creation
        # requests on the same purchase_items rows so two requests can't both
        # read stale "already returned" totals and exceed the purchased quantity.
        rows = (await db.execute(text("""
            SELECT pi.product_id, pi.pur_item_qty, pi.item_unit_price, p.prod_name
            FROM purchase_items pi
            JOIN products p ON p.prod_id = pi.product_id
            WHERE pi.pur_id = CAST(:pur_id AS uuid)
              AND pi.product_id = ANY(CAST(:pids AS uuid[]))
            FOR UPDATE OF pi
        """), {
            "pur_id": pur_id,
            # BUG FIX: asyncpg expects a Python list for array params, not a
            # manually-formatted "{uuid1,uuid2}" string (causes DataError).
            "pids": prod_ids
        })).fetchall()
        for row in rows:
            purchase_items[str(row.product_id)] = row

    # Batch Step 2 → Fetch ALL already-returned quantities in one GROUP BY query
    already_returned_map = {}
    if prod_ids:
        q = """
            SELECT pri.product_id, COALESCE(SUM(pri.return_qty), 0) AS total_returned
            FROM purchase_return_items pri
            JOIN purchase_returns pr ON pr.return_id = pri.return_id
            WHERE pr.pur_id = CAST(:pur_id AS uuid)
              AND pri.product_id = ANY(CAST(:pids AS uuid[]))
              AND pr.return_status != 'rejected'
              AND pr.business_id = CAST(:business_id AS uuid)
        """
        params = {
            "pur_id": pur_id,
            # BUG FIX: asyncpg expects a Python list for array params, not a
            # manually-formatted "{uuid1,uuid2}" string (causes DataError).
            "pids": prod_ids,
            "business_id": business_id
        }
        if exclude_return_id:
            q += " AND pr.return_id != CAST(:exclude_id AS uuid)"
            params["exclude_id"] = exclude_return_id
        q += " GROUP BY pri.product_id"
        for row in (await db.execute(text(q), params)).fetchall():
            already_returned_map[str(row.product_id)] = int(row.total_returned)

    for item in items:
        product_id = str(item.product_id)
        purchase_item = purchase_items.get(product_id)

        if not purchase_item:
            return f"Product '{product_id}' was not part of purchase '{pur_id}'"

        if hasattr(item, "refund_amount") and item.refund_amount is not None:
            if float(item.refund_amount) > float(purchase_item.item_unit_price):
                return (
                    f"'{purchase_item.prod_name}': refund amount ({item.refund_amount}) "
                    f"cannot exceed original purchase price "
                    f"({float(purchase_item.item_unit_price)})"
                )

        already_returned = already_returned_map.get(product_id, 0)
        available = purchase_item.pur_item_qty - already_returned

        if item.return_qty > available:
            return (
                f"'{purchase_item.prod_name}': cannot return {item.return_qty} units. "
                f"Only {available} units are returnable "
                f"(purchased: {purchase_item.pur_item_qty}, "
                f"already returned: {already_returned})."
            )

    return None  # all items valid


# ─────────────────────────────────────────────
# POST /purchase-returns → Create a return
# ── PERMISSION SPLIT (2026-07) ──────────────────────────────────────────────
# Requires "purchase_returns.manage" (staff, manager, admin).
# If the caller lacks "purchase_returns.approve", any non-pending status is
# silently downgraded to "pending" so staff can create but not approve.
# ─────────────────────────────────────────────
@router.post("/")
async def create_purchase_return(
    data: PurchaseReturnCreate,
    current_user: dict = Depends(require_permission("purchase_returns.manage")),
    db: AsyncSession = Depends(get_async_db)
):
    business_id = current_user["business_id"]
    user_id     = current_user["user_id"]

    # ── PERMISSION SPLIT (2026-07) ──────────────────────────────────────────
    # Staff with manage-only cannot approve on create — silently downgrade.
    can_approve = "purchase_returns.approve" in current_user["permissions"]
    requested_status = data.return_status or "pending"
    if requested_status != "pending" and not can_approve:
        requested_status = "pending"

    try:
        # Step 1 → Check purchase exists and belongs to this business
        purchase = (await db.execute(text("""
            SELECT pur_id, pur_payment_status
            FROM purchases
            WHERE pur_id       = CAST(:pur_id AS uuid)
              AND business_id  = CAST(:business_id AS uuid)
              AND is_deleted   = false
        """), {
            "pur_id":      str(data.pur_id),
            "business_id": str(business_id)
        })).fetchone()

        if not purchase:
            return error_response("Purchase not found", status_code=404)

        # Step 2 → Validate each return item
        error = await validate_return_items(
            db, str(data.pur_id), str(business_id), data.items
        )
        if error:
            return error_response(error, status_code=400)

        # Step 3 → Calculate total return amount
        total_return_amount = sum(
            (item.refund_amount * item.return_qty for item in data.items),
            Decimal("0")
        )

        # Step 4 → Insert purchase_return header
        new_return_id = str(uuid.uuid4())

        # Validate status value on creation
        allowed_statuses = ["pending", "approved", "rejected"]
        if data.return_status not in allowed_statuses:
            return error_response(
                f"Invalid status. Allowed: {allowed_statuses}", 400
            )

        await db.execute(text("""
            INSERT INTO purchase_returns (
                return_id, business_id, pur_id,
                return_reason, return_status,
                restock, refund_method,
                return_amount, created_by
            ) VALUES (
                CAST(:return_id AS uuid),
                CAST(:business_id AS uuid),
                CAST(:pur_id AS uuid),
                :return_reason, :return_status,
                :restock, :refund_method,
                :return_amount,
                CAST(:created_by AS uuid)
            )
        """), {
            "return_id":     new_return_id,
            "business_id":   str(business_id),
            "pur_id":        str(data.pur_id),
            "return_reason": data.return_reason,
            "return_status": requested_status,
            "restock":       data.restock,
            "refund_method": data.refund_method,
            "return_amount": str(total_return_amount),
            "created_by":    str(user_id)
        })

        # Step 5 → Insert all return items in one round trip
        # NOTE: return_item_subtotal is a DB generated column — do NOT insert it
        await db.execute(
            text("""
                INSERT INTO purchase_return_items
                    (return_item_id, return_id, product_id,
                     return_qty, refund_amount, business_id)
                VALUES (
                    CAST(:return_item_id AS uuid),
                    CAST(:return_id AS uuid),
                    CAST(:product_id AS uuid),
                    :return_qty, :refund_amount,
                    CAST(:business_id AS uuid)
                )
            """),
            [
                {
                    "return_item_id": str(uuid.uuid4()),
                    "return_id":      new_return_id,
                    "product_id":     str(item.product_id),
                    "return_qty":     item.return_qty,
                    "refund_amount":  str(item.refund_amount),
                    "business_id":    str(business_id)
                }
                for item in data.items
            ]
        )

        # Step 6 → If created as approved + restock → reduce stock immediately
        # NOTE: db.commit() intentionally moved to AFTER Step 6 so that the
        # return header, return items, and stock updates are all one atomic
        # transaction. If stock update fails, nothing is committed.
        if requested_status == "approved" and data.restock:
            stock_err = await bulk_check_and_reduce_stock(
                db,
                business_id=str(business_id),
                user_id=str(user_id),
                items=data.items,
                reference_id=str(data.pur_id),
                movement_type="purchase_return",
                movement_notes_prefix="Stock reduced from purchase return",
            )
            if stock_err:
                await db.rollback()
                return error_response(stock_err, status_code=400)

            # Mark stock_updated = true on the header
            await db.execute(text("""
                UPDATE purchase_returns
                SET stock_updated = true,
                    approved_by   = CAST(:approved_by AS uuid),
                    approved_at   = NOW()
                WHERE return_id   = CAST(:return_id AS uuid)
                  AND business_id = CAST(:business_id AS uuid)
            """), {
                "approved_by":  str(user_id),
                "return_id":    new_return_id,
                "business_id":  str(business_id)
            })

        await db.commit()

        # Re-set GUCs after commit (SET LOCAL is transaction-scoped)
        await async_set_rls_gucs_after_commit(db, current_user)

        # Step 7 → Fetch and return full record

        result = await db.execute(
            select(PurchaseReturn).where(PurchaseReturn.return_id == new_return_id)
        )
        return_row = result.scalar_one_or_none()
        item_rows = await fetch_return_items(db, new_return_id)

        return success_response({
            "message": "Purchase return created successfully",
            "return":  return_to_dict(return_row, item_rows)
        }, status_code=201)

    except Exception as e:
        await db.rollback()
        logging.exception(e)
        return error_response("An unexpected error occurred. Please try again.", status_code=500)


# ─────────────────────────────────────────────
# GET /purchase-returns → List all (paginated)
# ─────────────────────────────────────────────
@router.get("/")
async def get_all_purchase_returns(
    current_user: dict = Depends(require_permission("purchase_returns.manage")),
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
        "return_created_at": "pr.return_created_at",
        "return_status":     "pr.return_status",
        "return_amount":     "pr.return_amount",
    }
    order_col = SORTABLE.get(sort_by, "pr.return_created_at")
    order_dir = "DESC" if str(sort_dir).lower() == "desc" else "ASC"

    extra_where = ""
    params = {"bid": business_id}

    if search and search.strip():
        extra_where += " AND (pr.return_reason ILIKE :search OR s.supp_name ILIKE :search)"
        params["search"] = f"%{search.strip()}%"

    if status and status.strip():
        extra_where += " AND pr.return_status = :status"
        params["status"] = status.strip()

    if date_from:
        extra_where += " AND pr.return_created_at >= :date_from"
        params["date_from"] = datetime.fromisoformat(date_from.replace("Z", ""))

    if date_to:
        extra_where += " AND pr.return_created_at <= :date_to"
        params["date_to"] = datetime.fromisoformat(date_to.replace("Z", ""))

    params["offset"] = pagination["offset"]
    params["limit"] = pagination["limit"]

    list_sql = f"""
        SELECT pr.*, s.supp_name,
               prof.full_name AS last_updated_by,
               ap.full_name AS approved_by_name,
               COUNT(*) OVER() AS total_count
        FROM purchase_returns pr
        LEFT JOIN purchases p ON p.pur_id = pr.pur_id
        LEFT JOIN suppliers s ON s.supp_id = p.supp_id
        LEFT JOIN profiles prof ON prof.id = pr.updated_by
        LEFT JOIN profiles ap ON ap.id = pr.approved_by
        WHERE pr.business_id = CAST(:bid AS uuid)
        {extra_where}
        ORDER BY {order_col} {order_dir}
        OFFSET :offset LIMIT :limit
    """
    returns = (await db.execute(text(list_sql), params)).fetchall()
    total = returns[0].total_count if returns else 0

    # BATCH: fetch all return items in one query
    ret_ids = [str(r.return_id) for r in returns]
    all_items = []
    if ret_ids:
        all_items = (await db.execute(text("""
            SELECT pri.return_item_id, pri.return_id, pri.product_id,
                   p.prod_name AS product_name,
                   pri.return_qty, pri.refund_amount, pri.return_item_subtotal
            FROM purchase_return_items pri
            JOIN products p ON p.prod_id = pri.product_id
            WHERE pri.return_id = ANY(CAST(:ids AS uuid[]))
        """), {"ids": ret_ids})).fetchall()

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


# ─────────────────────────────────────────────
# GET /purchase-returns/{return_id} → Single return
# ─────────────────────────────────────────────
@router.get("/{return_id}")
async def get_purchase_return(
    return_id: str,
    current_user: dict = Depends(require_permission("purchase_returns.manage")),
    db: AsyncSession = Depends(get_async_db)
):
    business_id = current_user["business_id"]

    # ── RESOLVED NAMES (2026-07) ───────────────────────────────────────────
    # JOINs suppliers (for supp_name) and profiles (for approved_by and
    # last_updated_by) so the frontend shows human-readable names instead
    # of raw UUIDs.  The old ORM select(PurchaseReturn) had no JOINs and
    # return_to_dict's getattr(r, 'supp_name', None) always returned None.
    result = (await db.execute(text("""
        SELECT pr.*, s.supp_name,
               prof.full_name AS last_updated_by,
               ap.full_name AS approved_by_name
        FROM purchase_returns pr
        LEFT JOIN purchases p ON p.pur_id = pr.pur_id
        LEFT JOIN suppliers s ON s.supp_id = p.supp_id
        LEFT JOIN profiles prof ON prof.id = pr.updated_by
        LEFT JOIN profiles ap ON ap.id = pr.approved_by
        WHERE pr.return_id    = CAST(:rid AS uuid)
          AND pr.business_id = CAST(:bid AS uuid)
    """), {"rid": return_id, "bid": str(business_id)})).fetchone()

    if not result:
        return error_response("Purchase return not found", status_code=404)

    items = await fetch_return_items(db, return_id)
    return success_response(return_to_dict(result, items))


# ─────────────────────────────────────────────
# PUT /purchase-returns/{return_id} → Update status
# When approved + restock=true → stock REDUCES
# (goods physically left your warehouse back to supplier)
# ── PERMISSION SPLIT (2026-07) ──────────────────────────────────────────────
# Requires "purchase_returns.approve" — only admin/manager can approve/reject.
# Staff with manage-only are blocked here (403).
# ─────────────────────────────────────────────
@router.put("/{return_id}")
async def update_purchase_return(
    return_id: str,
    data: PurchaseReturnUpdate,
    current_user: dict = Depends(require_permission("purchase_returns.approve")),
    db: AsyncSession = Depends(get_async_db)
):
    business_id = current_user["business_id"]
    user_id     = current_user["user_id"]

    # Validate status value
    allowed_statuses = ["pending", "approved", "rejected"]
    if data.return_status not in allowed_statuses:
        return error_response(
            f"Invalid status. Allowed: {allowed_statuses}", 400
        )

    # Fetch existing return
    result = await db.execute(
        select(PurchaseReturn).where(
            PurchaseReturn.return_id == return_id,
            PurchaseReturn.business_id == business_id
        )
    )
    purchase_return = result.scalar_one_or_none()

    if not purchase_return:
        return error_response("Purchase return not found", status_code=404)

    # Block if already approved
    if purchase_return.return_status == "approved":
        return error_response(
            "Cannot change status of an already approved return", 400
        )

    # Block if same status
    if purchase_return.return_status == data.return_status:
        return error_response(
            f"Return is already '{data.return_status}'", 400
        )

    try:
        # If approving → validate quantities again then handle stock
        if data.return_status == "approved":

            item_rows = await fetch_return_items(db, return_id)

            # Convert DB rows into objects validate_return_items can read
            class ItemLike:
                def __init__(self, product_id, return_qty):
                    self.product_id  = product_id
                    self.return_qty  = return_qty
                    self.refund_amount = None  # skip price check on approval

            items_to_validate = [
                ItemLike(row.product_id, row.return_qty)
                for row in item_rows
            ]

            error = await validate_return_items(
                db, str(purchase_return.pur_id),
                str(business_id), items_to_validate,
                exclude_return_id=return_id
            )
            if error:
                return error_response(error, status_code=400)

            # Reduce stock only if restock=true
            if data.restock:
                stock_err = await bulk_check_and_reduce_stock(
                    db,
                    business_id=str(business_id),
                    user_id=str(user_id),
                    items=item_rows,
                    reference_id=str(purchase_return.pur_id),
                    movement_type="purchase_return",
                    movement_notes_prefix="Stock reduced from purchase return",
                )
                if stock_err:
                    await db.rollback()
                    return error_response(stock_err, status_code=400)

            # ── Process refund: reduce due or create negative expense ──────
            #
            # APPROVAL REFUND LOGIC (2026-07):
            # When a purchase return is approved, the refund amount either:
            #   (a) Reduces the remaining amount owed to the supplier
            #       (covered_by_reducing_due = min(return_amount, remaining))
            #   (b) Exceeds what's still owed — the excess is credited back to
            #       the business as a negative expense (source_type =
            #       "purchase_return", category = "purchase_refund").
            #
            # If the refund fully covers the remaining due, the purchase
            # status is automatically updated to "paid".
            #
            # Formula:
            #   remaining_before  = pur_final - total_paid - other_refunded
            #   covered_by_reducing_due = min(return_amount, remaining_before)
            #   excess_refund     = return_amount - covered_by_reducing_due
            #
            # other_refunded excludes THIS return (it hasn't been committed
            # yet at this point in the flow).
            return_amount = Decimal(str(purchase_return.return_amount or 0))

            if return_amount > 0:
                # Lock the purchase row to serialize concurrent return approvals.
                # Without this, two pending returns on the same purchase approved
                # simultaneously could both read stale total_paid/other_refunded
                # and double-credit the purchase. Same pattern as
                # create_purchase_payment's FOR UPDATE lock on the purchase row.
                await db.execute(
                    text("SELECT 1 FROM purchases WHERE pur_id = CAST(:pid AS uuid) AND business_id = CAST(:bid AS uuid) FOR UPDATE"),
                    {"pid": str(purchase_return.pur_id), "bid": str(business_id)}
                )

                # Fetch purchase final amount
                pur_row = (await db.execute(
                    text("""
                        SELECT pur_final_amount
                        FROM purchases
                        WHERE pur_id      = CAST(:pid AS uuid)
                          AND business_id = CAST(:bid AS uuid)
                    """),
                    {"pid": str(purchase_return.pur_id), "bid": str(business_id)}
                )).fetchone()
                pur_final = Decimal(str(pur_row.pur_final_amount)) if pur_row and pur_row.pur_final_amount else Decimal("0")

                # Fetch cumulative paid
                pay_row = (await db.execute(
                    text("""
                        SELECT COALESCE(cumulative_paid, 0) AS total_paid
                        FROM purchase_payments
                        WHERE pur_id      = CAST(:pid AS uuid)
                          AND business_id = CAST(:bid AS uuid)
                          AND is_active   = true
                    """),
                    {"pid": str(purchase_return.pur_id), "bid": str(business_id)}
                )).fetchone()
                total_paid = Decimal(str(pay_row.total_paid)) if pay_row and pay_row.total_paid else Decimal("0")

                # Fetch total refunded from OTHER already-approved returns (excluding this one)
                other_ref_row = (await db.execute(
                    text("""
                        SELECT COALESCE(SUM(return_amount), 0) AS other_refunded
                        FROM purchase_returns
                        WHERE pur_id        = CAST(:pid AS uuid)
                          AND business_id   = CAST(:bid AS uuid)
                          AND return_status = 'approved'
                          AND return_id    != CAST(:rid AS uuid)
                    """),
                    {"pid": str(purchase_return.pur_id), "bid": str(business_id), "rid": return_id}
                )).fetchone()
                other_refunded = Decimal(str(other_ref_row.other_refunded)) if other_ref_row and other_ref_row.other_refunded else Decimal("0")

                remaining_before = max(Decimal("0"), pur_final - total_paid - other_refunded)
                covered_by_reducing_due = min(return_amount, remaining_before)
                excess_refund = (return_amount - covered_by_reducing_due).quantize(Decimal("0.01"))

                # If the refund fully covers the remaining due, mark purchase as paid
                new_remaining = remaining_before - covered_by_reducing_due
                if new_remaining <= 0:
                    await db.execute(text("""
                        UPDATE purchases
                        SET    pur_payment_status = 'paid',
                               updated_by         = CAST(:uid AS uuid)
                        WHERE  pur_id             = CAST(:pid AS uuid)
                          AND  business_id        = CAST(:bid AS uuid)
                    """), {
                        "uid": str(user_id),
                        "pid": str(purchase_return.pur_id),
                        "bid": str(business_id),
                    })

                if excess_refund > 0:
                    # Fetch supplier name for expense note
                    supp_row = (await db.execute(
                        text("""
                            SELECT s.supp_name
                            FROM purchases p
                            LEFT JOIN suppliers s ON s.supp_id = p.supp_id
                            WHERE p.pur_id = CAST(:pid AS uuid)
                              AND p.business_id = CAST(:bid AS uuid)
                        """),
                        {"pid": str(purchase_return.pur_id), "bid": str(business_id)}
                    )).fetchone()
                    supplier_label = "Walk-in"
                    if supp_row and supp_row.supp_name:
                        supplier_label = supp_row.supp_name

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
                            "business_id":      str(business_id),
                            "expense_category": "purchase_refund",
                            "expense_amount":   str(-excess_refund),
                            "expense_notes":    f"Refund credit from {supplier_label} — purchase return {return_id}",
                            "created_by":       str(user_id),
                            "source_type":      "purchase_return",
                            "source_id":        return_id
                        }
                    )

        # Update the return header
        await db.execute(text("""
            UPDATE purchase_returns
            SET return_status   = CAST(:status AS text),
                restock         = :restock,
                stock_updated   = :stock_updated,
                rejected_reason = :rejected_reason,
                approved_by     = CASE WHEN CAST(:status AS text) = 'approved'
                                       THEN CAST(:approved_by AS uuid)
                                       ELSE NULL END,
                approved_at     = CASE WHEN CAST(:status AS text) = 'approved'
                                       THEN NOW()
                                       ELSE NULL END
            WHERE return_id    = CAST(:return_id AS uuid)
              AND business_id  = CAST(:business_id AS uuid)
        """), {
            "status":          data.return_status,
            "restock":         data.restock,
            "stock_updated":   data.restock and data.return_status == "approved",
            "rejected_reason": data.rejected_reason,
            "approved_by":     str(user_id),
            "return_id":       return_id,
            "business_id":     str(business_id)
        })

        await db.commit()

        # Re-set GUCs after commit (SET LOCAL is transaction-scoped)
        await async_set_rls_gucs_after_commit(db, current_user)

        # Refresh and return updated record
        refreshed = (await db.execute(text("""
            SELECT pr.*, s.supp_name,
                   prof.full_name AS last_updated_by,
                   ap.full_name AS approved_by_name
            FROM purchase_returns pr
            LEFT JOIN purchases p ON p.pur_id = pr.pur_id
            LEFT JOIN suppliers s ON s.supp_id = p.supp_id
            LEFT JOIN profiles prof ON prof.id = pr.updated_by
            LEFT JOIN profiles ap ON ap.id = pr.approved_by
            WHERE pr.return_id = CAST(:rid AS uuid)
        """), {"rid": return_id})).fetchone()
        items = await fetch_return_items(db, return_id)

        return success_response({
            "message": f"Purchase return {data.return_status} successfully",
            "return":  return_to_dict(refreshed, items)
        })

    except Exception as e:
        await db.rollback()
        logging.exception(e)
        return error_response("An unexpected error occurred. Please try again.", status_code=500)


# ─────────────────────────────────────────────
# DELETE /purchase-returns/{return_id}
# Only pending returns can be deleted
# ─────────────────────────────────────────────
@router.delete("/{return_id}")
async def delete_purchase_return(
    return_id: str,
    current_user: dict = Depends(require_permission("purchase_returns.manage")),
    db: AsyncSession = Depends(get_async_db)
):
    business_id = current_user["business_id"]

    result = await db.execute(
        select(PurchaseReturn).where(
            PurchaseReturn.return_id == return_id,
            PurchaseReturn.business_id == business_id
        )
    )
    purchase_return = result.scalar_one_or_none()

    if not purchase_return:
        return error_response("Purchase return not found", status_code=404)

    if purchase_return.return_status != "pending":
        return error_response(
            f"Cannot delete a return with status "
            f"'{purchase_return.return_status}'. "
            "Only pending returns can be deleted.",
            status_code=400
        )

    try:
        # Delete items first (FK constraint)
        await db.execute(text("""
            DELETE FROM purchase_return_items
            WHERE return_id   = CAST(:return_id AS uuid)
              AND business_id = CAST(:business_id AS uuid)
        """), {
            "return_id":   return_id,
            "business_id": str(business_id)
        })

        # Delete header
        await db.execute(text("""
            DELETE FROM purchase_returns
            WHERE return_id   = CAST(:return_id AS uuid)
              AND business_id = CAST(:business_id AS uuid)
        """), {
            "return_id":   return_id,
            "business_id": str(business_id)
        })

        await db.commit()
        return success_response(
            {"message": "Purchase return deleted successfully"}
        )

    except Exception as e:
        await db.rollback()
        logging.exception(e)
        return error_response("An unexpected error occurred. Please try again.", status_code=500)
