from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func, text
from app.database import get_db
from app.middleware.auth import verify_token
from app.models.purchase import Purchase
from app.models.product import Product
from app.models.supplier import Supplier
from app.schemas.purchase import PurchaseCreate
from app.utils.response import success_response, error_response
from app.utils.pagination import paginate, pagination_response
from decimal import Decimal
import uuid

router = APIRouter(prefix="/purchases", tags=["Purchases"])


# ─────────────────────────────────────────
# HELPER: Global Tax Engine for Purchases
# Same logic as Sales tax engine
# ─────────────────────────────────────────
def calculate_purchase_item_tax(
    unit_price: Decimal,
    quantity: int,
    tax_rate: Decimal,
    country_code: str,
    seller_state: str,
    supplier_state: str
):
    subtotal = unit_price * quantity
    total_tax = (subtotal * tax_rate) / Decimal("100")

    cgst = Decimal("0")
    sgst = Decimal("0")
    igst = Decimal("0")
    pur_tax_total = Decimal("0")

    if country_code == "IN":
        if seller_state and supplier_state and \
           seller_state.strip().lower() == supplier_state.strip().lower():
            # Same state → CGST + SGST
            cgst = total_tax / Decimal("2")
            sgst = total_tax / Decimal("2")
        else:
            # Different state → IGST
            igst = total_tax
    else:
        # Global → pur_tax_total only
        pur_tax_total = total_tax

    return {
        "subtotal": subtotal,
        "cgst_amount": cgst,
        "sgst_amount": sgst,
        "igst_amount": igst,
        "pur_tax_total": pur_tax_total,
        "item_tax_total": total_tax,
        "item_total_with_tax": subtotal + total_tax
    }


# ─────────────────────────────────────────
# HELPER: Fetch full purchase via raw SQL
# ─────────────────────────────────────────
def fetch_full_purchase(db: Session, pur_id: str):
    return db.execute(
        text("""
            SELECT pur_id, business_id, supp_id,
                   pur_total_amount, pur_discount,
                   pur_cgst_total, pur_sgst_total, pur_igst_total,
                   pur_tax_total, pur_final_amount,
                   pur_payment_status, is_deleted,
                   pur_created_at, created_by
            FROM purchases
            WHERE pur_id = :pid
        """),
        {"pid": pur_id}
    ).fetchone()


# ─────────────────────────────────────────
# HELPER: Fetch purchase items via raw SQL
# ─────────────────────────────────────────
def fetch_purchase_items(db: Session, pur_id: str):
    return db.execute(
        text("""
            SELECT item_id, product_id, pur_item_qty,
                   item_unit_price, item_subtotal,
                   gst_rate, cgst_amount, sgst_amount,
                   igst_amount, pur_tax_total,
                   item_tax_total, item_total_with_tax
            FROM purchase_items
            WHERE pur_id = :pid
        """),
        {"pid": pur_id}
    ).fetchall()


# ─────────────────────────────────────────
# HELPER: Format purchase row as dict
# ─────────────────────────────────────────
def purchase_row_to_dict(row, items):
    return {
        "pur_id": str(row.pur_id),
        "business_id": str(row.business_id),
        "supp_id": str(row.supp_id) if row.supp_id else None,
        "pur_total_amount": float(row.pur_total_amount),
        "pur_discount": float(row.pur_discount) if row.pur_discount else 0,
        "pur_cgst_total": float(row.pur_cgst_total) if row.pur_cgst_total else 0,
        "pur_sgst_total": float(row.pur_sgst_total) if row.pur_sgst_total else 0,
        "pur_igst_total": float(row.pur_igst_total) if row.pur_igst_total else 0,
        "pur_tax_total": float(row.pur_tax_total) if row.pur_tax_total else 0,
        "pur_final_amount": float(row.pur_final_amount) if row.pur_final_amount else None,
        "pur_payment_status": row.pur_payment_status,
        "is_deleted": row.is_deleted,
        "pur_created_at": str(row.pur_created_at) if row.pur_created_at else None,
        "created_by": str(row.created_by) if row.created_by else None,
        "items": [purchase_item_to_dict(i) for i in items]
    }


