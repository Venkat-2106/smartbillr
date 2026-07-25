from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text, select
from decimal import Decimal
from app.models.product import Product
from app.models.sale import Sale

from app.utils.payment_helpers import record_payment_and_sync_async, calculate_payment_status
from app.utils.timestamp import fmt_ts
from datetime import datetime, timezone
import json
import uuid
import re


async def generate_invoice_number(db: AsyncSession, business_id: str) -> str:
    result = await db.execute(
        text("SELECT get_next_invoice_number(:bid) AS invoice_no"),
        {"bid": business_id}
    )
    row = result.fetchone()
    if not row or not row.invoice_no:
        raise Exception("Failed to generate invoice number — business counter not found")
    return row.invoice_no


async def validate_and_cache_products(db: AsyncSession, business_id: str, items, allow_stock_override: bool):
    requested_ids = [str(item.product_id) for item in items]
    result = await db.execute(
        select(Product).where(
            Product.prod_id.in_(requested_ids),
            Product.business_id == business_id,
            Product.is_deleted == False
        ).with_for_update()
    )
    products_bulk = result.scalars().all()
    product_cache = {str(p.prod_id): p for p in products_bulk}

    override_items = []
    stock_errors = []

    for item in items:
        product = product_cache.get(str(item.product_id))
        if not product:
            return None, None, [{"product_id": str(item.product_id), "error": "not_found"}]

        if product.prod_stock_qty < item.sale_item_quantity:
            if allow_stock_override:
                override_items.append({
                    "product": product,
                    "requested_qty": item.sale_item_quantity,
                    "available_qty": int(product.prod_stock_qty),
                })
            else:
                stock_errors.append({
                    "product_id": str(product.prod_id),
                    "product_name": product.prod_name,
                    "available_qty": int(product.prod_stock_qty),
                    "requested_qty": item.sale_item_quantity,
                    "shortfall": item.sale_item_quantity - int(product.prod_stock_qty),
                })

    return product_cache, override_items, stock_errors


def calculate_total_amount(items) -> Decimal:
    total = Decimal("0")
    for item in items:
        total += item.sale_item_unit_price * item.sale_item_quantity
    return total


async def create_sale_header(
    db: AsyncSession,
    business_id: str,
    user_id: str,
    new_sale_id: str,
    invoice_no: str,
    customer_id: str | None,
    total_amount: Decimal,
    discount: Decimal,
    payment_method: str,
    payment_status: str,
):
    # Accepts individual params (not a SaleCreate schema) so both the
    # create_sale route and the bulk CSV import can call it without
    # constructing a Pydantic model for every row.
    await db.execute(
        text("""
            INSERT INTO sales (
                sales_id, business_id, customer_id,
                invoice_no, sales_total_amount, sales_discount,
                sales_payment_method, sales_payment_status, created_by
            ) VALUES (
                CAST(:sales_id AS uuid),
                CAST(:business_id AS uuid),
                CAST(:customer_id AS uuid),
                :invoice_no, :sales_total_amount, :sales_discount,
                :sales_payment_method, :sales_payment_status,
                CAST(:created_by AS uuid)
            )
        """),
        {
            "sales_id": new_sale_id,
            "business_id": business_id,
            "customer_id": customer_id,
            "invoice_no": invoice_no,
            "sales_total_amount": str(total_amount),
            "sales_discount": str(discount),
            "sales_payment_method": payment_method,
            "sales_payment_status": payment_status,
            "created_by": user_id,
        }
    )


async def handle_stock_overrides(db: AsyncSession, business_id: str, user_id: str, new_sale_id: str, override_items: list):
    if not override_items:
        return

    # The fn_sale_stock_movement trigger will deduct stock naturally;
    # no compensating stock increase here — the override only bypasses
    # the insufficient-stock validation error. The stock_movements row
    # below records the override for audit purposes.

    # Multi-row INSERT into stock_movements — single round trip for all overrides
    insert_values = ", ".join(
        f"(CAST(:mid_{i} AS uuid), CAST(:bid AS uuid), CAST(:pid_{i} AS uuid), "
        f":mtype_{i}, :mqty_{i}, :mprev_{i}, CAST(:sref AS uuid), :mnotes_{i}, CAST(:cby AS uuid))"
        for i in range(len(override_items))
    )
    insert_params = {"bid": business_id, "sref": new_sale_id, "cby": user_id}
    for i, ov in enumerate(override_items):
        shortfall = ov["requested_qty"] - ov["available_qty"]
        avail = ov["available_qty"]
        insert_params[f"mid_{i}"] = str(uuid.uuid4())
        insert_params[f"pid_{i}"] = str(ov["product"].prod_id)
        insert_params[f"mtype_{i}"] = "stock_override"
        insert_params[f"mqty_{i}"] = shortfall
        insert_params[f"mprev_{i}"] = avail
        insert_params[f"mnotes_{i}"] = (
            f"System-generated stock increase to allow a sale exceeding available inventory — "
            f"{shortfall} unit(s) added (stock was {avail}, needed {ov['requested_qty']})"
        )

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


