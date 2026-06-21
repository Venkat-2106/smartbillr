import { useState, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate } from 'react-router-dom'

import {
  Button, Input, Modal, Table, SearchBar,
  Pagination, ConfirmDialog,
  FormField, ExportButton, DateRangeFilter,
  EmptyState, BentoCard, MetricCard,
} from '../../../shared/components'
import { selectStyle } from '../../../shared/components/FormField'
import { EXPENSE_CSV_COLUMNS } from '../../../shared/utils/csvExport'
import { usePermissions } from '../../../shared/hooks/usePermissions'
import { formatDate, formatDateOnly } from '../../../shared/utils/formatDate'
import { formatCurrency } from '../../../shared/utils/formatCurrency'

import { useExpenses } from '../hooks/useExpenses'
import ExpenseDetailDrawer from '../components/ExpenseDetailDrawer'
import { expenseSchema } from '../schemas/expenseSchema'

const ALLOWED_CATEGORIES = [
  { value: 'rent', label: 'Rent' },
  { value: 'salary', label: 'Salary' },
  { value: 'electricity', label: 'Electricity' },
  { value: 'internet', label: 'Internet' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'purchase', label: 'Purchase' },
  { value: 'other', label: 'Other' },
]

const DEFAULT_VALUES = {
  expense_category: '',
  expense_amount: '',
  expense_date: '',
  expense_notes: '',
}

