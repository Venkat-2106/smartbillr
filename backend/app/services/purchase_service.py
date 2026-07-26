from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, text
from decimal import Decimal
from app.models.product import Product
from app.models.supplier import Supplier
from app.utils.payment_helpers import calculate_payment_status
from app.utils.timestamp import fmt_ts
from datetime import datetime, timezone
import uuid


async def generate_purchase_number(db: AsyncSession, business_id: str) -> str:
    result = await db.execute(
        text("SELECT get_next_purchase_number(:bid) AS pur_invoice_no"),
        {"bid": business_id},
    )
    row = result.fetchone()
    if not row or not row.pur_invoice_no:
        raise Exception("Failed to generate purchase number — business counter not found")
    return row.pur_invoice_no


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
                   p.pur_invoice_no,
                   pr.full_name AS last_updated_by
            FROM purchases p
            LEFT JOIN suppliers s  ON s.supp_id   = p.supp_id
            LEFT JOIN profiles  pr ON pr.id        = p.updated_by
            WHERE p.pur_id = :pid
              AND p.business_id = CAST(:bid AS uuid)
        """),
        {"pid": pur_id, "bid": business_id}
    )).fetchone()


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


def purchase_row_to_dict(row, items):
    return {
        "pur_id":             str(row.pur_id),
        "business_id":        str(row.business_id),
        "supp_id":            str(row.supp_id) if row.supp_id else None,
        "supp_name":          row.supp_name if hasattr(row, "supp_name") else None,
        "pur_invoice_no":     row.pur_invoice_no if hasattr(row, "pur_invoice_no") else None,
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


def purchase_row_to_dict_list(row):
    return {
        "pur_id":             str(row.pur_id),
        "business_id":        str(row.business_id),
        "supp_id":            str(row.supp_id) if row.supp_id else None,
        "supp_name":          row.supp_name,
        "pur_invoice_no":     row.pur_invoice_no if hasattr(row, "pur_invoice_no") else None,
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


async def get_business_tax_context(db: AsyncSession, business_id: str):
    business = (await db.execute(
        text("""
            SELECT business_country_code, business_state, is_gst_registered
            FROM businesses
            WHERE business_id = CAST(:bid AS uuid)
        """),
        {"bid": business_id}
    )).fetchone()

    return {
        "country_code":    (business.business_country_code or "").strip()    if business else "",
        "state":           (business.business_state or "").strip()          if business else "",
        "gst_registered":  bool(business.is_gst_registered)                 if business else False,
    }


async def validate_supplier(db: AsyncSession, business_id: str, supp_id: str | None):
    if not supp_id:
        return None, "", ""
    supplier = (await db.execute(select(Supplier).where(
        Supplier.supp_id     == supp_id,
        Supplier.business_id == business_id,
        Supplier.is_deleted  == False
    ))).scalar_one_or_none()
    if not supplier:
        return None, None, None
    return supplier, (supplier.supp_country_code or "").strip(), (supplier.supp_state or "").strip()


def validate_purchase_products(
    items,
    product_cache,
    biz_country_code: str,
    biz_state: str,
    biz_gst_registered: bool,
    supp_country_code: str,
    supp_state: str,
):
    from app.utils.tax_engine import calculate_item_tax

    total_amount = Decimal("0")
    cgst_total   = Decimal("0")
    sgst_total   = Decimal("0")
    igst_total   = Decimal("0")
    tax_total    = Decimal("0")
    calculated_items = []

    for item in items:
        product = product_cache.get(str(item.product_id))
        if not product:
            return None, f"Product '{item.product_id}' not found"

        tax_rate = product.tax_rate or Decimal("0")

        tax_calc = calculate_item_tax(
            unit_price                = item.item_unit_price,
            quantity                  = item.pur_item_qty,
            tax_rate                  = tax_rate,
            business_country_code     = biz_country_code,
            business_state            = biz_state,
            counterparty_country_code = supp_country_code,
            counterparty_state        = supp_state,
            business_gst_registered   = biz_gst_registered,
        )

        total_amount += tax_calc["subtotal"]
        cgst_total   += tax_calc["cgst_amount"]
        sgst_total   += tax_calc["sgst_amount"]
        igst_total   += tax_calc["igst_amount"]
        tax_total    += tax_calc["generic_tax_total"]

        calculated_items.append({
            "product_id":        str(item.product_id),
            "quantity":          item.pur_item_qty,
            "unit_price":        str(item.item_unit_price),
            "tax_rate":          str(tax_rate),
            "cgst_amount":       str(tax_calc["cgst_amount"]),
            "sgst_amount":       str(tax_calc["sgst_amount"]),
            "igst_amount":       str(tax_calc["igst_amount"]),
            "pur_tax_total":     str(tax_calc["generic_tax_total"]),
            "cost_price_before": str(product.prod_cost_price) if product.prod_cost_price is not None else None,
        })

    return calculated_items, None


async def validate_and_cache_purchase_products(db: AsyncSession, business_id: str, items):
    requested_ids = [str(item.product_id) for item in items]
    products_bulk = (await db.execute(select(Product).where(
        Product.prod_id.in_(requested_ids),
        Product.business_id == business_id,
        Product.is_deleted  == False
    ))).scalars().all()
    return {str(p.prod_id): p for p in products_bulk}


async def insert_purchase_header(
    db: AsyncSession,
    business_id: str,
    user_id: str,
    new_pur_id: str,
    pur_invoice_no: str,
    data,
    calculated_items: list,
):
    total_amount = sum(Decimal(c["unit_price"]) * Decimal(c["quantity"]) for c in calculated_items)
    cgst_total   = sum(Decimal(c["cgst_amount"]) for c in calculated_items)
    sgst_total   = sum(Decimal(c["sgst_amount"]) for c in calculated_items)
    igst_total   = sum(Decimal(c["igst_amount"]) for c in calculated_items)
    tax_total    = sum(Decimal(c["pur_tax_total"]) for c in calculated_items)
    discount     = str(data.pur_discount or Decimal("0"))

    await db.execute(
        text("""
            INSERT INTO purchases (
                pur_id, business_id, supp_id,
                pur_total_amount, pur_discount,
                pur_cgst_total, pur_sgst_total,
                pur_igst_total, pur_tax_total,
                pur_payment_status, pur_invoice_no, created_by
            ) VALUES (
                CAST(:pur_id AS uuid),
                CAST(:business_id AS uuid),
                CAST(:supp_id AS uuid),
                :pur_total_amount, :pur_discount,
                :pur_cgst_total, :pur_sgst_total,
                :pur_igst_total, :pur_tax_total,
                :pur_payment_status, :pur_invoice_no,
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
            "pur_invoice_no":    pur_invoice_no,
            "created_by":        user_id
        }
    )


