from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func, text
from app.database import get_db
from app.middleware.rbac import require_permission
from app.models.purchase import Purchase
from app.models.product import Product
from app.models.supplier import Supplier
from app.schemas.purchase import PurchaseCreate
from app.utils.response import success_response, error_response
from app.utils.pagination import paginate, pagination_response
from decimal import Decimal
import uuid
from pydantic import BaseModel

class PurchaseStatusUpdate(BaseModel):
    status: str

router = APIRouter(prefix="/purchases", tags=["Purchases"])


# ─────────────────────────────────────────
# HELPER: Global Tax Engine for Purchases
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
            cgst = total_tax / Decimal("2")
            sgst = total_tax / Decimal("2")
        else:
            igst = total_tax
    else:
        pur_tax_total = total_tax

    return {
        "subtotal":           subtotal,
        "cgst_amount":        cgst,
        "sgst_amount":        sgst,
        "igst_amount":        igst,
        "pur_tax_total":      pur_tax_total,
        "item_tax_total":     total_tax,
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
        "pur_id":           str(row.pur_id),
        "business_id":      str(row.business_id),
        "supp_id":          str(row.supp_id) if row.supp_id else None,
        "pur_total_amount": float(row.pur_total_amount),
        "pur_discount":     float(row.pur_discount) if row.pur_discount else 0,
        "pur_cgst_total":   float(row.pur_cgst_total) if row.pur_cgst_total else 0,
        "pur_sgst_total":   float(row.pur_sgst_total) if row.pur_sgst_total else 0,
        "pur_igst_total":   float(row.pur_igst_total) if row.pur_igst_total else 0,
        "pur_tax_total":    float(row.pur_tax_total) if row.pur_tax_total else 0,
        "pur_final_amount": float(row.pur_final_amount) if row.pur_final_amount else None,
        "pur_payment_status": row.pur_payment_status,
        "is_deleted":       row.is_deleted,
        "pur_created_at":   str(row.pur_created_at) if row.pur_created_at else None,
        "created_by":       str(row.created_by) if row.created_by else None,
        "items":            [purchase_item_to_dict(i) for i in items]
    }


# ─────────────────────────────────────────
# HELPER: Format purchase item row as dict
# ─────────────────────────────────────────
def purchase_item_to_dict(row):
    return {
        "item_id":           str(row.item_id),
        "product_id":        str(row.product_id),
        "pur_item_qty":      row.pur_item_qty,
        "item_unit_price":   float(row.item_unit_price),
        "item_subtotal":     float(row.item_subtotal) if row.item_subtotal else None,
        "gst_rate":          float(row.gst_rate) if row.gst_rate else 0,
        "cgst_amount":       float(row.cgst_amount) if row.cgst_amount else 0,
        "sgst_amount":       float(row.sgst_amount) if row.sgst_amount else 0,
        "igst_amount":       float(row.igst_amount) if row.igst_amount else 0,
        "pur_tax_total":     float(row.pur_tax_total) if row.pur_tax_total else 0,
        "item_tax_total":    float(row.item_tax_total) if row.item_tax_total else 0,
        "item_total_with_tax": float(row.item_total_with_tax) if row.item_total_with_tax else None
    }


