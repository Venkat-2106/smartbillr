from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func, text
from app.database import get_db
from app.middleware.auth import verify_token
from app.models.product import Product
from app.models.category import Category
from app.schemas.product import ProductCreate, ProductUpdate
from app.utils.response import success_response, error_response
from app.utils.pagination import paginate, pagination_response
from sqlalchemy.exc import IntegrityError

router = APIRouter(prefix="/products", tags=["Products"])


# ── Helper: fetch full product including generated prod_profit ──
def get_product_with_profit(db: Session, prod_id):
    row = db.execute(
        text("""
            SELECT prod_id, business_id, category_id, prod_name,
                   prod_sell_price, prod_cost_price, prod_profit,
                   prod_stock_qty, prod_low_stock_alert, tax_rate,
                   tax_code, barcode, unit, is_deleted,
                   prod_created_at, updated_at
            FROM products
            WHERE prod_id = :prod_id
        """),
        {"prod_id": str(prod_id)}
    ).fetchone()
    return row


# ── Helper: format product row as dict ───────────────────────────────
def row_to_dict(row):
    return {
        "prod_id":            str(row.prod_id),
        "business_id":        str(row.business_id),
        "category_id":        str(row.category_id) if row.category_id else None,
        "prod_name":          row.prod_name,
        "prod_sell_price":    float(row.prod_sell_price),
        "prod_cost_price":    float(row.prod_cost_price),
        "prod_profit":        float(row.prod_profit) if row.prod_profit is not None else None,
        "prod_stock_qty":     row.prod_stock_qty,
        "prod_low_stock_alert": row.prod_low_stock_alert,
        "tax_rate":           float(row.tax_rate) if row.tax_rate is not None else 0,
        "tax_code":           row.tax_code,
        "barcode":            row.barcode,
        "unit":               row.unit,
        "is_deleted":         row.is_deleted,
        "prod_created_at":    str(row.prod_created_at) if row.prod_created_at else None,
        "updated_at":         str(row.updated_at) if row.updated_at else None
    }


