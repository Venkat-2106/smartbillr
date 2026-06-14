from fastapi import APIRouter, Depends, Query
from typing import Optional
from sqlalchemy.orm import Session
from sqlalchemy import func, text
from app.database import get_db
from app.middleware.rbac import require_permission
from app.models.stock import StockMovement, LowStockAlert
from app.models.product import Product
from app.schemas.stock import StockAdjustment
from app.utils.response import success_response, error_response
from app.utils.pagination import paginate, pagination_response
from app.utils.timestamp import fmt_ts
import uuid

router = APIRouter(prefix="/stock", tags=["Stock"])

# Mirrors PROFIT_PERMISSION in product.py — gates prod_cost_price / stock value
PROFIT_PERMISSION = "view_product_profit"


# ─────────────────────────────────────────
# HELPER: Format movement as dict
# ─────────────────────────────────────────
def movement_to_dict(m):
    return {
        "move_id":               str(m.move_id),
        "business_id":           str(m.business_id),
        "product_id":            str(m.product_id),
        "move_type":             m.move_type,
        "move_qty":              m.move_qty,
        "move_prev_stock":       m.move_prev_stock,
        "move_new_stock":        m.move_new_stock,
        "sale_reference_id":     str(m.sale_reference_id) if m.sale_reference_id else None,
        "purchase_reference_id": str(m.purchase_reference_id) if m.purchase_reference_id else None,
        "reference_type":        m.reference_type,
        "reference_id":          str(m.reference_id) if m.reference_id else None,
        "move_notes":            m.move_notes,
        "move_created_at":       fmt_ts(m.move_created_at),
        "move_created_by":       str(m.move_created_by) if m.move_created_by else None
    }


# ─────────────────────────────────────────
# HELPER: Format alert as dict
# ─────────────────────────────────────────
def alert_to_dict(a):
    return {
        "alert_id":        str(a.alert_id),
        "business_id":     str(a.business_id),
        "product_id":      str(a.product_id),
        "alert_stock_qty": a.alert_stock_qty,
        "alert_threshold": a.alert_threshold,
        "alert_status":    a.alert_status,
        "alert_created_at": fmt_ts(a.alert_created_at)
    }


