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

# ── ASYNC MIGRATION NOTE (2026-07) ──────────────────────────────────────────
#
# This router was migrated from sync SQLAlchemy (psycopg2) to async
# (asyncpg).  Key patterns:
#
#   - Session → AsyncSession (get_async_db dependency)
#   - db.execute(...) → await db.execute(...)
#   - require_permission_with_rls → require_permission (auth middleware
#     sets GUCs via set_config in verify_token)
#   - No db.commit() in read-only report endpoints (GUCs not needed)
#   - mv_refresh: refresh_dashboard_mvs → refresh_dashboard_mvs_async
#   - The variable assigned from await db.execute(...) must be reused for
#     .fetchone()/.fetchall() — never reference a stale name (e.g. "result").

from fastapi import APIRouter, Depends, Query
from typing import Optional, Dict, Any, List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
import re
from app.database import get_async_db
from app.middleware.rbac import require_permission
from app.utils.timestamp import fmt_ts
from app.utils.response import success_response, error_response
from app.utils.pagination import paginate_async, pagination_response
from app.utils.mv_refresh import refresh_dashboard_mvs, refresh_dashboard_mvs_async
from app.utils.subscription_features import check_feature_access
from datetime import datetime, timedelta, timezone

router = APIRouter(prefix="/v1/reports", tags=["Reports"])


# ─── Helpers ───────────────────────────────────────────────────────────────────

def _date_range_params(date_from: Optional[str], date_to: Optional[str]):
    """Build date filter SQL snippet + params dict.
    Both caller and helper return dict so we merge with {**base, **date_params}.
    """
    clause = ""
    params = {}
    if date_from:
        clause += " AND s.sales_created_at >= CAST(:date_from AS timestamp)"
        params["date_from"] = datetime.fromisoformat(date_from.replace("Z", ""))
    if date_to:
        clause += " AND s.sales_created_at <= CAST(:date_to AS timestamp)"
        params["date_to"] = datetime.fromisoformat(date_to.replace("Z", ""))
    return clause, params


def _date_col(table_alias: str, col: str, date_from: Optional[str], date_to: Optional[str]):
    """Generic date filter for any table + column.
    Returns (where_clause, params_dict)."""
    clause = ""
    params = {}
    if date_from:
        clause += f" AND {table_alias}.{col} >= CAST(:date_from AS timestamp)"
        params["date_from"] = datetime.fromisoformat(date_from.replace("Z", ""))
    if date_to:
        clause += f" AND {table_alias}.{col} <= CAST(:date_to AS timestamp)"
        params["date_to"] = datetime.fromisoformat(date_to.replace("Z", ""))
    return clause, params


async def _get_sales_returned_tax(
    db: AsyncSession, bid: str,
    date_from: Optional[str], date_to: Optional[str],
) -> Dict[str, float]:
    """Sum tax on approved sales returns within date range.

    Derives per-item tax by joining sales_return_items → sale_items via
    the sale_item_id FK, then prorating by return_qty / original qty.
    Returns {returned_tax, returned_cgst, returned_sgst, returned_igst}.
    """
    dw, dp = _date_col("sr", "return_created_at", date_from, date_to)
    row = (await db.execute(text(f"""
        SELECT
            COALESCE(SUM(
                sri.return_qty * (si.tax_amount / NULLIF(si.sale_item_quantity, 0))
            ), 0) AS returned_tax,
            COALESCE(SUM(
                sri.return_qty * (si.cgst_amount / NULLIF(si.sale_item_quantity, 0))
            ), 0) AS returned_cgst,
            COALESCE(SUM(
                sri.return_qty * (si.sgst_amount / NULLIF(si.sale_item_quantity, 0))
            ), 0) AS returned_sgst,
            COALESCE(SUM(
                sri.return_qty * (si.igst_amount / NULLIF(si.sale_item_quantity, 0))
            ), 0) AS returned_igst
        FROM sales_return_items sri
        JOIN sales_returns sr ON sr.return_id = sri.return_id
        JOIN sale_items si ON si.sale_item_id = sri.sale_item_id
        WHERE sr.business_id = CAST(:bid AS uuid)
          AND sr.return_status = 'approved'
          {dw}
    """), {"bid": bid, **dp})).fetchone()
    return {
        "returned_tax":  float(row.returned_tax),
        "returned_cgst": float(row.returned_cgst),
        "returned_sgst": float(row.returned_sgst),
        "returned_igst": float(row.returned_igst),
    }


async def _get_purchase_returned_tax(
    db: AsyncSession, bid: str,
    date_from: Optional[str], date_to: Optional[str],
) -> Dict[str, float]:
    """Sum prorated tax on approved purchase returns within date range.

    Purchase-level proration: pur_tax_total * (return_amount / pur_final_amount).
    This is an approximation because purchase_return_items lacks a purchase_item_id FK
    and stores no tax amount — line-level precision would require a schema change.
    Returns {returned_tax, returned_cgst, returned_sgst, returned_igst}.
    """
    dw, dp = _date_col("prr", "return_created_at", date_from, date_to)
    row = (await db.execute(text(f"""
        SELECT
            COALESCE(SUM(
                pr2.pur_tax_total * (prr.return_amount / NULLIF(pr2.pur_final_amount, 0))
            ), 0) AS returned_tax,
            COALESCE(SUM(
                pr2.pur_cgst_total * (prr.return_amount / NULLIF(pr2.pur_final_amount, 0))
            ), 0) AS returned_cgst,
            COALESCE(SUM(
                pr2.pur_sgst_total * (prr.return_amount / NULLIF(pr2.pur_final_amount, 0))
            ), 0) AS returned_sgst,
            COALESCE(SUM(
                pr2.pur_igst_total * (prr.return_amount / NULLIF(pr2.pur_final_amount, 0))
            ), 0) AS returned_igst
        FROM purchase_returns prr
        JOIN purchases pr2 ON pr2.pur_id = prr.pur_id
        WHERE prr.business_id = CAST(:bid AS uuid)
          AND prr.return_status = 'approved'
          {dw}
    """), {"bid": bid, **dp})).fetchone()
    return {
        "returned_tax":  float(row.returned_tax),
        "returned_cgst": float(row.returned_cgst),
        "returned_sgst": float(row.returned_sgst),
        "returned_igst": float(row.returned_igst),
    }


# ── Audit log FK name resolution ─────────────────────────────────────────────
# Maps FK column names to (referenced_table, referenced_pk, name_column).
# Used by _resolve_audit_names to replace raw UUIDs in old_data/new_data
# with human-readable names before sending to the frontend.

FK_MAP: Dict[str, tuple] = {
    "product_id":    ("products",   "prod_id",      "prod_name"),
    "customer_id":   ("customers",  "cust_id",      "cust_name"),
    "category_id":   ("categories", "category_id",  "category_name"),
    "supp_id":       ("suppliers",  "supp_id",      "supp_name"),
    "business_id":   ("businesses", "business_id",  "business_name"),
    "sale_id":       ("sales",      "sales_id",     "invoice_no"),
    "pur_id":        ("purchases",  "pur_id",       "pur_id"),
    "created_by":    ("profiles",   "id",           "full_name"),
    "updated_by":    ("profiles",   "id",           "full_name"),
    "user_id":       ("profiles",   "id",           "full_name"),
}

_UUID_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
    re.IGNORECASE,
)


def _is_uuid(val: Any) -> bool:
    return isinstance(val, str) and bool(_UUID_RE.match(val))


async def _resolve_audit_names(
    db: AsyncSession,
    records: List[Dict[str, Any]],
) -> Dict[str, str]:
    """Batch-resolve FK UUIDs in audit old_data/new_data to human-readable names.

    Returns a flat lookup dict: { "products:<uuid>": "Widget", ... }.
    The caller spreads this into old_data/new_data values.
    """
    # Collect (fk_column, uuid) pairs from all records
    to_resolve: Dict[str, set] = {col: set() for col in FK_MAP}

    for rec in records:
        for data_key in ("old_data", "new_data"):
            data = rec.get(data_key) or {}
            if not isinstance(data, dict):
                continue
            for col in FK_MAP:
                val = data.get(col)
                if _is_uuid(val):
                    to_resolve[col].add(val)

    # Deduplicate by referenced table: table → {uuid: set of cols}
    table_ids: Dict[str, Dict[str, set]] = {}
    for col, uuids in to_resolve.items():
        if not uuids:
            continue
        ref_table, _, _ = FK_MAP[col]
        if ref_table not in table_ids:
            table_ids[ref_table] = {}
        for uid in uuids:
            table_ids[ref_table].setdefault(uid, set()).add(col)

    # Batch-query each referenced table once
    lookup: Dict[str, str] = {}
    for ref_table, id_cols in table_ids.items():
        all_ids = list(id_cols.keys())
        if not all_ids:
            continue

        # Determine which name column to use — all columns referencing the
        # same table share the same name column (e.g. profiles → full_name).
        sample_col = next(iter(next(iter(id_cols.values()))))
        _, ref_pk, name_col = FK_MAP[sample_col]

        # Build parameterised placeholders ($1, $2, ...)
        placeholders = ", ".join(f":id_{i}" for i in range(len(all_ids)))
        params = {f"id_{i}": uid for i, uid in enumerate(all_ids)}

        rows = await db.execute(
            text(
                f"SELECT {ref_pk}, {name_col} FROM {ref_table} "
                f"WHERE {ref_pk} IN ({placeholders})"
            ),
            params,
        )
        for row in rows.fetchall():
            lookup[f"{ref_table}:{row[0]}"] = row[1]

    return lookup


