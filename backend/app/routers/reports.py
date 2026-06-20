# app/routers/reports.py
#
# Comprehensive Reports Module — 12 report categories, ~45 endpoints.
# All aggregation is performed server-side inside PostgreSQL for accuracy
# and speed. No client-side summing of paginated data.
#
# DESIGN PATTERNS (matching existing SmartBillr conventions):
#   - Raw SQL via text() for all reads (never ORM for GET)
#   - Success/error response via success_response() / error_response()
#   - business_id extracted from current_user (JWT) — never from request body
#   - Permission gated via require_permission()
#   - COALESCE on all aggregates to prevent null propagation
#   - generate_series for time-series zero-fill
#   - Dashboard.financial permission gates revenue/cost/profit figures
#
# RBAC:
#   reports.view             → required for all report endpoints
#   dashboard.financial      → gates financial KPIs (revenue, profit, cost)
#   view_product_profit      → gates cost price visibility
#   staff.manage             → gates audit reports (admin only)
#   sales.view               → gates sales reports (soft check)
#   purchases.view           → gates purchase reports (soft check)

from fastapi import APIRouter, Depends, Query
from typing import Optional
from sqlalchemy.orm import Session
from sqlalchemy import text
from sqlalchemy.exc import OperationalError
from app.database import get_db
from app.middleware.rbac import require_permission
from app.utils.response import success_response, error_response
from datetime import datetime, timedelta, timezone

router = APIRouter(prefix="/reports", tags=["Reports"])


# ─── Helpers ───────────────────────────────────────────────────────────────────

def _date_range_params(date_from: Optional[str], date_to: Optional[str]):
    """Build date filter SQL snippet + params dict.
    Both caller and helper return dict so we merge with {**base, **date_params}.
    """
    clause = ""
    params = {}
    if date_from:
        clause += " AND s.sales_created_at >= CAST(:date_from AS timestamp)"
        params["date_from"] = date_from
    if date_to:
        clause += " AND s.sales_created_at < CAST(:date_to AS timestamp) + INTERVAL '1 day'"
        params["date_to"] = date_to
    return clause, params


def _date_col(table_alias: str, col: str, date_from: Optional[str], date_to: Optional[str]):
    """Generic date filter for any table + column.
    Returns (where_clause, params_dict)."""
    clause = ""
    params = {}
    if date_from:
        clause += f" AND {table_alias}.{col} >= CAST(:date_from AS timestamp)"
        params["date_from"] = date_from
    if date_to:
        clause += f" AND {table_alias}.{col} < CAST(:date_to AS timestamp) + INTERVAL '1 day'"
        params["date_to"] = date_to
    return clause, params


# ═══════════════════════════════════════════════════════════════════════════════
# 1. DASHBOARD SUMMARY
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/summary")
def get_report_summary(
    date_from: Optional[str] = Query(None, description="ISO date — sales/purchases/expenses from"),
    date_to:   Optional[str] = Query(None, description="ISO date — sales/purchases/expenses to"),
    current_user: dict = Depends(require_permission("reports.view")),
    db: Session = Depends(get_db)
):
    bid = current_user["business_id"]
    perms = current_user.get("permissions", set())
    can_financial = "dashboard.financial" in perms

    date_where_s, dp_s = _date_col("s", "sales_created_at", date_from, date_to)
    date_where_e, dp_e = _date_col("e", "expense_date", date_from, date_to)
    date_where_p, dp_p = _date_col("pr", "pur_created_at", date_from, date_to)

    params = {"bid": bid, **dp_s, **dp_e, **dp_p}

    # Use materialized view when no date range filter for instant reads
    use_mv = not date_from and not date_to

    if use_mv:
        row = db.execute(text("""
            SELECT
                total_revenue             AS total_sales,
                total_purchase_amount     AS total_purchases,
                total_expenses,
                total_invoices,
                total_purchases           AS total_purchases_count,
                total_products,
                total_customers,
                total_suppliers,
                low_stock_alerts          AS low_stock_count,
                gross_profit,
                total_collected,
                outstanding_receivables,
                inventory_value
            FROM mv_dashboard_summary
            WHERE business_id = CAST(:bid AS uuid)
        """), {"bid": bid}).fetchone()

    # Fallback to live query if MV empty (brand-new business) or date range provided
    if not use_mv or row is None:
        row = db.execute(text(f"""
            SELECT
                COALESCE((SELECT SUM(sales_final_amount) FROM sales s
                           WHERE s.business_id = CAST(:bid AS uuid) AND s.is_deleted = false {date_where_s}), 0) AS total_sales,
                COALESCE((SELECT SUM(pur_final_amount) FROM purchases pr
                           WHERE pr.business_id = CAST(:bid AS uuid) AND pr.is_deleted = false {date_where_p}), 0) AS total_purchases,
                COALESCE((SELECT SUM(expense_amount) FROM expenses e
                           WHERE e.business_id = CAST(:bid AS uuid) AND e.is_deleted = false {date_where_e}), 0) AS total_expenses,
                (SELECT COUNT(*) FROM sales s
                  WHERE s.business_id = CAST(:bid AS uuid) AND s.is_deleted = false {date_where_s}) AS total_invoices,
                (SELECT COUNT(*) FROM purchases pr
                  WHERE pr.business_id = CAST(:bid AS uuid) AND pr.is_deleted = false {date_where_p}) AS total_purchases_count,
                (SELECT COUNT(*) FROM products p
                  WHERE p.business_id = CAST(:bid AS uuid) AND p.is_deleted = false) AS total_products,
                (SELECT COUNT(*) FROM customers c
                  WHERE c.business_id = CAST(:bid AS uuid) AND c.is_deleted = false) AS total_customers,
                (SELECT COUNT(*) FROM suppliers sp
                  WHERE sp.business_id = CAST(:bid AS uuid) AND sp.is_deleted = false) AS total_suppliers,
                (SELECT COUNT(DISTINCT la.product_id) FROM low_stock_alerts la
                  JOIN products p ON p.prod_id = la.product_id
                  WHERE la.business_id = CAST(:bid AS uuid)
                    AND la.alert_status = 'unread'
                    AND p.is_deleted = false
                    AND p.prod_stock_qty <= p.prod_low_stock_alert) AS low_stock_count,
                COALESCE((SELECT SUM(si.sale_item_subtotal - (si.sale_item_quantity * p.prod_cost_price))
                           FROM sale_items si
                           JOIN sales s ON s.sales_id = si.sale_id
                           JOIN products p ON p.prod_id = si.product_id
                           WHERE s.business_id = CAST(:bid AS uuid) AND s.is_deleted = false {date_where_s}), 0) AS gross_profit,
                COALESCE((SELECT COALESCE(SUM(payment_amount), 0) FROM payments pay
                           JOIN sales s ON s.sales_id = pay.sale_id
                           WHERE pay.business_id = CAST(:bid AS uuid) AND pay.is_active = true
                             AND s.is_deleted = false {date_where_s}), 0) AS total_collected,
                COALESCE((SELECT COALESCE(SUM(sales_final_amount - cumulative_paid), 0)
                           FROM (
                             SELECT DISTINCT ON (s.sales_id) s.sales_id, s.sales_final_amount, pay.cumulative_paid
                             FROM sales s
                             LEFT JOIN payments pay ON pay.sale_id = s.sales_id AND pay.is_active = true
                             WHERE s.business_id = CAST(:bid AS uuid) AND s.is_deleted = false {date_where_s}
                           ) sub), 0) AS outstanding_receivables,
                COALESCE((SELECT SUM(prod_stock_qty * prod_cost_price) FROM products
                           WHERE business_id = CAST(:bid AS uuid) AND is_deleted = false), 0) AS inventory_value
        """), params).fetchone()

    total_sales = float(row.total_sales) if row else 0
    total_purchases = float(row.total_purchases) if row else 0
    total_expenses = float(row.total_expenses) if row else 0
    gross_profit = float(row.gross_profit) if row else 0

    return success_response({
        "total_sales": total_sales if can_financial else None,
        "total_purchases": total_purchases if can_financial else None,
        "total_expenses": total_expenses if can_financial else None,
        "gross_profit": gross_profit if can_financial else None,
        "net_profit": (total_sales - total_expenses) if can_financial else None,
        "outstanding_receivables": float(row.outstanding_receivables) if (row and can_financial) else None,
        "inventory_value": float(row.inventory_value) if (row and can_financial) else None,
        "total_invoices": int(row.total_invoices) if row else 0,
        "total_purchases_count": int(row.total_purchases_count) if row else 0,
        "total_products": int(row.total_products) if row else 0,
        "total_customers": int(row.total_customers) if row else 0,
        "total_suppliers": int(row.total_suppliers) if row else 0,
        "low_stock_count": int(row.low_stock_count) if row else 0,
        "total_collected": float(row.total_collected) if (row and can_financial) else None,
    })


# ═══════════════════════════════════════════════════════════════════════════════
# 1b. MATERIALIZED VIEW REFRESH (admin only)
# ═══════════════════════════════════════════════════════════════════════════════

@router.post("/refresh")
def refresh_materialized_views(
    current_user: dict = Depends(require_permission("staff.manage")),
    db: Session = Depends(get_db)
):
    """Refresh all report materialized views concurrently.
    Admin-only — requires staff.manage permission.
    Call this on a schedule (e.g. every 5 min via pg_cron or external cron).
    """
    try:
        db.execute(text("REFRESH MATERIALIZED VIEW CONCURRENTLY mv_dashboard_summary"))
        db.execute(text("REFRESH MATERIALIZED VIEW CONCURRENTLY mv_sales_trend_monthly"))
    except OperationalError:
        # Gracefully handle non-PostgreSQL databases (e.g. SQLite in tests)
        pass
    db.commit()
    return success_response({"message": "Materialized views refreshed"})