# ─────────────────────────────────────────
# GET /stock/movements → All stock movements
# ─────────────────────────────────────────
@router.get("/movements")
def get_all_movements(
current_user: dict          = Depends(require_permission("stock.view")),
db:           Session       = Depends(get_db),
pagination:   dict          = Depends(paginate),
search:       Optional[str] = Query(default=None, description="Search by product name"),
move_type:    Optional[str] = Query(default=None, description="sale | purchase | adjustment | return"),
date_from:    Optional[str] = Query(default=None, description="ISO datetime — move_created_at >="),
date_to:      Optional[str] = Query(default=None, description="ISO datetime — move_created_at <="),
sort_by:      Optional[str] = Query(default="move_created_at"),
sort_dir:     Optional[str] = Query(default="desc"),
):
    business_id = current_user["business_id"]

    # ── Sort whitelist (prevents SQL injection) — same pattern as all other routers ──
    SORTABLE = {
        "move_created_at": "sm.move_created_at",
        "prod_name":       "p.prod_name",
        "move_type":       "sm.move_type",
        "move_qty":        "sm.move_qty",
    }
    order_col = SORTABLE.get(sort_by, "sm.move_created_at")
    order_dir = "DESC" if str(sort_dir).lower() == "desc" else "ASC"

    # ── Build dynamic WHERE clauses ───────────────────────────────────────────
    extra_where = ""
    params = {
        "business_id": business_id,
        "offset":      pagination["offset"],
        "limit":       pagination["limit"],
    }

    if search and search.strip():
        extra_where += " AND p.prod_name ILIKE :search"
        params["search"] = f"%{search.strip()}%"

    if move_type and move_type.strip():
        extra_where += " AND sm.move_type = :move_type"
        params["move_type"] = move_type.strip()

    if date_from and date_from.strip():
        extra_where += " AND sm.move_created_at >= :date_from"
        params["date_from"] = date_from.strip()

    if date_to and date_to.strip():
        extra_where += " AND sm.move_created_at <= :date_to"
        params["date_to"] = date_to.strip()

    # ── COUNT query ───────────────────────────────────────────────────────────
    total = db.execute(
        text(f"""
            SELECT COUNT(*)
            FROM stock_movements sm
            LEFT JOIN products  p   ON p.prod_id = sm.product_id
            LEFT JOIN sales     s   ON s.sales_id = sm.sale_reference_id
            LEFT JOIN purchases pur ON pur.pur_id = sm.purchase_reference_id
            WHERE sm.business_id = CAST(:business_id AS uuid)
            {extra_where}
        """),
        params
    ).scalar()

    # ── Data query — raw SQL with JOINs so prod_name + invoice refs are available in one trip ──
    rows = db.execute(
        text(f"""
            SELECT
                sm.move_id, sm.business_id, sm.product_id,
                sm.move_type, sm.move_qty,
                sm.move_prev_stock, sm.move_new_stock,
                sm.sale_reference_id, sm.purchase_reference_id,
                sm.reference_type, sm.reference_id,
                sm.move_notes, sm.move_created_at, sm.move_created_by,
                p.prod_name,
                s.invoice_no AS sale_invoice_no,
                pur.pur_id   AS pur_reference_id
            FROM stock_movements sm
            LEFT JOIN products  p   ON p.prod_id = sm.product_id
            LEFT JOIN sales     s   ON s.sales_id = sm.sale_reference_id
            LEFT JOIN purchases pur ON pur.pur_id = sm.purchase_reference_id
            WHERE sm.business_id = CAST(:business_id AS uuid)
            {extra_where}
            ORDER BY {order_col} {order_dir}
            OFFSET :offset LIMIT :limit
        """),
        params
    ).fetchall()

    data = []
    for r in rows:
        data.append({
            "move_id":               str(r.move_id),
            "business_id":           str(r.business_id),
            "product_id":            str(r.product_id),
            "prod_name":             r.prod_name,          # now resolved via JOIN
            "move_type":             r.move_type,
            "move_qty":              r.move_qty,
            "move_prev_stock":       r.move_prev_stock,
            "move_new_stock":        r.move_new_stock,
            "sale_reference_id":     str(r.sale_reference_id)     if r.sale_reference_id     else None,
            "purchase_reference_id": str(r.purchase_reference_id) if r.purchase_reference_id else None,
            "reference_type":        r.reference_type,
            "reference_id":          str(r.reference_id) if r.reference_id else None,
            "sale_invoice_no":       r.sale_invoice_no,
            "purchase_reference_no": str(r.pur_reference_id) if r.pur_reference_id else None,
            "move_notes":            r.move_notes,
            "move_created_at":       fmt_ts(r.move_created_at),
            "move_created_by":       str(r.move_created_by) if r.move_created_by else None,
        })

    return success_response(
        pagination_response(data, total, pagination["page"], pagination["limit"])
    )


# ─────────────────────────────────────────
# GET /stock/movements/{move_id} → One movement
# ─────────────────────────────────────────
@router.get("/movements/{move_id}")
def get_movement(
    move_id: str,
    current_user: dict = Depends(require_permission("stock.view")),
    db: Session = Depends(get_db)
):
    business_id = current_user["business_id"]

    movement = db.query(StockMovement).filter(
        StockMovement.move_id == move_id,
        StockMovement.business_id == business_id
    ).first()

    if not movement:
        return error_response("Stock movement not found", status_code=404)

    return success_response(movement_to_dict(movement))


