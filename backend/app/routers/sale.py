from fastapi import APIRouter, Depends, Query
from fastapi import Body
from pydantic import BaseModel, field_validator
from typing import Optional
from sqlalchemy.orm import Session
from sqlalchemy import text
from decimal import Decimal
from app.database import get_db
from app.middleware.rbac import require_permission
from app.models.sale import Sale
from app.models.sale_item import SaleItem
from app.models.product import Product
from app.schemas.sale import SaleCreate
from app.routers.stock import cleanup_product_alerts
from app.utils.response import success_response, error_response
from app.utils.pagination import paginate, pagination_response
from app.services.sale_service import (
    generate_invoice_number,
    validate_and_cache_products,
    calculate_total_amount,
    create_sale_header,
    handle_stock_overrides,
    insert_sale_items,
    update_sale_tax_totals,
    auto_record_payment,
    parse_sale_error,
    get_sales_list,
    get_sale_detail,
    get_sale_final_amount,
    get_sale_active_payment,
    update_sale_status,
    update_payment_status,
)
from app.utils.payment_helpers import record_payment_and_sync, calculate_payment_status
from app.utils.currency import get_currency_symbol
from app.utils.usage_limits import check_create_allowed, fetch_subscription_type
import uuid

router = APIRouter(prefix="/v1/sales", tags=["Sales"])


class SaleStatusUpdate(BaseModel):
    status: str
    paid_amount: Optional[Decimal] = None

    @field_validator("paid_amount")
    @classmethod
    def paid_amount_must_be_positive(cls, v):
        if v is not None and v <= 0:
            raise ValueError("Paid amount must be greater than zero")
        return v


@router.post("/")
def create_sale(
    data: SaleCreate,
    current_user: dict = Depends(require_permission("sales.create")),
    db: Session = Depends(get_db)
):
    business_id = current_user["business_id"]
    user_id = current_user["user_id"]

    # ── Subscription tier limit check ─────────────────────────────────────────
    sub_type = fetch_subscription_type(db, business_id)
    allowed, msg = check_create_allowed(
        db, business_id, sub_type, "max_sales_per_month",
        "sales", date_column="sales_created_at"
    )
    if not allowed:
        return error_response(msg, status_code=403)

    try:
        product_cache, override_items, stock_errors = validate_and_cache_products(
            db, business_id, data.items, data.allow_stock_override
        )

        if product_cache is None:
            return error_response(f"Product '{stock_errors[0]['product_id']}' not found or does not belong to your business", 404)

        if stock_errors:
            return error_response(
                "Insufficient stock for one or more items",
                400,
                extensions={
                    "error_code": "INSUFFICIENT_STOCK",
                    "stock_errors": stock_errors,
                }
            )

        total_amount = calculate_total_amount(data.items)
        discount = (
            data.sales_discount
            if (data.sales_discount is not None and data.sales_discount > 0)
            else Decimal("0")
        )
        invoice_no = generate_invoice_number(db, business_id)
        new_sale_id = str(uuid.uuid4())

        create_sale_header(db, business_id, user_id, new_sale_id, invoice_no, data, total_amount, discount)

        if override_items:
            handle_stock_overrides(db, business_id, user_id, new_sale_id, override_items)

        insert_sale_items(db, business_id, new_sale_id, data.items, product_cache)
        update_sale_tax_totals(db, new_sale_id)
        auto_record_payment(db, business_id, new_sale_id, data, total_amount)

        db.commit()

        return success_response({
            "message": "Sale created successfully",
            "invoice_no": invoice_no,
            "sales_id": new_sale_id,
            "total_amount": str(total_amount),
        }, 201)

    except Exception as e:
        db.rollback()
        return error_response(parse_sale_error(str(e)), 500)


@router.get("/")
def get_sales(
    current_user: dict = Depends(require_permission("sales.view")),
    db: Session = Depends(get_db),
    pagination: dict = Depends(paginate),
    search: str = Query(None),
    status: str = Query(None),
    date_from: str = Query(None),
    date_to: str = Query(None),
    sort_by: Optional[str] = Query(default="sales_created_at", description="Column to sort by"),
    sort_dir: Optional[str] = Query(default="desc", description="asc or desc"),
):
    result, total = get_sales_list(
        db, current_user["business_id"], pagination,
        search, status, date_from, date_to, sort_by, sort_dir
    )
    return success_response(
        pagination_response(result, total, pagination["page"], pagination["limit"], capped=pagination["_capped"])
    )