async def insert_purchase_items(
    db: AsyncSession,
    business_id: str,
    new_pur_id: str,
    calculated_items: list,
):
    if not calculated_items:
        return
    await db.execute(
        text("""
            INSERT INTO purchase_items (
                item_id, business_id, pur_id, product_id,
                pur_item_qty, item_unit_price,
                gst_rate, cgst_amount, sgst_amount,
                igst_amount, pur_tax_total,
                prod_cost_price_before_purchase
            ) VALUES (
                CAST(:item_id AS uuid),
                CAST(:business_id AS uuid),
                CAST(:pur_id AS uuid),
                CAST(:product_id AS uuid),
                :quantity, :unit_price,
                :gst_rate, :cgst_amount, :sgst_amount,
                :igst_amount, :pur_tax_total,
                :cost_price_before
            )
        """),
        [
            {
                "item_id":           str(uuid.uuid4()),
                "business_id":       business_id,
                "pur_id":            new_pur_id,
                "product_id":        calc["product_id"],
                "quantity":          calc["quantity"],
                "unit_price":        calc["unit_price"],
                "gst_rate":          calc["tax_rate"],
                "cgst_amount":       calc["cgst_amount"],
                "sgst_amount":       calc["sgst_amount"],
                "igst_amount":       calc["igst_amount"],
                "pur_tax_total":     calc["pur_tax_total"],
                "cost_price_before": calc["cost_price_before"],
            }
            for calc in calculated_items
        ]
    )


async def update_product_cost_prices(
    db: AsyncSession,
    business_id: str,
    user_id: str,
    calculated_items: list,
):
    if not calculated_items:
        return
    await db.execute(text("SELECT set_config('app.audit_source', 'purchase', true)"))
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


async def auto_record_purchase_payment(
    db: AsyncSession,
    business_id: str,
    user_id: str,
    new_pur_id: str,
    pur_final_amount: Decimal,
    payment_status: str,
    supplier_label: str,
    paid_amount: Decimal | None = None,
):
    from app.utils.payment_helpers import record_purchase_payment_and_sync_async

    if payment_status not in ("paid", "partial"):
        return

    amount_to_pay = pur_final_amount if payment_status == "paid" else (paid_amount or Decimal("0"))

    if payment_status == "partial" and amount_to_pay > pur_final_amount:
        return None, f"Payment amount {amount_to_pay} exceeds the purchase total of {pur_final_amount}."

    computed_status = calculate_payment_status(amount_to_pay, pur_final_amount)

    new_payment_id = await record_purchase_payment_and_sync_async(
        db              = db,
        business_id     = business_id,
        pur_id          = new_pur_id,
        payment_amount  = amount_to_pay,
        payment_method  = "cash",
        new_status      = computed_status,
        cumulative_paid = amount_to_pay
    )

    if amount_to_pay > 0:
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
                "expense_amount":   str(amount_to_pay),
                "expense_notes":    f"Purchase from {supplier_label} — {datetime.now(timezone.utc).strftime('%d %b %Y')}",
                "created_by":       user_id,
                "source_type":      "purchase_payment",
                "source_id":        new_payment_id
            }
        ))

    return new_payment_id, None