async def insert_sale_items(db: AsyncSession, business_id: str, new_sale_id: str, items, product_cache: dict):
    if not items:
        return
    value_clauses = []
    value_params = {}
    for idx, item in enumerate(items):
        product = product_cache[str(item.product_id)]
        item_mrp = str(product.prod_mrp) if product.prod_mrp is not None else None
        cost_price = str(product.prod_cost_price) if product.prod_cost_price is not None else None
        # Pass frontend tax_rate to DB when provided (including zero — lets the
        # user explicitly override a product's master rate).  The DB trigger
        # fn_sale_stock_movement only uses NEW.gst_rate when > 0; a NULL
        # gst_rate still causes the trigger to fall back to the product's
        # master tax_rate.
        gst_rate = str(item.tax_rate) if item.tax_rate is not None else None
        value_clauses.append(
            f"(:bid_{idx}, :sid_{idx}, :pid_{idx}, :qty_{idx}, :price_{idx}, :mrp_{idx}, :cost_{idx}, :gst_{idx})"
        )
        value_params[f"bid_{idx}"] = business_id
        value_params[f"sid_{idx}"] = new_sale_id
        value_params[f"pid_{idx}"] = str(item.product_id)
        value_params[f"qty_{idx}"] = item.sale_item_quantity
        value_params[f"price_{idx}"] = str(item.sale_item_unit_price)
        value_params[f"mrp_{idx}"] = item_mrp
        value_params[f"cost_{idx}"] = cost_price
        value_params[f"gst_{idx}"] = gst_rate

    await db.execute(
        text(f"""
            INSERT INTO sale_items (
                business_id, sale_id, product_id,
                sale_item_quantity, sale_item_unit_price,
                item_mrp, sale_item_cost_price_at_sale, gst_rate
            ) VALUES
            {','.join(value_clauses)}
        """),
        value_params
    )


async def update_sale_tax_totals(db: AsyncSession, new_sale_id: str) -> Decimal:
    result = await db.execute(
        text("""
            UPDATE sales
            SET
                cgst_total = x.c,
                sgst_total = x.s,
                igst_total = x.i,
                tax_total  = x.t
            FROM (
                SELECT
                    COALESCE(SUM(cgst_amount), 0) AS c,
                    COALESCE(SUM(sgst_amount), 0) AS s,
                    COALESCE(SUM(igst_amount), 0) AS i,
                    COALESCE(SUM(tax_amount),  0) AS t
                FROM sale_items
                WHERE sale_id = CAST(:sid AS uuid)
            ) x
            WHERE sales_id = CAST(:sid AS uuid)
            RETURNING sales_final_amount
        """),
        {"sid": new_sale_id}
    )
    row = result.fetchone()
    return Decimal(str(row.sales_final_amount)) if row and row.sales_final_amount else Decimal("0")


async def auto_record_payment(
    db: AsyncSession,
    business_id: str,
    new_sale_id: str,
    final_amount: Decimal,
    payment_status: str,
    payment_method: str = "cash",
    paid_amount: Decimal | None = None,
):
    # Accepts individual params (not SaleCreate) so both create_sale and
    # import_sales can share this function.  import_sales passes values
    # from CSV row dicts directly.
    if payment_status not in ("paid", "partial"):
        return

    if payment_status == "paid":
        await record_payment_and_sync_async(
            db=db,
            business_id=business_id,
            sale_id=new_sale_id,
            payment_amount=final_amount,
            payment_method=payment_method,
            new_status="paid",
            cumulative_paid=final_amount,
        )
    elif payment_status == "partial" and paid_amount and paid_amount > 0:
        paid = paid_amount
        if paid >= final_amount:
            await record_payment_and_sync_async(
                db=db,
                business_id=business_id,
                sale_id=new_sale_id,
                payment_amount=final_amount,
                payment_method=payment_method,
                new_status="paid",
                cumulative_paid=final_amount,
            )
        else:
            await record_payment_and_sync_async(
                db=db,
                business_id=business_id,
                sale_id=new_sale_id,
                payment_amount=paid.quantize(Decimal("0.01")),
                payment_method=payment_method,
                new_status="partial",
                cumulative_paid=paid.quantize(Decimal("0.01")),
            )


