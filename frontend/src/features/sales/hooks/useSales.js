// src/features/sales/hooks/useSales.js
//
// CHANGE FROM EXISTING:
//   Replaced manual debounce (useRef + clearTimeout + setTimeout in useEffect)
//   with the shared useDebounce hook — same as useCustomers.js and useSuppliers.js.
//
//   WHY: The manual approach worked but was inconsistent with every other hook
//   in the project. If useDebounce.js ever gets a bug fix, useSales would be
//   the only hook not benefiting from it. Now all hooks use the same source.
//
//   BEHAVIOUR IS IDENTICAL: 300ms delay, resets page to 1 on new search.
//   The only visible change is cleaner code — no functional difference.
//
// Everything else (queryKey, fetchSales params, sort, pagination, mutations)
// is completely unchanged.

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'react-hot-toast';
import { fetchSales, updateSaleStatus, fetchAllSalesForExport } from '../api/salesApi';
import { localDayStartUTC, localDayEndUTC } from '../../../shared/utils/dateUtils';
import { useDebounce } from '../../../shared/hooks/useDebounce';

const PAGE_SIZE = 20;

export function useSales() {
  const queryClient = useQueryClient();

  // ── Server-side state (drives API calls) ─────────────────────────────────
  const [page,         setPage]      = useState(1);
  const [search,       setSearchRaw] = useState('');
  const [statusFilter, setStatusRaw] = useState('');

  // ── Date filter state ─────────────────────────────────────────────────────
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo,   setDateTo]   = useState('');

  // ── Sort state ────────────────────────────────────────────────────────────
  const [sortKey, setSortKey] = useState('sales_created_at');
  const [sortDir, setSortDir] = useState('desc');

  // ── Drawer state ─────────────────────────────────────────────────────────
  const [drawerSale, setDrawerSale] = useState(null);

  // ── Debounce search — shared hook, 300ms (same as useCustomers) ───────────
  // CHANGE: replaced manual useRef+clearTimeout with useDebounce hook.
  const debouncedSearch = useDebounce(search, 300);

  // ── CSV export ────────────────────────────────────────────────────────────
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const allRows = await fetchAllSalesForExport({
        search:    debouncedSearch || undefined,
        status:    statusFilter    || undefined,
        date_from: dateFrom ? localDayStartUTC(dateFrom) : undefined,
        date_to:   dateTo   ? localDayEndUTC(dateTo)     : undefined,
      });
      return allRows;
    } catch {
      toast.error('Export failed — please try again');
      return [];
    } finally {
      setIsExporting(false);
    }
  };

  // ── React Query — server-side fetch ──────────────────────────────────────
  const {
    data: serverData,
    isLoading,
    isError,
    isFetching,
  } = useQuery({
    queryKey:  ['sales', page, debouncedSearch, statusFilter, dateFrom, dateTo, sortKey, sortDir],
    queryFn:   () => fetchSales({
      page,
      limit:     PAGE_SIZE,
      search:    debouncedSearch || undefined,
      status:    statusFilter    || undefined,
      date_from: dateFrom ? localDayStartUTC(dateFrom) : undefined,
      date_to:   dateTo   ? localDayEndUTC(dateTo)     : undefined,
      sort_by:   sortKey  || undefined,
      sort_dir:  sortDir  || undefined,
    }),
    staleTime:       30 * 1000,
    placeholderData: (prev) => prev,
  });

  // Unwrap pagination envelope
  const rawItems   = serverData?.items      ?? [];
  const pagination = serverData?.pagination ?? {};
  const totalItems = pagination.total       ?? 0;
  const totalPages = pagination.total_pages ?? 1;

  const sales = rawItems;

  // ── Sort handler ──────────────────────────────────────────────────────────
  const handleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
    setPage(1);
  };

  // ── Date handler ──────────────────────────────────────────────────────────
  const handleDateChange = (field, val) => {
    if (field === 'from') { setDateFrom(val); setPage(1); }
    else                  { setDateTo(val);   setPage(1); }
  };

  // ── Search handler — resets page ──────────────────────────────────────────
  // CHANGE: page reset on search is now handled naturally by debouncedSearch
  // changing, which changes the queryKey, which triggers a refetch from page 1.
  // We explicitly reset page here too so the Pagination component reflects it.
  const handleSearch = (val) => {
    setSearchRaw(val);
    setPage(1);
  };

  // ── Status filter handler — resets page ───────────────────────────────────
  const handleStatusFilter = (val) => {
    setStatusRaw(val);
    setPage(1);
  };

  const activeSearch       = !!debouncedSearch;
  const activeDateFilter   = !!(dateFrom || dateTo);
  const activeStatusFilter = !!statusFilter;
  const anyFilterActive    = activeSearch || activeDateFilter || activeStatusFilter;

  // ── Status mutation ───────────────────────────────────────────────────────
  const statusMutation = useMutation({
    mutationFn: ({ id, status }) => updateSaleStatus(id, status),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['sales'] });
      queryClient.invalidateQueries({ queryKey: ['sale', variables.id] });
      toast.success('Payment status updated');
    },
    onError: (err) =>
      toast.error(err?.response?.data?.message || 'Failed to update status'),
  });

  return {
    sales,
    isExporting,
    handleExport,
    isLoading: isLoading || isFetching,
    hasData: !!serverData,
    isError,
    totalItems,
    totalPages,

    search,
    setSearch:       handleSearch,
    statusFilter,
    setStatusFilter: handleStatusFilter,
    dateFrom, dateTo, handleDateChange,
    activeSearch, activeDateFilter, activeStatusFilter, anyFilterActive,

    sortKey, sortDir, handleSort,

    page, setPage,

    drawerSale, setDrawerSale,

    statusMutation,
  };
}