@router.get("/summary")
def get_sales_summary(
    current_user: dict = Depends(require_permission("sales.view")),
    db: Session = Depends(get_db)
):
    business_id = current_user["business_id"]
    perms = current_user.get("permissions", set())
    can_financial = "dashboard.financial" in perms

    row = db.execute(text("""
        SELECT
            COALESCE(SUM(s.sales_final_amount) FILTER (WHERE s.sales_created_at::date = CURRENT_DATE), 0) AS today_revenue,
            COALESCE(SUM(s.sales_final_amount) FILTER (WHERE s.sales_created_at >= CURRENT_DATE - INTERVAL '7 days'), 0) AS weekly_revenue,
            COALESCE(SUM(s.sales_final_amount) FILTER (WHERE date_trunc('month', s.sales_created_at) = date_trunc('month', CURRENT_DATE)), 0) AS monthly_revenue,
            COALESCE(SUM(s.sales_final_amount - COALESCE(p.cumulative_paid, 0)), 0) AS outstanding_receivables
        FROM sales s
        LEFT JOIN payments p
            ON p.sale_id = s.sales_id
           AND p.business_id = s.business_id
           AND p.is_active = true
        WHERE s.business_id = CAST(:bid AS uuid)
          AND s.is_deleted = false
    """), {"bid": business_id}).fetchone()

    return success_response({
        "today_revenue": float(row.today_revenue) if can_financial else None,
        "weekly_revenue": float(row.weekly_revenue) if can_financial else None,
        "monthly_revenue": float(row.monthly_revenue) if can_financial else None,
        "outstanding_receivables": float(row.outstanding_receivables) if can_financial else None,
    })


@router.get("/{sales_id}")
def get_sale(
    sales_id: str,
    current_user: dict = Depends(require_permission("sales.view")),
    db: Session = Depends(get_db)
):
    sale = get_sale_detail(db, current_user["business_id"], sales_id)
    if not sale:
        return error_response("Sale not found", 404)
    return success_response(sale)


@router.patch("/{sales_id}/status")
def handle_sale_status_patch(
    sales_id: str,
    body: SaleStatusUpdate,
    current_user: dict = Depends(require_permission("sales.edit")),
    db: Session = Depends(get_db)
):
    allowed = ["pending", "paid", "partial"]
    if body.status not in allowed:
        return error_response(f"Status must be one of: {allowed}", 400)

    business_id = current_user["business_id"]

    sale = db.query(Sale).filter(
        Sale.sales_id == sales_id,
        Sale.business_id == business_id,
        Sale.is_deleted == False
    ).first()

    if not sale:
        return error_response("Sale not found", 404)

    # Resolve currency symbol from the business's country code
    biz = db.execute(
        text("SELECT business_country_code FROM businesses WHERE business_id = CAST(:bid AS uuid)"),
        {"bid": business_id}
    ).fetchone()
    currency_sym = get_currency_symbol(biz.business_country_code if biz else None)

    old_status = sale.sales_payment_status
    sale_final = get_sale_final_amount(db, sales_id, business_id)
    already_paid = get_sale_active_payment(db, sales_id, business_id)
    remaining = round(sale_final - already_paid, 2)

    if old_status == body.status and body.paid_amount is None:
        return success_response({"message": f"Sale is already '{body.status}'", "status": body.status})

    reconciliation_inserted = False
    response_note = None
    new_total_paid = already_paid
    new_remaining = remaining

    if body.paid_amount is not None:
        paid_input = float(body.paid_amount)
        if paid_input <= 0:
            return error_response("Paid amount must be greater than zero", 400)
        if paid_input > remaining:
            return error_response(
                f"Payment of {paid_input} exceeds the remaining balance of "
                f"{remaining}. Please enter {remaining} or less.",
                400
            )

        total_paid = round(already_paid + paid_input, 2)
        derived_status = calculate_payment_status(total_paid, sale_final)

        record_payment_and_sync(
            db=db,
            business_id=current_user["business_id"],
            sale_id=sales_id,
            sale_final=sale_final,
            payment_amount=paid_input,
            payment_method="adjustment" if already_paid > 0 else (sale.sales_payment_method or "cash"),
            new_status=derived_status,
            cumulative_paid=total_paid,
        )
        reconciliation_inserted = True
        new_total_paid = total_paid
        new_remaining = round(sale_final - total_paid, 2)
        if new_remaining < 0:
            new_remaining = 0
        response_note = f"Payment recorded: {currency_sym}{paid_input}. Total paid: {currency_sym}{total_paid}."

    elif body.status == "paid" and old_status != "paid":
        if remaining > 0:
            record_payment_and_sync(
                db=db,
                business_id=current_user["business_id"],
                sale_id=sales_id,
                sale_final=sale_final,
                payment_amount=remaining,
                payment_method="adjustment",
                new_status="paid",
                cumulative_paid=round(already_paid + remaining, 2),
            )
            reconciliation_inserted = True
            new_total_paid = round(already_paid + remaining, 2)
            new_remaining = 0
            response_note = (
                "A reconciliation payment row was automatically created "
                "in the payments table to record the remaining balance as an adjustment."
            )
        else:
            update_payment_status(db, sales_id, "paid", business_id)
            update_sale_status(db, sales_id, "paid", business_id)
            new_total_paid = already_paid
            new_remaining = 0

    elif body.status == "partial" and body.paid_amount is None:
        return error_response(
            "Paid amount is required when setting payment status to 'partial'. "
            "Please provide the amount received.",
            400
        )

    else:
        update_sale_status(db, sales_id, body.status, business_id)
        update_payment_status(db, sales_id, body.status, business_id)

    db.commit()

    response_data = {
        "message": "Payment status updated",
        "status": body.status,
        "total_paid": new_total_paid,
        "remaining_balance": new_remaining,
    }
    if response_note:
        response_data["note"] = response_note

    return success_response(response_data)


