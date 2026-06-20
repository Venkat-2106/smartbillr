from html import escape as html_escape


def strip_and_escape_html(v: str | None) -> str | None:
    if v is not None:
        v = v.strip()
        if v:
            v = html_escape(v)
    return v
