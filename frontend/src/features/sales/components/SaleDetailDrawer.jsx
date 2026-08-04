// src/features/sales/components/SaleDetailDrawer.jsx
//
// MRP FEATURE CHANGES (this session):
//   1. buildInvoiceHTML — item table now has MRP + Discount columns when any
//      item has item_mrp set. A "Total Savings" row is added to the totals block.
//   2. Line Items section in the drawer — each item now shows MRP + "You save"
//      when item_mrp > sale_item_unit_price.
//   3. Summary section — "Total Savings" row added when savings > 0.
//   All other logic, layout, and styling is UNCHANGED.

import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  XMarkIcon,
  DocumentTextIcon,
  UserIcon,
  CalendarDaysIcon,
  CreditCardIcon,
  BanknotesIcon,
  PrinterIcon,
} from '@heroicons/react/24/outline';
import { fetchSale } from '../api/salesApi';
import { Badge, Button, Input } from '../../../shared/components';
import { selectStyle } from '../../../shared/components/FormField';
import { formatCurrency } from '../../../shared/utils/formatCurrency';
import { formatDate, formatDateTime } from '../../../shared/utils/formatDate';
import {
  buildPrintHeader,
  buildPrintWatermark,
  buildPrintFooter,
  escapeHTML,
  triggerPrint,
} from '../../../shared/utils/printUtils';
import { usePermissions } from '../../../shared/hooks/usePermissions';
import { detectTaxType, getTaxLabel } from '../../../shared/utils/formatTax';
import DrawerPortal from '../../../shared/components/DrawerPortal';
import CreateSalesReturnDrawer from '../../salesReturns/components/CreateSalesReturnDrawer';
import { useSalesReturnsBySale } from '../../salesReturns/hooks/useSalesReturns';
import { fetchPaymentsBySale } from '../../payments/api/paymentsApi';
import useAuthStore from '../../../store/authStore';

// ── Payment status badge helper (for print — literal hex, no CSS vars) ────────
function paymentStatusBadge(status) {
  const map = {
    paid:    { color: '#10B981', bg: '#D1FAE5', label: 'Fully Paid' },
    partial: { color: '#F59E0B', bg: '#FEF3C7', label: 'Partially Paid' },
    pending: { color: '#EF4444', bg: '#FEE2E2', label: 'Unpaid' },
  };
  const s = map[status] || { color: '#6b7280', bg: '#f3f4f6', label: status || '—' };
  return `<span style="font-size:11px;font-weight:700;color:${s.color};background:${s.bg};padding:3px 10px;border-radius:20px;letter-spacing:0.03em;">${s.label}</span>`;
}

// ── MRP FEATURE: compute total savings across all items ───────────────────────
// Returns the sum of (item_mrp - unit_price) × qty for items where item_mrp > unit_price.
// Returns 0 when no items have MRP set (backward-compatible).
function computeTotalSavings(items) {
  return items.reduce((acc, item) => {
    const mrp   = Number(item.item_mrp);
    const price = Number(item.sale_item_unit_price);
    const qty   = Number(item.sale_item_quantity);
    if (mrp > 0 && mrp > price) {
      acc += (mrp - price) * qty;
    }
    return acc;
  }, 0);
}

// ── MRP FEATURE: check if any item in the invoice has an MRP set ─────────────
function anyItemHasMRP(items) {
  return items.some(i => i.item_mrp != null && Number(i.item_mrp) > 0);
}