@router.delete("/{sales_id}")
def delete_sale(
    sales_id: str,
    restore_stock: bool = Query(False),
    current_user: dict = Depends(require_permission("sales.delete")),
    db: Session = Depends(get_db)
):
    business_id = current_user["business_id"]
    user_id = current_user["user_id"]

    sale = db.query(Sale).filter(
        Sale.sales_id == sales_id,
        Sale.business_id == business_id,
        Sale.is_deleted == False
    ).first()

    if not sale:
        return error_response("Sale not found", 404)

    sale.is_deleted = True
    sale.updated_by = user_id

    # Deactivate all payment rows so they no longer appear in active payments
    db.execute(
        text("""
            UPDATE payments
            SET is_active = false
            WHERE sale_id = CAST(:sid AS uuid)
              AND business_id = CAST(:bid AS uuid)
        """),
        {"sid": sales_id, "bid": business_id}
    )

    if restore_stock:
        sale_items = db.query(SaleItem).filter(
            SaleItem.sale_id == sales_id,
            SaleItem.business_id == business_id
        ).all()

        for item in sale_items:
            product = db.query(Product).filter(
                Product.prod_id == item.product_id,
                Product.business_id == business_id
            ).first()

            if not product:
                continue

            prev_stock = product.prod_stock_qty
            restore_qty = item.sale_item_quantity

            db.execute(
                text("""
                    UPDATE products
                    SET prod_stock_qty = prod_stock_qty + :restore_qty,
                        updated_by = CAST(:user_id AS uuid)
                    WHERE prod_id = CAST(:prod_id AS uuid)
                      AND business_id = CAST(:business_id AS uuid)
                """),
                {
                    "restore_qty": restore_qty,
                    "user_id": user_id,
                    "prod_id": str(item.product_id),
                    "business_id": business_id,
                }
            )

            new_move_id = str(uuid.uuid4())
            db.execute(
                text("""
                    INSERT INTO stock_movements (
                        move_id, business_id, product_id,
                        move_type, move_qty, move_prev_stock,
                        sale_reference_id, move_notes, move_created_by
                    ) VALUES (
                        CAST(:move_id AS uuid),
                        CAST(:business_id AS uuid),
                        CAST(:product_id AS uuid),
                        :move_type, :move_qty,
                        :move_prev_stock,
                        CAST(:sale_ref AS uuid),
                        :move_notes,
                        CAST(:created_by AS uuid)
                    )
                """),
                {
                    "move_id": new_move_id,
                    "business_id": business_id,
                    "product_id": str(item.product_id),
                    "move_type": "return",
                    "move_qty": restore_qty,
                    "move_prev_stock": prev_stock,
                    "sale_ref": sales_id,
                    "move_notes": f"Stock restored from deleted sale {sale.invoice_no}",
                    "created_by": user_id,
                }
            )

            cleanup_product_alerts(db, business_id, str(item.product_id))

    db.commit()

    return success_response({"message": "Sale deleted successfully"})
