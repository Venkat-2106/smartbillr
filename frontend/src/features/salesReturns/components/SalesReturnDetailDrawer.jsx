import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { XMarkIcon, ArrowPathIcon, PrinterIcon } from '@heroicons/react/24/outline'
import { toast } from 'react-hot-toast'
import { fetchSalesReturn, updateSalesReturnStatus } from '../api/salesReturnsApi'
import { Button, Spinner, ConfirmDialog } from '../../../shared/components'
import { formatCurrency } from '../../../shared/utils/formatCurrency'
import { formatDate, formatDateTime } from '../../../shared/utils/formatDate'
import {
  buildPrintHeader,
  buildPrintWatermark,
  buildPrintFooter,
  buildPrintMetaGrid,
  buildPrintSectionTitle,
  buildPrintTable,
  escapeHTML,
  triggerPrint,
} from '../../../shared/utils/printUtils'
import useAuthStore from '../../../store/authStore'

const STATUS_LABEL = { pending: 'Pending', approved: 'Approved', rejected: 'Rejected' }

function StatusBadge({ status }) {
  const colors = {
    pending:  { bg: '#FEF3C7', text: '#B45309', border: '#F59E0B40' },
    approved: { bg: '#D1FAE5', text: '#065F46', border: '#10B98140' },
    rejected: { bg: '#FEE2E2', text: '#991B1B', border: '#EF444440' },
  }
  const c = colors[status] || colors.pending
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, color: c.text,
      background: c.bg, border: `1px solid ${c.border}`,
      borderRadius: 6, padding: '3px 10px',
      textTransform: 'capitalize',
    }}>
      {STATUS_LABEL[status] || status}
    </span>
  )
}

function buildReturnPrintHTML(business, detail) {
  const country = business?.business_country_code || 'IN'
  const metaFields = [
    { label: 'Invoice No', value: detail.invoice_no || '—' },
      { label: 'Amount', value: formatCurrency(detail.return_amount, country) },
    { label: 'Status', value: STATUS_LABEL[detail.return_status] || detail.return_status },
    { label: 'Restock', value: detail.restock ? 'Yes' : 'No' },
    { label: 'Reason', value: detail.return_reason || '—' },
    { label: 'Created On', value: detail.return_created_at ? formatDate(detail.return_created_at) : '—' },
  ]

  const itemCols = [
    { label: 'Product', key: 'product_name', align: 'left' },
    { label: 'Qty', key: 'return_qty', align: 'center' },
      { label: 'Refund', key: 'refund_amount', align: 'right', format: v => formatCurrency(v, country) },
      { label: 'Subtotal', key: 'return_item_subtotal', align: 'right', format: v => formatCurrency(v, country) },
  ]

  const items = (detail.items || []).map(i => ({
    ...i,
    product_name: i.product_name || i.product_id || '—',
  }))

  return `
    ${buildPrintWatermark()}
    ${buildPrintHeader(business)}

    <div style="margin-bottom:20px;">
      <div style="font-size:24px;font-weight:900;color:#111827;letter-spacing:-0.5px;line-height:1.1;">
        Sales Return
      </div>
      <div style="font-size:11.5px;color:#9ca3af;margin-top:5px;">
        ${detail.invoice_no ? `Invoice ${escapeHTML(detail.invoice_no)}` : ''}
      </div>
    </div>

    ${buildPrintSectionTitle('Details')}
    ${buildPrintMetaGrid(metaFields, 3)}

    ${buildPrintSectionTitle(`Items (${items.length})`)}
    ${buildPrintTable(itemCols, items, 'No items.')}

    ${buildPrintFooter()}
  `
}