async def clean_low_stock_alerts(db: AsyncSession, business_id: str, calculated_items: list):
    if not calculated_items:
        return
    prod_ids = [calc["product_id"] for calc in calculated_items]
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


async def get_purchases_list(
    db: AsyncSession,
    business_id: str,
    pagination: dict,
    search: str | None,
    status: str | None,
    sort_by: str,
    sort_dir: str,
    date_from: str | None,
    date_to: str | None,
):
    SORTABLE = {
        "pur_created_at":     "p.pur_created_at",
        "pur_final_amount":   "p.pur_final_amount",
        "pur_payment_status": "p.pur_payment_status",
        "supp_name":          "s.supp_name",
        "pur_invoice_no":     "p.pur_invoice_no",
        "updated_at":         "p.updated_at",
    }
    order_col = SORTABLE.get(sort_by, "p.pur_created_at")
    order_dir = "DESC" if str(sort_dir).lower() == "desc" else "ASC"

    extra_where = ""
    params      = {"bid": business_id}

    if search and search.strip():
        extra_where += " AND (s.supp_name ILIKE :search OR p.pur_invoice_no ILIKE :search)"
        params["search"] = f"%{search.strip()}%"

    if status and status.strip():
        extra_where += " AND p.pur_payment_status = :status"
        params["status"] = status.strip()

    if date_from:
        extra_where += " AND p.pur_created_at >= :date_from"
        params["date_from"] = datetime.fromisoformat(date_from.replace("Z", ""))

    if date_to:
        extra_where += " AND p.pur_created_at <= :date_to"
        params["date_to"] = datetime.fromisoformat(date_to.replace("Z", ""))

    params["offset"] = pagination["offset"]
    params["limit"]  = pagination["limit"]

    list_sql = f"""
        SELECT p.pur_id, p.business_id, p.supp_id,
               s.supp_name,
               p.pur_total_amount, p.pur_discount,
               p.pur_cgst_total, p.pur_sgst_total, p.pur_igst_total,
               p.pur_tax_total, p.pur_final_amount,
               p.pur_payment_status, p.pur_invoice_no,
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

    result = [purchase_row_to_dict_list(row) for row in rows]
    return result, total


async def get_purchase_summary(db: AsyncSession, business_id: str):
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
    """), {"bid": business_id})).fetchone()

    return {
        "total_count":      int(row.total_count),
        "monthly_count":    int(row.monthly_count),
        "pending_count":    int(row.pending_count),
        "active_suppliers": int(row.active_suppliers),
    }


async def get_purchase_detail(db: AsyncSession, business_id: str, pur_id: str):
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
        return None

    items = await fetch_purchase_items(db, pur_id, business_id)

    pay_row = (await db.execute(
        text("""
            SELECT COALESCE(cumulative_paid, 0) AS total_paid
            FROM purchase_payments
            WHERE pur_id      = CAST(:pid AS uuid)
              AND business_id = CAST(:bid AS uuid)
              AND is_active   = true
        """),
        {"pid": pur_id, "bid": business_id}
    )).fetchone()
    total_paid = Decimal(str(pay_row.total_paid)) if pay_row and pay_row.total_paid else Decimal("0")
    pur_final  = Decimal(str(row.pur_final_amount)) if row.pur_final_amount else Decimal("0")
    remaining_balance = max(Decimal("0"), pur_final - total_paid)

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

    ret_ids = [str(ret.return_id) for ret in return_rows]
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
    purchase_data["returns"]       = returns
    purchase_data["total_returns"] = len(returns)

    total_refunded = Decimal(str(sum(
        r["return_amount"] for r in returns if r["return_status"] == "approved"
    )))
    purchase_data["total_refunded"]    = float(total_refunded)

    adjusted_remaining = max(Decimal("0"), pur_final - total_paid - total_refunded)
    purchase_data["total_paid"]        = float(total_paid)
    purchase_data["remaining_balance"] = float(adjusted_remaining)

    return purchase_data


