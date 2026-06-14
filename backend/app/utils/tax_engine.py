# app/utils/tax_engine.py
#
# ─────────────────────────────────────────────────────────────────────────────
# SMARTBILLR GLOBAL TAX DETERMINATION ENGINE
# ─────────────────────────────────────────────────────────────────────────────
#
# This is the single source of truth for all Python-side tax calculations.
# The DB trigger (fn_sale_stock_movement) handles Sales tax in the database.
# Everything else — Purchases, future Quotations, Proforma Invoices, etc. —
# uses this module.
#
# TAX DETERMINATION RULES
# ───────────────────────
# Step 1: If business_country != "IN" → use generic tax_total only.
#          No CGST/SGST/IGST logic at all.
#
# Step 2: Business is in India. Check counterparty (customer or supplier):
#   Rule 1: counterparty_country != "IN" → IGST (cross-border supply)
#   Rule 2: counterparty_country == "IN", state blank → CGST + SGST
#            (walk-in / unknown state defaults to intrastate)
#   Rule 3: counterparty_country == "IN", same state → CGST + SGST (intrastate)
#   Rule 4: counterparty_country == "IN", different state → IGST (interstate)
#
# EXTENSIBILITY
# ─────────────
# To add a new country tax engine (e.g. US Sales Tax with nexus rules):
#   1. Add a new function: calculate_us_sales_tax(...)
#   2. Add a dispatch branch in determine_tax_type() below.
#   3. Call determine_item_tax() with the new function.
#   Nothing in the existing India path changes.
# ─────────────────────────────────────────────────────────────────────────────

from decimal import Decimal
from typing import Optional


# ─────────────────────────────────────────────────────────────────────────────
# PUBLIC API — this is what routers import
# ─────────────────────────────────────────────────────────────────────────────

def calculate_item_tax(
    unit_price:             Decimal,
    quantity:               int,
    tax_rate:               Decimal,
    business_country_code:  str,
    business_state:         str,
    counterparty_country_code: Optional[str],   # customer or supplier country
    counterparty_state:     Optional[str],       # customer or supplier state
) -> dict:
    """
    Calculate tax breakdown for a single line item.

    Returns a dict with:
        subtotal           — unit_price × quantity
        cgst_amount        — CGST portion (India intrastate only)
        sgst_amount        — SGST portion (India intrastate only)
        igst_amount        — IGST portion (India interstate/cross-border)
        generic_tax_total  — tax for non-India businesses (stored as tax_total/pur_tax_total)
        item_tax_total     — total tax regardless of type (cgst+sgst+igst OR generic)
        item_total_with_tax— subtotal + item_tax_total
        tax_type           — "cgst_sgst" | "igst" | "generic" (for logging/debug)
    """
    subtotal  = unit_price * quantity
    total_tax = (subtotal * tax_rate) / Decimal("100")

    tax_type = _determine_tax_type(
        business_country_code    = (business_country_code or "").strip().upper(),
        business_state           = (business_state or "").strip().lower(),
        counterparty_country_code= (counterparty_country_code or "").strip().upper(),
        counterparty_state       = (counterparty_state or "").strip().lower(),
    )

    cgst         = Decimal("0")
    sgst         = Decimal("0")
    igst         = Decimal("0")
    generic_tax  = Decimal("0")

    if tax_type == "cgst_sgst":
        # Split evenly — round each to 2 dp independently
        cgst = (total_tax / Decimal("2")).quantize(Decimal("0.01"))
        sgst = (total_tax / Decimal("2")).quantize(Decimal("0.01"))
    elif tax_type == "igst":
        igst = total_tax.quantize(Decimal("0.01"))
    else:
        # "generic" — non-India business, single tax_total bucket
        generic_tax = total_tax.quantize(Decimal("0.01"))

    item_tax_total = cgst + sgst + igst + generic_tax

    return {
        "subtotal":             subtotal,
        "cgst_amount":          cgst,
        "sgst_amount":          sgst,
        "igst_amount":          igst,
        "generic_tax_total":    generic_tax,      # maps to pur_tax_total in purchase_items
        "item_tax_total":       item_tax_total,
        "item_total_with_tax":  subtotal + item_tax_total,
        "tax_type":             tax_type,
    }


# ─────────────────────────────────────────────────────────────────────────────
# INTERNAL — not imported by routers
# ─────────────────────────────────────────────────────────────────────────────

def _determine_tax_type(
    business_country_code:     str,
    business_state:            str,
    counterparty_country_code: str,
    counterparty_state:        str,
) -> str:
    """
    Returns "cgst_sgst", "igst", or "generic".

    All inputs must already be stripped and uppercased/lowercased by caller.
    """

    # ── Step 1: Non-Indian business → generic tax only ────────────────────────
    if business_country_code != "IN":
        return "generic"

    # ── Step 2: Indian business — apply GST rules ─────────────────────────────

    # Rule 1: counterparty is outside India → IGST (cross-border)
    # Only triggers when counterparty_country_code is explicitly non-India.
    # Blank counterparty_country_code is treated as "India" (same as walk-in customer).
    if counterparty_country_code and counterparty_country_code != "IN":
        return "igst"

    # Rule 2: Both parties in India, counterparty state is blank →
    #          default to intrastate (CGST + SGST).
    # Rationale: walk-in customer, unknown vendor, or missing data should not
    # result in a wrong IGST classification. Intrastate is the safer default.
    if not counterparty_state:
        return "cgst_sgst"

    # Rule 3: Both parties in India, same state → intrastate (CGST + SGST)
    if business_state == counterparty_state:
        return "cgst_sgst"

    # Rule 4: Both parties in India, different states → interstate (IGST)
    return "igst"