// ─────────────────────────────────────────────────────────────────────────────
// buildInvoiceHTML — print template
// MRP FEATURE changes:
//   • When any item has item_mrp, table gets extra columns: MRP | Discount
//   • Each item row shows MRP and per-line discount amount (or '—' if no MRP)
//   • Totals block gets a "You Saved" row in green when savings > 0
// ─────────────────────────────────────────────────────────────────────────────
// FIX: added `discount` parameter so the totals block can show the
// discount row and users can reconcile Subtotal → Discount → Tax → Grand Total.
function buildInvoiceHTML(
  business, detail, sale, items,
  cgst, sgst, igst, subtotal, taxTotal, discount, finalAmount, totalPaid, remaining
) {
  // FIX: Derive `country` and `isGstRegistered` from the `business` parameter
  // so formatCurrency/getTaxLabel work inside this top-level function.
  const country   = business?.business_country_code || 'IN';
  const isGstRegistered = business?.is_gst_registered || false;
  const payStatus = detail?.sales_payment_status || sale.sales_payment_status || 'pending';
  const payMethod = escapeHTML((detail?.sales_payment_method || sale.sales_payment_method || '—')
    .replace(/_/g, ' ').toUpperCase());
  const invNo     = escapeHTML(sale.invoice_no || '');
  const custName  = escapeHTML(detail?.customer_name || sale.customer_name || 'Walk-in Customer');

  // MRP FEATURE: decide whether to show the MRP/Discount columns
  const showMRP       = anyItemHasMRP(items);
  const totalSavings  = computeTotalSavings(items);

  const taxType = detectTaxType(detail);
  const gstBreakdown = (() => {
    if (taxType === 'cgst_sgst' && (cgst > 0 || sgst > 0)) {
      return `
        <tr><td style="padding:4px 0;color:#6b7280;font-size:10.5px;">CGST</td><td style="padding:4px 0;text-align:right;font-size:10.5px;">${formatCurrency(cgst, country)}</td></tr>
        <tr><td style="padding:4px 0;color:#6b7280;font-size:10.5px;">SGST</td><td style="padding:4px 0;text-align:right;font-size:10.5px;">${formatCurrency(sgst, country)}</td></tr>
      `;
    }
    if (taxType === 'igst' && igst > 0) {
      return `
        <tr><td style="padding:4px 0;color:#6b7280;font-size:10.5px;">IGST</td><td style="padding:4px 0;text-align:right;font-size:10.5px;">${formatCurrency(igst, country)}</td></tr>
      `;
    }
    if (taxType === 'generic' && taxTotal > 0) {
      return `
        <tr><td style="padding:4px 0;color:#6b7280;font-size:10.5px;">${getTaxLabel(country, isGstRegistered)}</td><td style="padding:4px 0;text-align:right;font-size:10.5px;">${formatCurrency(taxTotal, country)}</td></tr>
      `;
    }
    return '';
  })();

  // MRP FEATURE: build item rows with optional MRP + Discount columns
  const itemRows = items.map((item, i) => {
    const mrpVal      = item.item_mrp != null ? Number(item.item_mrp) : null;
    const unitPrice   = Number(item.sale_item_unit_price);
    const qty         = Number(item.sale_item_quantity);
    const discAmt     = (mrpVal != null && mrpVal > unitPrice)
                          ? (mrpVal - unitPrice) * qty
                          : null;
    const mrpCell     = showMRP
      ? `<td style="padding:5px 5px;text-align:right;font-size:9.5px;color:#9ca3af;text-decoration:line-through;white-space:nowrap;">${mrpVal != null ? formatCurrency(mrpVal, country) : '—'}</td>`
      : '';
    const discCell    = showMRP
      ? `<td style="padding:5px 5px;text-align:right;font-size:9.5px;color:#059669;font-weight:600;white-space:nowrap;">${discAmt != null ? `−${formatCurrency(discAmt, country)}` : '—'}</td>`
      : '';

    return `
      <tr style="background:${i % 2 === 0 ? '#fff' : '#f9fafb'};page-break-inside:avoid;">
        <td style="padding:5px 5px;font-size:10.5px;color:#111827;word-break:break-word;">${escapeHTML(item.product_name || 'Product')}</td>
        <td style="padding:5px 5px;text-align:center;font-size:10px;color:#374151;white-space:nowrap;">${qty}</td>
        ${mrpCell}
        <td style="padding:5px 5px;text-align:right;font-size:10px;color:#374151;white-space:nowrap;">${formatCurrency(unitPrice, country)}</td>
        <td style="padding:5px 5px;text-align:right;font-size:10px;color:#374151;white-space:nowrap;">${Number(item.item_tax_total) > 0 ? formatCurrency(item.item_tax_total, country) : '—'}</td>
        ${discCell}
        <td style="padding:5px 5px;text-align:right;font-size:10.5px;font-weight:700;color:#111827;white-space:nowrap;">${formatCurrency(item.item_total_with_tax, country)}</td>
      </tr>
    `;
  }).join('');

  // MRP FEATURE: table header changes when MRP columns are shown
  const tableHeader = showMRP ? `
    <tr style="border-bottom:2px solid #111827;background:#f9fafb;">
      <th style="text-align:left;padding:5px 5px;font-size:9px;font-weight:800;color:#374151;text-transform:uppercase;letter-spacing:0.05em;">Item</th>
      <th style="text-align:center;padding:5px 5px;font-size:9px;font-weight:800;color:#374151;text-transform:uppercase;letter-spacing:0.05em;">Qty</th>
      <th style="text-align:right;padding:5px 5px;font-size:9px;font-weight:800;color:#374151;text-transform:uppercase;letter-spacing:0.05em;">MRP</th>
      <th style="text-align:right;padding:5px 5px;font-size:9px;font-weight:800;color:#374151;text-transform:uppercase;letter-spacing:0.05em;">Rate</th>
      <th style="text-align:right;padding:5px 5px;font-size:9px;font-weight:800;color:#374151;text-transform:uppercase;letter-spacing:0.05em;">${getTaxLabel(country, isGstRegistered)}</th>
      <th style="text-align:right;padding:5px 5px;font-size:9px;font-weight:800;color:#059669;text-transform:uppercase;letter-spacing:0.05em;">Discount</th>
      <th style="text-align:right;padding:5px 5px;font-size:9px;font-weight:800;color:#374151;text-transform:uppercase;letter-spacing:0.05em;">Total</th>
    </tr>
  ` : `
    <tr style="border-bottom:2px solid #111827;background:#f9fafb;">
      <th style="text-align:left;padding:5px 5px;font-size:9px;font-weight:800;color:#374151;text-transform:uppercase;letter-spacing:0.05em;">Item</th>
      <th style="text-align:center;padding:5px 5px;font-size:9px;font-weight:800;color:#374151;text-transform:uppercase;letter-spacing:0.05em;">Qty</th>
      <th style="text-align:right;padding:5px 5px;font-size:9px;font-weight:800;color:#374151;text-transform:uppercase;letter-spacing:0.05em;">Rate</th>
      <th style="text-align:right;padding:5px 5px;font-size:9px;font-weight:800;color:#374151;text-transform:uppercase;letter-spacing:0.05em;">${getTaxLabel(country, isGstRegistered)}</th>
      <th style="text-align:right;padding:5px 5px;font-size:9px;font-weight:800;color:#374151;text-transform:uppercase;letter-spacing:0.05em;">Total</th>
    </tr>
  `;

  // MRP FEATURE: "You Saved" banner — only when savings > 0
  const savingsBanner = (showMRP && totalSavings > 0) ? `
    <div style="background:#D1FAE5;border:1px solid #6EE7B7;border-radius:6px;padding:7px 12px;margin-bottom:18px;display:flex;justify-content:space-between;align-items:center;">
      <span style="font-size:11px;font-weight:700;color:#065F46;">🎉 Customer Saved</span>
      <span style="font-size:12px;font-weight:900;color:#059669;">${formatCurrency(totalSavings, country)}</span>
    </div>
  ` : '';

  return `
    ${buildPrintWatermark()}
    ${buildPrintHeader(business)}

    <!-- Invoice title row -->
    <div style="display:flex;flex-wrap:wrap;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:16px;">
      <div>
        <div style="font-size:24px;font-weight:900;color:#111827;letter-spacing:-1px;line-height:1;">INVOICE</div>
        <div style="font-size:14px;font-weight:700;color:#4F46E5;margin-top:4px;letter-spacing:0.02em;">${invNo}</div>
      </div>
      <div style="text-align:right;">
        <div style="font-size:9px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:0.07em;margin-bottom:2px;">Invoice Date</div>
        <div style="font-size:12px;font-weight:600;color:#111827;">${formatDate(detail?.sales_created_at || sale.sales_created_at)}</div>
        <div style="margin-top:8px;font-size:9px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:0.07em;margin-bottom:3px;">Payment Status</div>
        ${paymentStatusBadge(payStatus)}
        <div style="margin-top:6px;font-size:9px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:0.07em;margin-bottom:2px;">Payment Method</div>
        <div style="font-size:11px;font-weight:600;color:#374151;">${payMethod}</div>
      </div>
    </div>

    <!-- Bill To -->
    <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;padding:10px 14px;margin-bottom:16px;">
      <div style="font-size:9px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:4px;">Bill To</div>
      <div style="font-size:14px;font-weight:700;color:#111827;">${custName}</div>
    </div>

    <!-- Items table -->
    <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
      <thead>${tableHeader}</thead>
      <tbody>${itemRows}</tbody>
    </table>

    <!-- MRP FEATURE: "You Saved" banner above totals block -->
    ${savingsBanner}

    <!-- Totals block -->
    <div style="display:flex;justify-content:flex-end;margin-bottom:20px;">
      <table style="width:auto;min-width:180px;max-width:100%;">
        <tr><td style="padding:4px 0;color:#6b7280;font-size:10.5px;">Subtotal</td><td style="padding:4px 0;text-align:right;font-size:10.5px;">${formatCurrency(subtotal, country)}</td></tr>
        ${discount > 0 ? `<tr><td style="padding:4px 0;color:#059669;font-size:10.5px;">Discount</td><td style="padding:4px 0;text-align:right;font-size:10.5px;color:#059669;">−${formatCurrency(discount, country)}</td></tr>` : ''}
        ${gstBreakdown}
        <tr><td style="padding:4px 0;color:#6b7280;font-size:10.5px;">${getTaxLabel(country, isGstRegistered)} Total</td><td style="padding:4px 0;text-align:right;font-size:10.5px;">${formatCurrency(taxTotal, country)}</td></tr>
        <tr style="border-top:2px solid #111827;">
          <td style="padding:8px 0 4px;font-size:14px;font-weight:900;color:#111827;">Grand Total</td>
          <td style="padding:8px 0 4px;text-align:right;font-size:14px;font-weight:900;color:#111827;">${formatCurrency(finalAmount, country)}</td>
        </tr>
        ${totalPaid > 0 ? `<tr><td style="padding:3px 0;color:#10B981;font-size:10.5px;font-weight:600;">Amount Paid</td><td style="padding:3px 0;text-align:right;font-size:10.5px;color:#10B981;font-weight:600;">${formatCurrency(totalPaid, country)}</td></tr>` : ''}
        ${remaining > 0 ? `<tr><td style="padding:3px 0;color:#EF4444;font-size:11px;font-weight:700;">Balance Due</td><td style="padding:3px 0;text-align:right;font-size:11px;color:#EF4444;font-weight:700;">${formatCurrency(remaining, country)}</td></tr>` : ''}
        ${(showMRP && totalSavings > 0) ? `<tr><td style="padding:5px 0 0;color:#059669;font-size:10.5px;font-weight:700;">You Saved</td><td style="padding:5px 0 0;text-align:right;font-size:10.5px;color:#059669;font-weight:700;">${formatCurrency(totalSavings, country)}</td></tr>` : ''}
      </table>
    </div>

    <!-- Thank you note -->
    <div style="text-align:center;padding:10px;background:#f9fafb;border-radius:6px;font-size:11px;color:#6b7280;font-style:italic;margin-bottom:6px;">
      Thank you for your business!
    </div>

    ${buildPrintFooter()}
  `;
}

