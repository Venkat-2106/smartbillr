# app/routers/purchase.py
#
# ── ASYNC MIGRATION NOTE (2026-07) ──────────────────────────────────────────
#
# This router was migrated from sync SQLAlchemy (psycopg2) to async
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
#
# ── PURCHASE FLOW ────────────────────────────────────────────────────────────
#
# create_purchase:
#   1. Validate subscription tier limit (max purchases/month).
#   2. Validate supplier (if provided) belongs to this business.
#   3. Bulk-validate all products exist and are active.
#   4. Calculate tax via centralized tax_engine (handles India GST rules).
#   5. Insert purchase header + items in one transaction.
#   6. Update prod_cost_price for each product (last-purchase-cost accounting).
#   7. Auto-create expense if pur_payment_status='paid' (race-safe via
#      INSERT ... WHERE NOT EXISTS + unique partial index).
#   8. Clean up stale low-stock alerts for restocked products.
#   9. Re-fetch full purchase + items for the response.
#
# update_purchase_status:
#   When manually marking as "paid", auto-inserts an expense record
#   (same INSERT ... WHERE NOT EXISTS pattern as create_purchase).
#
# delete_purchase:
#   Optional stock reduction via reduce_stock=true query param.
#   Uses bulk FROM (VALUES ...) UPDATE for multi-product stock changes
#   and batch INSERT into stock_movements.
# ─────────────────────────────────────────────────────────────────────────────

from fastapi import APIRouter, Depends, Query
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, text
from app.database import get_async_db
from app.middleware.rbac import require_permission, async_set_rls_gucs_after_commit
from app.models.purchase import Purchase
from app.schemas.purchase import PurchaseCreate
from app.utils.response import success_response, error_response
from app.utils.pagination import paginate_async, pagination_response
from app.utils.timestamp import fmt_ts
from app.utils.usage_limits import check_create_allowed_async, fetch_subscription_type_async
from app.utils.payment_helpers import record_purchase_payment_and_sync_async
from app.schemas.purchase import PurchasePaymentCreate
from app.services.purchase_service import (
    generate_purchase_number,
    fetch_full_purchase,
    fetch_purchase_items,
    purchase_row_to_dict,
    get_business_tax_context,
    validate_supplier,
    validate_and_cache_purchase_products,
    validate_purchase_products,
    insert_purchase_header,
    insert_purchase_items,
    update_product_cost_prices,
    auto_record_purchase_payment,
    clean_low_stock_alerts,
    get_purchases_list,
    get_purchase_summary,
    get_purchase_detail,
    update_purchase_status_paid,
    get_purchase_excess_refunded,
    delete_purchase_items_and_stock,
)
from datetime import datetime, timezone
import logging
from decimal import Decimal
import uuid
from pydantic import BaseModel


class PurchaseStatusUpdate(BaseModel):
    status: str


router = APIRouter(prefix="/v1/purchases", tags=["Purchases"])


# ─────────────────────────────────────────
# POST /purchases → Create new purchase
# ─────────────────────────────────────────
@router.post("/")
async def create_purchase(
    data: PurchaseCreate,
    current_user: dict = Depends(require_permission("purchases.create")),
    db: AsyncSession = Depends(get_async_db)
):
    business_id = current_user["business_id"]
    user_id     = current_user["user_id"]

    sub_type = current_user.get("subscription_type") or await fetch_subscription_type_async(db, business_id)
    allowed, msg = await check_create_allowed_async(
        db, business_id, sub_type, "max_purchases_per_month",
        "purchases", date_column="pur_created_at"
    )
    if not allowed:
        return error_response(msg, status_code=403)

    pur_invoice_no = await generate_purchase_number(db, business_id)

    try:
        biz_ctx = await get_business_tax_context(db, business_id)

        supplier, supp_country, supp_state = await validate_supplier(db, business_id, data.supp_id)
        if data.supp_id and supplier is None:
            return error_response("Supplier not found", status_code=404)

        product_cache = await validate_and_cache_purchase_products(db, business_id, data.items)

        calculated_items, err = validate_purchase_products(
            data.items, product_cache,
            biz_country_code    = biz_ctx["country_code"],
            biz_state           = biz_ctx["state"],
            biz_gst_registered  = biz_ctx["gst_registered"],
            supp_country_code   = supp_country,
            supp_state          = supp_state,
        )
        if err:
            return error_response(err, status_code=404)

        new_pur_id = str(uuid.uuid4())
        await insert_purchase_header(db, business_id, user_id, new_pur_id, pur_invoice_no, data, calculated_items)
        await insert_purchase_items(db, business_id, new_pur_id, calculated_items)
        await update_product_cost_prices(db, business_id, user_id, calculated_items)

        if data.pur_payment_status in ("paid", "partial"):
            pur_row      = await fetch_full_purchase(db, new_pur_id, business_id)
            final_amount = Decimal(str(pur_row.pur_final_amount)) if pur_row and pur_row.pur_final_amount else Decimal("0")
            supplier_label = supplier.supp_name if supplier else "Walk-in"

            pay_id, pay_err = await auto_record_purchase_payment(
                db, business_id, user_id, new_pur_id,
                final_amount, data.pur_payment_status, supplier_label,
                paid_amount = Decimal(str(data.paid_amount)) if data.pur_payment_status == "partial" else None,
            )
            if pay_err:
                return error_response(pay_err, status_code=400)

        await clean_low_stock_alerts(db, business_id, calculated_items)

        await db.commit()
        await async_set_rls_gucs_after_commit(db, current_user)

        pur_row   = await fetch_full_purchase(db, new_pur_id, business_id)
        item_rows = await fetch_purchase_items(db, new_pur_id, business_id)

        return success_response({
            "message":  "Purchase created successfully",
            "purchase": purchase_row_to_dict(pur_row, item_rows)
        }, status_code=201)

    except Exception as e:
        await db.rollback()
        logging.exception(e)
        return error_response("An unexpected error occurred. Please try again.", status_code=500)