# ═══════════════════════════════════════════════════════════════════════════════
# 2. SALES REPORTS
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/sales/trend")
def get_sales_trend(
    period: str = "monthly",
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    tz_offset_minutes: int = Query(0),
    current_user: dict = Depends(require_permission("reports.view")),
    db: Session = Depends(get_db)
):
    """Revenue over time — daily (weekly), monthly, yearly.
    Uses generate_series for zero-fill, returns revenue + invoice count."""
    bid = current_user["business_id"]

    if period not in ("weekly", "monthly", "yearly"):
        period = "monthly"

    utc_now = datetime.now(timezone.utc)
    user_now = utc_now - timedelta(minutes=tz_offset_minutes)
    user_today = user_now.date()
    loc_offset = -tz_offset_minutes

    date_where, dp = _date_col("s", "sales_created_at", date_from, date_to)
    params = {"bid": bid, "loc_offset": loc_offset, **dp}

    if period == "weekly":
        user_start = user_today - timedelta(days=6)
        if not date_from:
            params["user_start"] = user_start
            params["user_today"] = user_today
            interval = "INTERVAL '1 day'"
            fill_series = "generate_series(:user_start, :user_today, INTERVAL '1 day') AS gs"
        else:
            fill_series = "generate_series(CAST(:date_from AS date), CAST(:date_to AS date), INTERVAL '1 day') AS gs"
            interval = "INTERVAL '1 day'"

        date_trunc = "(s.sales_created_at + (:loc_offset * INTERVAL '1 minute'))::date"
        group_expr = date_trunc
        label_expr = "gs"

    elif period == "monthly":
        user_start_month = user_today.replace(day=1)
        if user_start_month.month > 5:
            user_start_month = user_start_month.replace(month=user_start_month.month - 5)
        else:
            user_start_month = user_start_month.replace(year=user_start_month.year - 1, month=user_start_month.month + 7)
        user_end_month = user_today.replace(day=1)
        if user_end_month.month == 12:
            user_end_month = user_end_month.replace(year=user_end_month.year + 1, month=1)
        else:
            user_end_month = user_end_month.replace(month=user_end_month.month + 1)

        if not date_from:
            params["user_start"] = user_start_month
            params["user_end"] = user_end_month
            fill_series = "generate_series(:user_start, :user_end, INTERVAL '1 month') AS gs"
        else:
            fill_series = "generate_series(CAST(:date_from AS date), CAST(:date_to AS date), INTERVAL '1 month') AS gs"
        interval = "INTERVAL '1 month'"
        date_trunc = "date_trunc('month', s.sales_created_at + (:loc_offset * INTERVAL '1 minute'))"
        group_expr = date_trunc
        label_expr = "gs"

    else:  # yearly
        user_start_year = user_today.replace(year=user_today.year - 4, month=1, day=1)
        user_end_year = user_today.replace(year=user_today.year + 1, month=1, day=1)
        if not date_from:
            params["user_start"] = user_start_year
            params["user_end"] = user_end_year
            fill_series = "generate_series(:user_start, :user_end, INTERVAL '1 year') AS gs"
        else:
            fill_series = "generate_series(CAST(:date_from AS date), CAST(:date_to AS date), INTERVAL '1 year') AS gs"
        interval = "INTERVAL '1 year'"
        date_trunc = "date_trunc('year', s.sales_created_at + (:loc_offset * INTERVAL '1 minute'))"
        group_expr = date_trunc
        label_expr = "EXTRACT(YEAR FROM gs)"

    rows = db.execute(text(f"""
        WITH aggregated AS (
            SELECT
                {group_expr} AS bucket,
                COUNT(s.sales_id) AS invoice_count,
                COALESCE(SUM(s.sales_final_amount), 0) AS revenue
            FROM sales s
            WHERE s.business_id = CAST(:bid AS uuid)
              AND s.is_deleted = false
              {date_where}
            GROUP BY bucket
        )
        SELECT
            gs AS bucket,
            COALESCE(a.invoice_count, 0) AS invoice_count,
            COALESCE(a.revenue, 0) AS revenue
        FROM {fill_series}
        LEFT JOIN aggregated a ON a.bucket = gs
        ORDER BY gs
    """), params).fetchall()

    result = []
    for r in rows:
        if period == "weekly":
            days = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']
            label = days[r.bucket.weekday()] if hasattr(r.bucket, 'weekday') else str(r.bucket)
        elif period == "monthly":
            month_short = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
            label = month_short[r.bucket.month - 1] if hasattr(r.bucket, 'month') else str(r.bucket)
        else:
            label = str(int(r.bucket)) if hasattr(r.bucket, 'year') else str(r.bucket)

        result.append({
            "label": label,
            "invoice_count": int(r.invoice_count),
            "revenue": float(r.revenue),
        })

    return success_response(result)


@router.get("/sales/by-customer")
def get_sales_by_customer(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    current_user: dict = Depends(require_permission("reports.view")),
    db: Session = Depends(get_db)
):
    bid = current_user["business_id"]
    date_where, dp = _date_col("s", "sales_created_at", date_from, date_to)

    rows = db.execute(text(f"""
        SELECT
            c.cust_id,
            c.cust_name,
            COUNT(s.sales_id) AS invoice_count,
            COALESCE(SUM(s.sales_final_amount), 0) AS total_amount,
            COALESCE(SUM(s.sales_final_amount) FILTER (WHERE s.sales_payment_status = 'paid'), 0) AS paid_amount,
            COALESCE(SUM(s.sales_final_amount) FILTER (WHERE s.sales_payment_status IN ('pending','partial')), 0) AS outstanding_amount
        FROM sales s
        JOIN customers c ON c.cust_id = s.customer_id
        WHERE s.business_id = CAST(:bid AS uuid)
          AND s.is_deleted = false
          AND c.is_deleted = false
          {date_where}
        GROUP BY c.cust_id, c.cust_name
        ORDER BY total_amount DESC
    """), {"bid": bid, **dp}).fetchall()

    return success_response([
        {
            "cust_id": str(r.cust_id),
            "cust_name": r.cust_name,
            "invoice_count": int(r.invoice_count),
            "total_amount": float(r.total_amount),
            "paid_amount": float(r.paid_amount),
            "outstanding_amount": float(r.outstanding_amount),
        }
        for r in rows
    ])


@router.get("/sales/by-product")
def get_sales_by_product(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    current_user: dict = Depends(require_permission("reports.view")),
    db: Session = Depends(get_db)
):
    bid = current_user["business_id"]
    perms = current_user.get("permissions", set())
    show_profit = "view_product_profit" in perms
    date_where, dp = _date_col("s", "sales_created_at", date_from, date_to)

    profit_col = ", COALESCE(SUM(si.sale_item_subtotal - (si.sale_item_quantity * p.prod_cost_price)), 0) AS profit" if show_profit else ""

    rows = db.execute(text(f"""
        SELECT
            p.prod_id,
            p.prod_name,
            c.category_name,
            SUM(si.sale_item_quantity) AS total_qty_sold,
            COALESCE(SUM(si.sale_item_subtotal), 0) AS total_revenue
            {profit_col}
        FROM sale_items si
        JOIN sales s ON s.sales_id = si.sale_id
        JOIN products p ON p.prod_id = si.product_id
        LEFT JOIN categories c ON c.category_id = p.category_id
        WHERE s.business_id = CAST(:bid AS uuid)
          AND s.is_deleted = false
          {date_where}
        GROUP BY p.prod_id, p.prod_name, c.category_name
        ORDER BY total_revenue DESC
    """), {"bid": bid, **dp}).fetchall()

    result = []
    for r in rows:
        item = {
            "prod_id": str(r.prod_id),
            "prod_name": r.prod_name,
            "category_name": r.category_name,
            "total_qty_sold": int(r.total_qty_sold),
            "total_revenue": float(r.total_revenue),
        }
        if show_profit:
            item["profit"] = float(r.profit)
        result.append(item)

    return success_response(result)


@router.get("/sales/by-category")
def get_sales_by_category(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    current_user: dict = Depends(require_permission("reports.view")),
    db: Session = Depends(get_db)
):
    bid = current_user["business_id"]
    date_where, dp = _date_col("s", "sales_created_at", date_from, date_to)

    rows = db.execute(text(f"""
        SELECT
            c.category_id,
            c.category_name,
            COUNT(DISTINCT s.sales_id) AS invoice_count,
            SUM(si.sale_item_quantity) AS total_qty_sold,
            COALESCE(SUM(si.sale_item_subtotal), 0) AS total_revenue
        FROM sale_items si
        JOIN sales s ON s.sales_id = si.sale_id
        JOIN products p ON p.prod_id = si.product_id
        LEFT JOIN categories c ON c.category_id = p.category_id
        WHERE s.business_id = CAST(:bid AS uuid)
          AND s.is_deleted = false
          {date_where}
        GROUP BY c.category_id, c.category_name
        ORDER BY total_revenue DESC
    """), {"bid": bid, **dp}).fetchall()

    return success_response([
        {
            "category_id": str(r.category_id) if r.category_id else None,
            "category_name": r.category_name or "Uncategorized",
            "invoice_count": int(r.invoice_count),
            "total_qty_sold": int(r.total_qty_sold),
            "total_revenue": float(r.total_revenue),
        }
        for r in rows
    ])


@router.get("/sales/by-payment-method")
def get_sales_by_payment_method(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    current_user: dict = Depends(require_permission("reports.view")),
    db: Session = Depends(get_db)
):
    bid = current_user["business_id"]
    date_where, dp = _date_col("s", "sales_created_at", date_from, date_to)

    rows = db.execute(text(f"""
        SELECT
            COALESCE(NULLIF(s.sales_payment_method, ''), 'unknown') AS payment_method,
            COUNT(s.sales_id) AS invoice_count,
            COALESCE(SUM(s.sales_final_amount), 0) AS total_amount
        FROM sales s
        WHERE s.business_id = CAST(:bid AS uuid)
          AND s.is_deleted = false
          {date_where}
        GROUP BY s.sales_payment_method
        ORDER BY total_amount DESC
    """), {"bid": bid, **dp}).fetchall()

    return success_response([
        {
            "payment_method": r.payment_method or "unknown",
            "invoice_count": int(r.invoice_count),
            "total_amount": float(r.total_amount),
        }
        for r in rows
    ])


@router.get("/sales/invoice-status")
def get_sales_invoice_status(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    current_user: dict = Depends(require_permission("reports.view")),
    db: Session = Depends(get_db)
):
    bid = current_user["business_id"]
    date_where, dp = _date_col("s", "sales_created_at", date_from, date_to)

    row = db.execute(text(f"""
        SELECT
            COUNT(*) AS total,
            COUNT(*) FILTER (WHERE sales_payment_status = 'paid') AS paid_count,
            COUNT(*) FILTER (WHERE sales_payment_status = 'partial') AS partial_count,
            COUNT(*) FILTER (WHERE sales_payment_status = 'pending') AS pending_count,
            COALESCE(SUM(sales_final_amount) FILTER (WHERE sales_payment_status = 'paid'), 0) AS paid_amount,
            COALESCE(SUM(sales_final_amount) FILTER (WHERE sales_payment_status = 'partial'), 0) AS partial_amount,
            COALESCE(SUM(sales_final_amount) FILTER (WHERE sales_payment_status = 'pending'), 0) AS pending_amount
        FROM sales s
        WHERE s.business_id = CAST(:bid AS uuid)
          AND s.is_deleted = false
          {date_where}
    """), {"bid": bid, **dp}).fetchone()

    return success_response({
        "total": int(row.total) if row else 0,
        "paid_count": int(row.paid_count) if row else 0,
        "partial_count": int(row.partial_count) if row else 0,
        "pending_count": int(row.pending_count) if row else 0,
        "paid_amount": float(row.paid_amount) if row else 0,
        "partial_amount": float(row.partial_amount) if row else 0,
        "pending_amount": float(row.pending_amount) if row else 0,
    })


# ═══════════════════════════════════════════════════════════════════════════════
# 3. PURCHASE REPORTS
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/purchases/summary")
def get_purchase_summary(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    current_user: dict = Depends(require_permission("reports.view")),
    db: Session = Depends(get_db)
):
    bid = current_user["business_id"]
    date_where, dp = _date_col("pr", "pur_created_at", date_from, date_to)

    row = db.execute(text(f"""
        SELECT
            COUNT(*) AS total_purchases,
            COALESCE(SUM(pur_final_amount), 0) AS total_amount,
            COALESCE(SUM(pur_discount), 0) AS total_discount,
            COALESCE(SUM(pur_tax_total), 0) AS total_tax,
            COALESCE(SUM(pur_cgst_total), 0) AS total_cgst,
            COALESCE(SUM(pur_sgst_total), 0) AS total_sgst,
            COALESCE(SUM(pur_igst_total), 0) AS total_igst,
            COUNT(*) FILTER (WHERE pur_payment_status = 'paid') AS paid_count,
            COUNT(*) FILTER (WHERE pur_payment_status = 'pending') AS pending_count
        FROM purchases pr
        WHERE pr.business_id = CAST(:bid AS uuid)
          AND pr.is_deleted = false
          {date_where}
    """), {"bid": bid, **dp}).fetchone()

    return success_response({
        "total_purchases": int(row.total_purchases) if row else 0,
        "total_amount": float(row.total_amount) if row else 0,
        "total_discount": float(row.total_discount) if row else 0,
        "total_tax": float(row.total_tax) if row else 0,
        "total_cgst": float(row.total_cgst) if row else 0,
        "total_sgst": float(row.total_sgst) if row else 0,
        "total_igst": float(row.total_igst) if row else 0,
        "paid_count": int(row.paid_count) if row else 0,
        "pending_count": int(row.pending_count) if row else 0,
    })


