// src/features/categories/pages/CategoriesPage.jsx
//
// CHANGES IN THIS VERSION:
//   ✅ Added ExportButton with CATEGORY_CSV_COLUMNS to the PageHeader action slot
//   All other logic, layout, styles unchanged.
//
// PREVIOUS FIXES RETAINED:
//   ✅ FIX A — Back button added (← Back to Dashboard via useNavigate)
//   ✅ FIX B — Last Updated By column

import { useState, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useNavigate } from 'react-router-dom'

import {
  Button,
  Table,
  Badge,
  Modal,
  ConfirmDialog,
  PageHeader,
  Pagination,
  FormField,
  Input,
  SearchBar,
  ExportButton,
  DateRangeFilter
} from '../../../shared/components'

import { CATEGORY_CSV_COLUMNS } from '../../../shared/utils/csvExport'
import { usePermissions }        from '../../../shared/hooks/usePermissions'
import { formatDate }            from '../../../shared/utils/formatDate'

import {
  useCategories,
  useCreateCategory,
  useUpdateCategory,
  useDeleteCategory,
} from '../hooks/useCategories'

// ── Zod schema ────────────────────────────────────────────────────────────────
const categorySchema = z.object({
  category_name: z
    .string()
    .min(1, 'Name is required')
    .max(100, 'Name must be 100 characters or less')
    .trim(),
})

