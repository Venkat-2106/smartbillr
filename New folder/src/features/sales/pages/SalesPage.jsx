import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useSales } from '../hooks/useSales';
import SaleDetailDrawer from '../components/SaleDetailDrawer';
import {
  Button, Table, Badge, SearchBar,
  Pagination, PageHeader, DateRangeFilter, ExportButton, SkeletonTable,
} from '../../../shared/components';
import { selectStyle }       from '../../../shared/components/FormField';
import { SALES_CSV_COLUMNS } from '../../../shared/utils/csvExport';
import { formatCurrency }    from '../../../shared/utils/formatCurrency';
import { formatDate }        from '../../../shared/utils/formatDate';

// Backend sends: "pending" | "partial" | "paid"
// "pending" = not yet paid (what the UI calls "Unpaid")
const STATUS_VARIANT = { paid: 'success', partial: 'warning', pending: 'danger' };
const STATUS_LABEL   = { paid: 'Paid',    partial: 'Partial', pending: 'Unpaid' };

export default function SalesPage() {
  const navigate = useNavigate();

  const {
    sales, exportData, isLoading, hasData, isError,
    totalItems, totalPages,
    search, setSearch,
    statusFilter, setStatusFilter,
    dateFrom, dateTo, handleDateChange,
    activeSearch, activeDateFilter, activeStatusFilter, anyFilterActive,
    sortKey, sortDir, handleSort,
    page, setPage,
    drawerSale, setDrawerSale,
    statusMutation,
  } = useSales();

  // ── Column definitions ───────────────────────────────────────────────────
  const columns = [
    {
      key: 'invoice_no',
      label: 'Invoice No',
      sortable: true,
      width: 130,
      render: (row) => (
        <span style={{
          fontWeight: 700, color: 'var(--accent-600)',
          fontFamily: 'monospace', fontSize: 13,
        }}>
          {row.invoice_no || '—'}
        </span>
      ),
    },
    {
      key: 'customer_name',
      label: 'Customer',
      sortable: true,
      render: (row) => (
        <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 13.5 }}>
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
          {formatCurrency(row.sales_final_amount || 0)}
        </span>
      ),
    },
    {
      key: 'tax_total',
      label: 'Tax',
      sortable: false,
      width: 100,
      render: (row) => (
        <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
          {formatCurrency(row.tax_total || 0)}
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
          label={STATUS_LABEL[row.sales_payment_status]    || row.sales_payment_status || '—'}
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
        <span style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>
          {(row.sales_payment_method || '—').replace('_', ' ').toUpperCase()}
        </span>
      ),
    },
    {
      key: 'sales_created_at',
      label: 'Date',
      sortable: true,
      width: 120,
      render: (row) => (
        <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
          {row.sales_created_at ? formatDate(row.sales_created_at) : '—'}
        </span>
      ),
    },
  ];

  const activeCount =
    (activeSearch ? 1 : 0) + (activeDateFilter ? 1 : 0) + (activeStatusFilter ? 1 : 0);

  return (
    <div style={{ padding: '36px 40px', maxWidth: 1400, margin: '0 auto' }}>

      <PageHeader
        title="Sales"
        subtitle="View and manage all sales invoices"
        back
        onBack={() => navigate('/dashboard')}
        action={
          <div style={{ display: 'flex', gap: 10 }}>
            <ExportButton
              data={exportData}
              filename="sales"
              columns={SALES_CSV_COLUMNS}
            />
            <Button variant="primary" onClick={() => navigate('/sales/new')}>
              + New Invoice
            </Button>
          </div>
        }
      />

      {/* Card */}
      <div style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 18,
        boxShadow: 'var(--shadow-card)',
        overflow: 'hidden',
      }}>

        {/* Toolbar */}
        <div style={{
          padding: '20px 24px',
          borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <SearchBar
              value={search}
              onChange={setSearch}
              onSearch={setSearch}
              placeholder="Search invoice, customer..."
              width="240px"
            />
            {/* Payment status filter */}
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              style={{ ...selectStyle, width: 'auto', padding: '9px 14px', fontSize: 13 }}
            >
              <option value="">All Statuses</option>
              <option value="paid">Paid</option>
              <option value="partial">Partial</option>
              <option value="pending">Unpaid</option>
            </select>
            <span style={{ fontSize: 12.5, color: 'var(--text-muted)', fontWeight: 500 }}>
              {totalItems} invoice{totalItems !== 1 ? 's' : ''}
              {activeCount > 0 && ' (filtered)'}
            </span>
          </div>
          <DateRangeFilter
            label="Invoice Date"
            from={dateFrom}
            to={dateTo}
            onChange={handleDateChange}
          />
        </div>

        {isError && (
          <div style={{
            margin: 24,
            background: 'var(--danger-bg)', border: '1px solid var(--danger-border)',
            borderRadius: 12, padding: '13px 18px', color: 'var(--danger-text)',
            fontSize: 13.5, fontWeight: 500,
          }}>
            ⚠️ Could not load sales. Check that the backend is running and refresh.
          </div>
        )}

        {isLoading && !hasData
          ? <SkeletonTable rows={10} columns={7} />
          : <Table
          columns={columns}
          rows={sales}
          loading={false}
          rowKey="sales_id"
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={handleSort}
          onRowClick={(row) => setDrawerSale(row)}
          emptyText={
            anyFilterActive
              ? 'No invoices match your current filters.'
              : 'No sales yet. Click "+ New Invoice" to create your first one.'
          }
        />}

        {!anyFilterActive && totalPages > 1 && (
          <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)' }}>
            <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
          </div>
        )}
      </div>

      {/* Detail drawer */}
      {drawerSale && (
        <SaleDetailDrawer
          sale={drawerSale}
          onClose={() => setDrawerSale(null)}
          statusMutation={statusMutation}
        />
      )}
    </div>
  );
}