def _enrich_data(
    data: Any,
    lookup: Dict[str, str],
) -> Any:
    """Walk a dict/list structure and replace FK UUIDs with {id, name} objects."""
    if isinstance(data, dict):
        result = {}
        for key, val in data.items():
            if key in FK_MAP and _is_uuid(val):
                ref_table, _, _ = FK_MAP[key]
                resolved_name = lookup.get(f"{ref_table}:{val}")
                if resolved_name:
                    result[key] = {"id": val, "name": resolved_name}
                else:
                    result[key] = val
            elif isinstance(val, (dict, list)):
                result[key] = _enrich_data(val, lookup)
            else:
                result[key] = val
        return result
    elif isinstance(data, list):
        return [_enrich_data(item, lookup) for item in data]
    return data


# ═══════════════════════════════════════════════════════════════════════════════
# 1. DASHBOARD SUMMARY
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/summary")
async def get_report_summary(
    date_from: Optional[str] = Query(None, description="ISO date — sales/purchases/expenses from"),
    date_to:   Optional[str] = Query(None, description="ISO date — sales/purchases/expenses to"),
    current_user: dict = Depends(require_permission("reports.view")),
    db: AsyncSession = Depends(get_async_db)
):
    bid = current_user["business_id"]
    fin_access = check_feature_access(current_user, "financial_reports")
    can_financial = fin_access["allowed"]
    financial_locked_reason = fin_access["locked_reason"]

    date_where_s, dp_s = _date_col("s", "sales_created_at", date_from, date_to)
    date_where_e, dp_e = _date_col("e", "expense_date", date_from, date_to)
    date_where_p, dp_p = _date_col("pr", "pur_created_at", date_from, date_to)

    params = {"bid": bid, **dp_s, **dp_e, **dp_p}

    # Use materialized view when no date range filter for instant reads
    use_mv = not date_from and not date_to

    if use_mv:
        row = await db.execute(text("""
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
        """), {"bid": bid})
        row = row.fetchone()

    # Fallback to live query if MV empty (brand-new business) or date range provided
    if not use_mv or row is None:
        row = await db.execute(text(f"""
            SELECT
                COALESCE((SELECT SUM(sales_final_amount) FROM sales s
                           WHERE s.business_id = CAST(:bid AS uuid) AND s.is_deleted = false {date_where_s}), 0) AS total_sales,
                COALESCE((SELECT SUM(pur_final_amount) FROM purchases pr
                           WHERE pr.business_id = CAST(:bid AS uuid) AND pr.is_deleted = false {date_where_p}), 0) AS total_purchases,
                COALESCE((SELECT SUM(expense_amount) FROM expenses e
                           WHERE e.business_id = CAST(:bid AS uuid) AND e.is_deleted = false
                             AND (e.expense_category IS NULL OR e.expense_category != 'purchase_refund') {date_where_e}), 0) AS total_expenses,
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
                -- FIXED proportional discount formula instead of sale_item_subtotal
                COALESCE((SELECT SUM(si.sale_item_subtotal * (s.sales_final_amount - s.tax_total) / NULLIF(s.sales_total_amount, 0) - (si.sale_item_quantity * COALESCE(si.sale_item_cost_price_at_sale, p.prod_cost_price)))
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
        """), params)
        row = row.fetchone()

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
        "financial_locked_reason": financial_locked_reason,
    })


# ═══════════════════════════════════════════════════════════════════════════════
# 1b. MATERIALIZED VIEW REFRESH (admin only)
# ═══════════════════════════════════════════════════════════════════════════════

@router.post("/refresh")
async def refresh_materialized_views(
    current_user: dict = Depends(require_permission("staff.manage")),
    db: AsyncSession = Depends(get_async_db)
):
    """Refresh all report materialized views concurrently.
    Admin-only — requires staff.manage permission.
    Also called automatically by the dashboard endpoint when views are stale.
    Force refresh is intentionally NOT exposed here: the materialized views
    are global (span all tenants), and any business admin could otherwise
    trigger an expensive full-database refresh at will. The auto-refresh
    on the dashboard endpoint (5-min staleness check) is sufficient.
    """
    await refresh_dashboard_mvs_async(db, force=False)
    return success_response({"message": "Materialized views refreshed"})


# ═══════════════════════════════════════════════════════════════════════════════
# 2. SALES REPORTS
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/sales/trend")
async def get_sales_trend(
    period: str = "monthly",
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    tz_offset_minutes: int = Query(0),
    current_user: dict = Depends(require_permission("reports.view")),
    db: AsyncSession = Depends(get_async_db)
):
    """Revenue over time — daily (weekly), monthly, yearly.
    Uses generate_series for zero-fill, returns revenue + invoice count."""
    bid = current_user["business_id"]
    can_financial = check_feature_access(current_user, "financial_reports")["allowed"]

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

    use_mv_trend = (
        period == "monthly"
        and tz_offset_minutes == 0
        and not date_from
        and not date_to
    )

    if use_mv_trend:
        rows = await db.execute(text("""
            SELECT
                gs AS bucket,
                COALESCE(m.invoice_count, 0) AS invoice_count,
                COALESCE(m.revenue, 0) AS revenue
            FROM generate_series(:user_start, :user_end, INTERVAL '1 month') AS gs
            LEFT JOIN mv_sales_trend_monthly m
              ON m.business_id = CAST(:bid AS uuid) AND m.year_month = gs
            ORDER BY gs
        """), {"bid": bid, "user_start": user_start_month, "user_end": user_end_month})
        rows = rows.fetchall()
    else:
        rows = await db.execute(text(f"""
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
        """), params)
        rows = rows.fetchall()

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
            "revenue": float(r.revenue) if can_financial else None,
        })

    return success_response(result)


@router.get("/sales/by-customer")
async def get_sales_by_customer(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    current_user: dict = Depends(require_permission("reports.view")),
    db: AsyncSession = Depends(get_async_db)
):
    bid = current_user["business_id"]
    can_financial = check_feature_access(current_user, "financial_reports")["allowed"]
    date_where, dp = _date_col("s", "sales_created_at", date_from, date_to)

    rows = await db.execute(text(f"""
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
        LIMIT 100
    """), {"bid": bid, **dp})
    rows = rows.fetchall()

    return success_response([
        {
            "cust_id": str(r.cust_id),
            "cust_name": r.cust_name,
            "invoice_count": int(r.invoice_count),
            "total_amount": float(r.total_amount) if can_financial else None,
            "paid_amount": float(r.paid_amount) if can_financial else None,
            "outstanding_amount": float(r.outstanding_amount) if can_financial else None,
        }
        for r in rows
    ])


@router.get("/sales/by-product")
async def get_sales_by_product(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    current_user: dict = Depends(require_permission("reports.view")),
    db: AsyncSession = Depends(get_async_db)
):
    bid = current_user["business_id"]
    can_financial = check_feature_access(current_user, "financial_reports")["allowed"]
    show_profit = check_feature_access(current_user, "product_profit_view")["allowed"]
    date_where, dp = _date_col("s", "sales_created_at", date_from, date_to)

    # FIXED proportional discount formula instead of sale_item_subtotal
    profit_col = ", COALESCE(SUM(si.sale_item_subtotal * (s.sales_final_amount - s.tax_total) / NULLIF(s.sales_total_amount, 0) - (si.sale_item_quantity * COALESCE(si.sale_item_cost_price_at_sale, p.prod_cost_price))), 0) AS profit" if show_profit else ""

    rows = await db.execute(text(f"""
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
        LIMIT 100
    """), {"bid": bid, **dp})
    rows = rows.fetchall()

    result = []
    for r in rows:
        item = {
            "prod_id": str(r.prod_id),
            "prod_name": r.prod_name,
            "category_name": r.category_name,
            "total_qty_sold": int(r.total_qty_sold),
            "total_revenue": float(r.total_revenue) if can_financial else None,
        }
        if show_profit:
            item["profit"] = float(r.profit) if can_financial else None
        result.append(item)

    return success_response(result)


@router.get("/sales/by-category")
async def get_sales_by_category(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    current_user: dict = Depends(require_permission("reports.view")),
    db: AsyncSession = Depends(get_async_db)
):
    bid = current_user["business_id"]
    can_financial = check_feature_access(current_user, "financial_reports")["allowed"]
    date_where, dp = _date_col("s", "sales_created_at", date_from, date_to)

    rows = await db.execute(text(f"""
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
    """), {"bid": bid, **dp})
    rows = rows.fetchall()

    return success_response([
        {
            "category_id": str(r.category_id) if r.category_id else None,
            "category_name": r.category_name or "Uncategorized",
            "invoice_count": int(r.invoice_count),
            "total_qty_sold": int(r.total_qty_sold),
            "total_revenue": float(r.total_revenue) if can_financial else None,
        }
        for r in rows
    ])


@router.get("/sales/by-payment-method")
async def get_sales_by_payment_method(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    current_user: dict = Depends(require_permission("reports.view")),
    db: AsyncSession = Depends(get_async_db)
):
    bid = current_user["business_id"]
    can_financial = check_feature_access(current_user, "financial_reports")["allowed"]
    date_where, dp = _date_col("s", "sales_created_at", date_from, date_to)

    rows = await db.execute(text(f"""
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
    """), {"bid": bid, **dp})
    rows = rows.fetchall()

    return success_response([
        {
            "payment_method": r.payment_method or "unknown",
            "invoice_count": int(r.invoice_count),
            "total_amount": float(r.total_amount) if can_financial else None,
        }
        for r in rows
    ])


@router.get("/sales/invoice-status")
async def get_sales_invoice_status(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    current_user: dict = Depends(require_permission("reports.view")),
    db: AsyncSession = Depends(get_async_db)
):
    bid = current_user["business_id"]
    can_financial = check_feature_access(current_user, "financial_reports")["allowed"]
    date_where, dp = _date_col("s", "sales_created_at", date_from, date_to)

    row = await db.execute(text(f"""
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
    """), {"bid": bid, **dp})
    row = row.fetchone()

    return success_response({
        "total": int(row.total) if row else 0,
        "paid_count": int(row.paid_count) if row else 0,
        "partial_count": int(row.partial_count) if row else 0,
        "pending_count": int(row.pending_count) if row else 0,
        "paid_amount": float(row.paid_amount) if can_financial else None,
        "partial_amount": float(row.partial_amount) if can_financial else None,
        "pending_amount": float(row.pending_amount) if can_financial else None,
    })


