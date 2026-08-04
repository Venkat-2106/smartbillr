# app/routers/category.py
#
# ── ASYNC MIGRATION NOTE (2026-07) ──────────────────────────────────────────
#
# This router was migrated from sync SQLAlchemy (psycopg2) to async
#
# FIX (2026-07-18): /import trailing slash
#   Added @router.post("/import/") alongside "/import" to handle trailing-slash
#   requests that match /{category_id}/ (GET-only) and return 405.
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

from fastapi import APIRouter, Depends, Query, File, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import func, select, text
from sqlalchemy.exc import IntegrityError
from app.database import get_async_db
from app.middleware.rbac import require_permission, async_set_rls_gucs_after_commit
from app.utils.response import success_response, error_response
from app.utils.pagination import paginate_async, pagination_response
from app.schemas.category import CategoryCreate, CategoryUpdate, CategoryResponse
from app.models.category import Category
from app.utils.timestamp import fmt_ts
from app.utils.subscription_features import check_feature_access
from app.utils.bulk_import import parse_csv_file, validate_rows, check_required_headers, friendly_db_error, validate_upload_file, MAX_IMPORT_FILE_BYTES, bulk_import_scaffold
from app.schemas.validators import strip_and_escape_html, strip_and_escape_csv_value
from typing import Optional
from datetime import datetime, timezone
import uuid

router = APIRouter(
    prefix="/v1/categories",
    tags=["Categories"]
)

REQUIRED_CATEGORY_COLUMNS = [
    {"names": ["category_name", "name", "Category Name"]},
]


# ══════════════════════════════════════════════════════════════════
# POST /categories → Create new category
# ══════════════════════════════════════════════════════════════════
@router.post("/")
async def create_category(
    payload: CategoryCreate,
    current_user: dict = Depends(require_permission("products.edit")),
    db: AsyncSession = Depends(get_async_db)
):
    # Block duplicate category names within the same business (case-insensitive)
    result = await db.execute(
        select(Category).where(
            Category.business_id   == current_user["business_id"],
            func.lower(Category.category_name) == payload.category_name.lower(),
            Category.is_deleted    == False
        )
    )
    existing = result.scalar_one_or_none()

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

    cat_id = str(new_category.category_id)
    biz_id = str(new_category.business_id)
    await db.commit()

    # Re-set GUCs after commit (SET LOCAL is transaction-scoped)
    await async_set_rls_gucs_after_commit(db, current_user)

    # Refresh timestamps via raw SQL with explicit business_id filter (RLS bypass).
    # SQLAlchemy ORM's refresh() fails because RLS policies block the implicit SELECT.
    row = (await db.execute(
        text("""
            SELECT created_at, updated_at
            FROM categories
            WHERE category_id = CAST(:cid AS uuid)
              AND business_id  = CAST(:bid AS uuid)
        """),
        {"cid": cat_id, "bid": biz_id}
    )).fetchone()

    # Fetch the creator's name so the table shows it immediately after creation
    creator_name = (await db.execute(
        text("SELECT full_name FROM profiles WHERE id = CAST(:uid AS uuid)"),
        {"uid": str(current_user["user_id"])}
    )).scalar()

    return success_response({
        "category_id":     cat_id,
        "business_id":     biz_id,
        "category_name":   payload.category_name,
        "is_deleted":      False,
        "created_at":      fmt_ts(row.created_at) if row else None,
        "updated_at":      fmt_ts(row.updated_at) if row else None,
        "updated_by":      str(current_user["user_id"]),
        "last_updated_by": creator_name,
    }, 201)


