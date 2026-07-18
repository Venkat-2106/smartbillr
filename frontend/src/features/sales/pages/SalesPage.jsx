import React, { useCallback, useEffect, useMemo, useState } from 'react';

// UI/UX Audit (2026-07-18):
//   Finding #1  — PageHeader replaces inline page title markup
//   Finding #6  — EmptyState with built-in context icon replaces inline SVG
//   Finding #11 — SkeletonTable shown during initial load (isInitialLoading)
//   Finding #12 — selectStyle applied to status filter select
//   Finding #14 — .bento-grid.bento-grid-12 for metric cards
//   Finding #15 — Dismissible error banner with role="alert"
//   See UI_UX_AUDIT_REPORT.md
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useLocation } from 'react-router-dom';
import { useSales } from '../hooks/useSales';
import { fetchSalesSummary } from '../api/salesApi';
import SaleDetailDrawer from '../components/SaleDetailDrawer';
import {
  Table, Button, Badge, SearchBar,
  Pagination, DateRangeFilter, ExportButton, ImportButton,
  ConfirmDialog, EmptyState, BentoCard, MetricCard,
  UpgradePrompt, PageHeader,
} from '../../../shared/components';
import { selectStyle }       from '../../../shared/components/FormField';
import { SALES_CSV_COLUMNS, SALES_IMPORT_TEMPLATE } from '../../../shared/utils/csvExport';
import { formatCurrency }    from '../../../shared/utils/formatCurrency';
import { formatDate }        from '../../../shared/utils/formatDate';
import useAuthStore          from '../../../store/authStore';
import useTableKeyboardNav   from '../../../shared/hooks/useTableKeyboardNav';

const STATUS_VARIANT = { paid: 'success', partial: 'warning', pending: 'danger' };
const STATUS_LABEL   = { paid: 'Paid',    partial: 'Partial', pending: 'Unpaid' };

function SvgIcon({ path, size = 18 }) {
  return (
    <svg width={size} height={size} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={path} />
    </svg>
  )
}

