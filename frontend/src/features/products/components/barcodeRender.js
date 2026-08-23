// src/features/products/components/barcodeRender.js
//
// Dependency-isolated barcode rendering helper.
// The ONLY file in the app that knows about JsBarcode — swapping libraries
// later means reimplementing these four exports; no component imports
// JsBarcode directly.
//
// FORMAT DECISION:
//   generateEAN13() (productFormShared.js) stores 12 random digits + a valid
//   check digit, so values matching /^\d{13}$/ WITH a verifying EAN-13
//   checksum render in retail-standard "EAN13" format. Anything else (a typed
//   or scanned arbitrary code — the field allows free text up to 100 chars
//   per productSchemas.js) falls back to "CODE128", which accepts any
//   printable ASCII.
//
// CONSUMERS:
//   - BarcodePreview.jsx         → renderBarcode() into a live <svg> ref
//   - utils/barcodeLabelPrint.js → getBarcodeMarkup() → SVG string for print HTML

import JsBarcode from 'jsbarcode'

// Defaults tuned for retail stickers at 96dpi print scaling: ~190px wide
// (≈50mm — fits a 3-up A4 label grid cell), digits under the bars.
const DEFAULT_OPTIONS = {
  width: 2,            // bar module width (px)
  height: 48,          // bar height (px), excludes the digit line
  displayValue: true,  // human-readable digits under the bars (retail convention)
  fontOptions: 'bold',
  fontSize: 14,
  textMargin: 2,
  margin: 2,
  lineColor: '#000000',
  background: '#ffffff',
}

/**
 * Picks the JsBarcode format for a value:
 * 'EAN13' when exactly 13 digits AND the check digit verifies,
 * otherwise 'CODE128'.
 *
 * Check-digit math mirrors generateEAN13(): positions 1–12 weighted
 * alternately 1 / 3 starting at 1.
 *
 * @param {*} value
 * @returns {'EAN13'|'CODE128'}
 */
export function resolveBarcodeFormat(value) {
  const v = String(value ?? '').trim()
  if (/^\d{13}$/.test(v)) {
    const sum = v
      .slice(0, 12)
      .split('')
      .reduce((acc, d, i) => acc + Number(d) * (i % 2 === 0 ? 1 : 3), 0)
    if ((10 - (sum % 10)) % 10 === Number(v[12])) return 'EAN13'
  }
  return 'CODE128'
}

/**
 * True when the value is renderable at all — non-empty printable ASCII,
 * the widest set CODE128 accepts. Empty / whitespace-only / control
 * characters fail; callers use this to hide previews and disable print.
 *
 * @param {*} value
 * @returns {boolean}
 */
export function isRenderableBarcode(value) {
  const v = String(value ?? '').trim()
  return /^[\x20-\x7E]+$/.test(v)
}

/**
 * Renders a barcode into an existing DOM node (an <svg> element), replacing
 * whatever it previously contained. Safe to call repeatedly on the same node
 * for live previews.
 *
 * @param {SVGElement} targetNode
 * @param {*} value
 * @param {object} [options] - JsBarcode option overrides
 * @returns {boolean} true when rendered
 */
export function renderBarcode(targetNode, value, options = {}) {
  if (!targetNode || !isRenderableBarcode(value)) return false
  const v = String(value).trim()
  try {
    JsBarcode(targetNode, v, { ...DEFAULT_OPTIONS, ...options, format: resolveBarcodeFormat(v) })
    return true
  } catch {
    targetNode.innerHTML = ''
    return false
  }
}

/**
 * Renders a barcode into a detached <svg> and returns its markup string —
 * used to embed the graphic into the static print HTML built by
 * utils/barcodeLabelPrint.js. Returns '' when the value is unrenderable.
 *
 * @param {*} value
 * @param {object} [options] - JsBarcode option overrides
 * @returns {string}
 */
export function getBarcodeMarkup(value, options = {}) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  return renderBarcode(svg, value, options) ? svg.outerHTML : ''
}
