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
//   Pagination is always shown (no activeSearch/activeDateFilter hide logic
//   needed — server handles filtering so pagination is always accurate).

import { useState, useEffect, useRef, useMemo } from 'react'
import { useForm }                               from 'react-hook-form'
import { zodResolver }                           from '@hookform/resolvers/zod'
import { z }                                     from 'zod'
import { useNavigate }                           from 'react-router-dom'

import { useCustomers } from '../hooks/useCustomers'
import useAuthStore     from '../../../store/authStore'

import {
  Button, Input, Modal, Table, SearchBar,
  Pagination, ConfirmDialog, PageHeader,
  FormField, StateDropdown, ExportButton,
  DateRangeFilter,
} from '../../../shared/components'

import { selectStyle, textareaStyle } from '../../../shared/components/FormField'
import { CUSTOMER_CSV_COLUMNS }       from '../../../shared/utils/csvExport'
import { COUNTRIES }                  from '../../../shared/data/countries'
import { formatDate }                 from '../../../shared/utils/formatDate'

import CustomerDetailDrawer, { DrawerOverlay }
  from '../components/CustomerDetailDrawer'


// ─── ZOD VALIDATION SCHEMA ────────────────────────────────────────────────────
const customerSchema = z.object({
  cust_name: z
    .string()
    .min(1, 'Customer name is required')
    .max(100, 'Max 100 characters'),

  cust_phone: z
    .string()
    .max(15, 'Max 15 digits')
    .optional()
    .or(z.literal('')),

  cust_email: z
    .union([
      z.string().email('Enter a valid email address'),
      z.literal(''),
    ])
    .optional(),

  cust_address: z
    .string()
    .max(500, 'Max 500 characters')
    .optional()
    .or(z.literal('')),

  cust_country_code: z
    .string()
    .optional()
    .or(z.literal('')),

  cust_state: z
    .string()
    .optional()
    .or(z.literal('')),

  cust_tax_number: z
    .string()
    .max(50, 'Max 50 characters')
    .optional()
    .or(z.literal('')),
})

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
          <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 13.5 }}>
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
        <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
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
          ? <span style={{ fontSize: 12.5, color: 'var(--text-secondary)', fontWeight: 500 }}>
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
            {/* onFetch triggers a backend call on click — not from memory */}
            <ExportButton
              onFetch={handleExport}
              filename="customers"
              columns={CUSTOMER_CSV_COLUMNS}
            />
            <Button
              variant="primary"
              leftIcon={<span style={{ fontSize: 16, lineHeight: 1 }}>+</span>}
              onClick={handleOpenAdd}
            >
              Add Customer
            </Button>
          </div>
        }
      />

      {/* TOOLBAR */}
      <div style={{
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'space-between',
        marginBottom:   20,
        gap:            12,
        flexWrap:       'wrap',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <SearchBar
            value={search}
            onChange={setSearch}
            onSearch={setSearch}
            placeholder="Search by name, phone, email…"
            width="280px"
          />
          <span style={{ fontSize: 12.5, color: 'var(--text-muted)', fontWeight: 500 }}>
            {totalItems} customer{totalItems !== 1 ? 's' : ''}
            {activeFilters > 0 && ' (filtered)'}
          </span>
        </div>
        <DateRangeFilter
          label="Last Updated"
          from={dateFrom}
          to={dateTo}
          onChange={handleDateChange}
        />
      </div>

      {/* ERROR BANNER */}
      {isError && (
        <div style={{
          background: 'var(--danger-bg)', border: '1px solid var(--danger-border)',
          borderRadius: 12, padding: '13px 18px', color: 'var(--danger-text)',
          fontSize: 13.5, marginBottom: 24, fontWeight: 500,
        }}>
          ⚠️ Could not load customers. Check that the backend is running and refresh.
        </div>
      )}

      {/* TABLE */}
      <div style={{ overflowX: 'auto', width: '100%' }}>
        <Table
          columns={columns}
          rows={customers}
          rowKey="cust_id"
          loading={isLoading}
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={handleSort}
          onRowClick={(row) => setSelectedCustomer(row)}
          emptyText={
            activeFilters > 0
              ? 'No customers match your current filters.'
              : 'No customers yet. Add your first customer to get started.'
          }
        />
      </div>

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
            />
          </FormField>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            <FormField label="Phone Number" error={errors.cust_phone?.message}>
              <Input {...register('cust_phone')} placeholder="e.g. +91 98765 43210" type="tel" />
            </FormField>
            <FormField label="Email Address" error={errors.cust_email?.message}>
              <Input {...register('cust_email')} placeholder="e.g. rajesh@example.com" type="email" />
            </FormField>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            <FormField label="Tax / GST Number" error={errors.cust_tax_number?.message}>
              <Input
                {...register('cust_tax_number')}
                placeholder="e.g. 33AABCU9603R1ZM"
                style={{ fontFamily: 'monospace', letterSpacing: '0.03em' }}
              />
            </FormField>
            <FormField label="Country" error={errors.cust_country_code?.message}>
              <select {...register('cust_country_code')} style={selectStyle}>
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