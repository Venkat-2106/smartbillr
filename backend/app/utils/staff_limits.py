# Legacy alias map — the frontend historically used "monthly" and "annual"
# subscription types (from old plans), even though newer code normalises to
# "basic" / "pro_yearly".  We keep the aliases here so that businesses with
# legacy data get the correct staff/manager limits instead of falling through
# to trial (0 / 0).
STAFF_LIMITS = {
    "trial":      {"staff": 0,    "manager": 0},
    "basic":      {"staff": 2,    "manager": 1},
    "monthly":    {"staff": 2,    "manager": 1},   # legacy alias for basic
    "pro":        {"staff": 10,   "manager": 10},
    "pro_yearly": {"staff": 10,   "manager": 10},
    "annual":     {"staff": 10,   "manager": 10},  # legacy alias for pro_yearly
    "lifetime":   {"staff": None, "manager": None},
}


def get_staff_limits(subscription_type: str) -> dict:
    """Return staff/manager limits for a given subscription type. Unknown types default to trial."""
    return STAFF_LIMITS.get(subscription_type, STAFF_LIMITS["trial"])
