# app/routers/dashboard.py
#
# PURPOSE: Dedicated dashboard summary endpoint.
#
# WHY A SEPARATE ENDPOINT?
#   The old approach called /sales/?limit=100, /expenses/?limit=100, etc.
#   from the frontend, then summed values in JavaScript. That is WRONG when
#   a business has more than 100 rows — it silently produces partial totals.
#
#   This endpoint runs aggregations entirely inside PostgreSQL:
#     - SUM, COUNT, GROUP BY run over ALL rows — not just 100
#     - 4 targeted queries instead of 5 full list fetches
#     - Each query returns one number or a small grouped result
#   Result: accurate numbers, faster load, fewer round-trips.
#
# ENDPOINTS:
#   GET /dashboard/summary  → KPI cards (revenue, expenses, counts, alerts)
#   GET /dashboard/trend    → Invoice counts grouped by period for the trend chart
#
# PERMISSIONS:
#   dashboard.view      → required for all dashboard routes
#   dashboard.financial → gates revenue + expense figures (admin/manager only)
#                         if user lacks it, those fields return null


from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
from app.database import get_db
from app.middleware.rbac import require_permission, get_current_user_with_permissions
from app.utils.response import success_response, error_response
from datetime import datetime, timedelta, timezone

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


# ══════════════════════════════════════════════════════════════════
# GET /dashboard/summary
# ══════════════════════════════════════════════════════════════════
#
# Returns all KPI card values in one response.
#
# HOW IT WORKS:
#   We run 4 SQL queries inside one DB session. Each query uses aggregate
#   functions (COUNT, SUM, FILTER) that work over the ENTIRE table —
#   not just a page of 100 rows.
#
#   Query 1 — Sales aggregates:
#     - total_invoices     = COUNT of all non-deleted sales
#     - total_revenue      = SUM of sales_final_amount across ALL sales
#     - pending_payments   = COUNT of all outstanding invoices ('pending' + 'partial')
#     - partial_count      = COUNT of invoices where some payment was made
#     - pending_count      = COUNT of invoices with zero payments (bill created, not paid yet)
#   Query 2 — Expenses aggregate:
#     - total_expenses     = SUM of expense_amount across ALL non-deleted expenses
#
#   Query 3 — Customer + Product counts:
#     - total_customers    = COUNT of non-deleted customers
#     - total_products     = COUNT of non-deleted products
#
#   Query 4 — Low stock alerts:
#     - low_stock_alerts   = COUNT of unread alerts
#
# PERMISSION GATE:
#   revenue + expenses are returned as null if user lacks dashboard.financial.
#   The frontend checks and shows/hides those stat cards accordingly.

@router.get("/summary")
def get_dashboard_summary(
    current_user: dict = Depends(require_permission("dashboard.view")),
    db: Session = Depends(get_db)
):
    business_id = current_user["business_id"]
    permissions = current_user.get("permissions", set())
    can_see_financials = "dashboard.financial" in permissions

    # Single merged query — sales aggregates + customer/product counts
    # + alert count + expenses total — all in one DB round-trip.
    main_row = db.execute(
        text("""
            SELECT
                COUNT(*)                                                              AS total_invoices,
                COALESCE(SUM(sales_final_amount), 0)                                  AS total_revenue,
                COUNT(*) FILTER (WHERE sales_payment_status IN ('pending','partial')) AS pending_payments,
                COUNT(*) FILTER (WHERE sales_payment_status = 'partial')              AS partial_count,
                COUNT(*) FILTER (WHERE sales_payment_status = 'pending')              AS pending_count,
                COUNT(*) FILTER (WHERE sales_payment_status = 'paid')                 AS paid_count,
                (SELECT COUNT(*) FROM customers
                  WHERE business_id = CAST(:bid AS uuid) AND is_deleted = false)      AS total_customers,
                (SELECT COUNT(*) FROM products
                  WHERE business_id = CAST(:bid AS uuid) AND is_deleted = false)      AS total_products,
                (SELECT COUNT(DISTINCT la.product_id) FROM low_stock_alerts la
                  JOIN products p ON p.prod_id = la.product_id
                  WHERE la.business_id = CAST(:bid AS uuid)
                    AND la.alert_status = 'unread'
                    AND p.is_deleted   = false
                    AND p.prod_stock_qty <= p.prod_low_stock_alert)                   AS low_stock_alerts,
                (SELECT COALESCE(SUM(expense_amount), 0) FROM expenses
                  WHERE business_id = CAST(:bid AS uuid) AND is_deleted = false)      AS total_expenses
            FROM sales
            WHERE business_id = CAST(:bid AS uuid)
              AND is_deleted   = false
        """),
        {"bid": business_id}
    ).fetchone()

    return success_response({
        "total_invoices":   int(main_row.total_invoices)   if main_row else 0,
        "pending_payments": int(main_row.pending_payments) if main_row else 0,
        "partial_count":    int(main_row.partial_count)    if main_row else 0,
        "pending_count":    int(main_row.pending_count)    if main_row else 0,
        "paid_count":       int(main_row.paid_count)       if main_row else 0,
        "total_customers":  int(main_row.total_customers)  if main_row else 0,
        "total_products":   int(main_row.total_products)   if main_row else 0,
        "low_stock_alerts": int(main_row.low_stock_alerts) if main_row else 0,

        "total_revenue":  float(main_row.total_revenue)  if (main_row and can_see_financials) else None,
        "total_expenses": float(main_row.total_expenses) if (main_row and can_see_financials) else None,
    })