def parse_sale_error(error_msg: str) -> str:
    if "Insufficient stock" in error_msg:
        match = re.search(r"Insufficient stock[^\n\"\\]+", error_msg)
        return match.group(0).strip() if match else "Insufficient stock for one or more items"
    return "An unexpected error occurred. Please try again."


async def get_sales_list(db: AsyncSession, business_id: str, pagination: dict, search: str, status: str, date_from: str, date_to: str, sort_by: str, sort_dir: str):
    SORTABLE = {
        "sales_created_at": "s.sales_created_at",
        "invoice_no": "s.invoice_no",
        "customer_name": "c.cust_name",
        "sales_final_amount": "s.sales_final_amount",
        "sales_payment_status": "s.sales_payment_status",
        "sales_payment_method": "s.sales_payment_method",
        "updated_at": "s.updated_at",
    }
    order_col = SORTABLE.get(sort_by, "s.sales_created_at")
    order_dir = "DESC" if str(sort_dir).lower() == "desc" else "ASC"

    extra_where = ""
    params = {
        "bid": business_id,
        "offset": pagination["offset"],
        "limit": pagination["limit"],
    }

    if search:
        extra_where += " AND (s.invoice_no ILIKE :search OR c.cust_name ILIKE :search)"
        params["search"] = f"%{search}%"

    if status and status != "all":
        extra_where += " AND s.sales_payment_status = :status"
        params["status"] = status

    if date_from:
        extra_where += " AND s.sales_created_at >= :date_from"
        params["date_from"] = datetime.fromisoformat(date_from.replace("Z", ""))

    if date_to:
        extra_where += " AND s.sales_created_at <= :date_to"
        params["date_to"] = datetime.fromisoformat(date_to.replace("Z", ""))

    data_sql = f"""
        SELECT s.sales_id, s.invoice_no, s.customer_id,
               c.cust_name        AS customer_name,
               s.sales_total_amount, s.sales_final_amount,
               s.cgst_total, s.sgst_total, s.igst_total, s.tax_total,
               s.sales_payment_status, s.sales_payment_method,
               s.sales_created_at,
               s.updated_at,
               prof.full_name AS last_updated_by,
               COUNT(*) OVER() AS total_count,
               active_pay.cumulative_paid
        FROM sales s
        LEFT JOIN customers c ON c.cust_id = s.customer_id
        LEFT JOIN profiles prof ON prof.id = s.updated_by
        LEFT JOIN (
            SELECT DISTINCT ON (pay.sale_id)
                pay.sale_id,
                COALESCE(pay.cumulative_paid, 0) AS cumulative_paid,
                pay.payment_status
            FROM payments pay
            WHERE pay.is_active = true
            ORDER BY pay.sale_id, pay.payment_paid_at DESC
        ) active_pay ON active_pay.sale_id = s.sales_id
        WHERE s.business_id = CAST(:bid AS uuid)
          AND s.is_deleted  = false
        {extra_where}
        ORDER BY {order_col} {order_dir}
        OFFSET :offset LIMIT :limit
    """
    result = await db.execute(text(data_sql), params)
    rows = result.fetchall()
    total = rows[0].total_count if rows else 0

    result_list = []
    for r in rows:
        sale_final = Decimal(str(r.sales_final_amount)) if r.sales_final_amount else Decimal("0")
        total_paid_dec = Decimal(str(r.cumulative_paid)) if r.cumulative_paid else Decimal("0")
        remaining = sale_final - total_paid_dec

        result_list.append({
            "sales_id": str(r.sales_id),
            "invoice_no": r.invoice_no,
            "customer_id": str(r.customer_id) if r.customer_id else None,
            "customer_name": r.customer_name or None,
            "sales_total_amount": str(r.sales_total_amount),
            "sales_final_amount": str(r.sales_final_amount) if r.sales_final_amount else None,
            "cgst_total": str(r.cgst_total) if r.cgst_total else None,
            "sgst_total": str(r.sgst_total) if r.sgst_total else None,
            "igst_total": str(r.igst_total) if r.igst_total else None,
            "tax_total": str(r.tax_total) if r.tax_total else None,
            "sales_payment_status": r.sales_payment_status,
            "sales_payment_method": r.sales_payment_method,
            "total_paid": str(total_paid_dec),
            "remaining_balance": str(remaining) if remaining > 0 else "0",
            "sales_created_at": fmt_ts(r.sales_created_at),
            "updated_at": fmt_ts(r.updated_at) if hasattr(r, "updated_at") else None,
            "last_updated_by": r.last_updated_by if hasattr(r, "last_updated_by") else None,
        })

    return result_list, total


