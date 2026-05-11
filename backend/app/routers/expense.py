from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.database import get_db
from app.middleware.auth import verify_token
from app.models.expense import Expense
from app.schemas.expense import ExpenseCreate, ExpenseUpdate
from app.utils.response import success_response, error_response
from app.utils.pagination import paginate, pagination_response

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
        "expense_date": str(e.expense_date) if e.expense_date else None,
        "expense_notes": e.expense_notes,
        "is_deleted": e.is_deleted,
        "created_at": str(e.created_at) if e.created_at else None,
        "created_by": str(e.created_by) if e.created_by else None
    }


# ─────────────────────────────────────────
# POST /expenses → Create new expense
# ─────────────────────────────────────────
@router.post("/")
def create_expense(
    data: ExpenseCreate,
    current_user: dict = Depends(verify_token),
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
    current_user: dict = Depends(verify_token),
    db: Session = Depends(get_db),
    pagination: dict = Depends(paginate)
):
    business_id = current_user["business_id"]

    total = db.query(func.count(Expense.expense_id)).filter(
        Expense.business_id == business_id,
        Expense.is_deleted == False
    ).scalar()

    expenses = db.query(Expense).filter(
        Expense.business_id == business_id,
        Expense.is_deleted == False
    ).order_by(Expense.expense_date.desc())\
     .offset(pagination["offset"]).limit(pagination["limit"]).all()

    return success_response(
        pagination_response(
            [expense_to_dict(e) for e in expenses],
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
    current_user: dict = Depends(verify_token),
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
    current_user: dict = Depends(verify_token),
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
    current_user: dict = Depends(verify_token),
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