# ═══════════════════════════════════════════════════════════════════════════════
# 3. PURCHASE REPORTS
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/purchases/summary")
async def get_purchase_summary(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    current_user: dict = Depends(require_permission("reports.view")),
    db: AsyncSession = Depends(get_async_db)
):
    bid = current_user["business_id"]
    can_financial = check_feature_access(current_user, "financial_reports")["allowed"]
    date_where, dp = _date_col("pr", "pur_created_at", date_from, date_to)

    row = await db.execute(text(f"""
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
    """), {"bid": bid, **dp})
    row = row.fetchone()

    return success_response({
        "total_purchases": int(row.total_purchases) if row else 0,
        "total_amount": float(row.total_amount) if can_financial else None,
        "total_discount": float(row.total_discount) if can_financial else None,
        "total_tax": float(row.total_tax) if can_financial else None,
        "total_cgst": float(row.total_cgst) if can_financial else None,
        "total_sgst": float(row.total_sgst) if can_financial else None,
        "total_igst": float(row.total_igst) if can_financial else None,
        "paid_count": int(row.paid_count) if row else 0,
        "pending_count": int(row.pending_count) if row else 0,
    })


@router.get("/purchases/trend")
async def get_purchase_trend(
    period: str = "monthly",
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    tz_offset_minutes: int = Query(0),
    current_user: dict = Depends(require_permission("reports.view")),
    db: AsyncSession = Depends(get_async_db)
):
    bid = current_user["business_id"]
    can_financial = check_feature_access(current_user, "financial_reports")["allowed"]
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

    rows = await db.execute(text(f"""
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
    """), params)
    rows = rows.fetchall()

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
        result.append({"label": label, "purchase_count": int(r.purchase_count), "amount": float(r.amount) if can_financial else None})

    return success_response(result)


@router.get("/purchases/by-supplier")
async def get_purchases_by_supplier(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    current_user: dict = Depends(require_permission("reports.view")),
    db: AsyncSession = Depends(get_async_db)
):
    bid = current_user["business_id"]
    can_financial = check_feature_access(current_user, "financial_reports")["allowed"]
    date_where, dp = _date_col("pr", "pur_created_at", date_from, date_to)

    rows = await db.execute(text(f"""
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
    """), {"bid": bid, **dp})
    rows = rows.fetchall()

    return success_response([
        {
            "supp_id": str(r.supp_id),
            "supp_name": r.supp_name,
            "purchase_count": int(r.purchase_count),
            "total_amount": float(r.total_amount) if can_financial else None,
            "total_discount": float(r.total_discount),
        }
        for r in rows
    ])


@router.get("/purchases/by-product")
async def get_purchases_by_product(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    current_user: dict = Depends(require_permission("reports.view")),
    db: AsyncSession = Depends(get_async_db)
):
    bid = current_user["business_id"]
    can_financial = check_feature_access(current_user, "financial_reports")["allowed"]
    date_where, dp = _date_col("pr", "pur_created_at", date_from, date_to)

    rows = await db.execute(text(f"""
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
    """), {"bid": bid, **dp})
    rows = rows.fetchall()

    return success_response([
        {
            "prod_id": str(r.prod_id),
            "prod_name": r.prod_name,
            "total_qty_purchased": int(r.total_qty_purchased),
            "total_amount": float(r.total_amount) if can_financial else None,
        }
        for r in rows
    ])


@router.get("/purchases/tax-summary")
async def get_purchase_tax_summary(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    current_user: dict = Depends(require_permission("reports.view")),
    db: AsyncSession = Depends(get_async_db)
):
    bid = current_user["business_id"]
    can_financial = check_feature_access(current_user, "financial_reports")["allowed"]
    date_where, dp = _date_col("pr", "pur_created_at", date_from, date_to)

    row = await db.execute(text(f"""
        SELECT
            COALESCE(SUM(pur_tax_total), 0) AS total_tax,
            COALESCE(SUM(pur_cgst_total), 0) AS total_cgst,
            COALESCE(SUM(pur_sgst_total), 0) AS total_sgst,
            COALESCE(SUM(pur_igst_total), 0) AS total_igst
        FROM purchases pr
        WHERE pr.business_id = CAST(:bid AS uuid)
          AND pr.is_deleted = false
          {date_where}
    """), {"bid": bid, **dp})
    row = row.fetchone()

    return success_response({
        "total_tax": float(row.total_tax) if can_financial else None,
        "total_cgst": float(row.total_cgst) if can_financial else None,
        "total_sgst": float(row.total_sgst) if can_financial else None,
        "total_igst": float(row.total_igst) if can_financial else None,
    })


# ═══════════════════════════════════════════════════════════════════════════════
# 4. PROFITABILITY REPORTS
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/profit/gross")
async def get_gross_profit(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    current_user: dict = Depends(require_permission("reports.view")),
    db: AsyncSession = Depends(get_async_db)
):
    bid = current_user["business_id"]
    fin_access = check_feature_access(current_user, "financial_reports")
    if not fin_access["allowed"]:
        return success_response({
            "total_revenue": None, "total_cost": None,
            "gross_profit": None, "margin_pct": None,
            "financial_locked_reason": fin_access["locked_reason"],
        })
    date_where, dp = _date_col("s", "sales_created_at", date_from, date_to)

    # FIXED proportional discount formula instead of sale_item_subtotal
    row = await db.execute(text(f"""
        SELECT
            COALESCE(SUM(si.sale_item_subtotal * (s.sales_final_amount - s.tax_total) / NULLIF(s.sales_total_amount, 0)), 0) AS total_revenue,
            COALESCE(SUM(si.sale_item_quantity * COALESCE(si.sale_item_cost_price_at_sale, p.prod_cost_price)), 0) AS total_cost
        FROM sale_items si
        JOIN sales s ON s.sales_id = si.sale_id
        JOIN products p ON p.prod_id = si.product_id
        WHERE s.business_id = CAST(:bid AS uuid)
          AND s.is_deleted = false
          {date_where}
    """), {"bid": bid, **dp})
    row = row.fetchone()

    revenue = float(row.total_revenue) if row else 0
    cost = float(row.total_cost) if row else 0
    profit = revenue - cost
    margin = (profit / revenue * 100) if revenue > 0 else 0

    return success_response({
        "total_revenue": revenue,
        "total_cost": cost,
        "gross_profit": profit,
        "margin_pct": round(margin, 2),
        "financial_locked_reason": None,
    })


@router.get("/profit/by-product")
async def get_profit_by_product(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    current_user: dict = Depends(require_permission("reports.view")),
    db: AsyncSession = Depends(get_async_db)
):
    bid = current_user["business_id"]
    show_profit = (
        check_feature_access(current_user, "product_profit_view")["allowed"]
        and check_feature_access(current_user, "financial_reports")["allowed"]
    )
    date_where, dp = _date_col("s", "sales_created_at", date_from, date_to)

    # FIXED proportional discount formula instead of sale_item_subtotal
    rows = await db.execute(text(f"""
        SELECT
            p.prod_id,
            p.prod_name,
            COALESCE(SUM(si.sale_item_subtotal * (s.sales_final_amount - s.tax_total) / NULLIF(s.sales_total_amount, 0)), 0) AS revenue,
            COALESCE(SUM(si.sale_item_quantity * COALESCE(si.sale_item_cost_price_at_sale, p.prod_cost_price)), 0) AS cost,
            SUM(si.sale_item_quantity) AS qty_sold
        FROM sale_items si
        JOIN sales s ON s.sales_id = si.sale_id
        JOIN products p ON p.prod_id = si.product_id
        WHERE s.business_id = CAST(:bid AS uuid)
          AND s.is_deleted = false
          {date_where}
        GROUP BY p.prod_id, p.prod_name
        ORDER BY revenue DESC
    """), {"bid": bid, **dp})
    rows = rows.fetchall()

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
async def get_profit_by_category(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    current_user: dict = Depends(require_permission("reports.view")),
    db: AsyncSession = Depends(get_async_db)
):
    bid = current_user["business_id"]
    show_financial = check_feature_access(current_user, "financial_reports")["allowed"]
    date_where, dp = _date_col("s", "sales_created_at", date_from, date_to)

    # FIXED proportional discount formula instead of sale_item_subtotal
    rows = await db.execute(text(f"""
        SELECT
            c.category_id,
            COALESCE(c.category_name, 'Uncategorized') AS category_name,
            COALESCE(SUM(si.sale_item_subtotal * (s.sales_final_amount - s.tax_total) / NULLIF(s.sales_total_amount, 0)), 0) AS revenue,
            COALESCE(SUM(si.sale_item_quantity * COALESCE(si.sale_item_cost_price_at_sale, p.prod_cost_price)), 0) AS cost
        FROM sale_items si
        JOIN sales s ON s.sales_id = si.sale_id
        JOIN products p ON p.prod_id = si.product_id
        LEFT JOIN categories c ON c.category_id = p.category_id
        WHERE s.business_id = CAST(:bid AS uuid)
          AND s.is_deleted = false
          {date_where}
        GROUP BY c.category_id, c.category_name
        ORDER BY revenue DESC
    """), {"bid": bid, **dp})
    rows = rows.fetchall()

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
async def get_profit_by_customer(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    current_user: dict = Depends(require_permission("reports.view")),
    db: AsyncSession = Depends(get_async_db)
):
    bid = current_user["business_id"]
    show_financial = check_feature_access(current_user, "financial_reports")["allowed"]
    date_where, dp = _date_col("s", "sales_created_at", date_from, date_to)

    # FIXED proportional discount formula instead of sale_item_subtotal
    rows = await db.execute(text(f"""
        SELECT
            c.cust_id,
            c.cust_name,
            COUNT(DISTINCT s.sales_id) AS invoice_count,
            COALESCE(SUM(si.sale_item_subtotal * (s.sales_final_amount - s.tax_total) / NULLIF(s.sales_total_amount, 0)), 0) AS revenue,
            COALESCE(SUM(si.sale_item_quantity * COALESCE(si.sale_item_cost_price_at_sale, p.prod_cost_price)), 0) AS cost
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
    """), {"bid": bid, **dp})
    rows = rows.fetchall()

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
async def get_profit_trend(
    period: str = "monthly",
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    tz_offset_minutes: int = Query(0),
    current_user: dict = Depends(require_permission("reports.view")),
    db: AsyncSession = Depends(get_async_db)
):
    bid = current_user["business_id"]
    if not check_feature_access(current_user, "financial_reports")["allowed"]:
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

    # FIXED proportional discount formula instead of sale_item_subtotal
    rows = await db.execute(text(f"""
        WITH aggregated AS (
            SELECT
                {group_expr} AS bucket,
                COALESCE(SUM(si.sale_item_subtotal * (s.sales_final_amount - s.tax_total) / NULLIF(s.sales_total_amount, 0)), 0) AS revenue,
                COALESCE(SUM(si.sale_item_quantity * COALESCE(si.sale_item_cost_price_at_sale, p.prod_cost_price)), 0) AS cost
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
    """), params)
    rows = rows.fetchall()

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
async def get_inventory_valuation(
    current_user: dict = Depends(require_permission("reports.view")),
    db: AsyncSession = Depends(get_async_db)
):
    bid = current_user["business_id"]
    show_profit = check_feature_access(current_user, "product_profit_view")["allowed"]

    rows = await db.execute(text("""
        SELECT
            p.prod_id,
            p.prod_name,
            c.category_name,
            p.prod_stock_qty,
            p.prod_cost_price,
            p.prod_sell_price,
            p.updated_at,
            (p.prod_stock_qty * p.prod_cost_price) AS stock_value
        FROM products p
        LEFT JOIN categories c ON c.category_id = p.category_id
        WHERE p.business_id = CAST(:bid AS uuid)
          AND p.is_deleted = false
        ORDER BY stock_value DESC
    """), {"bid": bid})
    rows = rows.fetchall()

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
            "updated_at": fmt_ts(r.updated_at),
        })

    return success_response({
        "total_value": total_value if show_profit else None,
        "total_products": len(result),
        "total_stock_qty": sum(r["stock_qty"] for r in result),
        "products": result,
    })


