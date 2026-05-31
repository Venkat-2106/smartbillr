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
import { Badge, Button, Spinner } from '../../../shared/components';
import { selectStyle } from '../../../shared/components/FormField';
import { formatCurrency } from '../../../shared/utils/formatCurrency';
import { formatDate }     from '../../../shared/utils/formatDate';

// Badge variant per status — backend sends "pending" not "unpaid"
const STATUS_VARIANT = { paid: 'success', partial: 'warning', pending: 'danger' };
const STATUS_LABEL   = { paid: 'Paid',    partial: 'Partial', pending: 'Unpaid' };

export default function SaleDetailDrawer({ sale, onClose, statusMutation }) {
  // Local state for immediate visual feedback after status update
  const [displayStatus,  setDisplayStatus]  = useState(sale?.sales_payment_status || 'pending');
  const [editingStatus,  setEditingStatus]  = useState(false);
  const [newStatus,      setNewStatus]      = useState(sale?.sales_payment_status || 'paid');

  // Fetch full detail (includes items array)
  // WHY sale.sales_id: backend returns "sales_id" (not "sale_id")
  const { data: detail, isLoading, isError } = useQuery({
    queryKey: ['sale', sale?.sales_id],
    queryFn:  () => fetchSale(sale.sales_id),
    enabled:  !!sale?.sales_id,
    staleTime: 2 * 60 * 1000,
  });

  // ── Auto-print ────────────────────────────────────────────────────────────
  // When the drawer is opened with _autoPrint = true (set by CreateSalePage
  // after a successful invoice creation), open the browser print dialog
  // automatically once the detail data has loaded.
  // WHY a timeout: the browser needs one render cycle after data loads
  // before window.print() can see the fully rendered invoice content.
  useEffect(() => {
    if (!isLoading && detail && sale?._autoPrint) {
      const timer = setTimeout(() => window.print(), 350);
      return () => clearTimeout(timer);
    }
  }, [isLoading, detail, sale?._autoPrint]);

  if (!sale) return null;

  // Prefer detailed data; fall back to list row data
  // WHY sales_total_amount: backend has no "subtotal" field — use sales_total_amount
  const subtotal      = detail?.sales_total_amount     ?? sale.sales_total_amount ?? 0;
  const taxTotal      = detail?.tax_total              ?? sale.tax_total          ?? 0;
  const finalAmount   = detail?.sales_final_amount     ?? sale.sales_final_amount ?? 0;
  const totalPaid     = detail?.total_paid             ?? 0;
  const remaining     = detail?.remaining_balance      ?? 0;
  const cgst          = detail?.cgst_total             ?? 0;
  const sgst          = detail?.sgst_total             ?? 0;
  const igst          = detail?.igst_total             ?? 0;
  const items         = detail?.items                  ?? [];

  // ── Print handler ─────────────────────────────────────────────────────────
  // Uses browser's native print dialog.
  // The @media print CSS in index.css controls what is visible on paper.
  // No new API call — prints from the already-cached detail query data.
  const handlePrint = () => {
    window.print();
  };

  const handleStatusSave = () => {
    statusMutation.mutate(
      { id: sale.sales_id, status: newStatus },
      {
        onSuccess: () => {
          setDisplayStatus(newStatus);
          setEditingStatus(false);
        },
      }
    );
  };

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.35)',
          zIndex: 1000, backdropFilter: 'blur(3px)',
        }}
      />

      {/* Drawer panel */}
      <div
        className="invoice-print-area"
        style={{
          position: 'fixed', top: 0, right: 0,
          height: '100vh', width: 520, maxWidth: '95vw',
          background: 'var(--bg-card)',
          borderLeft: '1px solid var(--border)',
          boxShadow: '-8px 0 40px rgba(0,0,0,0.14)',
          zIndex: 1001,
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
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

          {/* Header right: Print button + Close button */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            {/* Print button — disabled until detail has loaded */}
            <button
              onClick={handlePrint}
              disabled={isLoading || !!isError}
              title="Print Invoice"
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                background: 'var(--bg-page)', border: '1px solid var(--border)',
                cursor: isLoading || isError ? 'not-allowed' : 'pointer',
                padding: '6px 12px', borderRadius: 8,
                color: isLoading || isError ? 'var(--text-muted)' : 'var(--text-secondary)',
                fontSize: 12.5, fontWeight: 600,
                fontFamily: 'inherit',
                opacity: isLoading || isError ? 0.5 : 1,
                transition: 'background 0.12s',
              }}
              onMouseEnter={e => {
                if (!isLoading && !isError)
                  e.currentTarget.style.background = 'var(--bg-hover)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'var(--bg-page)';
              }}
            >
              <PrinterIcon style={{ width: 15, height: 15 }} />
              Print
            </button>

            {/* Close button */}
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
            <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
              <Spinner size="md" />
            </div>
          ) : isError ? (
            // ── Error state — was missing in original ──
            <div style={{
              padding: '20px 16px',
              background: 'var(--danger-bg, #FEF2F2)',
              border: '1px solid var(--danger-border, #FCA5A5)',
              borderRadius: 12,
              fontSize: 13.5, color: 'var(--danger-text, #B91C1C)',
              fontWeight: 500, lineHeight: 1.5,
            }}>
              ⚠️ Could not load invoice details. Close and click the invoice again.
            </div>
          ) : (
            <>
              {/* Invoice details */}
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
                  isLast={!editingStatus}
                  value={
                    <Badge
                      variant={STATUS_VARIANT[displayStatus] || 'default'}
                      label={STATUS_LABEL[displayStatus]    || displayStatus}
                      dot
                    />
                  }
                />
                {/* Inline status editor */}
                {editingStatus && (
                  <div style={{
                    padding: '12px 14px',
                    borderTop: '1px solid var(--border)',
                    display: 'flex', gap: 8, alignItems: 'center',
                  }}>
                    <select
                      value={newStatus}
                      onChange={e => setNewStatus(e.target.value)}
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
                      onClick={() => setEditingStatus(false)}>
                      Cancel
                    </Button>
                  </div>
                )}
              </DrawerSection>

              {/* Update status button */}
              {!editingStatus && (
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

              {/* Line items */}
              {items.length > 0 && (
                <DrawerSection title={`Line Items (${items.length})`}>
                  {items.map((item, idx) => (
                    <div key={item.sale_item_id || idx} style={{
                      padding: '11px 14px',
                      borderBottom: idx === items.length - 1 ? 'none' : '1px solid var(--border)',
                      display: 'flex', justifyContent: 'space-between',
                      alignItems: 'flex-start', gap: 12,
                    }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                          {item.product_name || 'Product'}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>
                          {item.sale_item_quantity} × {formatCurrency(item.sale_item_unit_price)}
                          {Number(item.item_tax_total) > 0 &&
                            ` + ${formatCurrency(item.item_tax_total)} tax`}
                        </div>
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 700,
                        color: 'var(--text-primary)', flexShrink: 0 }}>
                        {formatCurrency(item.item_total_with_tax)}
                      </span>
                    </div>
                  ))}
                </DrawerSection>
              )}

              {/* Tax breakdown — only show if any GST exists */}
              {(cgst > 0 || sgst > 0 || igst > 0) && (
                <DrawerSection title="Tax Breakdown">
                  {cgst > 0 && <InfoRow label="CGST" value={formatCurrency(cgst)} />}
                  {sgst > 0 && <InfoRow label="SGST" value={formatCurrency(sgst)} />}
                  {igst > 0 && <InfoRow label="IGST" value={formatCurrency(igst)} isLast />}
                </DrawerSection>
              )}

              {/* Financial summary */}
              <DrawerSection title="Summary">
                <InfoRow label="Subtotal"   value={formatCurrency(subtotal)} />
                <InfoRow label="Tax Total"  value={formatCurrency(taxTotal)} />
                <InfoRow label="Total"
                  value={
                    <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)' }}>
                      {formatCurrency(finalAmount)}
                    </span>
                  }
                />
                {totalPaid > 0 && (
                  <InfoRow label="Amount Paid" value={formatCurrency(totalPaid)} />
                )}
                {remaining > 0 && (
                  <InfoRow label="Remaining" isLast
                    value={
                      <span style={{ color: '#ef4444', fontWeight: 600 }}>
                        {formatCurrency(remaining)}
                      </span>
                    }
                  />
                )}
              </DrawerSection>

              {/* Notes — sales table has no notes column, so this only renders
                  if somehow notes appears in future. Kept from original as-is. */}
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
    </>
  );
}

/* ─── Helper sub-components (unchanged from original) ────────────────────── */
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
        fontSize: 12.5, color: 'var(--text-muted)',
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