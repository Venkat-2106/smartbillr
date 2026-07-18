import { useState } from 'react'
import { BentoCard, EmptyState } from '../../../shared/components'
import UpgradeBlur from '../../../shared/components/UpgradeBlur'
import { formatCurrency } from '../../../shared/utils/formatCurrency'
import { useInventoryValuation, useInventoryMovementSummary, useStockFlow, useMovingProducts, useReportCountry } from '../hooks/useReports'
import { StatCard, SectionTitle, InfoCard } from '../components/shared'
import { useFeatureAccess } from '../../../shared/hooks/useFeatureAccess'

export default function InventorySection({ dateFrom, dateTo }) {
  const { reason } = useFeatureAccess('financial_reports')
  const [movementPeriod, setMovementPeriod] = useState('monthly')
  const valuation = useInventoryValuation()
  const movementSummary = useInventoryMovementSummary(dateFrom, dateTo)
  const stockFlow = useStockFlow(dateFrom, dateTo)
  const moving = useMovingProducts(movementPeriod)
  const country = useReportCountry()

  const mv = movementSummary.data
  const sf = stockFlow.data

  return (
    <UpgradeBlur reason={reason}>
    <BentoCard>
      <SectionTitle title="Inventory Reports" subtitle="Stock levels, valuation, and movement analysis" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14, marginBottom: 20 }}>
        <StatCard label="Total Products" value={String(valuation.data?.total_products ?? '—')} sub={valuation.data ? `${valuation.data.total_stock_qty} units total` : ''} icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 2H2v10l9.29 9.29a2 2 0 002.83 0l6.17-6.17a2 2 0 000-2.83L12 2z"/><circle cx="7" cy="7" r="1"/></svg>} loading={valuation.isLoading} />
        <StatCard label="Stock Value" value={valuation.data?.total_value != null ? formatCurrency(valuation.data.total_value, country) : '—'} sub="Current stock × cost price" icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>} loading={valuation.isLoading} />
        <StatCard label="Stock In" value={sf?.stock_in ?? '—'} sub="Units received" icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>} loading={stockFlow.isLoading} />
        <StatCard label="Stock Out" value={sf?.stock_out ?? '—'} sub="Units sold/removed" icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>} loading={stockFlow.isLoading} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
        <InfoCard title="Stock Movement by Type">
          {mv && mv.length > 0 ? mv.map(m => (
            <div key={m.move_type} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{m.move_type.replace(/_/g, ' ')}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)' }}>{m.net_qty} units</span>
            </div>
          )) : <EmptyState title="No movements" description="" />}
        </InfoCard>
        <InfoCard title="Fast / Slow / Dead Stock" subtitle={`Based on ${movementPeriod} sales`}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            {['weekly', 'monthly', 'quarterly', 'yearly'].map(p => (
              <button key={p} onClick={() => setMovementPeriod(p)}
                style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)', cursor: 'pointer', fontSize: 11, fontWeight: 600,
                  background: movementPeriod === p ? 'var(--accent-500)' : 'transparent',
                  color: movementPeriod === p ? '#fff' : 'var(--text-secondary)' }}>{p}</button>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            {[
              { title: 'Fast', data: moving.data?.fast_moving ?? [], key: 'qty_sold' },
              { title: 'Slow', data: moving.data?.slow_moving ?? [], key: 'qty_sold' },
              { title: 'Dead', data: moving.data?.dead_stock ?? [], key: 'stock_qty' },
            ].map(box => (
              <div key={box.title} style={{ background: 'var(--bg-subtle)', borderRadius: 'var(--r-md)', padding: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8 }}>{box.title}</div>
                {box.data.slice(0, 5).map(item => (
                  <div key={item.prod_id} style={{ fontSize: 11.5, padding: '3px 0', color: 'var(--text-primary)', display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{item.prod_name}</span>
                    <span style={{ fontWeight: 600, marginLeft: 6, flexShrink: 0 }}>{item[box.key]}</span>
                  </div>
                ))}
                {box.data.length === 0 && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>None</div>}
              </div>
            ))}
          </div>
        </InfoCard>
      </div>
    </BentoCard>
    </UpgradeBlur>
  )
}
