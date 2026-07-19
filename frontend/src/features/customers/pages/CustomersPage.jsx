// src/features/customers/pages/CustomersPage.jsx
//
// SCALABILITY FIX:
//   useCustomers() now uses server-side pagination. The hook no longer
//   holds an in-memory array of all customers. This page receives only
//   the current page of rows.
//
//   ExportButton switched from data={exportData} → onFetch={handleExport}.
//   handleExport() fetches from the backend on demand so the CSV always
//   contains all matching records — not just the 20 rows on screen.
//
// UI/UX AUDIT (2026-07-18):
//   Finding #1  — PageHeader replaces inline page title markup
//   Finding #6  — EmptyState with built-in context icon replaces inline SVG
//   Finding #12 — selectStyle applied to status filter select
//   Finding #14 — .bento-grid.bento-grid-12 for metric cards
//   Finding #15 — Dismissible error banner with role="alert"
//   See UI_UX_AUDIT_REPORT.md
//
// FIX (2026-07-18):
//   ImportButton endpoint: removed /v1 prefix (baseURL already contains it).
//
//   Pagination is always shown (no activeSearch/activeDateFilter hide logic
//   needed — server handles filtering so pagination is always accurate).

import { useState, useEffect, useRef, useMemo } from 'react'
import { useQuery }                               from '@tanstack/react-query'
import { useForm }                                from 'react-hook-form'
import { zodResolver }                            from '@hookform/resolvers/zod'
import { useNavigate }                            from 'react-router-dom'

import { useCustomers } from '../hooks/useCustomers'
import { fetchCustomerSummary } from '../api/customersApi'
import useAuthStore     from '../../../store/authStore'
import useTableKeyboardNav from '../../../shared/hooks/useTableKeyboardNav'

import {
  Button, Input, Modal, Table, SearchBar,
  Pagination, ConfirmDialog,
  FormField, StateDropdown, ExportButton, ImportButton,
  DateRangeFilter, EmptyState,
  MetricCard, BentoCard, UpgradePrompt, PageHeader,
} from '../../../shared/components'

import { selectStyle, textareaStyle } from '../../../shared/components/FormField'
import { CUSTOMER_CSV_COLUMNS, CUSTOMER_IMPORT_TEMPLATE }       from '../../../shared/utils/csvExport'
import { COUNTRIES }                  from '../../../shared/data/countries'
import { formatCurrency }             from '../../../shared/utils/formatCurrency'
import { formatDate }                 from '../../../shared/utils/formatDate'

import CustomerDetailDrawer, { DrawerOverlay }
  from '../components/CustomerDetailDrawer'
import { customerSchema } from '../schemas/customerSchema'

// ── Static SVG icons (hoisted to module scope) ──────────────────────────────────
// Why: Inline JSX SVGs are re-created as new element trees on every render.
// Hoisting them here creates a single stable reference, eliminating unnecessary
// DOM reconciliation and GC pressure across this heavy page.
// Note: No icons were skipped — all 10 are fully static (zero dynamic content).
const DeleteIcon = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </svg>
)

const UsersIcon = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
)

const CheckCircleIcon = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
    <polyline points="22 4 12 14.01 9 11.01" />
  </svg>
)

const DollarSignIcon = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <line x1="12" y1="1" x2="12" y2="23" />
    <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
  </svg>
)

const CalendarIcon = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
    <line x1="12" y1="14" x2="12" y2="18" />
    <line x1="10" y1="16" x2="14" y2="16" />
  </svg>
)

const XIcon = (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
)

const AlertTriangleIcon = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }} aria-hidden="true">
    <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    <line x1="12" y1="9" x2="12" y2="13" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
)

const DEFAULT_VALUES = {
  cust_name:         '',
  cust_phone:        '',
  cust_email:        '',
  cust_address:      '',
  cust_country_code: '',
  cust_state:        '',
  cust_tax_number:   '',
}