@router.get("/inventory/movement-summary")
async def get_inventory_movement_summary(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    current_user: dict = Depends(require_permission("reports.view")),
    db: AsyncSession = Depends(get_async_db)
):
    bid = current_user["business_id"]
    date_where, dp = _date_col("sm", "move_created_at", date_from, date_to)

    rows = await db.execute(text(f"""
        SELECT
            sm.move_type,
            COUNT(*) AS movement_count,
            SUM(sm.move_qty) AS net_qty
        FROM stock_movements sm
        WHERE sm.business_id = CAST(:bid AS uuid)
          {date_where}
        GROUP BY sm.move_type
        ORDER BY movement_count DESC
    """), {"bid": bid, **dp})
    rows = rows.fetchall()

    return success_response([
        {
            "move_type": r.move_type,
            "movement_count": int(r.movement_count),
            "net_qty": int(r.net_qty) if r.net_qty else 0,
        }
        for r in rows
    ])


@router.get("/inventory/stock-flow")
async def get_stock_flow(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    current_user: dict = Depends(require_permission("reports.view")),
    db: AsyncSession = Depends(get_async_db)
):
    bid = current_user["business_id"]
    date_where, dp = _date_col("sm", "move_created_at", date_from, date_to)

    row = await db.execute(text(f"""
        SELECT
            COALESCE(SUM(sm.move_qty) FILTER (WHERE sm.move_qty > 0), 0) AS stock_in,
            COALESCE(SUM(ABS(sm.move_qty)) FILTER (WHERE sm.move_qty < 0), 0) AS stock_out
        FROM stock_movements sm
        WHERE sm.business_id = CAST(:bid AS uuid)
          {date_where}
    """), {"bid": bid, **dp})
    row = row.fetchone()

    return success_response({
        "stock_in": int(row.stock_in) if row else 0,
        "stock_out": int(row.stock_out) if row else 0,
        "net_flow": int(row.stock_in - row.stock_out) if row else 0,
    })


@router.get("/inventory/moving-products")
async def get_moving_products(
    period: str = "monthly",
    current_user: dict = Depends(require_permission("reports.view")),
    db: AsyncSession = Depends(get_async_db)
):
    bid = current_user["business_id"]
    days = {"weekly": 7, "monthly": 30, "quarterly": 90, "yearly": 365}
    lookback = days.get(period, 30)

    # Fast-moving: most sale qty in period
    # Intentionally fixed LIMIT 20 — dashboard widget, not a bug.
    fast = await db.execute(text("""
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
    """), {"bid": bid, "days": lookback})
    fast = fast.fetchall()

    # Slow-moving: products with low sale qty relative to stock
    # Intentionally fixed LIMIT 20 — dashboard widget, not a bug.
    slow = await db.execute(text("""
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
    """), {"bid": bid, "days": lookback})
    slow = slow.fetchall()

    # Dead stock: no movement at all
    # Intentionally fixed LIMIT 20 — dashboard widget, not a bug.
    dead = await db.execute(text("""
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
    """), {"bid": bid, "days": lookback})
    dead = dead.fetchall()

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
async def get_top_customers(
    limit: int = Query(10, ge=1, le=100),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    current_user: dict = Depends(require_permission("reports.view")),
    db: AsyncSession = Depends(get_async_db)
):
    bid = current_user["business_id"]
    can_financial = check_feature_access(current_user, "financial_reports")["allowed"]
    date_where, dp = _date_col("s", "sales_created_at", date_from, date_to)

    rows = await db.execute(text(f"""
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
    """), {"bid": bid, "limit": limit, **dp})
    rows = rows.fetchall()

    return success_response([
        {
            "cust_id": str(r.cust_id),
            "cust_name": r.cust_name,
            "cust_phone": r.cust_phone,
            "invoice_count": int(r.invoice_count),
            "total_spent": float(r.total_spent) if can_financial else None,
            "recent_invoices": int(r.recent_invoices),
            "avg_invoice_value": round(float(r.total_spent) / int(r.invoice_count), 2) if can_financial and int(r.invoice_count) > 0 else None,
        }
        for r in rows
    ])


@router.get("/customers/{cust_id}/history")
async def get_customer_purchase_history(
    cust_id: str,
    current_user: dict = Depends(require_permission("reports.view")),
    db: AsyncSession = Depends(get_async_db),
    pagination: dict = Depends(paginate_async),
):
    bid = current_user["business_id"]
    can_financial = check_feature_access(current_user, "financial_reports")["allowed"]

    # Customer summary
    cust_row = await db.execute(text("""
        SELECT
            c.cust_name, c.cust_phone, c.cust_email,
            c.cust_address, c.cust_state
        FROM customers c
        WHERE c.cust_id = CAST(:cust_id AS uuid)
          AND c.business_id = CAST(:bid AS uuid)
          AND c.is_deleted = false
    """), {"cust_id": cust_id, "bid": bid})
    cust_row = cust_row.fetchone()

    if not cust_row:
        return success_response(None)

    # Sales history (paginated)
    sales_total = (await db.execute(text("""
        SELECT COUNT(*) AS cnt
        FROM sales s
        WHERE s.customer_id = CAST(:cust_id AS uuid)
          AND s.business_id = CAST(:bid AS uuid)
          AND s.is_deleted = false
    """), {"cust_id": cust_id, "bid": bid})).fetchone().cnt

    sales = await db.execute(text("""
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
        LIMIT :limit OFFSET :offset
    """), {"cust_id": cust_id, "bid": bid,
            "limit": pagination["limit"], "offset": pagination["offset"]})
    sales = sales.fetchall()

    # Payment history (paginated)
    payments_total = (await db.execute(text("""
        SELECT COUNT(*) AS cnt
        FROM payments pay
        JOIN sales s ON s.sales_id = pay.sale_id
        WHERE s.customer_id = CAST(:cust_id AS uuid)
          AND pay.business_id = CAST(:bid AS uuid)
          AND pay.is_active = true
    """), {"cust_id": cust_id, "bid": bid})).fetchone().cnt

    payments = await db.execute(text("""
        SELECT
            pay.payment_id, pay.payment_amount, pay.payment_method,
            pay.payment_status, pay.payment_paid_at, s.invoice_no
        FROM payments pay
        JOIN sales s ON s.sales_id = pay.sale_id
        WHERE s.customer_id = CAST(:cust_id AS uuid)
          AND pay.business_id = CAST(:bid AS uuid)
          AND pay.is_active = true
        ORDER BY pay.payment_paid_at DESC
        LIMIT :limit OFFSET :offset
    """), {"cust_id": cust_id, "bid": bid,
            "limit": pagination["limit"], "offset": pagination["offset"]})
    payments = payments.fetchall()

    totals = await db.execute(text("""
        SELECT
            COUNT(*) AS total_invoices,
            COALESCE(SUM(sales_final_amount), 0) AS total_amount,
            COALESCE(SUM(sales_final_amount) FILTER (WHERE sales_payment_status = 'paid'), 0) AS paid_amount,
            MAX(sales_created_at) AS last_purchase_date
        FROM sales
        WHERE customer_id = CAST(:cust_id AS uuid)
          AND business_id = CAST(:bid AS uuid)
          AND is_deleted = false
    """), {"cust_id": cust_id, "bid": bid})
    totals = totals.fetchone()

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
            "total_amount": float(totals.total_amount) if (totals and can_financial) else None,
            "paid_amount": float(totals.paid_amount) if (totals and can_financial) else None,
            "outstanding": float(totals.total_amount - totals.paid_amount) if (totals and can_financial) else None,
            "last_purchase_date": str(totals.last_purchase_date) if (totals and totals.last_purchase_date) else None,
        },
        "sales_history": pagination_response(
            [{
                "sales_id": str(r.sales_id),
                "invoice_no": r.invoice_no,
                "amount": float(r.sales_final_amount) if can_financial else None,
                "discount": float(r.sales_discount),
                "tax": float(r.tax_total),
                "payment_status": r.sales_payment_status,
                "payment_method": r.sales_payment_method,
                "created_at": str(r.sales_created_at),
            } for r in sales],
            sales_total, pagination["page"], pagination["limit"],
            capped=pagination["_capped"],
        ),
        "payment_history": pagination_response(
            [{
                "payment_id": str(r.payment_id),
                "invoice_no": r.invoice_no,
                "amount": float(r.payment_amount) if can_financial else None,
                "method": r.payment_method,
                "status": r.payment_status,
                "paid_at": str(r.payment_paid_at),
            } for r in payments],
            payments_total, pagination["page"], pagination["limit"],
            capped=pagination["_capped"],
        ),
    })


