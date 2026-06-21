import { useState, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useNavigate } from 'react-router-dom'

import {
  Button, Input, Modal, Table, Badge, SearchBar,
  Pagination, BentoCard, MetricCard, FormField, ExportButton,
  ConfirmDialog, EmptyState,
} from '../../../shared/components'
import { selectStyle } from '../../../shared/components/FormField'
import { usePermissions } from '../../../shared/hooks/usePermissions'
import { formatDate, formatDateCSV } from '../../../shared/utils/formatDate'

import { useStaff } from '../hooks/useStaff'

const ROLES = [
  { value: 'manager', label: 'Manager' },
  { value: 'staff', label: 'Staff' },
]

const addStaffSchema = z.object({
  full_name: z.string().min(1, 'Name is required').max(100),
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  role: z.string().min(1, 'Role is required'),
})

const editStaffSchema = z.object({
  full_name: z.string().min(1, 'Name is required').max(100),
  role: z.string().min(1, 'Role is required'),
})

const ADD_DEFAULTS = { full_name: '', email: '', password: '', role: '' }
const EDIT_DEFAULTS = { full_name: '', role: '' }

function buildColumns(canManage, onEdit, onDeactivate) {
  return [
    {
      key: 'full_name',
      label: 'Name',
      render: (row) => (
        <div>
          <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 13 }}>
            {row.full_name}
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2 }}>
            {row.email}
          </div>
        </div>
      ),
    },
    {
      key: 'role',
      label: 'Role',
      width: 110,
      render: (row) => (
        <Badge
          variant={row.role === 'admin' ? 'primary' : row.role === 'manager' ? 'warning' : 'default'}
          label={row.role ? row.role.charAt(0).toUpperCase() + row.role.slice(1) : '—'}
          dot
        />
      ),
    },
    {
      key: 'is_active',
      label: 'Status',
      width: 100,
      render: (row) => (
        <Badge
          variant={row.is_active ? 'success' : 'danger'}
          label={row.is_active ? 'Active' : 'Inactive'}
          dot
        />
      ),
    },
    {
      key: 'created_at',
      label: 'Joined',
      width: 110,
      render: (row) => (
        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          {row.created_at ? formatDate(row.created_at) : '—'}
        </span>
      ),
    },
    ...(canManage ? [{
      key: 'actions',
      label: '',
      width: 140,
      render: (row) => (
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          {row.role !== 'admin' && (
            <>
              <Button
                variant="secondary"
                size="sm"
                onClick={(e) => { e.stopPropagation(); onEdit(row) }}
              >
                Edit
              </Button>
              {row.is_active && (
                <Button
                  variant="danger"
                  size="sm"
                  onClick={(e) => { e.stopPropagation(); onDeactivate(row) }}
                >
                  Deactivate
                </Button>
              )}
            </>
          )}
        </div>
      ),
    }] : []),
  ]
}

