# app/routers/sale.py
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
#   - Heavy business logic lives in app/services/sale_service.py (async).
#     This router handles HTTP concerns only — validation, auth, response
#     formatting.  The service layer owns DB queries, stock movements,
#     payment auto-recording, and tax calculations.
#
# ── CONCURRENCY NOTES ────────────────────────────────────────────────────────
#
# create_sale:
#   Uses a DB transaction to atomically insert the sale header, items,
#   stock movements, and payment record.  Invoice numbers are generated
#   via a sequence (gapless under normal load, but not gap-proof under
#   high concurrency — acceptable for this SaaS tier).
#
# handle_sale_status_patch:
#   Uses FOR UPDATE on the sale row to serialize concurrent status
#   changes.  The payment sync helper (record_payment_and_sync_async)
#   also locks the active payment row to prevent double-recording.
#
# delete_sale:
#   Soft-deletes the sale and optionally restores stock.  Stock restore
#   uses bulk FROM (VALUES ...) UPDATE for efficiency.
# ─────────────────────────────────────────────────────────────────────────────

from fastapi import APIRouter, Depends, Query, File, UploadFile
from fastapi import Body
from pydantic import BaseModel, field_validator
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, text
from decimal import Decimal
from app.database import get_async_db
from app.middleware.rbac import require_permission, async_set_rls_gucs_after_commit
from app.models.sale import Sale
from app.models.sale_item import SaleItem
from app.schemas.sale import SaleCreate
from app.utils.response import success_response, error_response
from app.utils.pagination import paginate_async, pagination_response
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
from app.utils.payment_helpers import record_payment_and_sync_async, calculate_payment_status
from app.utils.currency import get_currency_symbol
from app.utils.usage_limits import check_create_allowed_async, fetch_subscription_type_async
from app.utils.bulk_import import parse_csv_file, validate_rows, check_bulk_create_allowed, chunk_list
from app.schemas.validators import strip_and_escape_html
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
async def create_sale(
    data: SaleCreate,
    current_user: dict = Depends(require_permission("sales.create")),
    db: AsyncSession = Depends(get_async_db)
):
    business_id = current_user["business_id"]
    user_id = current_user["user_id"]

    # ── Subscription tier limit check ─────────────────────────────────────────
    sub_type = current_user.get("subscription_type") or await fetch_subscription_type_async(db, business_id)
    allowed, msg = await check_create_allowed_async(
        db, business_id, sub_type, "max_sales_per_month",
        "sales", date_column="sales_created_at"
    )
    if not allowed:
        return error_response(msg, status_code=403)

    try:
        product_cache, override_items, stock_errors = await validate_and_cache_products(
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
        invoice_no = await generate_invoice_number(db, business_id)
        new_sale_id = str(uuid.uuid4())

        await create_sale_header(db, business_id, user_id, new_sale_id, invoice_no, data, total_amount, discount)

        if override_items:
            await handle_stock_overrides(db, business_id, user_id, new_sale_id, override_items)

        await insert_sale_items(db, business_id, new_sale_id, data.items, product_cache)
        final_amount = await update_sale_tax_totals(db, new_sale_id)
        await auto_record_payment(db, business_id, new_sale_id, data, final_amount)

        await db.commit()
        # RLS: SET LOCAL/set_config GUCs are transaction-scoped and are cleared
        # by this commit. Re-set them in case any future code adds a query after
        # this point (matches the convention in product.py, purchase.py, expense.py).
        await async_set_rls_gucs_after_commit(db, current_user)

        return success_response({
            "message": "Sale created successfully",
            "invoice_no": invoice_no,
            "sales_id": new_sale_id,
            "total_amount": str(total_amount),
        }, 201)

    except Exception as e:
        await db.rollback()
        return error_response(parse_sale_error(str(e)), 500)


# ══════════════════════════════════════════════════════════════════
# POST /sales/import → Bulk import sales from CSV
#
# Each CSV row creates a single-item sale. Customer and product are
# resolved by phone/name and name/barcode respectively.
# Tax calculation is handled by DB triggers (fn_sale_stock_movement).
# Invoice numbers are generated via the business_counters sequence.
# ══════════════════════════════════════════════════════════════════
@router.post("/import")
async def import_sales(
    file: UploadFile = File(...),
    current_user: dict = Depends(require_permission("sales.create")),
    db: AsyncSession = Depends(get_async_db)
):
    business_id = current_user["business_id"]
    user_id = current_user["user_id"]

    # ── 1. Parse CSV ──────────────────────────────────────────────────────────
    file_bytes = await file.read()
    rows, parse_error = parse_csv_file(file_bytes)
    if parse_error:
        return error_response(parse_error, 400)

    # ── 2. Row transform: validate & transform each row ────────────────────────
    def row_transform(row: dict, row_num: int):
        # Customer identification (optional — walk-in sales allowed)
        cust_phone = (row.get("cust_phone") or row.get("customer_phone") or row.get("Phone") or "").strip() or None
        cust_name = (row.get("cust_name") or row.get("customer_name") or row.get("Customer Name") or "").strip() or None

        # Product identification (required)
        prod_name = (row.get("prod_name") or row.get("product_name") or row.get("Product Name") or "").strip()
        barcode = (row.get("barcode") or row.get("Barcode") or "").strip() or None

        if not prod_name and not barcode:
            return None, "product_name or barcode is required"

        # Quantities & prices (required)
        qty_raw = row.get("qty") or row.get("quantity") or row.get("Qty") or row.get("Quantity")
        unit_price_raw = row.get("unit_price") or row.get("price") or row.get("Unit Price") or row.get("Price")

        if not qty_raw:
            return None, "quantity is required"
        if not unit_price_raw:
            return None, "unit_price is required"

        try:
            qty = int(float(qty_raw))
            unit_price = Decimal(str(float(unit_price_raw)))
            if qty <= 0:
                return None, "quantity must be positive"
            if unit_price <= 0:
                return None, "unit_price must be positive"
        except (ValueError, TypeError):
            return None, "invalid quantity or unit_price"

        # Optional fields
        discount_raw = row.get("discount") or row.get("Discount") or "0"
        payment_method = (row.get("payment_method") or row.get("Payment Method") or "cash").strip().lower()
        payment_status = (row.get("payment_status") or row.get("Payment Status") or "pending").strip().lower()
        paid_amount_raw = row.get("paid_amount") or row.get("Paid Amount")
        allow_stock_override_raw = (row.get("allow_stock_override") or row.get("Override") or "false").strip().lower()

        try:
            discount = Decimal(str(float(discount_raw)))
            if discount < 0:
                discount = Decimal("0")
        except (ValueError, TypeError):
            discount = Decimal("0")

        paid_amount = None
        if paid_amount_raw and paid_amount_raw.strip():
            try:
                paid_amount = Decimal(str(float(paid_amount_raw)))
                if paid_amount <= 0:
                    paid_amount = None
            except (ValueError, TypeError):
                pass

        # Validate enums
        if payment_method not in ("cash", "upi", "card", "bank", "split"):
            payment_method = "cash"

        if payment_status not in ("pending", "paid", "partial"):
            payment_status = "pending"

        allow_stock_override = allow_stock_override_raw in ("true", "yes", "1")

        # Sanitize strings
        if cust_phone:
            cust_phone = strip_and_escape_html(cust_phone)
        if cust_name:
            cust_name = strip_and_escape_html(cust_name)
        if prod_name:
            prod_name = strip_and_escape_html(prod_name)
        if barcode:
            barcode = strip_and_escape_html(barcode)

        return {
            "cust_phone": cust_phone, "cust_name": cust_name,
            "prod_name": prod_name, "barcode": barcode,
            "qty": qty, "unit_price": str(unit_price),
            "discount": str(discount),
            "payment_method": payment_method,
            "payment_status": payment_status,
            "paid_amount": str(paid_amount) if paid_amount else None,
            "allow_stock_override": allow_stock_override,
            "_row_number": row_num
        }, None

    valid_rows, errors = validate_rows(rows, row_transform)

    # ── 3. Check bulk create tier limit ───────────────────────────────────────
    sub_type = current_user.get("subscription_type") or await fetch_subscription_type_async(db, business_id)
    allowed_count, limit_msg = await check_bulk_create_allowed(
        db, business_id, sub_type, "max_sales_per_month", "sales", len(valid_rows),
        date_column="sales_created_at",
    )
    if allowed_count == 0:
        return error_response(limit_msg, 403)

    if allowed_count < len(valid_rows):
        valid_rows = valid_rows[:allowed_count]
        errors.append({"row": 0, "message": limit_msg})

    # ── 4. Pre-resolve customers and products ─────────────────────────────────
    # Customer by phone
    cust_map = {}
    phone_list = list(set(r["cust_phone"] for r in valid_rows if r.get("cust_phone")))
    if phone_list:
        placeholders = ", ".join([f":cp_{i}" for i in range(len(phone_list))])
        params = {"bid": business_id}
        for i, cp in enumerate(phone_list):
            params[f"cp_{i}"] = cp

        cust_rows = (await db.execute(text(f"""
            SELECT cust_id::text, cust_phone, cust_name, cust_state, cust_country_code
            FROM customers
            WHERE business_id = CAST(:bid AS uuid)
              AND cust_phone IN ({placeholders})
              AND is_deleted = false
        """), params)).fetchall()

        for r in cust_rows:
            key = r.cust_phone or str(r.cust_id)
            cust_map[key] = str(r.cust_id)

    # Customer by name (fallback)
    name_list = list(set(r["cust_name"] for r in valid_rows if r.get("cust_name") and not r.get("cust_phone")))
    if name_list:
        placeholders = ", ".join([f":cn_{i}" for i in range(len(name_list))])
        params = {"bid": business_id}
        for i, cn in enumerate(name_list):
            params[f"cn_{i}"] = cn

        cust_rows = (await db.execute(text(f"""
            SELECT cust_id::text, cust_name
            FROM customers
            WHERE business_id = CAST(:bid AS uuid)
              AND cust_name IN ({placeholders})
              AND is_deleted = false
        """), params)).fetchall()

        for r in cust_rows:
            key = r.cust_name
            if key not in cust_map:
                cust_map[key] = str(r.cust_id)

    # Product lookup
    product_map = {}
    prod_name_list = list(set(r["prod_name"] for r in valid_rows if r.get("prod_name")))
    barcode_list = list(set(r["barcode"] for r in valid_rows if r.get("barcode") and not r.get("prod_name")))

    if prod_name_list:
        placeholders = ", ".join([f":pn_{i}" for i in range(len(prod_name_list))])
        params = {"bid": business_id}
        for i, pn in enumerate(prod_name_list):
            params[f"pn_{i}"] = pn

        prod_rows = (await db.execute(text(f"""
            SELECT prod_id::text, prod_name, prod_stock_qty, prod_sell_price
            FROM products
            WHERE business_id = CAST(:bid AS uuid)
              AND prod_name IN ({placeholders})
              AND is_deleted = false
        """), params)).fetchall()

        for r in prod_rows:
            product_map[r.prod_name] = {
                "prod_id": str(r.prod_id),
                "stock_qty": r.prod_stock_qty,
                "prod_sell_price": float(r.prod_sell_price)
            }

    if barcode_list:
        placeholders = ", ".join([f":pb_{i}" for i in range(len(barcode_list))])
        params = {"bid": business_id}
        for i, pb in enumerate(barcode_list):
            params[f"pb_{i}"] = pb

        prod_rows = (await db.execute(text(f"""
            SELECT prod_id::text, barcode, prod_name, prod_stock_qty, prod_sell_price
            FROM products
            WHERE business_id = CAST(:bid AS uuid)
              AND barcode IN ({placeholders})
              AND is_deleted = false
        """), params)).fetchall()

        for r in prod_rows:
            key = r.barcode or r.prod_name
            product_map[key] = {
                "prod_id": str(r.prod_id),
                "stock_qty": r.prod_stock_qty,
                "prod_sell_price": float(r.prod_sell_price)
            }

    # ── 5. Create sales ───────────────────────────────────────────────────────
    created = 0
    sale_errors = []

    for chunk in chunk_list(valid_rows):
        for row in chunk:
            row_num = row.pop("_row_number")

            # Resolve customer
            cust_id = None
            if row.get("cust_phone"):
                cust_id = cust_map.get(row["cust_phone"])
            elif row.get("cust_name"):
                cust_id = cust_map.get(row["cust_name"])

            # Resolve product
            prod_key = row.get("prod_name") or row.get("barcode")
            prod_info = product_map.get(prod_key) if prod_key else None
            if not prod_info:
                sale_errors.append({"row": row_num, "message": "product not found"})
                continue

            try:
                unit_price = Decimal(row["unit_price"])
                qty = row["qty"]
                discount = Decimal(row.get("discount", "0"))
                payment_method = row.get("payment_method", "cash")
                payment_status = row.get("payment_status", "pending")
                paid_amount = Decimal(row["paid_amount"]) if row.get("paid_amount") else None
                allow_override = row.get("allow_stock_override", False)

                # ── Stock validation ──
                if not allow_override and prod_info["stock_qty"] < qty:
                    sale_errors.append({
                        "row": row_num,
                        "message": f"insufficient stock for product — need {qty} but only {prod_info['stock_qty']} available"
                    })
                    continue

                # ── Calculate total ──
                total_amount = unit_price * qty

                # ── Generate invoice number (same as manual sale creation) ──
                invoice_no = await generate_invoice_number(db, business_id)

                new_sale_id = str(uuid.uuid4())
                new_item_id = str(uuid.uuid4())

                # ── Create sale directly via raw SQL (reuses patterns from create_sale + purchase import) ──
                await db.execute(text("""
                    INSERT INTO sales (
                        sales_id, business_id, customer_id,
                        invoice_no, sales_total_amount, sales_discount,
                        sales_payment_method, sales_payment_status, created_by
                    ) VALUES (
                        CAST(:sid AS uuid), CAST(:bid AS uuid), CAST(:cid AS uuid),
                        :inv_no, :total_amount, :discount,
                        :pay_method, :pay_status, CAST(:uid AS uuid)
                    )
                """), {
                    "sid": new_sale_id, "bid": business_id,
                    "cid": cust_id, "inv_no": invoice_no,
                    "total_amount": str(total_amount), "discount": str(discount),
                    "pay_method": payment_method, "pay_status": payment_status,
                    "uid": user_id
                })

                # ── Insert sale item (DB triggers handle tax/stock) ──
                await db.execute(text("""
                    INSERT INTO sale_items (
                        sale_item_id, business_id, sale_id, product_id,
                        sale_item_quantity, sale_item_unit_price
                    ) VALUES (
                        CAST(:iid AS uuid), CAST(:bid AS uuid), CAST(:sid AS uuid),
                        CAST(:pid AS uuid), :qty, :unit_price
                    )
                """), {
                    "iid": new_item_id, "bid": business_id,
                    "sid": new_sale_id, "pid": prod_info["prod_id"],
                    "qty": qty, "unit_price": str(unit_price)
                })

                # ── Auto-record payment if status is not pending ──
                if payment_status in ("paid", "partial"):
                    pay_sale_full = total_amount - discount
                    pay_amount = paid_amount if paid_amount else pay_sale_full
                    pay_type = "partial" if payment_status == "partial" else "paid"

                    new_pay_id = str(uuid.uuid4())
                    await db.execute(text("""
                        INSERT INTO payments (
                            payment_id, business_id, sale_id,
                            payment_amount, payment_method,
                            cumulative_paid, payment_status,
                            payment_note
                        ) VALUES (
                            CAST(:pid AS uuid), CAST(:bid AS uuid), CAST(:sid AS uuid),
                            :amount, :method,
                            :cumulative_paid, :status,
                            :note
                        )
                    """), {
                        "pid": new_pay_id, "bid": business_id,
                        "sid": new_sale_id,
                        "amount": str(pay_amount), "method": payment_method,
                        "cumulative_paid": str(pay_amount), "status": pay_type,
                        "note": "Auto-recorded from CSV bulk import"
                    })

                # Update local stock cache for subsequent rows
                new_stock = prod_info["stock_qty"] - qty
                product_map[prod_key]["stock_qty"] = max(0, new_stock)

                created += 1

            except Exception as e:
                sale_errors.append({"row": row_num, "message": str(e)})

        await db.commit()
        await async_set_rls_gucs_after_commit(db, current_user)

    all_errors = errors + sale_errors

    return success_response({
        "message": f"Import completed: {created} sales created, {len(all_errors)} errors",
        "summary": {
            "total_rows": len(rows),
            "valid_rows": len(valid_rows),
            "created": created,
            "errors": len(all_errors)
        },
        "errors": all_errors
    })


@router.get("/")
async def get_sales(
    current_user: dict = Depends(require_permission("sales.view")),
    db: AsyncSession = Depends(get_async_db),
    pagination: dict = Depends(paginate_async),
    search: str = Query(None),
    status: str = Query(None),
    date_from: str = Query(None),
    date_to: str = Query(None),
    sort_by: Optional[str] = Query(default="sales_created_at", description="Column to sort by"),
    sort_dir: Optional[str] = Query(default="desc", description="asc or desc"),
):
    result, total = await get_sales_list(
        db, current_user["business_id"], pagination,
        search, status, date_from, date_to, sort_by, sort_dir
    )
    return success_response(
        pagination_response(result, total, pagination["page"], pagination["limit"], capped=pagination["_capped"])
    )


@router.get("/summary")
async def get_sales_summary(
    current_user: dict = Depends(require_permission("sales.view")),
    db: AsyncSession = Depends(get_async_db)
):
    business_id = current_user["business_id"]
    perms = current_user.get("permissions", set())
    can_financial = "dashboard.financial" in perms

    row = (await db.execute(text("""
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
    """), {"bid": business_id})).fetchone()

    return success_response({
        "today_revenue": str(row.today_revenue) if can_financial else None,
        "weekly_revenue": str(row.weekly_revenue) if can_financial else None,
        "monthly_revenue": str(row.monthly_revenue) if can_financial else None,
        "outstanding_receivables": str(row.outstanding_receivables) if can_financial else None,
    })


@router.get("/{sales_id}")
async def get_sale(
    sales_id: str,
    current_user: dict = Depends(require_permission("sales.view")),
    db: AsyncSession = Depends(get_async_db)
):
    sale = await get_sale_detail(db, current_user["business_id"], sales_id)
    if not sale:
        return error_response("Sale not found", 404)
    return success_response(sale)


@router.patch("/{sales_id}/status")
async def handle_sale_status_patch(
    sales_id: str,
    body: SaleStatusUpdate,
    current_user: dict = Depends(require_permission("sales.edit")),
    db: AsyncSession = Depends(get_async_db)
):
    allowed = ["pending", "paid", "partial"]
    if body.status not in allowed:
        return error_response(f"Status must be one of: {allowed}", 400)

    business_id = current_user["business_id"]

    # with_for_update: row-level lock prevents two concurrent PATCHes from
    # both reading the same pending sale and applying duplicate adjustments.
    # This is the only endpoint that mutates sale financials in-place.
    sale = (await db.execute(select(Sale).where(
        Sale.sales_id == sales_id,
        Sale.business_id == business_id,
        Sale.is_deleted == False
    ).with_for_update())).scalar_one_or_none()

    if not sale:
        return error_response("Sale not found", 404)

    # Resolve currency symbol from the business's country code
    biz = (await db.execute(
        text("SELECT business_country_code FROM businesses WHERE business_id = CAST(:bid AS uuid)"),
        {"bid": business_id}
    )).fetchone()
    currency_sym = get_currency_symbol(biz.business_country_code if biz else None)

    old_status = sale.sales_payment_status
    sale_final = await get_sale_final_amount(db, sales_id, business_id)
    already_paid = await get_sale_active_payment(db, sales_id, business_id)
    remaining = (sale_final - already_paid).quantize(Decimal("0.01"))

    if old_status == body.status and body.paid_amount is None:
        return success_response({"message": f"Sale is already '{body.status}'", "status": body.status})

    reconciliation_inserted = False
    response_note = None
    new_total_paid = already_paid
    new_remaining = remaining

    if body.paid_amount is not None:
        paid_input = body.paid_amount
        if paid_input <= 0:
            return error_response("Paid amount must be greater than zero", 400)
        if paid_input > remaining:
            return error_response(
                f"Payment of {paid_input} exceeds the remaining balance of "
                f"{remaining}. Please enter {remaining} or less.",
                400
            )

        total_paid = (already_paid + paid_input).quantize(Decimal("0.01"))
        derived_status = calculate_payment_status(total_paid, sale_final)

        await record_payment_and_sync_async(
            db=db,
            business_id=current_user["business_id"],
            sale_id=sales_id,
            payment_amount=paid_input,
            payment_method="adjustment" if already_paid > 0 else (sale.sales_payment_method or "cash"),
            new_status=derived_status,
            cumulative_paid=total_paid,
        )
        reconciliation_inserted = True
        new_total_paid = total_paid
        new_remaining = (sale_final - total_paid).quantize(Decimal("0.01"))
        if new_remaining < 0:
            new_remaining = Decimal("0")
        response_note = f"Payment recorded: {currency_sym}{paid_input}. Total paid: {currency_sym}{total_paid}."

    elif body.status == "paid" and old_status != "paid":
        if remaining > 0:
            await record_payment_and_sync_async(
                db=db,
                business_id=current_user["business_id"],
                sale_id=sales_id,
                payment_amount=remaining,
                payment_method="adjustment",
                new_status="paid",
                cumulative_paid=(already_paid + remaining).quantize(Decimal("0.01")),
            )
            reconciliation_inserted = True
            new_total_paid = (already_paid + remaining).quantize(Decimal("0.01"))
            new_remaining = Decimal("0")
            response_note = (
                "A reconciliation payment row was automatically created "
                "in the payments table to record the remaining balance as an adjustment."
            )
        else:
            await update_payment_status(db, sales_id, "paid", business_id)
            await update_sale_status(db, sales_id, "paid", business_id)
            new_total_paid = already_paid
            new_remaining = Decimal("0")

    elif body.status == "partial" and body.paid_amount is None:
        return error_response(
            "Paid amount is required when setting payment status to 'partial'. "
            "Please provide the amount received.",
            400
        )

    else:
        await update_sale_status(db, sales_id, body.status, business_id)
        await update_payment_status(db, sales_id, body.status, business_id)

    await db.commit()
    # RLS: SET LOCAL/set_config GUCs are transaction-scoped and are cleared
    # by this commit. Re-set them in case any future code adds a query after
    # this point (matches the convention in product.py, purchase.py, expense.py).
    await async_set_rls_gucs_after_commit(db, current_user)

    response_data = {
        "message": "Payment status updated",
        "status": body.status,
        "total_paid": str(new_total_paid),
        "remaining_balance": str(new_remaining),
    }
    if response_note:
        response_data["note"] = response_note

    return success_response(response_data)


@router.delete("/{sales_id}")
async def delete_sale(
    sales_id: str,
    restore_stock: bool = Query(False),
    current_user: dict = Depends(require_permission("sales.delete")),
    db: AsyncSession = Depends(get_async_db)
):
    business_id = current_user["business_id"]
    user_id = current_user["user_id"]

    sale = (await db.execute(select(Sale).where(
        Sale.sales_id == sales_id,
        Sale.business_id == business_id,
        Sale.is_deleted == False
    ))).scalar_one_or_none()

    if not sale:
        return error_response("Sale not found", 404)

    sale.is_deleted = True
    sale.updated_by = user_id

    # Deactivate all payment rows so they no longer appear in active payments
    await db.execute(
        text("""
            UPDATE payments
            SET is_active = false
            WHERE sale_id = CAST(:sid AS uuid)
              AND business_id = CAST(:bid AS uuid)
        """),
        {"sid": sales_id, "bid": business_id}
    )

    if restore_stock:
        sale_items = (await db.execute(select(SaleItem).where(
            SaleItem.sale_id == sales_id,
            SaleItem.business_id == business_id
        ))).scalars().all()

        if sale_items:
            prod_ids = [str(item.product_id) for item in sale_items]
            # BUG FIX: asyncpg expects a Python list for array params, not a
            # manually-formatted "{uuid1,uuid2}" string (causes DataError).
            pids_param = prod_ids

            # 1. Bulk SELECT: fetch current stock for all products at once
            product_rows = (await db.execute(
                text("""
                    SELECT prod_id, prod_stock_qty
                    FROM products
                    WHERE prod_id = ANY(CAST(:pids AS uuid[]))
                      AND business_id = CAST(:business_id AS uuid)
                """),
                {"pids": pids_param, "business_id": business_id}
            )).all()

            prod_stock_map = {str(row.prod_id): row.prod_stock_qty for row in product_rows}

            # Only process items whose products still exist
            valid_items = [
                item for item in sale_items
                if str(item.product_id) in prod_stock_map
            ]

            if valid_items:
                # 2. Bulk UPDATE products
                values_clause = ", ".join(
                    f"(CAST(:pid_{i} AS uuid), :qty_{i})"
                    for i in range(len(valid_items))
                )
                update_params = {"user_id": user_id, "business_id": business_id}
                for i, item in enumerate(valid_items):
                    update_params[f"pid_{i}"] = str(item.product_id)
                    update_params[f"qty_{i}"] = item.sale_item_quantity

                await db.execute(
                    text(f"""
                        UPDATE products
                        SET prod_stock_qty = products.prod_stock_qty + v.restore_qty,
                            updated_by = CAST(:user_id AS uuid)
                        FROM (VALUES {values_clause}) AS v(prod_id, restore_qty)
                        WHERE products.prod_id = v.prod_id
                          AND products.business_id = CAST(:business_id AS uuid)
                    """),
                    update_params
                )

                # 3. Multi-row INSERT into stock_movements
                insert_values = ", ".join(
                    f"(CAST(:mid_{i} AS uuid), CAST(:bid AS uuid), CAST(:pid_{i} AS uuid), :mtype_{i}, :mqty_{i}, :mprev_{i}, CAST(:sref AS uuid), :mnotes_{i}, CAST(:cby AS uuid))"
                    for i in range(len(valid_items))
                )
                insert_params = {"bid": business_id, "sref": sales_id, "cby": user_id}
                for i, item in enumerate(valid_items):
                    pid = str(item.product_id)
                    insert_params[f"mid_{i}"] = str(uuid.uuid4())
                    insert_params[f"pid_{i}"] = pid
                    insert_params[f"mtype_{i}"] = "return"
                    insert_params[f"mqty_{i}"] = item.sale_item_quantity
                    insert_params[f"mprev_{i}"] = prod_stock_map[pid]
                    insert_params[f"mnotes_{i}"] = f"Stock restored from deleted sale {sale.invoice_no}"

                await db.execute(
                    text(f"""
                        INSERT INTO stock_movements (
                            move_id, business_id, product_id,
                            move_type, move_qty, move_prev_stock,
                            sale_reference_id, move_notes, move_created_by
                        ) VALUES {insert_values}
                    """),
                    insert_params
                )

            # 4. Bulk cleanup product alerts (single query — matches cleanup_product_alerts logic)
            await db.execute(
                text("""
                    DELETE FROM low_stock_alerts la
                    USING products p
                    WHERE p.prod_id = la.product_id
                      AND la.product_id = ANY(CAST(:pids AS uuid[]))
                      AND la.business_id = CAST(:bid AS uuid)
                      AND p.is_deleted = false
                      AND p.prod_stock_qty > p.prod_low_stock_alert
                """),
                {"pids": pids_param, "bid": business_id}
            )

    await db.commit()
    # RLS: SET LOCAL/set_config GUCs are transaction-scoped and are cleared
    # by this commit. Re-set them in case any future code adds a query after
    # this point (matches the convention in product.py, purchase.py, expense.py).
    await async_set_rls_gucs_after_commit(db, current_user)

    return success_response({"message": "Sale deleted successfully"})