// ── PERMISSION SPLIT (2026-07) ──────────────────────────────────────────────
// canApprove gates the Approve/Reject buttons (admin/manager only).
// canManage is kept for other manage-level actions if needed in future.
export default function SalesReturnDetailDrawer({ returnId, onClose, onStatusUpdate, canApprove, canManage }) {
  const [actionLoading, setActionLoading] = useState(false)
  const [printHovered, setPrintHovered] = useState(false)
  const [showApproveConfirm, setShowApproveConfirm] = useState(false)
  const queryClient = useQueryClient()
  const business  = useAuthStore(s => s.business)
  const country   = business?.business_country_code || 'IN'

  const { data, isLoading, isError } = useQuery({
    queryKey: ['salesReturn', returnId],
    queryFn: () => fetchSalesReturn(returnId),
    enabled: !!returnId,
    staleTime: 2 * 60 * 1000,
  })

  const detail = data?.data ?? data

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }) => updateSalesReturnStatus(id, payload),
    onSuccess: (data) => {
      toast.success(data?.message || 'Return updated successfully')
      queryClient.invalidateQueries({ queryKey: ['salesReturn', returnId] })
      queryClient.invalidateQueries({ queryKey: ['salesReturns'] })
      if (onStatusUpdate) onStatusUpdate()
    },
    onError: (err) => {
      toast.error(err?.response?.data?.message || 'Failed to update return')
      setActionLoading(false)
    },
  })

  function handleApprove() {
    setShowApproveConfirm(true)
  }

  function confirmApprove() {
    setShowApproveConfirm(false)
    setActionLoading(true)
    updateMutation.mutate(
      { id: returnId, payload: { return_status: 'approved', restock: detail?.restock ?? false } },
      { onSettled: () => setActionLoading(false) }
    )
  }

  function handleReject() {
    setActionLoading(true)
    updateMutation.mutate(
      { id: returnId, payload: { return_status: 'rejected', restock: false } },
      { onSettled: () => setActionLoading(false) }
    )
  }

  function handlePrint() {
    if (!detail) return
    const business = useAuthStore.getState().business
    const html = buildReturnPrintHTML(business, detail)
    triggerPrint(html)
  }

  const isPending = detail?.return_status === 'pending'

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.35)',
          zIndex: 1000, backdropFilter: 'blur(3px)',
        }}
      />

      <div style={{
        position: 'fixed', top: 0, right: 0,
        height: '100vh', width: 560, maxWidth: '95vw',
        background: 'var(--bg-card)',
        borderLeft: '1px solid var(--border)',
        boxShadow: '-8px 0 40px rgba(0,0,0,0.14)',
        zIndex: 1001,
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}>
        <div style={{
          padding: '20px 24px',
          borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'flex-start',
          justifyContent: 'space-between', gap: 16, flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{
              width: 46, height: 46, borderRadius: 13, flexShrink: 0,
              background: 'linear-gradient(135deg, var(--accent-600), var(--accent-500))',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <ArrowPathIcon style={{ width: 22, height: 22, color: '#fff' }} />
            </div>
            <div>
              <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', margin: 0, lineHeight: 1.3 }}>
                Sales Return
              </h2>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '3px 0 0' }}>
                {detail?.invoice_no ? `Invoice ${detail.invoice_no}` : 'Return'}
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={handlePrint}
              disabled={isLoading || !!isError}
              title="Print return"
              onMouseEnter={() => setPrintHovered(true)}
              onMouseLeave={() => setPrintHovered(false)}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                background: printHovered && !isLoading && !isError ? 'var(--bg-hover)' : 'var(--bg-page)',
                border: '1px solid var(--border)',
                cursor: isLoading || isError ? 'not-allowed' : 'pointer',
                padding: '6px 12px', borderRadius: 8,
                color: isLoading || isError ? 'var(--text-muted)' : 'var(--text-secondary)',
                fontSize: 13, fontWeight: 600,
                fontFamily: 'inherit', opacity: isLoading || isError ? 0.5 : 1,
                transition: 'background 0.12s',
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

        <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
          {isLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
              <Spinner size="md" />
            </div>
          ) : isError ? (
            <div style={{
              padding: '18px 16px',
              background: 'var(--danger-bg, #FEF2F2)',
              border: '1px solid var(--danger-border, #FCA5A5)',
              borderRadius: 12, fontSize: 13,
              color: 'var(--danger-text, #B91C1C)', fontWeight: 500,
            }}>
              Could not load return details. Close and try again.
            </div>
          ) : detail ? (
            <>
              {isPending && canApprove && (
                <div style={{
                  display: 'flex', gap: 10, marginBottom: 20,
                }}>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleApprove}
                    loading={actionLoading}
                    style={{ flex: 1 }}
                  >
                    Approve Return
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={handleReject}
                    loading={actionLoading}
                    disabled={actionLoading}
                    style={{ flex: 1 }}
                  >
                    Reject
                  </Button>
                </div>
              )}

              <div style={{
                display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20,
              }}>
                <StatusBadge status={detail.return_status} />
                {detail.restock && (
                  <span style={{
                    fontSize: 11, fontWeight: 600, color: 'var(--text-muted)',
                    background: 'var(--bg-page)', border: '1px solid var(--border)',
                    borderRadius: 6, padding: '3px 10px',
                  }}>
                    Restock Items
                  </span>
                )}
              </div>

              <div style={{
                background: 'var(--bg-page)',
                border: '1px solid var(--border)',
                borderRadius: 12,
                padding: '14px 16px',
                marginBottom: 20,
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '12px 20px',
              }}>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>
                    Invoice No
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'monospace' }}>
                    {detail.invoice_no || '—'}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>
                    Amount
                  </div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--accent-600)' }}>
                    {formatCurrency(detail.return_amount, country)}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>
                    Created On
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                    {detail.return_created_at ? formatDateTime(detail.return_created_at) : '—'}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>
                    Reason
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                    {detail.return_reason || '—'}
                  </div>
                </div>
                {detail.approved_by && (
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>
                      Approved By
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                      {detail.approved_by}
                    </div>
                  </div>
                )}
                {detail.rejected_reason && (
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>
                      Rejection Reason
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#EF4444' }}>
                      {detail.rejected_reason}
                    </div>
                  </div>
                )}
              </div>

              <div>
                <p style={{
                  fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase',
                  letterSpacing: '0.08em', color: 'var(--text-muted)', margin: '0 0 10px',
                }}>
                  Return Items ({detail.items?.length || 0})
                </p>

                {(!detail.items || detail.items.length === 0) ? (
                  <div style={{
                    background: 'var(--bg-page)', border: '1px solid var(--border)',
                    borderRadius: 12, padding: '32px 16px',
                    textAlign: 'center', color: 'var(--text-muted)', fontSize: 13,
                  }}>
                    No return items.
                  </div>
                ) : (
                  <div style={{
                    background: 'var(--bg-page)', border: '1px solid var(--border)',
                    borderRadius: 12, overflow: 'hidden',
                  }}>
                    {detail.items.map((item, idx) => (
                      <div key={item.return_item_id || idx} style={{
                        padding: '12px 14px',
                        borderBottom: idx === detail.items.length - 1 ? 'none' : '1px solid var(--border)',
                        display: 'flex', justifyContent: 'space-between',
                        alignItems: 'center', gap: 12,
                      }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>
                            {item.product_name || '—'}
                          </div>
                          <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                            Qty: {item.return_qty} {'\u00D7'} {formatCurrency(item.refund_amount, country)}
                          </div>
                        </div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
                          {formatCurrency(item.return_item_subtotal ?? (item.return_qty * item.refund_amount), country)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : null}
        </div>
      </div>

      <ConfirmDialog
        open={showApproveConfirm}
        onClose={() => setShowApproveConfirm(false)}
        onConfirm={confirmApprove}
        title="Approve Return?"
        message="Once a return is approved, it cannot be deleted. An expense entry will be created for the refund amount."
        confirmText={actionLoading ? 'Approving\u2026' : 'Yes, Approve'}
        cancelText="Cancel"
        variant="warning"
        loading={actionLoading}
      />
    </>
  )
}