# ─────────────────────────────────────────
# GET /purchases → Get all purchases (paginated, filtered, sorted)
# ─────────────────────────────────────────
@router.get("/")
async def get_all_purchases(
    current_user: dict       = Depends(require_permission("purchases.view")),
    db:           AsyncSession = Depends(get_async_db),
    pagination:   dict       = Depends(paginate_async),
    search:       Optional[str] = Query(default=None),
    status:       Optional[str] = Query(default=None),
    sort_by:      Optional[str] = Query(default="pur_created_at"),
    sort_dir:     Optional[str] = Query(default="desc"),
    date_from:    Optional[str] = Query(default=None),
    date_to:      Optional[str] = Query(default=None),
):
    result, total = await get_purchases_list(
        db, current_user["business_id"], pagination,
        search, status, sort_by, sort_dir, date_from, date_to,
    )
    return success_response(
        pagination_response(result, total, pagination["page"], pagination["limit"], capped=pagination["_capped"])
    )


# ─────────────────────────────────────────
# GET /purchases/summary → KPI summary
# ─────────────────────────────────────────
@router.get("/summary")
async def get_purchase_summary_kpi(
    current_user: dict = Depends(require_permission("purchases.view")),
    db: AsyncSession = Depends(get_async_db)
):
    data = await get_purchase_summary(db, current_user["business_id"])
    return success_response(data)


# ─────────────────────────────────────────
# GET /purchases/{pur_id} → Get one purchase
# ─────────────────────────────────────────
@router.get("/{pur_id}")
async def get_purchase(
    pur_id: str,
    current_user: dict = Depends(require_permission("purchases.view")),
    db: AsyncSession = Depends(get_async_db)
):
    data = await get_purchase_detail(db, current_user["business_id"], pur_id)
    if not data:
        return error_response("Purchase not found", status_code=404)
    return success_response(data)


# ─────────────────────────────────────────
# PATCH /purchases/{pur_id}/status → Update payment status
# ─────────────────────────────────────────
@router.patch("/{pur_id}/status")
async def update_purchase_status(
    pur_id: str,
    body: PurchaseStatusUpdate,
    current_user: dict = Depends(require_permission("purchases.edit")),
    db: AsyncSession = Depends(get_async_db)
):
    status  = body.status
    allowed = ["pending", "paid"]
    if status not in allowed:
        return error_response(f"Status must be one of: {allowed}", 400)

    if status == "partial":
        return error_response(
            "Use the record-payment endpoint to mark a purchase as partially paid.",
            400
        )

    business_id = current_user["business_id"]
    user_id     = current_user["user_id"]

    purchase = (await db.execute(select(Purchase).where(
        Purchase.pur_id      == pur_id,
        Purchase.business_id == business_id,
        Purchase.is_deleted  == False
    ))).scalar_one_or_none()

    if not purchase:
        return error_response("Purchase not found", 404)

    old_status = purchase.pur_payment_status
    purchase.pur_payment_status = status
    purchase.updated_by = user_id

    expense_created = False
    if status == "paid" and old_status != "paid":
        expense_created = await update_purchase_status_paid(db, business_id, user_id, pur_id)

    await db.commit()
    await async_set_rls_gucs_after_commit(db, current_user)

    response_data = {"message": "Purchase payment status updated", "status": status}
    if expense_created:
        response_data["note"] = (
            "An expense record was automatically created in the expenses table "
            "to reflect this purchase payment."
        )
    return success_response(response_data)


