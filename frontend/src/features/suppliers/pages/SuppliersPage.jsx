// src/features/suppliers/pages/SuppliersPage.jsx
//
// All code below is identical to the previous version.
// Export uses onFetch={handleExport} (lazy fetch on click) via useSuppliers(),
// which sends the current active filters to the backend and returns all
// matching records — not limited to the 20 rows visible on screen.

import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useSuppliers } from '../hooks/useSuppliers';
import SupplierDetailDrawer from '../components/SupplierDetailDrawer';
import {
  Button, Modal, Table, EmptyState, SearchBar,
  Pagination, ConfirmDialog, PageHeader, FormField,
  DateRangeFilter, ExportButton, ImportButton, StateDropdown, UpgradePrompt,
} from '../../../shared/components';
import useAuthStore from '../../../store/authStore';
import useTableKeyboardNav from '../../../shared/hooks/useTableKeyboardNav';
import { selectStyle, textareaStyle } from '../../../shared/components/FormField';
import { SUPPLIER_CSV_COLUMNS, SUPPLIER_IMPORT_TEMPLATE } from '../../../shared/utils/csvExport';
import { usePermissions } from '../../../shared/hooks/usePermissions';
import { formatDate } from '../../../shared/utils/formatDate';
import { COUNTRIES } from '../../../shared/data/countries';
import { supplierSchema } from '../schemas/supplierSchema';

const EMPTY_FORM = {
  supp_name: '', supp_phone: '', supp_email: '',
  supp_address: '', supp_country_code: '',
  supp_state: '', supp_tax_number: '',
};