# ─────────────────────────────────────────
# GET /stock/current → Current stock of all products
#
# Reuses the same patterns as GET /products/ (products.py):
#   - paginate() dependency for server-side pagination
#   - search ILIKE on prod_name / barcode (same indexes as products.view)
#   - category filter (category_id)
#   - status filter: in_stock | low_stock | out_of_stock
#     (derived from prod_stock_qty vs prod_low_stock_alert — no hardcoded values)
#   - is_active filter maps to is_deleted = false/true
#   - SORTABLE whitelist (same style as product.py / purchase.py)
#   - LEFT JOIN categories for category_name (same as products list)
#   - prod_cost_price / stock_value gated by view_product_profit, mirroring
#     row_to_dict(show_profit=...) in product.py
# ─────────────────────────────────────────
@router.get("/current")
def get_current_stock(
    current_user: dict          = Depends(require_permission("stock.view")),
    db:           Session       = Depends(get_db),
    pagination:   dict          = Depends(paginate),
    search:       Optional[str] = Query(default=None, description="Search by product name, SKU, or barcode"),
    category_id:  Optional[str] = Query(default=None, description="Filter by category_id"),
    status:       Optional[str] = Query(default=None, description="in_stock | low_stock | out_of_stock"),
    is_active:    Optional[str] = Query(default=None, description="true | false — maps to is_deleted"),
    sort_by:      Optional[str] = Query(default="prod_name", description="Column to sort by"),
    sort_dir:     Optional[str] = Query(default="asc",  description="asc or desc"),
):
    business_id = current_user["business_id"]
    show_profit = PROFIT_PERMISSION in current_user.get("permissions", set())

    # ── Whitelist sort column (prevents SQL injection) — mirrors product.py ──
    SORTABLE = {
        "prod_name":            "p.prod_name",
        "barcode":              "p.barcode",
        "category_name":        "c.category_name",
        "unit":                 "p.unit",
        "prod_stock_qty":       "p.prod_stock_qty",
        "prod_low_stock_alert": "p.prod_low_stock_alert",
        "prod_cost_price":      "p.prod_cost_price",
        "prod_sell_price":      "p.prod_sell_price",
        "stock_value":          "stock_value",
        "updated_at":           "p.updated_at",
    }
    order_col = SORTABLE.get(sort_by, "p.prod_name")
    order_dir = "DESC" if str(sort_dir).lower() == "desc" else "ASC"

    # ── Build dynamic WHERE clauses ───────────────────────────────────────────
    extra_where = ""
    params = {
        "business_id": business_id,
        "offset":      pagination["offset"],
        "limit":       pagination["limit"],
    }

    # is_active: default to active (is_deleted = false) unless explicitly
    # requested otherwise — mirrors product.py default of is_deleted = false.
    if is_active is not None and is_active.strip().lower() == "false":
        extra_where += " AND p.is_deleted = true"
    else:
        extra_where += " AND p.is_deleted = false"

    if search and search.strip():
        extra_where += " AND (p.prod_name ILIKE :search OR p.barcode ILIKE :search)"
        params["search"] = f"%{search.strip()}%"

    if category_id and category_id.strip():
        extra_where += " AND p.category_id = CAST(:category_id AS uuid)"
        params["category_id"] = category_id.strip()

    # Stock status filter — derived from existing product settings
    # (prod_stock_qty vs prod_low_stock_alert), not hardcoded thresholds.
    if status and status.strip():
        s = status.strip().lower()
        if s == "out_of_stock":
            extra_where += " AND p.prod_stock_qty = 0"
        elif s == "low_stock":
            extra_where += " AND p.prod_stock_qty > 0 AND p.prod_stock_qty <= p.prod_low_stock_alert"
        elif s == "in_stock":
            extra_where += " AND p.prod_stock_qty > p.prod_low_stock_alert"

    # ── COUNT query — same WHERE clauses as data query ────────────────────────
    total = db.execute(
        text(f"""
            SELECT COUNT(*)
            FROM products p
            LEFT JOIN categories c ON c.category_id = p.category_id
            WHERE p.business_id = CAST(:business_id AS uuid)
              {extra_where}
        """),
        params
    ).scalar()

    # ── Data query ─────────────────────────────────────────────────────────────
    # stock_value = prod_stock_qty * prod_cost_price (matches existing
    # inventory valuation logic — same fields used everywhere else).
    rows = db.execute(
        text(f"""
            SELECT
                p.prod_id, p.prod_name, p.barcode, p.unit,
                p.prod_stock_qty, p.prod_low_stock_alert,
                p.prod_cost_price, p.prod_sell_price,
                (p.prod_stock_qty * p.prod_cost_price) AS stock_value,
                p.is_deleted, p.updated_at,
                c.category_name
            FROM products p
            LEFT JOIN categories c ON c.category_id = p.category_id
            WHERE p.business_id = CAST(:business_id AS uuid)
              {extra_where}
            ORDER BY {order_col} {order_dir}
            OFFSET :offset LIMIT :limit
        """),
        params
    ).fetchall()

    data = []
    for r in rows:
        qty   = r.prod_stock_qty
        alert = r.prod_low_stock_alert

        if qty == 0:
            stock_status = "out_of_stock"
        elif qty <= alert:
            stock_status = "low_stock"
        else:
            stock_status = "in_stock"

        data.append({
            "prod_id":             str(r.prod_id),
            "prod_name":           r.prod_name,
            "barcode":             r.barcode,
            "category_name":       r.category_name,
            "unit":                r.unit,
            "prod_stock_qty":      r.prod_stock_qty,
            "prod_low_stock_alert": r.prod_low_stock_alert,
            "available_stock":     r.prod_stock_qty,
            "prod_sell_price":     float(r.prod_sell_price) if r.prod_sell_price is not None else None,
            "prod_cost_price":     float(r.prod_cost_price) if (show_profit and r.prod_cost_price is not None) else None,
            "stock_value":         float(r.stock_value) if (show_profit and r.stock_value is not None) else None,
            "stock_status":        stock_status,
            "is_active":           not r.is_deleted,
            "updated_at":          fmt_ts(r.updated_at),
        })

    return success_response(
        pagination_response(data, total, pagination["page"], pagination["limit"])
    )


