// src/shared/utils/printUtils.js
//
// ═══════════════════════════════════════════════════════════════
// SMARTBILLR — UNIFIED PRINT FRAMEWORK
// ═══════════════════════════════════════════════════════════════
//
// WHY THIS FILE EXISTS:
//   Previously, getPrintRoot() was duplicated in SaleDetailDrawer.jsx
//   and CustomerDetailDrawer.jsx with slightly different padding values.
//   Every drawer that needed print had to re-implement the same DOM
//   injection pattern.
//
//   This file centralises the entire print system:
//     - getPrintRoot()         → the hidden print node (injected once)
//     - buildPrintHeader()     → store name, address, GSTIN, phone, email
//     - buildPrintWatermark()  → "SmartBillr" diagonal background watermark
//     - buildPrintFooter()     → "Printed from SmartBillr · Generated on …"
//     - buildPrintMetaRow()    → one labelled field row (reusable)
//     - buildPrintMetaGrid()   → 2-column grid of metadata fields
//     - buildPrintTable()      → generic table with header + rows
//     - triggerPrint()         → write HTML → window.print() → clear
//
// BROWSER PRINT RULES (CRITICAL — DO NOT CHANGE WITHOUT UNDERSTANDING):
//   1. position:fixed elements do NOT reflow at print time → blank pages
//   2. overflow:auto clips content → only viewport was printed, not full doc
//   3. CSS variables (--accent-600 etc.) do NOT resolve in print stylesheets
//      reliably across Chrome / Safari / Firefox
//   → Solution: hidden <div id="sb-print-root"> in normal document flow.
//      At print time everything else gets display:none. We write plain HTML
//      with LITERAL hex colors. The browser can always render that.
//
// WATERMARK DESIGN NOTES:
//   The .sb-watermark class is injected as part of getPrintRoot()'s <style>
//   block so it lives in the same <style> tag as all other print rules.
//   It uses:
//     - position: fixed (covers the full physical page regardless of content length)
//     - transform: rotate(-45deg) to produce the classic diagonal watermark
//     - z-index: 0 so content (z-index: 1) sits on top
//     - pointer-events: none so it never blocks clicks
//     - opacity: 0.055 — visible but never distracting
//     - font-size: 72px + letter-spacing for professional spread
//     - color: #374151 (dark gray) gives good contrast on white paper
//   The outer wrapper uses position:relative + z-index:1 so all content
//   is always rendered above the watermark layer.
//
// HOW TO USE IN A COMPONENT:
//   import { triggerPrint } from '../../../shared/utils/printUtils';
//   import useAuthStore from '../../../store/authStore';
//
//   function handlePrint() {
//     const business = useAuthStore.getState().business;
//     const html = `
//       ${buildPrintHeader(business)}
//       ${buildPrintWatermark()}
//       ... your content ...
//       ${buildPrintFooter()}
//     `;
//     triggerPrint(html);
//   }
// ═══════════════════════════════════════════════════════════════

import { formatGeneratedOn } from './formatDate';

// ── Helpers ─────────────────────────────────────────────────────────────────

// formatGeneratedOn() is defined in ./formatDate.js
// It is re-exported below so printUtils callers can import it from here too.
export { formatGeneratedOn };

// ── Core print node ──────────────────────────────────────────────────────────

/**
 * Gets or creates the dedicated hidden print node in the real document body.
 * Called lazily on first print — no changes to index.html needed.
 *
 * The style tag is injected ONCE. Subsequent calls just return the existing el.
 *
 * @page sets margins for A4. For thermal printing the margin collapses to 5mm.
 *
 * ── WATERMARK CSS ─────────────────────────────────────────────────────────
 * .sb-watermark is defined here (not in index.css) so it lives alongside all
 * other print-only rules in a single <style> block that is injected lazily.
 *
 * Design decisions:
 *   position: fixed   → covers the FULL physical page, even on multi-page docs
 *   top/left 50%      → centres the element relative to the page
 *   transform:        → translate(-50%,-50%) centres it, rotate(-45deg) tilts it
 *   z-index: 0        → watermark sits BELOW all content (content is z-index:1)
 *   opacity: 0.055    → subtle — visible in print preview but never distracting
 *   font-size: 72px   → large enough to fill the page width diagonally
 *   letter-spacing    → spreads letters for a professional watermark look
 *   pointer-events: none → never blocks interaction
 *   white-space: nowrap  → prevents the word from wrapping mid-print
 */
