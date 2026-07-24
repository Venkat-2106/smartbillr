# app/routers/expense.py
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
# ── AUTO-GENERATED EXPENSES (source_type / source_id) ────────────────────────
#
# Some expenses are auto-created by other modules:
#   - Purchases with pur_payment_status='paid' → INSERT INTO expenses
#     with source_type='purchase', source_id=pur_id.  Race-safe via
#     INSERT ... WHERE NOT EXISTS + unique partial index.
#   - (Future: sales returns, purchase returns may also auto-create.)
#
# IMPORTANT: Auto-generated expenses (source_type IS NOT NULL) cannot be
# deleted via the expense CRUD endpoints.  delete_expense checks source_type
# and returns HTTP 400 if set.
# The user must modify the SOURCE record (e.g., the purchase) instead.
# This prevents the expenses ledger from drifting out of sync with its
# source module.
# ─────────────────────────────────────────────────────────────────────────────

# NOTE (2026-07): Expenses are intentionally immutable after creation — there
# is no PUT /{expense_id} endpoint.  This is by design:
#   - Auto-generated expenses (source_type / source_id) must never drift
#     from their source record (purchase, sales return, etc.).
#   - User-created expenses are considered final ledger entries.
#   - If an expense is wrong, delete it and create a new one.

import re
from fastapi import APIRouter, Depends, Query
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, text
from app.database import get_async_db
from app.middleware.rbac import require_permission, async_set_rls_gucs_after_commit
from app.models.expense import Expense
from app.schemas.expense import ExpenseCreate
from app.utils.response import success_response, error_response
from app.utils.pagination import paginate_async, pagination_response
from app.utils.timestamp import fmt_ts, fmt_date
from datetime import datetime, timezone

router = APIRouter(prefix="/v1/expenses", tags=["Expenses"])


# ─────────────────────────────────────────
# HELPER: Format expense as dict
# Accepts optional last_updated_by name string (resolved by caller via JOIN).
# ─────────────────────────────────────────
def expense_to_dict(e, last_updated_by=None):
    return {
        "expense_id":      str(e.expense_id),
        "business_id":     str(e.business_id),
        "expense_category": e.expense_category,
        "expense_amount":  float(e.expense_amount),
        "expense_date":    fmt_date(e.expense_date),
        "expense_notes":   e.expense_notes,
        "is_deleted":      e.is_deleted,
        "created_at":      fmt_ts(e.created_at),
        "created_by":      str(e.created_by) if e.created_by else None,
        "updated_at":      fmt_ts(e.updated_at),
        "updated_by":      str(e.updated_by) if e.updated_by else None,
        "last_updated_by": last_updated_by,
        "source_type":     e.source_type,
        "source_id":       str(e.source_id) if e.source_id else None,
    }


# NOTE (2026-07): Auto-generated expenses store raw UUIDs in expense_notes
# (e.g. "Auto-recorded from purchase <uuid>").  resolve_expense_notes() swaps
# those UUIDs for human-readable names (supplier name for purchases, invoice
# number or customer name for sales returns) so the frontend displays friendly
# text instead of raw identifiers.
def resolve_expense_notes(notes, source_type, source_id, **source_names):
    """Replace raw UUIDs in auto-generated notes with human-readable names."""
    if not notes or not source_id:
        return notes
    uuid_re = re.compile(r'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', re.IGNORECASE)
    if source_type == "purchase":
        label = source_names.get("source_supplier")
        if label:
            return uuid_re.sub(label, notes)
    if source_type == "sales_return":
        label = source_names.get("source_invoice") or source_names.get("source_customer")
        if label:
            return uuid_re.sub(label, notes)
    return notes


def expense_to_dict_list(row):
    return {
        "expense_id":      str(row.expense_id),
        "business_id":     str(row.business_id),
        "expense_category": row.expense_category,
        "expense_amount":  float(row.expense_amount),
        "expense_date":    fmt_date(row.expense_date),
        "expense_notes":   resolve_expense_notes(
            row.expense_notes, row.source_type,
            getattr(row, "source_id", None),
            source_supplier=getattr(row, "source_supplier", None),
            source_invoice=getattr(row, "source_invoice", None),
            source_customer=getattr(row, "source_customer", None),
        ),
        "created_at":      fmt_ts(row.created_at),
        "updated_at":      fmt_ts(row.updated_at),
        "updated_by":      str(row.updated_by)  if row.updated_by  else None,
        "last_updated_by": row.last_updated_by,
        "source_type":     row.source_type,
        "source_id":       str(row.source_id) if row.source_id else None,
    }


