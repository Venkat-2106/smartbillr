from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text
from app.database import get_db
from app.middleware.auth import verify_token
from app.utils.response import success_response, error_response
from app.schemas.business import BusinessCreate, BusinessUpdate, BusinessResponse
from app.models.business import Business
import uuid

router = APIRouter(
    prefix="/businesses",
    tags=["Businesses"]
)

# ─── GET MY BUSINESS ───────────────────────────────────────────
@router.get("/me")
def get_my_business(
    current_user: dict = Depends(verify_token),
    db: Session = Depends(get_db)
):
    business = db.query(Business).filter(
        Business.business_id == current_user["business_id"],
        Business.is_deleted == False
    ).first()

    if not business:
        return error_response("Business not found", 404)

    return success_response(BusinessResponse.from_orm(business).dict())


# ─── UPDATE MY BUSINESS ────────────────────────────────────────
@router.put("/me")
def update_my_business(
    payload: BusinessUpdate,
    current_user: dict = Depends(verify_token),
    db: Session = Depends(get_db)
):
    business = db.query(Business).filter(
        Business.business_id == current_user["business_id"],
        Business.is_deleted == False
    ).first()

    if not business:
        return error_response("Business not found", 404)

    # Only update fields that were actually sent
    update_data = payload.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(business, field, value)

    db.commit()
    db.refresh(business)

    return success_response(BusinessResponse.from_orm(business).dict())


# ─── GET ALL STAFF OF MY BUSINESS ──────────────────────────────
@router.get("/staff")
def get_staff(
    current_user: dict = Depends(verify_token),
    db: Session = Depends(get_db)
):
    result = db.execute(
        text("""
            SELECT id, full_name, role, is_active, created_at
            FROM profiles
            WHERE business_id = :business_id
        """),
        {"business_id": current_user["business_id"]}
    ).fetchall()

    staff_list = [
        {
            "id": str(row.id),
            "full_name": row.full_name,
            "role": row.role,
            "is_active": row.is_active,
            "created_at": str(row.created_at)
        }
        for row in result
    ]

    return success_response(staff_list)