# ══════════════════════════════════════════════════════════════════
# POST /categories/import → Bulk import categories from CSV
# ══════════════════════════════════════════════════════════════════
@router.post("/import/")
@router.post("/import")
async def import_categories(
    file: UploadFile = File(...),
    current_user: dict = Depends(require_permission("products.edit")),
    db: AsyncSession = Depends(get_async_db),
    mode: Optional[str] = Query(default="create", description="Import mode: 'create' (default) or 'update'"),
):
    is_update_mode = (mode or "").lower() == "update"

    def row_transform(row: dict, row_num: int):
        name = row.get("category_name") or row.get("name") or row.get("Category Name") or ""
        name = name.strip()
        if not name:
            return None, "category_name is required"
        name = strip_and_escape_csv_value(name)
        return {"category_name": name, "_row_number": row_num}, None

    async def upsert(valid_rows, db, business_id, user_id):
        existing_names = {}
        if valid_rows:
            name_list = [r["category_name"] for r in valid_rows]
            placeholders = ", ".join([f":name_{i}" for i in range(len(name_list))])
            params = {"bid": business_id}
            for i, n in enumerate(name_list):
                params[f"name_{i}"] = n.lower()

            existing_rows = (await db.execute(text(f"""
                SELECT category_id, LOWER(category_name) as lname
                FROM categories
                WHERE business_id = CAST(:bid AS uuid)
                  AND LOWER(category_name) IN ({placeholders})
                  AND is_deleted = false
            """), params)).fetchall()

            for r in existing_rows:
                existing_names[r.lname] = str(r.category_id)

        new_rows = []
        update_rows = []
        upsert_errors = []

        for row in valid_rows:
            row_num = row.pop("_row_number")
            name = row["category_name"]
            name_lower = name.lower()

            if name_lower in existing_names:
                if is_update_mode:
                    update_rows.append({"cid": existing_names[name_lower], "uid": user_id, "name": name})
                else:
                    upsert_errors.append({"row": row_num, "message": f'Category "{name}" already exists. Rows with an existing category name are skipped during Bulk Create.'})
            else:
                if is_update_mode:
                    upsert_errors.append({"row": row_num, "message": f'Category "{name}" does not exist. Only existing categories can be updated.'})
                    continue
                new_cat_id = str(uuid.uuid4())
                new_rows.append({"cid": new_cat_id, "bid": business_id, "name": name, "uid": user_id, "_row_number": row_num})
                existing_names[name_lower] = new_cat_id

        created = 0
        updated = 0

        if new_rows:
            placeholders = ", ".join([
                f"(:cid_{i}, CAST(:bid AS uuid), :name_{i}, CAST(:uid_{i} AS uuid), CAST(:uid_{i} AS uuid))"
                for i in range(len(new_rows))
            ])
            params = {}
            for i, r in enumerate(new_rows):
                params[f"cid_{i}"] = r["cid"]
                params[f"name_{i}"] = r["name"]
                params[f"uid_{i}"] = r["uid"]
            params["bid"] = business_id

            try:
                await db.execute(text(f"""
                    INSERT INTO categories (category_id, business_id, category_name, created_by, updated_by)
                    VALUES {placeholders}
                """), params)
                created = len(new_rows)
            except IntegrityError as e:
                orig_detail = str(getattr(e, "orig", e))
                culprit_row = None
                if "unique" in orig_detail.lower() or "duplicate" in orig_detail.lower():
                    for r in new_rows:
                        name_l = (r.get("name") or "").strip().lower()
                        if name_l and name_l in orig_detail.lower():
                            culprit_row = r
                            break
                if culprit_row:
                    upsert_errors.append({
                        "row": culprit_row["_row_number"],
                        "message": (
                            f'Category "{culprit_row.get("name")}" conflicts with an existing '
                            f'record. Because this batch is inserted together, none of the '
                            f'{len(new_rows)} new categories in this batch were created. '
                            f'Fix or remove this row and re-upload.'
                        ),
                    })
                else:
                    upsert_errors.append({
                        "row": 0,
                        "message": (
                            f"{friendly_db_error(e, context='category insert batch')} "
                            f"None of the {len(new_rows)} new categories in this batch were created "
                            f"because they were inserted together — please check for duplicate "
                            f"names and re-upload."
                        ),
                    })
            except Exception as e:
                upsert_errors.append({
                    "row": 0,
                    "message": (
                        f"{friendly_db_error(e, context='category insert batch')} "
                        f"None of the {len(new_rows)} new categories in this batch were created."
                    ),
                })

        for i, r in enumerate(update_rows):
            try:
                async with db.begin_nested():
                    await db.execute(text("""
                        UPDATE categories
                        SET category_name = :name,
                            updated_by = CAST(:uid AS uuid)
                        WHERE category_id = CAST(:cid AS uuid)
                          AND business_id = CAST(:bid AS uuid)
                    """), {"cid": r["cid"], "bid": business_id, "name": r["name"], "uid": r["uid"]})
                    updated += 1
            except Exception as e:
                upsert_errors.append({"row": i + 1, "message": friendly_db_error(e, context=f"category update row {i + 1}")})

        return created, updated, upsert_errors

    return await bulk_import_scaffold(
        file=file,
        db=db,
        current_user=current_user,
        row_transform=row_transform,
        required_columns=REQUIRED_CATEGORY_COLUMNS,
        required_columns_update=[{"names": ["category_name", "name", "Category Name"]}],
        upsert_fn=upsert,
        is_update_mode=is_update_mode,
    )


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
async def get_categories(
    current_user: dict          = Depends(require_permission("products.view")),
    pagination:   dict          = Depends(paginate_async),
    db:           AsyncSession  = Depends(get_async_db),
    search:       Optional[str] = Query(default=None, description="Search by category name"),
    updated_from: Optional[str] = Query(default=None, description="Filter updated_at >= YYYY-MM-DD"),
    updated_to:   Optional[str] = Query(default=None, description="Filter updated_at <= YYYY-MM-DD"),
    sort_by:      Optional[str] = Query(default="updated_at", description="Column to sort by"),
    sort_dir:     Optional[str] = Query(default="desc",        description="asc or desc"),
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
        params["updated_from"] = datetime.fromisoformat(updated_from.replace("Z", ""))

    if updated_to:
        extra_where += " AND c.updated_at <= :updated_to"
        params["updated_to"] = datetime.fromisoformat(updated_to.replace("Z", ""))

    rows = (await db.execute(
        text(f"""
            SELECT
                c.category_id, c.business_id, c.category_name,
                c.created_at, c.updated_at,
                c.created_by, c.updated_by,
                p1.full_name AS created_by_name,
                p2.full_name AS last_updated_by,
                COUNT(*) OVER() AS total_count
            FROM categories c
            LEFT JOIN profiles p1 ON p1.id = c.created_by
            LEFT JOIN profiles p2 ON p2.id = c.updated_by
            WHERE c.business_id = CAST(:bid AS uuid)
              AND c.is_deleted   = false
              {extra_where}
            ORDER BY {order_col} {order_dir}
            OFFSET :offset LIMIT :limit
        """),
        params
    )).fetchall()

    total = rows[0].total_count if rows else 0

    data = [
        {
            "category_id":     str(r.category_id),
            "business_id":     str(r.business_id),
            "category_name":   r.category_name,
            "created_at":      fmt_ts(r.created_at),
            "updated_at":      fmt_ts(r.updated_at),
            "created_by":      str(r.created_by)  if r.created_by  else None,
            "created_by_name": r.created_by_name  if r.created_by_name  else None,
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
            limit=pagination["limit"],
            capped=pagination["_capped"]
        )
    )


# ══════════════════════════════════════════════════════════════════
# GET /categories/{category_id} → Category detail WITH product list
# ══════════════════════════════════════════════════════════════════
@router.get("/{category_id}/")
async def get_category(
    category_id:  str,
    current_user: dict = Depends(require_permission("products.view")),
    db:           AsyncSession = Depends(get_async_db)
):
    business_id = current_user["business_id"]
    show_profit = check_feature_access(current_user, "product_profit_view")["allowed"]

    # Raw SQL with two LEFT JOINs to get creator name + last updater name in one query
    cat_row = (await db.execute(
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
    )).fetchone()

    if not cat_row:
        return error_response("Category not found", 404)

    product_rows = (await db.execute(
        text("""
            SELECT
                prod_id, prod_name, prod_sell_price, prod_cost_price,
                (prod_sell_price - prod_cost_price) AS prod_profit,
                CASE WHEN prod_sell_price > 0
                  THEN ROUND(((prod_sell_price - prod_cost_price) / prod_sell_price) * 100, 2)
                  ELSE 0
                END AS prod_profit_margin,
                prod_stock_qty, prod_low_stock_alert,
                tax_rate, tax_code, barcode, unit, prod_created_at, updated_at
            FROM products
            WHERE category_id = CAST(:cid AS uuid)
              AND business_id  = CAST(:bid AS uuid)
              AND is_deleted   = false
            ORDER BY prod_name ASC
        """),
        {"cid": category_id, "bid": str(business_id)}
    )).fetchall()

    products          = []
    total_stock_value = 0.0

    for p in product_rows:
        is_low_stock  = p.prod_stock_qty <= p.prod_low_stock_alert
        if show_profit:
            stock_value = float(p.prod_cost_price) * p.prod_stock_qty
            total_stock_value += stock_value
        else:
            stock_value = None

        products.append({
            "prod_id":              str(p.prod_id),
            "prod_name":            p.prod_name,
            "prod_sell_price":      float(p.prod_sell_price),
            "prod_cost_price":      float(p.prod_cost_price) if show_profit else None,
            "prod_profit":          float(p.prod_profit) if show_profit else None,
            "prod_profit_margin":   float(p.prod_profit_margin) if show_profit else None,
            "prod_stock_qty":       p.prod_stock_qty,
            "prod_low_stock_alert": p.prod_low_stock_alert,
            "tax_rate":             float(p.tax_rate) if p.tax_rate else 0,
            "tax_code":             p.tax_code,
            "barcode":              p.barcode,
            "unit":                 p.unit,
            "is_low_stock":         is_low_stock,
            "stock_value":          round(stock_value, 2) if show_profit else None,
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
            "total_stock_value":  round(total_stock_value, 2) if show_profit else None
        },
        "products": products
    })