// ── Category Form ─────────────────────────────────────────────────────────────
function CategoryForm({ defaultValues = {}, onSubmit, onClose, isPending }) {
  const { register, handleSubmit, formState: { errors } } = useForm({
    resolver: zodResolver(categorySchema),
    defaultValues,
  })

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <FormField label="Category Name" error={errors.category_name} required>
        <Input
          placeholder="e.g. Electronics, Beverages, Stationery"
          autoFocus
          {...register('category_name')}
        />
      </FormField>
      <Modal.Footer>
        <Button variant="ghost" onClick={onClose} disabled={isPending}>Cancel</Button>
        <Button type="submit" variant="primary" loading={isPending}>Save</Button>
      </Modal.Footer>
    </form>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function CategoriesPage() {
  const { can }   = usePermissions()
  const canManage = can('products.edit')

  const navigate = useNavigate()

  const {
    categories,
    allCategories,
    pagination,
    page,
    setPage,
    search,
    setSearch,
    isLoading,
    isError,
  } = useCategories()

  const [sortKey, setSortKey] = useState(null)
  const [sortDir, setSortDir] = useState('asc')

  function handleSort(key) {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const [dateFrom, setDateFrom] = useState('')
  const [dateTo,   setDateTo]   = useState('')

  function handleDateChange(field, value) {
    if (field === 'from') setDateFrom(value)
    else                  setDateTo(value)
  }

  const displayRows = useMemo(() => {
    const source = (dateFrom || dateTo) ? allCategories : categories
    let rows = [...source]

    if (dateFrom) {
      const from = new Date(dateFrom)
      from.setHours(0, 0, 0, 0)
      rows = rows.filter(r => r.updated_at && new Date(r.updated_at) >= from)
    }
    if (dateTo) {
      const to = new Date(dateTo)
      to.setHours(23, 59, 59, 999)
      rows = rows.filter(r => r.updated_at && new Date(r.updated_at) <= to)
    }

    if (sortKey) {
      rows.sort((a, b) => {
        let valA = a[sortKey]
        let valB = b[sortKey]

        if (sortKey === 'updated_at') {
          valA = valA ? new Date(valA).getTime() : 0
          valB = valB ? new Date(valB).getTime() : 0
          return sortDir === 'asc' ? valA - valB : valB - valA
        }

        if (typeof valA === 'boolean') {
          return sortDir === 'asc'
            ? Number(valA) - Number(valB)
            : Number(valB) - Number(valA)
        }

        valA = String(valA ?? '').toLowerCase()
        valB = String(valB ?? '').toLowerCase()
        if (valA < valB) return sortDir === 'asc' ? -1 :  1
        if (valA > valB) return sortDir === 'asc' ?  1 : -1
        return 0
      })
    }

    return rows
  }, [categories, allCategories, sortKey, sortDir, dateFrom, dateTo])

  const { mutate: createCategory, isPending: isCreating } = useCreateCategory()
  const { mutate: updateCategory, isPending: isUpdating } = useUpdateCategory()
  const { mutate: deleteCategory, isPending: isDeleting } = useDeleteCategory()

  const [showAdd,      setShowAdd]      = useState(false)
  const [editTarget,   setEditTarget]   = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)

  function handleCreate(data) {
    createCategory(data, { onSuccess: () => setShowAdd(false) })
  }

  function handleUpdate(data) {
    updateCategory(
      { id: editTarget.category_id, payload: data },
      { onSuccess: () => setEditTarget(null) }
    )
  }

  function handleDelete() {
    deleteCategory(deleteTarget.category_id, {
      onSuccess: () => setDeleteTarget(null),
    })
  }

  const activeFilters = [search.trim(), dateFrom, dateTo].filter(Boolean).length

  const columns = [
    {
      key: 'category_name',
      label: 'Category Name',
      sortable: true,
      render: (row) => (
        <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 13.5 }}>
          {row.category_name}
        </span>
      ),
    },
    {
      key: 'is_deleted',
      label: 'Status',
      sortable: true,
      width: 110,
      render: (row) => (
        <Badge
          variant={row.is_deleted ? 'danger' : 'success'}
          label={row.is_deleted ? 'Inactive' : 'Active'}
          dot
        />
      ),
    },
    {
      key: 'updated_at',
      label: 'Last Updated',
      sortable: true,
      width: 140,
      render: (row) => (
        <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
          {row.updated_at ? formatDate(row.updated_at) : '—'}
        </span>
      ),
    },
    {
      key: 'last_updated_by',
      label: 'Last Updated By',
      sortable: false,
      width: 160,
      render: (row) => (
        row.last_updated_by
          ? (
            <span style={{ fontSize: 12.5, color: 'var(--text-secondary)', fontWeight: 500 }}>
              {row.last_updated_by}
            </span>
          )
          : <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>—</span>
      ),
    },
    ...(canManage
      ? [{
          key: 'actions',
          label: '',
          width: 120,
          render: (row) => (
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <Button
                variant="secondary"
                size="sm"
                onClick={(e) => { e.stopPropagation(); setEditTarget(row) }}
              >
                Edit
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={(e) => { e.stopPropagation(); setDeleteTarget(row) }}
              >
                Delete
              </Button>
            </div>
          ),
        }]
      : []),
  ]

  return (
    <>
      <PageHeader
        title="Categories"
        subtitle="Organise your products into groups"
        back
        onBack={() => navigate('/dashboard')}
        action={
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            {/* ADDED: Export CSV button */}
            <ExportButton
              data={displayRows}
              filename="categories"
              columns={CATEGORY_CSV_COLUMNS}
            />
            {canManage && (
              <Button
                variant="primary"
                leftIcon={<span style={{ fontSize: 16, lineHeight: 1 }}>+</span>}
                onClick={() => setShowAdd(true)}
              >
                Add Category
              </Button>
            )}
          </div>
        }
      />

      {/* Toolbar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 20,
        gap: 12,
        flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <SearchBar
            value={search}
            onChange={setSearch}
            onSearch={setSearch}
            placeholder="Search categories…"
            width="260px"
          />
          <DateRangeFilter label="Last Updated" from={dateFrom} to={dateTo} onChange={handleDateChange} />
        </div>
        <span style={{ fontSize: 12.5, color: 'var(--text-muted)', fontWeight: 500 }}>
          {displayRows.length} record{displayRows.length !== 1 ? 's' : ''}
          {activeFilters > 0 && ' (filtered)'}
        </span>
      </div>

      {isError && (
        <div style={{
          background: 'var(--danger-bg)', border: '1px solid var(--danger-border)',
          borderRadius: 12, padding: '13px 18px', color: 'var(--danger-text)',
          fontSize: 13.5, marginBottom: 24, fontWeight: 500,
        }}>
          ⚠️ Could not load categories. Check that the backend is running and refresh.
        </div>
      )}

      <Table
        columns={columns}
        rows={displayRows}
        loading={isLoading}
        rowKey="category_id"
        sortKey={sortKey}
        sortDir={sortDir}
        onSort={handleSort}
        emptyText={
          activeFilters > 0
            ? 'No categories match your current filters.'
            : 'No categories yet. Add your first one to start organising products.'
        }
      />

      {activeFilters === 0 && (
        <Pagination pagination={pagination} onPageChange={setPage} />
      )}

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add Category" subtitle="Create a new product group">
        <CategoryForm onSubmit={handleCreate} onClose={() => setShowAdd(false)} isPending={isCreating} />
      </Modal>

      <Modal open={Boolean(editTarget)} onClose={() => setEditTarget(null)} title="Edit Category" subtitle={editTarget?.category_name}>
        {editTarget && (
          <CategoryForm
            key={editTarget.category_id}
            defaultValues={{ category_name: editTarget.category_name }}
            onSubmit={handleUpdate}
            onClose={() => setEditTarget(null)}
            isPending={isUpdating}
          />
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title={`Delete "${deleteTarget?.category_name}"?`}
        message="This will permanently deactivate the category. All products linked to it will also be deactivated. This cannot be undone."
        confirmText="Yes, delete"
        loading={isDeleting}
      />
    </>
  )
}