@router.get("/customers/lifetime-value")
async def get_customer_lifetime_value(
    current_user: dict = Depends(require_permission("reports.view")),
    db: AsyncSession = Depends(get_async_db),
    pagination: dict = Depends(paginate_async),
):
    bid = current_user["business_id"]
    can_financial = check_feature_access(current_user, "financial_reports")["allowed"]

    total = (await db.execute(text("""
        SELECT COUNT(*) AS cnt
        FROM customers c
        JOIN sales s ON s.customer_id = c.cust_id
        WHERE c.business_id = CAST(:bid AS uuid)
          AND c.is_deleted = false
          AND s.is_deleted = false
        GROUP BY c.cust_id
        HAVING COUNT(DISTINCT s.sales_id) >= 2
    """), {"bid": bid})).fetchone().cnt

    rows = await db.execute(text("""
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
        LIMIT :limit OFFSET :offset
    """), {"bid": bid, "limit": pagination["limit"], "offset": pagination["offset"]})
    rows = rows.fetchall()

    result = []
    for r in rows:
        total_spent = float(r.total_spent) if can_financial else None
        count = int(r.invoice_count)
        avg_value = round(float(r.total_spent) / count, 2) if can_financial and count > 0 else None
        result.append({
            "cust_id": str(r.cust_id),
            "cust_name": r.cust_name,
            "cust_phone": r.cust_phone,
            "invoice_count": count,
            "total_spent": total_spent,
            "avg_invoice_value": avg_value,
            "first_purchase": str(r.first_purchase) if r.first_purchase else None,
            "last_purchase": str(r.last_purchase) if r.last_purchase else None,
        })

    return success_response(pagination_response(
        result, total, pagination["page"], pagination["limit"],
        capped=pagination["_capped"],
    ))


@router.get("/customers/outstanding")
async def get_customer_outstanding(
    current_user: dict = Depends(require_permission("reports.view")),
    db: AsyncSession = Depends(get_async_db),
    pagination: dict = Depends(paginate_async),
):
    bid = current_user["business_id"]
    can_financial = check_feature_access(current_user, "financial_reports")["allowed"]

    total = (await db.execute(text("""
        SELECT COUNT(*) AS cnt
        FROM (
            SELECT c.cust_id
            FROM sales s
            JOIN customers c ON c.cust_id = s.customer_id
            LEFT JOIN payments pay ON pay.sale_id = s.sales_id AND pay.is_active = true
            WHERE s.business_id = CAST(:bid AS uuid)
              AND s.is_deleted = false
              AND c.is_deleted = false
              AND s.sales_payment_status IN ('pending', 'partial')
            GROUP BY c.cust_id
        ) sub
    """), {"bid": bid})).fetchone().cnt

    rows = await db.execute(text("""
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
        LIMIT :limit OFFSET :offset
    """), {"bid": bid, "limit": pagination["limit"], "offset": pagination["offset"]})
    rows = rows.fetchall()

    return success_response(pagination_response(
        [{
            "cust_id": str(r.cust_id),
            "cust_name": r.cust_name,
            "cust_phone": r.cust_phone,
            "unpaid_invoices": int(r.unpaid_invoices) if can_financial else None,
            "total_outstanding": float(r.total_outstanding) if can_financial else None,
        }
        for r in rows
    ], total, pagination["page"], pagination["limit"], capped=pagination["_capped"]))


# ═══════════════════════════════════════════════════════════════════════════════
# 7. SUPPLIER REPORTS
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/suppliers/top")
async def get_top_suppliers(
    limit: int = Query(10, ge=1, le=100),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    current_user: dict = Depends(require_permission("reports.view")),
    db: AsyncSession = Depends(get_async_db)
):
    bid = current_user["business_id"]
    can_financial = check_feature_access(current_user, "financial_reports")["allowed"]
    date_where, dp = _date_col("pr", "pur_created_at", date_from, date_to)

    rows = await db.execute(text(f"""
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
    """), {"bid": bid, "limit": limit, **dp})
    rows = rows.fetchall()

    return success_response([
        {
            "supp_id": str(r.supp_id),
            "supp_name": r.supp_name,
            "supp_phone": r.supp_phone,
            "purchase_count": int(r.purchase_count),
            "total_spend": float(r.total_spend) if can_financial else None,
            "avg_purchase_value": round(float(r.total_spend) / int(r.purchase_count), 2) if can_financial and int(r.purchase_count) > 0 else None,
        }
        for r in rows
    ])


@router.get("/suppliers/{supp_id}/history")
async def get_supplier_purchase_history(
    supp_id: str,
    current_user: dict = Depends(require_permission("reports.view")),
    db: AsyncSession = Depends(get_async_db),
    pagination: dict = Depends(paginate_async),
):
    bid = current_user["business_id"]
    can_financial = check_feature_access(current_user, "financial_reports")["allowed"]

    supp_row = await db.execute(text("""
        SELECT supp_name, supp_phone, supp_email FROM suppliers
        WHERE supp_id = CAST(:supp_id AS uuid) AND business_id = CAST(:bid AS uuid) AND is_deleted = false
    """), {"supp_id": supp_id, "bid": bid})
    supp_row = supp_row.fetchone()

    if not supp_row:
        return success_response(None)

    purchases_total = (await db.execute(text("""
        SELECT COUNT(*) AS cnt
        FROM purchases pr
        WHERE pr.supp_id = CAST(:supp_id AS uuid)
          AND pr.business_id = CAST(:bid AS uuid)
          AND pr.is_deleted = false
    """), {"supp_id": supp_id, "bid": bid})).fetchone().cnt

    purchases = await db.execute(text("""
        SELECT
            pr.pur_id, pr.pur_final_amount, pr.pur_discount,
            pr.pur_tax_total, pr.pur_payment_status, pr.pur_created_at
        FROM purchases pr
        WHERE pr.supp_id = CAST(:supp_id AS uuid)
          AND pr.business_id = CAST(:bid AS uuid)
          AND pr.is_deleted = false
        ORDER BY pr.pur_created_at DESC
        LIMIT :limit OFFSET :offset
    """), {"supp_id": supp_id, "bid": bid,
            "limit": pagination["limit"], "offset": pagination["offset"]})
    purchases = purchases.fetchall()

    totals = await db.execute(text("""
        SELECT
            COUNT(*) AS total_purchases,
            COALESCE(SUM(pur_final_amount), 0) AS total_amount,
            MIN(pur_created_at) AS first_purchase,
            MAX(pur_created_at) AS last_purchase
        FROM purchases
        WHERE supp_id = CAST(:supp_id AS uuid)
          AND business_id = CAST(:bid AS uuid)
          AND is_deleted = false
    """), {"supp_id": supp_id, "bid": bid})
    totals = totals.fetchone()

    return success_response({
        "supplier": {
            "supp_name": supp_row.supp_name,
            "supp_phone": supp_row.supp_phone,
            "supp_email": supp_row.supp_email,
        },
        "summary": {
            "total_purchases": int(totals.total_purchases) if totals else 0,
            "total_amount": float(totals.total_amount) if (totals and can_financial) else None,
            "first_purchase": str(totals.first_purchase) if (totals and totals.first_purchase) else None,
            "last_purchase": str(totals.last_purchase) if (totals and totals.last_purchase) else None,
        },
        "purchases": pagination_response(
            [{
                "pur_id": str(r.pur_id),
                "amount": float(r.pur_final_amount) if can_financial else None,
                "discount": float(r.pur_discount),
                "tax": float(r.pur_tax_total),
                "payment_status": r.pur_payment_status,
                "created_at": str(r.pur_created_at),
            } for r in purchases],
            purchases_total, pagination["page"], pagination["limit"],
            capped=pagination["_capped"],
        ),
    })