# ─────────────────────────────────────────
# POST /expenses → Create new expense
# ─────────────────────────────────────────
@router.post("/")
async def create_expense(
    data: ExpenseCreate,
    current_user: dict = Depends(require_permission("expenses.manage")),
    db: AsyncSession = Depends(get_async_db)
):
    business_id = current_user["business_id"]
    user_id = current_user["user_id"]

    new_expense = Expense(
        business_id=business_id,
        expense_category=data.expense_category,
        expense_amount=data.expense_amount,
        expense_date=data.expense_date,
        expense_notes=data.expense_notes,
        created_by=user_id,
        updated_by=user_id,
    )

    db.add(new_expense)
    await db.commit()
    await async_set_rls_gucs_after_commit(db, current_user)
    await db.refresh(new_expense)

    creator_name = current_user.get("full_name")

    return success_response({
        "message": "Expense created successfully",
        "expense": expense_to_dict(new_expense, last_updated_by=creator_name)
    }, status_code=201)


# ─────────────────────────────────────────
# GET /expenses → Get all expenses (paginated)
# ─────────────────────────────────────────
@router.get("/")
async def get_all_expenses(
    current_user: dict = Depends(require_permission("expenses.manage")),
    db: AsyncSession = Depends(get_async_db),
    pagination: dict = Depends(paginate_async),
    search: Optional[str] = Query(default=None),
    category: Optional[str] = Query(default=None),
    sort_by: Optional[str] = Query(default="expense_date"),
    sort_dir: Optional[str] = Query(default="desc"),
    date_from: Optional[str] = Query(default=None),
    date_to: Optional[str] = Query(default=None),
):
    business_id = current_user["business_id"]

    SORTABLE = {
        "expense_date":   "e.expense_date",
        "expense_amount": "e.expense_amount",
        "expense_category": "e.expense_category",
        "created_at":     "e.created_at",
        "updated_at":     "e.updated_at",
    }
    order_col = SORTABLE.get(sort_by, "e.expense_date")
    order_dir = "DESC" if str(sort_dir).lower() == "desc" else "ASC"

    extra_where = ""
    params = {"bid": business_id}

    if search and search.strip():
        extra_where += " AND (e.expense_notes ILIKE :search OR e.expense_category ILIKE :search)"
        params["search"] = f"%{search.strip()}%"

    if category and category.strip():
        extra_where += " AND e.expense_category = :category"
        params["category"] = category.strip()

    if date_from:
        extra_where += " AND e.expense_date >= :date_from"
        params["date_from"] = datetime.fromisoformat(date_from.replace("Z", ""))

    if date_to:
        extra_where += " AND e.expense_date <= :date_to"
        params["date_to"] = datetime.fromisoformat(date_to.replace("Z", ""))

    params["offset"] = pagination["offset"]
    params["limit"] = pagination["limit"]

    list_sql = f"""
        SELECT e.expense_id, e.business_id, e.expense_category,
               e.expense_amount, e.expense_date,
               e.created_at, e.updated_at, e.updated_by,
               e.source_type, e.source_id,
               prof.full_name AS last_updated_by,
               s.supp_name   AS source_supplier,
               sl.invoice_no AS source_invoice,
               sc.cust_name  AS source_customer,
               e.expense_notes,
               COUNT(*) OVER() AS total_count
        FROM expenses e
        LEFT JOIN profiles prof ON prof.id = e.updated_by
        LEFT JOIN purchases pur ON e.source_type = 'purchase'
           AND e.source_id = pur.pur_id
           AND pur.business_id = CAST(:bid AS uuid)
        LEFT JOIN suppliers s ON pur.supp_id = s.supp_id
        LEFT JOIN sales_returns sr ON e.source_type = 'sales_return'
           AND e.source_id = sr.return_id
           AND sr.business_id = CAST(:bid AS uuid)
        LEFT JOIN sales sl ON sr.sale_id = sl.sales_id
        LEFT JOIN customers sc ON sl.customer_id = sc.cust_id
        WHERE e.business_id = CAST(:bid AS uuid)
          AND e.is_deleted = false
        {extra_where}
        ORDER BY {order_col} {order_dir}
        OFFSET :offset LIMIT :limit
    """
    rows = (await db.execute(text(list_sql), params)).fetchall()

    total = rows[0].total_count if rows else 0

    return success_response(
        pagination_response(
            [expense_to_dict_list(e) for e in rows],
            total,
            pagination["page"],
            pagination["limit"],
            capped=pagination["_capped"]
        )
    )


