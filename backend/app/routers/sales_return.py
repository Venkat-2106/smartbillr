from fastapi import APIRouter, Depends, Query
from typing import Optional
from sqlalchemy.orm import Session
from sqlalchemy import func, text
from app.database import get_db
from app.middleware.rbac import require_permission
from app.models.sales_return import SalesReturn
from app.models.sale import Sale
from app.schemas.sales_return import SalesReturnCreate, SalesReturnUpdate
from app.utils.response import success_response, error_response
from app.utils.pagination import paginate, pagination_response
from app.utils.timestamp import fmt_ts
import logging
from decimal import Decimal
import uuid

router = APIRouter(prefix="/v1/sales-returns", tags=["Sales Returns"])


# ─────────────────────────────────────────
# HELPER: Fetch return items via raw SQL
# FIX: Now reads from sales_return_items (the table the DB triggers use),
#      not return_items (the orphan table that has no trigger connection).
# ─────────────────────────────────────────
def fetch_return_items(db: Session, return_id: str):
    return db.execute(
        text("""
            SELECT sri.return_item_id, sri.product_id,
                   p.prod_name AS product_name,
                   sri.return_qty, sri.unit_price AS refund_amount,
                   (sri.return_qty * sri.unit_price) AS return_item_subtotal
            FROM sales_return_items sri
            LEFT JOIN products p ON p.prod_id = sri.product_id
            WHERE sri.return_id = CAST(:rid AS uuid)
        """),
        {"rid": return_id}
    ).fetchall()


# ─────────────────────────────────────────
# HELPER: Format return row as dict
# ─────────────────────────────────────────
def return_to_dict(r, items):
    invoice_no = getattr(r, 'invoice_no', None)
    return {
        "return_id": str(r.return_id),
        "business_id": str(r.business_id),
        "sale_id": str(r.sale_id),
        "invoice_no": invoice_no,
        "return_amount": float(r.return_amount),
        "return_reason": r.return_reason,
        "return_status": r.return_status,
        "restock": r.restock,
        "stock_updated": r.stock_updated,
        "refund_method": r.refund_method,
        "approved_by": str(r.approved_by) if r.approved_by else None,
        "approved_at": fmt_ts(r.approved_at),
        "rejected_reason": r.rejected_reason,
        "return_created_at": fmt_ts(r.return_created_at),
        "created_by": str(r.created_by) if r.created_by else None,
        "updated_at": fmt_ts(r.updated_at) if hasattr(r, "updated_at") else None,
        "last_updated_by": r.last_updated_by if hasattr(r, "last_updated_by") else None,
        "items": [return_item_to_dict(i) for i in items]
    }


# ─────────────────────────────────────────
# HELPER: Format return item as dict
# ─────────────────────────────────────────
def return_item_to_dict(row):
    return {
        "return_item_id": str(row.return_item_id),
        "product_id": str(row.product_id),
        "product_name": row.product_name,
        "return_qty": float(row.return_qty),
        "refund_amount": float(row.refund_amount),
        "return_item_subtotal": float(row.return_item_subtotal) if row.return_item_subtotal else None
    }