@router.get("/suppliers/spend-analysis")
async def get_supplier_spend_analysis(
    current_user: dict = Depends(require_permission("reports.view")),
    db: AsyncSession = Depends(get_async_db),
    pagination: dict = Depends(paginate_async),
):
    bid = current_user["business_id"]
    can_financial = check_feature_access(current_user, "financial_reports")["allowed"]

    total = (await db.execute(text("""
        SELECT COUNT(*) AS cnt
        FROM suppliers sp
        WHERE sp.business_id = CAST(:bid AS uuid)
          AND sp.is_deleted = false
    """), {"bid": bid})).fetchone().cnt

    rows = await db.execute(text("""
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
        LIMIT :limit OFFSET :offset
    """), {"bid": bid, "limit": pagination["limit"], "offset": pagination["offset"]})
    rows = rows.fetchall()

    return success_response(pagination_response(
        [{
            "supp_id": str(r.supp_id),
            "supp_name": r.supp_name,
            "total_purchases": int(r.total_purchases),
            "total_spend": float(r.total_spend) if can_financial else None,
            "avg_spend": float(r.avg_spend) if can_financial else None,
            "max_purchase": float(r.max_purchase) if can_financial and r.max_purchase else None,
            "first_purchase": str(r.first_purchase) if r.first_purchase else None,
            "last_purchase": str(r.last_purchase) if r.last_purchase else None,
        }
        for r in rows
    ], total, pagination["page"], pagination["limit"], capped=pagination["_capped"]))


# ═══════════════════════════════════════════════════════════════════════════════
# 8. EXPENSE REPORTS
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/expenses/by-category")
async def get_expenses_by_category(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    current_user: dict = Depends(require_permission("reports.view")),
    db: AsyncSession = Depends(get_async_db)
):
    bid = current_user["business_id"]
    can_financial = check_feature_access(current_user, "financial_reports")["allowed"]
    date_where, dp = _date_col("e", "expense_date", date_from, date_to)

    rows = await db.execute(text(f"""
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
    """), {"bid": bid, **dp})
    rows = rows.fetchall()

    return success_response([
        {
            "category": r.category,
            "expense_count": int(r.expense_count),
            "total_amount": float(r.total_amount) if can_financial else None,
        }
        for r in rows
    ])


@router.get("/expenses/trend")
async def get_expense_trend(
    period: str = "monthly",
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    current_user: dict = Depends(require_permission("reports.view")),
    db: AsyncSession = Depends(get_async_db)
):
    bid = current_user["business_id"]
    can_financial = check_feature_access(current_user, "financial_reports")["allowed"]
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

    rows = await db.execute(text(f"""
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
    """), params)
    rows = rows.fetchall()

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
        result.append({"label": label, "amount": float(r.amount) if can_financial else None, "expense_count": int(r.expense_count)})

    return success_response(result)


@router.get("/expenses/distribution")
async def get_expense_distribution(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    current_user: dict = Depends(require_permission("reports.view")),
    db: AsyncSession = Depends(get_async_db)
):
    bid = current_user["business_id"]
    can_financial = check_feature_access(current_user, "financial_reports")["allowed"]
    date_where, dp = _date_col("e", "expense_date", date_from, date_to)

    row = await db.execute(text(f"""
        SELECT
            COALESCE(SUM(e.expense_amount), 0) AS total_expenses,
            COUNT(*) AS total_count
        FROM expenses e
        WHERE e.business_id = CAST(:bid AS uuid)
          AND e.is_deleted = false
          {date_where}
    """), {"bid": bid, **dp})
    row = row.fetchone()

    rows = await db.execute(text(f"""
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
    """), {"bid": bid, **dp})
    rows = rows.fetchall()

    total = float(row.total_expenses) if row and can_financial else 0

    return success_response({
        "total_expenses": float(row.total_expenses) if can_financial else None,
        "total_count": int(row.total_count) if row else 0,
        "categories": [
            {
                "category": r.category,
                "amount": float(r.amount) if can_financial else None,
                "count": int(r.count),
                "percentage": round(float(r.amount) / total * 100, 2) if can_financial and total > 0 else 0 if can_financial else None,
            }
            for r in rows
        ],
    })


# ═══════════════════════════════════════════════════════════════════════════════
# 9. TAX REPORTS
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/tax/collected")
async def get_tax_collected(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    current_user: dict = Depends(require_permission("reports.view")),
    db: AsyncSession = Depends(get_async_db)
):
    bid = current_user["business_id"]
    can_financial = check_feature_access(current_user, "financial_reports")["allowed"]
    date_where, dp = _date_col("s", "sales_created_at", date_from, date_to)

    row = await db.execute(text(f"""
        SELECT
            COALESCE(SUM(s.tax_total), 0) AS total_tax,
            COALESCE(SUM(s.cgst_total), 0) AS total_cgst,
            COALESCE(SUM(s.sgst_total), 0) AS total_sgst,
            COALESCE(SUM(s.igst_total), 0) AS total_igst
        FROM sales s
        WHERE s.business_id = CAST(:bid AS uuid)
          AND s.is_deleted = false
          {date_where}
    """), {"bid": bid, **dp})
    row = row.fetchone()

    gross_tax  = float(row.total_tax) if row else 0
    gross_cgst = float(row.total_cgst) if row else 0
    gross_sgst = float(row.total_sgst) if row else 0
    gross_igst = float(row.total_igst) if row else 0

    ret = await _get_sales_returned_tax(db, bid, date_from, date_to)

    return success_response({
        "total_tax":  gross_tax  - ret["returned_tax"]  if can_financial else None,
        "total_cgst": gross_cgst - ret["returned_cgst"] if can_financial else None,
        "total_sgst": gross_sgst - ret["returned_sgst"] if can_financial else None,
        "total_igst": gross_igst - ret["returned_igst"] if can_financial else None,
    })


@router.get("/tax/paid")
async def get_tax_paid(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    current_user: dict = Depends(require_permission("reports.view")),
    db: AsyncSession = Depends(get_async_db)
):
    bid = current_user["business_id"]
    can_financial = check_feature_access(current_user, "financial_reports")["allowed"]
    date_where, dp = _date_col("pr", "pur_created_at", date_from, date_to)

    row = await db.execute(text(f"""
        SELECT
            COALESCE(SUM(pr.pur_tax_total), 0) AS total_tax,
            COALESCE(SUM(pr.pur_cgst_total), 0) AS total_cgst,
            COALESCE(SUM(pr.pur_sgst_total), 0) AS total_sgst,
            COALESCE(SUM(pr.pur_igst_total), 0) AS total_igst
        FROM purchases pr
        WHERE pr.business_id = CAST(:bid AS uuid)
          AND pr.is_deleted = false
          {date_where}
    """), {"bid": bid, **dp})
    row = row.fetchone()

    gross_tax  = float(row.total_tax) if row else 0
    gross_cgst = float(row.total_cgst) if row else 0
    gross_sgst = float(row.total_sgst) if row else 0
    gross_igst = float(row.total_igst) if row else 0

    ret = await _get_purchase_returned_tax(db, bid, date_from, date_to)

    return success_response({
        "total_tax":  gross_tax  - ret["returned_tax"]  if can_financial else None,
        "total_cgst": gross_cgst - ret["returned_cgst"] if can_financial else None,
        "total_sgst": gross_sgst - ret["returned_sgst"] if can_financial else None,
        "total_igst": gross_igst - ret["returned_igst"] if can_financial else None,
    })


@router.get("/tax/liability")
async def get_tax_liability(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    current_user: dict = Depends(require_permission("reports.view")),
    db: AsyncSession = Depends(get_async_db)
):
    bid = current_user["business_id"]
    if not check_feature_access(current_user, "financial_reports")["allowed"]:
        return success_response({
            "net_tax_liability": None,
            "tax_collected": None,
            "tax_paid": None,
        })

    ds, ps = _date_col("s", "sales_created_at", date_from, date_to)
    dp, pp = _date_col("pr", "pur_created_at", date_from, date_to)

    row = await db.execute(text(f"""
        SELECT
            COALESCE((SELECT SUM(tax_total) FROM sales s
                       WHERE s.business_id = CAST(:bid AS uuid) AND s.is_deleted = false {ds}), 0) AS collected,
            COALESCE((SELECT SUM(pur_tax_total) FROM purchases pr
                       WHERE pr.business_id = CAST(:bid AS uuid) AND pr.is_deleted = false {dp}), 0) AS paid
    """), {"bid": bid, **ps, **pp})
    row = row.fetchone()

    gross_collected = float(row.collected) if row else 0
    gross_paid = float(row.paid) if row else 0

    sales_ret = await _get_sales_returned_tax(db, bid, date_from, date_to)
    purch_ret = await _get_purchase_returned_tax(db, bid, date_from, date_to)

    collected = gross_collected - sales_ret["returned_tax"]
    paid = gross_paid - purch_ret["returned_tax"]

    return success_response({
        "tax_collected": collected,
        "tax_paid": paid,
        "net_tax_liability": collected - paid,
    })


@router.get("/tax/by-rate")
async def get_tax_by_rate(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    current_user: dict = Depends(require_permission("reports.view")),
    db: AsyncSession = Depends(get_async_db)
):
    bid = current_user["business_id"]
    can_financial = check_feature_access(current_user, "financial_reports")["allowed"]
    date_where, dp = _date_col("s", "sales_created_at", date_from, date_to)

    # Sales tax by GST rate
    rows = await db.execute(text(f"""
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
    """), {"bid": bid, **dp})
    rows = rows.fetchall()

    return success_response([
        {
            "gst_rate": float(r.gst_rate) if r.gst_rate else 0,
            "item_count": int(r.item_count),
            "tax_amount": float(r.tax_amount) if can_financial else None,
            "taxable_amount": float(r.taxable_amount) if can_financial else None,
        }
        for r in rows
    ])


