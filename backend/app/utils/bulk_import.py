"""
Shared CSV bulk-import infrastructure.

Used by every entity's /import endpoint (categories, customers, suppliers,
products, stock, purchases, sales). Each router owns its own field mapping,
duplicate-check rule, and insert SQL — this module only owns the parts that
are identical across all of them:

  1. CSV parsing (stdlib csv module — no frontend parsing library needed;
     the raw file is uploaded as multipart/form-data and parsed server-side,
     so validation logic lives in exactly one place, not duplicated in JS).
  2. Row-level validation wiring (row_transform is entity-specific).
  3. Trial-plan row-count check (reuses get_feature_limits(), the SAME
     source of truth as check_create_allowed_async in usage_limits.py —
     not a separate/duplicated limit system).
  4. Chunked-batch helper so large imports insert in groups instead of
     one-row-at-a-time (mirrors the batching approach already used in
     bulk_stock_adjust.py).
"""
import csv
import io
from app.utils.subscription_features import get_feature_limits
from app.utils.usage_limits import count_entities_async, count_monthly_async

MAX_IMPORT_ROWS = 1000   # hard cap per uploaded file (data rows, excluding header)
CHUNK_SIZE = 100          # rows per INSERT statement


def parse_csv_file(file_bytes: bytes) -> tuple[list[dict], str | None]:
    """
    Decodes and parses an uploaded CSV file into a list of dict rows
    (keys = header column names).

    Returns (rows, error). error is None on success, and rows is [] on error.
    """
    try:
        text = file_bytes.decode("utf-8-sig")  # -sig strips BOM from Excel-exported CSVs
    except UnicodeDecodeError:
        return [], "File is not valid UTF-8 text. Please save/export the CSV as UTF-8."

    reader = csv.DictReader(io.StringIO(text))
    if reader.fieldnames is None:
        return [], "CSV file is empty or has no header row."

    rows = list(reader)
    if not rows:
        return [], "CSV file has no data rows."

    if len(rows) > MAX_IMPORT_ROWS:
        return [], (
            f"File has {len(rows)} rows — maximum {MAX_IMPORT_ROWS} rows per "
            f"import. Please split into smaller files."
        )

    return rows, None


def validate_rows(rows: list[dict], row_transform) -> tuple[list[dict], list[dict]]:
    """
    Applies row_transform(row_dict, row_number) -> (clean_dict | None, error_str | None)
    to every parsed row. row_transform owns all entity-specific required-field
    checks and sanitization (e.g. strip_and_escape_html), same as the existing
    single-record Create routes.

    row_number is 1-indexed and counts the header row as row 1, so the first
    data row is row_number=2 — matching what a person sees when they open the
    CSV in Excel/Sheets.

    Valid rows come back with an internal "_row_number" key attached (used for
    duplicate-error reporting downstream); callers must pop it before INSERT.
    """
    valid_rows = []
    errors = []

    for i, row in enumerate(rows):
        row_number = i + 2
        clean, err = row_transform(row, row_number)
        if err:
            errors.append({"row": row_number, "message": err})
        elif clean is not None:
            clean["_row_number"] = row_number
            valid_rows.append(clean)

    return valid_rows, errors


async def check_bulk_create_allowed(
    db,
    business_id: str,
    subscription_type: str,
    limit_key: str,
    table: str,
    requested_count: int,
    date_column: str | None = None,
) -> tuple[int, str | None]:
    """
    Checks how many of the requested rows can actually be inserted under the
    business's plan limit — checked ONCE per import (not once per row, unlike
    the single-record check_create_allowed_async).

    Returns (allowed_count, message):
      - allowed_count == requested_count, message=None         → all rows fit
      - 0 < allowed_count < requested_count, message=<warning>  → partial import
      - allowed_count == 0, message=<error>                     → nothing fits
    """
    limits = get_feature_limits(subscription_type)
    max_val = limits.get(limit_key)

    if max_val is None:
        return requested_count, None  # uncapped tier (monthly/annual/lifetime)

    # FIXED date_column added so monthly-capped limits use same count logic as single-record creation
    if date_column:
        current = await count_monthly_async(db, business_id, table, date_column)
    else:
        current = await count_entities_async(db, business_id, table)
    remaining = max_val - current

    plan_label = subscription_type.capitalize()
    label = limit_key.replace("max_", "").replace("_", " ")

    if remaining <= 0:
        return 0, (
            f"Your {plan_label} plan allows a maximum of {max_val} {label}. "
            f"You already have {current}. Upgrade to import more."
        )

    if remaining < requested_count:
        return remaining, (
            f"Only {remaining} of {requested_count} rows were imported — your "
            f"{plan_label} plan allows a maximum of {max_val} {label}. "
            f"Upgrade to import the rest."
        )

    return requested_count, None


def chunk_list(items: list, size: int = CHUNK_SIZE):
    for i in range(0, len(items), size):
        yield items[i:i + size]