# ─────────────────────────────────────────
# HELPER: Validate return items against original sale
# FIX: Now queries sales_return_items and uses sale_item_id for lookups,
#      matching the DB trigger's validation logic exactly.
# ─────────────────────────────────────────
def validate_return_items(db: Session, sale_id: str, business_id: str, items, exclude_return_id: str = None):
    # Batch Step 1 → Fetch ALL sale items for this sale in one query
    prod_ids = [str(item.product_id) for item in items]
    sale_item_map = {}
    already_returned_map = {}

    if prod_ids:
        rows = db.execute(
            text("""
                SELECT si.product_id, si.sale_item_id, si.sale_item_quantity,
                       si.sale_item_unit_price, p.prod_name
                FROM sale_items si
                JOIN products p ON p.prod_id = si.product_id
                WHERE si.sale_id = CAST(:sale_id AS uuid)
                  AND si.business_id = CAST(:bid AS uuid)
                  AND si.product_id = ANY(CAST(:pids AS uuid[]))
            """),
            {"sale_id": sale_id, "bid": business_id, "pids": "{" + ",".join(prod_ids) + "}"}
        ).fetchall()
        sale_item_map = {str(r.product_id): r for r in rows}

        # Batch Step 2 → Fetch ALL already-returned quantities in one GROUP BY query
        q = """
            SELECT sri.product_id, COALESCE(SUM(sri.return_qty), 0) AS total_returned
            FROM sales_return_items sri
            JOIN sales_returns sr ON sr.return_id = sri.return_id
            WHERE sri.product_id = ANY(CAST(:pids AS uuid[]))
              AND sr.business_id = CAST(:bid AS uuid)
              AND sr.return_status != 'rejected'
        """
        params = {"pids": "{" + ",".join(prod_ids) + "}", "bid": business_id}
        if exclude_return_id:
            q += " AND sr.return_id != CAST(:return_id AS uuid)"
            params["return_id"] = exclude_return_id
        q += " GROUP BY sri.product_id"
        for row in db.execute(text(q), params).fetchall():
            already_returned_map[str(row.product_id)] = float(row.total_returned)

    for item in items:
        product_id = str(item.product_id)
        sale_item = sale_item_map.get(product_id)

        if not sale_item:
            return f"Product '{product_id}' was not part of this sale"

        already_returned = already_returned_map.get(product_id, 0)
        available = float(sale_item.sale_item_quantity) - already_returned

        if item.return_qty > available:
            return (
                f"'{sale_item.prod_name}' return qty ({item.return_qty}) exceeds "
                f"available qty ({available}). Already returned: {int(already_returned)} "
                f"of {sale_item.sale_item_quantity}."
            )

        if float(item.refund_amount) > float(sale_item.sale_item_unit_price):
            return (
                f"'{sale_item.prod_name}' refund amount ({item.refund_amount}) cannot exceed "
                f"original sale price ({float(sale_item.sale_item_unit_price)})"
            )

    return None