# ══════════════════════════════════════════════════════════════════
# PUT /categories/{category_id} → Update category name
# DB triggers automatically set updated_at + updated_by on commit
# ══════════════════════════════════════════════════════════════════
@router.put("/{category_id}/")
async def update_category(
    category_id: str,
    payload: CategoryUpdate,
    current_user: dict = Depends(require_permission("products.edit")),
    db: AsyncSession = Depends(get_async_db)
):
    result = await db.execute(
        select(Category).where(
            Category.category_id == category_id,
            Category.business_id == current_user["business_id"],
            Category.is_deleted  == False
        )
    )
    category = result.scalar_one_or_none()

    if not category:
        return error_response("Category not found", 404)

    # Block duplicate names (excluding this category itself)
    if payload.category_name:
        result = await db.execute(
            select(Category).where(
                Category.business_id   == current_user["business_id"],
                Category.category_id   != category_id,
                func.lower(Category.category_name) == payload.category_name.lower(),
                Category.is_deleted    == False
            )
        )
        existing = result.scalar_one_or_none()

        if existing:
            return error_response("Category with this name already exists", 400)

    update_data = payload.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(category, field, value)

    cat_id = str(category.category_id)
    biz_id = str(category.business_id)
    await db.commit()

    # Re-set GUCs after commit (SET LOCAL is transaction-scoped)
    await async_set_rls_gucs_after_commit(db, current_user)

    # Re-fetch row after commit
    row = (await db.execute(
        text("""
            SELECT category_name, created_at, updated_at, updated_by
            FROM categories
            WHERE category_id = CAST(:cid AS uuid)
              AND business_id  = CAST(:bid AS uuid)
        """),
        {"cid": cat_id, "bid": biz_id}
    )).fetchone()

    if not row:
        return error_response("Category not found after update", 500)

    updated_by_name = None
    if row.updated_by:
        updated_by_name = (await db.execute(
            text("SELECT full_name FROM profiles WHERE id = CAST(:uid AS uuid)"),
            {"uid": str(row.updated_by)}
        )).scalar()

    return success_response({
        "category_id":     cat_id,
        "business_id":     biz_id,
        "category_name":   row.category_name,
        "is_deleted":      False,
        "created_at":      fmt_ts(row.created_at),
        "updated_at":      fmt_ts(row.updated_at),
        "updated_by":      str(row.updated_by) if row.updated_by else None,
        "last_updated_by": updated_by_name,
    })