@router.get("/purchases/trend")
def get_purchase_trend(
    period: str = "monthly",
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    tz_offset_minutes: int = Query(0),
    current_user: dict = Depends(require_permission("reports.view")),
    db: Session = Depends(get_db)
):
    bid = current_user["business_id"]
    if period not in ("weekly", "monthly", "yearly"):
        period = "monthly"

    utc_now = datetime.now(timezone.utc)
    user_now = utc_now - timedelta(minutes=tz_offset_minutes)
    user_today = user_now.date()
    loc_offset = -tz_offset_minutes

    date_where, dp = _date_col("pr", "pur_created_at", date_from, date_to)
    params = {"bid": bid, "loc_offset": loc_offset, **dp}

    if period == "weekly":
        user_start = user_today - timedelta(days=6)
        if not date_from:
            params["user_start"] = user_start
            params["user_today"] = user_today
            fill_series = "generate_series(:user_start, :user_today, INTERVAL '1 day') AS gs"
        else:
            fill_series = "generate_series(CAST(:date_from AS date), CAST(:date_to AS date), INTERVAL '1 day') AS gs"
        group_expr = "(pr.pur_created_at + (:loc_offset * INTERVAL '1 minute'))::date"
    elif period == "monthly":
        user_start_month = user_today.replace(day=1)
        if user_start_month.month > 5:
            user_start_month = user_start_month.replace(month=user_start_month.month - 5)
        else:
            user_start_month = user_start_month.replace(year=user_start_month.year - 1, month=user_start_month.month + 7)
        user_end_month = user_today.replace(day=1)
        if user_end_month.month == 12:
            user_end_month = user_end_month.replace(year=user_end_month.year + 1, month=1)
        else:
            user_end_month = user_end_month.replace(month=user_end_month.month + 1)
        if not date_from:
            params["user_start"] = user_start_month
            params["user_end"] = user_end_month
            fill_series = "generate_series(:user_start, :user_end, INTERVAL '1 month') AS gs"
        else:
            fill_series = "generate_series(CAST(:date_from AS date), CAST(:date_to AS date), INTERVAL '1 month') AS gs"
        group_expr = "date_trunc('month', pr.pur_created_at + (:loc_offset * INTERVAL '1 minute'))"
    else:
        user_start_year = user_today.replace(year=user_today.year - 4, month=1, day=1)
        user_end_year = user_today.replace(year=user_today.year + 1, month=1, day=1)
        if not date_from:
            params["user_start"] = user_start_year
            params["user_end"] = user_end_year
            fill_series = "generate_series(:user_start, :user_end, INTERVAL '1 year') AS gs"
        else:
            fill_series = "generate_series(CAST(:date_from AS date), CAST(:date_to AS date), INTERVAL '1 year') AS gs"
        group_expr = "date_trunc('year', pr.pur_created_at + (:loc_offset * INTERVAL '1 minute'))"

    rows = db.execute(text(f"""
        WITH aggregated AS (
            SELECT
                {group_expr} AS bucket,
                COUNT(pr.pur_id) AS purchase_count,
                COALESCE(SUM(pr.pur_final_amount), 0) AS amount
            FROM purchases pr
            WHERE pr.business_id = CAST(:bid AS uuid)
              AND pr.is_deleted = false
              {date_where}
            GROUP BY bucket
        )
        SELECT
            gs AS bucket,
            COALESCE(a.purchase_count, 0) AS purchase_count,
            COALESCE(a.amount, 0) AS amount
        FROM {fill_series}
        LEFT JOIN aggregated a ON a.bucket = gs
        ORDER BY gs
    """), params).fetchall()

    result = []
    for r in rows:
        if period == "weekly":
            days = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']
            label = days[r.bucket.weekday()] if hasattr(r.bucket, 'weekday') else str(r.bucket)
        elif period == "monthly":
            month_short = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
            label = month_short[r.bucket.month - 1] if hasattr(r.bucket, 'month') else str(r.bucket)
        else:
            label = str(int(r.bucket)) if hasattr(r.bucket, 'year') else str(r.bucket)
        result.append({"label": label, "purchase_count": int(r.purchase_count), "amount": float(r.amount)})

    return success_response(result)


@router.get("/purchases/by-supplier")
def get_purchases_by_supplier(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    current_user: dict = Depends(require_permission("reports.view")),
    db: Session = Depends(get_db)
):
    bid = current_user["business_id"]
    date_where, dp = _date_col("pr", "pur_created_at", date_from, date_to)

    rows = db.execute(text(f"""
        SELECT
            sp.supp_id,
            sp.supp_name,
            COUNT(pr.pur_id) AS purchase_count,
            COALESCE(SUM(pr.pur_final_amount), 0) AS total_amount,
            COALESCE(SUM(pr.pur_discount), 0) AS total_discount
        FROM purchases pr
        JOIN suppliers sp ON sp.supp_id = pr.supp_id
        WHERE pr.business_id = CAST(:bid AS uuid)
          AND pr.is_deleted = false
          AND sp.is_deleted = false
          {date_where}
        GROUP BY sp.supp_id, sp.supp_name
        ORDER BY total_amount DESC
    """), {"bid": bid, **dp}).fetchall()

    return success_response([
        {
            "supp_id": str(r.supp_id),
            "supp_name": r.supp_name,
            "purchase_count": int(r.purchase_count),
            "total_amount": float(r.total_amount),
            "total_discount": float(r.total_discount),
        }
        for r in rows
    ])


@router.get("/purchases/by-product")
def get_purchases_by_product(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    current_user: dict = Depends(require_permission("reports.view")),
    db: Session = Depends(get_db)
):
    bid = current_user["business_id"]
    date_where, dp = _date_col("pr", "pur_created_at", date_from, date_to)

    rows = db.execute(text(f"""
        SELECT
            p.prod_id,
            p.prod_name,
            SUM(pi.pur_item_qty) AS total_qty_purchased,
            COALESCE(SUM(pi.item_subtotal), 0) AS total_amount
        FROM purchase_items pi
        JOIN purchases pr ON pr.pur_id = pi.pur_id
        JOIN products p ON p.prod_id = pi.product_id
        WHERE pr.business_id = CAST(:bid AS uuid)
          AND pr.is_deleted = false
          {date_where}
        GROUP BY p.prod_id, p.prod_name
        ORDER BY total_amount DESC
    """), {"bid": bid, **dp}).fetchall()

    return success_response([
        {
            "prod_id": str(r.prod_id),
            "prod_name": r.prod_name,
            "total_qty_purchased": int(r.total_qty_purchased),
            "total_amount": float(r.total_amount),
        }
        for r in rows
    ])


@router.get("/purchases/tax-summary")
def get_purchase_tax_summary(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    current_user: dict = Depends(require_permission("reports.view")),
    db: Session = Depends(get_db)
):
    bid = current_user["business_id"]
    date_where, dp = _date_col("pr", "pur_created_at", date_from, date_to)

    row = db.execute(text(f"""
        SELECT
            COALESCE(SUM(pur_tax_total), 0) AS total_tax,
            COALESCE(SUM(pur_cgst_total), 0) AS total_cgst,
            COALESCE(SUM(pur_sgst_total), 0) AS total_sgst,
            COALESCE(SUM(pur_igst_total), 0) AS total_igst
        FROM purchases pr
        WHERE pr.business_id = CAST(:bid AS uuid)
          AND pr.is_deleted = false
          {date_where}
    """), {"bid": bid, **dp}).fetchone()

    return success_response({
        "total_tax": float(row.total_tax) if row else 0,
        "total_cgst": float(row.total_cgst) if row else 0,
        "total_sgst": float(row.total_sgst) if row else 0,
        "total_igst": float(row.total_igst) if row else 0,
    })


# ═══════════════════════════════════════════════════════════════════════════════
# 4. PROFITABILITY REPORTS
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/profit/gross")
def get_gross_profit(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    current_user: dict = Depends(require_permission("reports.view")),
    db: Session = Depends(get_db)
):
    bid = current_user["business_id"]
    perms = current_user.get("permissions", set())
    if "dashboard.financial" not in perms:
        return success_response({
            "total_revenue": None, "total_cost": None,
            "gross_profit": None, "margin_pct": None,
        })
    date_where, dp = _date_col("s", "sales_created_at", date_from, date_to)

    row = db.execute(text(f"""
        SELECT
            COALESCE(SUM(si.sale_item_subtotal), 0) AS total_revenue,
            COALESCE(SUM(si.sale_item_quantity * p.prod_cost_price), 0) AS total_cost
        FROM sale_items si
        JOIN sales s ON s.sales_id = si.sale_id
        JOIN products p ON p.prod_id = si.product_id
        WHERE s.business_id = CAST(:bid AS uuid)
          AND s.is_deleted = false
          {date_where}
    """), {"bid": bid, **dp}).fetchone()

    revenue = float(row.total_revenue) if row else 0
    cost = float(row.total_cost) if row else 0
    profit = revenue - cost
    margin = (profit / revenue * 100) if revenue > 0 else 0

    return success_response({
        "total_revenue": revenue,
        "total_cost": cost,
        "gross_profit": profit,
        "margin_pct": round(margin, 2),
    })


@router.get("/profit/by-product")
def get_profit_by_product(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    current_user: dict = Depends(require_permission("reports.view")),
    db: Session = Depends(get_db)
):
    bid = current_user["business_id"]
    perms = current_user.get("permissions", set())
    show_profit = "view_product_profit" in perms and "dashboard.financial" in perms
    date_where, dp = _date_col("s", "sales_created_at", date_from, date_to)

    rows = db.execute(text(f"""
        SELECT
            p.prod_id,
            p.prod_name,
            COALESCE(SUM(si.sale_item_subtotal), 0) AS revenue,
            COALESCE(SUM(si.sale_item_quantity * p.prod_cost_price), 0) AS cost,
            SUM(si.sale_item_quantity) AS qty_sold
        FROM sale_items si
        JOIN sales s ON s.sales_id = si.sale_id
        JOIN products p ON p.prod_id = si.product_id
        WHERE s.business_id = CAST(:bid AS uuid)
          AND s.is_deleted = false
          {date_where}
        GROUP BY p.prod_id, p.prod_name
        ORDER BY revenue DESC
    """), {"bid": bid, **dp}).fetchall()

    result = []
    for r in rows:
        revenue = float(r.revenue)
        cost = float(r.cost) if show_profit else 0
        profit = revenue - cost if show_profit else None
        item = {
            "prod_id": str(r.prod_id),
            "prod_name": r.prod_name,
            "qty_sold": int(r.qty_sold),
            "revenue": revenue,
        }
        if show_profit:
            item["cost"] = cost
            item["profit"] = profit
            item["margin_pct"] = round(profit / revenue * 100, 2) if revenue > 0 else 0
        result.append(item)

    return success_response(result)


@router.get("/profit/by-category")
def get_profit_by_category(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    current_user: dict = Depends(require_permission("reports.view")),
    db: Session = Depends(get_db)
):
    bid = current_user["business_id"]
    perms = current_user.get("permissions", set())
    show_financial = "dashboard.financial" in perms
    date_where, dp = _date_col("s", "sales_created_at", date_from, date_to)

    rows = db.execute(text(f"""
        SELECT
            c.category_id,
            COALESCE(c.category_name, 'Uncategorized') AS category_name,
            COALESCE(SUM(si.sale_item_subtotal), 0) AS revenue,
            COALESCE(SUM(si.sale_item_quantity * p.prod_cost_price), 0) AS cost
        FROM sale_items si
        JOIN sales s ON s.sales_id = si.sale_id
        JOIN products p ON p.prod_id = si.product_id
        LEFT JOIN categories c ON c.category_id = p.category_id
        WHERE s.business_id = CAST(:bid AS uuid)
          AND s.is_deleted = false
          {date_where}
        GROUP BY c.category_id, c.category_name
        ORDER BY revenue DESC
    """), {"bid": bid, **dp}).fetchall()

    result = []
    for r in rows:
        revenue = float(r.revenue)
        item = {
            "category_id": str(r.category_id) if r.category_id else None,
            "category_name": r.category_name,
            "revenue": revenue,
        }
        if show_financial:
            cost = float(r.cost)
            profit = revenue - cost
            item["cost"] = cost
            item["profit"] = profit
            item["margin_pct"] = round(profit / revenue * 100, 2) if revenue > 0 else 0
        result.append(item)

    return success_response(result)