@router.get("/tax/purchases/by-rate")
async def get_purchase_tax_by_rate(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    current_user: dict = Depends(require_permission("reports.view")),
    db: AsyncSession = Depends(get_async_db)
):
    bid = current_user["business_id"]
    can_financial = check_feature_access(current_user, "financial_reports")["allowed"]
    date_where, dp = _date_col("pr", "pur_created_at", date_from, date_to)

    rows = await db.execute(text(f"""
        SELECT
            pi.gst_rate,
            COUNT(DISTINCT pi.item_id) AS item_count,
            COALESCE(SUM(pi.item_tax_total), 0) AS tax_amount,
            COALESCE(SUM(pi.item_subtotal), 0) AS taxable_amount
        FROM purchase_items pi
        JOIN purchases pr ON pr.pur_id = pi.pur_id
        WHERE pr.business_id = CAST(:bid AS uuid)
          AND pr.is_deleted = false
          {date_where}
        GROUP BY pi.gst_rate
        ORDER BY pi.gst_rate
    """), {"bid": bid, **dp})
    rows = rows.fetchall()

    return success_response([
        {
            "gst_rate": float(r.gst_rate) if r.gst_rate else 0,
            "item_count": int(r.item_count),
            "tax_amount": float(r.tax_amount) if can_financial else None,
            "taxable_amount": float(r.taxable_amount) if can_financial else None,
        }
        for r in rows
    ])


@router.get("/tax/trend")
async def get_tax_trend(
    period: str = "monthly",
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    current_user: dict = Depends(require_permission("reports.view")),
    db: AsyncSession = Depends(get_async_db)
):
    bid = current_user["business_id"]
    can_financial = check_feature_access(current_user, "financial_reports")["allowed"]
    if period not in ("weekly", "monthly", "yearly"):
        period = "monthly"

    utc_now = datetime.now(timezone.utc)
    user_today = utc_now.date()

    date_where_s, dp_s = _date_col("s", "sales_created_at", date_from, date_to)
    date_where_sr, dp_sr = _date_col("sr", "return_created_at", date_from, date_to)
    date_where_p, dp_p = _date_col("pr", "pur_created_at", date_from, date_to)
    date_where_prr, dp_prr = _date_col("prr", "return_created_at", date_from, date_to)
    params: Dict[str, Any] = {"bid": bid, **dp_s, **dp_sr, **dp_p, **dp_prr}

    if period == "weekly":
        user_start = user_today - timedelta(days=6)
        if not date_from:
            params["user_start"] = user_start
            params["user_today"] = user_today
            fill_series = "generate_series(:user_start, :user_today, INTERVAL '1 day') AS gs"
        else:
            fill_series = "generate_series(CAST(:date_from AS date), CAST(:date_to AS date), INTERVAL '1 day') AS gs"
        group_expr_s = "(s.sales_created_at)::date"
        group_expr_sr = "(sr.return_created_at)::date"
        group_expr_p = "(pr.pur_created_at)::date"
        group_expr_prr = "(prr.return_created_at)::date"
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
        group_expr_s = "date_trunc('month', s.sales_created_at)"
        group_expr_sr = "date_trunc('month', sr.return_created_at)"
        group_expr_p = "date_trunc('month', pr.pur_created_at)"
        group_expr_prr = "date_trunc('month', prr.return_created_at)"
    else:
        user_start_year = user_today.replace(year=user_today.year - 4, month=1, day=1)
        user_end_year = user_today.replace(year=user_today.year + 1, month=1, day=1)
        if not date_from:
            params["user_start"] = user_start_year
            params["user_end"] = user_end_year
            fill_series = "generate_series(:user_start, :user_end, INTERVAL '1 year') AS gs"
        else:
            fill_series = "generate_series(CAST(:date_from AS date), CAST(:date_to AS date), INTERVAL '1 year') AS gs"
        group_expr_s = "date_trunc('year', s.sales_created_at)"
        group_expr_sr = "date_trunc('year', sr.return_created_at)"
        group_expr_p = "date_trunc('year', pr.pur_created_at)"
        group_expr_prr = "date_trunc('year', prr.return_created_at)"

    rows = await db.execute(text(f"""
        WITH sales_agg AS (
            SELECT {group_expr_s} AS bucket,
                   COALESCE(SUM(s.tax_total), 0) AS gst_collected
            FROM sales s
            WHERE s.business_id = CAST(:bid AS uuid)
              AND s.is_deleted = false
              {date_where_s}
            GROUP BY bucket
        ),
        sales_ret_agg AS (
            SELECT {group_expr_sr} AS bucket,
                   COALESCE(SUM(
                       sri.return_qty * (si.tax_amount / NULLIF(si.sale_item_quantity, 0))
                   ), 0) AS returned_tax
            FROM sales_return_items sri
            JOIN sales_returns sr ON sr.return_id = sri.return_id
            JOIN sale_items si ON si.sale_item_id = sri.sale_item_id
            WHERE sr.business_id = CAST(:bid AS uuid)
              AND sr.return_status = 'approved'
              {date_where_sr}
            GROUP BY bucket
        ),
        purchase_agg AS (
            SELECT {group_expr_p} AS bucket,
                   COALESCE(SUM(pr.pur_tax_total), 0) AS gst_paid
            FROM purchases pr
            WHERE pr.business_id = CAST(:bid AS uuid)
              AND pr.is_deleted = false
              {date_where_p}
            GROUP BY bucket
        ),
        purchase_ret_agg AS (
            SELECT {group_expr_prr} AS bucket,
                   COALESCE(SUM(
                       pr2.pur_tax_total * (prr.return_amount / NULLIF(pr2.pur_final_amount, 0))
                   ), 0) AS returned_tax
            FROM purchase_returns prr
            JOIN purchases pr2 ON pr2.pur_id = prr.pur_id
            WHERE prr.business_id = CAST(:bid AS uuid)
              AND prr.return_status = 'approved'
              {date_where_prr}
            GROUP BY bucket
        )
        SELECT
            gs AS bucket,
            COALESCE(sa.gst_collected, 0) - COALESCE(sra.returned_tax, 0) AS gst_collected,
            COALESCE(pa.gst_paid, 0) - COALESCE(pra.returned_tax, 0) AS gst_paid
        FROM {fill_series}
        LEFT JOIN sales_agg sa ON sa.bucket = gs
        LEFT JOIN sales_ret_agg sra ON sra.bucket = gs
        LEFT JOIN purchase_agg pa ON pa.bucket = gs
        LEFT JOIN purchase_ret_agg pra ON pra.bucket = gs
        ORDER BY gs
    """), params)
    rows = rows.fetchall()

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
            "gst_collected": float(r.gst_collected) if can_financial else None,
            "gst_paid": float(r.gst_paid) if can_financial else None,
        })

    return success_response(result)