# ══════════════════════════════════════════════════════════════════
# GET /dashboard/trend?period=weekly|monthly|yearly
# ══════════════════════════════════════════════════════════════════
#
# Returns invoice counts grouped by time period for the trend chart.
#
# HOW IT WORKS:
#   PostgreSQL's date_trunc() groups timestamps by 'day', 'month', or 'year'.
#   We ask the DB to count invoices per time bucket over ALL sales (no limit).
#   The DB returns only the rows with actual data — we fill in zeros for
#   missing buckets in Python.
#
#   weekly  → last 7 days, grouped by day,   returns 7 data points
#   monthly → last 6 months, grouped by month, returns 6 data points
#   yearly  → last 5 years, grouped by year, returns 5 data points
#
# WHY THIS IS BETTER THAN THE OLD JS APPROACH:
#   Old: fetch /sales/?limit=100, loop in JS, miss any sale older than
#        the 100-item window.
#   New: DB groups and counts across ALL rows in one query. No limit.
#        A business with 5,000 invoices still gets accurate counts.

@router.get("/trend")
def get_dashboard_trend(
    period: str = "weekly",
    tz_offset_minutes: int = Query(default=0, ge=-840, le=840, description="Client timezone offset in minutes. Valid range: -840 to +840 (UTC-14 to UTC+14)"),
    current_user: dict = Depends(require_permission("dashboard.view")),
    db: Session = Depends(get_db)
):
    business_id = current_user["business_id"]

    if period not in ("weekly", "monthly", "yearly"):
        return error_response("period must be weekly, monthly, or yearly", 400)

    # Compute user-local date boundaries
    utc_now = datetime.now(timezone.utc)
    user_now = utc_now - timedelta(minutes=tz_offset_minutes)
    user_today = user_now.date()
    loc_offset = -tz_offset_minutes  # minutes to add to UTC to get user local time

    if period == "weekly":
        user_start = user_today - timedelta(days=6)
        date_from = datetime.combine(user_start, datetime.min.time()) + timedelta(minutes=tz_offset_minutes)
        date_to = datetime.combine(user_today + timedelta(days=1), datetime.min.time()) + timedelta(minutes=tz_offset_minutes)

        rows = db.execute(
            text("""
                WITH daily AS (
                    SELECT
                        (s.sales_created_at + (:loc_offset * INTERVAL '1 minute'))::date AS bucket,
                        COUNT(s.sales_id) AS invoice_count
                    FROM sales s
                    WHERE s.business_id = CAST(:bid AS uuid)
                      AND s.is_deleted  = false
                      AND s.sales_created_at >= CAST(:date_from AS timestamp)
                      AND s.sales_created_at <  CAST(:date_to   AS timestamp)
                    GROUP BY (s.sales_created_at + (:loc_offset * INTERVAL '1 minute'))::date
                )
                SELECT
                    gs                                  AS bucket,
                    COALESCE(d.invoice_count, 0)        AS invoice_count
                FROM generate_series(:user_start, :user_today, INTERVAL '1 day') AS gs
                LEFT JOIN daily d ON d.bucket = gs
                ORDER BY gs
            """),
            {
                "bid": business_id,
                "date_from": date_from,
                "date_to": date_to,
                "loc_offset": loc_offset,
                "user_start": user_start,
                "user_today": user_today,
            }
        ).fetchall()

        days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
        result = [
            {
                "label": days[row.bucket.weekday()],
                "value": int(row.invoice_count)
            }
            for row in rows
        ]

    elif period == "monthly":
        user_today_month = user_today.replace(day=1)
        if user_today_month.month > 5:
            user_start_month = user_today_month.replace(month=user_today_month.month - 5)
        else:
            user_start_month = user_today_month.replace(year=user_today_month.year - 1, month=user_today_month.month + 7)

        if user_today_month.month == 12:
            user_end_month = user_today_month.replace(year=user_today_month.year + 1, month=1)
        else:
            user_end_month = user_today_month.replace(month=user_today_month.month + 1)

        date_from = datetime.combine(user_start_month, datetime.min.time()) + timedelta(minutes=tz_offset_minutes)
        date_to = datetime.combine(user_end_month, datetime.min.time()) + timedelta(minutes=tz_offset_minutes)

        rows = db.execute(
            text("""
                WITH monthly AS (
                    SELECT
                        date_trunc('month', s.sales_created_at + (:loc_offset * INTERVAL '1 minute')) AS bucket,
                        COUNT(s.sales_id) AS invoice_count
                    FROM sales s
                    WHERE s.business_id = CAST(:bid AS uuid)
                      AND s.is_deleted  = false
                      AND s.sales_created_at >= CAST(:date_from AS timestamp)
                      AND s.sales_created_at <  CAST(:date_to   AS timestamp)
                    GROUP BY date_trunc('month', s.sales_created_at + (:loc_offset * INTERVAL '1 minute'))
                )
                SELECT
                    gs                                  AS bucket,
                    COALESCE(m.invoice_count, 0)        AS invoice_count
                FROM generate_series(:user_start, :user_end, INTERVAL '1 month') AS gs
                LEFT JOIN monthly m ON m.bucket = gs
                ORDER BY gs
            """),
            {
                "bid": business_id,
                "date_from": date_from,
                "date_to": date_to,
                "loc_offset": loc_offset,
                "user_start": user_start_month,
                "user_end": user_today_month,
            }
        ).fetchall()

        month_short = ['Jan','Feb','Mar','Apr','May','Jun',
                       'Jul','Aug','Sep','Oct','Nov','Dec']
        result = [
            {
                "label": month_short[row.bucket.month - 1],
                "value": int(row.invoice_count)
            }
            for row in rows
        ]

    else:  # yearly
        user_start_year = user_today.replace(year=user_today.year - 4, month=1, day=1)
        user_end_year = user_today.replace(year=user_today.year + 1, month=1, day=1)

        date_from = datetime.combine(user_start_year, datetime.min.time()) + timedelta(minutes=tz_offset_minutes)
        date_to = datetime.combine(user_end_year, datetime.min.time()) + timedelta(minutes=tz_offset_minutes)

        rows = db.execute(
            text("""
                WITH yearly AS (
                    SELECT
                        date_trunc('year', s.sales_created_at + (:loc_offset * INTERVAL '1 minute')) AS bucket,
                        COUNT(s.sales_id) AS invoice_count
                    FROM sales s
                    WHERE s.business_id = CAST(:bid AS uuid)
                      AND s.is_deleted  = false
                      AND s.sales_created_at >= CAST(:date_from AS timestamp)
                      AND s.sales_created_at <  CAST(:date_to   AS timestamp)
                    GROUP BY date_trunc('year', s.sales_created_at + (:loc_offset * INTERVAL '1 minute'))
                )
                SELECT
                    gs                                  AS bucket,
                    COALESCE(y.invoice_count, 0)        AS invoice_count
                FROM generate_series(:user_start, :user_end, INTERVAL '1 year') AS gs
                LEFT JOIN yearly y ON y.bucket = gs
                ORDER BY gs
            """),
            {
                "bid": business_id,
                "date_from": date_from,
                "date_to": date_to,
                "loc_offset": loc_offset,
                "user_start": user_start_year,
                "user_end": user_end_year,
            }
        ).fetchall()

        result = [
            {
                "label": str(row.bucket.year),
                "value": int(row.invoice_count)
            }
            for row in rows
        ]

    return success_response(result)