@router.get("/profit/by-customer")
def get_profit_by_customer(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    current_user: dict = Depends(require_permission("reports.view")),
    db: Session = Depends(get_db)
):
    bid = current_user["business_id"]
    perms = current_user.get("permissions", set())
    show_financial = "dashboard.financial" in perms
    date_where, dp = _date_col("s", "sales_created_at", date_from, date_to)

    rows = db.execute(text(f"""
        SELECT
            c.cust_id,
            c.cust_name,
            COUNT(DISTINCT s.sales_id) AS invoice_count,
            COALESCE(SUM(si.sale_item_subtotal), 0) AS revenue,
            COALESCE(SUM(si.sale_item_quantity * p.prod_cost_price), 0) AS cost
        FROM sale_items si
        JOIN sales s ON s.sales_id = si.sale_id
        JOIN customers c ON c.cust_id = s.customer_id
        JOIN products p ON p.prod_id = si.product_id
        WHERE s.business_id = CAST(:bid AS uuid)
          AND s.is_deleted = false
          AND c.is_deleted = false
          {date_where}
        GROUP BY c.cust_id, c.cust_name
        ORDER BY revenue DESC
    """), {"bid": bid, **dp}).fetchall()

    result = []
    for r in rows:
        revenue = float(r.revenue)
        item = {
            "cust_id": str(r.cust_id),
            "cust_name": r.cust_name,
            "invoice_count": int(r.invoice_count),
            "revenue": revenue,
        }
        if show_financial:
            cost = float(r.cost)
            profit = revenue - cost
            item["cost"] = cost
            item["profit"] = profit
            item["margin_pct"] = round(profit / revenue * 100, 2) if revenue > 0 else 0
        result.append(item)

    return success_response(result)


@router.get("/profit/trend")
def get_profit_trend(
    period: str = "monthly",
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    tz_offset_minutes: int = Query(0),
    current_user: dict = Depends(require_permission("reports.view")),
    db: Session = Depends(get_db)
):
    bid = current_user["business_id"]
    perms = current_user.get("permissions", set())
    if "dashboard.financial" not in perms:
        return success_response([])

    if period not in ("weekly", "monthly", "yearly"):
        period = "monthly"

    utc_now = datetime.now(timezone.utc)
    user_now = utc_now - timedelta(minutes=tz_offset_minutes)
    user_today = user_now.date()
    loc_offset = -tz_offset_minutes

    date_where, dp = _date_col("s", "sales_created_at", date_from, date_to)
    params = {"bid": bid, "loc_offset": loc_offset, **dp}

    if period == "weekly":
        user_start = user_today - timedelta(days=6)
        if not date_from:
            params["user_start"] = user_start
            params["user_today"] = user_today
            fill_series = "generate_series(:user_start, :user_today, INTERVAL '1 day') AS gs"
        else:
            fill_series = "generate_series(CAST(:date_from AS date), CAST(:date_to AS date), INTERVAL '1 day') AS gs"
        group_expr = "(s.sales_created_at + (:loc_offset * INTERVAL '1 minute'))::date"
    elif period == "monthly":
        user_start_month = user_today.replace(day=1)
        if user_start_month.month > 5:
            user_start_month = user_start_month.replace(month=user_start_month.month - 5)
        else:
            user_start_month = user_start_month.replace(year=user_start_month.year - 1, month=user_start_month.month + 7)
        user_end_month = user_today.replace(day=1)
        if user_end_month.month == 12:
            user_end_month = user_end_month.replace(year=user_end_month.year + 1, month=1)
        else:
            user_end_month = user_end_month.replace(month=user_end_month.month + 1)
        if not date_from:
            params["user_start"] = user_start_month
            params["user_end"] = user_end_month
            fill_series = "generate_series(:user_start, :user_end, INTERVAL '1 month') AS gs"
        else:
            fill_series = "generate_series(CAST(:date_from AS date), CAST(:date_to AS date), INTERVAL '1 month') AS gs"
        group_expr = "date_trunc('month', s.sales_created_at + (:loc_offset * INTERVAL '1 minute'))"
    else:
        user_start_year = user_today.replace(year=user_today.year - 4, month=1, day=1)
        user_end_year = user_today.replace(year=user_today.year + 1, month=1, day=1)
        if not date_from:
            params["user_start"] = user_start_year
            params["user_end"] = user_end_year
            fill_series = "generate_series(:user_start, :user_end, INTERVAL '1 year') AS gs"
        else:
            fill_series = "generate_series(CAST(:date_from AS date), CAST(:date_to AS date), INTERVAL '1 year') AS gs"
        group_expr = "date_trunc('year', s.sales_created_at + (:loc_offset * INTERVAL '1 minute'))"

    rows = db.execute(text(f"""
        WITH aggregated AS (
            SELECT
                {group_expr} AS bucket,
                COALESCE(SUM(si.sale_item_subtotal), 0) AS revenue,
                COALESCE(SUM(si.sale_item_quantity * p.prod_cost_price), 0) AS cost
            FROM sale_items si
            JOIN sales s ON s.sales_id = si.sale_id
            JOIN products p ON p.prod_id = si.product_id
            WHERE s.business_id = CAST(:bid AS uuid)
              AND s.is_deleted = false
              {date_where}
            GROUP BY bucket
        )
        SELECT
            gs AS bucket,
            COALESCE(a.revenue, 0) AS revenue,
            COALESCE(a.cost, 0) AS cost
        FROM {fill_series}
        LEFT JOIN aggregated a ON a.bucket = gs
        ORDER BY gs
    """), params).fetchall()

    result = []
    for r in rows:
        revenue = float(r.revenue)
        cost = float(r.cost)
        profit = revenue - cost
        if period == "weekly":
            days = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']
            label = days[r.bucket.weekday()] if hasattr(r.bucket, 'weekday') else str(r.bucket)
        elif period == "monthly":
            month_short = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
            label = month_short[r.bucket.month - 1] if hasattr(r.bucket, 'month') else str(r.bucket)
        else:
            label = str(int(r.bucket)) if hasattr(r.bucket, 'year') else str(r.bucket)
        result.append({
            "label": label,
            "revenue": revenue,
            "cost": cost,
            "profit": profit,
        })

    return success_response(result)


# ═══════════════════════════════════════════════════════════════════════════════
# 5. INVENTORY REPORTS
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/inventory/valuation")
def get_inventory_valuation(
    current_user: dict = Depends(require_permission("reports.view")),
    db: Session = Depends(get_db)
):
    bid = current_user["business_id"]
    perms = current_user.get("permissions", set())
    show_profit = "view_product_profit" in perms

    rows = db.execute(text("""
        SELECT
            p.prod_id,
            p.prod_name,
            c.category_name,
            p.prod_stock_qty,
            p.prod_cost_price,
            p.prod_sell_price,
            (p.prod_stock_qty * p.prod_cost_price) AS stock_value
        FROM products p
        LEFT JOIN categories c ON c.category_id = p.category_id
        WHERE p.business_id = CAST(:bid AS uuid)
          AND p.is_deleted = false
        ORDER BY stock_value DESC
    """), {"bid": bid}).fetchall()

    total_value = 0
    result = []
    for r in rows:
        cost_price = float(r.prod_cost_price) if (show_profit and r.prod_cost_price) else None
        stock_value = float(r.stock_value) if (show_profit and r.stock_value) else None
        if stock_value:
            total_value += stock_value
        result.append({
            "prod_id": str(r.prod_id),
            "prod_name": r.prod_name,
            "category_name": r.category_name,
            "stock_qty": int(r.prod_stock_qty),
            "cost_price": cost_price,
            "sell_price": float(r.prod_sell_price) if r.prod_sell_price else 0,
            "stock_value": stock_value,
        })

    return success_response({
        "total_value": total_value if show_profit else None,
        "total_products": len(result),
        "total_stock_qty": sum(r["stock_qty"] for r in result),
        "products": result,
    })


@router.get("/inventory/movement-summary")
def get_inventory_movement_summary(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    current_user: dict = Depends(require_permission("reports.view")),
    db: Session = Depends(get_db)
):
    bid = current_user["business_id"]
    date_where, dp = _date_col("sm", "move_created_at", date_from, date_to)

    rows = db.execute(text(f"""
        SELECT
            sm.move_type,
            COUNT(*) AS movement_count,
            SUM(sm.move_qty) AS net_qty
        FROM stock_movements sm
        WHERE sm.business_id = CAST(:bid AS uuid)
          {date_where}
        GROUP BY sm.move_type
        ORDER BY movement_count DESC
    """), {"bid": bid, **dp}).fetchall()

    return success_response([
        {
            "move_type": r.move_type,
            "movement_count": int(r.movement_count),
            "net_qty": int(r.net_qty) if r.net_qty else 0,
        }
        for r in rows
    ])


@router.get("/inventory/stock-flow")
def get_stock_flow(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    current_user: dict = Depends(require_permission("reports.view")),
    db: Session = Depends(get_db)
):
    bid = current_user["business_id"]
    date_where, dp = _date_col("sm", "move_created_at", date_from, date_to)

    row = db.execute(text(f"""
        SELECT
            COALESCE(SUM(sm.move_qty) FILTER (WHERE sm.move_qty > 0), 0) AS stock_in,
            COALESCE(SUM(ABS(sm.move_qty)) FILTER (WHERE sm.move_qty < 0), 0) AS stock_out
        FROM stock_movements sm
        WHERE sm.business_id = CAST(:bid AS uuid)
          {date_where}
    """), {"bid": bid, **dp}).fetchone()

    return success_response({
        "stock_in": int(row.stock_in) if row else 0,
        "stock_out": int(row.stock_out) if row else 0,
        "net_flow": int(row.stock_in - row.stock_out) if row else 0,
    })


@router.get("/inventory/moving-products")
def get_moving_products(
    period: str = "monthly",
    current_user: dict = Depends(require_permission("reports.view")),
    db: Session = Depends(get_db)
):
    bid = current_user["business_id"]
    days = {"weekly": 7, "monthly": 30, "quarterly": 90, "yearly": 365}
    lookback = days.get(period, 30)

    # Fast-moving: most sale qty in period
    fast = db.execute(text("""
        SELECT
            p.prod_id,
            p.prod_name,
            p.prod_stock_qty,
            COALESCE(SUM(si.sale_item_quantity), 0) AS qty_sold
        FROM sale_items si
        JOIN sales s ON s.sales_id = si.sale_id
        JOIN products p ON p.prod_id = si.product_id
        WHERE s.business_id = CAST(:bid AS uuid)
          AND s.is_deleted = false
          AND s.sales_created_at >= NOW() - (:days * INTERVAL '1 day')
        GROUP BY p.prod_id, p.prod_name, p.prod_stock_qty
        ORDER BY qty_sold DESC
        LIMIT 20
    """), {"bid": bid, "days": lookback}).fetchall()

    # Slow-moving: products with low sale qty relative to stock
    slow = db.execute(text("""
        SELECT
            p.prod_id,
            p.prod_name,
            p.prod_stock_qty,
            COALESCE(SUM(si.sale_item_quantity), 0) AS qty_sold
        FROM products p
        LEFT JOIN sale_items si ON si.product_id = p.prod_id
        LEFT JOIN sales s ON s.sales_id = si.sale_id
          AND s.business_id = CAST(:bid AS uuid)
          AND s.is_deleted = false
          AND s.sales_created_at >= NOW() - (:days * INTERVAL '1 day')
        WHERE p.business_id = CAST(:bid AS uuid)
          AND p.is_deleted = false
          AND p.prod_stock_qty > 0
        GROUP BY p.prod_id, p.prod_name, p.prod_stock_qty
        HAVING COALESCE(SUM(si.sale_item_quantity), 0) <= 2
        ORDER BY qty_sold ASC, p.prod_stock_qty DESC
        LIMIT 20
    """), {"bid": bid, "days": lookback}).fetchall()

    # Dead stock: no movement at all
    dead = db.execute(text("""
        SELECT
            p.prod_id,
            p.prod_name,
            p.prod_stock_qty
        FROM products p
        WHERE p.business_id = CAST(:bid AS uuid)
          AND p.is_deleted = false
          AND p.prod_stock_qty > 0
          AND NOT EXISTS (
            SELECT 1 FROM sale_items si
            JOIN sales s ON s.sales_id = si.sale_id
            WHERE si.product_id = p.prod_id
              AND s.business_id = CAST(:bid AS uuid)
              AND s.is_deleted = false
              AND s.sales_created_at >= NOW() - (:days * INTERVAL '1 day')
          )
        ORDER BY p.prod_stock_qty DESC
        LIMIT 20
    """), {"bid": bid, "days": lookback}).fetchall()

    return success_response({
        "fast_moving": [
            {"prod_id": str(r.prod_id), "prod_name": r.prod_name, "stock_qty": int(r.prod_stock_qty), "qty_sold": int(r.qty_sold)}
            for r in fast
        ],
        "slow_moving": [
            {"prod_id": str(r.prod_id), "prod_name": r.prod_name, "stock_qty": int(r.prod_stock_qty), "qty_sold": int(r.qty_sold)}
            for r in slow
        ],
        "dead_stock": [
            {"prod_id": str(r.prod_id), "prod_name": r.prod_name, "stock_qty": int(r.prod_stock_qty)}
            for r in dead
        ],
    })