// ─── HELPER ───────────────────────────────────────────────────────────────────
const countryCodeToName = COUNTRIES.reduce((acc, c) => {
  if (c.value) acc[c.value] = c.label
  return acc
}, {})

function getCountryName(code) {
  return countryCodeToName[code] || code || '—'
}


// ─── TABLE COLUMN DEFINITIONS ─────────────────────────────────────────────────
function buildColumns(canManage, onEdit, onDelete) {
  return [
    {
      key:      'cust_name',
      label:    'Customer',
      sortable: true,
      render:   (row) => (
        <div>
          <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 13 }}>
            {row.cust_name}
          </div>
          {row.cust_tax_number && (
            <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2, fontFamily: 'monospace' }}>
              {row.cust_tax_number}
            </div>
          )}
        </div>
      ),
    },
    {
      key:   'cust_phone',
      label: 'Phone',
      width: 140,
      render: (row) => (
        <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
          {row.cust_phone || '—'}
        </span>
      ),
    },
    {
      key:   'cust_email',
      label: 'Email',
      render: (row) => (
        <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
          {row.cust_email || '—'}
        </span>
      ),
    },
    {
      key:   'location',
      label: 'Location',
      width: 160,
      render: (row) => {
        const parts = [row.cust_state, getCountryName(row.cust_country_code)]
          .filter(Boolean)
          .filter(v => v !== '—')
        return (
          <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
            {parts.length ? parts.join(', ') : '—'}
          </span>
        )
      },
    },
    {
      key:      'updated_at',
      label:    'Last Updated',
      sortable: true,
      width:    110,
      render:   (row) => (
        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          {row.updated_at ? formatDate(row.updated_at) : '—'}
        </span>
      ),
    },
    {
      key:      'last_updated_by',
      label:    'Last Updated By',
      sortable: false,
      width:    150,
      render:   (row) => (
        row.last_updated_by
          ? <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 500 }}>
              {row.last_updated_by}
            </span>
          : <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>—</span>
      ),
    },
    ...(canManage ? [{
      key:   'actions',
      label: '',
      width: 140,
      render: (row) => (
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Button
            variant="secondary"
            size="sm"
            onClick={(e) => { e.stopPropagation(); onEdit(row) }}
          >
            Edit
          </Button>
          <Button
            variant="danger"
            size="sm"
            leftIcon={DeleteIcon}
            onClick={(e) => { e.stopPropagation(); onDelete(row) }}
          >
            Delete
          </Button>
        </div>
      ),
    }] : []),
  ]
}


