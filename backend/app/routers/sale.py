from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func, text
from app.database import get_db
from app.middleware.auth import verify_token
from app.models.sale import Sale
from app.models.product import Product
from app.models.customer import Customer
from app.schemas.sale import SaleCreate
from app.utils.response import success_response, error_response
from app.utils.pagination import paginate, pagination_response
from decimal import Decimal
import uuid

router = APIRouter(prefix="/sales", tags=["Sales"])


# ─────────────────────────────────────────
# HELPER: Generate invoice number
# ─────────────────────────────────────────
def generate_invoice_number(db: Session, business_id: str) -> str:
    settings = db.execute(
        text("SELECT invoice_prefix FROM business_settings WHERE business_id = :bid"),
        {"bid": business_id}
    ).fetchone()

    prefix = settings.invoice_prefix if settings and settings.invoice_prefix else "INV"

    db.execute(
        text("""
            UPDATE business_counters
            SET invoice_counter = invoice_counter + 1,
                updated_at = now()
            WHERE business_id = :bid
        """),
        {"bid": business_id}
    )

    counter = db.execute(
        text("SELECT invoice_counter FROM business_counters WHERE business_id = :bid"),
        {"bid": business_id}
    ).fetchone()

    count = counter.invoice_counter if counter else 1
    return f"{prefix}-{str(count).zfill(4)}"


# ─────────────────────────────────────────
# HELPER: Calculate tax for one item
# ─────────────────────────────────────────
def calculate_item_tax(unit_price: Decimal, quantity: int, tax_rate: Decimal):
    subtotal = unit_price * quantity
    tax_amount = (subtotal * tax_rate) / Decimal("100")
    cgst = tax_amount / Decimal("2")
    sgst = tax_amount / Decimal("2")
    igst = Decimal("0")
    total_with_tax = subtotal + tax_amount

    return {
        "subtotal": subtotal,
        "tax_amount": tax_amount,
        "cgst_amount": cgst,
        "sgst_amount": sgst,
        "igst_amount": igst,
        "item_tax_total": tax_amount,
        "item_total_with_tax": total_with_tax
    }


# ─────────────────────────────────────────
# HELPER: Fetch full sale row via raw SQL
# ─────────────────────────────────────────
def fetch_full_sale(db: Session, sales_id: str):
    return db.execute(
        text("""
            SELECT sales_id, business_id, customer_id, invoice_no,
                   sales_total_amount, sales_discount, cgst_total,
                   sgst_total, igst_total, tax_total, sales_final_amount,
                   sales_payment_method, sales_payment_status,
                   is_deleted, sales_created_at, created_by
            FROM sales
            WHERE sales_id = :sid
        """),
        {"sid": sales_id}
    ).fetchone()


# ─────────────────────────────────────────
# HELPER: Fetch sale items via raw SQL
# ─────────────────────────────────────────
def fetch_sale_items(db: Session, sales_id: str):
    return db.execute(
        text("""
            SELECT sale_item_id, product_id, sale_item_quantity,
                   sale_item_unit_price, sale_item_subtotal,
                   gst_rate, cgst_amount, sgst_amount, igst_amount,
                   tax_amount, item_tax_total, item_total_with_tax
            FROM sale_items
            WHERE sale_id = :sid
        """),
        {"sid": sales_id}
    ).fetchall()


# ─────────────────────────────────────────
# HELPER: Format sale row as dict
# ─────────────────────────────────────────
def sale_row_to_dict(row, items):
    return {
        "sales_id": str(row.sales_id),
        "business_id": str(row.business_id),
        "customer_id": str(row.customer_id) if row.customer_id else None,
        "invoice_no": row.invoice_no,
        "sales_total_amount": float(row.sales_total_amount),
        "sales_discount": float(row.sales_discount) if row.sales_discount else 0,
        "cgst_total": float(row.cgst_total) if row.cgst_total else 0,
        "sgst_total": float(row.sgst_total) if row.sgst_total else 0,
        "igst_total": float(row.igst_total) if row.igst_total else 0,
        "tax_total": float(row.tax_total) if row.tax_total else 0,
        "sales_final_amount": float(row.sales_final_amount) if row.sales_final_amount else None,
        "sales_payment_method": row.sales_payment_method,
        "sales_payment_status": row.sales_payment_status,
        "is_deleted": row.is_deleted,
        "sales_created_at": str(row.sales_created_at) if row.sales_created_at else None,
        "created_by": str(row.created_by) if row.created_by else None,
        "items": [item_row_to_dict(i) for i in items]
    }


