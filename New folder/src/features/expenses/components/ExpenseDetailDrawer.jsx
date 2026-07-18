import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { XMarkIcon, CurrencyDollarIcon, PrinterIcon } from '@heroicons/react/24/outline'
import { fetchExpense } from '../api/expensesApi'
import { Spinner } from '../../../shared/components'
import { formatCurrency } from '../../../shared/utils/formatCurrency'
import { formatDate, formatDateOnly }
  from '../../../shared/utils/formatDate'
import {
  buildPrintHeader,
  buildPrintWatermark,
  buildPrintFooter,
  buildPrintMetaGrid,
  buildPrintSectionTitle,
  triggerPrint,
} from '../../../shared/utils/printUtils'
import useAuthStore from '../../../store/authStore'

const CATEGORY_LABELS = {
  rent: 'Rent',
  salary: 'Salary',
  electricity: 'Electricity',
  internet: 'Internet',
  maintenance: 'Maintenance',
  marketing: 'Marketing',
  purchase: 'Purchase',
  other: 'Other',
}

function buildExpensePrintHTML(business, expense) {
  const country = business?.business_country_code || 'IN'
  const metaFields = [
    { label: 'Category', value: CATEGORY_LABELS[expense.expense_category] || expense.expense_category || '—' },
    { label: 'Amount', value: formatCurrency(expense.expense_amount, country) },
    { label: 'Date', value: expense.expense_date ? formatDateOnly(expense.expense_date) : '—' },
    { label: 'Created On', value: expense.created_at ? formatDate(expense.created_at) : '—' },
  ]

  return `
    ${buildPrintWatermark()}
    ${buildPrintHeader(business)}

    <div style="margin-bottom:20px;">
      <div style="font-size:24px;font-weight:900;color:#111827;letter-spacing:-0.5px;line-height:1.1;">
        ${CATEGORY_LABELS[expense.expense_category] || expense.expense_category || 'Expense'}
      </div>
      <div style="font-size:11.5px;color:#9ca3af;margin-top:5px;">Expense Details</div>
    </div>

    ${buildPrintSectionTitle('Details')}
    ${buildPrintMetaGrid(metaFields, 4)}

    ${expense.expense_notes ? `
      ${buildPrintSectionTitle('Notes')}
      <p style="font-size:13px;color:#374151;line-height:1.7;white-space:pre-wrap;margin:0;">${expense.expense_notes}</p>
    ` : ''}

    ${buildPrintFooter()}
  `
}

export default function ExpenseDetailDrawer({ expenseId, onClose, onEdit, canManage }) {
  const [printHovered, setPrintHovered] = useState(false)
  const business  = useAuthStore(s => s.business)
  const country   = business?.business_country_code || 'IN'

  const { data, isLoading, isError } = useQuery({
    queryKey: ['expense', expenseId],
    queryFn: () => fetchExpense(expenseId),
    enabled: !!expenseId,
    staleTime: 2 * 60 * 1000,
  })

  const detail = data?.data ?? data

  function handlePrint() {
    if (!detail) return
    const business = useAuthStore.getState().business
    const html = buildExpensePrintHTML(business, detail)
    triggerPrint(html)
  }

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
        height: '100vh', width: 540, maxWidth: '95vw',
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
              <CurrencyDollarIcon style={{ width: 22, height: 22, color: '#fff' }} />
            </div>
            <div>
              <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', margin: 0, lineHeight: 1.3 }}>
                {detail ? (CATEGORY_LABELS[detail.expense_category] || detail.expense_category) : 'Expense'}
              </h2>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '3px 0 0' }}>
                {detail ? formatCurrency(detail.expense_amount, country) : 'Loading\u2026'}
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={handlePrint}
              disabled={isLoading || !!isError}
              title="Print expense"
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
              Could not load expense details. Close and try again.
            </div>
          ) : detail ? (
            <>
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
                    Category
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                    {CATEGORY_LABELS[detail.expense_category] || detail.expense_category || '—'}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>
                    Amount
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--accent-600)' }}>
                    {formatCurrency(detail.expense_amount, country)}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>
                    Date
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                    {detail.expense_date ? formatDateOnly(detail.expense_date) : '—'}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>
                    Created On
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                    {detail.created_at ? formatDate(detail.created_at) : '—'}
                  </div>
                </div>
              </div>

              {detail.expense_notes && (
                <div style={{
                  background: 'var(--bg-page)',
                  border: '1px solid var(--border)',
                  borderRadius: 12,
                  padding: '14px 16px',
                  marginBottom: 20,
                }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>
                    Notes
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                    {detail.expense_notes}
                  </div>
                </div>
              )}

              {canManage && onEdit && (
                <button
                  onClick={() => {
                    const expenseData = {
                      expense_id: detail.expense_id,
                      expense_category: detail.expense_category,
                      expense_amount: detail.expense_amount,
                      expense_date: detail.expense_date,
                      expense_notes: detail.expense_notes,
                    }
                    onEdit(expenseData)
                  }}
                  style={{
                    width: '100%', padding: '10px 0',
                    background: 'var(--bg-page)', border: '1px solid var(--border)',
                    borderRadius: 'var(--r-md)', cursor: 'pointer',
                    color: 'var(--accent-600)', fontSize: 13, fontWeight: 600,
                    fontFamily: 'inherit', transition: 'background 0.12s',
                  }}
                >
                  Edit Expense
                </button>
              )}
            </>
          ) : null}
        </div>
      </div>
    </>
  )
}
