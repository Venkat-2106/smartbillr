import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useSuppliers } from '../hooks/useSuppliers';
import SupplierDetailDrawer from '../components/SupplierDetailDrawer';
import {
  Button, Modal, Table, EmptyState, SearchBar,
  Pagination, ConfirmDialog, PageHeader, FormField,
  DateRangeFilter, ExportButton, StateDropdown,
} from '../../../shared/components';
import { selectStyle, textareaStyle } from '../../../shared/components/FormField';
import { SUPPLIER_CSV_COLUMNS } from '../../../shared/utils/csvExport';
import { usePermissions } from '../../../shared/hooks/usePermissions';
import { formatDate } from '../../../shared/utils/formatDate';
import { COUNTRIES } from '../../../shared/data/countries';

/* ─── Zod validation ────────────────────────────────────────────────────── */
const schema = z.object({
  supp_name:         z.string().min(1, 'Supplier name is required'),
  supp_phone:        z.string().optional().or(z.literal('')),
  supp_email:        z.union([
                       z.string().email('Invalid email address'),
                       z.literal(''),
                     ]).optional(),
  supp_address:      z.string().optional().or(z.literal('')),
  supp_country_code: z.string().optional().or(z.literal('')),
  supp_state:        z.string().optional().or(z.literal('')),
  supp_tax_number:   z.string().optional().or(z.literal('')),
});

const EMPTY_FORM = {
  supp_name: '', supp_phone: '', supp_email: '',
  supp_address: '', supp_country_code: '',
  supp_state: '', supp_tax_number: '',
};