# ─────────────────────────────────────────
# POST /sales-returns → Create sales return
# FIX: Now inserts into sales_return_items (trigger-compatible) with all required
#      columns (sale_item_id, unit_price, business_id, original_qty, original_unit_price).
#      The DB trigger trg_sales_return_stock fires on sales_returns UPDATE to handle
#      stock restocking when status changes to 'approved'.
# ─────────────────────────────────────────
@router.post("/")
def create_sales_return(
    data: SalesReturnCreate,
    current_user: dict = Depends(require_permission("sales_returns.manage")),
    db: Session = Depends(get_db)
):
    business_id = current_user["business_id"]
    user_id = current_user["user_id"]

    try:
        # Step 1 → Validate sale exists
        sale = db.query(Sale).filter(
            Sale.sales_id == data.sale_id,
            Sale.business_id == business_id,
            Sale.is_deleted == False
        ).first()

        if not sale:
            return error_response("Sale not found", status_code=404)

        # Step 2 → Validate return items
        error = validate_return_items(db=db, sale_id=str(data.sale_id), business_id=business_id, items=data.items)
        if error:
            return error_response(error, status_code=400)

        # Step 3 → Resolve sale_item_id and calc totals for each return item
        # BATCH: single query for all items instead of N individual lookups
        total_refund = Decimal("0")
        calculated_items = []

        sale_item_rows = {}
        if data.items:
            prod_ids = [str(item.product_id) for item in data.items]
            rows = db.execute(
                text("""
                    SELECT product_id, sale_item_id, sale_item_quantity, sale_item_unit_price
                    FROM sale_items
                    WHERE sale_id = CAST(:sale_id AS uuid)
                      AND product_id = ANY(CAST(:pids AS uuid[]))
                """),
                {"sale_id": str(data.sale_id), "pids": "{" + ",".join(prod_ids) + "}"}
            ).fetchall()
            sale_item_rows = {str(r.product_id): r for r in rows}

        for item in data.items:
            sale_item = sale_item_rows.get(str(item.product_id))
            if not sale_item:
                return error_response(
                    f"Product '{item.product_id}' was not part of this sale",
                    status_code=400
                )

            total_refund += item.refund_amount * item.return_qty
            calculated_items.append({
                "sale_item_id": str(sale_item.sale_item_id),
                "product_id": str(item.product_id),
                "return_qty": item.return_qty,
                "refund_amount": item.refund_amount,
                "original_qty": sale_item.sale_item_quantity,
                "original_unit_price": sale_item.sale_item_unit_price
            })

        # Step 4 → Insert sales return header
        new_return_id = str(uuid.uuid4())

        db.execute(
            text("""
                INSERT INTO sales_returns (
                    return_id, business_id, sale_id,
                    return_amount, return_reason,
                    return_status, restock, created_by
                ) VALUES (
                    CAST(:return_id AS uuid),
                    CAST(:business_id AS uuid),
                    CAST(:sale_id AS uuid),
                    :return_amount, :return_reason,
                    :return_status, :restock,
                    CAST(:created_by AS uuid)
                )
            """),
            {
                "return_id": new_return_id,
                "business_id": business_id,
                "sale_id": str(data.sale_id),
                "return_amount": str(total_refund),
                "return_reason": data.return_reason,
                "return_status": data.return_status or "pending",
                "restock": data.restock,
                "created_by": user_id
            }
        )

        # Step 5 → Insert return items into sales_return_items
        # This table is what the DB trigger trg_validate_sales_return_items watches.
        # Required columns: sale_item_id, unit_price, original_qty, original_unit_price, business_id
        for calc in calculated_items:
            db.execute(
                text("""
                    INSERT INTO sales_return_items (
                        return_item_id, return_id, sale_item_id,
                        product_id, return_qty, unit_price,
                        original_qty, original_unit_price, business_id
                    ) VALUES (
                        CAST(:return_item_id AS uuid),
                        CAST(:return_id AS uuid),
                        CAST(:sale_item_id AS uuid),
                        CAST(:product_id AS uuid),
                        :return_qty, :unit_price,
                        :original_qty, :original_unit_price,
                        CAST(:business_id AS uuid)
                    )
                """),
                {
                    "return_item_id": str(uuid.uuid4()),
                    "return_id": new_return_id,
                    "sale_item_id": calc["sale_item_id"],
                    "product_id": calc["product_id"],
                    "return_qty": calc["return_qty"],
                    "unit_price": str(calc["refund_amount"]),
                    "original_qty": calc["original_qty"],
                    "original_unit_price": str(calc["original_unit_price"]),
                    "business_id": business_id
                }
            )

        db.commit()

        return_row = db.query(SalesReturn).filter(
            SalesReturn.return_id == new_return_id
        ).first()

        item_rows = fetch_return_items(db, new_return_id)

        return success_response({
            "message": "Sales return created successfully",
            "return": return_to_dict(return_row, item_rows)
        }, status_code=201)

    except Exception as e:
        db.rollback()
        logging.exception(e)
        return error_response("An unexpected error occurred. Please try again.", status_code=500)


