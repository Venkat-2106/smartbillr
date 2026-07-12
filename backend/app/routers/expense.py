from fastapi import APIRouter, Depends, Query
from typing import Optional
from sqlalchemy.orm import Session
from sqlalchemy import func, text
from app.database import get_db
from app.middleware.rbac import require_permission_with_rls, set_rls_gucs_after_commit
from app.models.expense import Expense
from app.schemas.expense import ExpenseCreate, ExpenseUpdate
from app.utils.response import success_response, error_response
from app.utils.pagination import paginate, pagination_response
from app.utils.timestamp import fmt_ts, fmt_date

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


def expense_to_dict_list(row):
    return {
        "expense_id":      str(row.expense_id),
        "business_id":     str(row.business_id),
        "expense_category": row.expense_category,
        "expense_amount":  float(row.expense_amount),
        "expense_date":    fmt_date(row.expense_date),
        "expense_notes":   row.expense_notes,
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
def create_expense(
    data: ExpenseCreate,
    current_user: dict = Depends(require_permission_with_rls("expenses.manage")),
    db: Session = Depends(get_db)
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
    db.commit()
    set_rls_gucs_after_commit(db, current_user)
    db.refresh(new_expense)

    creator_name = current_user.get("full_name")

    return success_response({
        "message": "Expense created successfully",
        "expense": expense_to_dict(new_expense, last_updated_by=creator_name)
    }, status_code=201)


# ─────────────────────────────────────────
# GET /expenses → Get all expenses (paginated)
# ─────────────────────────────────────────
@router.get("/")
def get_all_expenses(
    current_user: dict = Depends(require_permission_with_rls("expenses.manage")),
    db: Session = Depends(get_db),
    pagination: dict = Depends(paginate),
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
        params["date_from"] = date_from

    if date_to:
        extra_where += " AND e.expense_date <= :date_to"
        params["date_to"] = date_to

    params["offset"] = pagination["offset"]
    params["limit"] = pagination["limit"]

    list_sql = f"""
        SELECT e.expense_id, e.business_id, e.expense_category,
               e.expense_amount, e.expense_date, e.expense_notes,
               e.created_at, e.updated_at, e.updated_by,
               e.source_type, e.source_id,
               prof.full_name AS last_updated_by,
               COUNT(*) OVER() AS total_count
        FROM expenses e
        LEFT JOIN profiles prof ON prof.id = e.updated_by
        WHERE e.business_id = CAST(:bid AS uuid)
          AND e.is_deleted = false
        {extra_where}
        ORDER BY {order_col} {order_dir}
        OFFSET :offset LIMIT :limit
    """
    rows = db.execute(text(list_sql), params).fetchall()

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
def get_expense_summary_kpi(
    current_user: dict = Depends(require_permission_with_rls("expenses.manage")),
    db: Session = Depends(get_db)
):
    bid = current_user["business_id"]
    row = db.execute(text("""
        SELECT
            COUNT(*)                                                              AS total_count,
            COUNT(*) FILTER (WHERE date_trunc('month', expense_date) = date_trunc('month', CURRENT_DATE)) AS monthly_count
        FROM expenses
        WHERE business_id = CAST(:bid AS uuid)
          AND is_deleted  = false
    """), {"bid": bid}).fetchone()

    return success_response({
        "total_count":   int(row.total_count),
        "monthly_count": int(row.monthly_count),
    })


# ─────────────────────────────────────────
# GET /expenses/{expense_id} → Get one expense
# ─────────────────────────────────────────
@router.get("/{expense_id}")
def get_expense(
    expense_id: str,
    current_user: dict = Depends(require_permission_with_rls("expenses.manage")),
    db: Session = Depends(get_db)
):
    business_id = current_user["business_id"]

    expense = db.query(Expense).filter(
        Expense.expense_id == expense_id,
        Expense.business_id == business_id,
        Expense.is_deleted == False
    ).first()

    if not expense:
        return error_response("Expense not found", status_code=404)

    updated_by_name = current_user.get("full_name") if expense.updated_by else None

    return success_response(expense_to_dict(expense, last_updated_by=updated_by_name))


# ─────────────────────────────────────────
# PUT /expenses/{expense_id} → Update expense
# ─────────────────────────────────────────
@router.put("/{expense_id}")
def update_expense(
    expense_id: str,
    data: ExpenseUpdate,
    current_user: dict = Depends(require_permission_with_rls("expenses.manage")),
    db: Session = Depends(get_db)
):
    business_id = current_user["business_id"]

    expense = db.query(Expense).filter(
        Expense.expense_id == expense_id,
        Expense.business_id == business_id,
        Expense.is_deleted == False
    ).first()

    if not expense:
        return error_response("Expense not found", status_code=404)

    if expense.source_type:
        return error_response(
            f"This expense was auto-generated from a {expense.source_type} and cannot be "
            f"edited or deleted directly. Adjust the source {expense.source_type} instead.",
            status_code=400
        )

    if data.expense_category is not None:
        expense.expense_category = data.expense_category
    if data.expense_amount is not None:
        expense.expense_amount = data.expense_amount
    if data.expense_date is not None:
        expense.expense_date = data.expense_date
    if data.expense_notes is not None:
        expense.expense_notes = data.expense_notes

    expense.updated_by = current_user["user_id"]

    db.commit()
    set_rls_gucs_after_commit(db, current_user)
    db.refresh(expense)

    updated_by_name = current_user.get("full_name")

    return success_response({
        "message": "Expense updated successfully",
        "expense": expense_to_dict(expense, last_updated_by=updated_by_name)
    })


# ─────────────────────────────────────────
# DELETE /expenses/{expense_id} → Soft delete
# ─────────────────────────────────────────
@router.delete("/{expense_id}")
def delete_expense(
    expense_id: str,
    current_user: dict = Depends(require_permission_with_rls("expenses.manage")),
    db: Session = Depends(get_db)
):
    business_id = current_user["business_id"]

    expense = db.query(Expense).filter(
        Expense.expense_id == expense_id,
        Expense.business_id == business_id,
        Expense.is_deleted == False
    ).first()

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
    db.commit()

    return success_response({
        "message": "Expense deleted successfully"
    })