export function getPrintRoot() {
  let el = document.getElementById('sb-print-root');
  if (!el) {
    el = document.createElement('div');
    el.id = 'sb-print-root';

    const style = document.createElement('style');
    style.textContent = `
      #sb-print-root { display: none; }

      @media print {
        /* ── Hide everything on the page except our print node ── */
        body > *:not(#sb-print-root) { display: none !important; }

        /* ── Print root base styles ── */
        #sb-print-root {
          display: block !important;
          font-family: 'Plus Jakarta Sans', -apple-system, Arial, sans-serif;
          color: #111827;
          background: #ffffff;
          padding: 0;
          margin: 0;
          width: 100%;
        }

        /* ── Page margins — compact default that works on all sizes ── */
        @page {
          size: auto;
          margin: 8mm 6mm;
        }

        /* ── Page break helpers — apply class="sb-page-break" in HTML ── */
        .sb-page-break { page-break-before: always; }
        .sb-no-break   { page-break-inside: avoid; }

        /* ── Responsive table layout ── */
        table { width: 100%; border-collapse: collapse; }
        th, td { word-break: break-word; overflow-wrap: break-word; }
        thead { display: table-header-group; }
        tfoot { display: table-footer-group; }
        tr    { page-break-inside: avoid; }

        /* ── WATERMARK ────────────────────────────────────────────────────
         *
         * position: fixed   → Covers the full physical page area.
         *                     'fixed' at print time means relative to the
         *                     page box, not the viewport — this is what makes
         *                     it appear on EVERY page of a multi-page print.
         *
         * top/left: 50%     → Start at the centre of the page.
         * transform         → translate(-50%,-50%) recentres the element's
         *                     own bounding box, then rotate(-45deg) produces
         *                     the classic diagonal watermark angle.
         *
         * font-size: 72px   → Sized so "SmartBillr" spans most of an A4 page
         *                     diagonally without getting clipped.
         *
         * letter-spacing    → Spreads letters apart — standard watermark look.
         *
         * opacity: 0.055    → Very subtle. Visible in print preview but never
         *                     interferes with content readability.
         *                     Range 0.04–0.08 is the professional sweet spot.
         *
         * color: #374151    → Dark gray (not black). Black at low opacity can
         *                     print as faint gray on cheap printers; dark gray
         *                     at 0.055 renders more consistently.
         *
         * z-index: 0        → Below content (content wrapper is z-index: 1).
         *
         * pointer-events: none → Watermark never intercepts clicks in preview.
         *
         * white-space: nowrap  → Never wrap "SmartBillr" onto two lines.
         * ──────────────────────────────────────────────────────────────────*/
        .sb-watermark {
          position: fixed;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%) rotate(-45deg);
          font-family: 'Plus Jakarta Sans', -apple-system, Arial, sans-serif;
          font-size: clamp(28px, 6vw, 80px);
          font-weight: 900;
          letter-spacing: 0.15em;
          color: #374151;
          opacity: 0.055;
          z-index: 0;
          pointer-events: none;
          white-space: nowrap;
          user-select: none;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
      }
    `;
    document.head.appendChild(style);
    document.body.appendChild(el);
  }
  return el;
}

// ── Print building blocks ────────────────────────────────────────────────────

/**
 * Builds the store header section.
 * Reads from the business object stored in Zustand (authStore.business).
 * Falls back gracefully if any field is missing.
 *
 * @param {object} business  - authStore.getState().business
 * @returns {string}         - HTML string
 */