# ═══════════════════════════════════════════════════════════════════════════════
# 10. RETURN REPORTS
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/returns/sales")
async def get_sales_returns_summary(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    current_user: dict = Depends(require_permission("reports.view")),
    db: AsyncSession = Depends(get_async_db)
):
    bid = current_user["business_id"]
    can_financial = check_feature_access(current_user, "financial_reports")["allowed"]
    date_where, dp = _date_col("sr", "return_created_at", date_from, date_to)

    row = await db.execute(text(f"""
        SELECT
            COUNT(*) AS total_returns,
            COALESCE(SUM(return_amount), 0) AS total_amount,
            COUNT(*) FILTER (WHERE return_status = 'approved') AS approved_count,
            COUNT(*) FILTER (WHERE return_status = 'pending') AS pending_count,
            COUNT(*) FILTER (WHERE return_status = 'rejected') AS rejected_count
        FROM sales_returns sr
        WHERE sr.business_id = CAST(:bid AS uuid)
          {date_where}
    """), {"bid": bid, **dp})
    row = row.fetchone()

    rows = await db.execute(text(f"""
        SELECT return_reason, COUNT(*) AS count
        FROM sales_returns sr
        WHERE sr.business_id = CAST(:bid AS uuid)
          {date_where}
        GROUP BY return_reason
        ORDER BY count DESC

    """), {"bid": bid, **dp})
    rows = rows.fetchall()

    return success_response({
        "summary": {
            "total_returns": int(row.total_returns) if row else 0,
            "total_amount": float(row.total_amount) if can_financial else None,
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
async def get_purchase_returns_summary(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    current_user: dict = Depends(require_permission("reports.view")),
    db: AsyncSession = Depends(get_async_db)
):
    bid = current_user["business_id"]
    can_financial = check_feature_access(current_user, "financial_reports")["allowed"]
    date_where, dp = _date_col("pr", "return_created_at", date_from, date_to)

    row = await db.execute(text(f"""
        SELECT
            COUNT(*) AS total_returns,
            COALESCE(SUM(return_amount), 0) AS total_amount,
            COUNT(*) FILTER (WHERE return_status = 'approved') AS approved_count,
            COUNT(*) FILTER (WHERE return_status = 'pending') AS pending_count,
            COUNT(*) FILTER (WHERE return_status = 'rejected') AS rejected_count
        FROM purchase_returns pr
        WHERE pr.business_id = CAST(:bid AS uuid)
          {date_where}
    """), {"bid": bid, **dp})
    row = row.fetchone()

    return success_response({
        "total_returns": int(row.total_returns) if row else 0,
        "total_amount": float(row.total_amount) if can_financial else None,
        "approved_count": int(row.approved_count) if row else 0,
        "pending_count": int(row.pending_count) if row else 0,
        "rejected_count": int(row.rejected_count) if row else 0,
    })


@router.get("/returns/trend")
async def get_returns_trend(
    period: str = "monthly",
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    current_user: dict = Depends(require_permission("reports.view")),
    db: AsyncSession = Depends(get_async_db)
):
    bid = current_user["business_id"]
    can_financial = check_feature_access(current_user, "financial_reports")["allowed"]
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

    rows = await db.execute(text(f"""
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
    """), params)
    rows = rows.fetchall()

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
            "sales_return_amount": float(r.sales_return_amount) if can_financial else None,
            "purchase_return_count": int(r.purchase_return_count),
            "purchase_return_amount": float(r.purchase_return_amount) if can_financial else None,
        })

    return success_response(result)


@router.get("/returns/impact")
async def get_returns_profit_impact(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    current_user: dict = Depends(require_permission("reports.view")),
    db: AsyncSession = Depends(get_async_db)
):
    bid = current_user["business_id"]
    if not check_feature_access(current_user, "financial_reports")["allowed"]:
        return success_response(None)

    date_where, dp = _date_col("sr", "return_created_at", date_from, date_to)

    # Sales returns — cost of returned goods
    row = await db.execute(text(f"""
        SELECT
            COALESCE(SUM(sr.return_amount), 0) AS sales_return_value,
            COALESCE(SUM(sri.return_qty * sri.original_unit_price), 0) AS sales_return_cost
        FROM sales_returns sr
        LEFT JOIN sales_return_items sri ON sri.return_id = sr.return_id
        WHERE sr.business_id = CAST(:bid AS uuid)
          AND sr.return_status = 'approved'
          {date_where}
    """), {"bid": bid, **dp})
    row = row.fetchone()

    dp2, pp2 = _date_col("prr", "return_created_at", date_from, date_to)

    row2 = await db.execute(text(f"""
        SELECT
            COALESCE(SUM(prr.return_amount), 0) AS purchase_return_value
        FROM purchase_returns prr
        WHERE prr.business_id = CAST(:bid AS uuid)
          AND prr.return_status = 'approved'
          {dp2}
    """), {"bid": bid, **pp2})
    row2 = row2.fetchone()

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
async def get_payment_collections(
    period: str = "monthly",
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    current_user: dict = Depends(require_permission("reports.view")),
    db: AsyncSession = Depends(get_async_db)
):
    bid = current_user["business_id"]
    can_financial = check_feature_access(current_user, "financial_reports")["allowed"]
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

    rows = await db.execute(text(f"""
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
    """), params)
    rows = rows.fetchall()

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
        result.append({"label": label, "payment_count": int(r.payment_count), "amount": float(r.amount) if can_financial else None})

    return success_response(result)


@router.get("/payments/outstanding")
async def get_outstanding_receivables(
    current_user: dict = Depends(require_permission("reports.view")),
    db: AsyncSession = Depends(get_async_db),
    pagination: dict = Depends(paginate_async),
):
    bid = current_user["business_id"]
    can_financial = check_feature_access(current_user, "financial_reports")["allowed"]

    invoices_total = (await db.execute(text("""
        SELECT COUNT(*) AS cnt
        FROM sales s
        WHERE s.business_id = CAST(:bid AS uuid)
          AND s.is_deleted = false
          AND s.sales_payment_status IN ('pending', 'partial')
    """), {"bid": bid})).fetchone().cnt

    rows = await db.execute(text("""
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
        LIMIT :limit OFFSET :offset
    """), {"bid": bid, "limit": pagination["limit"], "offset": pagination["offset"]})
    rows = rows.fetchall()

    total_outstanding = 0
    data = []
    for r in rows:
        balance = float(r.balance) if r.balance else 0
        total_outstanding += balance
        data.append({
            "sales_id": str(r.sales_id),
            "invoice_no": r.invoice_no,
            "cust_name": r.cust_name,
            "invoice_total": float(r.sales_final_amount) if can_financial else None,
            "total_paid": float(r.total_paid) if can_financial else None,
            "balance": balance if can_financial else None,
            "payment_status": r.sales_payment_status,
        })

    return success_response({
        "total_outstanding": total_outstanding if can_financial else None,
        "total_invoices": invoices_total,
        "invoices": pagination_response(
            data, invoices_total, pagination["page"], pagination["limit"],
            capped=pagination["_capped"],
        ),
    })


@router.get("/payments/by-method")
async def get_payments_by_method(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    current_user: dict = Depends(require_permission("reports.view")),
    db: AsyncSession = Depends(get_async_db)
):
    bid = current_user["business_id"]
    can_financial = check_feature_access(current_user, "financial_reports")["allowed"]
    date_where, dp = _date_col("pay", "payment_paid_at", date_from, date_to)

    rows = await db.execute(text(f"""
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
    """), {"bid": bid, **dp})
    rows = rows.fetchall()

    total = sum(float(r.total_amount) for r in rows) if can_financial else 0

    return success_response([
        {
            "method": r.method,
            "payment_count": int(r.payment_count),
            "total_amount": float(r.total_amount) if can_financial else None,
            "percentage": round(float(r.total_amount) / total * 100, 2) if can_financial and total > 0 else None,
        }
        for r in rows
    ])


@router.get("/payments/partial")
async def get_partial_payments(
    current_user: dict = Depends(require_permission("reports.view")),
    db: AsyncSession = Depends(get_async_db),
    pagination: dict = Depends(paginate_async),
):
    bid = current_user["business_id"]
    can_financial = check_feature_access(current_user, "financial_reports")["allowed"]

    total = (await db.execute(text("""
        SELECT COUNT(*) AS cnt
        FROM payments pay
        JOIN sales s ON s.sales_id = pay.sale_id
        WHERE pay.business_id = CAST(:bid AS uuid)
          AND pay.is_active = true
          AND s.sales_payment_status = 'partial'
          AND s.is_deleted = false
    """), {"bid": bid})).fetchone().cnt

    rows = await db.execute(text("""
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
        LIMIT :limit OFFSET :offset
    """), {"bid": bid, "limit": pagination["limit"], "offset": pagination["offset"]})
    rows = rows.fetchall()

    return success_response(pagination_response(
        [{
            "sales_id": str(r.sales_id),
            "invoice_no": r.invoice_no,
            "cust_name": r.cust_name,
            "invoice_total": float(r.sales_final_amount) if can_financial else None,
            "cumulative_paid": float(r.cumulative_paid) if can_financial else None,
            "remaining": float(r.remaining) if can_financial else None,
            "last_payment_amount": float(r.last_payment_amount) if can_financial else None,
            "last_payment_method": r.payment_method,
            "last_payment_date": str(r.payment_paid_at) if r.payment_paid_at else None,
        }
        for r in rows
    ], total, pagination["page"], pagination["limit"], capped=pagination["_capped"]))


# ═══════════════════════════════════════════════════════════════════════════════
# 12. AUDIT REPORTS (Admin Only)
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/audit/user-activities")
async def get_user_activities(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    user_id: Optional[str] = Query(None),
    current_user: dict = Depends(require_permission("reports.view")),
    db: AsyncSession = Depends(get_async_db)
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

    # Intentionally fixed LIMIT 500 — audit trail page-size cap, not a bug.
    rows = await db.execute(text(f"""
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
    """), params)
    rows = rows.fetchall()

    records = [
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
    ]

    # Resolve FK UUIDs to human-readable names (product_id → prod_name, etc.)
    lookup = await _resolve_audit_names(db, records)
    if lookup:
        for rec in records:
            rec["old_data"] = _enrich_data(rec["old_data"], lookup)
            rec["new_data"] = _enrich_data(rec["new_data"], lookup)

    return success_response(records)


@router.get("/audit/login-activities")
async def get_login_activities(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    current_user: dict = Depends(require_permission("reports.view")),
    db: AsyncSession = Depends(get_async_db)
):
    bid = current_user["business_id"]
    perms = current_user.get("permissions", set())
    if "staff.manage" not in perms:
        return success_response([])

    date_where, dp = _date_col("p", "last_login_at", date_from, date_to)

    rows = await db.execute(text(f"""
        SELECT
            p.id,
            p.full_name,
            p.email,
            p.created_at,
            p.last_login_at,
            p.last_logout_at
        FROM profiles p
        WHERE p.business_id = CAST(:bid AS uuid)
          {date_where}
        ORDER BY p.last_login_at DESC NULLS LAST
    """), {"bid": bid, **dp})
    rows = rows.fetchall()

    return success_response([
        {
            "user_id": str(r.id),
            "full_name": r.full_name,
            "email": r.email,
            "created_at": str(r.created_at) if r.created_at else None,
            "last_login_at": str(r.last_login_at) if r.last_login_at else None,
            "last_logout_at": str(r.last_logout_at) if r.last_logout_at else None,
        }
        for r in rows
    ])


@router.get("/audit/data-changes")
async def get_data_changes(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    table_name: Optional[str] = Query(None),
    current_user: dict = Depends(require_permission("reports.view")),
    db: AsyncSession = Depends(get_async_db)
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

    # Intentionally fixed LIMIT 500 — audit trail page-size cap, not a bug.
    rows = await db.execute(text(f"""
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
    """), params)
    rows = rows.fetchall()

    records = [
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
    ]

    # Resolve FK UUIDs to human-readable names (product_id → prod_name, etc.)
    lookup = await _resolve_audit_names(db, records)
    if lookup:
        for rec in records:
            rec["old_data"] = _enrich_data(rec["old_data"], lookup)
            rec["new_data"] = _enrich_data(rec["new_data"], lookup)

    return success_response(records)


# ── SECURITY NOTE — Future export endpoints ──────────────────────────
# Any new dedicated export endpoint (CSV/Excel/PDF) MUST enforce the
# same permission checks as the corresponding read endpoint:
#   - Revenue/profit/cost exports  → require dashboard.financial
#   - Cost price exports            → require view_product_profit
#   - Audit log exports             → require staff.manage
# Client-side exports (ExportButton) only export the current paginated
# page; they are constrained by the same backend permission checks that
# gate the source data. Prefer server-side export for full data and
# ALWAYS include the permission gates above.
# ──────────────────────────────────────────────────────────────────────

@router.get("/audit/exports")
async def get_export_activities(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    current_user: dict = Depends(require_permission("reports.view")),
    db: AsyncSession = Depends(get_async_db)
):
    bid = current_user["business_id"]
    perms = current_user.get("permissions", set())
    if "staff.manage" not in perms:
        return success_response([])

    date_where, dp = _date_col("al", "created_at", date_from, date_to)

    # Intentionally fixed LIMIT 200 — audit trail page-size cap, not a bug.
    rows = await db.execute(text(f"""
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
    """), {"bid": bid, **dp})
    rows = rows.fetchall()

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