/* ─── Page ──────────────────────────────────────────────────────────────── */
export default function SuppliersPage() {
  const navigate  = useNavigate();
  const { can }   = usePermissions();
  const canManage = can('suppliers.manage');

  const {
    suppliers, exportData, isLoading,
    totalItems, totalPages,
    search, setSearch,
    dateFrom, dateTo, handleDateChange,
    activeSearch, activeDateFilter,
    sortKey, sortDir, handleSort,
    page, setPage,
    drawerSupplier, setDrawerSupplier,
    showAdd,      setShowAdd,
    editTarget,   setEditTarget,
    deleteTarget, setDeleteTarget,
    createMutation, updateMutation, deleteMutation,
  } = useSuppliers();

  /* ── Add form ─────────────────────────────────────────────────────────── */
  const addForm = useForm({
    resolver: zodResolver(schema),
    defaultValues: EMPTY_FORM,
  });

  /* ── Edit form ────────────────────────────────────────────────────────── */
  const editForm = useForm({
    resolver: zodResolver(schema),
    defaultValues: EMPTY_FORM,
  });

  React.useEffect(() => {
    if (editTarget) {
      editForm.reset({
        supp_name:         editTarget.supp_name         || '',
        supp_phone:        editTarget.supp_phone        || '',
        supp_email:        editTarget.supp_email        || '',
        supp_address:      editTarget.supp_address      || '',
        supp_country_code: editTarget.supp_country_code || '',
        supp_state:        editTarget.supp_state        || '',
        supp_tax_number:   editTarget.supp_tax_number   || '',
      });
    }
  }, [editTarget]);

  /* ── Submit handlers ──────────────────────────────────────────────────── */
  const onAdd    = (data) => createMutation.mutate(data);
  const onEdit   = (data) => updateMutation.mutate({ id: editTarget.supp_id, body: data });
  const onDelete = ()     => deleteMutation.mutate(deleteTarget.supp_id);

  const activeFiltersCount =
    (activeSearch ? 1 : 0) + (activeDateFilter ? 1 : 0);

  /* ── Column definitions — render functions INSIDE each column ───────── */
  const columns = [
    {
      key: 'supp_name',
      label: 'Supplier Name',
      sortable: true,
      render: (row) => (
        <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 13.5 }}>
          {row.supp_name || '—'}
        </span>
      ),
    },
    {
      key: 'supp_phone',
      label: 'Phone',
      sortable: false,
      width: 140,
      render: (row) => (
        <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          {row.supp_phone || '—'}
        </span>
      ),
    },
    {
      key: 'supp_email',
      label: 'Email',
      sortable: false,
      width: 200,
      render: (row) => (
        <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          {row.supp_email || '—'}
        </span>
      ),
    },
    {
      key: 'supp_state',
      label: 'State',
      sortable: true,
      width: 130,
      render: (row) => (
        <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          {row.supp_state || '—'}
        </span>
      ),
    },
    {
      key: 'supp_country_code',
      label: 'Country',
      sortable: true,
      width: 100,
      render: (row) => (
        <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          {row.supp_country_code || '—'}
        </span>
      ),
    },
    {
      key: 'supp_tax_number',
      label: 'Tax Number',
      sortable: false,
      width: 150,
      render: (row) => (
        <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
          {row.supp_tax_number || '—'}
        </span>
      ),
    },
    {
      key: 'updated_at',
      label: 'Last Updated',
      sortable: true,
      width: 145,
      render: (row) => (
        <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
          {row.updated_at ? formatDate(row.updated_at) : '—'}
        </span>
      ),
    },
    // NOTE: last_updated_by column intentionally omitted.
    // The suppliers table has no updated_by column in the DB (unlike customers/
    // categories/products). The trigger auto-sets updated_at but does not track
    // which user made the change, so this column cannot be populated.
    //
    // Actions column — only when user can manage
    ...(canManage ? [{
      key: 'actions',
      label: '',
      width: 140,
      render: (row) => (
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Button
            size="sm" variant="secondary"
            onClick={(e) => { e.stopPropagation(); setEditTarget(row); }}
          >
            Edit
          </Button>
          <Button
            size="sm" variant="danger"
            onClick={(e) => { e.stopPropagation(); setDeleteTarget(row); }}
          >
            Delete
          </Button>
        </div>
      ),
    }] : []),
  ];

  /* ── Render ───────────────────────────────────────────────────────────── */
  return (
    <div style={{ padding: '36px 40px', maxWidth: 1400, margin: '0 auto' }}>

      <PageHeader
        title="Suppliers"
        subtitle="Manage your supplier contacts and information"
        back
        onBack={() => navigate('/dashboard')}
        action={
          <div style={{ display: 'flex', gap: 10 }}>
            <ExportButton
              data={exportData}
              filename="suppliers"
              columns={SUPPLIER_CSV_COLUMNS}
            />
            {canManage && (
              <Button
                variant="primary"
                onClick={() => { addForm.reset(EMPTY_FORM); setShowAdd(true); }}
              >
                + Add Supplier
              </Button>
            )}
          </div>
        }
      />

      {/* Card wrapper */}
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
          justifyContent: 'space-between',
          gap: 12, flexWrap: 'wrap',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <SearchBar
              value={search}
              onChange={setSearch}
              onSearch={setSearch}
              placeholder="Search name, phone, email, country..."
              width="290px"
            />
            <span style={{ fontSize: 12.5, color: 'var(--text-muted)', fontWeight: 500 }}>
              {totalItems} record{totalItems !== 1 ? 's' : ''}
              {activeFiltersCount > 0 && ' (filtered)'}
            </span>
          </div>
          <DateRangeFilter
            label="Last Updated"
            from={dateFrom}
            to={dateTo}
            onChange={handleDateChange}
          />
        </div>

        {/* ✅ KEY FIX: rows= not data=, no renderCell/renderActions props */}
        <Table
          columns={columns}
          rows={suppliers}
          loading={isLoading}
          rowKey="supp_id"
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={handleSort}
          onRowClick={(row, e) => {
            if (e.target.closest('button')) return;
            setDrawerSupplier(row);
          }}
          emptyText={
            activeSearch || activeDateFilter
              ? 'No suppliers match your current filters.'
              : 'No suppliers yet. Add your first one to get started.'
          }
        />

        {/* Pagination — hidden when any filter is active */}
        {!activeSearch && !activeDateFilter && totalPages > 1 && (
          <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)' }}>
            <Pagination page={page} totalPages={totalPages} onChange={setPage} />
          </div>
        )}
      </div>

      {/* Detail drawer */}
      {drawerSupplier && (
        <SupplierDetailDrawer
          supplier={drawerSupplier}
          onClose={() => setDrawerSupplier(null)}
        />
      )}

      {/* Add modal */}
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add Supplier" size="lg">
        <SupplierForm
          key="add"
          form={addForm}
          onSubmit={onAdd}
          onCancel={() => setShowAdd(false)}
          loading={createMutation.isPending}
          submitLabel="Add Supplier"
        />
      </Modal>

      {/* Edit modal */}
      <Modal open={!!editTarget} onClose={() => setEditTarget(null)} title="Edit Supplier" size="lg">
        <SupplierForm
          key={editTarget?.supp_id || 'edit'}
          form={editForm}
          onSubmit={onEdit}
          onCancel={() => setEditTarget(null)}
          loading={updateMutation.isPending}
          submitLabel="Save Changes"
        />
      </Modal>

      {/* Delete confirm */}
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={onDelete}
        title={`Delete "${deleteTarget?.supp_name}"?`}
        message="This will permanently remove this supplier. This cannot be undone."
        confirmText="Yes, delete"
        loading={deleteMutation.isPending}
      />
    </div>
  );
}