# ─────────────────────────────────────────
# DELETE /purchases/{pur_id} → Soft delete
# ─────────────────────────────────────────
@router.delete("/{pur_id}")
async def delete_purchase(
    pur_id: str,
    reduce_stock: bool = Query(False),
    confirmed: bool = Query(False, description="Set true to proceed after a supplier-refund warning was shown"),
    current_user: dict = Depends(require_permission("purchases.delete")),
    db: AsyncSession = Depends(get_async_db)
):
    business_id = current_user["business_id"]
    user_id     = current_user["user_id"]

    # ── Supplier refund warning check (DEL-PUR-REFUND-1) ────────────────
    # Mirrors DEL-SALE-REFUND-1 on the sales side. If an approved return
    # on this purchase generated a refund-credit expense (real money the
    # supplier already paid back), deleting the purchase must not
    # silently proceed — that credit will NOT be deleted along with the
    # purchase (by design; it documents real cash movement). First call
    # (confirmed=false) returns a 409 with the credit total; the frontend
    # re-calls with confirmed=true to actually proceed. Runs before the
    # reduce_stock branch so no writes happen if this returns early.
    if not confirmed:
        refund_row = (await db.execute(
            text("""
                SELECT COUNT(DISTINCT pr.return_id) AS return_count,
                       COALESCE(SUM(-e.expense_amount), 0) AS total_refund
                FROM purchase_returns pr
                LEFT JOIN expenses e
                       ON e.source_type = 'purchase_return'
                      AND e.source_id   = pr.return_id
                      AND e.is_deleted  = false
                WHERE pr.pur_id       = CAST(:pid AS uuid)
                  AND pr.business_id  = CAST(:bid AS uuid)
                  AND pr.return_status = 'approved'
            """),
            {"pid": pur_id, "bid": business_id}
        )).fetchone()

        total_refund = float(refund_row.total_refund or 0)
        if total_refund > 0:
            return error_response(
                f"This purchase has {refund_row.return_count} approved return(s) "
                f"with a total refund credit of {total_refund:.2f} already "
                f"received from the supplier and recorded as an expense credit. "
                f"Deleting the purchase will NOT delete the return or the credit "
                f"— they remain for accounting accuracy.",
                status_code=409,
                extensions={
                    "requires_confirmation": True,
                    "refund_amount": total_refund,
                    "return_count": refund_row.return_count,
                },
            )

    if reduce_stock:
        purchase, stock_warnings = await delete_purchase_items_and_stock(db, business_id, user_id, pur_id)
    else:
        purchase = (await db.execute(select(Purchase).where(
            Purchase.pur_id      == pur_id,
            Purchase.business_id == business_id,
            Purchase.is_deleted  == False
        ))).scalar_one_or_none()
        stock_warnings = []

    if not purchase:
        return error_response("Purchase not found", status_code=404)

    purchase.is_deleted = True
    purchase.updated_by = user_id

    await db.execute(
        text("""
            UPDATE purchase_payments
            SET is_active = false
            WHERE pur_id      = CAST(:pur_id AS uuid)
              AND business_id = CAST(:business_id AS uuid)
        """),
        {"pur_id": pur_id, "business_id": business_id}
    )

    await db.execute(
        text("""
            UPDATE expenses
            SET is_deleted = true
            WHERE business_id = CAST(:business_id AS uuid)
              AND source_type  = 'purchase_payment'
              AND source_id IN (
                  SELECT payment_id FROM purchase_payments
                  WHERE pur_id      = CAST(:pur_id AS uuid)
                    AND business_id = CAST(:business_id AS uuid)
              )
        """),
        {"pur_id": pur_id, "business_id": business_id}
    )

    await db.commit()
    await async_set_rls_gucs_after_commit(db, current_user)

    return success_response({
        "message": "Purchase deleted successfully",
        "warnings": stock_warnings,
    })


