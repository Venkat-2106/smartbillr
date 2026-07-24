class P:
    DASHBOARD_VIEW = "dashboard.view"
    DASHBOARD_FINANCIAL = "dashboard.financial"
    SALES_VIEW = "sales.view"
    SALES_CREATE = "sales.create"
    SALES_EDIT = "sales.edit"
    SALES_DELETE = "sales.delete"
    SALES_RETURNS_MANAGE = "sales_returns.manage"
    # ── PERMISSION SPLIT (2026-07) ──────────────────────────────────────────
    # "manage" allows creating, listing, and deleting returns.
    # "approve" allows changing status (approve/reject) via PUT.
    # Staff get manage-only; admin/manager get both.
    SALES_RETURNS_APPROVE = "sales_returns.approve"
    PURCHASES_VIEW = "purchases.view"
    PURCHASES_CREATE = "purchases.create"
    PURCHASES_EDIT = "purchases.edit"
    PURCHASES_DELETE = "purchases.delete"
    PURCHASE_RETURNS_MANAGE = "purchase_returns.manage"
    # ── PERMISSION SPLIT (2026-07) ──────────────────────────────────────────
    # Same pattern as sales_returns: manage = CRUD, approve = status change.
    PURCHASE_RETURNS_APPROVE = "purchase_returns.approve"
    PAYMENTS_MANAGE = "payments.manage"
    CUSTOMERS_MANAGE = "customers.manage"
    SUPPLIERS_MANAGE = "suppliers.manage"
    PRODUCTS_VIEW = "products.view"
    PRODUCTS_EDIT = "products.edit"
    STOCK_VIEW = "stock.view"
    STOCK_ADJUST = "stock.adjust"
    VIEW_PRODUCT_PROFIT = "view_product_profit"
    EXPENSES_MANAGE = "expenses.manage"
    REPORTS_VIEW = "reports.view"
    STAFF_MANAGE = "staff.manage"
    SETTINGS_MANAGE = "settings.manage"
    SUBSCRIPTION_MANAGE = "subscription.manage"

    ALL = [
        DASHBOARD_VIEW, DASHBOARD_FINANCIAL,
        SALES_VIEW, SALES_CREATE, SALES_EDIT, SALES_DELETE,
        SALES_RETURNS_MANAGE, SALES_RETURNS_APPROVE,
        PURCHASES_VIEW, PURCHASES_CREATE, PURCHASES_EDIT, PURCHASES_DELETE,
        PURCHASE_RETURNS_MANAGE, PURCHASE_RETURNS_APPROVE,
        PAYMENTS_MANAGE, CUSTOMERS_MANAGE, SUPPLIERS_MANAGE,
        PRODUCTS_VIEW, PRODUCTS_EDIT, STOCK_VIEW, STOCK_ADJUST,
        VIEW_PRODUCT_PROFIT, EXPENSES_MANAGE,
        REPORTS_VIEW, STAFF_MANAGE, SETTINGS_MANAGE, SUBSCRIPTION_MANAGE,
    ]

    FINANCIAL = [
        DASHBOARD_FINANCIAL, VIEW_PRODUCT_PROFIT,
    ]

    MANAGER = [
        DASHBOARD_VIEW, DASHBOARD_FINANCIAL,
        SALES_VIEW, SALES_CREATE, SALES_EDIT, SALES_DELETE,
        SALES_RETURNS_MANAGE, SALES_RETURNS_APPROVE,
        PURCHASES_VIEW, PURCHASES_CREATE, PURCHASES_EDIT, PURCHASES_DELETE,
        PURCHASE_RETURNS_MANAGE, PURCHASE_RETURNS_APPROVE,
        PAYMENTS_MANAGE, CUSTOMERS_MANAGE, SUPPLIERS_MANAGE,
        PRODUCTS_VIEW, PRODUCTS_EDIT, STOCK_VIEW, STOCK_ADJUST,
        VIEW_PRODUCT_PROFIT, EXPENSES_MANAGE,
        REPORTS_VIEW,
    ]

    # Staff get manage (create/list/delete) but NOT approve — they cannot
    # change return status.  Non-pending statuses are silently downgraded
    # to "pending" in the POST create endpoint if the caller lacks approve.
    STAFF = [
        DASHBOARD_VIEW,
        SALES_VIEW, SALES_CREATE,
        SALES_RETURNS_MANAGE,
        PURCHASE_RETURNS_MANAGE,
        CUSTOMERS_MANAGE,
        PRODUCTS_VIEW, STOCK_VIEW,
    ]
