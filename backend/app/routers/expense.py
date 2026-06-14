from fastapi import APIRouter, Depends, Query
from typing import Optional
from sqlalchemy.orm import Session
from sqlalchemy import func, text
from app.database import get_db
from app.middleware.rbac import require_permission
from app.models.expense import Expense
from app.schemas.expense import ExpenseCreate, ExpenseUpdate
from app.utils.response import success_response, error_response
from app.utils.pagination import paginate, pagination_response
from app.utils.timestamp import fmt_ts, fmt_date

router = APIRouter(prefix="/expenses", tags=["Expenses"])


# ─────────────────────────────────────────
# HELPER: Format expense as dict
# ─────────────────────────────────────────
def expense_to_dict(e):
    return {
        "expense_id": str(e.expense_id),
        "business_id": str(e.business_id),
        "expense_category": e.expense_category,
        "expense_amount": float(e.expense_amount),
        "expense_date": fmt_date(e.expense_date),
        "expense_notes": e.expense_notes,
        "is_deleted": e.is_deleted,
        "created_at": fmt_ts(e.created_at),
        "created_by": str(e.created_by) if e.created_by else None
    }


# ─────────────────────────────────────────
# POST /expenses → Create new expense
# ─────────────────────────────────────────
@router.post("/")
def create_expense(
    data: ExpenseCreate,
    current_user: dict = Depends(require_permission("expenses.manage")),
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
        created_by=user_id
    )

    db.add(new_expense)
    db.commit()
    db.refresh(new_expense)

    return success_response({
        "message": "Expense created successfully",
        "expense": expense_to_dict(new_expense)
    }, status_code=201)


# ─────────────────────────────────────────
# GET /expenses → Get all expenses
# ─────────────────────────────────────────
@router.get("/")
def get_all_expenses(
    current_user: dict = Depends(require_permission("expenses.manage")),
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

    count_sql = f"""
        SELECT COUNT(e.expense_id)
        FROM expenses e
        WHERE e.business_id = CAST(:bid AS uuid)
          AND e.is_deleted = false
        {extra_where}
    """
    total = db.execute(text(count_sql), params).scalar() or 0

    params["offset"] = pagination["offset"]
    params["limit"] = pagination["limit"]

    list_sql = f"""
        SELECT e.expense_id, e.business_id, e.expense_category,
               e.expense_amount, e.expense_date, e.expense_notes,
               e.is_deleted, e.created_at, e.created_by
        FROM expenses e
        WHERE e.business_id = CAST(:bid AS uuid)
          AND e.is_deleted = false
        {extra_where}
        ORDER BY {order_col} {order_dir}
        OFFSET :offset LIMIT :limit
    """
    rows = db.execute(text(list_sql), params).fetchall()

    return success_response(
        pagination_response(
            [expense_to_dict(e) for e in rows],
            total,
            pagination["page"],
            pagination["limit"]
        )
    )


# ─────────────────────────────────────────
# GET /expenses/{expense_id} → Get one expense
# ─────────────────────────────────────────
@router.get("/{expense_id}")
def get_expense(
    expense_id: str,
    current_user: dict = Depends(require_permission("expenses.manage")),
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

    return success_response(expense_to_dict(expense))


# ─────────────────────────────────────────
# PUT /expenses/{expense_id} → Update expense
# ─────────────────────────────────────────
@router.put("/{expense_id}")
def update_expense(
    expense_id: str,
    data: ExpenseUpdate,
    current_user: dict = Depends(require_permission("expenses.manage")),
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

    # Update only fields that were sent
    if data.expense_category is not None:
        expense.expense_category = data.expense_category
    if data.expense_amount is not None:
        expense.expense_amount = data.expense_amount
    if data.expense_date is not None:
        expense.expense_date = data.expense_date
    if data.expense_notes is not None:
        expense.expense_notes = data.expense_notes

    db.commit()
    db.refresh(expense)

    return success_response({
        "message": "Expense updated successfully",
        "expense": expense_to_dict(expense)
    })


# ─────────────────────────────────────────
# DELETE /expenses/{expense_id} → Soft delete
# ─────────────────────────────────────────
@router.delete("/{expense_id}")
def delete_expense(
    expense_id: str,
    current_user: dict = Depends(require_permission("expenses.manage")),
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

    expense.is_deleted = True
    db.commit()

    return success_response({
        "message": "Expense deleted successfully"
    })