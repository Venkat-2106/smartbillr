from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, text
from app.database import get_db
from app.middleware.rbac import require_permission
from app.models.product import Product
from app.models.category import Category
from app.schemas.product import ProductCreate, ProductUpdate
from app.utils.response import success_response, error_response
from app.utils.pagination import paginate, pagination_response
from sqlalchemy.exc import IntegrityError
from typing import Optional

router = APIRouter(prefix="/products", tags=["Products"])


# ── Helper: fetch full product including generated prod_profit ──
# Also joins categories to get category_name and profiles for last_updated_by
def get_product_with_profit(db: Session, prod_id):
    row = db.execute(
        text("""
            SELECT
                p.prod_id, p.business_id, p.category_id, p.prod_name,
                p.prod_sell_price, p.prod_cost_price, p.prod_profit,
                p.prod_stock_qty, p.prod_low_stock_alert, p.tax_rate,
                p.tax_code, p.barcode, p.unit, p.is_deleted,
                p.prod_created_at, p.updated_at,
                p.updated_by,
                c.category_name,
                pr.full_name AS last_updated_by
            FROM products p
            LEFT JOIN categories c ON c.category_id = p.category_id
            LEFT JOIN profiles  pr ON pr.id = p.updated_by
            WHERE p.prod_id = :prod_id
        """),
        {"prod_id": str(prod_id)}
    ).fetchone()
    return row


# ── Helper: format product row as dict ───────────────────────────────
def row_to_dict(row):
    return {
        "prod_id":              str(row.prod_id),
        "business_id":          str(row.business_id),
        "category_id":          str(row.category_id) if row.category_id else None,
        "category_name":        row.category_name if row.category_name else None,
        "prod_name":            row.prod_name,
        "prod_sell_price":      float(row.prod_sell_price),
        "prod_cost_price":      float(row.prod_cost_price),
        "prod_profit":          float(row.prod_profit) if row.prod_profit is not None else None,
        "prod_stock_qty":       row.prod_stock_qty,
        "prod_low_stock_alert": row.prod_low_stock_alert,
        "tax_rate":             float(row.tax_rate) if row.tax_rate is not None else 0,
        "tax_code":             row.tax_code,
        "barcode":              row.barcode,
        "unit":                 row.unit,
        "is_deleted":           row.is_deleted,
        "prod_created_at":      str(row.prod_created_at) if row.prod_created_at else None,
        "updated_at":           str(row.updated_at) if row.updated_at else None,
        "updated_by":           str(row.updated_by) if row.updated_by else None,
        "last_updated_by":      row.last_updated_by if row.last_updated_by else None,
    }


# ─────────────────────────────────────────
# POST /products → Create new product
# ─────────────────────────────────────────
@router.post("/")
def create_product(
    data: ProductCreate,
    current_user: dict = Depends(require_permission("products.edit")),
    db: Session = Depends(get_db)
):
    business_id = current_user["business_id"]

    # Validate category belongs to this business
    if data.category_id:
        category = db.query(Category).filter(
            Category.category_id == data.category_id,
            Category.business_id == business_id,
            Category.is_deleted == False
        ).first()
        if not category:
            return error_response("Category not found", 404)

    new_product = Product(
        business_id=business_id,
        category_id=data.category_id,
        prod_name=data.prod_name,
        prod_sell_price=data.prod_sell_price,
        prod_cost_price=data.prod_cost_price,
        prod_stock_qty=data.prod_stock_qty,
        prod_low_stock_alert=data.prod_low_stock_alert,
        tax_rate=data.tax_rate,
        tax_code=data.tax_code,
        barcode=data.barcode,
        unit=data.unit,
        # updated_by is NULL on create — only set when the product is later edited
    )

    try:
        db.add(new_product)
        db.commit()
    except IntegrityError:
        db.rollback()
        return error_response("A product with this barcode already exists", 400)

    row = get_product_with_profit(db, new_product.prod_id)

    return success_response({
        "message": "Product created successfully",
        "product": row_to_dict(row)
    }, 201)


