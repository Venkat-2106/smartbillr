// src/features/products/utils/barcodeLabelPrint.js
//
// COMPACT BARCODE LABEL PRINTING (sticker sheet).
//
// WHY NOT IN printUtils.js:
//   printUtils builds full A4 business documents (store header, watermark,
//   footer, meta grids) — a shelf/product sticker needs none of that. This
//   builder keeps its own small-format layout AND stays products-scoped so
//   the generic print framework never learns about the product shape.
//
// MECHANISM (reused, not reinvented):
//   Still flows through printUtils' getPrintRoot()/triggerPrint() hidden-node
//   mechanism — no popup window, popup-blocker-proof, auto-clears after
//   printing, consistent with every other print in the app. The @page margins
//   injected by getPrintRoot (~8mm/6mm) are compatible with standard A4 label
//   sheets and thermal rolls.
//
// COLORS: literal hex only — CSS variables do not resolve reliably in print
// stylesheets across browsers (established convention, see printUtils.js).
//
// LABEL CONTENT (standard retail sticker):
//   product name (small, ellipsis-truncated)
//   → barcode SVG (JsBarcode renders the human-readable digits under the bars)
//   → selling price when available on the object already in hand.

import { escapeHTML, triggerPrint } from '../../../shared/utils/printUtils'
import { formatCurrency } from '../../../shared/utils/formatCurrency'
import { getBarcodeMarkup } from '../components/barcodeRender'

export const MIN_LABEL_COPIES = 1
export const MAX_LABEL_COPIES = 50

/**
 * Clamps any user input to the supported copy range (falls back to 1).
 * @param {*} n
 * @returns {number}
 */
export function clampCopies(n) {
  const parsed = parseInt(n, 10)
  if (!Number.isFinite(parsed)) return MIN_LABEL_COPIES
  return Math.min(MAX_LABEL_COPIES, Math.max(MIN_LABEL_COPIES, parsed))
}

/**
 * Builds the inner print HTML for a grid of barcode labels.
 *
 * @param {object} product       - { prod_name, barcode, prod_sell_price? } —
 *                                 the table-row / drawer-detail object already
 *                                 in hand; nothing new is fetched.
 * @param {number} [copies=1]    - Sticker count, clamped to MIN..MAX.
 * @param {string} [countryCode] - Business country code for price formatting;
 *                                 price line omitted when absent.
 * @returns {string} Print HTML — empty string when there is no barcode.
 */
export function buildBarcodeLabelHTML(product, copies = 1, countryCode) {
  const code = String(product?.barcode ?? '').trim()
  if (!code) return ''

  // 3-up grid ≈ 62mm-wide cells on A4 with printUtils' page margins — fits
  // common retail label sheets (e.g. 63.5 × 38mm). No size picker for v1.
  const singleLabel = `
      <div class="sb-blabel">
        ${product?.prod_name ? `<div class="sb-blabel-name">${escapeHTML(product.prod_name)}</div>` : ''}
        <div class="sb-blabel-code">${getBarcodeMarkup(code)}</div>
        ${product?.prod_sell_price != null && countryCode
          ? `<div class="sb-blabel-price">${escapeHTML(formatCurrency(product.prod_sell_price, countryCode))}</div>`
          : ''}
      </div>`

  // Class names are sb-blabel* namespaced: this <style> rides inside the
  // shared print root and must never leak onto other printed documents.
  return `
    <style>
      .sb-blabels { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4mm; }
      .sb-blabel {
        border: 1px dashed #d1d5db;
        border-radius: 5px;
        padding: 3mm 2mm;
        text-align: center;
        background: #ffffff;
        overflow: hidden;
        break-inside: avoid;
        page-break-inside: avoid;
      }
      .sb-blabel-name {
        font-size: 9pt; font-weight: 700; color: #111827;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        margin-bottom: 1mm;
      }
      .sb-blabel-code svg { max-width: 100%; height: auto; }
      .sb-blabel-price { font-size: 8pt; font-weight: 600; color: #374151; margin-top: 0.5mm; }
    </style>
    <div class="sb-blabels">
      ${singleLabel.repeat(clampCopies(copies))}
    </div>
  `
}

/**
 * One-call helper for UI entry points: builds the label sheet and fires the
 * print dialog through the shared hidden print root.
 *
 * @param {object} product
 * @param {number} [copies=1]
 * @param {string} [countryCode]
 * @returns {boolean} false (prints nothing) when the product has no barcode
 */
export function printBarcodeLabels(product, copies = 1, countryCode) {
  const html = buildBarcodeLabelHTML(product, copies, countryCode)
  if (!html) return false
  triggerPrint(html)
  return true
}
