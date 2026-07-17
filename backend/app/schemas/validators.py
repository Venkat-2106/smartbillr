from html import escape as html_escape
import re


def strip_and_escape_html(v: str | None) -> str | None:
    if v is not None:
        v = v.strip()
        if v:
            v = html_escape(v)
    return v


# Formula-injection characters used in CSV export/import paths:
# leading =, +, -, or @ can make spreadsheet apps execute formulas.
_RE_FORMULA_LEAD = re.compile(r"^[=+\-@]")


def strip_and_escape_csv_value(v: str | None) -> str | None:
    if v is not None:
        v = v.strip()
        if v:
            v = _RE_FORMULA_LEAD.sub("", v)
            v = html_escape(v)
    return v
