// src/features/categories/pages/CategoriesPage.jsx
//
// EXPORT FIX (2026-06-06):
//   ExportButton switched from data={exportData} → onFetch={...}
//   handleExport now added to useCategories() destructuring.
//   The exportData useMemo block is removed (no longer needed).
//   All other code is unchanged — layout, columns, modals, styles are identical.
//
// PREVIOUS CHANGES RETAINED:
//   ✅ FIX A — Back button added (← Back to Dashboard via useNavigate)
//   ✅ FIX B — Last Updated By column
//   ✅ ExportButton with CATEGORY_CSV_COLUMNS

import { useState } from 'react'
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
import CategoryDetailDrawer from '../components/CategoryDetailDrawer'

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

  // ── All filter/sort/date state now lives in the hook (server-side) ─────────
  // The hook sends every active filter to the backend as query params.
  // PostgreSQL does the filtering, sorting, and counting. The hook receives
  // only the 20 rows for the current page — no client-side filtering needed.
  const {
    categories,         // current page rows (already filtered + sorted by server)
    pagination,
    page,
    setPage,
    totalItems,         // server-side total (reflects active filters)
    search,
    setSearch,
    sortKey,            // ← from hook (drives server-side ORDER BY)
    sortDir,
    handleSort,         // ← from hook (resets page + refetches)
    dateFrom,           // ← from hook (drives server-side date filter)
    dateTo,
    handleDateChange,   // ← from hook (resets page + refetches)
    isLoading,
    isError,
    handleExport,       // lazy export — fetches all matching rows on click
  } = useCategories()

  // displayRows useMemo REMOVED:
  //   Previously this block did client-side date filter + sort on the raw
  //   categories array. Now that the hook sends all params to the backend,
  //   `categories` is already filtered, sorted, and paginated correctly.
  //   Re-filtering here would be redundant (and silently wrong for > 100 rows).

  // EXPORT FIX: exportData useMemo removed. Export now calls handleExport()
  // from the hook, which fetches limit=10000 on demand.

  const { mutate: createCategory, isPending: isCreating } = useCreateCategory()
  const { mutate: updateCategory, isPending: isUpdating } = useUpdateCategory()
  const { mutate: deleteCategory, isPending: isDeleting } = useDeleteCategory()

  const [showAdd,        setShowAdd]        = useState(false)
  const [detailCategory, setDetailCategory] = useState(null)
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
            {/* EXPORT FIX: switched from data={exportData} to onFetch
                onFetch triggers a fresh limit=10000 fetch when clicked,
                so export is never capped at 100 records. */}
            <ExportButton
              onFetch={handleExport}
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
          {totalItems} record{totalItems !== 1 ? 's' : ''}
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
        rows={categories}
        loading={isLoading}
        rowKey="category_id"
        sortKey={sortKey}
        sortDir={sortDir}
        onSort={handleSort}
        onRowClick={(row) => setDetailCategory(row)}
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

      {detailCategory && (
        <CategoryDetailDrawer
          category={detailCategory}
          onClose={() => setDetailCategory(null)}
        />
      )}

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
