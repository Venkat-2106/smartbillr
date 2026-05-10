from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func, text
from app.database import get_db
from app.middleware.auth import verify_token
from app.models.stock import StockMovement, LowStockAlert
from app.models.product import Product
from app.schemas.stock import StockAdjustment
from app.utils.response import success_response, error_response
from app.utils.pagination import paginate, pagination_response
import uuid

router = APIRouter(prefix="/stock", tags=["Stock"])


# ─────────────────────────────────────────
# HELPER: Format movement as dict
# ─────────────────────────────────────────
def movement_to_dict(m):
    return {
        "move_id": str(m.move_id),
        "business_id": str(m.business_id),
        "product_id": str(m.product_id),
        "move_type": m.move_type,
        "move_qty": m.move_qty,
        "move_prev_stock": m.move_prev_stock,
        "move_new_stock": m.move_new_stock,
        "sale_reference_id": str(m.sale_reference_id) if m.sale_reference_id else None,
        "purchase_reference_id": str(m.purchase_reference_id) if m.purchase_reference_id else None,
        "move_notes": m.move_notes,
        "move_created_at": str(m.move_created_at) if m.move_created_at else None,
        "move_created_by": str(m.move_created_by) if m.move_created_by else None
    }


# ─────────────────────────────────────────
# HELPER: Format alert as dict
# ─────────────────────────────────────────
def alert_to_dict(a):
    return {
        "alert_id": str(a.alert_id),
        "business_id": str(a.business_id),
        "product_id": str(a.product_id),
        "alert_stock_qty": a.alert_stock_qty,
        "alert_threshold": a.alert_threshold,
        "alert_status": a.alert_status,
        "alert_created_at": str(a.alert_created_at) if a.alert_created_at else None
    }


# ─────────────────────────────────────────
# GET /stock/movements → All stock movements
# ─────────────────────────────────────────
@router.get("/movements")
def get_all_movements(
    current_user: dict = Depends(verify_token),
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
    current_user: dict = Depends(verify_token),
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
    current_user: dict = Depends(verify_token),
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

    data = []
    for p in products:
        data.append({
            "prod_id": str(p.prod_id),
            "prod_name": p.prod_name,
            "prod_stock_qty": p.prod_stock_qty,
            "prod_low_stock_alert": p.prod_low_stock_alert,
            "unit": p.unit,
            # is_low_stock → true if stock is at or below threshold
            "is_low_stock": p.prod_stock_qty <= p.prod_low_stock_alert
        })

    return success_response(
        pagination_response(data, total, pagination["page"], pagination["limit"])
    )


# ─────────────────────────────────────────
# POST /stock/adjust → Manual stock adjustment
# ─────────────────────────────────────────
@router.post("/adjust")
def adjust_stock(
    data: StockAdjustment,
    current_user: dict = Depends(verify_token),
    db: Session = Depends(get_db)
):
    business_id = current_user["business_id"]
    user_id = current_user["user_id"]

    try:
        # Step 1 → Validate product exists
        product = db.query(Product).filter(
            Product.prod_id == data.product_id,
            Product.business_id == business_id,
            Product.is_deleted == False
        ).first()

        if not product:
            return error_response("Product not found", status_code=404)

        prev_stock = product.prod_stock_qty
        new_stock = prev_stock + data.move_qty

        # Step 2 → Block negative stock
        if new_stock < 0:
            return error_response(
                f"Adjustment would result in negative stock. Current stock: {prev_stock}",
                status_code=400
            )

        # Step 3 → Update product stock
        db.execute(
            text("""
                UPDATE products
                SET prod_stock_qty = :new_stock,
                    updated_at = now()
                WHERE prod_id = CAST(:prod_id AS uuid)
                AND business_id = CAST(:business_id AS uuid)
            """),
            {
                "new_stock": new_stock,
                "prod_id": str(data.product_id),
                "business_id": business_id
            }
        )

        # Step 4 → Manually insert stock movement
        # We insert manually here because this is an adjustment
        # not a sale or purchase trigger
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
                "move_id": new_move_id,
                "business_id": business_id,
                "product_id": str(data.product_id),
                "move_type": "adjustment",
                "move_qty": data.move_qty,
                "move_prev_stock": prev_stock,
                "move_notes": data.move_notes or "Manual stock adjustment",
                "move_created_by": user_id
            }
        )

        db.commit()

        return success_response({
            "message": "Stock adjusted successfully",
            "product_id": str(data.product_id),
            "previous_stock": prev_stock,
            "adjustment": data.move_qty,
            "new_stock": new_stock
        })

    except Exception as e:
        db.rollback()
        return error_response(str(e), status_code=500)


# ─────────────────────────────────────────
# GET /stock/alerts → Low stock alerts
# ─────────────────────────────────────────
@router.get("/alerts")
def get_low_stock_alerts(
    current_user: dict = Depends(verify_token),
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
    current_user: dict = Depends(verify_token),
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
        return error_response("Alert already marked as read", status_code=400)

    alert.alert_status = "read"
    db.commit()

    return success_response({
        "message": "Alert marked as read",
        "alert_id": alert_id
    })