# ─────────────────────────────────────────
# POST /products → Create new product
# ─────────────────────────────────────────
@router.post("/")
def create_product(
    data: ProductCreate,
    current_user: dict = Depends(verify_token),
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
        unit=data.unit
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
@router.get("/")
def get_all_products(
    current_user: dict = Depends(verify_token),
    db: Session = Depends(get_db),
    pagination: dict = Depends(paginate)
):
    business_id = current_user["business_id"]

    total = db.query(func.count(Product.prod_id)).filter(
        Product.business_id == business_id,
        Product.is_deleted == False
    ).scalar()

    rows = db.execute(
        text("""
            SELECT prod_id, business_id, category_id, prod_name,
                   prod_sell_price, prod_cost_price, prod_profit,
                   prod_stock_qty, prod_low_stock_alert, tax_rate,
                   tax_code, barcode, unit, is_deleted,
                   prod_created_at, updated_at
            FROM products
            WHERE business_id = :business_id
              AND is_deleted = false
            OFFSET :offset LIMIT :limit
        """),
        {
            "business_id": business_id,
            "offset": pagination["offset"],
            "limit":  pagination["limit"]
        }
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
#
# Returns two history sections alongside the product details:
#
# 1. stock_history → from stock_movements table
#    Every time this product's stock changed and WHY:
#    sale, purchase, adjustment, sales_return, purchase_return
#    Ordered latest first.
#    Shows: move_type, move_qty (+/-), stock before, stock after,
#           what caused it (reference_type + reference_id), notes, when
#
# 2. price_history → from audit_logs table
#    Every time prod_sell_price or prod_cost_price changed.
#    The audit_log trigger stores a full JSONB snapshot of old_data
#    and new_data on every UPDATE to the products table. We compare
#    those snapshots to extract only price-related changes.
#    Ordered latest first.
#    Shows: what changed (sell price / cost price / both),
#           old value, new value, who changed it, when
#
# WHY two separate sources:
#   Stock movements → have their own dedicated table with rich context
#                     (move_type tells you if it was a sale or purchase)
#   Price changes   → live inside audit_logs as JSON snapshots because
#                     products table has no price-history table
#                     The trigger already captures every UPDATE — we
#                     just filter for rows where price columns changed
# ══════════════════════════════════════════════════════════════════
@router.get("/{prod_id}")
def get_product(
    prod_id: str,
    current_user: dict = Depends(verify_token),
    db: Session = Depends(get_db)
):
    business_id = current_user["business_id"]

    # ── Step 1: Fetch core product details ───────────────────────────────────
    row = db.execute(
        text("""
            SELECT prod_id, business_id, category_id, prod_name,
                   prod_sell_price, prod_cost_price, prod_profit,
                   prod_stock_qty, prod_low_stock_alert, tax_rate,
                   tax_code, barcode, unit, is_deleted,
                   prod_created_at, updated_at
            FROM products
            WHERE prod_id    = CAST(:prod_id AS uuid)
              AND business_id = CAST(:bid AS uuid)
              AND is_deleted  = false
        """),
        {"prod_id": prod_id, "bid": business_id}
    ).fetchone()

    if not row:
        return error_response("Product not found", status_code=404)

    # ── Step 2: Fetch stock movement history ─────────────────────────────────
    # Every row in stock_movements for this product = one stock event.
    # move_qty is positive when stock went UP, negative when it went DOWN.
    # move_type tells you why it changed:
    #   "sale"             → sold to a customer       (stock DOWN)
    #   "purchase"         → received from supplier   (stock UP)
    #   "adjustment"       → manual correction        (UP or DOWN)
    #   "sales_return"     → customer returned goods  (stock UP)
    #   "purchase_return"  → returned to supplier     (stock DOWN)
    #
    # We also fetch the creator's full_name from profiles by joining.
    # If move_created_by is NULL (DB trigger row), we show "System".
    # ─────────────────────────────────────────────────────────────────────────
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
        # Determine the direction label for the frontend to display clearly
        if s.move_qty > 0:
            direction = "in"    # stock increased
        elif s.move_qty < 0:
            direction = "out"   # stock decreased
        else:
            direction = "none"  # no net change (e.g. set to same value)

        # Build a human-readable label for what caused this movement
        # so the frontend can show "Sold via invoice" instead of "sale"
        type_label_map = {
            "sale":             "Sold to customer",
            "purchase":         "Received from supplier",
            "adjustment":       "Manual stock adjustment",
            "sales_return":     "Customer return — stock added back",
            "purchase_return":  "Returned to supplier — stock removed",
        }
        event_label = type_label_map.get(s.move_type, s.move_type)

        stock_history.append({
            "move_id":              str(s.move_id),
            "event":                event_label,
            "move_type":            s.move_type,
            "direction":            direction,
            "qty_changed":          abs(s.move_qty),     # always positive for display
            "stock_before":         s.move_prev_stock,
            "stock_after":          s.move_new_stock,
            "reference_type":       s.reference_type,
            "reference_id":         str(s.reference_id) if s.reference_id else None,
            "sale_reference_id":    str(s.sale_reference_id) if s.sale_reference_id else None,
            "purchase_reference_id": str(s.purchase_reference_id) if s.purchase_reference_id else None,
            "notes":                s.move_notes,
            "changed_by":           s.changed_by,
            "changed_at":           str(s.move_created_at) if s.move_created_at else None
        })

    # ── Step 3: Fetch price change history from audit_logs ───────────────────
    # The audit trigger (fn_audit_log) fires on every UPDATE to the products
    # table and stores a full JSONB snapshot of old_data and new_data.
    #
    # We filter audit_logs for:
    #   table_name  = 'products'        → only product rows
    #   record_id   = this prod_id      → only this specific product
    #   action_type = 'update'          → only changes (not inserts/deletes)
    #
    # Then in Python we compare old_data vs new_data for the two price fields:
    #   prod_sell_price  → selling price (what the customer pays)
    #   prod_cost_price  → cost price (what you paid the supplier)
    #
    # WHY filter in Python not SQL:
    # PostgreSQL can filter JSONB with ->>, but comparing two JSONB fields
    # from the same row requires a subquery or lateral join which is complex.
    # Since audit rows per product are small, filtering in Python is clean
    # and readable — correctness over premature optimisation.
    # ─────────────────────────────────────────────────────────────────────────
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

        # Extract old and new values for each price field
        old_sell = old_data.get("prod_sell_price")
        new_sell = new_data.get("prod_sell_price")
        old_cost = old_data.get("prod_cost_price")
        new_cost = new_data.get("prod_cost_price")

        # Convert to float safely — JSONB stores numbers as strings sometimes
        def to_float(v):
            try:
                return float(v) if v is not None else None
            except (TypeError, ValueError):
                return None

        old_sell = to_float(old_sell)
        new_sell = to_float(new_sell)
        old_cost = to_float(old_cost)
        new_cost = to_float(new_cost)

        # Only include this audit row if a price actually changed
        # (audits fire on ALL updates — e.g. stock change, name change too)
        sell_changed = old_sell is not None and new_sell is not None and old_sell != new_sell
        cost_changed = old_cost is not None and new_cost is not None and old_cost != new_cost

        if not sell_changed and not cost_changed:
            continue  # skip this audit row — no price change happened

        # Build a list of what specifically changed in this audit event
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
    # Quick stats derived from the history so the frontend doesn't have to
    # calculate these itself from the raw arrays.
    # ─────────────────────────────────────────────────────────────────────────
    total_sold     = sum(abs(s["qty_changed"]) for s in stock_history if s["move_type"] == "sale")
    total_received = sum(s["qty_changed"] for s in stock_history if s["move_type"] == "purchase")
    total_returned = sum(s["qty_changed"] for s in stock_history if s["move_type"] == "sales_return")
    price_changes_count = len(price_history)

    # ── Step 5: Compose final response ──────────────────────────────────────
    return success_response({
        # Core product details (unchanged from before)
        **row_to_dict(row),

        # History summary — quick numbers at a glance
        "history_summary": {
            "total_units_sold":     total_sold,
            "total_units_received": total_received,
            "total_units_returned": total_returned,
            "price_change_count":   price_changes_count,
            "stock_event_count":    len(stock_history)
        },

        # Full stock movement log — every stock up/down event
        "stock_history": stock_history,

        # Full price change log — every sell/cost price edit
        "price_history": price_history
    })


# ─────────────────────────────────────────
# PUT /products/{prod_id} → Update product
# ─────────────────────────────────────────
@router.put("/{prod_id}")
def update_product(
    prod_id: str,
    data: ProductUpdate,
    current_user: dict = Depends(verify_token),
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

    if data.prod_name          is not None: product.prod_name          = data.prod_name
    if data.prod_sell_price    is not None: product.prod_sell_price    = data.prod_sell_price
    if data.prod_cost_price    is not None: product.prod_cost_price    = data.prod_cost_price
    if data.prod_low_stock_alert is not None: product.prod_low_stock_alert = data.prod_low_stock_alert
    if data.tax_rate           is not None: product.tax_rate           = data.tax_rate
    if data.tax_code           is not None: product.tax_code           = data.tax_code
    if data.barcode            is not None: product.barcode            = data.barcode
    if data.unit               is not None: product.unit               = data.unit

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
    current_user: dict = Depends(verify_token),
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