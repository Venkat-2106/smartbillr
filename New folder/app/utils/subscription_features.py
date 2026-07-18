TIER_FEATURES = {
    "suspended": {
        "max_products": 0,
        "max_customers": 0,
        "max_suppliers": 0,
        "max_sales_per_month": 0,
        "max_purchases_per_month": 0,
        "max_export_rows": 0,
        "financial_reports": False,
        "product_profit_view": False,
    },
    "trial": {
        "max_products": 50,
        "max_customers": 50,
        "max_suppliers": 25,
        "max_sales_per_month": 100,
        "max_purchases_per_month": 50,
        "max_export_rows": 500,
        "financial_reports": False,
        "product_profit_view": False,
    },
    "monthly": {
        "max_products": None,
        "max_customers": None,
        "max_suppliers": None,
        "max_sales_per_month": None,
        "max_purchases_per_month": None,
        "max_export_rows": 10_000,
        "financial_reports": True,
        "product_profit_view": True,
    },
    "annual": {
        "max_products": None,
        "max_customers": None,
        "max_suppliers": None,
        "max_sales_per_month": None,
        "max_purchases_per_month": None,
        "max_export_rows": 10_000,
        "financial_reports": True,
        "product_profit_view": True,
    },
    "lifetime": {
        "max_products": None,
        "max_customers": None,
        "max_suppliers": None,
        "max_sales_per_month": None,
        "max_purchases_per_month": None,
        "max_export_rows": 10_000,
        "financial_reports": True,
        "product_profit_view": True,
    },
}


def get_feature_limits(subscription_type: str) -> dict:
    return TIER_FEATURES.get(subscription_type, TIER_FEATURES["trial"])


def check_feature_access(current_user: dict, feature_key: str) -> dict:
    permission_map = {
        "financial_reports": "dashboard.financial",
        "product_profit_view": "view_product_profit",
    }
    required_perm = permission_map.get(feature_key)
    perms = current_user.get("permissions", set())
    has_perm = required_perm is None or required_perm in perms

    sub_type = current_user.get("subscription_type", "trial")
    limits = get_feature_limits(sub_type)
    feature_allowed = limits.get(feature_key, False)

    return {
        "allowed": has_perm and feature_allowed,
        "locked_reason": sub_type if has_perm and not feature_allowed else None,
    }