# ─────────────────────────────────────────
# HELPER: Format sale item row as dict
# ─────────────────────────────────────────
def item_row_to_dict(row):
    return {
        "sale_item_id": str(row.sale_item_id),
        "product_id": str(row.product_id),
        "sale_item_quantity": row.sale_item_quantity,
        "sale_item_unit_price": float(row.sale_item_unit_price),
        "sale_item_subtotal": float(row.sale_item_subtotal) if row.sale_item_subtotal else None,
        "gst_rate": float(row.gst_rate) if row.gst_rate else 0,
        "cgst_amount": float(row.cgst_amount) if row.cgst_amount else 0,
        "sgst_amount": float(row.sgst_amount) if row.sgst_amount else 0,
        "igst_amount": float(row.igst_amount) if row.igst_amount else 0,
        "tax_amount": float(row.tax_amount) if row.tax_amount else 0,
        "item_tax_total": float(row.item_tax_total) if row.item_tax_total else 0,
        "item_total_with_tax": float(row.item_total_with_tax) if row.item_total_with_tax else None
    }


# ─────────────────────────────────────────
# POST /sales → Create new sale
# ─────────────────────────────────────────
@router.post("/")
def create_sale(
    data: SaleCreate,
    current_user: dict = Depends(verify_token),
    db: Session = Depends(get_db)
):
    business_id = current_user["business_id"]
    user_id = current_user["user_id"]

    # Step 1 → Validate customer if provided
    if data.customer_id:
        customer = db.query(Customer).filter(
            Customer.cust_id == data.customer_id,
            Customer.business_id == business_id,
            Customer.is_deleted == False
        ).first()
        if not customer:
            return error_response("Customer not found", status_code=404)

    # Step 2 → Validate products and calculate totals
    total_amount = Decimal("0")
    cgst_total = Decimal("0")
    sgst_total = Decimal("0")
    igst_total = Decimal("0")
    tax_total = Decimal("0")
    calculated_items = []

    for item in data.items:
        product = db.query(Product).filter(
            Product.prod_id == item.product_id,
            Product.business_id == business_id,
            Product.is_deleted == False
        ).first()

        if not product:
            return error_response(
                f"Product {item.product_id} not found",
                status_code=404
            )

        tax_rate = product.tax_rate or Decimal("0")
        tax_calc = calculate_item_tax(
            item.sale_item_unit_price,
            item.sale_item_quantity,
            tax_rate
        )

        total_amount += tax_calc["subtotal"]
        cgst_total += tax_calc["cgst_amount"]
        sgst_total += tax_calc["sgst_amount"]
        igst_total += tax_calc["igst_amount"]
        tax_total += tax_calc["tax_amount"]

        calculated_items.append({
            "product_id": str(item.product_id),
            "quantity": item.sale_item_quantity,
            "unit_price": float(item.sale_item_unit_price),
            "tax_rate": float(tax_rate),
            "cgst_amount": float(tax_calc["cgst_amount"]),
            "sgst_amount": float(tax_calc["sgst_amount"]),
            "igst_amount": float(tax_calc["igst_amount"]),
            "tax_amount": float(tax_calc["tax_amount"])
        })

    # Step 3 → Generate invoice number
    invoice_no = generate_invoice_number(db, business_id)

    # Step 4 → Insert sale via raw SQL
    # Using CAST() instead of ::uuid to avoid SQLAlchemy param conflict
    discount = float(data.sales_discount or Decimal("0"))
    new_sales_id = str(uuid.uuid4())

    db.execute(
        text("""
            INSERT INTO sales (
                sales_id, business_id, customer_id, invoice_no,
                sales_total_amount, sales_discount,
                cgst_total, sgst_total, igst_total, tax_total,
                sales_payment_method, sales_payment_status,
                created_by
            ) VALUES (
                CAST(:sales_id AS uuid),
                CAST(:business_id AS uuid),
                CAST(:customer_id AS uuid),
                :invoice_no,
                :sales_total_amount, :sales_discount,
                :cgst_total, :sgst_total, :igst_total, :tax_total,
                :sales_payment_method, :sales_payment_status,
                CAST(:created_by AS uuid)
            )
        """),
        {
            "sales_id": new_sales_id,
            "business_id": business_id,
            "customer_id": str(data.customer_id) if data.customer_id else None,
            "invoice_no": invoice_no,
            "sales_total_amount": float(total_amount),
            "sales_discount": discount,
            "cgst_total": float(cgst_total),
            "sgst_total": float(sgst_total),
            "igst_total": float(igst_total),
            "tax_total": float(tax_total),
            "sales_payment_method": data.sales_payment_method,
            "sales_payment_status": data.sales_payment_status,
            "created_by": user_id
        }
    )

    # Step 5 → Insert sale items via raw SQL
    # DB trigger trg_sale_stock_movement AUTO reduces stock!
    for calc in calculated_items:
        db.execute(
            text("""
                INSERT INTO sale_items (
                    sale_item_id, business_id, sale_id, product_id,
                    sale_item_quantity, sale_item_unit_price,
                    gst_rate, cgst_amount, sgst_amount,
                    igst_amount, tax_amount
                ) VALUES (
                    CAST(:sale_item_id AS uuid),
                    CAST(:business_id AS uuid),
                    CAST(:sale_id AS uuid),
                    CAST(:product_id AS uuid),
                    :quantity, :unit_price,
                    :gst_rate, :cgst_amount, :sgst_amount,
                    :igst_amount, :tax_amount
                )
            """),
            {
                "sale_item_id": str(uuid.uuid4()),
                "business_id": business_id,
                "sale_id": new_sales_id,
                "product_id": calc["product_id"],
                "quantity": calc["quantity"],
                "unit_price": calc["unit_price"],
                "gst_rate": calc["tax_rate"],
                "cgst_amount": calc["cgst_amount"],
                "sgst_amount": calc["sgst_amount"],
                "igst_amount": calc["igst_amount"],
                "tax_amount": calc["tax_amount"]
            }
        )

    # Step 6 → Commit everything
    db.commit()

    # Step 7 → Fetch full sale including all generated columns
    sale_row = fetch_full_sale(db, new_sales_id)
    item_rows = fetch_sale_items(db, new_sales_id)

    return success_response({
        "message": "Sale created successfully",
        "sale": sale_row_to_dict(sale_row, item_rows)
    }, status_code=201)