# ─────────────────────────────────────────
# GET /products → Get all products
# ─────────────────────────────────────────
# Now joins categories for category_name and profiles for last_updated_by
@router.get("/")
def get_all_products(
    current_user: dict          = Depends(require_permission("products.view")),
    db:           Session       = Depends(get_db),
    pagination:   dict          = Depends(paginate),
    search:       Optional[str] = Query(default=None, description="Search by name or barcode")
):
    business_id = current_user["business_id"]

    # Server-side search — ILIKE on name and barcode
    search_sql = ""
    params = {
        "business_id": business_id,
        "offset": pagination["offset"],
        "limit":  pagination["limit"]
    }
    if search and search.strip():
        search_sql = "AND (p.prod_name ILIKE :search OR p.barcode ILIKE :search)"
        params["search"] = f"%{search.strip()}%"

    total = db.execute(
        text(f"""
            SELECT COUNT(*)
            FROM products p
            WHERE p.business_id = CAST(:business_id AS uuid)
              AND p.is_deleted = false
              {search_sql}
        """),
        params
    ).scalar()

    rows = db.execute(
        text(f"""
            SELECT
                p.prod_id, p.business_id, p.category_id, p.prod_name,
                p.prod_sell_price, p.prod_cost_price, p.prod_profit,
                p.prod_stock_qty, p.prod_low_stock_alert, p.tax_rate,
                p.tax_code, p.barcode, p.unit, p.is_deleted,
                p.prod_created_at, p.updated_at, p.updated_by,
                c.category_name,
                pr.full_name AS last_updated_by
            FROM products p
            LEFT JOIN categories c  ON c.category_id = p.category_id
            LEFT JOIN profiles  pr  ON pr.id = p.updated_by
            WHERE p.business_id = CAST(:business_id AS uuid)
              AND p.is_deleted   = false
              {search_sql}
            ORDER BY p.prod_name ASC
            OFFSET :offset LIMIT :limit
        """),
        params
    ).fetchall()

    return success_response(
        pagination_response(
            [row_to_dict(r) for r in rows],
            total,
            pagination["page"],
            pagination["limit"]
        )
    )


# ══════════════════════════════════════════════════════════════════
# GET /products/{prod_id} → Get one product WITH full history
# ══════════════════════════════════════════════════════════════════
@router.get("/{prod_id}")
def get_product(
    prod_id: str,
    current_user: dict = Depends(require_permission("products.view")),
    db: Session = Depends(get_db)
):
    business_id = current_user["business_id"]

    # ── Step 1: Fetch core product details ───────────────────────────────────
    row = db.execute(
        text("""
            SELECT
                p.prod_id, p.business_id, p.category_id, p.prod_name,
                p.prod_sell_price, p.prod_cost_price, p.prod_profit,
                p.prod_stock_qty, p.prod_low_stock_alert, p.tax_rate,
                p.tax_code, p.barcode, p.unit, p.is_deleted,
                p.prod_created_at, p.updated_at,
                p.updated_by,
                c.category_name,
                pr.full_name AS last_updated_by
            FROM products p
            LEFT JOIN categories c  ON c.category_id = p.category_id
            LEFT JOIN profiles  pr  ON pr.id = p.updated_by
            WHERE p.prod_id     = CAST(:prod_id AS uuid)
              AND p.business_id = CAST(:bid AS uuid)
              AND p.is_deleted  = false
        """),
        {"prod_id": prod_id, "bid": business_id}
    ).fetchone()

    if not row:
        return error_response("Product not found", status_code=404)

    # ── Step 2: Fetch stock movement history ─────────────────────────────────
    stock_rows = db.execute(
        text("""
            SELECT
                sm.move_id,
                sm.move_type,
                sm.move_qty,
                sm.move_prev_stock,
                sm.move_new_stock,
                sm.reference_type,
                sm.reference_id,
                sm.sale_reference_id,
                sm.purchase_reference_id,
                sm.move_notes,
                sm.move_created_at,
                COALESCE(p.full_name, 'System') AS changed_by
            FROM stock_movements sm
            LEFT JOIN profiles p ON p.id = sm.move_created_by
            WHERE sm.product_id  = CAST(:prod_id AS uuid)
              AND sm.business_id = CAST(:bid AS uuid)
            ORDER BY sm.move_created_at DESC
        """),
        {"prod_id": prod_id, "bid": business_id}
    ).fetchall()

    stock_history = []
    for s in stock_rows:
        if s.move_qty > 0:
            direction = "in"
        elif s.move_qty < 0:
            direction = "out"
        else:
            direction = "none"

        type_label_map = {
            "sale":             "Sold to customer",
            "purchase":         "Received from supplier",
            "adjustment":       "Manual stock adjustment",
            "sales_return":     "Customer return — stock added back",
            "purchase_return":  "Returned to supplier — stock removed",
        }
        event_label = type_label_map.get(s.move_type, s.move_type)

        stock_history.append({
            "move_id":               str(s.move_id),
            "event":                 event_label,
            "move_type":             s.move_type,
            "direction":             direction,
            "qty_changed":           abs(s.move_qty),
            "stock_before":          s.move_prev_stock,
            "stock_after":           s.move_new_stock,
            "reference_type":        s.reference_type,
            "reference_id":          str(s.reference_id) if s.reference_id else None,
            "sale_reference_id":     str(s.sale_reference_id) if s.sale_reference_id else None,
            "purchase_reference_id": str(s.purchase_reference_id) if s.purchase_reference_id else None,
            "notes":                 s.move_notes,
            "changed_by":            s.changed_by,
            "changed_at":            str(s.move_created_at) if s.move_created_at else None
        })

    # ── Step 3: Fetch price change history from audit_logs ───────────────────
    audit_rows = db.execute(
        text("""
            SELECT
                al.audit_id,
                al.action_type,
                al.old_data,
                al.new_data,
                al.created_at,
                COALESCE(p.full_name, 'System') AS changed_by
            FROM audit_logs al
            LEFT JOIN profiles p ON p.id = al.user_id
            WHERE al.table_name  = 'products'
              AND al.record_id   = CAST(:prod_id AS uuid)
              AND al.business_id = CAST(:bid AS uuid)
              AND al.action_type = 'update'
            ORDER BY al.created_at DESC
        """),
        {"prod_id": prod_id, "bid": business_id}
    ).fetchall()

    price_history = []
    for a in audit_rows:
        old_data = a.old_data or {}
        new_data = a.new_data or {}

        old_sell = old_data.get("prod_sell_price")
        new_sell = new_data.get("prod_sell_price")
        old_cost = old_data.get("prod_cost_price")
        new_cost = new_data.get("prod_cost_price")

        def to_float(v):
            try:
                return float(v) if v is not None else None
            except (TypeError, ValueError):
                return None

        old_sell = to_float(old_sell)
        new_sell = to_float(new_sell)
        old_cost = to_float(old_cost)
        new_cost = to_float(new_cost)

        sell_changed = old_sell is not None and new_sell is not None and old_sell != new_sell
        cost_changed = old_cost is not None and new_cost is not None and old_cost != new_cost

        if not sell_changed and not cost_changed:
            continue

        changes = []
        if sell_changed:
            changes.append({
                "field":     "prod_sell_price",
                "label":     "Selling Price",
                "old_value": old_sell,
                "new_value": new_sell,
                "difference": round(new_sell - old_sell, 2)
            })
        if cost_changed:
            changes.append({
                "field":     "prod_cost_price",
                "label":     "Cost Price",
                "old_value": old_cost,
                "new_value": new_cost,
                "difference": round(new_cost - old_cost, 2)
            })

        price_history.append({
            "audit_id":   str(a.audit_id),
            "changes":    changes,
            "changed_by": a.changed_by,
            "changed_at": str(a.created_at) if a.created_at else None
        })

    # ── Step 4: Build summary stats ──────────────────────────────────────────
    total_sold     = sum(abs(s["qty_changed"]) for s in stock_history if s["move_type"] == "sale")
    total_received = sum(s["qty_changed"] for s in stock_history if s["move_type"] == "purchase")
    total_returned = sum(s["qty_changed"] for s in stock_history if s["move_type"] == "sales_return")
    price_changes_count = len(price_history)

    # ── Step 5: Compose final response ──────────────────────────────────────
    return success_response({
        **row_to_dict(row),

        "history_summary": {
            "total_units_sold":     total_sold,
            "total_units_received": total_received,
            "total_units_returned": total_returned,
            "price_change_count":   price_changes_count,
            "stock_event_count":    len(stock_history)
        },

        "stock_history": stock_history,
        "price_history": price_history
    })


