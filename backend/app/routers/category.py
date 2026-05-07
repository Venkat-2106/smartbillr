from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.database import get_db
from app.middleware.auth import verify_token
from app.utils.response import success_response, error_response
from app.utils.pagination import paginate, pagination_response
from app.schemas.category import CategoryCreate, CategoryUpdate, CategoryResponse
from app.models.category import Category
import uuid

router = APIRouter(
    prefix="/categories",
    tags=["Categories"]
)

# ─── CREATE CATEGORY ───────────────────────────────────────────
@router.post("/")
def create_category(
    payload: CategoryCreate,
    current_user: dict = Depends(verify_token),
    db: Session = Depends(get_db)
):
    # Check if category name already exists for this business
    existing = db.query(Category).filter(
        Category.business_id == current_user["business_id"],
        Category.category_name == payload.category_name,
        Category.is_deleted == False
    ).first()

    if existing:
        return error_response("Category with this name already exists", 400)

    new_category = Category(
        category_id=uuid.uuid4(),
        business_id=current_user["business_id"],
        category_name=payload.category_name
    )

    db.add(new_category)
    db.commit()
    db.refresh(new_category)

    return success_response(CategoryResponse.from_orm(new_category).dict(), 201)


# ─── GET ALL CATEGORIES ────────────────────────────────────────
@router.get("/")
def get_categories(
    current_user: dict = Depends(verify_token),
    pagination: dict = Depends(paginate),
    db: Session = Depends(get_db)
):
    base_query = db.query(Category).filter(
        Category.business_id == current_user["business_id"],
        Category.is_deleted == False
    )

    total = base_query.count()
    categories = base_query.offset(pagination["offset"]).limit(pagination["limit"]).all()

    data = [CategoryResponse.from_orm(c).dict() for c in categories]

    return success_response(
        pagination_response(
            data=data,
            total=total,
            page=pagination["page"],
            limit=pagination["limit"]
        )
    )


# ─── GET ONE CATEGORY ──────────────────────────────────────────
@router.get("/{category_id}")
def get_category(
    category_id: str,
    current_user: dict = Depends(verify_token),
    db: Session = Depends(get_db)
):
    category = db.query(Category).filter(
        Category.category_id == category_id,
        Category.business_id == current_user["business_id"],
        Category.is_deleted == False
    ).first()

    if not category:
        return error_response("Category not found", 404)

    return success_response(CategoryResponse.from_orm(category).dict())


# ─── UPDATE CATEGORY ───────────────────────────────────────────
@router.put("/{category_id}")
def update_category(
    category_id: str,
    payload: CategoryUpdate,
    current_user: dict = Depends(verify_token),
    db: Session = Depends(get_db)
):
    category = db.query(Category).filter(
        Category.category_id == category_id,
        Category.business_id == current_user["business_id"],
        Category.is_deleted == False
    ).first()

    if not category:
        return error_response("Category not found", 404)

    update_data = payload.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(category, field, value)

    db.commit()
    db.refresh(category)

    return success_response(CategoryResponse.from_orm(category).dict())


# ─── DELETE CATEGORY (SOFT) ────────────────────────────────────
@router.delete("/{category_id}")
def delete_category(
    category_id: str,
    current_user: dict = Depends(verify_token),
    db: Session = Depends(get_db)
):
    category = db.query(Category).filter(
        Category.category_id == category_id,
        Category.business_id == current_user["business_id"],
        Category.is_deleted == False
    ).first()

    if not category:
        return error_response("Category not found", 404)

    # Soft delete — never hard delete!
    category.is_deleted = True
    db.commit()

    return success_response({"message": "Category deleted successfully"})