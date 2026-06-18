from sqlalchemy.orm import Session
from sqlalchemy import text
from decimal import Decimal
from app.models.product import Product
from app.models.sale import Sale
from app.schemas.sale import SaleCreate
from app.utils.payment_helpers import record_payment_and_sync, calculate_payment_status
from app.utils.timestamp import fmt_ts
import uuid
import re


def generate_invoice_number(db: Session, business_id: str) -> str:
    result = db.execute(
        text("SELECT get_next_invoice_number(:bid) AS invoice_no"),
        {"bid": business_id}
    ).fetchone()
    if not result or not result.invoice_no:
        raise Exception("Failed to generate invoice number — business counter not found")
    return result.invoice_no


def validate_and_cache_products(db: Session, business_id: str, items, allow_stock_override: bool):
    requested_ids = [str(item.product_id) for item in items]
    products_bulk = db.query(Product).filter(
        Product.prod_id.in_(requested_ids),
        Product.business_id == business_id,
        Product.is_deleted == False
    ).all()
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


def create_sale_header(db: Session, business_id: str, user_id: str, new_sale_id: str, invoice_no: str, data: SaleCreate, total_amount: Decimal, discount: Decimal):
    db.execute(
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
            "customer_id": str(data.customer_id) if data.customer_id else None,
            "invoice_no": invoice_no,
            "sales_total_amount": str(total_amount),
            "sales_discount": str(discount),
            "sales_payment_method": data.sales_payment_method,
            "sales_payment_status": data.sales_payment_status,
            "created_by": user_id,
        }
    )


def handle_stock_overrides(db: Session, business_id: str, user_id: str, new_sale_id: str, override_items: list):
    for ov in override_items:
        product = ov["product"]
        avail = ov["available_qty"]
        shortfall = ov["requested_qty"] - avail

        db.execute(
            text("""
                UPDATE products
                SET prod_stock_qty = prod_stock_qty + :shortfall
                WHERE prod_id = CAST(:product_id AS uuid)
            """),
            {"shortfall": shortfall, "product_id": str(product.prod_id)}
        )

        db.execute(
            text("""
                INSERT INTO stock_movements (
                    business_id, product_id,
                    move_type, move_qty, move_prev_stock,
                    sale_reference_id, move_notes, move_created_by
                ) VALUES (
                    CAST(:business_id AS uuid),
                    CAST(:product_id AS uuid),
                    'adjustment',
                    :move_qty,
                    :move_prev_stock,
                    CAST(:sale_ref AS uuid),
                    :move_notes,
                    CAST(:created_by AS uuid)
                )
            """),
            {
                "business_id": business_id,
                "product_id": str(product.prod_id),
                "move_qty": shortfall,
                "move_prev_stock": avail,
                "sale_ref": new_sale_id,
                "move_notes": (
                    f"Manual stock adjustment during sale override — {shortfall} unit(s) added to fulfil order "
                    f"(stock was {avail}, needed {ov['requested_qty']})"
                ),
                "created_by": user_id,
            }
        )


def insert_sale_items(db: Session, business_id: str, new_sale_id: str, items, product_cache: dict):
    if not items:
        return
    value_clauses = []
    value_params = {}
    for idx, item in enumerate(items):
        product = product_cache[str(item.product_id)]
        item_mrp = str(product.prod_mrp) if product.prod_mrp is not None else None
        value_clauses.append(
            f"(:bid_{idx}, :sid_{idx}, :pid_{idx}, :qty_{idx}, :price_{idx}, :mrp_{idx})"
        )
        value_params[f"bid_{idx}"] = business_id
        value_params[f"sid_{idx}"] = new_sale_id
        value_params[f"pid_{idx}"] = str(item.product_id)
        value_params[f"qty_{idx}"] = item.sale_item_quantity
        value_params[f"price_{idx}"] = str(item.sale_item_unit_price)
        value_params[f"mrp_{idx}"] = item_mrp

    db.execute(
        text(f"""
            INSERT INTO sale_items (
                business_id, sale_id, product_id,
                sale_item_quantity, sale_item_unit_price,
                item_mrp
            ) VALUES
            {','.join(value_clauses)}
        """),
        value_params
    )