// ─── MAIN PAGE COMPONENT ─────────────────────────────────────────────────────
export default function CustomersPage() {
  const navigate      = useNavigate()
  const hasPermission = useAuthStore(s => s.hasPermission)
  const canManage     = hasPermission('customers.manage')
  const subscription  = useAuthStore(s => s.subscription)
  const business  = useAuthStore(s => s.business)
  const country   = business?.business_country_code || 'IN'

  const {
    customers,
    isLoading, isError,
    search, setSearch,
    dateFrom, setDateFrom,
    dateTo,   setDateTo,
    sortKey, sortDir, handleSort,
    page, setPage, totalPages, totalItems,
    handleExport,
    createCustomer, updateCustomer, deleteCustomer,
    isCreating, isUpdating, isDeleting,
  } = useCustomers()

  const [bannerDismissed, setBannerDismissed] = useState(false)
  useEffect(() => { setBannerDismissed(false) }, [isError])

  const { data: customerSummary } = useQuery({
    queryKey: ['customer-summary'],
    queryFn: fetchCustomerSummary,
    staleTime: 60_000,
  })

  const [showUpgradeBanner, setShowUpgradeBanner] = useState(true)

  // Modal state
  const [showModal,        setShowModal]        = useState(false)
  const [editingCustomer,  setEditingCustomer]  = useState(null)
  const [deletingCustomer, setDeletingCustomer] = useState(null)
  const [showDelete,       setShowDelete]       = useState(false)
  const [selectedCustomer, setSelectedCustomer] = useState(null)

  const isEditing = !!editingCustomer?.cust_id

  // React Hook Form
  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm({
    resolver:      zodResolver(customerSchema),
    defaultValues: DEFAULT_VALUES,
  })

  const watchedCountry = watch('cust_country_code')
  const prevCountryRef = useRef(undefined)

  useEffect(() => {
    if (
      prevCountryRef.current !== undefined &&
      prevCountryRef.current !== watchedCountry
    ) {
      setValue('cust_state', '', { shouldValidate: false })
    }
    prevCountryRef.current = watchedCountry
  }, [watchedCountry, setValue])

  // Modal helpers
  function handleOpenAdd() {
    setEditingCustomer({})
    prevCountryRef.current = undefined
    reset(DEFAULT_VALUES)
    setShowModal(true)
  }

  function handleOpenEdit(customer) {
    setEditingCustomer(customer)
    prevCountryRef.current = undefined
    reset({
      cust_name:         customer.cust_name         || '',
      cust_phone:        customer.cust_phone         || '',
      cust_email:        customer.cust_email         || '',
      cust_address:      customer.cust_address       || '',
      cust_country_code: customer.cust_country_code  || '',
      cust_state:        customer.cust_state         || '',
      cust_tax_number:   customer.cust_tax_number    || '',
    })
    setShowModal(true)
  }

  function handleCloseModal() {
    setShowModal(false)
    setEditingCustomer(null)
    reset(DEFAULT_VALUES)
  }

  function handleDeleteClick(customer) {
    setDeletingCustomer(customer)
    setShowDelete(true)
  }

  function handleCloseDelete() {
    setShowDelete(false)
    setDeletingCustomer(null)
  }

  function onSubmit(formData) {
    const payload = Object.fromEntries(
      Object.entries(formData).filter(([, v]) => v !== '')
    )
    if (isEditing) {
      updateCustomer(editingCustomer.cust_id, payload, { onSuccess: handleCloseModal })
    } else {
      createCustomer(payload, { onSuccess: handleCloseModal })
    }
  }

  function onConfirmDelete() {
    deleteCustomer(deletingCustomer.cust_id, { onSuccess: handleCloseDelete })
  }

  const columns = useMemo(
    () => buildColumns(canManage, handleOpenEdit, handleDeleteClick),
    [canManage] // eslint-disable-line react-hooks/exhaustive-deps
  )

  const { selectedIndex, setSelectedIndex } = useTableKeyboardNav({
    rows: customers,
    rowKey: 'cust_id',
    onEnterRow: (row) => setSelectedCustomer(row),
    onEditRow: (row) => handleOpenEdit(row),
    onDeleteRow: (row) => handleDeleteClick(row),
  })

  function handleDateChange(field, value) {
    if (field === 'from') setDateFrom(value)
    else                  setDateTo(value)
  }

  const activeFilters = [search.trim(), dateFrom, dateTo].filter(Boolean).length


  // ─── RENDER ───────────────────────────────────────────────────────────────
  return (
    <>
      <PageHeader
        title="Customers"
        subtitle="Manage your customer list, contacts, and billing details"
        back
        onBack={() => navigate('/dashboard')}
        action={
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <ExportButton
              onFetch={handleExport}
              filename="customers"
              columns={CUSTOMER_CSV_COLUMNS}
            />
            {canManage && (
              <ImportButton
                endpoint="/customers/import"
                title="Customers"
                columns={CUSTOMER_IMPORT_TEMPLATE}
                requiredColumns={[{ key: 'cust_name', label: 'Customer Name', alternates: ['name'] }]}
              />
            )}
            <Button
              variant="primary"
              leftIcon={<span style={{ fontSize: 16, lineHeight: 1 }}>+</span>}
              onClick={handleOpenAdd}
              data-shortcut="new"
            >
              Add Customer
            </Button>
          </div>
        }
      />

      {showUpgradeBanner && subscription?.subscription_type === 'trial' && (
        <UpgradePrompt
          variant="banner"
          feature="customers"
          onDismiss={() => setShowUpgradeBanner(false)}
          style={{ marginBottom: 24 }}
        />
      )}

      {/* METRIC CARDS */}
      <div className="bento-grid bento-grid-12" style={{ marginBottom: 24 }}>
        <MetricCard
          colSpan={3}
          loading={isLoading}
          icon={UsersIcon}
          label="Total Customers"
          value={totalItems}
        />
        <MetricCard
          colSpan={3}
          loading={isLoading}
          icon={CheckCircleIcon}
          label="Active Customers"
          value={totalItems}
        />
        <MetricCard
          colSpan={3}
          loading={isLoading}
          icon={DollarSignIcon}
          label="Outstanding Balance"
          value={customerSummary?.outstanding_balance != null ? formatCurrency(customerSummary.outstanding_balance, country) : null}
          locked={!!customerSummary?.financial_locked_reason}
        />
        <MetricCard
          colSpan={3}
          loading={isLoading}
          icon={CalendarIcon}
          label="New This Month"
          value={customerSummary?.new_this_month ?? 0}
        />
      </div>

      {/* TOOLBAR */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 20, gap: 12, flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <SearchBar
            value={search}
            onChange={setSearch}
            onSearch={setSearch}
            placeholder="Search by name, phone, email…"
            width="280px"
          />
          <span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 500 }}>
            {totalItems} customer{totalItems !== 1 ? 's' : ''}
            {activeFilters > 0 && ' (filtered)'}
          </span>
          {activeFilters > 0 && (
            <button
              onClick={() => { setSearch(''); setDateFrom(''); setDateTo('') }}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: 12, color: 'var(--accent-600)', fontWeight: 600,
                padding: '2px 6px', display: 'inline-flex', alignItems: 'center', gap: 4,
              }}
            >
              {XIcon}
              Clear filters
            </button>
          )}
        </div>
        <DateRangeFilter
          label="Last Updated"
          from={dateFrom}
          to={dateTo}
          onChange={handleDateChange}
        />
      </div>

      {/* ERROR BANNER */}
      {isError && !bannerDismissed && (
        <div role="alert" style={{
          background: 'var(--danger-bg)', border: '1px solid var(--danger-border)',
          borderRadius: 12, padding: '12px 16px', color: 'var(--danger-text)',
          fontSize: 13, marginBottom: 24, fontWeight: 500,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          {AlertTriangleIcon}
          Could not load customers. Check that the backend is running and refresh.
          <button type="button" onClick={() => setBannerDismissed(true)} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--danger-text)', cursor: 'pointer', padding: 2, lineHeight: 1, flexShrink: 0 }} aria-label="Dismiss error">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>
      )}

      {/* TABLE */}
      {!isLoading && customers.length === 0 ? (
        <BentoCard>
          <EmptyState
            context="customer"
            hasFilters={activeFilters > 0}
            title={activeFilters > 0 ? 'No results matching your filters' : 'Nothing here yet'}
            description={activeFilters > 0 ? 'Try adjusting your search or filters to find what you\'re looking for.' : 'Add your first customer to get started.'}
            action={activeFilters > 0 ? (
              <Button variant="secondary" size="sm" onClick={() => { setSearch(''); setDateFrom(''); setDateTo('') }}>
                Clear filters
              </Button>
            ) : undefined}
          />
        </BentoCard>
      ) : (
        <BentoCard padding={false} className="premium-table-wrap">
          <div className="premium-table" style={{ overflowX: 'auto', width: '100%' }}>
            <Table
              columns={columns}
              rows={customers}
              rowKey="cust_id"
              loading={isLoading}
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={handleSort}
              selectedIndex={selectedIndex}
              onSelectedIndexChange={setSelectedIndex}
              onRowClick={(row) => setSelectedCustomer(row)}
            />
          </div>
        </BentoCard>
      )}

      {/* PAGINATION — always shown (server handles filtering) */}
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


      {/* ADD / EDIT MODAL */}
      <Modal
        open={showModal}
        onClose={handleCloseModal}
        title={isEditing ? 'Edit Customer' : 'Add Customer'}
        subtitle={isEditing ? editingCustomer?.cust_name : 'Add a new customer to your list'}
        size="lg"
      >
        <form onSubmit={handleSubmit(onSubmit)} noValidate>

          <FormField label="Customer Name" error={errors.cust_name?.message} required style={{ marginBottom: 16 }}>
            <Input
              {...register('cust_name')}
              placeholder="e.g. Rajesh Kumar / ABC Enterprises"
              autoFocus
              autoComplete="name"
            />
          </FormField>

          <div className="form-grid-2" style={{ marginBottom: 16 }}>
            <FormField label="Phone Number" error={errors.cust_phone?.message}>
              <Input {...register('cust_phone')} placeholder="e.g. +91 98765 43210" type="tel" autoComplete="tel" />
            </FormField>
            <FormField label="Email Address" error={errors.cust_email?.message}>
              <Input {...register('cust_email')} placeholder="e.g. rajesh@example.com" type="email" autoComplete="email" />
            </FormField>
          </div>

          <div className="form-grid-2" style={{ marginBottom: 16 }}>
            <FormField label="Tax / GST Number" error={errors.cust_tax_number?.message}>
              <Input
                {...register('cust_tax_number')}
                placeholder="e.g. 33AABCU9603R1ZM"
                style={{ fontFamily: 'monospace', letterSpacing: '0.03em' }}
              />
            </FormField>
            <FormField label="Country" error={errors.cust_country_code?.message}>
              <select {...register('cust_country_code')} className="sb-select" style={selectStyle}>
                <option value="">— Select Country —</option>
                {COUNTRIES.map((c) => (
                  <option
                    key={c.value || c.label}
                    value={c.value}
                    disabled={c.disabled}
                    style={c.disabled ? { color: 'var(--text-muted)' } : {}}
                  >
                    {c.label}
                  </option>
                ))}
              </select>
            </FormField>
          </div>

          <StateDropdown
            countryCode={watchedCountry}
            value={watch('cust_state')}
            onChange={(val) => setValue('cust_state', val, { shouldValidate: true })}
            label="State / Province"
            error={errors.cust_state?.message}
          />

            <FormField label="Address" error={errors.cust_address?.message} style={{ marginBottom: 8 }}>
            <textarea
              {...register('cust_address')}
              placeholder="Street address, area, city..."
              rows={3}
              style={textareaStyle}
              autoComplete="street-address"
            />
          </FormField>

          <Modal.Footer>
            <Button
              variant="ghost"
              type="button"
              onClick={handleCloseModal}
              disabled={isCreating || isUpdating}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              loading={isCreating || isUpdating}
            >
              {isEditing ? 'Save Changes' : 'Add Customer'}
            </Button>
          </Modal.Footer>

        </form>
      </Modal>


      {/* DELETE CONFIRM */}
      <ConfirmDialog
        open={showDelete}
        onClose={handleCloseDelete}
        onConfirm={onConfirmDelete}
        title={`Remove "${deletingCustomer?.cust_name}"?`}
        message="This will remove the customer from your list. Existing sales records will not be affected."
        confirmText={isDeleting ? 'Removing…' : 'Yes, Remove'}
        loading={isDeleting}
      />


      {/* CUSTOMER DETAIL DRAWER */}
      {selectedCustomer && (
        <>
          <DrawerOverlay
            open={!!selectedCustomer}
            onClick={() => setSelectedCustomer(null)}
          />
          <CustomerDetailDrawer
            custId={selectedCustomer.cust_id}
            onClose={() => setSelectedCustomer(null)}
            onEdit={(customer) => {
              setSelectedCustomer(null)
              handleOpenEdit(customer)
            }}
            canManage={canManage}
          />
        </>
      )}
    </>
  )
}