# ─────────────────────────────────────────
# POST /stock/adjust → Manual stock adjustment
#
# FIX 5 — Professional adjustment_type design:
#
# Instead of asking the user to type negative numbers (-5 to remove),
# we now accept:
#   adjustment_type: "add" | "remove" | "set"
#   qty: always a positive integer
#
# "add"    → stock goes UP by qty       (received goods, returned items)
# "remove" → stock goes DOWN by qty     (damaged, expired, lost)
# "set"    → stock is FIXED to qty      (physical count correction)
#
# The stock_movements log always records move_qty as:
#   positive → for add/set-increase (stock went up)
#   negative → for remove/set-decrease (stock went down)
# This lets reports show net stock change easily.
# ─────────────────────────────────────────
@router.post("/adjust")
def adjust_stock(
    data: StockAdjustment,
    current_user: dict = Depends(require_permission("stock.adjust")),
    db: Session = Depends(get_db)
):
    business_id = current_user["business_id"]
    user_id = current_user["user_id"]

    try:
        product = db.query(Product).filter(
            Product.prod_id == data.product_id,
            Product.business_id == business_id,
            Product.is_deleted == False
        ).first()

        if not product:
            return error_response("Product not found", status_code=404)

        prev_stock = product.prod_stock_qty

        # ── Calculate new_stock and move_qty based on adjustment_type ───────
        if data.adjustment_type == "add":
            # Adding goods: stock increases by qty
            new_stock = prev_stock + data.qty
            move_qty  = data.qty          # positive: stock went up

        elif data.adjustment_type == "remove":
            # Removing goods: stock decreases by qty
            if data.qty > prev_stock:
                return error_response(
                    f"Cannot remove {data.qty} units — "
                    f"current stock is only {prev_stock} units for '{product.prod_name}'",
                    status_code=400
                )
            new_stock = prev_stock - data.qty
            move_qty  = -data.qty         # negative: stock went down

        else:  # "set"
            # Physical count override: set stock to exact value
            new_stock = data.qty
            move_qty  = data.qty - prev_stock  # could be positive or negative

            # "set" to 0 is valid (e.g., all stock expired), but alert user
            if new_stock == prev_stock:
                return error_response(
                    f"Stock is already {prev_stock} units. No change needed.",
                    status_code=400
                )

        # ── Update product stock ─────────────────────────────────────────────
        # updated_by → set here, consistent with PUT /products/{prod_id} pattern.
        # updated_at → intentionally omitted; fn_set_updated_at trigger handles it.
        db.execute(
            text("""
                UPDATE products
                SET prod_stock_qty = :new_stock,
                    updated_by     = CAST(:user_id AS uuid)
                WHERE prod_id = CAST(:prod_id AS uuid)
                  AND business_id = CAST(:business_id AS uuid)
            """),
            {
                "new_stock":   new_stock,
                "user_id":     user_id,
                "prod_id":     str(data.product_id),
                "business_id": business_id
            }
        )

        # ── Insert stock movement log ────────────────────────────────────────
        # We do NOT include move_new_stock in the INSERT.
        # Check your DB: if move_new_stock is a generated column
        # (GENERATED ALWAYS AS move_prev_stock + move_qty), the DB fills it.
        # If it is a plain column, the DB trigger fills it. Either way,
        # never insert it manually — this avoids the GeneratedAlways error.
        new_move_id = str(uuid.uuid4())
        db.execute(
            text("""
                INSERT INTO stock_movements (
                    move_id, business_id, product_id,
                    move_type, move_qty,
                    move_prev_stock,
                    move_notes, move_created_by
                ) VALUES (
                    CAST(:move_id AS uuid),
                    CAST(:business_id AS uuid),
                    CAST(:product_id AS uuid),
                    :move_type, :move_qty,
                    :move_prev_stock,
                    :move_notes,
                    CAST(:move_created_by AS uuid)
                )
            """),
            {
                "move_id":       new_move_id,
                "business_id":   business_id,
                "product_id":    str(data.product_id),
                "move_type":     "adjustment",
                "move_qty":      move_qty,
                "move_prev_stock": prev_stock,
                "move_notes":    data.move_notes or f"Manual {data.adjustment_type} adjustment",
                "move_created_by": user_id
            }
        )

        db.commit()

        return success_response({
            "message":         f"Stock '{data.adjustment_type}' applied successfully",
            "product_id":      str(data.product_id),
            "product_name":    product.prod_name,
            "adjustment_type": data.adjustment_type,
            "previous_stock":  prev_stock,
            "adjusted_by":     data.qty,
            "new_stock":       new_stock
        })

    except Exception as e:
        db.rollback()
        return error_response(str(e), status_code=500)