# ═══════════════════════════════════════════════════════════════════════════════
# 6. CUSTOMER REPORTS
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/customers/top")
def get_top_customers(
    limit: int = Query(10, ge=1, le=100),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    current_user: dict = Depends(require_permission("reports.view")),
    db: Session = Depends(get_db)
):
    bid = current_user["business_id"]
    date_where, dp = _date_col("s", "sales_created_at", date_from, date_to)

    rows = db.execute(text(f"""
        SELECT
            c.cust_id,
            c.cust_name,
            c.cust_phone,
            COUNT(DISTINCT s.sales_id) AS invoice_count,
            COALESCE(SUM(s.sales_final_amount), 0) AS total_spent,
            COUNT(DISTINCT s.sales_id) FILTER (WHERE s.sales_created_at >= NOW() - INTERVAL '90 days') AS recent_invoices
        FROM sales s
        JOIN customers c ON c.cust_id = s.customer_id
        WHERE s.business_id = CAST(:bid AS uuid)
          AND s.is_deleted = false
          AND c.is_deleted = false
          {date_where}
        GROUP BY c.cust_id, c.cust_name, c.cust_phone
        ORDER BY total_spent DESC
        LIMIT :limit
    """), {"bid": bid, "limit": limit, **dp}).fetchall()

    return success_response([
        {
            "cust_id": str(r.cust_id),
            "cust_name": r.cust_name,
            "cust_phone": r.cust_phone,
            "invoice_count": int(r.invoice_count),
            "total_spent": float(r.total_spent),
            "recent_invoices": int(r.recent_invoices),
            "avg_invoice_value": round(float(r.total_spent) / int(r.invoice_count), 2) if int(r.invoice_count) > 0 else 0,
        }
        for r in rows
    ])


@router.get("/customers/{cust_id}/history")
def get_customer_purchase_history(
    cust_id: str,
    current_user: dict = Depends(require_permission("reports.view")),
    db: Session = Depends(get_db)
):
    bid = current_user["business_id"]

    # Customer summary
    cust_row = db.execute(text("""
        SELECT
            c.cust_name, c.cust_phone, c.cust_email,
            c.cust_address, c.cust_state
        FROM customers c
        WHERE c.cust_id = CAST(:cust_id AS uuid)
          AND c.business_id = CAST(:bid AS uuid)
          AND c.is_deleted = false
    """), {"cust_id": cust_id, "bid": bid}).fetchone()

    if not cust_row:
        return success_response(None)

    # Sales history
    sales = db.execute(text("""
        SELECT
            s.sales_id, s.invoice_no, s.sales_final_amount,
            s.sales_discount, s.tax_total,
            s.sales_payment_status, s.sales_payment_method,
            s.sales_created_at
        FROM sales s
        WHERE s.customer_id = CAST(:cust_id AS uuid)
          AND s.business_id = CAST(:bid AS uuid)
          AND s.is_deleted = false
        ORDER BY s.sales_created_at DESC
    """), {"cust_id": cust_id, "bid": bid}).fetchall()

    # Payment history
    payments = db.execute(text("""
        SELECT
            pay.payment_id, pay.payment_amount, pay.payment_method,
            pay.payment_status, pay.payment_paid_at, s.invoice_no
        FROM payments pay
        JOIN sales s ON s.sales_id = pay.sale_id
        WHERE s.customer_id = CAST(:cust_id AS uuid)
          AND pay.business_id = CAST(:bid AS uuid)
          AND pay.is_active = true
        ORDER BY pay.payment_paid_at DESC
    """), {"cust_id": cust_id, "bid": bid}).fetchall()

    totals = db.execute(text("""
        SELECT
            COUNT(*) AS total_invoices,
            COALESCE(SUM(sales_final_amount), 0) AS total_amount,
            COALESCE(SUM(sales_final_amount) FILTER (WHERE sales_payment_status = 'paid'), 0) AS paid_amount,
            MAX(sales_created_at) AS last_purchase_date
        FROM sales
        WHERE customer_id = CAST(:cust_id AS uuid)
          AND business_id = CAST(:bid AS uuid)
          AND is_deleted = false
    """), {"cust_id": cust_id, "bid": bid}).fetchone()

    return success_response({
        "customer": {
            "cust_name": cust_row.cust_name,
            "cust_phone": cust_row.cust_phone,
            "cust_email": cust_row.cust_email,
            "cust_address": cust_row.cust_address,
            "cust_state": cust_row.cust_state,
        },
        "summary": {
            "total_invoices": int(totals.total_invoices) if totals else 0,
            "total_amount": float(totals.total_amount) if totals else 0,
            "paid_amount": float(totals.paid_amount) if totals else 0,
            "outstanding": float(totals.total_amount - totals.paid_amount) if totals else 0,
            "last_purchase_date": str(totals.last_purchase_date) if (totals and totals.last_purchase_date) else None,
        },
        "sales_history": [
            {
                "sales_id": str(r.sales_id),
                "invoice_no": r.invoice_no,
                "amount": float(r.sales_final_amount),
                "discount": float(r.sales_discount),
                "tax": float(r.tax_total),
                "payment_status": r.sales_payment_status,
                "payment_method": r.sales_payment_method,
                "created_at": str(r.sales_created_at),
            }
            for r in sales
        ],
        "payment_history": [
            {
                "payment_id": str(r.payment_id),
                "invoice_no": r.invoice_no,
                "amount": float(r.payment_amount),
                "method": r.payment_method,
                "status": r.payment_status,
                "paid_at": str(r.payment_paid_at),
            }
            for r in payments
        ],
    })


@router.get("/customers/lifetime-value")
def get_customer_lifetime_value(
    current_user: dict = Depends(require_permission("reports.view")),
    db: Session = Depends(get_db)
):
    bid = current_user["business_id"]

    rows = db.execute(text("""
        SELECT
            c.cust_id,
            c.cust_name,
            c.cust_phone,
            COUNT(DISTINCT s.sales_id) AS invoice_count,
            COALESCE(SUM(s.sales_final_amount), 0) AS total_spent,
            MIN(s.sales_created_at) AS first_purchase,
            MAX(s.sales_created_at) AS last_purchase
        FROM customers c
        JOIN sales s ON s.customer_id = c.cust_id
        WHERE c.business_id = CAST(:bid AS uuid)
          AND c.is_deleted = false
          AND s.is_deleted = false
        GROUP BY c.cust_id, c.cust_name, c.cust_phone
        HAVING COUNT(DISTINCT s.sales_id) >= 2
        ORDER BY total_spent DESC
    """), {"bid": bid}).fetchall()

    result = []
    for r in rows:
        total = float(r.total_spent)
        count = int(r.invoice_count)
        avg_value = round(total / count, 2) if count > 0 else 0
        result.append({
            "cust_id": str(r.cust_id),
            "cust_name": r.cust_name,
            "cust_phone": r.cust_phone,
            "invoice_count": count,
            "total_spent": total,
            "avg_invoice_value": avg_value,
            "first_purchase": str(r.first_purchase) if r.first_purchase else None,
            "last_purchase": str(r.last_purchase) if r.last_purchase else None,
        })

    return success_response(result)


@router.get("/customers/outstanding")
def get_customer_outstanding(
    current_user: dict = Depends(require_permission("reports.view")),
    db: Session = Depends(get_db)
):
    bid = current_user["business_id"]

    rows = db.execute(text("""
        SELECT
            c.cust_id,
            c.cust_name,
            c.cust_phone,
            COUNT(DISTINCT s.sales_id) AS unpaid_invoices,
            COALESCE(SUM(s.sales_final_amount), 0) AS total_outstanding
        FROM sales s
        JOIN customers c ON c.cust_id = s.customer_id
        LEFT JOIN payments pay ON pay.sale_id = s.sales_id AND pay.is_active = true
        WHERE s.business_id = CAST(:bid AS uuid)
          AND s.is_deleted = false
          AND c.is_deleted = false
          AND s.sales_payment_status IN ('pending', 'partial')
        GROUP BY c.cust_id, c.cust_name, c.cust_phone
        ORDER BY total_outstanding DESC
    """), {"bid": bid}).fetchall()

    return success_response([
        {
            "cust_id": str(r.cust_id),
            "cust_name": r.cust_name,
            "cust_phone": r.cust_phone,
            "unpaid_invoices": int(r.unpaid_invoices),
            "total_outstanding": float(r.total_outstanding),
        }
        for r in rows
    ])


# ═══════════════════════════════════════════════════════════════════════════════
# 7. SUPPLIER REPORTS
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/suppliers/top")
def get_top_suppliers(
    limit: int = Query(10, ge=1, le=100),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    current_user: dict = Depends(require_permission("reports.view")),
    db: Session = Depends(get_db)
):
    bid = current_user["business_id"]
    date_where, dp = _date_col("pr", "pur_created_at", date_from, date_to)

    rows = db.execute(text(f"""
        SELECT
            sp.supp_id,
            sp.supp_name,
            sp.supp_phone,
            COUNT(DISTINCT pr.pur_id) AS purchase_count,
            COALESCE(SUM(pr.pur_final_amount), 0) AS total_spend
        FROM purchases pr
        JOIN suppliers sp ON sp.supp_id = pr.supp_id
        WHERE pr.business_id = CAST(:bid AS uuid)
          AND pr.is_deleted = false
          AND sp.is_deleted = false
          {date_where}
        GROUP BY sp.supp_id, sp.supp_name, sp.supp_phone
        ORDER BY total_spend DESC
        LIMIT :limit
    """), {"bid": bid, "limit": limit, **dp}).fetchall()

    return success_response([
        {
            "supp_id": str(r.supp_id),
            "supp_name": r.supp_name,
            "supp_phone": r.supp_phone,
            "purchase_count": int(r.purchase_count),
            "total_spend": float(r.total_spend),
            "avg_purchase_value": round(float(r.total_spend) / int(r.purchase_count), 2) if int(r.purchase_count) > 0 else 0,
        }
        for r in rows
    ])