export function buildPrintHeader(business = {}) {
  const name    = business?.business_name    || 'SmartBillr Business';
  const address = business?.business_address || '';
  const state   = business?.business_state   || '';
  const gstin   = business?.gstin            || '';
  const phone   = business?.business_phone   || '';
  const email   = business?.business_email   || '';

  const addressLine = [address, state].filter(Boolean).join(', ');

  return `
    <div style="
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      align-items: flex-start;
      gap: 10px;
      padding-bottom: 14px;
      border-bottom: 2.5px solid #111827;
      margin-bottom: 18px;
    ">
      <!-- Left: Store name + address -->
      <div style="flex: 1 1 55%; min-width: 200px;">
        <div style="font-size: 20px; font-weight: 800; color: #111827; letter-spacing: -0.5px; line-height: 1.1;">
          ${name}
        </div>
        ${addressLine ? `<div style="font-size: 11px; color: #6b7280; margin-top: 3px;">${addressLine}</div>` : ''}
        ${phone ? `<div style="font-size: 11px; color: #6b7280; margin-top: 1px;">📞 ${phone}</div>` : ''}
        ${email ? `<div style="font-size: 11px; color: #6b7280; margin-top: 1px;">✉ ${email}</div>` : ''}
      </div>

      <!-- Right: GSTIN + Generated On -->
      <div style="text-align: right; flex: 0 1 auto;">
        ${gstin ? `
          <div style="font-size: 10px; font-weight: 700; color: #6b7280; text-transform: uppercase; letter-spacing: 0.07em;">GSTIN</div>
          <div style="font-size: 12px; font-weight: 700; color: #111827; font-family: monospace; letter-spacing: 0.05em;">${gstin}</div>
        ` : ''}
        <div style="margin-top: ${gstin ? '8px' : '0'};">
          <div style="font-size: 9px; font-weight: 600; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.06em;">Generated On</div>
          <div style="font-size: 10.5px; color: #374151; font-weight: 500; margin-top: 2px;">${formatGeneratedOn()}</div>
        </div>
      </div>
    </div>
  `;
}

/**
 * Builds the "SmartBillr" diagonal background watermark.
 *
 * Returns a single <div class="sb-watermark"> element.
 * The actual styling for .sb-watermark lives in getPrintRoot()'s <style>
 * block (injected into <head> once, on first print).
 *
 * IMPORTANT: triggerPrint() wraps the entire HTML in a
 *   <div style="position: relative; z-index: 1; ...">
 * so content always renders ABOVE the watermark (z-index: 0).
 *
 * Call this BEFORE buildPrintHeader() in your HTML string so the watermark
 * div is first in the DOM — it renders behind everything due to z-index.
 */
export function buildPrintWatermark() {
  return `<div class="sb-watermark">SmartBillr</div>`;
}

/**
 * Builds the print footer.
 * Shows "Printed from SmartBillr" + generation timestamp.
 * Note: "Page x of y" is handled by the @page CSS rule in supported browsers.
 *
 * @param {string} [extra] - Optional extra text shown on the right side.
 */
export function buildPrintFooter(extra = '') {
  return `
    <div style="
      margin-top: 40px;
      padding-top: 14px;
      border-top: 1px solid #e5e7eb;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 10.5px;
      color: #9ca3af;
    ">
      <span>Printed from <strong style="color: #6b7280;">SmartBillr</strong></span>
      <span>${extra || formatGeneratedOn()}</span>
    </div>
  `;
}

/**
 * Builds a single metadata row: label on left, value on right.
 * Used inside a metadata section block.
 *
 * @param {string} label
 * @param {string} value
 * @param {boolean} isLast  - If true, removes the bottom border.
 */
export function buildPrintMetaRow(label, value, isLast = false) {
  return `
    <div style="
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      padding: 6px 0;
      ${isLast ? '' : 'border-bottom: 1px solid #f3f4f6;'}
    ">
      <span style="font-size: 11.5px; color: #6b7280; font-weight: 500;">${label}</span>
      <span style="font-size: 12.5px; color: #111827; font-weight: 600; text-align: right; max-width: 60%;">${value || '—'}</span>
    </div>
  `;
}