# ══════════════════════════════════════════════════════════════════
# DELETE /categories/{category_id} → Soft delete with CASCADE
# ══════════════════════════════════════════════════════════════════
@router.delete("/{category_id}/")
async def delete_category(
    category_id: str,
    current_user: dict = Depends(require_permission("products.edit")),
    db: AsyncSession = Depends(get_async_db)
):
    business_id = current_user["business_id"]

    result = await db.execute(
        select(Category).where(
            Category.category_id == category_id,
            Category.business_id == business_id,
            Category.is_deleted  == False
        )
    )
    category = result.scalar_one_or_none()

    if not category:
        return error_response("Category not found", 404)

    # Step 1 — Count active products that will be deactivated
    affected_count_row = (await db.execute(
        text("""
            SELECT COUNT(*) AS cnt
            FROM products
            WHERE category_id = CAST(:cid AS uuid)
              AND business_id  = CAST(:bid AS uuid)
              AND is_deleted   = false
        """),
        {"cid": category_id, "bid": business_id}
    )).fetchone()

    affected_count = int(affected_count_row.cnt) if affected_count_row else 0

    # Step 2 — Soft-delete all active products under this category
    await db.execute(
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
    # updated_by is auto-set by DB trigger trg_categories_updated_by
    category.is_deleted = True
    await db.commit()

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