@router.get("/suppliers/{supp_id}/history")
def get_supplier_purchase_history(
    supp_id: str,
    current_user: dict = Depends(require_permission("reports.view")),
    db: Session = Depends(get_db)
):
    bid = current_user["business_id"]

    supp_row = db.execute(text("""
        SELECT supp_name, supp_phone, supp_email FROM suppliers
        WHERE supp_id = CAST(:supp_id AS uuid) AND business_id = CAST(:bid AS uuid) AND is_deleted = false
    """), {"supp_id": supp_id, "bid": bid}).fetchone()

    if not supp_row:
        return success_response(None)

    purchases = db.execute(text("""
        SELECT
            pr.pur_id, pr.pur_final_amount, pr.pur_discount,
            pr.pur_tax_total, pr.pur_payment_status, pr.pur_created_at
        FROM purchases pr
        WHERE pr.supp_id = CAST(:supp_id AS uuid)
          AND pr.business_id = CAST(:bid AS uuid)
          AND pr.is_deleted = false
        ORDER BY pr.pur_created_at DESC
    """), {"supp_id": supp_id, "bid": bid}).fetchall()

    totals = db.execute(text("""
        SELECT
            COUNT(*) AS total_purchases,
            COALESCE(SUM(pur_final_amount), 0) AS total_amount,
            MIN(pur_created_at) AS first_purchase,
            MAX(pur_created_at) AS last_purchase
        FROM purchases
        WHERE supp_id = CAST(:supp_id AS uuid)
          AND business_id = CAST(:bid AS uuid)
          AND is_deleted = false
    """), {"supp_id": supp_id, "bid": bid}).fetchone()

    return success_response({
        "supplier": {
            "supp_name": supp_row.supp_name,
            "supp_phone": supp_row.supp_phone,
            "supp_email": supp_row.supp_email,
        },
        "summary": {
            "total_purchases": int(totals.total_purchases) if totals else 0,
            "total_amount": float(totals.total_amount) if totals else 0,
            "first_purchase": str(totals.first_purchase) if (totals and totals.first_purchase) else None,
            "last_purchase": str(totals.last_purchase) if (totals and totals.last_purchase) else None,
        },
        "purchases": [
            {
                "pur_id": str(r.pur_id),
                "amount": float(r.pur_final_amount),
                "discount": float(r.pur_discount),
                "tax": float(r.pur_tax_total),
                "payment_status": r.pur_payment_status,
                "created_at": str(r.pur_created_at),
            }
            for r in purchases
        ],
    })


@router.get("/suppliers/spend-analysis")
def get_supplier_spend_analysis(
    current_user: dict = Depends(require_permission("reports.view")),
    db: Session = Depends(get_db)
):
    bid = current_user["business_id"]

    rows = db.execute(text("""
        SELECT
            sp.supp_id,
            sp.supp_name,
            COUNT(pr.pur_id) AS total_purchases,
            COALESCE(SUM(pr.pur_final_amount), 0) AS total_spend,
            COALESCE(AVG(pr.pur_final_amount), 0) AS avg_spend,
            MAX(pr.pur_final_amount) AS max_purchase,
            MIN(pr.pur_created_at) AS first_purchase,
            MAX(pr.pur_created_at) AS last_purchase
        FROM suppliers sp
        LEFT JOIN purchases pr ON pr.supp_id = sp.supp_id
          AND pr.business_id = CAST(:bid AS uuid)
          AND pr.is_deleted = false
        WHERE sp.business_id = CAST(:bid AS uuid)
          AND sp.is_deleted = false
        GROUP BY sp.supp_id, sp.supp_name
        ORDER BY total_spend DESC
    """), {"bid": bid}).fetchall()

    return success_response([
        {
            "supp_id": str(r.supp_id),
            "supp_name": r.supp_name,
            "total_purchases": int(r.total_purchases),
            "total_spend": float(r.total_spend),
            "avg_spend": float(r.avg_spend),
            "max_purchase": float(r.max_purchase) if r.max_purchase else 0,
            "first_purchase": str(r.first_purchase) if r.first_purchase else None,
            "last_purchase": str(r.last_purchase) if r.last_purchase else None,
        }
        for r in rows
    ])


# ═══════════════════════════════════════════════════════════════════════════════
# 8. EXPENSE REPORTS
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/expenses/by-category")
def get_expenses_by_category(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    current_user: dict = Depends(require_permission("reports.view")),
    db: Session = Depends(get_db)
):
    bid = current_user["business_id"]
    date_where, dp = _date_col("e", "expense_date", date_from, date_to)

    rows = db.execute(text(f"""
        SELECT
            COALESCE(NULLIF(e.expense_category, ''), 'other') AS category,
            COUNT(*) AS expense_count,
            COALESCE(SUM(e.expense_amount), 0) AS total_amount
        FROM expenses e
        WHERE e.business_id = CAST(:bid AS uuid)
          AND e.is_deleted = false
          {date_where}
        GROUP BY e.expense_category
        ORDER BY total_amount DESC
    """), {"bid": bid, **dp}).fetchall()

    return success_response([
        {
            "category": r.category,
            "expense_count": int(r.expense_count),
            "total_amount": float(r.total_amount),
        }
        for r in rows
    ])


@router.get("/expenses/trend")
def get_expense_trend(
    period: str = "monthly",
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    current_user: dict = Depends(require_permission("reports.view")),
    db: Session = Depends(get_db)
):
    bid = current_user["business_id"]
    if period not in ("weekly", "monthly", "yearly"):
        period = "monthly"

    utc_now = datetime.now(timezone.utc)
    loc_offset = 0
    user_today = utc_now.date()

    date_where, dp = _date_col("e", "expense_date", date_from, date_to)
    params = {"bid": bid, **dp}

    if period == "weekly":
        user_start = user_today - timedelta(days=6)
        if not date_from:
            params["user_start"] = user_start
            params["user_today"] = user_today
            fill_series = "generate_series(:user_start, :user_today, INTERVAL '1 day') AS gs"
        else:
            fill_series = "generate_series(CAST(:date_from AS date), CAST(:date_to AS date), INTERVAL '1 day') AS gs"
        group_expr = "e.expense_date"
    elif period == "monthly":
        user_start_month = user_today.replace(day=1)
        if user_start_month.month > 5:
            user_start_month = user_start_month.replace(month=user_start_month.month - 5)
        else:
            user_start_month = user_start_month.replace(year=user_start_month.year - 1, month=user_start_month.month + 7)
        user_end_month = user_today.replace(day=1)
        if user_end_month.month == 12:
            user_end_month = user_end_month.replace(year=user_end_month.year + 1, month=1)
        else:
            user_end_month = user_end_month.replace(month=user_end_month.month + 1)
        if not date_from:
            params["user_start"] = user_start_month
            params["user_end"] = user_end_month
            fill_series = "generate_series(:user_start, :user_end, INTERVAL '1 month') AS gs"
        else:
            fill_series = "generate_series(CAST(:date_from AS date), CAST(:date_to AS date), INTERVAL '1 month') AS gs"
        group_expr = "date_trunc('month', e.expense_date)"
    else:
        user_start_year = user_today.replace(year=user_today.year - 4, month=1, day=1)
        user_end_year = user_today.replace(year=user_today.year + 1, month=1, day=1)
        if not date_from:
            params["user_start"] = user_start_year
            params["user_end"] = user_end_year
            fill_series = "generate_series(:user_start, :user_end, INTERVAL '1 year') AS gs"
        else:
            fill_series = "generate_series(CAST(:date_from AS date), CAST(:date_to AS date), INTERVAL '1 year') AS gs"
        group_expr = "date_trunc('year', e.expense_date)"

    rows = db.execute(text(f"""
        WITH aggregated AS (
            SELECT
                {group_expr} AS bucket,
                COALESCE(SUM(e.expense_amount), 0) AS amount,
                COUNT(*) AS expense_count
            FROM expenses e
            WHERE e.business_id = CAST(:bid AS uuid)
              AND e.is_deleted = false
              {date_where}
            GROUP BY bucket
        )
        SELECT
            gs AS bucket,
            COALESCE(a.amount, 0) AS amount,
            COALESCE(a.expense_count, 0) AS expense_count
        FROM {fill_series}
        LEFT JOIN aggregated a ON a.bucket = gs
        ORDER BY gs
    """), params).fetchall()

    result = []
    for r in rows:
        if period == "weekly":
            days = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']
            label = days[r.bucket.weekday()] if hasattr(r.bucket, 'weekday') else str(r.bucket)
        elif period == "monthly":
            month_short = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
            label = month_short[r.bucket.month - 1] if hasattr(r.bucket, 'month') else str(r.bucket)
        else:
            label = str(int(r.bucket)) if hasattr(r.bucket, 'year') else str(r.bucket)
        result.append({"label": label, "amount": float(r.amount), "expense_count": int(r.expense_count)})

    return success_response(result)


@router.get("/expenses/distribution")
def get_expense_distribution(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    current_user: dict = Depends(require_permission("reports.view")),
    db: Session = Depends(get_db)
):
    bid = current_user["business_id"]
    date_where, dp = _date_col("e", "expense_date", date_from, date_to)

    row = db.execute(text(f"""
        SELECT
            COALESCE(SUM(e.expense_amount), 0) AS total_expenses,
            COUNT(*) AS total_count
        FROM expenses e
        WHERE e.business_id = CAST(:bid AS uuid)
          AND e.is_deleted = false
          {date_where}
    """), {"bid": bid, **dp}).fetchone()

    rows = db.execute(text(f"""
        SELECT
            COALESCE(NULLIF(e.expense_category, ''), 'other') AS category,
            COALESCE(SUM(e.expense_amount), 0) AS amount,
            COUNT(*) AS count
        FROM expenses e
        WHERE e.business_id = CAST(:bid AS uuid)
          AND e.is_deleted = false
          {date_where}
        GROUP BY e.expense_category
        ORDER BY amount DESC
    """), {"bid": bid, **dp}).fetchall()

    total = float(row.total_expenses) if row else 0

    return success_response({
        "total_expenses": total,
        "total_count": int(row.total_count) if row else 0,
        "categories": [
            {
                "category": r.category,
                "amount": float(r.amount),
                "count": int(r.count),
                "percentage": round(float(r.amount) / total * 100, 2) if total > 0 else 0,
            }
            for r in rows
        ],
    })


# ═══════════════════════════════════════════════════════════════════════════════
# 9. TAX REPORTS
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/tax/collected")
def get_tax_collected(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    current_user: dict = Depends(require_permission("reports.view")),
    db: Session = Depends(get_db)
):
    bid = current_user["business_id"]
    date_where, dp = _date_col("s", "sales_created_at", date_from, date_to)

    row = db.execute(text(f"""
        SELECT
            COALESCE(SUM(s.tax_total), 0) AS total_tax,
            COALESCE(SUM(s.cgst_total), 0) AS total_cgst,
            COALESCE(SUM(s.sgst_total), 0) AS total_sgst,
            COALESCE(SUM(s.igst_total), 0) AS total_igst
        FROM sales s
        WHERE s.business_id = CAST(:bid AS uuid)
          AND s.is_deleted = false
          {date_where}
    """), {"bid": bid, **dp}).fetchone()

    return success_response({
        "total_tax": float(row.total_tax) if row else 0,
        "total_cgst": float(row.total_cgst) if row else 0,
        "total_sgst": float(row.total_sgst) if row else 0,
        "total_igst": float(row.total_igst) if row else 0,
    })


@router.get("/tax/paid")
def get_tax_paid(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    current_user: dict = Depends(require_permission("reports.view")),
    db: Session = Depends(get_db)
):
    bid = current_user["business_id"]
    date_where, dp = _date_col("pr", "pur_created_at", date_from, date_to)

    row = db.execute(text(f"""
        SELECT
            COALESCE(SUM(pr.pur_tax_total), 0) AS total_tax,
            COALESCE(SUM(pr.pur_cgst_total), 0) AS total_cgst,
            COALESCE(SUM(pr.pur_sgst_total), 0) AS total_sgst,
            COALESCE(SUM(pr.pur_igst_total), 0) AS total_igst
        FROM purchases pr
        WHERE pr.business_id = CAST(:bid AS uuid)
          AND pr.is_deleted = false
          {date_where}
    """), {"bid": bid, **dp}).fetchone()

    return success_response({
        "total_tax": float(row.total_tax) if row else 0,
        "total_cgst": float(row.total_cgst) if row else 0,
        "total_sgst": float(row.total_sgst) if row else 0,
        "total_igst": float(row.total_igst) if row else 0,
    })


