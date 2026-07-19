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
import logging
from sqlalchemy.exc import IntegrityError, DataError, ProgrammingError
from app.utils.subscription_features import get_feature_limits
from app.utils.usage_limits import count_entities_async, count_monthly_async

logger = logging.getLogger(__name__)

MAX_IMPORT_ROWS = 1000   # hard cap per uploaded file (data rows, excluding header)
MAX_IMPORT_FILE_BYTES = 5 * 1024 * 1024  # 5 MB — mirrors ImportButton.jsx's frontend limit
CHUNK_SIZE = 100          # rows per INSERT statement


def validate_upload_file(file) -> str | None:
    """
    Checks filename extension and declared content-type before reading
    the file into memory. Returns an error string, or None if OK.
    This prevents oversized or non-CSV files from being loaded into RAM.
    """
    if file.filename and not file.filename.lower().endswith(".csv"):
        return "Please upload a CSV file (.csv)."
    if file.content_type not in (
        "text/csv", "application/vnd.ms-excel", "application/csv", "text/plain",
        "application/octet-stream",  # some clients send this for .csv uploads
    ):
        return "Please upload a CSV file (.csv)."
    return None


def parse_csv_file(file_bytes: bytes) -> tuple[list[dict], list[str] | None, str | None]:
    """
    Decodes and parses an uploaded CSV file into a list of dict rows
    (keys = header column names).

    Returns (rows, fieldnames, error). error is None on success,
    and rows is [] on error. fieldnames is the raw header list from
    the CSV (None on error) so callers can do header-level checks
    without a second pass over the file.
    """
    try:
        text = file_bytes.decode("utf-8-sig")  # -sig strips BOM from Excel-exported CSVs
    except UnicodeDecodeError:
        return [], None, "File is not valid UTF-8 text. Please save/export the CSV as UTF-8."

    reader = csv.DictReader(io.StringIO(text))
    if reader.fieldnames is None:
        return [], None, "CSV file is empty or has no header row."

    # Strip whitespace from headers so "Product Name " matches "Product Name"
    reader.fieldnames = [fn.strip() for fn in reader.fieldnames]

    rows = list(reader)

    # Filter out completely empty rows (blank lines at end of file)
    rows = [r for r in rows if any((v or "").strip() for v in r.values())]

    if not rows:
        return [], reader.fieldnames, "CSV file has no data rows."

    if len(rows) > MAX_IMPORT_ROWS:
        return [], reader.fieldnames, (
            f"File has {len(rows)} rows — maximum {MAX_IMPORT_ROWS} rows per "
            f"import. Please split into smaller files."
        )

    return rows, reader.fieldnames, None


def check_required_headers(
    fieldnames: list[str],
    required_columns: list[dict],
) -> str | None:
    """
    Checks that every required column has at least one of its accepted header
    names present in the CSV's actual header row (fieldnames from csv.DictReader).

    required_columns: list of {"names": [...]} where "names" is every header
    variant that should count as satisfying that requirement — e.g.
    {"names": ["prod_name", "name", "Product Name"]}.

    Returns None if all required columns are present, or a single user-facing
    error string listing every missing column's canonical label if any are absent.
    """
    if not fieldnames:
        return None  # parse_csv_file already handles the "no header row" case

    present = set(fieldnames)
    missing_labels = []

    for col in required_columns:
        names = col["names"]
        if not any(n in present for n in names):
            # Use the first name as the human-readable label in the error message
            missing_labels.append(names[0])

    if missing_labels:
        cols_str = ", ".join(missing_labels)
        plural = "s" if len(missing_labels) > 1 else ""
        return (
            f"Your file is missing required column{plural}: {cols_str}. "
            f"Please use the downloadable template and make sure these columns "
            f"are present, then try again."
        )
    return None


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


def friendly_db_error(e: Exception, context: str = "this batch") -> str:
    """
    Converts a raw DB/driver exception into a short, plain-English message safe
    to show end users. Always logs the full original exception server-side via
    logging.exception BEFORE returning the sanitized message, so nothing is lost
    for debugging — only what reaches the client is sanitized.
    """
    logger.exception(f"Bulk import DB error while processing {context}")

    if isinstance(e, IntegrityError):
        orig = str(getattr(e, "orig", e)).lower()
        if "unique" in orig or "duplicate" in orig:
            return "One or more rows conflict with an existing record (duplicate name, phone, or barcode)."
        if "foreign key" in orig:
            return "One or more rows reference a category, supplier, or product that no longer exists."
        return "Some rows conflict with existing data and could not be saved."

    if isinstance(e, DataError):
        return "Some rows contain a value in the wrong format (check numbers, dates, or IDs) and could not be saved."

    # ProgrammingError usually means a schema/column mismatch between the CSV
    # and what the endpoint expects — point the user at the Import Guidelines
    # panel and downloadable template rather than a vague "contact support".
    if isinstance(e, ProgrammingError):
        return (
            "The file format could not be processed. Please make sure you are "
            "uploading a CSV file (.csv) with the correct column headers. "
            "Download the template from the Import Guidelines section and fill "
            "it in without changing the header row, then try again."
        )

    # Catch-all: still guide users toward the on-page Import Guidelines
    # instead of a bare "try again" so they know where to look for help.
    return (
        "An unexpected error occurred while saving this batch. Please check "
        "that all required fields are filled in correctly, refer to the "
        "Import Guidelines on this page, and try again."
    )