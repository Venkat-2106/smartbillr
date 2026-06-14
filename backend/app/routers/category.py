# app/routers/category.py

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, text
from app.database import get_db
from app.middleware.rbac import require_permission
from app.utils.response import success_response, error_response
from app.utils.pagination import paginate, pagination_response
from app.schemas.category import CategoryCreate, CategoryUpdate, CategoryResponse
from app.models.category import Category
from app.utils.timestamp import fmt_ts
from typing import Optional
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
        category_name=payload.category_name,
        created_by=current_user["user_id"],   # Track who created this category
        updated_by=current_user["user_id"],   # Initially same as created_by
    )

    db.add(new_category)
    db.commit()
    db.refresh(new_category)

    # Fetch the creator's name so the table shows it immediately after creation
    creator_name = db.execute(
        text("SELECT full_name FROM profiles WHERE id = CAST(:uid AS uuid)"),
        {"uid": str(current_user["user_id"])}
    ).scalar()

    return success_response(_category_to_dict(new_category, last_updated_by=creator_name), 201)


# ══════════════════════════════════════════════════════════════════
# GET /categories — paginated, with server-side search, date filter, sort
#
# SCALABILITY UPDATE:
#   search       — ILIKE on category_name
#   updated_from — filters updated_at >= date (YYYY-MM-DD)
#   updated_to   — filters updated_at <= date (YYYY-MM-DD)
#   sort_by      — whitelist-validated column name
#   sort_dir     — asc | desc
# ══════════════════════════════════════════════════════════════════
@router.get("/")
def get_categories(
    current_user: dict          = Depends(require_permission("products.view")),
    pagination:   dict          = Depends(paginate),
    db:           Session       = Depends(get_db),
    search:       Optional[str] = Query(default=None, description="Search by category name"),
    updated_from: Optional[str] = Query(default=None, description="Filter updated_at >= YYYY-MM-DD"),
    updated_to:   Optional[str] = Query(default=None, description="Filter updated_at <= YYYY-MM-DD"),
    sort_by:      Optional[str] = Query(default="category_name", description="Column to sort by"),
    sort_dir:     Optional[str] = Query(default="asc",           description="asc or desc"),
):
    business_id = current_user["business_id"]

    SORTABLE = {
        "category_name": "c.category_name",
        "updated_at":    "c.updated_at",
        "created_at":    "c.created_at",
    }
    order_col = SORTABLE.get(sort_by, "c.category_name")
    order_dir = "DESC" if str(sort_dir).lower() == "desc" else "ASC"

    extra_where = ""
    params: dict = {
        "bid":    business_id,
        "offset": pagination["offset"],
        "limit":  pagination["limit"],
    }

    if search and search.strip():
        extra_where += " AND c.category_name ILIKE :search"
        params["search"] = f"%{search.strip()}%"

    # TIMEZONE FIX: frontend sends UTC ISO strings (local day start/end converted
    # to UTC). Compare directly — no CAST to date (which would use server UTC timezone).
    if updated_from:
        extra_where += " AND c.updated_at >= :updated_from"
        params["updated_from"] = updated_from

    if updated_to:
        extra_where += " AND c.updated_at <= :updated_to"
        params["updated_to"] = updated_to

    total = db.execute(
        text(f"""
            SELECT COUNT(*)
            FROM categories c
            WHERE c.business_id = CAST(:bid AS uuid)
              AND c.is_deleted   = false
              {extra_where}
        """),
        params
    ).scalar()

    rows = db.execute(
        text(f"""
            SELECT
                c.category_id, c.business_id, c.category_name,
                c.is_deleted, c.created_at, c.created_by,
                c.updated_at, c.updated_by,
                p1.full_name AS last_updated_by,
                p2.full_name AS created_by_name
            FROM categories c
            LEFT JOIN profiles p1 ON p1.id = c.updated_by
            LEFT JOIN profiles p2 ON p2.id = c.created_by
            WHERE c.business_id = CAST(:bid AS uuid)
              AND c.is_deleted   = false
              {extra_where}
            ORDER BY {order_col} {order_dir}
            OFFSET :offset LIMIT :limit
        """),
        params
    ).fetchall()

    data = [
        {
            "category_id":     str(r.category_id),
            "business_id":     str(r.business_id),
            "category_name":   r.category_name,
            "is_deleted":      r.is_deleted,
            "created_at":      fmt_ts(r.created_at),
            "created_by":      str(r.created_by)  if r.created_by  else None,
            "created_by_name": r.created_by_name  if r.created_by_name  else None,
            "updated_at":      fmt_ts(r.updated_at),
            "updated_by":      str(r.updated_by)  if r.updated_by  else None,
            "last_updated_by": r.last_updated_by  if r.last_updated_by  else None,
        }
        for r in rows
    ]

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
# ══════════════════════════════════════════════════════════════════
@router.get("/{category_id}")
def get_category(
    category_id:  str,
    current_user: dict = Depends(require_permission("products.view")),
    db:           Session = Depends(get_db)
):
    business_id = current_user["business_id"]

    # Raw SQL with two LEFT JOINs to get creator name + last updater name in one query
    cat_row = db.execute(
        text("""
            SELECT
                c.category_id, c.business_id, c.category_name, c.is_deleted,
                c.created_at,  c.created_by,
                c.updated_at,  c.updated_by,
                p1.full_name AS created_by_name,
                p2.full_name AS last_updated_by
            FROM categories c
            LEFT JOIN profiles p1 ON p1.id = c.created_by
            LEFT JOIN profiles p2 ON p2.id = c.updated_by
            WHERE c.category_id = CAST(:cid AS uuid)
              AND c.business_id  = CAST(:bid AS uuid)
              AND c.is_deleted   = false
        """),
        {"cid": category_id, "bid": str(business_id)}
    ).fetchone()

    if not cat_row:
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
        {"cid": category_id, "bid": str(business_id)}
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
            "prod_created_at":      fmt_ts(p.prod_created_at),
            "updated_at":           fmt_ts(p.updated_at)
        })

    total_products  = len(products)
    low_stock_count = sum(1 for p in products if p["is_low_stock"])
    out_of_stock    = sum(1 for p in products if p["prod_stock_qty"] == 0)

    return success_response({
        "category_id":     str(cat_row.category_id),
        "business_id":     str(cat_row.business_id),
        "category_name":   cat_row.category_name,
        "is_deleted":      cat_row.is_deleted,
        "created_at":      fmt_ts(cat_row.created_at),
        "created_by":      str(cat_row.created_by)  if cat_row.created_by  else None,
        "created_by_name": cat_row.created_by_name  or None,
        "updated_at":      fmt_ts(cat_row.updated_at),
        "updated_by":      str(cat_row.updated_by)  if cat_row.updated_by  else None,
        "last_updated_by": cat_row.last_updated_by  or None,
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
# Sets updated_by = current_user["user_id"]
# DB trigger automatically sets updated_at on commit
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

    # Track who last updated this category
    # updated_at is set automatically by DB trigger trg_categories_updated_at
    category.updated_by = current_user["user_id"]

    db.commit()
    db.refresh(category)

    # Fetch the updater's name to return in response
    updated_by_name = db.execute(
        text("SELECT full_name FROM profiles WHERE id = CAST(:uid AS uuid)"),
        {"uid": str(category.updated_by)}
    ).scalar()

    return success_response(_category_to_dict(category, last_updated_by=updated_by_name))


# ══════════════════════════════════════════════════════════════════
# DELETE /categories/{category_id} → Soft delete with CASCADE
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
    db.execute(
        text("""
            UPDATE products
            SET is_deleted = true,
                updated_by = CAST(:uid AS uuid)
            WHERE category_id = CAST(:cid AS uuid)
              AND business_id  = CAST(:bid AS uuid)
              AND is_deleted   = false
        """),
        {"cid": category_id, "bid": business_id, "uid": current_user["user_id"]}
    )

    # Step 3 — Soft-delete the category itself
    category.is_deleted = True
    category.updated_by = current_user["user_id"]
    db.commit()

    return success_response({
        "message":              "Category deleted successfully",
        "products_deactivated": affected_count
    })


# ── Private helper: uniform category dict with updated_at + last_updated_by ──
def _category_to_dict(category: Category, last_updated_by=None):
    return {
        "category_id":    str(category.category_id),
        "business_id":    str(category.business_id),
        "category_name":  category.category_name,
        "is_deleted":     category.is_deleted,
        "created_at":     fmt_ts(category.created_at),
        "updated_at":     fmt_ts(category.updated_at),
        "updated_by":     str(category.updated_by) if category.updated_by else None,
        "last_updated_by": last_updated_by,
    }