/**
 * Builds a 2-column metadata grid.
 * Each item: { label: string, value: string }
 *
 * @param {Array<{label: string, value: string}>} fields
 * @param {number} [columns=2]
 */
export function buildPrintMetaGrid(fields, columns = 2) {
  const cells = fields.map(f => `
    <div>
      <div style="font-size: 10px; font-weight: 700; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.07em; margin-bottom: 3px;">
        ${f.label}
      </div>
      <div style="font-size: 12.5px; color: #111827; font-weight: 600; word-break: break-word;">
        ${f.value || '—'}
      </div>
    </div>
  `).join('');

  return `
    <div style="
      display: grid;
      grid-template-columns: repeat(${columns}, 1fr);
      gap: 16px 24px;
      margin-bottom: 22px;
      padding: 16px;
      background: #f9fafb;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
    ">
      ${cells}
    </div>
  `;
}

/**
 * Builds a section heading for print layouts.
 *
 * @param {string} title
 */
export function buildPrintSectionTitle(title) {
  return `
    <div style="
      font-size: 10px;
      font-weight: 800;
      color: #9ca3af;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      margin: 24px 0 10px;
      padding-bottom: 6px;
      border-bottom: 1px solid #e5e7eb;
    ">
      ${title}
    </div>
  `;
}

/**
 * Builds a generic print table.
 *
 * @param {Array<{label: string, key: string, align?: string, format?: fn}>} columns
 * @param {Array<object>} rows
 * @param {string} [emptyMessage]
 */
export function buildPrintTable(columns, rows, emptyMessage = 'No records found.') {
  if (!rows || rows.length === 0) {
    return `<p style="font-size: 12.5px; color: #9ca3af; padding: 16px 0;">${emptyMessage}</p>`;
  }

  const headerCells = columns.map(col => `
    <th style="
      text-align: ${col.align || 'left'};
      padding: 5px 5px;
      font-size: 9px;
      font-weight: 700;
      color: #374151;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      border-bottom: 2px solid #e5e7eb;
      white-space: normal;
    ">${col.label}</th>
  `).join('');

  const dataRows = rows.map((row, i) => {
    const cells = columns.map(col => {
      const raw = row[col.key];
      const val = col.format ? col.format(raw, row) : (raw ?? '—');
      return `
        <td style="
          text-align: ${col.align || 'left'};
          padding: 4px 5px;
          font-size: 10.5px;
          color: #111827;
          border-bottom: 1px solid #f3f4f6;
        ">${val}</td>
      `;
    }).join('');

    return `
      <tr style="background: ${i % 2 === 0 ? '#ffffff' : '#f9fafb'};">
        ${cells}
      </tr>
    `;
  }).join('');

  return `
    <table style="width: 100%; border-collapse: collapse; margin-bottom: 16px;">
      <thead>
        <tr>${headerCells}</tr>
      </thead>
      <tbody>${dataRows}</tbody>
    </table>
  `;
}

// ── Main trigger function ────────────────────────────────────────────────────

/**
 * Writes HTML into the print root and fires window.print().
 * Clears the node after printing so it stays invisible.
 *
 * The inner wrapper uses position:relative + z-index:1 so all printed
 * content sits ABOVE the .sb-watermark layer (which is z-index:0 / fixed).
 *
 * @param {string} html  - Full inner HTML to print (use the builders above)
 */
export function triggerPrint(html) {
  const printRoot = getPrintRoot();

  // The outer div is position:relative so the watermark (position:fixed, z-index:0)
  // is layered behind, and all content (z-index:1) floats above it.
  printRoot.innerHTML = `
    <div style="position: relative; z-index: 1; width: 100%; box-sizing: border-box;">
      ${html}
    </div>
  `;

  // Small delay: ensures DOM paint before the print dialog opens
  setTimeout(() => {
    window.print();
    // Clear after printing so the div goes back to display:none
    setTimeout(() => {
      printRoot.innerHTML = '';
    }, 500);
  }, 100);
}