# ── GET /expenses/summary → KPI cards for expenses page ──────────
@router.get("/summary")
async def get_expense_summary_kpi(
    current_user: dict = Depends(require_permission("expenses.manage")),
    db: AsyncSession = Depends(get_async_db)
):
    bid = current_user["business_id"]
    row = (await db.execute(text("""
        SELECT
            COUNT(*)                                                              AS total_count,
            COUNT(*) FILTER (WHERE date_trunc('month', expense_date) = date_trunc('month', CURRENT_DATE)) AS monthly_count
        FROM expenses
        WHERE business_id = CAST(:bid AS uuid)
          AND is_deleted  = false
    """), {"bid": bid})).fetchone()

    return success_response({
        "total_count":   int(row.total_count),
        "monthly_count": int(row.monthly_count),
    })


# ─────────────────────────────────────────
# GET /expenses/{expense_id} → Get one expense
# ─────────────────────────────────────────
@router.get("/{expense_id}")
async def get_expense(
    expense_id: str,
    current_user: dict = Depends(require_permission("expenses.manage")),
    db: AsyncSession = Depends(get_async_db)
):
    business_id = current_user["business_id"]

    expense = (await db.execute(select(Expense).where(
        Expense.expense_id == expense_id,
        Expense.business_id == business_id,
        Expense.is_deleted == False
    ))).scalar_one_or_none()

    if not expense:
        return error_response("Expense not found", status_code=404)

    # BUG FIX: previously used current_user.get("full_name") here, which showed
    # the REQUESTING user's name instead of the actual last editor. updated_by is
    # a separate user's UUID (whoever last modified this row) — must be looked up
    # independently, same as get_all_expenses already does via its profiles JOIN.
    if expense.updated_by:
        result = await db.execute(
            text("SELECT full_name FROM profiles WHERE id = :uid"),
            {"uid": str(expense.updated_by)}
        )
        row = result.fetchone()
        updated_by_name = row.full_name if row else None
    else:
        updated_by_name = None

    # Resolve source names for auto-generated expenses
    source_supplier = source_invoice = source_customer = None
    if expense.source_type == "purchase" and expense.source_id:
        src_row = (await db.execute(text("""
            SELECT s.supp_name
            FROM purchases pur
            LEFT JOIN suppliers s ON pur.supp_id = s.supp_id
            WHERE pur.pur_id = :sid AND pur.business_id = CAST(:bid AS uuid)
        """), {"sid": str(expense.source_id), "bid": business_id})).fetchone()
        source_supplier = src_row.supp_name if src_row else None
    elif expense.source_type == "sales_return" and expense.source_id:
        src_row = (await db.execute(text("""
            SELECT sl.invoice_no, sc.cust_name
            FROM sales_returns sr
            LEFT JOIN sales sl ON sr.sale_id = sl.sales_id
            LEFT JOIN customers sc ON sl.customer_id = sc.cust_id
            WHERE sr.return_id = :sid AND sr.business_id = CAST(:bid AS uuid)
        """), {"sid": str(expense.source_id), "bid": business_id})).fetchone()
        if src_row:
            source_invoice = src_row.invoice_no
            source_customer = src_row.cust_name

    expense_dict = expense_to_dict(expense, last_updated_by=updated_by_name)
    expense_dict["expense_notes"] = resolve_expense_notes(
        expense.expense_notes, expense.source_type, expense.source_id,
        source_supplier=source_supplier,
        source_invoice=source_invoice,
        source_customer=source_customer,
    )

    return success_response(expense_dict)


# ─────────────────────────────────────────
# DELETE /expenses/{expense_id} → Soft delete
# ─────────────────────────────────────────
@router.delete("/{expense_id}")
async def delete_expense(
    expense_id: str,
    current_user: dict = Depends(require_permission("expenses.manage")),
    db: AsyncSession = Depends(get_async_db)
):
    business_id = current_user["business_id"]

    expense = (await db.execute(select(Expense).where(
        Expense.expense_id == expense_id,
        Expense.business_id == business_id,
        Expense.is_deleted == False
    ))).scalar_one_or_none()

    if not expense:
        return error_response("Expense not found", status_code=404)

    if expense.source_type:
        return error_response(
            f"This expense was auto-generated from a {expense.source_type} and cannot be "
            f"edited or deleted directly. Adjust the source {expense.source_type} instead.",
            status_code=400
        )

    expense.is_deleted = True
    # updated_by is auto-set by DB trigger trg_expenses_updated_by
    await db.commit()
    # RLS: SET LOCAL/set_config GUCs are transaction-scoped and are cleared
    # by this commit. Re-set them in case any future code adds a query after
    # this point (matches the convention in product.py, purchase.py).
    await async_set_rls_gucs_after_commit(db, current_user)

    return success_response({
        "message": "Expense deleted successfully"
    })