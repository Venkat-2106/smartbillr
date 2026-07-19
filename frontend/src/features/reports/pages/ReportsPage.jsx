import { useState, useMemo, useCallback, lazy, Suspense } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePermissions } from '../../../shared/hooks/usePermissions'
import { SectionSkeleton } from '../components/shared'

// ─── Lazy-loaded sections ─────────────────────────────────────────────────────
const SummarySection = lazy(() => import('../sections/SummarySection'))
const SalesSection = lazy(() => import('../sections/SalesSection'))
const PurchasesSection = lazy(() => import('../sections/PurchasesSection'))
const ProfitSection = lazy(() => import('../sections/ProfitSection'))
const InventorySection = lazy(() => import('../sections/InventorySection'))
const CustomersSection = lazy(() => import('../sections/CustomersSection'))
const SuppliersSection = lazy(() => import('../sections/SuppliersSection'))
const ExpensesSection = lazy(() => import('../sections/ExpensesSection'))
const TaxSection = lazy(() => import('../sections/TaxSection'))
const ReturnsSection = lazy(() => import('../sections/ReturnsSection'))
const PaymentsSection = lazy(() => import('../sections/PaymentsSection'))
const AuditSection = lazy(() => import('../sections/AuditSection'))

// ─── Tab Config ────────────────────────────────────────────────────────────────
const _S = (d) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>

const TABS = [
  { key: 'summary', label: 'Summary', icon: _S(<><rect x="3" y="12" width="4" height="9"/><rect x="10" y="7" width="4" height="14"/><rect x="17" y="3" width="4" height="18"/></>), permission: 'reports.view' },
  { key: 'sales', label: 'Sales', icon: _S(<><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></>), permission: 'reports.view' },
  { key: 'purchases', label: 'Purchases', icon: _S(<><path d="M16.5 9.4 7.55 4.24"/><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 002 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><polyline points="3.29 7 12 12 20.71 7"/><line x1="12" y1="22" x2="12" y2="12"/></>), permission: 'reports.view' },
  { key: 'profit', label: 'Profitability', icon: _S(<><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></>), permission: 'reports.view', financial: true },
  { key: 'inventory', label: 'Inventory', icon: _S(<><path d="M12 2H2v10l9.29 9.29a2 2 0 002.83 0l6.17-6.17a2 2 0 000-2.83L12 2z"/><circle cx="7" cy="7" r="1"/></>), permission: 'reports.view' },
  { key: 'customers', label: 'Customers', icon: _S(<><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></>), permission: 'reports.view' },
  { key: 'suppliers', label: 'Suppliers', icon: _S(<><rect x="4" y="2" width="16" height="20"/><path d="M9 22v-4h6v4"/><path d="M8 6h2"/><path d="M8 10h2"/><path d="M14 6h2"/><path d="M14 10h2"/></>), permission: 'reports.view' },
  { key: 'expenses', label: 'Expenses', icon: _S(<><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></>), permission: 'reports.view' },
  { key: 'tax', label: 'Tax', icon: _S(<><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></>), permission: 'reports.view', financial: true },
  { key: 'returns', label: 'Returns', icon: _S(<><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></>), permission: 'reports.view', financial: true },
  { key: 'payments', label: 'Payments', icon: _S(<><rect x="1" y="6" width="22" height="12" rx="2"/><circle cx="7" cy="12" r="2"/><path d="M17 12h.01"/></>), permission: 'reports.view', financial: true },
  { key: 'audit', label: 'Audit', icon: _S(<><path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/></>), permission: 'reports.view' },
]

// ─── Section Renderer ──────────────────────────────────────────────────────────
const SECTIONS = {
  summary: SummarySection,
  sales: SalesSection,
  purchases: PurchasesSection,
  profit: ProfitSection,
  inventory: InventorySection,
  customers: CustomersSection,
  suppliers: SuppliersSection,
  expenses: ExpensesSection,
  tax: TaxSection,
  returns: ReturnsSection,
  payments: PaymentsSection,
  audit: AuditSection,
}