# ─────────────────────────────────────────
# GET /sales-returns → Get all sales returns
# ─────────────────────────────────────────
@router.get("/")
def get_all_sales_returns(
    current_user: dict = Depends(require_permission("sales_returns.manage")),
    db: Session = Depends(get_db),
    pagination: dict = Depends(paginate),
    search: Optional[str] = Query(default=None),
    status: Optional[str] = Query(default=None),
    sort_by: Optional[str] = Query(default="return_created_at"),
    sort_dir: Optional[str] = Query(default="desc"),
    date_from: Optional[str] = Query(default=None),
    date_to: Optional[str] = Query(default=None),
):
    business_id = current_user["business_id"]

    SORTABLE = {
        "return_created_at": "sr.return_created_at",
        "return_status":     "sr.return_status",
        "return_amount":     "sr.return_amount",
    }
    order_col = SORTABLE.get(sort_by, "sr.return_created_at")
    order_dir = "DESC" if str(sort_dir).lower() == "desc" else "ASC"

    extra_where = ""
    params = {"bid": business_id}

    if search and search.strip():
        extra_where += " AND (sr.return_reason ILIKE :search OR s.invoice_no ILIKE :search)"
        params["search"] = f"%{search.strip()}%"

    if status and status.strip():
        extra_where += " AND sr.return_status = :status"
        params["status"] = status.strip()

    if date_from:
        extra_where += " AND sr.return_created_at >= :date_from"
        params["date_from"] = date_from

    if date_to:
        extra_where += " AND sr.return_created_at <= :date_to"
        params["date_to"] = date_to

    count_sql = f"""
        SELECT COUNT(sr.return_id)
        FROM sales_returns sr
        LEFT JOIN sales s ON s.sales_id = sr.sale_id
        WHERE sr.business_id = CAST(:bid AS uuid)
        {extra_where}
    """
    total = db.execute(text(count_sql), params).scalar() or 0

    params["offset"] = pagination["offset"]
    params["limit"] = pagination["limit"]

    list_sql = f"""
        SELECT sr.*, s.invoice_no,
               prof.full_name AS last_updated_by
        FROM sales_returns sr
        LEFT JOIN sales s ON s.sales_id = sr.sale_id
        LEFT JOIN profiles prof ON prof.id = sr.updated_by
        WHERE sr.business_id = CAST(:bid AS uuid)
        {extra_where}
        ORDER BY {order_col} {order_dir}
        OFFSET :offset LIMIT :limit
    """
    returns = db.execute(text(list_sql), params).fetchall()

    # BATCH: fetch all return items for this page in one query
    ret_ids = [str(r.return_id) for r in returns]
    all_items = []
    if ret_ids:
        all_items = db.execute(
            text("""
                SELECT return_item_id, return_id, product_id,
                       return_qty, unit_price AS refund_amount,
                       (return_qty * unit_price) AS return_item_subtotal
                FROM sales_return_items
                WHERE return_id = ANY(CAST(:ids AS uuid[]))
            """),
            {"ids": "{" + ",".join(ret_ids) + "}"}
        ).fetchall()

    items_by_ret = {}
    for it in all_items:
        key = str(it.return_id)
        items_by_ret.setdefault(key, []).append(it)

    result = []
    for r in returns:
        items = items_by_ret.get(str(r.return_id), [])
        result.append(return_to_dict(r, items))

    return success_response(
        pagination_response(result, total, pagination["page"], pagination["limit"], capped=pagination["_capped"])
    )


# ─────────────────────────────────────────
# GET /sales-returns/{return_id} → Get one
# ─────────────────────────────────────────
@router.get("/{return_id}")
def get_sales_return(
    return_id: str,
    current_user: dict = Depends(require_permission("sales_returns.manage")),
    db: Session = Depends(get_db)
):
    business_id = current_user["business_id"]

    sales_return = db.query(SalesReturn).filter(
        SalesReturn.return_id == return_id,
        SalesReturn.business_id == business_id
    ).first()

    if not sales_return:
        return error_response("Sales return not found", status_code=404)

    items = fetch_return_items(db, return_id)
    return success_response(return_to_dict(sales_return, items))