# ─────────────────────────────────────────
# GET /sales → Get all sales
# ─────────────────────────────────────────
@router.get("/")
def get_all_sales(
    current_user: dict = Depends(verify_token),
    db: Session = Depends(get_db),
    pagination: dict = Depends(paginate)
):
    business_id = current_user["business_id"]

    total = db.query(func.count(Sale.sales_id)).filter(
        Sale.business_id == business_id,
        Sale.is_deleted == False
    ).scalar()

    rows = db.execute(
        text("""
            SELECT sales_id, business_id, customer_id, invoice_no,
                   sales_total_amount, sales_discount, cgst_total,
                   sgst_total, igst_total, tax_total, sales_final_amount,
                   sales_payment_method, sales_payment_status,
                   is_deleted, sales_created_at, created_by
            FROM sales
            WHERE business_id = :bid
              AND is_deleted = false
            ORDER BY sales_created_at DESC
            OFFSET :offset LIMIT :limit
        """),
        {
            "bid": business_id,
            "offset": pagination["offset"],
            "limit": pagination["limit"]
        }
    ).fetchall()

    result = []
    for row in rows:
        items = fetch_sale_items(db, str(row.sales_id))
        result.append(sale_row_to_dict(row, items))

    return success_response(
        pagination_response(result, total, pagination["page"], pagination["limit"])
    )


# ─────────────────────────────────────────
# GET /sales/{sales_id} → Get one sale
# ─────────────────────────────────────────
@router.get("/{sales_id}")
def get_sale(
    sales_id: str,
    current_user: dict = Depends(verify_token),
    db: Session = Depends(get_db)
):
    business_id = current_user["business_id"]

    row = db.execute(
        text("""
            SELECT sales_id, business_id, customer_id, invoice_no,
                   sales_total_amount, sales_discount, cgst_total,
                   sgst_total, igst_total, tax_total, sales_final_amount,
                   sales_payment_method, sales_payment_status,
                   is_deleted, sales_created_at, created_by
            FROM sales
            WHERE sales_id = :sid
              AND business_id = :bid
              AND is_deleted = false
        """),
        {"sid": sales_id, "bid": business_id}
    ).fetchone()

    if not row:
        return error_response("Sale not found", status_code=404)

    items = fetch_sale_items(db, sales_id)
    return success_response(sale_row_to_dict(row, items))


# ─────────────────────────────────────────
# DELETE /sales/{sales_id} → Soft delete
# ─────────────────────────────────────────
@router.delete("/{sales_id}")
def delete_sale(
    sales_id: str,
    current_user: dict = Depends(verify_token),
    db: Session = Depends(get_db)
):
    business_id = current_user["business_id"]

    sale = db.query(Sale).filter(
        Sale.sales_id == sales_id,
        Sale.business_id == business_id,
        Sale.is_deleted == False
    ).first()

    if not sale:
        return error_response("Sale not found", status_code=404)

    sale.is_deleted = True
    db.commit()

    return success_response({
        "message": "Sale deleted successfully"
    })