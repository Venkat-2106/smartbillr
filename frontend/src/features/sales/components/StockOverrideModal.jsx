// src/features/sales/components/StockOverrideModal.jsx
//
// "Stock Quantity Alert" modal shown when a sale submission returns
// error_code: "INSUFFICIENT_STOCK".
// Purely presentational — all state lives in CreateSalePage (hooks own state rule).
//
// Props:
//   stockErrors    — array of { product_id, product_name, available_qty, requested_qty, shortfall }
//   isPending      — boolean (mutation.isPending)
//   onCancel       — () => void  (handleStockOverrideCancel)
//   onConfirm      — () => void  (handleStockOverrideConfirm)
//
// Extracted from CreateSalePage.jsx (Step 5.16 refactor) — zero behaviour change.

import { Modal, Button } from '../../../shared/components';

export default function StockOverrideModal({
  stockErrors,
  isPending,
  onCancel,
  onConfirm,
}) {
  return (
    <Modal
      open={stockErrors.length > 0}
      onClose={onCancel}
      title="Stock Quantity Alert"
      subtitle="The following items exceed available stock"
      size="md"
    >
      <div style={{
        background: '#FEF9EC',
        border: '1.5px solid #F59E0B',
        borderRadius: 10,
        padding: '12px 16px',
        marginBottom: 20,
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
      }}>
        <span style={{ fontSize: 20, flexShrink: 0, lineHeight: 1.2 }}>⚠️</span>
        <div>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: '#92400E', marginBottom: 3 }}>
            Requested quantity exceeds available stock
          </div>
          <div style={{ fontSize: 12.5, color: '#B45309', lineHeight: 1.5 }}>
            You can override and proceed — a <strong>manual adjustment</strong> record
            will be created automatically in stock movements with the note
            "Manual adjustment during sale".
          </div>
        </div>
      </div>

      <div style={{
        border: '1px solid var(--border)',
        borderRadius: 10,
        overflow: 'hidden',
        marginBottom: 4,
      }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 100px 100px 90px',
          gap: 0,
          background: 'var(--bg-subtle)',
          borderBottom: '1px solid var(--border)',
          padding: '9px 16px',
        }}>
          {['Product', 'Available', 'Requested', 'Shortfall'].map((h, i) => (
            <span key={i} style={{
              fontSize: 11, fontWeight: 700, color: 'var(--text-muted)',
              textTransform: 'uppercase', letterSpacing: '0.07em',
              textAlign: i > 0 ? 'right' : 'left',
            }}>
              {h}
            </span>
          ))}
        </div>

        {stockErrors.map((err, idx) => (
          <div
            key={err.product_id}
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 100px 100px 90px',
              gap: 0,
              padding: '11px 16px',
              alignItems: 'center',
              borderBottom: idx === stockErrors.length - 1 ? 'none' : '1px solid var(--border)',
              background: 'var(--bg-card)',
            }}
          >
            <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-primary)' }}>
              {err.product_name}
            </span>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#059669', textAlign: 'right' }}>
              {err.available_qty}
            </span>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#2563EB', textAlign: 'right' }}>
              {err.requested_qty}
            </span>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#DC2626', textAlign: 'right' }}>
              −{err.shortfall}
            </span>
          </div>
        ))}
      </div>

      <Modal.Footer>
        <Button variant="ghost" onClick={onCancel} disabled={isPending}>
          Edit Quantities
        </Button>
        <Button variant="danger" onClick={onConfirm} loading={isPending}>
          Override &amp; Save
        </Button>
      </Modal.Footer>
    </Modal>
  );
}