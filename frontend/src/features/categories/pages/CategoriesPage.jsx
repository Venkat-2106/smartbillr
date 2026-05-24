// src/features/categories/pages/CategoriesPage.jsx

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

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
} from '../../../shared/components'

import { usePermissions } from '../../../shared/hooks/usePermissions'
import { formatDate } from '../../../shared/utils/formatDate'

import {
  useCategories,
  useCreateCategory,
  useUpdateCategory,
  useDeleteCategory,
} from '../hooks/useCategories'

// ── Zod validation schema ─────────────────────────────────────────────────────
const categorySchema = z.object({
  category_name: z
    .string()
    .min(1, 'Name is required')
    .max(100, 'Name must be 100 characters or less')
    .trim(),
})

// ── Category Form (shared by Add and Edit modals) ─────────────────────────────
function CategoryForm({ defaultValues = {}, onSubmit, onClose, isPending }) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
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
        <Button variant="ghost" onClick={onClose} disabled={isPending}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" loading={isPending}>
          Save
        </Button>
      </Modal.Footer>
    </form>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function CategoriesPage() {
  const { can } = usePermissions()
  const canManage = can('products.edit')

  // ── Data + search ─────────────────────────────────────────────
  const {
    categories,
    pagination,
    page,
    setPage,
    search,
    setSearch,
    isLoading,
    isError,
  } = useCategories()

  // ── Mutations ─────────────────────────────────────────────────
  const { mutate: createCategory, isPending: isCreating } = useCreateCategory()
  const { mutate: updateCategory, isPending: isUpdating } = useUpdateCategory()
  const { mutate: deleteCategory, isPending: isDeleting } = useDeleteCategory()

  // ── Modal state ───────────────────────────────────────────────
  const [showAdd, setShowAdd]           = useState(false)
  const [editTarget, setEditTarget]     = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)

  // ── Handlers ──────────────────────────────────────────────────
  function handleCreate(data) {
    createCategory(data, {
      onSuccess: () => setShowAdd(false),
    })
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

  // ── Table columns ─────────────────────────────────────────────
  const columns = [
    {
      key: 'category_name',
      label: 'Category Name',
      render: (row) => (
        <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 13.5 }}>
          {row.category_name}
        </span>
      ),
    },
    {
      key: 'status',
      label: 'Status',
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
      key: 'created_at',
      label: 'Created',
      width: 140,
      render: (row) => (
        <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
          {row.created_at ? formatDate(row.created_at) : '—'}
        </span>
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
                onClick={(e) => {
                  e.stopPropagation()
                  setEditTarget(row)
                }}
              >
                Edit
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation()
                  setDeleteTarget(row)
                }}
              >
                Delete
              </Button>
            </div>
          ),
        }]
      : []),
  ]

  // ── Render ────────────────────────────────────────────────────
  return (
    <>
      {/* Page header */}
      <PageHeader
        title="Categories"
        subtitle="Organise your products into groups"
        action={
          canManage && (
            <Button
              variant="primary"
              leftIcon={<span style={{ fontSize: 16, lineHeight: 1 }}>+</span>}
              onClick={() => setShowAdd(true)}
            >
              Add Category
            </Button>
          )
        }
      />

      {/* Search bar + error banner row */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 20,
        gap: 12,
        flexWrap: 'wrap',
      }}>
        <SearchBar
          value={search}
          onChange={setSearch}
          onSearch={setSearch}
          placeholder="Search categories…"
          width="300px"
        />

        {/* Result count — shown only while searching */}
        {search.trim() && (
          <span style={{
            fontSize: 12.5,
            color: 'var(--text-muted)',
            fontWeight: 500,
          }}>
            {categories.length} result{categories.length !== 1 ? 's' : ''} for "{search}"
          </span>
        )}
      </div>

      {/* Error banner */}
      {isError && (
        <div style={{
          background: 'var(--danger-bg)',
          border: '1px solid var(--danger-border)',
          borderRadius: 12,
          padding: '13px 18px',
          color: 'var(--danger-text)',
          fontSize: 13.5,
          marginBottom: 24,
          fontWeight: 500,
        }}>
          ⚠️ Could not load categories. Check that the backend is running and refresh.
        </div>
      )}

      {/* Data table */}
      <Table
        columns={columns}
        rows={categories}
        loading={isLoading}
        rowKey="category_id"
        emptyText={
          search.trim()
            ? `No categories found matching "${search}"`
            : 'No categories yet. Add your first one to start organising products.'
        }
      />

      {/* Pagination — hidden while search is active */}
      <Pagination pagination={pagination} onPageChange={setPage} />

      {/* ── Add Modal ── */}
      <Modal
        open={showAdd}
        onClose={() => setShowAdd(false)}
        title="Add Category"
        subtitle="Create a new product group"
      >
        <CategoryForm
          onSubmit={handleCreate}
          onClose={() => setShowAdd(false)}
          isPending={isCreating}
        />
      </Modal>

      {/* ── Edit Modal ── */}
      <Modal
        open={Boolean(editTarget)}
        onClose={() => setEditTarget(null)}
        title="Edit Category"
        subtitle={editTarget?.category_name}
      >
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

      {/* ── Delete Confirm ── */}
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