function SupplierForm({ form, onSubmit, onCancel, loading, submitLabel }) {
  const {
    register, handleSubmit, watch, setValue,
    formState: { errors },
  } = form;

  const countryCode = watch('supp_country_code');

  // Reset state when country changes — same pattern as CustomersPage
  const prevCountryRef = React.useRef(undefined);
  React.useEffect(() => {
    if (
      prevCountryRef.current !== undefined &&
      prevCountryRef.current !== countryCode
    ) {
      setValue('supp_state', '', { shouldValidate: false });
    }
    prevCountryRef.current = countryCode;
  }, [countryCode, setValue]);

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>

      {/* Supplier Name — full row */}
      <FormField
        label="Supplier Name"
        required
        error={errors.supp_name?.message}
        style={{ marginBottom: 16 }}
      >
        <input
          {...register('supp_name')}
          placeholder="e.g. ABC Wholesale Pvt Ltd"
          autoFocus
          style={fieldInput(!!errors.supp_name)}
        />
      </FormField>

      {/* Phone + Email */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
        <FormField label="Phone Number" error={errors.supp_phone?.message}>
          <input
            {...register('supp_phone')}
            placeholder="+91 98765 43210"
            type="tel"
            style={fieldInput(!!errors.supp_phone)}
          />
        </FormField>
        <FormField label="Email Address" error={errors.supp_email?.message}>
          <input
            {...register('supp_email')}
            type="email"
            placeholder="supplier@example.com"
            style={fieldInput(!!errors.supp_email)}
          />
        </FormField>
      </div>

      {/* Tax Number + Country */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
        <FormField label="Tax / GSTIN / VAT Number" error={errors.supp_tax_number?.message}>
          <input
            {...register('supp_tax_number')}
            placeholder="e.g. 29ABCDE1234F1Z5"
            style={{ ...fieldInput(!!errors.supp_tax_number), fontFamily: 'monospace', letterSpacing: '0.03em' }}
          />
        </FormField>
        <FormField label="Country" error={errors.supp_country_code?.message}>
          {/* ✅ selectStyle used as plain OBJECT — not called as function */}
          <select {...register('supp_country_code')} style={selectStyle}>
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

      {/* State — country-aware dropdown */}
      <StateDropdown
        countryCode={countryCode}
        value={watch('supp_state')}
        onChange={(val) => setValue('supp_state', val, { shouldValidate: true })}
        label="State / Province"
        error={errors.supp_state?.message}
      />

      {/* Address — full row */}
      <FormField
        label="Address"
        error={errors.supp_address?.message}
        style={{ marginBottom: 8 }}
      >
        <textarea
          {...register('supp_address')}
          rows={3}
          placeholder="Street address, city, PIN code..."
          style={textareaStyle}
        />
      </FormField>

      <Modal.Footer>
        <Button variant="ghost" type="button" onClick={onCancel} disabled={loading}>
          Cancel
        </Button>
        <Button variant="primary" type="submit" loading={loading}>
          {submitLabel}
        </Button>
      </Modal.Footer>

    </form>
  );
}

/* ─── Input style helper ─────────────────────────────────────────────────── */
function fieldInput(hasError) {
  return {
    width: '100%', padding: '10px 14px',
    border: `1.5px solid ${hasError ? '#ef4444' : 'var(--border)'}`,
    borderRadius: 10, fontSize: 14,
    background: 'var(--bg-page)',
    color: 'var(--text-primary)',
    outline: 'none', boxSizing: 'border-box',
    fontFamily: 'inherit',
  };
}