# ─────────────────────────────────────────
# PUT /products/{prod_id} → Update product
# ─────────────────────────────────────────
# NEW: sets updated_by = current_user["user_id"] so we can track who last edited
@router.put("/{prod_id}")
def update_product(
    prod_id: str,
    data: ProductUpdate,
    current_user: dict = Depends(require_permission("products.edit")),
    db: Session = Depends(get_db)
):
    business_id = current_user["business_id"]

    product = db.query(Product).filter(
        Product.prod_id      == prod_id,
        Product.business_id  == business_id,
        Product.is_deleted   == False
    ).first()

    if not product:
        return error_response("Product not found", status_code=404)

    # Validate category if being updated
    if data.category_id:
        category = db.query(Category).filter(
            Category.category_id == data.category_id,
            Category.business_id == business_id,
            Category.is_deleted  == False
        ).first()
        if not category:
            return error_response("Category not found", status_code=404)
        product.category_id = data.category_id

    if data.prod_name            is not None: product.prod_name            = data.prod_name
    if data.prod_sell_price      is not None: product.prod_sell_price      = data.prod_sell_price
    if data.prod_cost_price      is not None: product.prod_cost_price      = data.prod_cost_price
    if data.prod_low_stock_alert is not None: product.prod_low_stock_alert = data.prod_low_stock_alert
    if data.tax_rate             is not None: product.tax_rate             = data.tax_rate
    if data.tax_code             is not None: product.tax_code             = data.tax_code
    if data.barcode              is not None: product.barcode              = data.barcode
    if data.unit                 is not None: product.unit                 = data.unit

    # NEW: track who last updated this product
    product.updated_by = current_user["user_id"]

    db.commit()
    db.refresh(product)

    row = get_product_with_profit(db, product.prod_id)

    return success_response({
        "message": "Product updated successfully",
        "product": row_to_dict(row)
    })


# ─────────────────────────────────────────
# DELETE /products/{prod_id} → Soft delete
# ─────────────────────────────────────────
@router.delete("/{prod_id}")
def delete_product(
    prod_id: str,
    current_user: dict = Depends(require_permission("products.edit")),
    db: Session = Depends(get_db)
):
    business_id = current_user["business_id"]

    product = db.query(Product).filter(
        Product.prod_id     == prod_id,
        Product.business_id == business_id,
        Product.is_deleted  == False
    ).first()

    if not product:
        return error_response("Product not found", status_code=404)

    product.is_deleted = True
    db.commit()

    return success_response({"message": "Product deleted successfully"})