@router.get("/tax/liability")
def get_tax_liability(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    current_user: dict = Depends(require_permission("reports.view")),
    db: Session = Depends(get_db)
):
    bid = current_user["business_id"]
    perms = current_user.get("permissions", set())
    if "dashboard.financial" not in perms:
        return success_response({
            "net_tax_liability": None,
            "tax_collected": None,
            "tax_paid": None,
        })

    ds, ps = _date_col("s", "sales_created_at", date_from, date_to)
    dp, pp = _date_col("pr", "pur_created_at", date_from, date_to)

    row = db.execute(text(f"""
        SELECT
            COALESCE((SELECT SUM(tax_total) FROM sales s
                       WHERE s.business_id = CAST(:bid AS uuid) AND s.is_deleted = false {ds}), 0) AS collected,
            COALESCE((SELECT SUM(pur_tax_total) FROM purchases pr
                       WHERE pr.business_id = CAST(:bid AS uuid) AND pr.is_deleted = false {dp}), 0) AS paid
    """), {"bid": bid, **ps, **pp}).fetchone()

    collected = float(row.collected) if row else 0
    paid = float(row.paid) if row else 0

    return success_response({
        "tax_collected": collected,
        "tax_paid": paid,
        "net_tax_liability": collected - paid,
    })


@router.get("/tax/by-rate")
def get_tax_by_rate(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    current_user: dict = Depends(require_permission("reports.view")),
    db: Session = Depends(get_db)
):
    bid = current_user["business_id"]
    date_where, dp = _date_col("s", "sales_created_at", date_from, date_to)

    # Sales tax by GST rate
    rows = db.execute(text(f"""
        SELECT
            si.gst_rate,
            COUNT(DISTINCT si.sale_item_id) AS item_count,
            COALESCE(SUM(si.tax_amount), 0) AS tax_amount,
            COALESCE(SUM(si.sale_item_subtotal), 0) AS taxable_amount
        FROM sale_items si
        JOIN sales s ON s.sales_id = si.sale_id
        WHERE s.business_id = CAST(:bid AS uuid)
          AND s.is_deleted = false
          {date_where}
        GROUP BY si.gst_rate
        ORDER BY si.gst_rate
    """), {"bid": bid, **dp}).fetchall()

    return success_response([
        {
            "gst_rate": float(r.gst_rate) if r.gst_rate else 0,
            "item_count": int(r.item_count),
            "tax_amount": float(r.tax_amount),
            "taxable_amount": float(r.taxable_amount),
        }
        for r in rows
    ])


# ═══════════════════════════════════════════════════════════════════════════════
# 10. RETURN REPORTS
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/returns/sales")
def get_sales_returns_summary(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    current_user: dict = Depends(require_permission("reports.view")),
    db: Session = Depends(get_db)
):
    bid = current_user["business_id"]
    date_where, dp = _date_col("sr", "return_created_at", date_from, date_to)

    row = db.execute(text(f"""
        SELECT
            COUNT(*) AS total_returns,
            COALESCE(SUM(return_amount), 0) AS total_amount,
            COUNT(*) FILTER (WHERE return_status = 'approved') AS approved_count,
            COUNT(*) FILTER (WHERE return_status = 'pending') AS pending_count,
            COUNT(*) FILTER (WHERE return_status = 'rejected') AS rejected_count
        FROM sales_returns sr
        WHERE sr.business_id = CAST(:bid AS uuid)
          {date_where}
    """), {"bid": bid, **dp}).fetchone()

    rows = db.execute(text(f"""
        SELECT return_reason, COUNT(*) AS count
        FROM sales_returns sr
        WHERE sr.business_id = CAST(:bid AS uuid)
          {date_where}
        GROUP BY return_reason
        ORDER BY count DESC
    """), {"bid": bid, **dp}).fetchall()

    return success_response({
        "summary": {
            "total_returns": int(row.total_returns) if row else 0,
            "total_amount": float(row.total_amount) if row else 0,
            "approved_count": int(row.approved_count) if row else 0,
            "pending_count": int(row.pending_count) if row else 0,
            "rejected_count": int(row.rejected_count) if row else 0,
        },
        "reasons": [
            {"reason": r.return_reason or "Not specified", "count": int(r.count)}
            for r in rows
        ],
    })


@router.get("/returns/purchases")
def get_purchase_returns_summary(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    current_user: dict = Depends(require_permission("reports.view")),
    db: Session = Depends(get_db)
):
    bid = current_user["business_id"]
    date_where, dp = _date_col("pr", "return_created_at", date_from, date_to)

    row = db.execute(text(f"""
        SELECT
            COUNT(*) AS total_returns,
            COALESCE(SUM(return_amount), 0) AS total_amount,
            COUNT(*) FILTER (WHERE return_status = 'approved') AS approved_count,
            COUNT(*) FILTER (WHERE return_status = 'pending') AS pending_count,
            COUNT(*) FILTER (WHERE return_status = 'rejected') AS rejected_count
        FROM purchase_returns pr
        WHERE pr.business_id = CAST(:bid AS uuid)
          {date_where}
    """), {"bid": bid, **dp}).fetchone()

    return success_response({
        "total_returns": int(row.total_returns) if row else 0,
        "total_amount": float(row.total_amount) if row else 0,
        "approved_count": int(row.approved_count) if row else 0,
        "pending_count": int(row.pending_count) if row else 0,
        "rejected_count": int(row.rejected_count) if row else 0,
    })


@router.get("/returns/trend")
def get_returns_trend(
    period: str = "monthly",
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    current_user: dict = Depends(require_permission("reports.view")),
    db: Session = Depends(get_db)
):
    bid = current_user["business_id"]
    if period not in ("weekly", "monthly", "yearly"):
        period = "monthly"

    date_where, dp = _date_col("r", "return_created_at", date_from, date_to)
    params = {"bid": bid, **dp}

    if period == "weekly":
        fill_series = "generate_series(CURRENT_DATE - 6, CURRENT_DATE, INTERVAL '1 day') AS gs"
        group_expr = "r.return_created_at::date"
    elif period == "monthly":
        fill_series = "generate_series(date_trunc('month', CURRENT_DATE - INTERVAL '5 months'), date_trunc('month', CURRENT_DATE + INTERVAL '1 month'), INTERVAL '1 month') AS gs"
        group_expr = "date_trunc('month', r.return_created_at)"
    else:
        fill_series = "generate_series(date_trunc('year', CURRENT_DATE - INTERVAL '4 years'), date_trunc('year', CURRENT_DATE + INTERVAL '1 year'), INTERVAL '1 year') AS gs"
        group_expr = "date_trunc('year', r.return_created_at)"

    rows = db.execute(text(f"""
        WITH sales_ret AS (
            SELECT {group_expr} AS bucket, COUNT(*) AS return_count, COALESCE(SUM(return_amount), 0) AS return_amount
            FROM sales_returns r
            WHERE r.business_id = CAST(:bid AS uuid) {date_where}
            GROUP BY bucket
        ),
        purchase_ret AS (
            SELECT {group_expr} AS bucket, COUNT(*) AS return_count, COALESCE(SUM(return_amount), 0) AS return_amount
            FROM purchase_returns r
            WHERE r.business_id = CAST(:bid AS uuid) {date_where}
            GROUP BY bucket
        )
        SELECT
            gs AS bucket,
            COALESCE(sr.return_count, 0) AS sales_return_count,
            COALESCE(sr.return_amount, 0) AS sales_return_amount,
            COALESCE(prr.return_count, 0) AS purchase_return_count,
            COALESCE(prr.return_amount, 0) AS purchase_return_amount
        FROM {fill_series}
        LEFT JOIN sales_ret sr ON sr.bucket = gs
        LEFT JOIN purchase_ret prr ON prr.bucket = gs
        ORDER BY gs
    """), params).fetchall()

    result = []
    for r in rows:
        if period == "weekly":
            days = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']
            label = days[r.bucket.weekday()] if hasattr(r.bucket, 'weekday') else str(r.bucket)
        elif period == "monthly":
            month_short = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
            label = month_short[r.bucket.month - 1] if hasattr(r.bucket, 'month') else str(r.bucket)
        else:
            label = str(int(r.bucket)) if hasattr(r.bucket, 'year') else str(r.bucket)
        result.append({
            "label": label,
            "sales_return_count": int(r.sales_return_count),
            "sales_return_amount": float(r.sales_return_amount),
            "purchase_return_count": int(r.purchase_return_count),
            "purchase_return_amount": float(r.purchase_return_amount),
        })

    return success_response(result)


@router.get("/returns/impact")
def get_returns_profit_impact(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    current_user: dict = Depends(require_permission("reports.view")),
    db: Session = Depends(get_db)
):
    bid = current_user["business_id"]
    perms = current_user.get("permissions", set())
    if "dashboard.financial" not in perms:
        return success_response(None)

    date_where, dp = _date_col("sr", "return_created_at", date_from, date_to)

    # Sales returns — cost of returned goods
    row = db.execute(text(f"""
        SELECT
            COALESCE(SUM(sr.return_amount), 0) AS sales_return_value,
            COALESCE(SUM(sri.return_qty * sri.original_unit_price), 0) AS sales_return_cost
        FROM sales_returns sr
        LEFT JOIN sales_return_items sri ON sri.return_id = sr.return_id
        WHERE sr.business_id = CAST(:bid AS uuid)
          AND sr.return_status = 'approved'
          {date_where}
    """), {"bid": bid, **dp}).fetchone()

    dp2, pp2 = _date_col("prr", "return_created_at", date_from, date_to)

    row2 = db.execute(text(f"""
        SELECT
            COALESCE(SUM(prr.return_amount), 0) AS purchase_return_value
        FROM purchase_returns prr
        WHERE prr.business_id = CAST(:bid AS uuid)
          AND prr.return_status = 'approved'
          {dp2}
    """), {"bid": bid, **pp2}).fetchone()

    sales_return_value = float(row.sales_return_value) if row else 0
    purchase_return_value = float(row2.purchase_return_value) if row2 else 0

    return success_response({
        "sales_return_value": sales_return_value,
        "purchase_return_value": purchase_return_value,
        "net_return_impact": sales_return_value - purchase_return_value,
    })