# ─────────────────────────────────────────
# PUT /sales-returns/{return_id} → Update status
# The DB trigger trg_sales_return_stock fires on UPDATE to sales_returns.
# When status becomes 'approved' and restock=true, it adds stock back automatically.
# When status rolls back from 'approved', it reverses the stock addition.
# ─────────────────────────────────────────
@router.put("/{return_id}")
def update_sales_return(
    return_id: str,
    data: SalesReturnUpdate,
    current_user: dict = Depends(require_permission("sales_returns.manage")),
    db: Session = Depends(get_db)
):
    business_id = current_user["business_id"]
    user_id     = current_user["user_id"]

    sales_return = db.query(SalesReturn).filter(
        SalesReturn.return_id == return_id,
        SalesReturn.business_id == business_id
    ).first()

    if not sales_return:
        return error_response("Sales return not found", status_code=404)

    if sales_return.return_status == "approved":
        return error_response("Cannot update return — already approved", status_code=400)

    try:
        if data.return_status == "approved":
            item_rows = fetch_return_items(db, return_id)

            class ItemLike:
                def __init__(self, product_id, return_qty, refund_amount):
                    self.product_id = product_id
                    self.return_qty = return_qty
                    self.refund_amount = refund_amount

            items_to_validate = [
                ItemLike(row.product_id, row.return_qty, row.refund_amount)
                for row in item_rows
            ]

            error = validate_return_items(
                db=db,
                sale_id=str(sales_return.sale_id),
                business_id=business_id,
                items=items_to_validate,
                exclude_return_id=return_id
            )
            if error:
                return error_response(error, status_code=400)

        # Update status, restock, and approval fields — DB triggers fire automatically
        db.execute(
            text("""
                UPDATE sales_returns
                SET return_status = :status,
                    restock = :restock,
                    approved_by = CASE WHEN :status = 'approved' THEN CAST(:approved_by AS uuid) ELSE approved_by END,
                    approved_at = CASE WHEN :status = 'approved' THEN NOW() ELSE approved_at END
                WHERE return_id = CAST(:return_id AS uuid)
                  AND business_id = CAST(:bid AS uuid)
            """),
            {
                "status":      data.return_status,
                "restock":     data.restock,
                "approved_by": str(user_id),
                "return_id":   return_id,
                "bid":         business_id
            }
        )

        db.commit()
        db.refresh(sales_return)

        items = fetch_return_items(db, return_id)

        return success_response({
            "message": f"Sales return {data.return_status} successfully",
            "return": return_to_dict(sales_return, items)
        })

    except Exception as e:
        db.rollback()
        logging.exception(e)
        return error_response("An unexpected error occurred. Please try again.", status_code=500)

# ─────────────────────────────────────────
# DELETE /sales-returns/{return_id} → Delete pending return only
# WHY: Once a return is approved or rejected, it becomes part of the
# business record and must not be deleted. Only pending returns
# (not yet actioned) are safe to delete.
# ─────────────────────────────────────────
@router.delete("/{return_id}")
def delete_sales_return(
    return_id: str,
    current_user: dict = Depends(require_permission("sales_returns.manage")),
    db: Session = Depends(get_db)
):
    business_id = current_user["business_id"]

    # Step 1 → Check the return exists and belongs to this business
    sales_return = db.query(SalesReturn).filter(
        SalesReturn.return_id == return_id,
        SalesReturn.business_id == business_id
    ).first()

    if not sales_return:
        return error_response("Sales return not found", status_code=404)

    # Step 2 → Block deletion if not pending
    if sales_return.return_status != "pending":
        return error_response(
            f"Cannot delete a return with status '{sales_return.return_status}'. "
            "Only pending returns can be deleted.",
            status_code=400
        )

    try:
        # Step 3 → Delete return items first (FK constraint)
        db.execute(
            text("""
                DELETE FROM sales_return_items
                WHERE return_id   = CAST(:return_id AS uuid)
                  AND business_id = CAST(:bid AS uuid)
            """),
            {"return_id": return_id, "bid": business_id}
        )

        # Step 4 → Delete the return header
        db.execute(
            text("""
                DELETE FROM sales_returns
                WHERE return_id = CAST(:return_id AS uuid)
                  AND business_id = CAST(:bid AS uuid)
            """),
            {"return_id": return_id, "bid": business_id}
        )

        db.commit()
        return success_response({"message": "Sales return deleted successfully"})

    except Exception as e:
        db.rollback()
        logging.exception(e)
        return error_response("An unexpected error occurred. Please try again.", status_code=500)