export default function SaleDetailDrawer({ sale, onClose, statusMutation }) {
  const [editingStatus, setEditingStatus] = useState(false);
  const [newStatus,     setNewStatus]     = useState(sale?.sales_payment_status || 'paid');
  const [partialAmount, setPartialAmount] = useState('');
  const [partialError,  setPartialError]  = useState('');
  const [printHovered,  setPrintHovered]  = useState(false);
  const [showReturnDrawer, setShowReturnDrawer] = useState(false);
  const business  = useAuthStore(s => s.business);
  const country   = business?.business_country_code || 'IN';
  const isGstRegistered = business?.is_gst_registered || false;
  const { can } = usePermissions();

  const { data: detail, isLoading, isError } = useQuery({
    queryKey: ['sale', sale?.sales_id],
    queryFn:  () => fetchSale(sale.sales_id),
    enabled:  !!sale?.sales_id,
    staleTime: 2 * 60 * 1000,
  });

  const { data: paymentsData } = useQuery({
    queryKey: ['payments', 'sale', sale?.sales_id],
    queryFn:  () => fetchPaymentsBySale(sale.sales_id),
    enabled:  !!sale?.sales_id && can('payments.manage'),
    staleTime: 2 * 60 * 1000,
  });

  const { data: returnsData } = useSalesReturnsBySale(sale?.sales_id);

  const paymentHistory = paymentsData?.payment_history ?? [];

  // Auto-print after create
  useEffect(() => {
    if (!isLoading && !isError && detail && sale?._autoPrint) {
      const timer = setTimeout(() => handlePrint(), 350);
      return () => clearTimeout(timer);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, isError, detail, sale?._autoPrint]);

  const displayStatus = detail?.sales_payment_status ?? sale?.sales_payment_status ?? 'pending';

  if (!sale) return null;

  const subtotal    = detail?.sales_total_amount  ?? sale.sales_total_amount ?? 0;
  const finalAmount = detail?.sales_final_amount   ?? sale.sales_final_amount ?? 0;
  const totalPaid   = detail?.total_paid           ?? 0;
  const remaining   = detail?.remaining_balance    ?? 0;
  const cgst        = Number(detail?.cgst_total    ?? 0);
  const sgst        = Number(detail?.sgst_total    ?? 0);
  const igst        = Number(detail?.igst_total    ?? 0);
  // FIX: For Indian businesses the trigger stores tax in cgst/sgst/igst columns,
  // leaving tax_total = 0.  Always derive the display value from all four
  // columns so the Summary section and invoice print show the correct total.
  const rawTaxTotal = Number(detail?.tax_total ?? sale.tax_total ?? 0);
  const taxTotal    = (cgst + sgst + igst) > 0 ? (cgst + sgst + igst) : rawTaxTotal;
  const discount    = Number(detail?.sales_discount ?? 0);
  const items       = detail?.items                ?? [];

  // MRP FEATURE: compute total savings for the Summary section
  const totalSavings = computeTotalSavings(items);

  function handlePrint() {
    if (!detail && !sale) return;
    const business = useAuthStore.getState().business;
    const html = buildInvoiceHTML(
      business, detail, sale, items, cgst, sgst, igst,
      subtotal, taxTotal, discount, finalAmount, totalPaid, remaining
    );
    triggerPrint(html);
  }

  function handleStatusSave() {
    setPartialError('');

    if (newStatus === 'partial') {
      const amt = parseFloat(partialAmount);
      if (isNaN(amt) || amt <= 0) {
        setPartialError('Amount received must be greater than zero');
        return;
      }
      const outstanding = detail?.remaining_balance ?? remaining;
      if (amt > outstanding) {
        setPartialError(
          `Amount received (${formatCurrency(amt, country)}) exceeds outstanding balance (${formatCurrency(outstanding, country)})`
        );
        return;
      }
    }

    const paidAmount = newStatus === 'partial' ? parseFloat(partialAmount) : undefined;

    statusMutation.mutate(
      { id: sale.sales_id, status: newStatus, paid_amount: paidAmount },
      {
        onSuccess: () => {
          setEditingStatus(false);
          setPartialAmount('');
          setPartialError('');
        },
      }
    );
  }

  // DRAWER VIEWPORT FIX — see DrawerPortal.jsx: mount at document.body so
  // position:fixed anchors to the viewport, not the .fade-up wrapper.
  return (
    <DrawerPortal>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.35)',
          zIndex: 1000, backdropFilter: 'blur(3px)',
          animation: 'fadeIn 0.18s ease',
        }}
      />

      {/* Drawer panel */}
      <div
        style={{
          position: 'fixed', top: 0, right: 0,
          height: '100vh', width: 520, maxWidth: '95vw',
          background: 'var(--bg-card)',
          borderLeft: '1px solid var(--border)',
          boxShadow: '-8px 0 40px rgba(0,0,0,0.14)',
          zIndex: 1001,
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
          animation: 'drawer-slide-in 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '22px 24px',
          borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'flex-start',
          justifyContent: 'space-between', gap: 16,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{
              width: 48, height: 48, borderRadius: 14, flexShrink: 0,
              background: 'linear-gradient(135deg, var(--accent-600), var(--accent-500))',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <DocumentTextIcon style={{ width: 24, height: 24, color: '#fff' }} />
            </div>
            <div>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', margin: 0, lineHeight: 1.3 }}>
                {sale.invoice_no || 'Invoice'}
              </h2>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '3px 0 0' }}>
                Sales Invoice
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            {can('sales_returns.manage') && (
              <button
                onClick={() => setShowReturnDrawer(true)}
                disabled={isLoading}
                title="Process Return"
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  background: 'var(--bg-page)',
                  border: '1px solid var(--border)',
                  cursor: isLoading ? 'not-allowed' : 'pointer',
                  padding: '6px 12px', borderRadius: 8,
                  color: isLoading ? 'var(--text-muted)' : 'var(--text-secondary)',
                  fontSize: 13, fontWeight: 600,
                  fontFamily: 'inherit',
                  opacity: isLoading ? 0.5 : 1,
                  transition: 'all 0.13s',
                }}
              >
                Process Return
              </button>
            )}
            <button
              onClick={handlePrint}
              disabled={isLoading || !!isError}
              title="Print Invoice"
              onMouseEnter={() => !isLoading && !isError && setPrintHovered(true)}
              onMouseLeave={() => setPrintHovered(false)}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                background: printHovered ? 'var(--bg-hover)' : 'var(--bg-page)',
                border: `1px solid ${printHovered ? 'var(--border-hover)' : 'var(--border)'}`,
                cursor: isLoading || isError ? 'not-allowed' : 'pointer',
                padding: '6px 12px', borderRadius: 8,
                color: isLoading || isError ? 'var(--text-muted)' : 'var(--text-secondary)',
                fontSize: 13, fontWeight: 600,
                fontFamily: 'inherit',
                opacity: isLoading || isError ? 0.5 : 1,
                transition: 'all 0.13s',
              }}
            >
              <PrinterIcon style={{ width: 15, height: 15 }} />
              Print
            </button>
            <button
              onClick={onClose}
              style={{
                background: 'var(--bg-page)', border: '1px solid var(--border)',
                cursor: 'pointer', padding: 6, borderRadius: 8,
                color: 'var(--text-muted)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <XMarkIcon style={{ width: 18, height: 18 }} />
            </button>
          </div>
        </div>

        {/* Scrollable body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
          {isLoading ? (
            <>
              {/* Invoice Details skeleton */}
              <div style={{ marginBottom: 20 }}>
                <div className="skeleton" style={{ width: '28%', height: 11, borderRadius: 6, marginBottom: 10 }} />
                <div style={{
                  background: 'var(--bg-page)',
                  border: '1px solid var(--border)',
                  borderRadius: 12, overflow: 'hidden',
                }}>
                  {[80, 65, 55, 45].map((w, i) => (
                    <div key={i} style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '10px 14px',
                      borderBottom: i < 3 ? '1px solid var(--border)' : 'none',
                    }}>
                      <div className="skeleton" style={{ width: 15, height: 15, borderRadius: 4, flexShrink: 0 }} />
                      <div className="skeleton" style={{ width: '25%', height: 12, borderRadius: 6 }} />
                      <div className="skeleton" style={{ width: `${w}px`, height: 12, borderRadius: 6, marginLeft: 'auto' }} />
                    </div>
                  ))}
                </div>
              </div>

              {/* Line Items skeleton */}
              <div style={{ marginBottom: 20 }}>
                <div className="skeleton" style={{ width: '22%', height: 11, borderRadius: 6, marginBottom: 10 }} />
                <div style={{
                  background: 'var(--bg-page)',
                  border: '1px solid var(--border)',
                  borderRadius: 12, overflow: 'hidden',
                }}>
                  {[0, 1, 2].map(i => (
                    <div key={i} style={{
                      padding: '11px 14px',
                      borderBottom: i < 2 ? '1px solid var(--border)' : 'none',
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                        <div style={{ flex: 1 }}>
                          <div className="skeleton" style={{ width: '55%', height: 13, borderRadius: 6, marginBottom: 6 }} />
                          <div className="skeleton" style={{ width: '35%', height: 11, borderRadius: 6 }} />
                        </div>
                        <div className="skeleton" style={{ width: 50, height: 13, borderRadius: 6, flexShrink: 0 }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Tax Breakdown skeleton */}
              <div style={{ marginBottom: 20 }}>
                <div className="skeleton" style={{ width: '24%', height: 11, borderRadius: 6, marginBottom: 10 }} />
                <div style={{
                  background: 'var(--bg-page)',
                  border: '1px solid var(--border)',
                  borderRadius: 12, overflow: 'hidden',
                }}>
                  {[0, 1].map(i => (
                    <div key={i} style={{
                      display: 'flex', alignItems: 'center',
                      padding: '10px 14px',
                      borderBottom: i < 1 ? '1px solid var(--border)' : 'none',
                    }}>
                      <div className="skeleton" style={{ width: '20%', height: 12, borderRadius: 6 }} />
                      <div className="skeleton" style={{ width: 60, height: 12, borderRadius: 6, marginLeft: 'auto' }} />
                    </div>
                  ))}
                </div>
              </div>

              {/* Summary skeleton */}
              <div style={{ marginBottom: 20 }}>
                <div className="skeleton" style={{ width: '18%', height: 11, borderRadius: 6, marginBottom: 10 }} />
                <div style={{
                  background: 'var(--bg-page)',
                  border: '1px solid var(--border)',
                  borderRadius: 12, overflow: 'hidden',
                }}>
                  {[0, 1, 2, 3].map(i => (
                    <div key={i} style={{
                      display: 'flex', alignItems: 'center',
                      padding: '10px 14px',
                      borderBottom: i < 3 ? '1px solid var(--border)' : 'none',
                    }}>
                      <div className="skeleton" style={{ width: '22%', height: 12, borderRadius: 6 }} />
                      <div className="skeleton" style={{ width: i === 3 ? 70 : 55, height: i === 3 ? 15 : 12, borderRadius: 6, marginLeft: 'auto' }} />
                    </div>
                  ))}
                </div>
              </div>

              {/* Payment History skeleton */}
              <div style={{ marginBottom: 20 }}>
                <div className="skeleton" style={{ width: '28%', height: 11, borderRadius: 6, marginBottom: 10 }} />
                <div style={{
                  background: 'var(--bg-page)',
                  border: '1px solid var(--border)',
                  borderRadius: 12, overflow: 'hidden',
                }}>
                  {[0, 1].map(i => (
                    <div key={i} style={{
                      display: 'flex', alignItems: 'center',
                      padding: '10px 14px',
                      borderBottom: i < 1 ? '1px solid var(--border)' : 'none',
                    }}>
                      <div className="skeleton" style={{ width: '28%', height: 12, borderRadius: 6 }} />
                      <div className="skeleton" style={{ width: 55, height: 12, borderRadius: 6, marginLeft: 'auto' }} />
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : isError ? (
            <div style={{
              padding: '20px 16px',
              background: 'var(--danger-bg, #FEF2F2)',
              border: '1px solid var(--danger-border, #FCA5A5)',
              borderRadius: 12,
              fontSize: 13, color: 'var(--danger-text, #B91C1C)',
              fontWeight: 500, lineHeight: 1.5,
            }}>
              ⚠️ Could not load invoice details. Close and click the invoice again.
            </div>
          ) : (
            <>
              <DrawerSection title="Invoice Details">
                <InfoRow icon={<UserIcon />}         label="Customer"
                  value={detail?.customer_name || sale.customer_name || 'Walk-in'} />
                <InfoRow icon={<CalendarDaysIcon />} label="Invoice Date"
                  value={formatDate(detail?.sales_created_at || sale.sales_created_at)} />
                <InfoRow icon={<CreditCardIcon />}   label="Payment Method"
                  value={(detail?.sales_payment_method || sale.sales_payment_method || '—')
                    .replace('_', ' ').toUpperCase()} />
                <InfoRow
                  icon={<BanknotesIcon />}
                  label="Status"
                  isLast={!editingStatus || newStatus !== 'partial'}
                  value={
                    <Badge status={displayStatus} dot />
                  }
                />
                {editingStatus && (
                  <>
                    <div style={{
                      padding: '12px 14px',
                      borderTop: '1px solid var(--border)',
                      display: 'flex', gap: 8, alignItems: 'center',
                    }}>
                      <select
                        className="sb-select"
                        value={newStatus}
                        onChange={e => {
                          setNewStatus(e.target.value);
                          setPartialAmount('');
                          setPartialError('');
                        }}
                        style={{ ...selectStyle, flex: 1, fontSize: 13, padding: '8px 10px' }}
                      >
                        <option value="paid">Paid</option>
                        <option value="partial">Partial</option>
                        <option value="pending">Unpaid</option>
                      </select>
                      <Button size="sm" variant="primary"
                        loading={statusMutation.isPending}
                        onClick={handleStatusSave}>
                        Save
                      </Button>
                      <Button size="sm" variant="ghost"
                        onClick={() => {
                          setEditingStatus(false);
                          setPartialAmount('');
                          setPartialError('');
                        }}>
                        Cancel
                      </Button>
                    </div>

                    {newStatus === 'partial' && (
                      <div style={{
                        padding: '12px 14px',
                        borderTop: '1px solid var(--border)',
                      }}>
                        <div style={{
                          background: 'var(--bg-card)',
                          borderRadius: 'var(--r-md)',
                          border: '1px solid var(--border)',
                          overflow: 'hidden',
                        }}>
                          <div style={{
                            padding: '10px 12px',
                            borderBottom: '1px solid var(--border)',
                            fontSize: 10.5, fontWeight: 700,
                            textTransform: 'uppercase',
                            letterSpacing: '0.08em',
                            color: 'var(--text-muted)',
                          }}>
                            Payment Collection
                          </div>

                          <div style={{ padding: '10px 12px' }}>
                            <div style={{
                              display: 'flex', justifyContent: 'space-between',
                              fontSize: 13, color: 'var(--text-secondary)',
                              marginBottom: 6,
                            }}>
                              <span>Invoice Total</span>
                              <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                                {formatCurrency(finalAmount, country)}
                              </span>
                            </div>
                            <div style={{
                              display: 'flex', justifyContent: 'space-between',
                              fontSize: 13, color: 'var(--text-secondary)',
                              marginBottom: 6,
                            }}>
                              <span>Already Paid</span>
                              <span style={{ fontWeight: 600, color: '#059669' }}>
                                {formatCurrency(totalPaid, country)}
                              </span>
                            </div>
                            <div style={{
                              display: 'flex', justifyContent: 'space-between',
                              fontSize: 13, color: 'var(--text-secondary)',
                              marginBottom: 12,
                              paddingBottom: 12,
                              borderBottom: '1px solid var(--border)',
                            }}>
                              <span>Outstanding</span>
                              <span style={{ fontWeight: 700, color: '#ef4444' }}>
                                {formatCurrency(remaining, country)}
                              </span>
                            </div>

                            <Input
                              type="number"
                              label="Amount Received"
                              placeholder="Enter amount received"
                              value={partialAmount}
                              onChange={e => {
                                setPartialAmount(e.target.value);
                                setPartialError('');
                              }}
                              error={partialError || undefined}
                              min={0}
                              step="0.01"
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </DrawerSection>

              {!editingStatus && displayStatus !== 'paid' && (
                <div style={{ marginBottom: 20 }}>
                  <Button
                    variant="secondary" size="sm"
                    onClick={() => {
                      setNewStatus(displayStatus || 'paid');
                      setEditingStatus(true);
                    }}
                  >
                    Update Payment Status
                  </Button>
                </div>
              )}

              {items.length > 0 && (
                <DrawerSection title={`Line Items (${items.length})`}>
                  {items.map((item, idx) => {
                    // MRP FEATURE: compute per-item discount for display
                    const mrpVal    = item.item_mrp != null ? Number(item.item_mrp) : null;
                    const unitPrice = Number(item.sale_item_unit_price);
                    const qty       = Number(item.sale_item_quantity);
                    const hasDiscount = mrpVal != null && mrpVal > unitPrice;
                    const discAmt   = hasDiscount ? (mrpVal - unitPrice) * qty : null;
                    const discPct   = hasDiscount ? Math.round((mrpVal - unitPrice) / mrpVal * 100) : null;

                    return (
                      <div key={item.sale_item_id || idx} style={{
                        padding: '11px 14px',
                        borderBottom: idx === items.length - 1 ? 'none' : '1px solid var(--border)',
                      }}>
                        {/* Top row: product name + line total */}
                        <div style={{
                          display: 'flex', justifyContent: 'space-between',
                          alignItems: 'flex-start', gap: 12,
                        }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                              {item.product_name || 'Product'}
                            </div>

                            {/* MRP FEATURE: show MRP (struck-through) when available */}
                            {mrpVal != null && (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
                                <span style={{
                                  fontSize: 11, color: 'var(--text-muted)',
                                  textDecoration: 'line-through',
                                }}>
                                  MRP {formatCurrency(mrpVal, country)}
                                </span>
                                {hasDiscount && (
                                  <span style={{
                                    fontSize: 10.5, fontWeight: 700,
                                    color: '#059669',
                                    background: '#D1FAE5',
                                    borderRadius: 4,
                                    padding: '1px 5px',
                                  }}>
                                    {discPct}% OFF
                                  </span>
                                )}
                              </div>
                            )}

                            {/* Qty × rate + tax line */}
                            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                              {qty} × {formatCurrency(unitPrice, country)}
                              {Number(item.item_tax_total) > 0 &&
                                ` + ${formatCurrency(item.item_tax_total, country)} tax`}
                            </div>

                            {/* MRP FEATURE: "You save ₹X" per line */}
                            {hasDiscount && (
                              <div style={{
                                fontSize: 11.5, fontWeight: 600,
                                color: '#059669', marginTop: 3,
                              }}>
                                You save {formatCurrency(discAmt, country)} on this item
                              </div>
                            )}
                          </div>

                          <span style={{
                            fontSize: 13, fontWeight: 700,
                            color: 'var(--text-primary)', flexShrink: 0,
                          }}>
                            {formatCurrency(item.item_total_with_tax, country)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </DrawerSection>
              )}

              {(() => {
                const tt = detectTaxType(detail);
                if (tt === 'cgst_sgst' && (cgst > 0 || sgst > 0)) {
                  return (
                    <DrawerSection title="Tax Breakdown">
                      {cgst > 0 && <InfoRow label="CGST" value={formatCurrency(cgst, country)} />}
                      {sgst > 0 && <InfoRow label="SGST" value={formatCurrency(sgst, country)} isLast />}
                    </DrawerSection>
                  );
                }
                if (tt === 'igst' && igst > 0) {
                  return (
                    <DrawerSection title="Tax Breakdown">
                      <InfoRow label="IGST" value={formatCurrency(igst, country)} isLast />
                    </DrawerSection>
                  );
                }
                if (tt === 'generic' && taxTotal > 0) {
                  return (
                    <DrawerSection title="Tax Breakdown">
                      <InfoRow label={getTaxLabel(country, isGstRegistered)} value={formatCurrency(taxTotal, country)} isLast />
                    </DrawerSection>
                  );
                }
                return null;
              })()}

              <DrawerSection title="Summary">
                <InfoRow label="Subtotal"   value={formatCurrency(subtotal, country)} />
                {discount > 0 && (
                  <InfoRow label="Discount"
                    value={
                      <span style={{ color: '#059669', fontWeight: 600 }}>
                        −{formatCurrency(discount, country)}
                      </span>
                    }
                  />
                )}
                <InfoRow label={`${getTaxLabel(country, isGstRegistered)} Total`}  value={formatCurrency(taxTotal, country)} />
                <InfoRow label="Total"
                  value={
                    <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)' }}>
                      {formatCurrency(finalAmount, country)}
                    </span>
                  }
                />
                {totalPaid > 0 && (
                  <InfoRow label="Amount Paid" value={formatCurrency(totalPaid, country)} />
                )}
                {remaining > 0 && (
                  <InfoRow label="Remaining"
                    value={
                      <span style={{ color: '#ef4444', fontWeight: 600 }}>
                        {formatCurrency(remaining, country)}
                      </span>
                    }
                  />
                )}
                {/* MRP FEATURE: "Total Savings" row — only shown when savings > 0 */}
                {totalSavings > 0 && (
                  <InfoRow label="🎉 Total Savings" isLast
                    value={
                      <span style={{ color: '#059669', fontWeight: 700 }}>
                        {formatCurrency(totalSavings, country)}
                      </span>
                    }
                  />
                )}
              </DrawerSection>

              {can('payments.manage') && paymentHistory.length > 0 && (
                <DrawerSection title={`Payment History (${paymentHistory.length})`}>
                  {paymentHistory.map((p, i) => (
                    <div key={p.payment_id} style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '10px 14px',
                      borderBottom: i < paymentHistory.length - 1 ? '1px solid var(--border)' : 'none',
                    }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>
                          {formatCurrency(p.payment_amount, country)}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>
                          {formatDateTime(p.payment_paid_at)}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)' }}>
                          {(p.payment_method || '—').replace(/_/g, ' ').toUpperCase()}
                        </div>
                        <Badge status={p.payment_status} dot size="sm" />
                      </div>
                    </div>
                  ))}
                </DrawerSection>
              )}

              {(returnsData?.length ?? 0) > 0 && (
                <DrawerSection title={`Returns (${returnsData.length})`}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 14px' }}>
                    {returnsData.map(ret => (
                      <div
                        key={ret.return_id}
                        style={{
                          background: 'var(--bg-subtle)',
                          border: '1px solid var(--border)',
                          borderRadius: 'var(--r-md)', padding: '12px 14px',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                            Return — {formatCurrency(ret.return_amount, country)}
                          </span>
                          <Badge
                            variant={
                              ret.return_status === 'approved' ? 'success'
                              : ret.return_status === 'rejected' ? 'danger'
                              : 'warning'
                            }
                            label={ret.return_status?.charAt(0).toUpperCase() + ret.return_status?.slice(1) || '—'}
                          />
                        </div>
                        {ret.return_reason && (
                          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                            Reason: {ret.return_reason}
                          </div>
                        )}
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                          {ret.return_created_at ? formatDate(ret.return_created_at) : '—'}
                        </div>
                      </div>
                    ))}
                  </div>
                </DrawerSection>
              )}

              {(detail?.notes || sale.notes) && (
                <DrawerSection title="Notes">
                  <div style={{
                    padding: '11px 14px', fontSize: 13,
                    color: 'var(--text-secondary)', lineHeight: 1.6,
                  }}>
                    {detail?.notes || sale.notes}
                  </div>
                </DrawerSection>
              )}
            </>
          )}
        </div>
      </div>

      {showReturnDrawer && (
        <CreateSalesReturnDrawer
          saleId={sale.sales_id}
          onClose={() => setShowReturnDrawer(false)}
        />
      )}
    </DrawerPortal>
  );
}

function DrawerSection({ title, children }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <p style={{
        fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase',
        letterSpacing: '0.08em', color: 'var(--text-muted)', margin: '0 0 10px',
      }}>
        {title}
      </p>
      <div style={{
        background: 'var(--bg-page)',
        border: '1px solid var(--border)',
        borderRadius: 12, overflow: 'hidden',
      }}>
        {children}
      </div>
    </div>
  );
}

function InfoRow({ icon, label, value, isLast = false }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '10px 14px',
      borderBottom: isLast ? 'none' : '1px solid var(--border)',
    }}>
      {icon && (
        <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>
          {React.cloneElement(icon, { style: { width: 15, height: 15 } })}
        </span>
      )}
      <span style={{
        fontSize: 13, color: 'var(--text-muted)',
        minWidth: 120, fontWeight: 500, flexShrink: 0,
      }}>
        {label}
      </span>
      <span style={{
        fontSize: 13, color: 'var(--text-primary)',
        fontWeight: 500, flex: 1, textAlign: 'right',
      }}>
        {value}
      </span>
    </div>
  );
}