def update_sale_tax_totals(db: Session, new_sale_id: str):
    db.execute(
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
        """),
        {"sid": new_sale_id}
    )


def auto_record_payment(db: Session, business_id: str, new_sale_id: str, data: SaleCreate, total_amount: Decimal):
    if data.sales_payment_status not in ("paid", "partial"):
        return

    sale_row = db.execute(
        text("SELECT sales_final_amount FROM sales WHERE sales_id = CAST(:sid AS uuid)"),
        {"sid": new_sale_id}
    ).fetchone()
    final_amount = (
        float(sale_row.sales_final_amount)
        if sale_row and sale_row.sales_final_amount
        else float(total_amount)
    )

    if data.sales_payment_status == "paid":
        record_payment_and_sync(
            db=db,
            business_id=business_id,
            sale_id=new_sale_id,
            sale_final=final_amount,
            payment_amount=final_amount,
            payment_method=data.sales_payment_method or "cash",
            new_status="paid",
            cumulative_paid=final_amount,
        )
    elif data.sales_payment_status == "partial" and data.paid_amount and float(data.paid_amount) > 0:
        paid = float(data.paid_amount)
        if paid >= final_amount:
            record_payment_and_sync(
                db=db,
                business_id=business_id,
                sale_id=new_sale_id,
                sale_final=final_amount,
                payment_amount=final_amount,
                payment_method=data.sales_payment_method or "cash",
                new_status="paid",
                cumulative_paid=final_amount,
            )
        else:
            record_payment_and_sync(
                db=db,
                business_id=business_id,
                sale_id=new_sale_id,
                sale_final=final_amount,
                payment_amount=round(paid, 2),
                payment_method=data.sales_payment_method or "cash",
                new_status="partial",
                cumulative_paid=round(paid, 2),
            )


def parse_sale_error(error_msg: str) -> str:
    if "Insufficient stock" in error_msg:
        match = re.search(r"Insufficient stock[^\n\"\\]+", error_msg)
        return match.group(0).strip() if match else "Insufficient stock for one or more items"
    return "An unexpected error occurred. Please try again."


def get_sales_list(db: Session, business_id: str, pagination: dict, search: str, status: str, date_from: str, date_to: str, sort_by: str, sort_dir: str):
    SORTABLE = {
        "sales_created_at": "s.sales_created_at",
        "invoice_no": "s.invoice_no",
        "customer_name": "c.cust_name",
        "sales_final_amount": "s.sales_final_amount",
        "sales_payment_status": "s.sales_payment_status",
        "sales_payment_method": "s.sales_payment_method",
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
        params["date_from"] = date_from

    if date_to:
        extra_where += " AND s.sales_created_at <= :date_to"
        params["date_to"] = date_to

    data_sql = f"""
        SELECT s.sales_id, s.invoice_no, s.customer_id,
               c.cust_name        AS customer_name,
               s.sales_total_amount, s.sales_final_amount,
               s.cgst_total, s.sgst_total, s.igst_total, s.tax_total,
               s.sales_payment_status, s.sales_payment_method,
               s.sales_created_at,
               COUNT(*) OVER() AS total_count,
               pay.cumulative_paid,
               pay.payment_status AS pay_status
        FROM sales s
        LEFT JOIN customers c ON c.cust_id = s.customer_id
        LEFT JOIN LATERAL (
            SELECT COALESCE(cumulative_paid, 0) AS cumulative_paid,
                   payment_status
            FROM payments
            WHERE sale_id = s.sales_id
              AND is_active = true
            LIMIT 1
        ) pay ON true
        WHERE s.business_id = CAST(:bid AS uuid)
          AND s.is_deleted  = false
        {extra_where}
        ORDER BY {order_col} {order_dir}
        OFFSET :offset LIMIT :limit
    """
    rows = db.execute(text(data_sql), params).fetchall()
    total = rows[0].total_count if rows else 0

    result = []
    for r in rows:
        sale_final = float(r.sales_final_amount) if r.sales_final_amount else 0.0
        total_paid = float(r.cumulative_paid) if r.cumulative_paid else 0.0
        remaining = round(sale_final - total_paid, 2)

        result.append({
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
            "total_paid": round(total_paid, 2),
            "remaining_balance": remaining if remaining > 0 else 0,
            "sales_created_at": fmt_ts(r.sales_created_at),
        })

    return result, total


def get_sale_detail(db: Session, business_id: str, sales_id: str):
    sale = db.execute(
        text("""
            SELECT s.sales_id, s.business_id, s.customer_id,
                   c.cust_name        AS customer_name,
                   s.invoice_no,
                   s.sales_total_amount, s.sales_discount,
                   s.cgst_total, s.sgst_total, s.igst_total, s.tax_total,
                   s.sales_final_amount, s.sales_payment_method,
                   s.sales_payment_status, s.sales_created_at
            FROM sales s
            LEFT JOIN customers c ON c.cust_id = s.customer_id
            WHERE s.sales_id    = CAST(:sid AS uuid)
              AND s.business_id = CAST(:bid AS uuid)
              AND s.is_deleted  = false
        """),
        {"sid": sales_id, "bid": business_id}
    ).fetchone()

    if not sale:
        return None

    items = db.execute(
        text("""
            SELECT si.sale_item_id, si.product_id,
                   p.prod_name         AS product_name,
                   si.sale_item_quantity, si.sale_item_unit_price,
                   si.item_mrp,
                   si.sale_item_subtotal, si.cgst_amount, si.sgst_amount,
                   si.igst_amount, si.tax_amount, si.item_tax_total, si.item_total_with_tax
            FROM sale_items si
            LEFT JOIN products p ON p.prod_id = si.product_id
            WHERE si.sale_id = CAST(:sid AS uuid)
        """),
        {"sid": sales_id}
    ).fetchall()

    active_payment = db.execute(
        text("""
            SELECT COALESCE(cumulative_paid, 0) AS total_paid,
                   payment_status
            FROM payments
            WHERE sale_id  = CAST(:sid AS uuid)
              AND is_active = true
        """),
        {"sid": sales_id}
    ).fetchone()

    sale_final = float(sale.sales_final_amount) if sale.sales_final_amount else 0.0
    total_paid = float(active_payment.total_paid) if active_payment else 0.0
    remaining = round(sale_final - total_paid, 2)

    items_data = []
    for i in items:
        item_mrp_val = float(i.item_mrp) if i.item_mrp is not None else None
        unit_price = float(i.sale_item_unit_price)
        qty = i.sale_item_quantity

        if item_mrp_val is not None and item_mrp_val > unit_price:
            discount_per_unit = round(item_mrp_val - unit_price, 2)
            discount_amount = round(discount_per_unit * qty, 2)
            discount_pct = round((discount_per_unit / item_mrp_val) * 100, 1)
        else:
            discount_per_unit = None
            discount_amount = None
            discount_pct = None

        items_data.append({
            "sale_item_id": str(i.sale_item_id),
            "product_id": str(i.product_id),
            "product_name": i.product_name or "Unknown Product",
            "sale_item_quantity": qty,
            "sale_item_unit_price": str(i.sale_item_unit_price),
            "item_mrp": str(i.item_mrp) if i.item_mrp is not None else None,
            "item_discount_amount": str(discount_amount) if discount_amount is not None else None,
            "item_discount_pct": str(discount_pct) if discount_pct is not None else None,
            "sale_item_subtotal": str(i.sale_item_subtotal) if i.sale_item_subtotal else None,
            "cgst_amount": str(i.cgst_amount) if i.cgst_amount else None,
            "sgst_amount": str(i.sgst_amount) if i.sgst_amount else None,
            "igst_amount": str(i.igst_amount) if i.igst_amount else None,
            "tax_amount": str(i.tax_amount) if i.tax_amount else None,
            "item_tax_total": str(i.item_tax_total) if i.item_tax_total else None,
            "item_total_with_tax": str(i.item_total_with_tax) if i.item_total_with_tax else None,
        })

    return {
        "sales_id": str(sale.sales_id),
        "invoice_no": sale.invoice_no,
        "customer_id": str(sale.customer_id) if sale.customer_id else None,
        "customer_name": sale.customer_name or None,
        "sales_total_amount": str(sale.sales_total_amount),
        "sales_discount": str(sale.sales_discount),
        "cgst_total": str(sale.cgst_total) if sale.cgst_total else None,
        "sgst_total": str(sale.sgst_total) if sale.sgst_total else None,
        "igst_total": str(sale.igst_total) if sale.igst_total else None,
        "tax_total": str(sale.tax_total) if sale.tax_total else None,
        "sales_final_amount": str(sale.sales_final_amount) if sale.sales_final_amount else None,
        "sales_payment_method": sale.sales_payment_method,
        "sales_payment_status": sale.sales_payment_status,
        "total_paid": round(total_paid, 2),
        "remaining_balance": remaining if remaining > 0 else 0,
        "sales_created_at": fmt_ts(sale.sales_created_at),
        "items": items_data,
    }


def get_sale_final_amount(db: Session, sales_id: str, business_id: str) -> float:
    sale_row = db.execute(
        text("SELECT sales_final_amount FROM sales WHERE sales_id = CAST(:sid AS uuid) AND business_id = CAST(:bid AS uuid)"),
        {"sid": sales_id, "bid": business_id}
    ).fetchone()
    return float(sale_row.sales_final_amount) if sale_row and sale_row.sales_final_amount else 0.0


def get_sale_active_payment(db: Session, sales_id: str, business_id: str):
    row = db.execute(
        text("""
            SELECT COALESCE(cumulative_paid, 0) AS already_paid
            FROM payments
            WHERE sale_id  = CAST(:sid AS uuid)
              AND business_id = CAST(:bid AS uuid)
              AND is_active = true
        """),
        {"sid": sales_id, "bid": business_id}
    ).fetchone()
    return float(row.already_paid) if row else 0.0


def update_sale_status(db: Session, sales_id: str, status: str, business_id: str):
    db.execute(
        text("UPDATE sales SET sales_payment_status = :status WHERE sales_id = CAST(:sid AS uuid) AND business_id = CAST(:bid AS uuid)"),
        {"status": status, "sid": sales_id, "bid": business_id}
    )


def update_payment_status(db: Session, sales_id: str, status: str, business_id: str):
    db.execute(
        text("""
            UPDATE payments SET payment_status = :status
            WHERE sale_id = CAST(:sid AS uuid) AND business_id = CAST(:bid AS uuid) AND is_active = true
        """),
        {"status": status, "sid": sales_id, "bid": business_id}
    )