export default function SalesPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const business       = useAuthStore(s => s.business);
  const country        = business?.business_country_code || 'IN';
  const subscription   = useAuthStore(s => s.subscription);
  const hasPermission  = useAuthStore(s => s.hasPermission);
  const canCreate      = hasPermission('sales.create');
  const [showUpgradeBanner, setShowUpgradeBanner] = useState(true);

  const {
    sales, isLoading, hasData, isError,
    totalItems, totalPages,
    search, setSearch,
    statusFilter, setStatusFilter,
    dateFrom, dateTo, handleDateChange,
    activeSearch, activeDateFilter, activeStatusFilter, anyFilterActive,
    sortKey, sortDir, handleSort,
    page, setPage,
    drawerSale, setDrawerSale,
    statusMutation,
    deleteSale, isDeleting,
    isExporting, handleExport,
  } = useSales();

  const [bannerDismissed, setBannerDismissed] = useState(false)
  useEffect(() => { setBannerDismissed(false) }, [isError])

  const { data: salesSummary, isLoading: summaryLoading } = useQuery({
    queryKey: ['sales-summary'],
    queryFn: fetchSalesSummary,
    staleTime: 5 * 60_000,
  });

  const [showDelete,   setShowDelete]   = useState(false);
  const [deletingSale, setDeletingSale] = useState(null);
  const [restoreStock, setRestoreStock] = useState(false);

  function handleDeleteClick(sale) {
    setDeletingSale(sale);
    setRestoreStock(false);
    setShowDelete(true);
  }

  function handleCloseDelete() {
    setShowDelete(false);
    setDeletingSale(null);
    setRestoreStock(false);
  }

  function onConfirmDelete() {
    deleteSale(deletingSale.sales_id, restoreStock, { onSuccess: handleCloseDelete });
  }

  useEffect(() => {
    if (location.state?.openInvoice) {
      setDrawerSale({
        sales_id:   location.state.openInvoice,
        invoice_no: location.state.invoiceNo || '',
        _autoPrint: location.state.autoPrint === true,
      });
      window.history.replaceState({}, '');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const columns = useMemo(() => [
    {
      key: 'invoice_no',
      label: 'Invoice No',
      sortable: true,
      width: 130,
      render: (row) => (
        <span style={{ fontWeight: 700, color: 'var(--accent-600)', fontFamily: "'JetBrains Mono', monospace", fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>
          {row.invoice_no || '-'}
        </span>
      ),
    },
    {
      key: 'customer_name',
      label: 'Customer',
      sortable: true,
      render: (row) => (
        <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 13 }}>
          {row.customer_name || 'Walk-in'}
        </span>
      ),
    },
    {
      key: 'sales_final_amount',
      label: 'Amount',
      sortable: true,
      width: 130,
      render: (row) => (
        <span style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: 14 }}>
          {formatCurrency(row.sales_final_amount || 0, country)}
        </span>
      ),
    },
    {
      key: 'tax_total',
      label: 'Tax',
      sortable: false,
      width: 100,
      render: (row) => (
        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          {formatCurrency(row.tax_total || 0, country)}
        </span>
      ),
    },
    {
      key: 'sales_payment_status',
      label: 'Status',
      sortable: true,
      width: 100,
      render: (row) => (
        <Badge
          variant={STATUS_VARIANT[row.sales_payment_status] || 'default'}
          label={STATUS_LABEL[row.sales_payment_status] || row.sales_payment_status || '-'}
          dot
        />
      ),
    },
    {
      key: 'sales_payment_method',
      label: 'Method',
      sortable: false,
      width: 120,
      render: (row) => (
        <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          {(row.sales_payment_method || '-').replace('_', ' ').toUpperCase()}
        </span>
      ),
    },
    {
      key: 'sales_created_at',
      label: 'Date',
      sortable: true,
      width: 120,
      render: (row) => (
        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          {row.sales_created_at ? formatDate(row.sales_created_at) : '-'}
        </span>
      ),
    },
    {
      key:      'updated_at',
      label:    'Last Updated',
      sortable: true,
      width:    110,
      render: (row) => (
        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          {row.updated_at ? formatDate(row.updated_at) : '—'}
        </span>
      ),
    },
    {
      key:      'last_updated_by',
      label:    'Last Updated By',
      sortable: false,
      width:    140,
      render: (row) => (
        row.last_updated_by
          ? (
            <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 500 }}>
              {row.last_updated_by}
            </span>
          )
          : <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>—</span>
      ),
    },
    {
      key: 'actions',
      label: '',
      sortable: false,
      width: 60,
      render: (row) => (
        <button
          onClick={(e) => { e.stopPropagation(); handleDeleteClick(row); }}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--danger)', padding: '4px 8px',
          }}
          title="Delete invoice"
        >
          <SvgIcon path="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" size={15} />
        </button>
      ),
    },
  ], []);

  const handleRowClick = useCallback((row) => setDrawerSale(row), [])

  const { selectedIndex, setSelectedIndex } = useTableKeyboardNav({
    rows: sales,
    rowKey: 'sales_id',
    onEnterRow: handleRowClick,
    onDeleteRow: handleDeleteClick,
  })

  const activeCount =
    (activeSearch ? 1 : 0) + (activeDateFilter ? 1 : 0) + (activeStatusFilter ? 1 : 0);

  return (
    <div>
      <PageHeader
        title="Sales"
        subtitle="View and manage all sales invoices"
        back
        onBack={() => navigate('/dashboard')}
        action={
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <ExportButton onFetch={handleExport} filename="sales" columns={SALES_CSV_COLUMNS} />
            {canCreate && (
              <ImportButton
                endpoint="/v1/sales/import"
                title="Sales"
                columns={SALES_IMPORT_TEMPLATE}
              />
            )}
            {canCreate && (
              <Button variant="primary" onClick={() => navigate('/sales/new')} data-shortcut="new">
                + New Invoice
              </Button>
            )}
          </div>
        }
      />

      {showUpgradeBanner && subscription?.subscription_type === 'trial' && (
        <UpgradePrompt
          variant="banner"
          feature="sales"
          onDismiss={() => setShowUpgradeBanner(false)}
          style={{ marginBottom: 24 }}
        />
      )}

      <div className="bento-grid bento-grid-12" style={{ marginBottom: 24 }}>
        <MetricCard
          icon={<SvgIcon path="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />}
          label="Today's Sales"
          value={salesSummary?.today_revenue != null ? formatCurrency(salesSummary.today_revenue, country) : null}
          locked={!!salesSummary?.financial_locked_reason}
          colSpan={3}
          loading={isLoading || summaryLoading}
        />
        <MetricCard
          icon={<SvgIcon path="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />}
          label="Weekly Sales"
          value={salesSummary?.weekly_revenue != null ? formatCurrency(salesSummary.weekly_revenue, country) : null}
          locked={!!salesSummary?.financial_locked_reason}
          colSpan={3}
          loading={isLoading || summaryLoading}
        />
        <MetricCard
          icon={<SvgIcon path="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />}
          label="Monthly Sales"
          value={salesSummary?.monthly_revenue != null ? formatCurrency(salesSummary.monthly_revenue, country) : null}
          locked={!!salesSummary?.financial_locked_reason}
          colSpan={3}
          loading={isLoading || summaryLoading}
        />
        <MetricCard
          icon={<SvgIcon path="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />}
          label="Outstanding Payments"
          value={salesSummary?.outstanding_receivables != null ? formatCurrency(salesSummary.outstanding_receivables, country) : null}
          locked={!!salesSummary?.financial_locked_reason}
          colSpan={3}
          loading={isLoading || summaryLoading}
        />
      </div>

      <div style={{
        display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', flexWrap: 'wrap',
        gap: 12, marginBottom: 24,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <SearchBar
            value={search}
            onChange={setSearch}
            onSearch={setSearch}
            placeholder="Search invoice, customer..."
            width="240px"
          />
          <select
            className="sb-select"
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            style={{ ...selectStyle, width: 'auto', padding: '9px 32px 9px 14px', fontSize: 13 }}
          >
            <option value="">All Statuses</option>
            <option value="paid">Paid</option>
            <option value="partial">Partial</option>
            <option value="pending">Unpaid</option>
          </select>
          <span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 500 }}>
            {totalItems} invoice{totalItems !== 1 ? 's' : ''}
            {activeCount > 0 && ' (filtered)'}
          </span>
          {anyFilterActive && (
            <button
              onClick={() => { setSearch(''); setStatusFilter(''); handleDateChange('from', ''); handleDateChange('to', '') }}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: 12, color: 'var(--accent-600)', fontWeight: 600,
                padding: '2px 6px', fontFamily: 'inherit',
              }}
            >
              Clear filters
            </button>
          )}
        </div>
        <DateRangeFilter
          label="Invoice Date"
          from={dateFrom}
          to={dateTo}
          onChange={handleDateChange}
        />
      </div>

      {isError && !bannerDismissed && (
        <div role="alert" style={{
          background: 'var(--danger-bg)', border: '1px solid var(--danger-border)',
          borderRadius: 8, padding: '12px 16px', color: 'var(--danger-text)',
          fontSize: 13, marginBottom: 24, fontWeight: 500,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          Could not load sales. Check that the backend is running and refresh.
          <button type="button" onClick={() => setBannerDismissed(true)} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--danger-text)', cursor: 'pointer', padding: 2, lineHeight: 1, flexShrink: 0 }} aria-label="Dismiss error">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>
      )}

      {!isLoading && sales.length === 0 ? (
        <BentoCard>
          <EmptyState
            context="sale"
            title={anyFilterActive ? 'No matching results' : 'No sales yet'}
            description={anyFilterActive
              ? 'Try adjusting your search or filters.'
              : 'Create your first sale to start tracking revenue.'}
            action={anyFilterActive ? (
              <Button variant="secondary" size="sm" onClick={() => { setSearch(''); setStatusFilter(''); handleDateChange('from', ''); handleDateChange('to', '') }}>
                Clear filters
              </Button>
            ) : canCreate ? (
              <Button variant="primary" size="sm" onClick={() => navigate('/sales/new')}>
                New Sale
              </Button>
            ) : undefined}
          />
        </BentoCard>
      ) : (
        <BentoCard padding={false} className="premium-table-wrap">
          <div className="premium-table" style={{ overflowX: 'auto', width: '100%' }}>
            <Table
              columns={columns}
              rows={sales}
              rowKey="sales_id"
              loading={isLoading}
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={handleSort}
              onRowClick={handleRowClick}
              selectedIndex={selectedIndex}
              onSelectedIndexChange={setSelectedIndex}
            />
          </div>
        </BentoCard>
      )}

      <div style={{ marginTop: 24 }}>
        <Pagination
          pagination={{
            page,
            total_pages: totalPages,
            total:       totalItems,
            has_next:    page < totalPages,
            has_prev:    page > 1,
          }}
          onPageChange={setPage}
        />
      </div>

      {drawerSale && (
        <SaleDetailDrawer
          sale={drawerSale}
          onClose={() => setDrawerSale(null)}
          statusMutation={statusMutation}
        />
      )}

      <ConfirmDialog
        open={showDelete}
        onClose={handleCloseDelete}
        onConfirm={onConfirmDelete}
        title={`Delete "${deletingSale?.invoice_no}"?`}
        message="This action cannot be undone. The invoice will be soft-deleted and will no longer appear in reports."
        confirmText={isDeleting ? 'Deleting...' : 'Yes, Delete Invoice'}
        loading={isDeleting}
      >
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-secondary)', cursor: 'pointer', userSelect: 'none', padding: '4px 0' }}>
          <input type="checkbox" checked={restoreStock} onChange={(e) => setRestoreStock(e.target.checked)} style={{ accentColor: 'var(--accent-600)', cursor: 'pointer' }} />
          Restore product stock
        </label>
      </ConfirmDialog>
    </div>
  );
}