# ─────────────────────────────────────────
# HELPER: Format purchase item row as dict
# ─────────────────────────────────────────
def purchase_item_to_dict(row):
    return {
        "item_id": str(row.item_id),
        "product_id": str(row.product_id),
        "pur_item_qty": row.pur_item_qty,
        "item_unit_price": float(row.item_unit_price),
        "item_subtotal": float(row.item_subtotal) if row.item_subtotal else None,
        "gst_rate": float(row.gst_rate) if row.gst_rate else 0,
        "cgst_amount": float(row.cgst_amount) if row.cgst_amount else 0,
        "sgst_amount": float(row.sgst_amount) if row.sgst_amount else 0,
        "igst_amount": float(row.igst_amount) if row.igst_amount else 0,
        "pur_tax_total": float(row.pur_tax_total) if row.pur_tax_total else 0,
        "item_tax_total": float(row.item_tax_total) if row.item_tax_total else 0,
        "item_total_with_tax": float(row.item_total_with_tax) if row.item_total_with_tax else None
    }


# ─────────────────────────────────────────
# POST /purchases → Create new purchase
# ─────────────────────────────────────────
@router.post("/")
def create_purchase(
    data: PurchaseCreate,
    current_user: dict = Depends(verify_token),
    db: Session = Depends(get_db)
):
    business_id = current_user["business_id"]
    user_id = current_user["user_id"]

    try:
        # Step 1 → Fetch business country and state
        business = db.execute(
            text("""
                SELECT business_country_code, business_state
                FROM businesses
                WHERE business_id = :bid
            """),
            {"bid": business_id}
        ).fetchone()

        country_code = business.business_country_code if business else ""
        seller_state = business.business_state if business else ""

        # Step 2 → Validate supplier and get state
        supplier_state = ""
        if data.supp_id:
            supplier = db.query(Supplier).filter(
                Supplier.supp_id == data.supp_id,
                Supplier.business_id == business_id,
                Supplier.is_deleted == False
            ).first()

            if not supplier:
                return error_response("Supplier not found", status_code=404)

            # Suppliers table has no state column
            # So interstate detection defaults to IGST
            supplier_state = ""

        # Step 3 → Validate products and calculate totals
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

            tax_calc = calculate_purchase_item_tax(
                item.item_unit_price,
                item.pur_item_qty,
                tax_rate,
                country_code or "",
                seller_state or "",
                supplier_state or ""
            )

            total_amount += tax_calc["subtotal"]
            cgst_total += tax_calc["cgst_amount"]
            sgst_total += tax_calc["sgst_amount"]
            igst_total += tax_calc["igst_amount"]
            tax_total += tax_calc["pur_tax_total"]

            calculated_items.append({
                "product_id": str(item.product_id),
                "quantity": item.pur_item_qty,
                "unit_price": float(item.item_unit_price),
                "tax_rate": float(tax_rate),
                "cgst_amount": float(tax_calc["cgst_amount"]),
                "sgst_amount": float(tax_calc["sgst_amount"]),
                "igst_amount": float(tax_calc["igst_amount"]),
                "pur_tax_total": float(tax_calc["pur_tax_total"])
            })

        # Step 4 → Insert purchase via raw SQL
        discount = float(data.pur_discount or Decimal("0"))
        new_pur_id = str(uuid.uuid4())

        db.execute(
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
                "pur_id": new_pur_id,
                "business_id": business_id,
                "supp_id": str(data.supp_id) if data.supp_id else None,
                "pur_total_amount": float(total_amount),
                "pur_discount": discount,
                "pur_cgst_total": float(cgst_total),
                "pur_sgst_total": float(sgst_total),
                "pur_igst_total": float(igst_total),
                "pur_tax_total": float(tax_total),
                "pur_payment_status": data.pur_payment_status,
                "created_by": user_id
            }
        )

        # Step 5 → Insert purchase items via raw SQL
        # DB trigger trg_purchase_stock_movement AUTO increases stock!
        for calc in calculated_items:
            db.execute(
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
                {
                    "item_id": str(uuid.uuid4()),
                    "business_id": business_id,
                    "pur_id": new_pur_id,
                    "product_id": calc["product_id"],
                    "quantity": calc["quantity"],
                    "unit_price": calc["unit_price"],
                    "gst_rate": calc["tax_rate"],
                    "cgst_amount": calc["cgst_amount"],
                    "sgst_amount": calc["sgst_amount"],
                    "igst_amount": calc["igst_amount"],
                    "pur_tax_total": calc["pur_tax_total"]
                }
            )

        # Step 6 → Commit everything
        db.commit()

        # Step 7 → Fetch full purchase including generated columns
        pur_row = fetch_full_purchase(db, new_pur_id)
        item_rows = fetch_purchase_items(db, new_pur_id)

        return success_response({
            "message": "Purchase created successfully",
            "purchase": purchase_row_to_dict(pur_row, item_rows)
        }, status_code=201)

    except Exception as e:
        db.rollback()
        return error_response(str(e), status_code=500)