export default function StaffPage() {
  const navigate = useNavigate()
  const { can } = usePermissions()
  const canManage = can('staff.manage')

  const {
    staffList, isLoading, isError,
    search, setSearch,
    page, setPage, totalPages, totalItems,
    handleExport,
    createStaff, updateStaff, deactivateStaff,
    isCreating, isUpdating, isDeactivating,
  } = useStaff()

  const [showAdd, setShowAdd] = useState(false)
  const [editingStaff, setEditingStaff] = useState(null)
  const [deactivatingStaff, setDeactivatingStaff] = useState(null)
  const [showDeactivate, setShowDeactivate] = useState(false)

  const addForm = useForm({
    resolver: zodResolver(addStaffSchema),
    defaultValues: ADD_DEFAULTS,
  })

  const editForm = useForm({
    resolver: zodResolver(editStaffSchema),
    defaultValues: EDIT_DEFAULTS,
  })

  function handleOpenAdd() {
    addForm.reset(ADD_DEFAULTS)
    setShowAdd(true)
  }

  function handleOpenEdit(staff) {
    setEditingStaff(staff)
    editForm.reset({ full_name: staff.full_name, role: staff.role || 'staff' })
  }

  function onAddSubmit(data) {
    createStaff(data, { onSuccess: () => { setShowAdd(false); addForm.reset(ADD_DEFAULTS) } })
  }

  function onEditSubmit(data) {
    updateStaff(editingStaff.id, data, { onSuccess: () => setEditingStaff(null) })
  }

  function handleDeactivateClick(staff) {
    setDeactivatingStaff(staff)
    setShowDeactivate(true)
  }

  function onConfirmDeactivate() {
    deactivateStaff(deactivatingStaff.id, { onSuccess: () => setShowDeactivate(false) })
  }

  const activeCount = useMemo(
    () => staffList ? staffList.filter(s => s.is_active).length : 0,
    [staffList]
  )

  const columns = useMemo(
    () => buildColumns(canManage, handleOpenEdit, handleDeactivateClick),
    [canManage]
  )

  return (
    <>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.03em', margin: 0 }}>
          Staff
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '6px 0 0', fontWeight: 400 }}>
          Manage team members, roles, and access permissions
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 16, marginBottom: 24 }}>
        <MetricCard
          colSpan={6}
          icon={
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 00-3-3.87" />
              <path d="M16 3.13a4 4 0 010 7.75" />
            </svg>
          }
          label="Total Staff"
          value={String(totalItems)}
          subtitle="All team members"
          loading={isLoading}
        />
        <MetricCard
          colSpan={6}
          icon={
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
          }
          label="Active Staff"
          value={String(isLoading ? '—' : activeCount)}
          subtitle={isLoading ? '' : `${((activeCount / totalItems) * 100).toFixed(0)}% of total`}
          loading={isLoading}
        />
      </div>

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
            placeholder="Search by name or email\u2026"
            width="260px"
          />
          <span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 500 }}>
            {totalItems} member{totalItems !== 1 ? 's' : ''}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <ExportButton
            onFetch={handleExport}
            filename="staff"
            columns={[
              { key: 'full_name', label: 'Name' },
              { key: 'email', label: 'Email' },
              { key: 'role', label: 'Role' },
              { key: 'is_active', label: 'Active', format: (v) => v ? 'Yes' : 'No' },
              { key: 'created_at', label: 'Joined', format: (v) => formatDateCSV(v) },
            ]}
          />
          {canManage && (
            <Button
              variant="primary"
              leftIcon={
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              }
              onClick={handleOpenAdd}
              data-shortcut="new"
            >
              Add Staff
            </Button>
          )}
        </div>
      </div>

      {isError && (
        <div style={{
          background: 'var(--danger-bg)', border: '1px solid var(--danger-border)',
          borderRadius: 12, padding: '12px 16px', color: 'var(--danger-text)',
          fontSize: 13, marginBottom: 24, fontWeight: 500,
        }}>
          Could not load staff. Check that the backend is running and refresh.
        </div>
      )}

      {!isLoading && staffList.length === 0 ? (
        <EmptyState
          icon={
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 00-3-3.87" />
              <path d="M16 3.13a4 4 0 010 7.75" />
            </svg>
          }
          title="Nothing here yet"
          description="Add team members to collaborate."
          action={
            <Button variant="primary" size="sm" onClick={handleOpenAdd}>
              Add Staff
            </Button>
          }
        />
      ) : (
        <BentoCard padding={false} className="premium-table-wrap">
          <div className="premium-table" style={{ overflowX: 'auto', width: '100%' }}>
            <Table
              columns={columns}
              rows={staffList}
              rowKey="id"
              loading={isLoading}
            />
          </div>
        </BentoCard>
      )}

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

      <Modal
        open={showAdd}
        onClose={() => setShowAdd(false)}
        title="Add Staff Member"
        subtitle="Create a new account for a team member"
        size="md"
      >
        <form onSubmit={addForm.handleSubmit(onAddSubmit)} noValidate>
          <FormField label="Full Name" error={addForm.formState.errors.full_name?.message} required style={{ marginBottom: 16 }}>
            <Input
              {...addForm.register('full_name')}
              placeholder="e.g. Priya Sharma"
              autoFocus
            />
          </FormField>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            <FormField label="Email" error={addForm.formState.errors.email?.message} required>
              <Input {...addForm.register('email')} placeholder="e.g. priya@abc.com" type="email" />
            </FormField>
            <FormField label="Password" error={addForm.formState.errors.password?.message} required>
              <Input {...addForm.register('password')} placeholder="Min 6 characters" type="password" />
            </FormField>
          </div>

          <FormField label="Role" error={addForm.formState.errors.role?.message} required style={{ marginBottom: 8 }}>
            <select {...addForm.register('role')} style={selectStyle} aria-label="Role">
              <option value="">— Select Role —</option>
              {ROLES.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </FormField>

          <Modal.Footer>
            <Button variant="ghost" type="button" onClick={() => setShowAdd(false)} disabled={isCreating}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={isCreating}>
              Add Staff
            </Button>
          </Modal.Footer>
        </form>
      </Modal>

      <Modal
        open={Boolean(editingStaff)}
        onClose={() => setEditingStaff(null)}
        title="Edit Staff"
        subtitle={editingStaff?.full_name}
        size="md"
      >
        {editingStaff && (
          <form onSubmit={editForm.handleSubmit(onEditSubmit)} noValidate>
            <FormField label="Full Name" error={editForm.formState.errors.full_name?.message} required style={{ marginBottom: 16 }}>
              <Input
                {...editForm.register('full_name')}
                placeholder="e.g. Priya Sharma"
                autoFocus
              />
            </FormField>

            <FormField label="Role" error={editForm.formState.errors.role?.message} required style={{ marginBottom: 8 }}>
              <select {...editForm.register('role')} style={selectStyle} aria-label="Role">
                <option value="">— Select Role —</option>
                {ROLES.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </FormField>

            <Modal.Footer>
              <Button variant="ghost" type="button" onClick={() => setEditingStaff(null)} disabled={isUpdating}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" loading={isUpdating}>
                Save Changes
              </Button>
            </Modal.Footer>
          </form>
        )}
      </Modal>

      <ConfirmDialog
        open={showDeactivate}
        onClose={() => setShowDeactivate(false)}
        onConfirm={onConfirmDeactivate}
        title={`Deactivate "${deactivatingStaff?.full_name}"?`}
        message="This will prevent them from logging in. Their existing records will be preserved."
        confirmText={isDeactivating ? 'Deactivating\u2026' : 'Yes, Deactivate'}
        loading={isDeactivating}
      />
    </>
  )
}