/* ─── Page ──────────────────────────────────────────────────────────────── */
export default function SuppliersPage() {
  const navigate      = useNavigate();
  const { can }       = usePermissions();
  const canManage     = can('suppliers.manage');
  const subscription  = useAuthStore(s => s.subscription);
  const [showUpgradeBanner, setShowUpgradeBanner] = useState(true);

  // handleExport() lazily fetches all filtered records from the backend on click.

  const {
    suppliers, handleExport, isLoading, isError,
    totalItems, totalPages, pagination,
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

  const [bannerDismissed, setBannerDismissed] = useState(false)
  React.useEffect(() => { setBannerDismissed(false) }, [isError])

  /* ── Add form ─────────────────────────────────────────────────────────── */
  const addForm = useForm({
    resolver: zodResolver(supplierSchema),
    defaultValues: EMPTY_FORM,
  });

  /* ── Edit form ────────────────────────────────────────────────────────── */
  const editForm = useForm({
    resolver: zodResolver(supplierSchema),
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

  const { selectedIndex, setSelectedIndex } = useTableKeyboardNav({
    rows: suppliers,
    rowKey: 'supp_id',
    onEnterRow: (row) => setDrawerSupplier(row),
    onEditRow: canManage ? (row) => setEditTarget(row) : undefined,
    onDeleteRow: canManage ? (row) => setDeleteTarget(row) : undefined,
  })

  const activeFiltersCount =
    (activeSearch ? 1 : 0) + (activeDateFilter ? 1 : 0);

  /* ── Column definitions ─────────────────────────────────────────────── */
  // PERF: memoized so Table doesn't see a new `columns` reference on every
  // render caused by search typing, pagination clicks, etc.
  // Dependencies: only canManage changes which columns appear (actions column).
  // setEditTarget/setDeleteTarget are stable useState setters — not listed.
  const columns = useMemo(() => [
    {
      key: 'supp_name',
      label: 'Supplier Name',
      sortable: true,
      render: (row) => (
        <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 13 }}>
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
        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
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
        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
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
            <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 500 }}>
              {row.last_updated_by}
            </span>
          )
          : <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>—</span>
      ),
    },
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
  ], [canManage]);

  /* ── Render ───────────────────────────────────────────────────────────── */
  return (
    <>

      <PageHeader
        title="Suppliers"
        subtitle="Manage your supplier contacts and information"
        back
        onBack={() => navigate('/dashboard')}
        action={
          <div style={{ display: 'flex', gap: 10 }}>

            <ExportButton
              onFetch={handleExport}
              filename="suppliers"
              columns={SUPPLIER_CSV_COLUMNS}
            />
            {canManage && (
              <ImportButton
                endpoint="/v1/suppliers/import"
                title="Suppliers"
                columns={SUPPLIER_IMPORT_TEMPLATE}
              />
            )}
            {canManage && (
              <Button
                variant="primary"
                onClick={() => { addForm.reset(EMPTY_FORM); setShowAdd(true); }}
                data-shortcut="new"
              >
                + Add Supplier
              </Button>
            )}
          </div>
        }
      />

      {showUpgradeBanner && subscription?.subscription_type === 'trial' && (
        <UpgradePrompt
          variant="banner"
          feature="suppliers"
          onDismiss={() => setShowUpgradeBanner(false)}
          style={{ marginBottom: 24 }}
        />
      )}

      {/* Toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 20,
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
            <span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 500 }}>
              {totalItems} record{totalItems !== 1 ? 's' : ''}
              {activeFiltersCount > 0 && ' (filtered)'}
            </span>
            {(activeSearch || activeDateFilter) && (
              <button
                onClick={() => { setSearch(''); setDateFrom(''); setDateTo('') }}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  fontSize: 12, color: 'var(--accent-600)', fontWeight: 600,
                  padding: '2px 6px',
                  fontFamily: "var(--font-sans, 'Plus Jakarta Sans', sans-serif)",
                }}
              >
                ✕ Clear filters
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

      {isError && !bannerDismissed && (
        <div role="alert" style={{
          background: 'var(--danger-bg)', border: '1px solid var(--danger-border)',
          borderRadius: 12, padding: '12px 16px', color: 'var(--danger-text)',
          fontSize: 13, marginBottom: 24, fontWeight: 500,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }} aria-hidden="true">
            <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          Could not load suppliers. Check that the backend is running and refresh.
          <button type="button" onClick={() => setBannerDismissed(true)} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--danger-text)', cursor: 'pointer', padding: 2, lineHeight: 1, flexShrink: 0 }} aria-label="Dismiss error">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>
      )}

      {!isError && !isLoading && suppliers.length === 0 ? (
        <EmptyState
          context="supplier"
          hasFilters={activeSearch || activeDateFilter}
          title={activeSearch || activeDateFilter ? 'No results matching your filters' : 'Nothing here yet'}
          description={activeSearch || activeDateFilter ? 'Try adjusting your search or filters to find what you\'re looking for.' : 'Add your first supplier to get started.'}
          action={activeSearch || activeDateFilter ? (
            <Button variant="secondary" size="sm" onClick={() => { setSearch(''); setDateFrom(''); setDateTo('') }}>
              Clear filters
            </Button>
          ) : undefined}
        />
      ) : (
      <div style={{ overflowX: 'auto', width: '100%' }}>
        <Table
          columns={columns}
          rows={suppliers}
          loading={isLoading}
          rowKey="supp_id"
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={handleSort}
          onRowClick={(row) => setDrawerSupplier(row)}
          selectedIndex={selectedIndex}
          onSelectedIndexChange={setSelectedIndex}
        />
      </div>
      )}

      {/* Pagination */}
      {/* Server-paginated: filters do NOT hide pagination. When you search     */}
      {/* "ABC" and get 47 results across 3 pages, pagination must stay visible */}
      {/* so the user can navigate those pages. The old client-side pattern     */}
      {/* (hide pagination when filter active) was wrong here. Customers and    */}
      {/* Categories pages both show pagination regardless of active filters.   */}
      <Pagination pagination={pagination} onPageChange={setPage} />

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
    </>
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
          <select className="sb-select" {...register('supp_country_code')} style={selectStyle}>
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
    border: `1.5px solid ${hasError ? 'var(--danger-text)' : 'var(--border)'}`,
    borderRadius: 'var(--r-md)', fontSize: 14,
    background: 'var(--bg-page)',
    color: 'var(--text-primary)',
    outline: 'none', boxSizing: 'border-box',
    fontFamily: 'inherit',
  };
}