function buildColumns(canManage, onEdit, onDelete) {
  const catLabels = ALLOWED_CATEGORIES.reduce((acc, c) => {
    acc[c.value] = c.label
    return acc
  }, {})

  return [
    {
      key: 'expense_category',
      label: 'Category',
      sortable: true,
      width: 140,
      render: (row) => (
        <span style={{
          display: 'inline-block',
          fontSize: 11.5, fontWeight: 600, color: 'var(--accent-600)',
          background: 'var(--accent-bg, rgba(99,102,241,0.08))',
          border: '1px solid var(--accent-border, rgba(99,102,241,0.15))',
          borderRadius: 6, padding: '3px 10px',
        }}>
          {catLabels[row.expense_category] || row.expense_category || '\u2014'}
        </span>
      ),
    },
    {
      key: 'expense_amount',
      label: 'Amount',
      sortable: true,
      width: 130,
      render: (row) => (
        <span style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: 14 }}>
          {formatCurrency(row.expense_amount)}
        </span>
      ),
    },
    {
      key: 'expense_date',
      label: 'Date',
      sortable: true,
      width: 120,
      render: (row) => (
        <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          {row.expense_date ? formatDateOnly(row.expense_date) : '\u2014'}
        </span>
      ),
    },
    {
      key: 'expense_notes',
      label: 'Notes',
      render: (row) => (
        <span style={{
          fontSize: 13, color: 'var(--text-secondary)',
          overflow: 'hidden', textOverflow: 'ellipsis',
          whiteSpace: 'nowrap', maxWidth: 280, display: 'inline-block',
        }}>
          {row.expense_notes || '\u2014'}
        </span>
      ),
    },
    {
      key: 'created_at',
      label: 'Created',
      sortable: true,
      width: 110,
      render: (row) => (
        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          {row.created_at ? formatDate(row.created_at) : '\u2014'}
        </span>
      ),
    },
    ...(canManage ? [{
      key: 'actions',
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

export default function ExpensesPage() {
  const navigate = useNavigate()
  const { can } = usePermissions()
  const canManage = can('expenses.manage')

  const {
    expenses, isLoading, isError,
    search, setSearch,
    dateFrom, setDateFrom,
    dateTo, setDateTo,
    sortKey, sortDir, handleSort,
    page, setPage, totalPages, totalItems,
    handleExport,
    createExpense, updateExpense, deleteExpense,
    isCreating, isUpdating, isDeleting,
  } = useExpenses()

  const [showModal, setShowModal] = useState(false)
  const [editingExpense, setEditingExpense] = useState(null)
  const [deletingExpense, setDeletingExpense] = useState(null)
  const [showDelete, setShowDelete] = useState(false)
  const [selectedExpenseId, setSelectedExpenseId] = useState(null)

  const isEditing = !!editingExpense?.expense_id

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(expenseSchema),
    defaultValues: DEFAULT_VALUES,
  })

  function handleOpenAdd() {
    setEditingExpense({})
    reset(DEFAULT_VALUES)
    setShowModal(true)
  }

  function handleOpenEdit(expense) {
    setEditingExpense(expense)
    reset({
      expense_category: expense.expense_category || '',
      expense_amount: String(expense.expense_amount ?? ''),
      expense_date: expense.expense_date || '',
      expense_notes: expense.expense_notes || '',
    })
    setShowModal(true)
  }

  function handleCloseModal() {
    setShowModal(false)
    setEditingExpense(null)
    reset(DEFAULT_VALUES)
  }

  function handleDeleteClick(expense) {
    setDeletingExpense(expense)
    setShowDelete(true)
  }

  function handleCloseDelete() {
    setShowDelete(false)
    setDeletingExpense(null)
  }

  function onSubmit(formData) {
    const payload = {
      expense_category: formData.expense_category,
      expense_amount: Number(formData.expense_amount),
    }
    if (formData.expense_date) payload.expense_date = formData.expense_date
    if (formData.expense_notes) payload.expense_notes = formData.expense_notes

    if (isEditing) {
      updateExpense(editingExpense.expense_id, payload, { onSuccess: handleCloseModal })
    } else {
      createExpense(payload, { onSuccess: handleCloseModal })
    }
  }

  function onConfirmDelete() {
    deleteExpense(deletingExpense.expense_id, { onSuccess: handleCloseDelete })
  }

  const columns = useMemo(
    () => buildColumns(canManage, handleOpenEdit, handleDeleteClick),
    [canManage]
  )

  function handleDateChange(field, value) {
    if (field === 'from') setDateFrom(value)
    else setDateTo(value)
  }

  const activeFilters = [search.trim(), dateFrom, dateTo].filter(Boolean).length

  const monthlyExpenses = useMemo(() => {
    const now = new Date()
    return expenses.filter(e => {
      if (!e.expense_date) return false
      const d = new Date(e.expense_date)
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
    }).length
  }, [expenses])

  return (
    <>
      {/* PAGE HEADER */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 24, flexWrap: 'wrap', gap: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={() => navigate('/dashboard')}
            style={{
              background: 'var(--bg-card)', border: '1.5px solid var(--border)',
              borderRadius: 'var(--r-md)', cursor: 'pointer', padding: 8,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--text-secondary)', lineHeight: 1,
            }}
            aria-label="Back to dashboard"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.03em', margin: 0 }}>
              Expenses
            </h1>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
              Track your business expenses, operating costs, and payments
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <ExportButton
            onFetch={handleExport}
            filename="expenses"
            columns={EXPENSE_CSV_COLUMNS}
          />
          <Button
            variant="primary"
            leftIcon={<span style={{ fontSize: 16, lineHeight: 1 }}>+</span>}
            onClick={handleOpenAdd}
            data-shortcut="new"
          >
            Add Expense
          </Button>
        </div>
      </div>

      {/* METRIC CARDS */}
      <div className="bento-grid bento-grid-12" style={{ marginBottom: 24 }}>
        <MetricCard
          colSpan={4}
          icon={
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="12" y1="1" x2="12" y2="23" />
              <path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
            </svg>
          }
          label="Total Expenses"
          value={totalItems.toLocaleString()}
          loading={isLoading}
        />
        <MetricCard
          colSpan={4}
          icon={
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
          }
          label="Monthly Expenses"
          value={monthlyExpenses}
          loading={isLoading}
        />
      </div>

      {/* TOOLBAR */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <SearchBar
            value={search}
            onChange={setSearch}
            onSearch={setSearch}
            placeholder="Search notes or category\u2026"
            width="280px"
          />
          <span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 500 }}>
            {totalItems} expense{totalItems !== 1 ? 's' : ''}
            {activeFilters > 0 && ' (filtered)'}
          </span>
          {activeFilters > 0 && (
            <button
              onClick={() => { setSearch(''); setDateFrom(''); setDateTo('') }}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', gap: 4,
                fontSize: 12, color: 'var(--accent-600)', fontWeight: 600,
                padding: '2px 6px',
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
              Clear filters
            </button>
          )}
        </div>
        <DateRangeFilter
          label="Date"
          from={dateFrom}
          to={dateTo}
          onChange={handleDateChange}
        />
      </div>

      {/* ERROR BANNER */}
      {isError && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          background: 'var(--danger-bg)', border: '1px solid var(--danger-border)',
          borderRadius: 12, padding: '12px 16px', color: 'var(--danger-text)',
          fontSize: 13, marginBottom: 24, fontWeight: 500,
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }} aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          Could not load expenses. Check that the backend is running and refresh.
        </div>
      )}

      {/* TABLE */}
      {!isLoading && expenses.length === 0 ? (
        <BentoCard>
          <EmptyState
            icon={
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                {activeFilters > 0 ? (
                  <>
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </>
                ) : (
                  <>
                    <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
                    <path d="M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z" />
                  </>
                )}
              </svg>
            }
            title={activeFilters > 0 ? 'No results matching your filters' : 'Nothing here yet'}
            description={activeFilters > 0 ? "Try adjusting your search or filters to find what you're looking for." : 'Add your first expense to get started.'}
            action={activeFilters > 0 ? (
              <Button variant="secondary" size="sm" onClick={() => { setSearch(''); setDateFrom(''); setDateTo('') }}>
                Clear filters
              </Button>
            ) : undefined}
          />
        </BentoCard>
      ) : (
        <BentoCard padding={false}>
          <div className="premium-table-wrap">
            <Table
              columns={columns}
              rows={expenses}
              rowKey="expense_id"
              loading={isLoading}
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={handleSort}
              onRowClick={(row) => setSelectedExpenseId(row.expense_id)}
            />
          </div>
        </BentoCard>
      )}

      {/* PAGINATION */}
      <Pagination
        pagination={{
          page,
          total_pages: totalPages,
          total: totalItems,
          has_next: page < totalPages,
          has_prev: page > 1,
        }}
        onPageChange={setPage}
      />

      {/* ADD / EDIT MODAL */}
      <Modal
        open={showModal}
        onClose={handleCloseModal}
        title={isEditing ? 'Edit Expense' : 'Add Expense'}
        subtitle={isEditing
          ? ALLOWED_CATEGORIES.find(c => c.value === editingExpense?.expense_category)?.label || editingExpense?.expense_category
          : 'Record a new business expense'}
        size="md"
      >
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <FormField label="Category" error={errors.expense_category?.message} required style={{ marginBottom: 16 }}>
            <select {...register('expense_category')} style={selectStyle} aria-label="Expense category">
              <option value="">\u2014 Select Category \u2014</option>
              {ALLOWED_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </FormField>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            <FormField label="Amount" error={errors.expense_amount?.message} required>
              <Input
                {...register('expense_amount')}
                placeholder="e.g. 15000"
                type="number"
                step="0.01"
                min="0"
                autoFocus
              />
            </FormField>
            <FormField label="Date" error={errors.expense_date?.message}>
              <Input {...register('expense_date')} type="date" />
            </FormField>
          </div>

          <FormField label="Notes" error={errors.expense_notes?.message} style={{ marginBottom: 8 }}>
            <textarea
              {...register('expense_notes')}
              placeholder="Optional notes about this expense\u2026"
              rows={3}
              style={{
                ...selectStyle,
                resize: 'vertical', minHeight: 72,
              }}
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
              {isEditing ? 'Save Changes' : 'Add Expense'}
            </Button>
          </Modal.Footer>
        </form>
      </Modal>

      {/* DELETE CONFIRMATION */}
      <ConfirmDialog
        open={showDelete}
        onClose={handleCloseDelete}
        onConfirm={onConfirmDelete}
        title={`Delete "${deletingExpense?.expense_category}" expense?`}
        message="This will permanently remove this expense record. This cannot be undone."
        confirmText={isDeleting ? 'Removing\u2026' : 'Yes, Delete'}
        loading={isDeleting}
      />

      {/* DETAIL DRAWER */}
      {selectedExpenseId && (
        <ExpenseDetailDrawer
          expenseId={selectedExpenseId}
          onClose={() => setSelectedExpenseId(null)}
          onEdit={(expense) => {
            setSelectedExpenseId(null)
            handleOpenEdit(expense)
          }}
          canManage={canManage}
        />
      )}
    </>
  )
}