# ─────────────────────────────────────────
# POST /purchases/{pur_id}/payments → Record a purchase payment
# ─────────────────────────────────────────
@router.post("/{pur_id}/payments")
async def create_purchase_payment(
    pur_id: str,
    data: PurchasePaymentCreate,
    current_user: dict = Depends(require_permission("purchases.edit")),
    db: AsyncSession = Depends(get_async_db)
):
    business_id = current_user["business_id"]
    user_id     = current_user["user_id"]

    purchase = (await db.execute(select(Purchase).where(
        Purchase.pur_id      == pur_id,
        Purchase.business_id == business_id,
        Purchase.is_deleted  == False
    ))).scalar_one_or_none()

    if not purchase:
        return error_response("Purchase not found", 404)

    pur_final = Decimal(str(purchase.pur_final_amount)) if purchase.pur_final_amount else Decimal("0")

    await db.execute(
        text("SELECT 1 FROM purchases WHERE pur_id = CAST(:pid AS uuid) AND business_id = CAST(:bid AS uuid) FOR UPDATE"),
        {"pid": pur_id, "bid": business_id}
    )

    active_row = (await db.execute(
        text("""
            SELECT COALESCE(cumulative_paid, 0) AS already_paid
            FROM purchase_payments
            WHERE pur_id      = CAST(:pid AS uuid)
              AND business_id = CAST(:bid AS uuid)
              AND is_active   = true
            FOR UPDATE
        """),
        {"pid": pur_id, "bid": business_id}
    )).fetchone()
    already_paid = Decimal(str(active_row.already_paid)) if active_row else Decimal("0")

    # Refund-aware remaining, mirroring get_purchase_detail: already_paid
    # (purchase_payments.cumulative_paid) already includes every approved
    # return's covered-by-reducing-due adjustment payment. Only the EXCESS
    # refund — money the supplier actually owes back (the portion beyond what
    # the covered adjustments reduced) — still reduces the payable. Subtracting
    # the gross return amount would double-count the covered portion
    # (FIX-PR-1); total_refunded here is the same figure the purchase detail
    # reports as data.total_refunded.
    total_refunded = await get_purchase_excess_refunded(db, pur_id, business_id)

    new_payment = data.payment_amount
    total_after = already_paid + new_payment

    remaining_balance = (pur_final - already_paid - total_refunded).quantize(Decimal("0.01"))

    if remaining_balance <= 0:
        return error_response(
            "This purchase is already fully paid. No further payments needed.",
            status_code=400
        )

    if new_payment > remaining_balance:
        return error_response(
            f"Payment of {new_payment} exceeds the remaining balance of "
            f"{remaining_balance}. Please enter {remaining_balance} or less.",
            status_code=400
        )

    from app.utils.payment_helpers import calculate_payment_status
    new_status = calculate_payment_status(total_after, pur_final)

    try:
        new_payment_id = await record_purchase_payment_and_sync_async(
            db              = db,
            business_id     = business_id,
            pur_id          = pur_id,
            payment_amount  = new_payment,
            payment_method  = data.payment_method or "cash",
            new_status      = new_status,
            cumulative_paid = total_after.quantize(Decimal("0.01"))
        )

        supplier_label = "Walk-in"
        pur_row = await fetch_full_purchase(db, pur_id, business_id)
        if pur_row and pur_row.supp_name:
            supplier_label = pur_row.supp_name

        (await db.execute(
            text("""
                INSERT INTO expenses (
                    expense_id, business_id, expense_category,
                    expense_amount, expense_notes, created_by,
                    source_type, source_id
                ) VALUES (
                    CAST(:expense_id AS uuid),
                    CAST(:business_id AS uuid),
                    :expense_category,
                    :expense_amount,
                    :expense_notes,
                    CAST(:created_by AS uuid),
                    :source_type,
                    CAST(:source_id AS uuid)
                )
            """),
            {
                "expense_id":       str(uuid.uuid4()),
                "business_id":      business_id,
                "expense_category": "purchase",
                "expense_amount":   str(new_payment.quantize(Decimal("0.01"))),
                "expense_notes":    f"Purchase from {supplier_label} — {datetime.now(timezone.utc).strftime('%d %b %Y')}",
                "created_by":       user_id,
                "source_type":      "purchase_payment",
                "source_id":        new_payment_id
            }
        ))

        await db.commit()
        await async_set_rls_gucs_after_commit(db, current_user)
    except Exception:
        await db.rollback()
        logging.exception("create_purchase_payment failed")
        return error_response("Failed to record payment. Please try again.", status_code=500)

    new_remaining = (pur_final - total_after - total_refunded).quantize(Decimal("0.01"))

    return success_response({
        "message":           "Payment recorded successfully",
        "payment_status":    new_status,
        "this_payment":      float(new_payment.quantize(Decimal("0.01"))),
        "total_paid":        float(total_after.quantize(Decimal("0.01"))),
        "remaining_balance": float(new_remaining) if new_remaining > 0 else 0,
        "payment": {
            "payment_id":      new_payment_id,
            "business_id":     business_id,
            "pur_id":          pur_id,
            "payment_amount":  float(new_payment.quantize(Decimal("0.01"))),
            "cumulative_paid": float(total_after.quantize(Decimal("0.01"))),
            "payment_method":  data.payment_method or "cash",
            "payment_status":  new_status,
            "is_active":       True,
            "payment_paid_at": fmt_ts(datetime.now(timezone.utc))
        }
    }, status_code=201)