# ═══════════════════════════════════════════════════════════════════════════════
# 11. PAYMENT REPORTS
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/payments/collections")
def get_payment_collections(
    period: str = "monthly",
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    current_user: dict = Depends(require_permission("reports.view")),
    db: Session = Depends(get_db)
):
    bid = current_user["business_id"]
    if period not in ("weekly", "monthly", "yearly"):
        period = "monthly"

    utc_now = datetime.now(timezone.utc)
    user_today = utc_now.date()
    date_where, dp = _date_col("pay", "payment_paid_at", date_from, date_to)
    params = {"bid": bid, **dp}

    if period == "weekly":
        user_start = user_today - timedelta(days=6)
        if not date_from:
            params["user_start"] = user_start
            params["user_today"] = user_today
            fill_series = "generate_series(:user_start, :user_today, INTERVAL '1 day') AS gs"
        else:
            fill_series = "generate_series(CAST(:date_from AS date), CAST(:date_to AS date), INTERVAL '1 day') AS gs"
        group_expr = "pay.payment_paid_at::date"
    elif period == "monthly":
        user_start_month = user_today.replace(day=1)
        if user_start_month.month > 5:
            user_start_month = user_start_month.replace(month=user_start_month.month - 5)
        else:
            user_start_month = user_start_month.replace(year=user_start_month.year - 1, month=user_start_month.month + 7)
        user_end_month = user_today.replace(day=1)
        if user_end_month.month == 12:
            user_end_month = user_end_month.replace(year=user_end_month.year + 1, month=1)
        else:
            user_end_month = user_end_month.replace(month=user_end_month.month + 1)
        if not date_from:
            params["user_start"] = user_start_month
            params["user_end"] = user_end_month
            fill_series = "generate_series(:user_start, :user_end, INTERVAL '1 month') AS gs"
        else:
            fill_series = "generate_series(CAST(:date_from AS date), CAST(:date_to AS date), INTERVAL '1 month') AS gs"
        group_expr = "date_trunc('month', pay.payment_paid_at)"
    else:
        user_start_year = user_today.replace(year=user_today.year - 4, month=1, day=1)
        user_end_year = user_today.replace(year=user_today.year + 1, month=1, day=1)
        if not date_from:
            params["user_start"] = user_start_year
            params["user_end"] = user_end_year
            fill_series = "generate_series(:user_start, :user_end, INTERVAL '1 year') AS gs"
        else:
            fill_series = "generate_series(CAST(:date_from AS date), CAST(:date_to AS date), INTERVAL '1 year') AS gs"
        group_expr = "date_trunc('year', pay.payment_paid_at)"

    rows = db.execute(text(f"""
        WITH aggregated AS (
            SELECT
                {group_expr} AS bucket,
                COUNT(pay.payment_id) AS payment_count,
                COALESCE(SUM(pay.payment_amount), 0) AS amount
            FROM payments pay
            WHERE pay.business_id = CAST(:bid AS uuid)
              AND pay.is_active = true
              {date_where}
            GROUP BY bucket
        )
        SELECT
            gs AS bucket,
            COALESCE(a.payment_count, 0) AS payment_count,
            COALESCE(a.amount, 0) AS amount
        FROM {fill_series}
        LEFT JOIN aggregated a ON a.bucket = gs
        ORDER BY gs
    """), params).fetchall()

    result = []
    for r in rows:
        if period == "weekly":
            days = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']
            label = days[r.bucket.weekday()] if hasattr(r.bucket, 'weekday') else str(r.bucket)
        elif period == "monthly":
            month_short = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
            label = month_short[r.bucket.month - 1] if hasattr(r.bucket, 'month') else str(r.bucket)
        else:
            label = str(int(r.bucket)) if hasattr(r.bucket, 'year') else str(r.bucket)
        result.append({"label": label, "payment_count": int(r.payment_count), "amount": float(r.amount)})

    return success_response(result)


@router.get("/payments/outstanding")
def get_outstanding_receivables(
    current_user: dict = Depends(require_permission("reports.view")),
    db: Session = Depends(get_db)
):
    bid = current_user["business_id"]

    rows = db.execute(text("""
        SELECT
            s.sales_id, s.invoice_no, c.cust_name,
            s.sales_final_amount, s.sales_payment_status,
            COALESCE(pay.cumulative_paid, 0) AS total_paid,
            (s.sales_final_amount - COALESCE(pay.cumulative_paid, 0)) AS balance
        FROM sales s
        LEFT JOIN customers c ON c.cust_id = s.customer_id
        LEFT JOIN payments pay ON pay.sale_id = s.sales_id AND pay.is_active = true
        WHERE s.business_id = CAST(:bid AS uuid)
          AND s.is_deleted = false
          AND s.sales_payment_status IN ('pending', 'partial')
        ORDER BY balance DESC
    """), {"bid": bid}).fetchall()

    total_outstanding = 0
    data = []
    for r in rows:
        balance = float(r.balance) if r.balance else 0
        total_outstanding += balance
        data.append({
            "sales_id": str(r.sales_id),
            "invoice_no": r.invoice_no,
            "cust_name": r.cust_name,
            "invoice_total": float(r.sales_final_amount),
            "total_paid": float(r.total_paid),
            "balance": balance,
            "payment_status": r.sales_payment_status,
        })

    return success_response({
        "total_outstanding": total_outstanding,
        "total_invoices": len(data),
        "invoices": data,
    })


@router.get("/payments/by-method")
def get_payments_by_method(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    current_user: dict = Depends(require_permission("reports.view")),
    db: Session = Depends(get_db)
):
    bid = current_user["business_id"]
    date_where, dp = _date_col("pay", "payment_paid_at", date_from, date_to)

    rows = db.execute(text(f"""
        SELECT
            COALESCE(NULLIF(pay.payment_method, ''), 'unknown') AS method,
            COUNT(pay.payment_id) AS payment_count,
            COALESCE(SUM(pay.payment_amount), 0) AS total_amount
        FROM payments pay
        WHERE pay.business_id = CAST(:bid AS uuid)
          AND pay.is_active = true
          {date_where}
        GROUP BY pay.payment_method
        ORDER BY total_amount DESC
    """), {"bid": bid, **dp}).fetchall()

    total = sum(float(r.total_amount) for r in rows)

    return success_response([
        {
            "method": r.method,
            "payment_count": int(r.payment_count),
            "total_amount": float(r.total_amount),
            "percentage": round(float(r.total_amount) / total * 100, 2) if total > 0 else 0,
        }
        for r in rows
    ])


@router.get("/payments/partial")
def get_partial_payments(
    current_user: dict = Depends(require_permission("reports.view")),
    db: Session = Depends(get_db)
):
    bid = current_user["business_id"]

    rows = db.execute(text("""
        SELECT
            s.sales_id, s.invoice_no, c.cust_name,
            s.sales_final_amount, s.sales_payment_status,
            pay.payment_id, pay.payment_amount AS last_payment_amount,
            pay.payment_method, pay.cumulative_paid,
            pay.payment_paid_at,
            (s.sales_final_amount - pay.cumulative_paid) AS remaining
        FROM payments pay
        JOIN sales s ON s.sales_id = pay.sale_id
        LEFT JOIN customers c ON c.cust_id = s.customer_id
        WHERE pay.business_id = CAST(:bid AS uuid)
          AND pay.is_active = true
          AND s.sales_payment_status = 'partial'
          AND s.is_deleted = false
        ORDER BY pay.payment_paid_at DESC
    """), {"bid": bid}).fetchall()

    return success_response([
        {
            "sales_id": str(r.sales_id),
            "invoice_no": r.invoice_no,
            "cust_name": r.cust_name,
            "invoice_total": float(r.sales_final_amount),
            "cumulative_paid": float(r.cumulative_paid),
            "remaining": float(r.remaining),
            "last_payment_amount": float(r.last_payment_amount),
            "last_payment_method": r.payment_method,
            "last_payment_date": str(r.payment_paid_at) if r.payment_paid_at else None,
        }
        for r in rows
    ])


# ═══════════════════════════════════════════════════════════════════════════════
# 12. AUDIT REPORTS (Admin Only)
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/audit/user-activities")
def get_user_activities(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    user_id: Optional[str] = Query(None),
    current_user: dict = Depends(require_permission("reports.view")),
    db: Session = Depends(get_db)
):
    bid = current_user["business_id"]
    perms = current_user.get("permissions", set())
    if "staff.manage" not in perms:
        return success_response([])

    date_where, dp = _date_col("al", "created_at", date_from, date_to)
    params = {"bid": bid, **dp}

    user_filter = ""
    if user_id:
        user_filter = " AND al.user_id = CAST(:user_id AS uuid)"
        params["user_id"] = user_id

    rows = db.execute(text(f"""
        SELECT
            al.audit_id, al.user_id, al.action_type,
            al.table_name, al.record_id,
            al.old_data, al.new_data, al.created_at,
            COALESCE(p.full_name, 'System') AS user_name
        FROM audit_logs al
        LEFT JOIN profiles p ON p.id = al.user_id
        WHERE al.business_id = CAST(:bid AS uuid)
          {date_where}
          {user_filter}
        ORDER BY al.created_at DESC
        LIMIT 500
    """), params).fetchall()

    return success_response([
        {
            "audit_id": str(r.audit_id),
            "user_id": str(r.user_id) if r.user_id else None,
            "user_name": r.user_name,
            "action_type": r.action_type,
            "table_name": r.table_name,
            "record_id": str(r.record_id) if r.record_id else None,
            "old_data": r.old_data,
            "new_data": r.new_data,
            "created_at": str(r.created_at),
        }
        for r in rows
    ])


@router.get("/audit/login-activities")
def get_login_activities(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    current_user: dict = Depends(require_permission("reports.view")),
    db: Session = Depends(get_db)
):
    bid = current_user["business_id"]
    perms = current_user.get("permissions", set())
    if "staff.manage" not in perms:
        return success_response([])

    date_where, dp = _date_col("al", "created_at", date_from, date_to)

    rows = db.execute(text(f"""
        SELECT
            al.audit_id, al.user_id, al.created_at,
            COALESCE(p.full_name, 'System') AS user_name
        FROM audit_logs al
        LEFT JOIN profiles p ON p.id = al.user_id
        WHERE al.business_id = CAST(:bid AS uuid)
          AND al.action_type = 'login'
          {date_where}
        ORDER BY al.created_at DESC
        LIMIT 200
    """), {"bid": bid, **dp}).fetchall()

    return success_response([
        {
            "audit_id": str(r.audit_id),
            "user_id": str(r.user_id) if r.user_id else None,
            "user_name": r.user_name,
            "login_at": str(r.created_at),
        }
        for r in rows
    ])


@router.get("/audit/data-changes")
def get_data_changes(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    table_name: Optional[str] = Query(None),
    current_user: dict = Depends(require_permission("reports.view")),
    db: Session = Depends(get_db)
):
    bid = current_user["business_id"]
    perms = current_user.get("permissions", set())
    if "staff.manage" not in perms:
        return success_response([])

    date_where, dp = _date_col("al", "created_at", date_from, date_to)
    params = {"bid": bid, **dp}

    table_filter = ""
    if table_name:
        table_filter = " AND al.table_name = :table_name"
        params["table_name"] = table_name

    rows = db.execute(text(f"""
        SELECT
            al.audit_id, al.user_id, al.action_type,
            al.table_name, al.record_id, al.old_data, al.new_data,
            al.created_at, COALESCE(p.full_name, 'System') AS user_name
        FROM audit_logs al
        LEFT JOIN profiles p ON p.id = al.user_id
        WHERE al.business_id = CAST(:bid AS uuid)
          AND al.action_type IN ('insert', 'update', 'delete')
          {date_where}
          {table_filter}
        ORDER BY al.created_at DESC
        LIMIT 500
    """), params).fetchall()

    return success_response([
        {
            "audit_id": str(r.audit_id),
            "user_id": str(r.user_id) if r.user_id else None,
            "user_name": r.user_name,
            "action_type": r.action_type,
            "table_name": r.table_name,
            "record_id": str(r.record_id) if r.record_id else None,
            "old_data": r.old_data,
            "new_data": r.new_data,
            "created_at": str(r.created_at),
        }
        for r in rows
    ])


@router.get("/audit/exports")
def get_export_activities(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    current_user: dict = Depends(require_permission("reports.view")),
    db: Session = Depends(get_db)
):
    bid = current_user["business_id"]
    perms = current_user.get("permissions", set())
    if "staff.manage" not in perms:
        return success_response([])

    date_where, dp = _date_col("al", "created_at", date_from, date_to)

    rows = db.execute(text(f"""
        SELECT
            al.audit_id, al.user_id, al.table_name,
            al.old_data, al.new_data, al.created_at,
            COALESCE(p.full_name, 'System') AS user_name
        FROM audit_logs al
        LEFT JOIN profiles p ON p.id = al.user_id
        WHERE al.business_id = CAST(:bid AS uuid)
          AND al.action_type = 'export'
          {date_where}
        ORDER BY al.created_at DESC
        LIMIT 200
    """), {"bid": bid, **dp}).fetchall()

    return success_response([
        {
            "audit_id": str(r.audit_id),
            "user_id": str(r.user_id) if r.user_id else None,
            "user_name": r.user_name,
            "table_name": r.table_name,
            "filters": r.old_data,
            "exported_at": str(r.created_at),
        }
        for r in rows
    ])