# ─────────────────────────────────────────
# POST /purchases → Create new purchase
# ─────────────────────────────────────────
@router.post("/")
def create_purchase(
    data: PurchaseCreate,
    current_user: dict = Depends(require_permission("purchases.create")),
    db: Session = Depends(get_db)
):
    business_id = current_user["business_id"]
    user_id = current_user["user_id"]

    try:
        # Step 1 → Get business country and state for tax engine
        business = db.execute(
            text("""
                SELECT business_country_code, business_state
                FROM businesses
                WHERE business_id = CAST(:bid AS uuid)
            """),
            {"bid": business_id}
        ).fetchone()

        country_code = business.business_country_code if business else ""
        seller_state = business.business_state if business else ""

        # Step 2 → Get supplier state (for Indian GST interstate detection)
        supplier_state = ""
        if data.supp_id:
            supplier = db.query(Supplier).filter(
                Supplier.supp_id == data.supp_id,
                Supplier.business_id == business_id,
                Supplier.is_deleted == False
            ).first()

            if not supplier:
                return error_response("Supplier not found", status_code=404)
            # Use supplier's state for GST interstate/intrastate detection
            supplier_state = supplier.supp_state or ""

        # Step 3 → Validate products and calculate totals
        total_amount = Decimal("0")
        cgst_total   = Decimal("0")
        sgst_total   = Decimal("0")
        igst_total   = Decimal("0")
        tax_total    = Decimal("0")
        calculated_items = []

        for item in data.items:
            product = db.query(Product).filter(
                Product.prod_id == item.product_id,
                Product.business_id == business_id,
                Product.is_deleted == False
            ).first()

            if not product:
                return error_response(
                    f"Product '{item.product_id}' not found",
                    status_code=404
                )

            tax_rate = product.tax_rate or Decimal("0")
            tax_calc = calculate_purchase_item_tax(
                item.item_unit_price, item.pur_item_qty, tax_rate,
                country_code or "", seller_state or "", supplier_state or ""
            )

            total_amount += tax_calc["subtotal"]
            cgst_total   += tax_calc["cgst_amount"]
            sgst_total   += tax_calc["sgst_amount"]
            igst_total   += tax_calc["igst_amount"]
            tax_total    += tax_calc["pur_tax_total"]

            calculated_items.append({
                "product_id":  str(item.product_id),
                "quantity":    item.pur_item_qty,
                "unit_price":  float(item.item_unit_price),
                "tax_rate":    float(tax_rate),
                "cgst_amount": float(tax_calc["cgst_amount"]),
                "sgst_amount": float(tax_calc["sgst_amount"]),
                "igst_amount": float(tax_calc["igst_amount"]),
                "pur_tax_total": float(tax_calc["pur_tax_total"])
            })

        # Step 4 → Insert purchase header via raw SQL
        discount   = float(data.pur_discount or Decimal("0"))
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
                "pur_id":          new_pur_id,
                "business_id":     business_id,
                "supp_id":         str(data.supp_id) if data.supp_id else None,
                "pur_total_amount": float(total_amount),
                "pur_discount":    discount,
                "pur_cgst_total":  float(cgst_total),
                "pur_sgst_total":  float(sgst_total),
                "pur_igst_total":  float(igst_total),
                "pur_tax_total":   float(tax_total),
                "pur_payment_status": data.pur_payment_status,
                "created_by":      user_id
            }
        )

        # Step 5 → Insert purchase items (DB trigger auto-increases stock)
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
                    "pur_tax_total": calc["pur_tax_total"]
                }
            )

        # ── FIX 4: Auto-create expense record when purchase is paid immediately ──
        # WHY: If the business pays for a purchase right away (cash purchase),
        # we must record it in the expenses table automatically so the expenses
        # report is accurate. Without this, the accountant would need to
        # manually add an expense for every cash purchase — that's error-prone.
        #
        # The expense_category is set to "purchase" so reports can filter it.
        # The expense_amount uses pur_final_amount (after discount + tax).
        # ─────────────────────────────────────────────────────────────────────
        if data.pur_payment_status == "paid":
            pur_row = fetch_full_purchase(db, new_pur_id)
            final_amount = float(pur_row.pur_final_amount) if pur_row and pur_row.pur_final_amount else float(total_amount)

            db.execute(
                text("""
                    INSERT INTO expenses (
                        expense_id, business_id, expense_category,
                        expense_amount, expense_notes, created_by
                    ) VALUES (
                        CAST(:expense_id AS uuid),
                        CAST(:business_id AS uuid),
                        :expense_category,
                        :expense_amount,
                        :expense_notes,
                        CAST(:created_by AS uuid)
                    )
                """),
                {
                    "expense_id":       str(uuid.uuid4()),
                    "business_id":      business_id,
                    "expense_category": "purchase",
                    "expense_amount":   final_amount,
                    "expense_notes":    f"Auto-recorded from purchase {new_pur_id}",
                    "created_by":       user_id
                }
            )

        db.commit()

        pur_row   = fetch_full_purchase(db, new_pur_id)
        item_rows = fetch_purchase_items(db, new_pur_id)

        return success_response({
            "message":  "Purchase created successfully",
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
    current_user: dict = Depends(require_permission("purchases.view")),
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
            "bid":    business_id,
            "offset": pagination["offset"],
            "limit":  pagination["limit"]
        }
    ).fetchall()

    # BATCH: fetch ALL items for this page in one query instead of N queries
    pur_ids = [str(row.pur_id) for row in rows]
    all_items = []
    if pur_ids:
        all_items = db.execute(
            text("""
                SELECT item_id, pur_id, product_id, pur_item_qty,
                       item_unit_price, item_subtotal,
                       gst_rate, cgst_amount, sgst_amount,
                       igst_amount, pur_tax_total,
                       item_tax_total, item_total_with_tax
                FROM purchase_items
                WHERE pur_id = ANY(CAST(:ids AS uuid[]))
            """),
            {"ids": "{" + ",".join(pur_ids) + "}"}
        ).fetchall()

    items_by_pur = {}
    for it in all_items:
        key = str(it.pur_id)
        items_by_pur.setdefault(key, []).append(it)

    result = []
    for row in rows:
        items = items_by_pur.get(str(row.pur_id), [])
        result.append(purchase_row_to_dict(row, items))

    return success_response(
        pagination_response(result, total, pagination["page"], pagination["limit"])
    )