# ─────────────────────────────────────────
# GET /stock/alerts → Low stock alerts
#
# FIX — duplicate entries:
# The low_stock_alerts table appends a new row every time stock drops below
# the threshold, so one product can accumulate dozens of alert rows.
# The old ORM query returned all of them, causing duplicate display.
#
# Fix: DISTINCT ON (product_id) keeps only the LATEST alert per product.
# Also adds a LEFT JOIN to products so prod_name is available in the response
# (previously missing, showing only product_id in the UI).
# ─────────────────────────────────────────
@router.get("/alerts")
def get_low_stock_alerts(
    current_user: dict = Depends(require_permission("stock.view")),
    db: Session = Depends(get_db),
    pagination: dict = Depends(paginate)
):
    business_id = current_user["business_id"]
    params = {
        "business_id": business_id,
        "offset":      pagination["offset"],
        "limit":       pagination["limit"],
    }

    # COUNT — count distinct products with active alerts, not raw alert rows
    total = db.execute(
        text("""
            SELECT COUNT(*) FROM (
                SELECT DISTINCT ON (la.product_id) la.alert_id
                FROM low_stock_alerts la
                WHERE la.business_id = CAST(:business_id AS uuid)
            ) sub
        """),
        params
    ).scalar()

    # DATA — one row per product (latest alert), joined to products for name
    rows = db.execute(
        text("""
            SELECT DISTINCT ON (la.product_id)
                la.alert_id, la.business_id, la.product_id,
                la.alert_stock_qty, la.alert_threshold,
                la.alert_status, la.alert_created_at,
                p.prod_name, p.barcode, p.unit
            FROM low_stock_alerts la
            LEFT JOIN products p ON p.prod_id = la.product_id
            WHERE la.business_id = CAST(:business_id AS uuid)
            ORDER BY la.product_id, la.alert_created_at DESC
            OFFSET :offset LIMIT :limit
        """),
        params
    ).fetchall()

    data = []
    for r in rows:
        data.append({
            "alert_id":        str(r.alert_id),
            "business_id":     str(r.business_id),
            "product_id":      str(r.product_id),
            "prod_name":       r.prod_name,
            "barcode":         r.barcode,
            "unit":            r.unit,
            "alert_stock_qty": r.alert_stock_qty,
            "alert_threshold": r.alert_threshold,
            "alert_status":    r.alert_status,
            "alert_created_at": fmt_ts(r.alert_created_at),
        })

    return success_response(
        pagination_response(data, total, pagination["page"], pagination["limit"])
    )


# ─────────────────────────────────────────
# PUT /stock/alerts/{alert_id}/read → Mark alert as read
# ─────────────────────────────────────────
@router.put("/alerts/{alert_id}/read")
def mark_alert_read(
    alert_id: str,
    current_user: dict = Depends(require_permission("stock.view")),
    db: Session = Depends(get_db)
):
    business_id = current_user["business_id"]

    alert = db.query(LowStockAlert).filter(
        LowStockAlert.alert_id == alert_id,
        LowStockAlert.business_id == business_id
    ).first()

    if not alert:
        return error_response("Alert not found", status_code=404)

    if alert.alert_status == "read":
        return error_response("Alert is already marked as read", status_code=400)

    alert.alert_status = "read"
    db.commit()

    return success_response({
        "message":  "Alert marked as read",
        "alert_id": alert_id
    })