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

from fastapi import APIRouter, Depends, Query, File, UploadFile
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, text
from app.database import get_async_db
from app.middleware.rbac import require_permission, async_set_rls_gucs_after_commit
from app.models.purchase import Purchase
from app.models.product import Product
from app.models.supplier import Supplier
from app.schemas.purchase import PurchaseCreate
from app.utils.response import success_response, error_response
from app.utils.pagination import paginate_async, pagination_response
from app.utils.timestamp import fmt_ts
from app.utils.tax_engine import calculate_item_tax
from app.utils.usage_limits import check_create_allowed_async, fetch_subscription_type_async
from app.utils.bulk_import import parse_csv_file, validate_rows, check_bulk_create_allowed, chunk_list, friendly_db_error, check_required_headers
from app.schemas.validators import strip_and_escape_html, strip_and_escape_csv_value
from app.utils.bulk_stock_adjust import bulk_check_and_reduce_stock
import logging
from decimal import Decimal
import uuid
from pydantic import BaseModel


class PurchaseStatusUpdate(BaseModel):
    status: str


router = APIRouter(prefix="/v1/purchases", tags=["Purchases"])

REQUIRED_PURCHASE_COLUMNS = [
    {"names": ["qty", "quantity", "Qty", "Quantity"]},
    {"names": ["unit_price", "price", "Unit Price", "Price"]},
    {"names": ["prod_name", "product_name", "Product Name",
               "barcode", "Barcode"]},
]


# ─────────────────────────────────────────
# HELPER: Fetch full purchase via raw SQL
# ─────────────────────────────────────────
async def fetch_full_purchase(db: AsyncSession, pur_id: str, business_id: str):
    return (await db.execute(
        text("""
            SELECT p.pur_id, p.business_id, p.supp_id,
                   s.supp_name,
                   p.pur_total_amount, p.pur_discount,
                   p.pur_cgst_total, p.pur_sgst_total, p.pur_igst_total,
                   p.pur_tax_total, p.pur_final_amount,
                   p.pur_payment_status, p.is_deleted,
                   p.pur_created_at, p.updated_at, p.created_by,
                   pr.full_name AS last_updated_by
            FROM purchases p
            LEFT JOIN suppliers s  ON s.supp_id   = p.supp_id
            LEFT JOIN profiles  pr ON pr.id        = p.updated_by
            WHERE p.pur_id = :pid
              AND p.business_id = CAST(:bid AS uuid)
        """),
        {"pid": pur_id, "bid": business_id}
    )).fetchone()


# ─────────────────────────────────────────
# HELPER: Fetch purchase items via raw SQL
# ─────────────────────────────────────────
async def fetch_purchase_items(db: AsyncSession, pur_id: str, business_id: str):
    return (await db.execute(
        text("""
            SELECT pi.item_id, pi.product_id,
                   p.prod_name,
                   pi.pur_item_qty,
                   pi.item_unit_price, pi.item_subtotal,
                   pi.gst_rate, pi.cgst_amount, pi.sgst_amount,
                   pi.igst_amount, pi.pur_tax_total,
                   pi.item_tax_total, pi.item_total_with_tax
            FROM purchase_items pi
            LEFT JOIN products p ON p.prod_id = pi.product_id
            WHERE pi.pur_id = :pid
              AND pi.business_id = CAST(:bid AS uuid)
        """),
        {"pid": pur_id, "bid": business_id}
    )).fetchall()


# ─────────────────────────────────────────
# HELPER: Format purchase row as dict (includes audit fields, used by detail)
# NOTE: All monetary fields use str(Decimal(str(x))) to avoid float precision loss.
# Do NOT change back to float() — Decimal round-trips through string prevents drift.
# ─────────────────────────────────────────
def purchase_row_to_dict(row, items):
    return {
        "pur_id":             str(row.pur_id),
        "business_id":        str(row.business_id),
        "supp_id":            str(row.supp_id) if row.supp_id else None,
        "supp_name":          row.supp_name if hasattr(row, "supp_name") else None,
        "pur_total_amount":   str(Decimal(str(row.pur_total_amount))),
        "pur_discount":       str(Decimal(str(row.pur_discount))) if row.pur_discount else "0",
        "pur_cgst_total":     str(Decimal(str(row.pur_cgst_total))) if row.pur_cgst_total else "0",
        "pur_sgst_total":     str(Decimal(str(row.pur_sgst_total))) if row.pur_sgst_total else "0",
        "pur_igst_total":     str(Decimal(str(row.pur_igst_total))) if row.pur_igst_total else "0",
        "pur_tax_total":      str(Decimal(str(row.pur_tax_total))) if row.pur_tax_total else "0",
        "pur_final_amount":   str(Decimal(str(row.pur_final_amount))) if row.pur_final_amount else None,
        "pur_payment_status": row.pur_payment_status,
        "is_deleted":         row.is_deleted,
        "pur_created_at":     fmt_ts(row.pur_created_at),
        "updated_at":         fmt_ts(row.updated_at) if hasattr(row, "updated_at") else None,
        "last_updated_by":    row.last_updated_by if hasattr(row, "last_updated_by") else None,
        "created_by":         str(row.created_by) if row.created_by else None,
        "items":              [purchase_item_to_dict(i) for i in items]
    }


# ── Helper: format purchase row for list response ──
def purchase_row_to_dict_list(row):
    return {
        "pur_id":             str(row.pur_id),
        "business_id":        str(row.business_id),
        "supp_id":            str(row.supp_id) if row.supp_id else None,
        "supp_name":          row.supp_name,
        "pur_total_amount":   str(Decimal(str(row.pur_total_amount))),
        "pur_discount":       str(Decimal(str(row.pur_discount))) if row.pur_discount else "0",
        "pur_cgst_total":     str(Decimal(str(row.pur_cgst_total))) if row.pur_cgst_total else "0",
        "pur_sgst_total":     str(Decimal(str(row.pur_sgst_total))) if row.pur_sgst_total else "0",
        "pur_igst_total":     str(Decimal(str(row.pur_igst_total))) if row.pur_igst_total else "0",
        "pur_tax_total":      str(Decimal(str(row.pur_tax_total))) if row.pur_tax_total else "0",
        "pur_final_amount":   str(Decimal(str(row.pur_final_amount))) if row.pur_final_amount else None,
        "pur_payment_status": row.pur_payment_status,
        "pur_created_at":     fmt_ts(row.pur_created_at),
        "updated_at":         fmt_ts(row.updated_at) if hasattr(row, "updated_at") else None,
        "last_updated_by":    row.last_updated_by if hasattr(row, "last_updated_by") else None,
    }