async def get_sale_detail(db: AsyncSession, business_id: str, sales_id: str):
    result = await db.execute(
        text("""
            WITH sale_cte AS (
                SELECT s.sales_id, s.business_id, s.customer_id,
                       c.cust_name AS customer_name, s.invoice_no,
                       s.sales_total_amount, s.sales_discount,
                       s.cgst_total, s.sgst_total, s.igst_total, s.tax_total,
                       s.sales_final_amount, s.sales_payment_method,
                       s.sales_payment_status,
                       to_char(s.sales_created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS sales_created_at
                FROM sales s
                LEFT JOIN customers c ON c.cust_id = s.customer_id
                WHERE s.sales_id    = CAST(:sid AS uuid)
                  AND s.business_id = CAST(:bid AS uuid)
                  AND s.is_deleted  = false
            ),
            items_cte AS (
                SELECT si.sale_item_id, si.product_id,
                       p.prod_name AS product_name,
                       si.sale_item_quantity, si.sale_item_unit_price,
                       si.item_mrp, si.sale_item_subtotal, si.cgst_amount,
                       si.sgst_amount, si.igst_amount, si.tax_amount,
                       si.item_tax_total, si.item_total_with_tax
                FROM sale_items si
                LEFT JOIN products p ON p.prod_id = si.product_id
                WHERE si.sale_id     = CAST(:sid AS uuid)
                  AND si.business_id = CAST(:bid AS uuid)
            ),
            payment_cte AS (
                SELECT COALESCE(cumulative_paid, 0) AS total_paid, payment_status
                FROM payments
                WHERE sale_id     = CAST(:sid AS uuid)
                  AND business_id = CAST(:bid AS uuid)
                  AND is_active   = true
            )
            SELECT
                (SELECT row_to_json(sale_cte)::text FROM sale_cte) AS sale_json,
                (SELECT COALESCE(json_agg(items_cte), '[]'::json)::text
                                                       FROM items_cte) AS items_json,
                (SELECT row_to_json(payment_cte)::text FROM payment_cte) AS payment_json
        """),
        {"sid": sales_id, "bid": business_id}
    )
    row = result.fetchone()

    if not row or not row.sale_json:
        return None

    sale = json.loads(row.sale_json, parse_float=Decimal)
    items = json.loads(row.items_json, parse_float=Decimal)
    active_payment = json.loads(row.payment_json, parse_float=Decimal) if row.payment_json else None

    sale_final = Decimal(str(sale["sales_final_amount"])) if sale["sales_final_amount"] else Decimal("0")
    total_paid = Decimal(str(active_payment["total_paid"])) if active_payment else Decimal("0")
    remaining = (sale_final - total_paid).quantize(Decimal("0.01"))

    items_data = []
    for i in items:
        item_mrp_val = Decimal(str(i["item_mrp"])) if i["item_mrp"] is not None else None
        unit_price = Decimal(str(i["sale_item_unit_price"]))
        qty = i["sale_item_quantity"]

        if item_mrp_val is not None and item_mrp_val > unit_price:
            discount_per_unit = (item_mrp_val - unit_price).quantize(Decimal("0.01"))
            discount_amount = (discount_per_unit * qty).quantize(Decimal("0.01"))
            discount_pct = ((discount_per_unit / item_mrp_val) * 100).quantize(Decimal("0.1"))
        else:
            discount_per_unit = None
            discount_amount = None
            discount_pct = None

        items_data.append({
            "sale_item_id": str(i["sale_item_id"]),
            "product_id": str(i["product_id"]),
            "product_name": i["product_name"] or "Unknown Product",
            "sale_item_quantity": qty,
            "sale_item_unit_price": str(i["sale_item_unit_price"]),
            "item_mrp": str(i["item_mrp"]) if i["item_mrp"] is not None else None,
            "item_discount_amount": str(discount_amount) if discount_amount is not None else None,
            "item_discount_pct": str(discount_pct) if discount_pct is not None else None,
            "sale_item_subtotal": str(i["sale_item_subtotal"]) if i["sale_item_subtotal"] else None,
            "cgst_amount": str(i["cgst_amount"]) if i["cgst_amount"] else None,
            "sgst_amount": str(i["sgst_amount"]) if i["sgst_amount"] else None,
            "igst_amount": str(i["igst_amount"]) if i["igst_amount"] else None,
            "tax_amount": str(i["tax_amount"]) if i["tax_amount"] else None,
            "item_tax_total": str(i["item_tax_total"]) if i["item_tax_total"] else None,
            "item_total_with_tax": str(i["item_total_with_tax"]) if i["item_total_with_tax"] else None,
        })

    return {
        "sales_id": str(sale["sales_id"]),
        "business_id": str(sale["business_id"]),
        "customer_id": str(sale["customer_id"]) if sale["customer_id"] else None,
        "customer_name": sale["customer_name"],
        "invoice_no": sale["invoice_no"],
        "sales_total_amount": str(sale["sales_total_amount"]),
        "sales_discount": str(sale["sales_discount"]),
        "cgst_total": str(sale["cgst_total"]) if sale["cgst_total"] else None,
        "sgst_total": str(sale["sgst_total"]) if sale["sgst_total"] else None,
        "igst_total": str(sale["igst_total"]) if sale["igst_total"] else None,
        "tax_total": str(sale["tax_total"]) if sale["tax_total"] else None,
        "sales_final_amount": str(sale["sales_final_amount"]) if sale["sales_final_amount"] else None,
        "sales_payment_method": sale["sales_payment_method"],
        "sales_payment_status": sale["sales_payment_status"],
        "sales_created_at": sale["sales_created_at"],
        "items": items_data,
        "total_paid": str(total_paid),
        "remaining_balance": str(remaining) if remaining > 0 else "0",
    }


