# app/utils/timestamp.py
#
# ═══════════════════════════════════════════════════════════════
# SMARTBILLR — SINGLE SOURCE OF TRUTH FOR TIMESTAMP SERIALIZATION
# ═══════════════════════════════════════════════════════════════
#
# WHY THIS FILE EXISTS:
#   All routers previously used str(datetime_object) to serialize
#   timestamps into JSON. str() on a naive Python datetime produces:
#       "2026-06-05 03:00:00"
#   That string has:
#     (a) a space instead of 'T' — technically non-standard ISO 8601
#     (b) no timezone offset — JavaScript treats it as LOCAL time
#
#   JavaScript's spec (ECMA-262) says:
#     - Date-time strings WITHOUT a timezone offset → treated as LOCAL time
#     - Date-time strings WITH 'Z' or '+00:00'     → treated as UTC
#
#   Result: when a browser in EST sees "2026-06-05 03:00:00" (no offset),
#   it treats it as 3 AM EST, not 3 AM UTC. Display is then wrong by 5 hours.
#   Near midnight this shifts the displayed DATE by a full day.
#
# THE FIX:
#   fmt_ts(dt) → always produces "2026-06-05T03:00:00Z"
#     - Uses 'T' separator (standard ISO 8601)
#     - Always appends 'Z' (explicit UTC marker)
#     - Handles both naive and aware datetime objects
#     - Returns None for null/None inputs (JSON null → no date shown)
#
# USAGE (replace str(row.created_at) with fmt_ts(row.created_at)):
#
#   from app.utils.timestamp import fmt_ts
#
#   return {
#       "created_at": fmt_ts(row.created_at),
#       "updated_at": fmt_ts(row.updated_at),
#   }
#
# DATE-ONLY FIELDS (expense_date, invoice_date, etc.):
#   These are Python datetime.date objects, not datetime.datetime.
#   They store only the calendar date (no time component).
#   fmt_date(d) → "2026-06-05" (ISO 8601 date string, no timezone)
#   Date-only values have no timezone ambiguity — the user picked a date,
#   not a moment in time. The frontend displays them as-is (no conversion).
#
# DATABASE COLUMN TYPES:
#   Supabase uses "timestamp without time zone" for most audit columns.
#   PostgreSQL stores these as wall-clock UTC (the server TZ is UTC on Supabase).
#   SQLAlchemy Column(DateTime) maps to this type → returns naive Python datetime.
#   SQLAlchemy Column(DateTime(timezone=True)) → returns aware Python datetime.
#   Both are handled by fmt_ts().
# ═══════════════════════════════════════════════════════════════

from datetime import datetime, date, timezone


def fmt_ts(dt) -> str | None:
    """
    Serialize a Python datetime to an unambiguous UTC ISO 8601 string.

    Always produces the format: "2026-06-05T03:00:00Z"

    Rules:
      - None / null  → returns None  (JSON null, frontend shows '—')
      - naive datetime (no tzinfo) → assumed to be UTC (Supabase stores UTC)
        → appends 'Z' directly after isoformat()
      - aware datetime (has tzinfo, e.g. +00:00 from psycopg2 timestamptz)
        → converts to UTC first, then appends 'Z'

    Args:
        dt: datetime object (naive or aware), or None

    Returns:
        ISO 8601 UTC string ending in 'Z', or None
    """
    if dt is None:
        return None
    if not isinstance(dt, datetime):
        # Safety: if something non-datetime slips through, return str representation
        return str(dt)
    if dt.tzinfo is None:
        # Naive datetime: Supabase/PostgreSQL stores UTC, tzinfo was just stripped
        # by SQLAlchemy's DateTime (without timezone=True). Safe to treat as UTC.
        return dt.isoformat(timespec='seconds') + 'Z'
    else:
        # Aware datetime: normalize to UTC then strip offset, append Z
        utc_dt = dt.astimezone(timezone.utc)
        return utc_dt.isoformat(timespec='seconds').replace('+00:00', 'Z')


def fmt_date(d) -> str | None:
    """
    Serialize a Python date (date-only, no time) to an ISO 8601 date string.

    Produces: "2026-06-05"

    Date-only fields (expense_date, invoice_date, etc.) represent a calendar
    date chosen by the user — they have no timezone ambiguity. The frontend
    should display them as-is without any timezone conversion.

    Args:
        d: date or datetime object, or None

    Returns:
        "YYYY-MM-DD" string, or None
    """
    if d is None:
        return None
    if isinstance(d, datetime):
        return d.date().isoformat()
    if isinstance(d, date):
        return d.isoformat()
    return str(d)