# ─────────────────────────────────────────
# HELPER: Format purchase item row as dict
# ─────────────────────────────────────────
def purchase_item_to_dict(row):
    return {
        "item_id":             str(row.item_id),
        "product_id":          str(row.product_id),
        "prod_name":           row.prod_name if hasattr(row, "prod_name") else None,
        "pur_item_qty":        row.pur_item_qty,
        "item_unit_price":     str(Decimal(str(row.item_unit_price))),
        "item_subtotal":       str(Decimal(str(row.item_subtotal))) if row.item_subtotal else None,
        "gst_rate":            str(Decimal(str(row.gst_rate))) if row.gst_rate else "0",
        "cgst_amount":         str(Decimal(str(row.cgst_amount))) if row.cgst_amount else "0",
        "sgst_amount":         str(Decimal(str(row.sgst_amount))) if row.sgst_amount else "0",
        "igst_amount":         str(Decimal(str(row.igst_amount))) if row.igst_amount else "0",
        "pur_tax_total":       str(Decimal(str(row.pur_tax_total))) if row.pur_tax_total else "0",
        "item_tax_total":      str(Decimal(str(row.item_tax_total))) if row.item_tax_total else "0",
        "item_total_with_tax": str(Decimal(str(row.item_total_with_tax))) if row.item_total_with_tax else None
    }


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

    # ── Subscription tier limit check ─────────────────────────────────────────
    sub_type = current_user.get("subscription_type") or await fetch_subscription_type_async(db, business_id)
    allowed, msg = await check_create_allowed_async(
        db, business_id, sub_type, "max_purchases_per_month",
        "purchases", date_column="pur_created_at"
    )
    if not allowed:
        return error_response(msg, status_code=403)

    try:
        # Step 1 → Get business country and state for tax engine
        business = (await db.execute(
            text("""
                SELECT business_country_code, business_state
                FROM businesses
                WHERE business_id = CAST(:bid AS uuid)
            """),
            {"bid": business_id}
        )).fetchone()

        biz_country = (business.business_country_code or "").strip() if business else ""
        biz_state   = (business.business_state or "").strip()         if business else ""

        # Step 2 → Get supplier country + state (needed for GST inter/intra detection)
        supp_country = ""
        supp_state   = ""
        if data.supp_id:
            supplier = (await db.execute(select(Supplier).where(
                Supplier.supp_id     == data.supp_id,
                Supplier.business_id == business_id,
                Supplier.is_deleted  == False
            ))).scalar_one_or_none()

            if not supplier:
                return error_response("Supplier not found", status_code=404)

            supp_country = (supplier.supp_country_code or "").strip()
            supp_state   = (supplier.supp_state or "").strip()

        # Step 3 → Validate products and calculate tax via centralized engine
        total_amount     = Decimal("0")
        cgst_total       = Decimal("0")
        sgst_total       = Decimal("0")
        igst_total       = Decimal("0")
        tax_total        = Decimal("0")
        calculated_items = []

        # Bulk product lookup — one query for all items
        requested_ids = [str(item.product_id) for item in data.items]
        products_bulk = (await db.execute(select(Product).where(
            Product.prod_id.in_(requested_ids),
            Product.business_id == business_id,
            Product.is_deleted  == False
        ))).scalars().all()
        product_cache = {str(p.prod_id): p for p in products_bulk}

        for item in data.items:
            product = product_cache.get(str(item.product_id))

            if not product:
                return error_response(
                    f"Product '{item.product_id}' not found",
                    status_code=404
                )

            tax_rate = product.tax_rate or Decimal("0")

            # ── CENTRALIZED TAX ENGINE ────────────────────────────────────────
            # calculate_item_tax() applies the full global rule set:
            #   non-India biz               → generic_tax only
            #   India + foreign supplier    → IGST
            #   India + same-state supplier → CGST + SGST
            #   India + blank-state supplier→ CGST + SGST (safe default)
            #   India + diff-state supplier → IGST
            tax_calc = calculate_item_tax(
                unit_price                = item.item_unit_price,
                quantity                  = item.pur_item_qty,
                tax_rate                  = tax_rate,
                business_country_code     = biz_country,
                business_state            = biz_state,
                counterparty_country_code = supp_country,
                counterparty_state        = supp_state,
            )

            total_amount += tax_calc["subtotal"]
            cgst_total   += tax_calc["cgst_amount"]
            sgst_total   += tax_calc["sgst_amount"]
            igst_total   += tax_calc["igst_amount"]
            tax_total    += tax_calc["generic_tax_total"]

            calculated_items.append({
                "product_id":    str(item.product_id),
                "quantity":      item.pur_item_qty,
                "unit_price":    str(item.item_unit_price),
                "tax_rate":      str(tax_rate),
                "cgst_amount":   str(tax_calc["cgst_amount"]),
                "sgst_amount":   str(tax_calc["sgst_amount"]),
                "igst_amount":   str(tax_calc["igst_amount"]),
                "pur_tax_total": str(tax_calc["generic_tax_total"]),
            })

        # Step 4 → Insert purchase header via raw SQL
        # pur_final_amount is a DB generated column — never insert it.
        discount   = str(data.pur_discount or Decimal("0"))
        new_pur_id = str(uuid.uuid4())

        await db.execute(
            text("""
                INSERT INTO purchases (
                    pur_id, business_id, supp_id,
                    pur_total_amount, pur_discount,
                    pur_cgst_total, pur_sgst_total,
                    pur_igst_total, pur_tax_total,
                    pur_payment_status, created_by
                ) VALUES (
                    CAST(:pur_id AS uuid),
                    CAST(:business_id AS uuid),
                    CAST(:supp_id AS uuid),
                    :pur_total_amount, :pur_discount,
                    :pur_cgst_total, :pur_sgst_total,
                    :pur_igst_total, :pur_tax_total,
                    :pur_payment_status,
                    CAST(:created_by AS uuid)
                )
            """),
            {
                "pur_id":            new_pur_id,
                "business_id":       business_id,
                "supp_id":           str(data.supp_id) if data.supp_id else None,
                "pur_total_amount":  str(total_amount),
                "pur_discount":      discount,
                "pur_cgst_total":    str(cgst_total),
                "pur_sgst_total":    str(sgst_total),
                "pur_igst_total":    str(igst_total),
                "pur_tax_total":     str(tax_total),
                "pur_payment_status": data.pur_payment_status,
                "created_by":        user_id
            }
        )

        # Step 5 → Insert purchase items (DB trigger auto-increases stock)
        # GENERATED columns (item_subtotal, item_tax_total, item_total_with_tax)
        # are never inserted — DB computes them.
        await db.execute(
            text("""
                INSERT INTO purchase_items (
                    item_id, business_id, pur_id, product_id,
                    pur_item_qty, item_unit_price,
                    gst_rate, cgst_amount, sgst_amount,
                    igst_amount, pur_tax_total
                ) VALUES (
                    CAST(:item_id AS uuid),
                    CAST(:business_id AS uuid),
                    CAST(:pur_id AS uuid),
                    CAST(:product_id AS uuid),
                    :quantity, :unit_price,
                    :gst_rate, :cgst_amount, :sgst_amount,
                    :igst_amount, :pur_tax_total
                )
            """),
            [
                {
                    "item_id":      str(uuid.uuid4()),
                    "business_id":  business_id,
                    "pur_id":       new_pur_id,
                    "product_id":   calc["product_id"],
                    "quantity":     calc["quantity"],
                    "unit_price":   calc["unit_price"],
                    "gst_rate":     calc["tax_rate"],
                    "cgst_amount":  calc["cgst_amount"],
                    "sgst_amount":  calc["sgst_amount"],
                    "igst_amount":  calc["igst_amount"],
                    "pur_tax_total": calc["pur_tax_total"],
                }
                for calc in calculated_items
            ]
        )

        # ── Update prod_cost_price for each purchased product ─────────────────
        # Last-purchase-cost accounting: set cost price to the unit price from
        # this purchase.  prod_profit is a generated column — DB recomputes it.
        if calculated_items:
            await db.execute(
                text("""
                    UPDATE products p
                    SET prod_cost_price = v.unit_price::numeric,
                        updated_by = CAST(:updated_by AS uuid)
                    FROM (VALUES {values}) AS v(product_id, unit_price)
                    WHERE p.prod_id = v.product_id::uuid
                      AND p.business_id = CAST(:bid AS uuid)
                """.format(values=",".join(f"(:pid_{i}, :price_{i})" for i in range(len(calculated_items))))),
                {
                    **{f"pid_{i}": calc["product_id"] for i, calc in enumerate(calculated_items)},
                    **{f"price_{i}": calc["unit_price"] for i, calc in enumerate(calculated_items)},
                    "bid": business_id,
                    "updated_by": user_id,
                }
            )

        # Step 6 → Auto-create expense record when purchase is paid immediately
        # WHY: Cash purchase = money leaves the business immediately.
        # Without this, the accountant must manually add an expense for every
        # cash purchase — that is error-prone.
        # Race-safety: INSERT ... WHERE NOT EXISTS prevents duplicate expenses
        # when PATCH /status is called concurrently with "paid".
        if data.pur_payment_status == "paid":
            pur_row      = await fetch_full_purchase(db, new_pur_id, business_id)
            final_amount = Decimal(str(pur_row.pur_final_amount)) if pur_row and pur_row.pur_final_amount else Decimal("0")

            await db.execute(
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
                    ON CONFLICT (business_id, source_type, source_id)
                    WHERE is_deleted = false AND source_type IS NOT NULL
                    DO NOTHING
                """),
                {
                    "expense_id":       str(uuid.uuid4()),
                    "business_id":      business_id,
                    "expense_category": "purchase",
                    "expense_amount":   str(final_amount),
                    "expense_notes":    f"Auto-recorded from purchase {new_pur_id}",
                    "created_by":       user_id,
                    "source_type":      "purchase",
                    "source_id":        new_pur_id
                }
            )

        # ── Revalidate low-stock alerts ──────────────────────────────────────
        # Purchase increases stock. Remove stale alerts for products now above
        # their low-stock threshold so replenished items disappear from alerts.
        # BATCH: single query for all items instead of N individual DELETEs.
        if calculated_items:
            prod_ids = [calc["product_id"] for calc in calculated_items]
            # BUG FIX: asyncpg expects a Python list for array parameters, not
            # a manually-formatted "{uuid1,uuid2}" string. The string format
            # worked with psycopg2 but fails with asyncpg (DataError: expected
            # a sized iterable container, got str). Passing the list directly
            # works with both drivers and is simpler.
            await db.execute(
                text("""
                    DELETE FROM low_stock_alerts la
                    USING products p
                    WHERE p.prod_id = la.product_id
                      AND la.product_id = ANY(CAST(:pids AS uuid[]))
                      AND la.business_id = CAST(:bid AS uuid)
                      AND p.prod_stock_qty > p.prod_low_stock_alert
                """),
                {"pids": prod_ids, "bid": business_id}
            )

        await db.commit()

        # Re-set GUCs after commit (set_config is transaction-scoped)
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


# ══════════════════════════════════════════════════════════════════
# POST /purchases/import → Bulk import purchases from CSV
#
# Each CSV row creates a single-item purchase. Supplier and product are
# resolved by phone/name and name/barcode respectively.
# Tax is calculated via the centralized tax_engine (same as create_purchase).
# ══════════════════════════════════════════════════════════════════
@router.post("/import/")
@router.post("/import")
async def import_purchases(
    file: UploadFile = File(...),
    current_user: dict = Depends(require_permission("purchases.create")),
    db: AsyncSession = Depends(get_async_db)
):
    business_id = current_user["business_id"]
    user_id = current_user["user_id"]

    # ── 1. Parse CSV ──────────────────────────────────────────────────────────
    file_bytes = await file.read()
    rows, fieldnames, parse_error = parse_csv_file(file_bytes)
    if parse_error:
        return error_response(parse_error, 400)

    header_error = check_required_headers(fieldnames, REQUIRED_PURCHASE_COLUMNS)
    if header_error:
        return error_response(header_error, 400)

    # ── 2. Row transform: validate & transform each row ────────────────────────
    def row_transform(row: dict, row_num: int):
        # Supplier identification
        supp_phone = (row.get("supp_phone") or row.get("supplier_phone") or row.get("Supplier Phone") or "").strip() or None
        supp_name = (row.get("supp_name") or row.get("supplier_name") or row.get("Supplier Name") or "").strip() or None

        # Product identification
        prod_name = (row.get("prod_name") or row.get("product_name") or row.get("Product Name") or "").strip()
        barcode = (row.get("barcode") or row.get("Barcode") or "").strip() or None

        if not prod_name and not barcode:
            return None, "product_name or barcode is required"

        # Quantities & prices
        qty_raw = row.get("qty") or row.get("quantity") or row.get("Qty") or row.get("Quantity")
        unit_price_raw = row.get("unit_price") or row.get("price") or row.get("Unit Price") or row.get("Price")

        if not qty_raw:
            return None, "quantity is required"
        if not unit_price_raw:
            return None, "unit_price is required"

        try:
            qty = int(float(qty_raw))
            # FIXED use Decimal(raw) instead of Decimal(str(float(...))) to avoid float rounding error
            unit_price = Decimal(unit_price_raw)
            if qty <= 0:
                return None, "quantity must be positive"
            if unit_price <= 0:
                return None, "unit_price must be positive"
        except (ValueError, TypeError):
            return None, "invalid quantity or unit_price"

        # Optional fields
        discount_raw = row.get("discount") or row.get("Discount") or "0"
        payment_status = (row.get("payment_status") or row.get("Payment Status") or "pending").strip().lower()
        notes = (row.get("notes") or row.get("Notes") or "").strip() or None

        try:
            discount = Decimal(discount_raw)
            if discount < 0:
                discount = Decimal("0")
        except (ValueError, TypeError):
            discount = Decimal("0")

        if payment_status not in ("pending", "paid", "partial"):
            payment_status = "pending"

        # Sanitize strings (CSV-safe: strips formula-injection characters)
        if supp_phone:
            supp_phone = strip_and_escape_csv_value(supp_phone)
        if supp_name:
            supp_name = strip_and_escape_csv_value(supp_name)
        if prod_name:
            prod_name = strip_and_escape_csv_value(prod_name)
        if barcode:
            barcode = strip_and_escape_csv_value(barcode)
        if notes:
            notes = strip_and_escape_csv_value(notes)

        return {
            "supp_phone": supp_phone,
            "supp_name": supp_name,
            "prod_name": prod_name,
            "barcode": barcode,
            "qty": qty,
            "unit_price": str(unit_price),
            "discount": str(discount),
            "payment_status": payment_status,
            "notes": notes,
            "_row_number": row_num
        }, None

    valid_rows, errors = validate_rows(rows, row_transform)

    # ── 3. Check bulk create tier limit ───────────────────────────────────────
    sub_type = current_user.get("subscription_type") or await fetch_subscription_type_async(db, business_id)
    # FIXED added date_column so monthly limit counting works for bulk imports
    allowed_count, limit_msg = await check_bulk_create_allowed(
        db, business_id, sub_type, "max_purchases_per_month", "purchases", len(valid_rows),
        date_column="pur_created_at",
    )
    if allowed_count == 0:
        return error_response(limit_msg, 403)

    if allowed_count < len(valid_rows):
        valid_rows = valid_rows[:allowed_count]
        errors.append({"row": 0, "message": limit_msg})

    # ── 4. Pre-resolve suppliers and products (batch queries) ─────────────────
    # Supplier lookup by phone
    supplier_map = {}
    phone_list = list(set(r["supp_phone"] for r in valid_rows if r.get("supp_phone")))
    if phone_list:
        placeholders = ", ".join([f":sp_{i}" for i in range(len(phone_list))])
        params = {"bid": business_id}
        for i, sp in enumerate(phone_list):
            params[f"sp_{i}"] = sp

        sup_rows = (await db.execute(text(f"""
            SELECT supp_id::text, supp_phone, supp_name, supp_state, supp_country_code
            FROM suppliers
            WHERE business_id = CAST(:bid AS uuid)
              AND supp_phone IN ({placeholders})
              AND is_deleted = false
        """), params)).fetchall()

        for r in sup_rows:
            key = r.supp_phone or str(r.supp_id)
            supplier_map[key] = str(r.supp_id)

    # Supplier lookup by name (only for rows without phone)
    name_list = list(set(r["supp_name"] for r in valid_rows if r.get("supp_name") and not r.get("supp_phone")))
    if name_list:
        placeholders = ", ".join([f":sn_{i}" for i in range(len(name_list))])
        params = {"bid": business_id}
        for i, sn in enumerate(name_list):
            params[f"sn_{i}"] = sn

        sup_rows = (await db.execute(text(f"""
            SELECT supp_id::text, supp_name
            FROM suppliers
            WHERE business_id = CAST(:bid AS uuid)
              AND supp_name IN ({placeholders})
              AND is_deleted = false
        """), params)).fetchall()

        for r in sup_rows:
            key = r.supp_name
            if key not in supplier_map:
                supplier_map[key] = str(r.supp_id)

    # Product lookup
    product_map = {}
    prod_name_list = list(set(r["prod_name"] for r in valid_rows if r.get("prod_name")))
    barcode_list = list(set(r["barcode"] for r in valid_rows if r.get("barcode") and not r.get("prod_name")))

    if prod_name_list:
        placeholders = ", ".join([f":pn_{i}" for i in range(len(prod_name_list))])
        params = {"bid": business_id}
        for i, pn in enumerate(prod_name_list):
            params[f"pn_{i}"] = pn.strip().lower()

        prod_rows = (await db.execute(text(f"""
            SELECT prod_id::text, prod_name, tax_rate, prod_cost_price
            FROM products
            WHERE business_id = CAST(:bid AS uuid)
              AND LOWER(TRIM(prod_name)) IN ({placeholders})
              AND is_deleted = false
        """), params)).fetchall()

        for r in prod_rows:
            product_map[r.prod_name.strip().lower()] = {
                "prod_id": str(r.prod_id),
                "tax_rate": float(r.tax_rate) if r.tax_rate is not None else 0.0,
                "cost_price": float(r.prod_cost_price) if r.prod_cost_price is not None else 0.0
            }

    if barcode_list:
        placeholders = ", ".join([f":pb_{i}" for i in range(len(barcode_list))])
        params = {"bid": business_id}
        for i, pb in enumerate(barcode_list):
            params[f"pb_{i}"] = pb

        prod_rows = (await db.execute(text(f"""
            SELECT prod_id::text, barcode, prod_name, tax_rate, prod_cost_price
            FROM products
            WHERE business_id = CAST(:bid AS uuid)
              AND barcode IN ({placeholders})
              AND is_deleted = false
        """), params)).fetchall()

        for r in prod_rows:
            key = r.barcode or r.prod_name
            product_map[key] = {
                "prod_id": str(r.prod_id),
                "tax_rate": float(r.tax_rate) if r.tax_rate is not None else 0.0,
                "cost_price": float(r.prod_cost_price) if r.prod_cost_price is not None else 0.0
            }

    # ── 5. Fetch business country/state for tax engine ────────────────────────
    biz = (await db.execute(text("""
        SELECT business_country_code, business_state
        FROM businesses WHERE business_id = CAST(:bid AS uuid)
    """), {"bid": business_id})).fetchone()

    biz_country = (biz.business_country_code or "").strip() if biz else ""
    biz_state = (biz.business_state or "").strip() if biz else ""

    # ── Batch supplier country/state lookup (same pattern as phone/name lookups above) ──
    supplier_info_map: dict[str, dict] = {}
    supp_id_list = list(set(supplier_map.values()))
    if supp_id_list:
        placeholders = ", ".join([f":si_{i}" for i in range(len(supp_id_list))])
        params = {"bid": business_id}
        for i, sid in enumerate(supp_id_list):
            params[f"si_{i}"] = sid
        sup_info_rows = (await db.execute(text(f"""
            SELECT supp_id::text, supp_country_code, supp_state
            FROM suppliers
            WHERE business_id = CAST(:bid AS uuid)
              AND supp_id::text IN ({placeholders})
        """), params)).fetchall()
        for r in sup_info_rows:
            supplier_info_map[str(r.supp_id)] = {
                "country": (r.supp_country_code or "").strip(),
                "state": (r.supp_state or "").strip(),
            }

    # ── 6. Create purchases ────────────────────────────────────────────────────
    created = 0
    purchase_errors = []

    for chunk in chunk_list(valid_rows):
        for row in chunk:
            row_num = row.pop("_row_number")

            # Resolve supplier
            supp_id = None
            if row.get("supp_phone"):
                supp_id = supplier_map.get(row["supp_phone"])
            elif row.get("supp_name"):
                supp_id = supplier_map.get(row["supp_name"])

            # Resolve product
            raw_key = row.get("prod_name")
            prod_key = raw_key.strip().lower() if raw_key else row.get("barcode")
            prod_info = product_map.get(prod_key) if prod_key else None
            if not prod_info:
                purchase_errors.append({"row": row_num, "message": "product not found"})
                continue

            try:
                async with db.begin_nested():
                    unit_price = Decimal(row["unit_price"])
                    qty = row["qty"]
                    tax_rate = Decimal(str(prod_info["tax_rate"]))
                    discount = Decimal(row.get("discount", "0"))
                    payment_status = row.get("payment_status", "pending")

                    # ── Tax calculation via centralized engine ──
                    # Resolve supplier country/state from in-memory cache
                    supp_country = ""
                    supp_state = ""
                    if supp_id and supp_id in supplier_info_map:
                        supp_country = supplier_info_map[supp_id]["country"]
                        supp_state = supplier_info_map[supp_id]["state"]

                    tax_calc = calculate_item_tax(
                        unit_price=unit_price, quantity=qty, tax_rate=tax_rate,
                        business_country_code=biz_country, business_state=biz_state,
                        counterparty_country_code=supp_country, counterparty_state=supp_state
                    )

                    # ── Insert purchase header ──
                    new_pur_id = str(uuid.uuid4())
                    await db.execute(text("""
                        INSERT INTO purchases (
                            pur_id, business_id, supp_id,
                            pur_total_amount, pur_discount,
                            pur_cgst_total, pur_sgst_total,
                            pur_igst_total, pur_tax_total,
                            pur_payment_status, created_by
                        ) VALUES (
                            CAST(:pur_id AS uuid), CAST(:bid AS uuid), CAST(:sid AS uuid),
                            :total_amount, :discount,
                            :cgst_total, :sgst_total,
                            :igst_total, :tax_total,
                            :payment_status, CAST(:uid AS uuid)
                        )
                    """), {
                        "pur_id": new_pur_id, "bid": business_id,
                        "sid": supp_id,
                        "total_amount": str(tax_calc["subtotal"]),
                        "discount": str(discount),
                        "cgst_total": str(tax_calc["cgst_amount"]),
                        "sgst_total": str(tax_calc["sgst_amount"]),
                        "igst_total": str(tax_calc["igst_amount"]),
                        "tax_total": str(tax_calc["generic_tax_total"]),
                        "payment_status": payment_status,
                        "uid": user_id
                    })

                    # ── Insert purchase item ──
                    await db.execute(text("""
                        INSERT INTO purchase_items (
                            item_id, business_id, pur_id, product_id,
                            pur_item_qty, item_unit_price,
                            gst_rate, cgst_amount, sgst_amount,
                            igst_amount, pur_tax_total
                        ) VALUES (
                            CAST(:item_id AS uuid), CAST(:bid AS uuid), CAST(:pur_id AS uuid),
                            CAST(:pid AS uuid),
                            :qty, :unit_price,
                            :gst_rate, :cgst_amount, :sgst_amount,
                            :igst_amount, :pur_tax_total
                        )
                    """), {
                        "item_id": str(uuid.uuid4()), "bid": business_id,
                        "pur_id": new_pur_id, "pid": prod_info["prod_id"],
                        "qty": qty, "unit_price": str(unit_price),
                        "gst_rate": str(tax_rate),
                        "cgst_amount": str(tax_calc["cgst_amount"]),
                        "sgst_amount": str(tax_calc["sgst_amount"]),
                        "igst_amount": str(tax_calc["igst_amount"]),
                        "pur_tax_total": str(tax_calc["generic_tax_total"])
                    })

                    # ── Update cost price (last-purchase-cost) ──
                    await db.execute(text("""
                        UPDATE products
                        SET prod_cost_price = :cost_price,
                            updated_by = CAST(:uid AS uuid)
                        WHERE prod_id = CAST(:pid AS uuid)
                          AND business_id = CAST(:bid AS uuid)
                    """), {
                        "cost_price": str(unit_price),
                        "pid": prod_info["prod_id"], "bid": business_id,
                        "uid": user_id
                    })

                    # ── Cleanup stale alerts ──
                    await db.execute(text("""
                        DELETE FROM low_stock_alerts la
                        USING products p
                        WHERE la.product_id = CAST(:pid AS uuid)
                          AND la.business_id = CAST(:bid AS uuid)
                          AND p.prod_id = CAST(:pid AS uuid)
                          AND p.business_id = CAST(:bid AS uuid)
                          AND p.is_deleted = false
                          AND p.prod_stock_qty > p.prod_low_stock_alert
                    """), {"pid": prod_info["prod_id"], "bid": business_id})

                    # ── Auto-expense if paid ──
                    if payment_status == "paid":
                        await db.execute(text("""
                            INSERT INTO expenses (
                                expense_id, business_id, expense_category,
                                expense_amount, expense_notes, created_by,
                                source_type, source_id
                            ) VALUES (
                                CAST(:eid AS uuid), CAST(:bid AS uuid),
                                'purchase', :amount, :notes,
                                CAST(:uid AS uuid), 'purchase',
                                CAST(:pid AS uuid)
                            )
                            ON CONFLICT (business_id, source_type, source_id)
                            WHERE is_deleted = false AND source_type IS NOT NULL
                            DO NOTHING
                        """), {
                            "eid": str(uuid.uuid4()), "bid": business_id,
                            "amount": str(tax_calc["subtotal"] - discount),
                            "notes": f"Auto-recorded from CSV bulk import {new_pur_id}",
                            "uid": user_id, "pid": new_pur_id
                        })

                    created += 1

            except Exception as e:
                purchase_errors.append({"row": row_num, "message": friendly_db_error(e, context=f"purchase row {row_num}")})

        await db.commit()
        await async_set_rls_gucs_after_commit(db, current_user)

    all_errors = errors + purchase_errors

    return success_response({
        "message": f"Import completed: {created} purchases created, {len(all_errors)} errors",
        "summary": {
            "total_rows": len(rows),
            "valid_rows": len(valid_rows),
            "created": created,
            "errors": len(all_errors)
        },
        "errors": all_errors
    })


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
    business_id = current_user["business_id"]

    SORTABLE = {
        "pur_created_at":     "p.pur_created_at",
        "pur_final_amount":   "p.pur_final_amount",
        "pur_payment_status": "p.pur_payment_status",
        "supp_name":          "s.supp_name",
        "updated_at":         "p.updated_at",
    }
    order_col = SORTABLE.get(sort_by, "p.pur_created_at")
    order_dir = "DESC" if str(sort_dir).lower() == "desc" else "ASC"

    extra_where = ""
    params      = {"bid": business_id}

    if search and search.strip():
        extra_where += " AND s.supp_name ILIKE :search"
        params["search"] = f"%{search.strip()}%"

    if status and status.strip():
        extra_where += " AND p.pur_payment_status = :status"
        params["status"] = status.strip()

    if date_from:
        extra_where += " AND p.pur_created_at >= :date_from"
        params["date_from"] = date_from

    if date_to:
        extra_where += " AND p.pur_created_at <= :date_to"
        params["date_to"] = date_to

    params["offset"] = pagination["offset"]
    params["limit"]  = pagination["limit"]

    list_sql = f"""
        SELECT p.pur_id, p.business_id, p.supp_id,
               s.supp_name,
               p.pur_total_amount, p.pur_discount,
               p.pur_cgst_total, p.pur_sgst_total, p.pur_igst_total,
               p.pur_tax_total, p.pur_final_amount,
               p.pur_payment_status,
               p.pur_created_at,
               p.updated_at,
               pr.full_name AS last_updated_by,
               COUNT(*) OVER() AS total_count
        FROM purchases p
        LEFT JOIN suppliers s ON s.supp_id = p.supp_id
        LEFT JOIN profiles pr ON pr.id = p.updated_by
        WHERE p.business_id = CAST(:bid AS uuid)
          AND p.is_deleted = false
        {extra_where}
        ORDER BY {order_col} {order_dir}
        OFFSET :offset LIMIT :limit
    """
    rows = (await db.execute(text(list_sql), params)).fetchall()
    total = rows[0].total_count if rows else 0

    result = []
    for row in rows:
        result.append(purchase_row_to_dict_list(row))

    return success_response(
        pagination_response(result, total, pagination["page"], pagination["limit"], capped=pagination["_capped"])
    )


# ─────────────────────────────────────────
# GET /purchases/summary → KPI summary for purchases page
# ─────────────────────────────────────────
@router.get("/summary")
async def get_purchase_summary_kpi(
    current_user: dict = Depends(require_permission("purchases.view")),
    db: AsyncSession = Depends(get_async_db)
):
    bid = current_user["business_id"]
    row = (await db.execute(text("""
        SELECT
            COUNT(*)                                                             AS total_count,
            COUNT(*) FILTER (WHERE date_trunc('month', pur_created_at) = date_trunc('month', CURRENT_DATE)) AS monthly_count,
            COUNT(*) FILTER (WHERE pur_payment_status IN ('pending','partial'))  AS pending_count,
            (SELECT COUNT(DISTINCT supp_id) FROM suppliers
              WHERE business_id = CAST(:bid AS uuid) AND is_deleted = false)     AS active_suppliers
        FROM purchases
        WHERE business_id = CAST(:bid AS uuid)
          AND is_deleted  = false
    """), {"bid": bid})).fetchone()

    return success_response({
        "total_count":       int(row.total_count),
        "monthly_count":     int(row.monthly_count),
        "pending_count":     int(row.pending_count),
        "active_suppliers":  int(row.active_suppliers),
    })


# ─────────────────────────────────────────
# GET /purchases/{pur_id} → Get one purchase
# Includes: purchase details + items + all returns for this purchase
# ─────────────────────────────────────────
@router.get("/{pur_id}")
async def get_purchase(
    pur_id: str,
    current_user: dict = Depends(require_permission("purchases.view")),
    db: AsyncSession = Depends(get_async_db)
):
    business_id = current_user["business_id"]

    row = (await db.execute(
        text("""
            SELECT p.pur_id, p.business_id, p.supp_id,
                   s.supp_name,
                   p.pur_total_amount, p.pur_discount,
                   p.pur_cgst_total, p.pur_sgst_total, p.pur_igst_total,
                   p.pur_tax_total, p.pur_final_amount,
                   p.pur_payment_status, p.is_deleted,
                   p.pur_created_at, p.updated_at, p.created_by,
                   pr.full_name AS last_updated_by
            FROM purchases p
            LEFT JOIN suppliers s  ON s.supp_id = p.supp_id
            LEFT JOIN profiles  pr ON pr.id      = p.updated_by
            WHERE p.pur_id      = :pid
              AND p.business_id = CAST(:bid AS uuid)
              AND p.is_deleted  = false
        """),
        {"pid": pur_id, "bid": business_id}
    )).fetchone()

    if not row:
        return error_response("Purchase not found", status_code=404)

    items = await fetch_purchase_items(db, pur_id, business_id)

    # Fetch all purchase returns for this purchase
    return_rows = (await db.execute(text("""
        SELECT
            pr.return_id,
            pr.pur_id,
            pr.return_reason,
            pr.return_status,
            pr.restock,
            pr.stock_updated,
            pr.refund_method,
            pr.approved_by,
            pr.approved_at,
            pr.rejected_reason,
            pr.return_amount,
            pr.return_created_at,
            pr.created_by,
            COALESCE(SUM(pri.return_item_subtotal), 0) AS total_refund_amount
        FROM purchase_returns pr
        LEFT JOIN purchase_return_items pri ON pri.return_id = pr.return_id
        WHERE pr.pur_id      = :pid
          AND pr.business_id = :bid
        GROUP BY pr.return_id, pr.pur_id, pr.return_reason,
                 pr.return_status, pr.restock, pr.stock_updated,
                 pr.refund_method, pr.approved_by, pr.approved_at,
                 pr.rejected_reason, pr.return_amount,
                 pr.return_created_at, pr.created_by
        ORDER BY pr.return_created_at DESC
    """), {"pid": pur_id, "bid": business_id})).fetchall()

    # BATCH: fetch ALL return items for all returns in one query
    ret_ids      = [str(ret.return_id) for ret in return_rows]
    all_ret_items = []
    if ret_ids:
        all_ret_items = (await db.execute(text("""
            SELECT
                pri.return_item_id, pri.return_id,
                pri.product_id, p.prod_name AS product_name,
                pri.return_qty, pri.refund_amount,
                pri.return_item_subtotal
            FROM purchase_return_items pri
            JOIN products p ON p.prod_id = pri.product_id
            WHERE pri.return_id = ANY(CAST(:ids AS uuid[]))
        # BUG FIX: asyncpg expects a Python list for array params, not a
        # manually-formatted "{uuid1,uuid2}" string (causes DataError).
        """), {"ids": ret_ids})).fetchall()

    ret_items_by_return = {}
    for ri in all_ret_items:
        key = str(ri.return_id)
        ret_items_by_return.setdefault(key, []).append(ri)

    returns = []
    for ret in return_rows:
        return_items = ret_items_by_return.get(str(ret.return_id), [])
        ret_dict = {
            "return_id":           str(ret.return_id),
            "pur_id":              str(ret.pur_id),
            "return_reason":       ret.return_reason,
            "return_status":       ret.return_status,
            "restock":             ret.restock,
            "stock_updated":       ret.stock_updated,
            "refund_method":       ret.refund_method,
            "approved_by":         str(ret.approved_by) if ret.approved_by else None,
            "approved_at":         fmt_ts(ret.approved_at),
            "rejected_reason":     ret.rejected_reason,
            "return_amount":       float(ret.return_amount) if ret.return_amount else 0.0,
            "return_created_at":   fmt_ts(ret.return_created_at),
            "created_by":          str(ret.created_by) if ret.created_by else None,
            "total_refund_amount": float(ret.total_refund_amount or 0),
            "items": [
                {
                    "return_item_id":       str(i.return_item_id),
                    "product_id":           str(i.product_id),
                    "product_name":         i.product_name,
                    "return_qty":           i.return_qty,
                    "refund_amount":        float(i.refund_amount or 0),
                    "return_item_subtotal": float(i.return_item_subtotal or 0) if i.return_item_subtotal else None
                }
                for i in return_items
            ]
        }
        returns.append(ret_dict)

    purchase_data = purchase_row_to_dict(row, items)
    purchase_data["returns"]             = returns
    purchase_data["total_returns"]       = len(returns)
    purchase_data["total_refund_amount"] = float(sum(r["return_amount"] for r in returns))

    return success_response(purchase_data)


# ─────────────────────────────────────────
# PATCH /purchases/{pur_id}/status → Update payment status
#
# When a purchase is manually marked as "paid", we auto-insert an expense
# record so the expenses ledger stays in sync.
# ─────────────────────────────────────────
@router.patch("/{pur_id}/status")
async def update_purchase_status(
    pur_id: str,
    body: PurchaseStatusUpdate,
    current_user: dict = Depends(require_permission("purchases.edit")),
    db: AsyncSession = Depends(get_async_db)
):
    status  = body.status
    allowed = ["pending", "paid", "partial"]
    if status not in allowed:
        return error_response(f"Status must be one of: {allowed}", 400)

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

    expense_created = False

    if status == "paid" and old_status != "paid":
        pur_row = (await db.execute(
            text("SELECT pur_final_amount FROM purchases WHERE pur_id = CAST(:pid AS uuid)"),
            {"pid": pur_id}
        )).fetchone()
        final_amount = Decimal(str(pur_row.pur_final_amount)) if pur_row and pur_row.pur_final_amount else Decimal("0")

        # Race-safe insert: the WHERE NOT EXISTS check runs inside the same
        # statement as the INSERT, so it sees the latest committed (or even
        # uncommitted within this transaction) state.  Combined with the
        # unique partial index (business_id, source_type, source_id) this
        # guarantees at most one expense per purchase.
        result = (await db.execute(
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
                ON CONFLICT (business_id, source_type, source_id)
                WHERE is_deleted = false AND source_type IS NOT NULL
                DO NOTHING
                RETURNING expense_id
            """),
            {
                "expense_id":       str(uuid.uuid4()),
                "business_id":      business_id,
                "expense_category": "purchase",
                "expense_amount":   str(final_amount),
                "expense_notes":    f"Auto-recorded from purchase {pur_id}",
                "created_by":       user_id,
                "source_type":      "purchase",
                "source_id":        pur_id
            }
        )).fetchone()
        expense_created = result is not None

    await db.commit()
    # RLS: SET LOCAL/set_config GUCs are transaction-scoped and are cleared
    # by this commit. Re-set them in case any future code adds a query after
    # this point (matches the convention in product.py, expense.py).
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
    current_user: dict = Depends(require_permission("purchases.delete")),
    db: AsyncSession = Depends(get_async_db)
):
    business_id = current_user["business_id"]
    user_id = current_user["user_id"]

    purchase = (await db.execute(select(Purchase).where(
        Purchase.pur_id      == pur_id,
        Purchase.business_id == business_id,
        Purchase.is_deleted  == False
    ))).scalar_one_or_none()

    if not purchase:
        return error_response("Purchase not found", status_code=404)

    purchase.is_deleted = True
    purchase.updated_by = user_id

    stock_warnings = []
    if reduce_stock:
        items = (await db.execute(text("""
            SELECT product_id, pur_item_qty FROM purchase_items
            WHERE pur_id = CAST(:pur_id AS uuid) AND business_id = CAST(:bid AS uuid)
        """), {"pur_id": pur_id, "bid": business_id})).fetchall()

        if items:
            prod_ids = [str(item.product_id) for item in items]

            # 1. Bulk SELECT: fetch current stock for all products at once
            product_rows = (await db.execute(
                text("""
                    SELECT prod_id, prod_stock_qty
                    FROM products
                    WHERE prod_id = ANY(CAST(:pids AS uuid[]))
                      AND business_id = CAST(:business_id AS uuid)
                """),
                # BUG FIX: asyncpg expects a Python list for array params, not a
                # manually-formatted "{uuid1,uuid2}" string (causes DataError).
                {"pids": prod_ids, "business_id": business_id}
            )).all()

            prod_stock_map = {str(row.prod_id): row.prod_stock_qty for row in product_rows}

            valid_items = [
                item for item in items
                if str(item.product_id) in prod_stock_map
            ]

            if valid_items:
                for item in valid_items:
                    pid = str(item.product_id)
                    current_stock = prod_stock_map.get(pid, 0)
                    if current_stock < item.pur_item_qty:
                        stock_warnings.append({
                            "product_id": pid,
                            "current_stock": current_stock,
                            "requested_reduction": item.pur_item_qty,
                            "note": "Stock already partially sold; reduced to 0 instead",
                        })

                # 2. Bulk UPDATE products using FROM (VALUES ...) — subtraction
                #    clamped to 0 so stock never goes negative.
                values_clause = ", ".join(
                    f"(CAST(:pid_{i} AS uuid), :qty_{i})"
                    for i in range(len(valid_items))
                )
                update_params = {"user_id": user_id, "business_id": business_id}
                for i, item in enumerate(valid_items):
                    update_params[f"pid_{i}"] = str(item.product_id)
                    update_params[f"qty_{i}"] = item.pur_item_qty

                await db.execute(
                    text(f"""
                        UPDATE products
                        SET prod_stock_qty = GREATEST(0, products.prod_stock_qty - v.reduce_qty),
                            updated_by = CAST(:user_id AS uuid)
                        FROM (VALUES {values_clause}) AS v(prod_id, reduce_qty)
                        WHERE products.prod_id = v.prod_id
                          AND products.business_id = CAST(:business_id AS uuid)
                    """),
                    update_params
                )

                # 3. Multi-row INSERT into stock_movements
                insert_values = ", ".join(
                    f"(CAST(:mid_{i} AS uuid), CAST(:bid AS uuid), CAST(:pid_{i} AS uuid), :mtype_{i}, :mqty_{i}, :mprev_{i}, CAST(:pref AS uuid), :mnotes_{i}, CAST(:cby AS uuid))"
                    for i in range(len(valid_items))
                )
                insert_params = {"bid": business_id, "pref": pur_id, "cby": user_id}
                for i, item in enumerate(valid_items):
                    pid = str(item.product_id)
                    insert_params[f"mid_{i}"] = str(uuid.uuid4())
                    insert_params[f"pid_{i}"] = pid
                    insert_params[f"mtype_{i}"] = "purchase_delete"
                    insert_params[f"mqty_{i}"] = -item.pur_item_qty
                    insert_params[f"mprev_{i}"] = prod_stock_map[pid]
                    insert_params[f"mnotes_{i}"] = f"Stock reduced from deleted purchase {purchase.pur_id}"

                await db.execute(
                    text(f"""
                        INSERT INTO stock_movements (
                            move_id, business_id, product_id,
                            move_type, move_qty, move_prev_stock,
                            purchase_reference_id, move_notes, move_created_by
                        ) VALUES {insert_values}
                    """),
                    insert_params
                )

    await db.commit()
    # RLS: SET LOCAL/set_config GUCs are transaction-scoped and are cleared
    # by this commit. Re-set them in case any future code adds a query after
    # this point (matches the convention in product.py, expense.py).
    await async_set_rls_gucs_after_commit(db, current_user)

    return success_response({
        "message": "Purchase deleted successfully",
        "warnings": stock_warnings,
    })