// ─── Date Range Presets ────────────────────────────────────────────────────────
function formatLocalDate(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function getDatePreset(preset) {
  const now = new Date()
  const today = formatLocalDate(now)
  switch (preset) {
    case 'today':
      return { dateFrom: today, dateTo: today }
    case 'week': {
      const d = new Date(now); d.setDate(d.getDate() - 6)
      return { dateFrom: formatLocalDate(d), dateTo: today }
    }
    case 'month': {
      const d = new Date(now); d.setDate(1)
      return { dateFrom: formatLocalDate(d), dateTo: today }
    }
    case 'quarter': {
      const d = new Date(now); d.setMonth(d.getMonth() - 3)
      return { dateFrom: formatLocalDate(d), dateTo: today }
    }
    case 'year': {
      const d = new Date(now); d.setFullYear(d.getFullYear() - 1)
      return { dateFrom: formatLocalDate(d), dateTo: today }
    }
    case 'all':
      return { dateFrom: '', dateTo: '' }
    default:
      return { dateFrom: '', dateTo: '' }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════════

export default function ReportsPage() {
  const navigate = useNavigate()
  const { can } = usePermissions()
  const canFinancial = can('dashboard.financial')
  const [activeTab, setActiveTab] = useState('summary')
  const [datePreset, setDatePreset] = useState('all')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')

  const dateRange = useMemo(() => {
    if (datePreset === 'custom') return { dateFrom: customFrom, dateTo: customTo }
    return getDatePreset(datePreset)
  }, [datePreset, customFrom, customTo])

  const visibleTabs = useMemo(
    () => TABS.filter(t => !t.financial || canFinancial),
    [canFinancial]
  )

  const safeActiveTab = useMemo(
    () => visibleTabs.some(t => t.key === activeTab) ? activeTab : 'summary',
    [activeTab, visibleTabs]
  )

  const handlePresetChange = useCallback((preset) => {
    setDatePreset(preset)
    if (preset !== 'custom') {
      setCustomFrom('')
      setCustomTo('')
    }
  }, [])

  const PRESETS = [
    { key: 'today', label: 'Today' },
    { key: 'week', label: 'This Week' },
    { key: 'month', label: 'This Month' },
    { key: 'quarter', label: 'This Quarter' },
    { key: 'year', label: 'This Year' },
    { key: 'all', label: 'All Time' },
    { key: 'custom', label: 'Custom' },
  ]

  const ActiveSection = SECTIONS[safeActiveTab]

  return (
    <>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.03em', margin: 0 }}>
          Reports
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '6px 0 0', fontWeight: 400 }}>
          Business performance and financial reporting
        </p>
      </div>

      {/* ── Date Range Filter ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
        marginBottom: 24, padding: '10px 14px', background: 'var(--bg-card)',
        border: '1px solid var(--border)', borderRadius: 12,
      }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Period</span>
        {PRESETS.map(p => (
          <button key={p.key} onClick={() => handlePresetChange(p.key)}
            style={{ padding: '4px 12px', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)', cursor: 'pointer', fontSize: 12, fontWeight: 600,
              background: datePreset === p.key ? 'var(--accent-500)' : 'transparent',
              color: datePreset === p.key ? '#fff' : 'var(--text-secondary)',
              transition: 'background 0.15s, color 0.15s' }}>{p.label}</button>
        ))}
        {datePreset === 'custom' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 4 }}>
            <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
              style={{ padding: '4px 8px', borderRadius: 'var(--r-sm)', border: '1.5px solid var(--border)', fontSize: 12, background: 'var(--bg-card)', color: 'var(--text-primary)', outline: 'none' }} />
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>to</span>
            <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
              style={{ padding: '4px 8px', borderRadius: 'var(--r-sm)', border: '1.5px solid var(--border)', fontSize: 12, background: 'var(--bg-card)', color: 'var(--text-primary)', outline: 'none' }} />
          </div>
        )}
      </div>

      {/* ── Tab Navigation ── */}
      <div style={{
        display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 28,
        padding: 4, background: 'var(--bg-subtle)', borderRadius: 12,
        border: '1px solid var(--border)',
      }}>
        {visibleTabs.map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            style={{
              padding: '8px 16px', borderRadius: 9, border: 'none', cursor: 'pointer',
              fontSize: 13, fontWeight: 600, transition: 'all 0.15s',
              background: safeActiveTab === tab.key ? 'var(--bg-card)' : 'transparent',
              color: safeActiveTab === tab.key ? 'var(--accent-500)' : 'var(--text-secondary)',
              boxShadow: safeActiveTab === tab.key ? '0 1px 4px rgba(0,0,0,0.06)' : 'none',
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Active Report Section ── */}
      <Suspense fallback={<SectionSkeleton />}>
        <ActiveSection dateFrom={dateRange.dateFrom} dateTo={dateRange.dateTo} />
      </Suspense>
    </>
  )
}