# ─────────────────────────────────────────
# GET /purchases → Get all purchases
# ─────────────────────────────────────────
@router.get("/")
def get_all_purchases(
    current_user: dict = Depends(verify_token),
    db: Session = Depends(get_db),
    pagination: dict = Depends(paginate)
):
    business_id = current_user["business_id"]

    total = db.query(func.count(Purchase.pur_id)).filter(
        Purchase.business_id == business_id,
        Purchase.is_deleted == False
    ).scalar()

    rows = db.execute(
        text("""
            SELECT pur_id, business_id, supp_id,
                   pur_total_amount, pur_discount,
                   pur_cgst_total, pur_sgst_total, pur_igst_total,
                   pur_tax_total, pur_final_amount,
                   pur_payment_status, is_deleted,
                   pur_created_at, created_by
            FROM purchases
            WHERE business_id = :bid
              AND is_deleted = false
            ORDER BY pur_created_at DESC
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
        items = fetch_purchase_items(db, str(row.pur_id))
        result.append(purchase_row_to_dict(row, items))

    return success_response(
        pagination_response(result, total, pagination["page"], pagination["limit"])
    )


# ─────────────────────────────────────────
# GET /purchases/{pur_id} → Get one purchase
# ─────────────────────────────────────────
@router.get("/{pur_id}")
def get_purchase(
    pur_id: str,
    current_user: dict = Depends(verify_token),
    db: Session = Depends(get_db)
):
    business_id = current_user["business_id"]

    row = db.execute(
        text("""
            SELECT pur_id, business_id, supp_id,
                   pur_total_amount, pur_discount,
                   pur_cgst_total, pur_sgst_total, pur_igst_total,
                   pur_tax_total, pur_final_amount,
                   pur_payment_status, is_deleted,
                   pur_created_at, created_by
            FROM purchases
            WHERE pur_id = :pid
              AND business_id = :bid
              AND is_deleted = false
        """),
        {"pid": pur_id, "bid": business_id}
    ).fetchone()

    if not row:
        return error_response("Purchase not found", status_code=404)

    items = fetch_purchase_items(db, pur_id)
    return success_response(purchase_row_to_dict(row, items))


# ─────────────────────────────────────────
# DELETE /purchases/{pur_id} → Soft delete
# ─────────────────────────────────────────
@router.delete("/{pur_id}")
def delete_purchase(
    pur_id: str,
    current_user: dict = Depends(verify_token),
    db: Session = Depends(get_db)
):
    business_id = current_user["business_id"]

    purchase = db.query(Purchase).filter(
        Purchase.pur_id == pur_id,
        Purchase.business_id == business_id,
        Purchase.is_deleted == False
    ).first()

    if not purchase:
        return error_response("Purchase not found", status_code=404)

    purchase.is_deleted = True
    db.commit()

    return success_response({
        "message": "Purchase deleted successfully"
    })