# ─────────────────────────────────────────
# GET /purchases/{pur_id} → Get one purchase
# Includes: purchase details + items + all returns for this purchase
# ─────────────────────────────────────────
@router.get("/{pur_id}")
def get_purchase(
    pur_id: str,
    current_user: dict = Depends(require_permission("purchases.view")),
    db: Session = Depends(get_db)
):
    business_id = current_user["business_id"]

    # Step 1 → Fetch purchase header
    row = db.execute(
        text("""
            SELECT pur_id, business_id, supp_id,
                   pur_total_amount, pur_discount,
                   pur_cgst_total, pur_sgst_total, pur_igst_total,
                   pur_tax_total, pur_final_amount,
                   pur_payment_status, is_deleted,
                   pur_created_at, created_by
            FROM purchases
            WHERE pur_id      = :pid
              AND business_id = :bid
              AND is_deleted  = false
        """),
        {"pid": pur_id, "bid": business_id}
    ).fetchone()

    if not row:
        return error_response("Purchase not found", status_code=404)

    # Step 2 → Fetch purchase items
    items = fetch_purchase_items(db, pur_id)

    # Step 3 → Fetch all purchase returns for this purchase
    return_rows = db.execute(text("""
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
    """), {"pid": pur_id, "bid": business_id}).fetchall()

    # BATCH: fetch ALL return items for all returns in one query
    ret_ids = [str(ret.return_id) for ret in return_rows]
    all_ret_items = []
    if ret_ids:
        all_ret_items = db.execute(text("""
            SELECT
                pri.return_item_id, pri.return_id,
                pri.product_id, p.prod_name AS product_name,
                pri.return_qty, pri.refund_amount,
                pri.return_item_subtotal
            FROM purchase_return_items pri
            JOIN products p ON p.prod_id = pri.product_id
            WHERE pri.return_id = ANY(CAST(:ids AS uuid[]))
        """), {"ids": "{" + ",".join(ret_ids) + "}"}).fetchall()

    ret_items_by_return = {}
    for ri in all_ret_items:
        key = str(ri.return_id)
        ret_items_by_return.setdefault(key, []).append(ri)

    returns = []
    for ret in return_rows:
        return_items = ret_items_by_return.get(str(ret.return_id), [])

        ret_dict = {
            "return_id":         str(ret.return_id),
            "pur_id":            str(ret.pur_id),
            "return_reason":     ret.return_reason,
            "return_status":     ret.return_status,
            "restock":           ret.restock,
            "stock_updated":     ret.stock_updated,
            "refund_method":     ret.refund_method,
            "approved_by":       str(ret.approved_by) if ret.approved_by else None,
            "approved_at":       str(ret.approved_at) if ret.approved_at else None,
            "rejected_reason":   ret.rejected_reason,
            "return_amount":     float(ret.return_amount) if ret.return_amount else 0.0,
            "return_created_at": str(ret.return_created_at) if ret.return_created_at else None,
            "created_by":        str(ret.created_by) if ret.created_by else None,
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

    # Step 5 → Build final response
    purchase_data = purchase_row_to_dict(row, items)
    purchase_data["returns"]             = returns
    purchase_data["total_returns"]       = len(returns)
    purchase_data["total_refund_amount"] = float(
        sum(r["return_amount"] for r in returns)
    )

    return success_response(purchase_data)

# ─────────────────────────────────────────
# PATCH /purchases/{pur_id}/status → Update payment status
#
# FIX 4 — Purchase ↔ Expenses sync:
# This is the mirror of PATCH /sales/{sales_id}/status.
# When a purchase is manually marked as "paid" here, we auto-insert
# an expense record so the expenses ledger stays in sync.
#
# RULE:
#   pending → paid   : insert expense record (purchase cost becomes an expense)
#   paid → pending   : this is a reversal — we do NOT auto-delete the expense
#                      (accountant must handle reversals manually to preserve
#                       the audit trail in expenses)
# ─────────────────────────────────────────
@router.patch("/{pur_id}/status")
def update_purchase_status(
    pur_id: str,
    body: PurchaseStatusUpdate,       # ← reads from JSON body now
    current_user: dict = Depends(require_permission("purchases.edit")),
    db: Session = Depends(get_db)
):
    status = body.status              # ← add this line at the top of the function
    allowed = ["pending", "paid", "partial"]
    if status not in allowed:
        return error_response(f"Status must be one of: {allowed}", 400)

    business_id = current_user["business_id"]
    user_id     = current_user["user_id"]

    purchase = db.query(Purchase).filter(
        Purchase.pur_id == pur_id,
        Purchase.business_id == business_id,
        Purchase.is_deleted == False
    ).first()

    if not purchase:
        return error_response("Purchase not found", 404)

    old_status = purchase.pur_payment_status
    purchase.pur_payment_status = status

    expense_created = False

    # ── Auto-create expense when purchase is marked paid ─────────────────────
    # WHY: "paid" means cash has left the business to pay the supplier.
    # That is an expense. We record it automatically so the accounts are
    # complete without manual entry.
    # ─────────────────────────────────────────────────────────────────────────
    if status == "paid" and old_status != "paid":

        pur_row = db.execute(
            text("SELECT pur_final_amount FROM purchases WHERE pur_id = CAST(:pid AS uuid)"),
            {"pid": pur_id}
        ).fetchone()
        final_amount = float(pur_row.pur_final_amount) if pur_row and pur_row.pur_final_amount else 0

        # Check if an expense for this purchase was already recorded
        # (e.g., it was paid at creation time)
        existing_expense = db.execute(
            text("""
                SELECT expense_id FROM expenses
                WHERE business_id = CAST(:bid AS uuid)
                  AND expense_notes LIKE :note_pattern
                  AND is_deleted = false
            """),
            {
                "bid":          business_id,
                "note_pattern": f"%{pur_id}%"
            }
        ).fetchone()

        if not existing_expense:
            db.execute(
                text("""
                    INSERT INTO expenses (
                        expense_id, business_id, expense_category,
                        expense_amount, expense_notes, created_by
                    ) VALUES (
                        CAST(:expense_id AS uuid),
                        CAST(:business_id AS uuid),
                        :expense_category,
                        :expense_amount,
                        :expense_notes,
                        CAST(:created_by AS uuid)
                    )
                """),
                {
                    "expense_id":       str(uuid.uuid4()),
                    "business_id":      business_id,
                    "expense_category": "purchase",
                    "expense_amount":   final_amount,
                    "expense_notes":    f"Auto-recorded from purchase {pur_id}",
                    "created_by":       user_id
                }
            )
            expense_created = True

    db.commit()

    response_data = {
        "message": "Purchase payment status updated",
        "status":  status
    }
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
def delete_purchase(
    pur_id: str,
    current_user: dict = Depends(require_permission("purchases.delete")),
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

    return success_response({"message": "Purchase deleted successfully"})