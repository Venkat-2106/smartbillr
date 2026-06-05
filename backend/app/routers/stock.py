from fastapi import APIRouter, Depends
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
    current_user: dict = Depends(require_permission("stock.view")),
    db: Session = Depends(get_db),
    pagination: dict = Depends(paginate)
):
    business_id = current_user["business_id"]

    total = db.query(func.count(StockMovement.move_id)).filter(
        StockMovement.business_id == business_id
    ).scalar()

    movements = db.query(StockMovement).filter(
        StockMovement.business_id == business_id
    ).order_by(StockMovement.move_created_at.desc())\
     .offset(pagination["offset"]).limit(pagination["limit"]).all()

    return success_response(
        pagination_response(
            [movement_to_dict(m) for m in movements],
            total,
            pagination["page"],
            pagination["limit"]
        )
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
# ─────────────────────────────────────────
@router.get("/current")
def get_current_stock(
    current_user: dict = Depends(require_permission("stock.view")),
    db: Session = Depends(get_db),
    pagination: dict = Depends(paginate)
):
    business_id = current_user["business_id"]

    total = db.query(func.count(Product.prod_id)).filter(
        Product.business_id == business_id,
        Product.is_deleted == False
    ).scalar()

    products = db.query(Product).filter(
        Product.business_id == business_id,
        Product.is_deleted == False
    ).offset(pagination["offset"]).limit(pagination["limit"]).all()

    data = [
        {
            "prod_id":             str(p.prod_id),
            "prod_name":           p.prod_name,
            "prod_stock_qty":      p.prod_stock_qty,
            "prod_low_stock_alert": p.prod_low_stock_alert,
            "unit":                p.unit,
            "is_low_stock":        p.prod_stock_qty <= p.prod_low_stock_alert
        }
        for p in products
    ]

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
        db.execute(
            text("""
                UPDATE products
                SET prod_stock_qty = :new_stock,
                    updated_at = now()
                WHERE prod_id = CAST(:prod_id AS uuid)
                  AND business_id = CAST(:business_id AS uuid)
            """),
            {
                "new_stock":    new_stock,
                "prod_id":      str(data.product_id),
                "business_id":  business_id
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
# ─────────────────────────────────────────
@router.get("/alerts")
def get_low_stock_alerts(
    current_user: dict = Depends(require_permission("stock.view")),
    db: Session = Depends(get_db),
    pagination: dict = Depends(paginate)
):
    business_id = current_user["business_id"]

    total = db.query(func.count(LowStockAlert.alert_id)).filter(
        LowStockAlert.business_id == business_id
    ).scalar()

    alerts = db.query(LowStockAlert).filter(
        LowStockAlert.business_id == business_id
    ).order_by(LowStockAlert.alert_created_at.desc())\
     .offset(pagination["offset"]).limit(pagination["limit"]).all()

    return success_response(
        pagination_response(
            [alert_to_dict(a) for a in alerts],
            total,
            pagination["page"],
            pagination["limit"]
        )
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