async def get_active_payment(db: AsyncSession, pur_id: str, business_id: str):
    active_row = (await db.execute(
        text("""
            SELECT COALESCE(cumulative_paid, 0) AS already_paid
            FROM purchase_payments
            WHERE pur_id      = CAST(:pid AS uuid)
              AND business_id = CAST(:bid AS uuid)
              AND is_active   = true
        """),
        {"pid": pur_id, "bid": business_id}
    )).fetchone()
    return Decimal(str(active_row.already_paid)) if active_row else Decimal("0")


async def get_total_refunded(db: AsyncSession, pur_id: str, business_id: str):
    ref_row = (await db.execute(
        text("""
            SELECT COALESCE(SUM(return_amount), 0) AS total_refunded
            FROM purchase_returns
            WHERE pur_id        = CAST(:pid AS uuid)
              AND business_id   = CAST(:bid AS uuid)
              AND return_status = 'approved'
        """),
        {"pid": pur_id, "bid": business_id}
    )).fetchone()
    return Decimal(str(ref_row.total_refunded)) if ref_row and ref_row.total_refunded else Decimal("0")


async def update_purchase_status_paid(
    db: AsyncSession,
    business_id: str,
    user_id: str,
    pur_id: str,
):
    from app.utils.payment_helpers import record_purchase_payment_and_sync_async

    pur_row = await fetch_full_purchase(db, pur_id, business_id)
    final_amount = Decimal(str(pur_row.pur_final_amount)) if pur_row and pur_row.pur_final_amount else Decimal("0")
    supplier_label = pur_row.supp_name if pur_row and pur_row.supp_name else "Walk-in"

    already_paid = await get_active_payment(db, pur_id, business_id)
    total_refunded = await get_total_refunded(db, pur_id, business_id)

    remaining = max(Decimal("0"), final_amount - already_paid - total_refunded)

    if remaining > 0:
        new_cumulative = (already_paid + remaining).quantize(Decimal("0.01"))
        new_payment_id = await record_purchase_payment_and_sync_async(
            db              = db,
            business_id     = business_id,
            pur_id          = pur_id,
            payment_amount  = remaining,
            payment_method  = "cash",
            new_status      = "paid",
            cumulative_paid = new_cumulative
        )

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
                "expense_amount":   str(remaining),
                "expense_notes":    f"Purchase from {supplier_label} — {datetime.now(timezone.utc).strftime('%d %b %Y')}",
                "created_by":       user_id,
                "source_type":      "purchase_payment",
                "source_id":        new_payment_id
            }
        ))
        return True
    return False


async def delete_purchase_items_and_stock(
    db: AsyncSession,
    business_id: str,
    user_id: str,
    pur_id: str,
):
    from app.models.purchase import Purchase as PurchaseModel

    stock_warnings = []

    purchase = (await db.execute(select(PurchaseModel).where(
        PurchaseModel.pur_id      == pur_id,
        PurchaseModel.business_id == business_id,
        PurchaseModel.is_deleted  == False
    ))).scalar_one_or_none()

    if not purchase:
        return None, None

    purchase.is_deleted = True
    purchase.updated_by = user_id

    items = (await db.execute(text("""
        SELECT product_id, pur_item_qty, prod_cost_price_before_purchase
        FROM purchase_items
        WHERE pur_id = CAST(:pur_id AS uuid) AND business_id = CAST(:bid AS uuid)
    """), {"pur_id": pur_id, "bid": business_id})).fetchall()

    if items:
        prod_ids = [str(item.product_id) for item in items]

        product_rows = (await db.execute(
            text("""
                SELECT prod_id, prod_stock_qty
                FROM products
                WHERE prod_id = ANY(CAST(:pids AS uuid[]))
                  AND business_id = CAST(:business_id AS uuid)
            """),
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

            cost_items = [
                item for item in valid_items
                if getattr(item, "prod_cost_price_before_purchase", None) is not None
            ]
            if cost_items:
                cost_values = ", ".join(
                    f"(CAST(:cpid_{i} AS uuid), :cprice_{i})"
                    for i in range(len(cost_items))
                )
                cost_params = {"user_id": user_id, "business_id": business_id}
                for i, item in enumerate(cost_items):
                    cost_params[f"cpid_{i}"] = str(item.product_id)
                    cost_params[f"cprice_{i}"] = str(item.prod_cost_price_before_purchase)

                await db.execute(
                    text(f"""
                        UPDATE products
                        SET prod_cost_price = v.cost_price::numeric,
                            updated_by = CAST(:user_id AS uuid)
                        FROM (VALUES {cost_values}) AS v(prod_id, cost_price)
                        WHERE products.prod_id = v.prod_id::uuid
                          AND products.business_id = CAST(:business_id AS uuid)
                    """),
                    cost_params
                )

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

    return purchase, stock_warnings