async def get_sale_final_amount(db: AsyncSession, sales_id: str, business_id: str) -> Decimal:
    result = await db.execute(
        text("SELECT sales_final_amount FROM sales WHERE sales_id = CAST(:sid AS uuid) AND business_id = CAST(:bid AS uuid)"),
        {"sid": sales_id, "bid": business_id}
    )
    sale_row = result.fetchone()
    return Decimal(str(sale_row.sales_final_amount)) if sale_row and sale_row.sales_final_amount else Decimal("0")


async def get_sale_active_payment(db: AsyncSession, sales_id: str, business_id: str) -> Decimal:
    result = await db.execute(
        text("""
            SELECT COALESCE(cumulative_paid, 0) AS already_paid
            FROM payments
            WHERE sale_id  = CAST(:sid AS uuid)
              AND business_id = CAST(:bid AS uuid)
              AND is_active = true
        """),
        {"sid": sales_id, "bid": business_id}
    )
    row = result.fetchone()
    return Decimal(str(row.already_paid)) if row else Decimal("0")


async def update_sale_status(db: AsyncSession, sales_id: str, status: str, business_id: str):
    await db.execute(
        text("UPDATE sales SET sales_payment_status = :status WHERE sales_id = CAST(:sid AS uuid) AND business_id = CAST(:bid AS uuid)"),
        {"status": status, "sid": sales_id, "bid": business_id}
    )


async def update_payment_status(db: AsyncSession, sales_id: str, status: str, business_id: str):
    await db.execute(
        text("""
            UPDATE payments SET payment_status = :status
            WHERE sale_id = CAST(:sid AS uuid) AND business_id = CAST(:bid AS uuid) AND is_active = true
        """),
        {"status": status, "sid": sales_id, "bid": business_id}
    )