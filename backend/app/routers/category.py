# app/routers/category.py

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func, text
from app.database import get_db
from app.middleware.rbac import require_permission
from app.utils.response import success_response, error_response
from app.utils.pagination import paginate, pagination_response
from app.schemas.category import CategoryCreate, CategoryUpdate, CategoryResponse
from app.models.category import Category
import uuid

router = APIRouter(
    prefix="/categories",
    tags=["Categories"]
)


# ══════════════════════════════════════════════════════════════════
# POST /categories → Create new category
# ══════════════════════════════════════════════════════════════════
@router.post("/")
def create_category(
    payload: CategoryCreate,
    current_user: dict = Depends(require_permission("products.edit")),
    db: Session = Depends(get_db)
):
    # Block duplicate category names within the same business (case-insensitive)
    existing = db.query(Category).filter(
        Category.business_id   == current_user["business_id"],
        func.lower(Category.category_name) == payload.category_name.lower(),
        Category.is_deleted    == False
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


# ══════════════════════════════════════════════════════════════════
# GET /categories → All categories (paginated)
# ══════════════════════════════════════════════════════════════════
@router.get("/")
def get_categories(
    current_user: dict = Depends(require_permission("products.view")),
    pagination: dict = Depends(paginate),
    db: Session = Depends(get_db)
):
    base_query = db.query(Category).filter(
        Category.business_id == current_user["business_id"],
        Category.is_deleted  == False
    )

    total      = base_query.count()
    categories = base_query.offset(pagination["offset"]).limit(pagination["limit"]).all()
    data       = [CategoryResponse.from_orm(c).dict() for c in categories]

    return success_response(
        pagination_response(
            data=data,
            total=total,
            page=pagination["page"],
            limit=pagination["limit"]
        )
    )


# ══════════════════════════════════════════════════════════════════
# GET /categories/{category_id} → Category detail WITH product list
#
# Returns the category plus every product under it, with:
#   is_low_stock → true when prod_stock_qty <= prod_low_stock_alert
#   stock_value  → cost_price × stock_qty per product
#   summary      → totals for the frontend header card
# ══════════════════════════════════════════════════════════════════
@router.get("/{category_id}")
def get_category(
    category_id:  str,
    current_user: dict = Depends(require_permission("products.view")),
    db:           Session = Depends(get_db)
):
    business_id = current_user["business_id"]

    category = db.query(Category).filter(
        Category.category_id == category_id,
        Category.business_id == business_id,
        Category.is_deleted  == False
    ).first()

    if not category:
        return error_response("Category not found", 404)

    product_rows = db.execute(
        text("""
            SELECT
                prod_id, prod_name, prod_sell_price, prod_cost_price,
                prod_profit, prod_stock_qty, prod_low_stock_alert,
                tax_rate, tax_code, barcode, unit, prod_created_at, updated_at
            FROM products
            WHERE category_id = CAST(:cid AS uuid)
              AND business_id  = CAST(:bid AS uuid)
              AND is_deleted   = false
            ORDER BY prod_name ASC
        """),
        {"cid": category_id, "bid": business_id}
    ).fetchall()

    products          = []
    total_stock_value = 0.0

    for p in product_rows:
        is_low_stock  = p.prod_stock_qty <= p.prod_low_stock_alert
        stock_value   = float(p.prod_cost_price) * p.prod_stock_qty
        total_stock_value += stock_value

        products.append({
            "prod_id":              str(p.prod_id),
            "prod_name":            p.prod_name,
            "prod_sell_price":      float(p.prod_sell_price),
            "prod_cost_price":      float(p.prod_cost_price),
            "prod_profit":          float(p.prod_profit) if p.prod_profit is not None else None,
            "prod_stock_qty":       p.prod_stock_qty,
            "prod_low_stock_alert": p.prod_low_stock_alert,
            "tax_rate":             float(p.tax_rate) if p.tax_rate else 0,
            "tax_code":             p.tax_code,
            "barcode":              p.barcode,
            "unit":                 p.unit,
            "is_low_stock":         is_low_stock,
            "stock_value":          round(stock_value, 2),
            "prod_created_at":      str(p.prod_created_at) if p.prod_created_at else None,
            "updated_at":           str(p.updated_at) if p.updated_at else None
        })

    total_products  = len(products)
    low_stock_count = sum(1 for p in products if p["is_low_stock"])
    out_of_stock    = sum(1 for p in products if p["prod_stock_qty"] == 0)

    return success_response({
        "category_id":   str(category.category_id),
        "business_id":   str(category.business_id),
        "category_name": category.category_name,
        "is_deleted":    category.is_deleted,
        "created_at":    str(category.created_at) if category.created_at else None,
        "summary": {
            "total_products":     total_products,
            "low_stock_count":    low_stock_count,
            "out_of_stock_count": out_of_stock,
            "total_stock_value":  round(total_stock_value, 2)
        },
        "products": products
    })


# ══════════════════════════════════════════════════════════════════
# PUT /categories/{category_id} → Update category name
# ══════════════════════════════════════════════════════════════════
@router.put("/{category_id}")
def update_category(
    category_id: str,
    payload: CategoryUpdate,
    current_user: dict = Depends(require_permission("products.edit")),
    db: Session = Depends(get_db)
):
    category = db.query(Category).filter(
        Category.category_id == category_id,
        Category.business_id == current_user["business_id"],
        Category.is_deleted  == False
    ).first()

    if not category:
        return error_response("Category not found", 404)

    # Block duplicate names (excluding this category itself)
    if payload.category_name:
        existing = db.query(Category).filter(
            Category.business_id   == current_user["business_id"],
            Category.category_id   != category_id,
            func.lower(Category.category_name) == payload.category_name.lower(),
            Category.is_deleted    == False
        ).first()

        if existing:
            return error_response("Category with this name already exists", 400)

    update_data = payload.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(category, field, value)

    db.commit()
    db.refresh(category)

    return success_response(CategoryResponse.from_orm(category).dict())


# ══════════════════════════════════════════════════════════════════
# DELETE /categories/{category_id} → Soft delete with CASCADE
#
# FIX: When a category is deactivated (soft-deleted), all products
# under that category are also soft-deleted automatically.
#
# WHY cascade is needed:
#   A product with a deleted category is an orphan — it shows in
#   product lists but has no category context. The shopkeeper
#   can't see or manage it from the category page. It pollutes
#   search results and reports.
#
# WHY NOT a DB-level CASCADE:
#   A DB ON DELETE CASCADE would permanently delete or null-out the
#   category_id on products. We use soft-delete everywhere (is_deleted=true),
#   so we handle this in the API layer with a targeted UPDATE.
#
# Response includes products_deactivated count so the frontend
# can warn the user: "This will also deactivate 5 products."
# ══════════════════════════════════════════════════════════════════
@router.delete("/{category_id}")
def delete_category(
    category_id: str,
    current_user: dict = Depends(require_permission("products.edit")),
    db: Session = Depends(get_db)
):
    business_id = current_user["business_id"]

    category = db.query(Category).filter(
        Category.category_id == category_id,
        Category.business_id == business_id,
        Category.is_deleted  == False
    ).first()

    if not category:
        return error_response("Category not found", 404)

    # Step 1 — Count active products that will be deactivated
    # We read this BEFORE doing the UPDATE so we can report accurate count.
    affected_count_row = db.execute(
        text("""
            SELECT COUNT(*) AS cnt
            FROM products
            WHERE category_id = CAST(:cid AS uuid)
              AND business_id  = CAST(:bid AS uuid)
              AND is_deleted   = false
        """),
        {"cid": category_id, "bid": business_id}
    ).fetchone()

    affected_count = int(affected_count_row.cnt) if affected_count_row else 0

    # Step 2 — Soft-delete all active products under this category
    # WHY raw SQL: faster than loading all Product ORM objects one by one.
    # One UPDATE statement touches all matching rows in a single DB round-trip.
    db.execute(
        text("""
            UPDATE products
            SET is_deleted = true
            WHERE category_id = CAST(:cid AS uuid)
              AND business_id  = CAST(:bid AS uuid)
              AND is_deleted   = false
        """),
        {"cid": category_id, "bid": business_id}
    )

    # Step 3 — Soft-delete the category itself
    category.is_deleted = True
    db.commit()

    return success_response({
        "message":              "Category deleted successfully",
        "products_deactivated": affected_count
    })