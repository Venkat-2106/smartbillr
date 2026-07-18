STAFF_LIMITS = {
    "trial":   {"staff": 0,    "manager": 0},
    "monthly": {"staff": 2,    "manager": 1},
    "annual":  {"staff": None, "manager": None},
    "lifetime": {"staff": None, "manager": None},
}


def get_staff_limits(subscription_type: str) -> dict:
    """Return staff/manager limits for a given subscription type. Unknown types default to trial."""
    return STAFF_LIMITS.get(subscription_type, STAFF_LIMITS["trial"])
