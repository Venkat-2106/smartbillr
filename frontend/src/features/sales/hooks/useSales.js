// src/features/sales/hooks/useSales.js
//
// FIX APPLIED:
//   Added `enabled: !!user` to useQuery — the only hook in the project missing
//   this guard. Every other hook (useCustomers, useSuppliers, useCategories,
//   useProducts, usePurchases, useStock, usePayments) has this guard.
//   Without it, the query fires the moment SalesPage mounts, even if Zustand
//   hasn't hydrated from localStorage yet (user is null). This caused 2 failed
//   401 requests on every sales page load (1 attempt + 1 retry from retry:1
//   in the global QueryClient config). Adding the guard makes it fire only
//   after the user is confirmed — identical to every other hook.

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'react-hot-toast';
import { fetchSales, updateSaleStatus, fetchAllSalesForExport } from '../api/salesApi';
import { localDayStartUTC, localDayEndUTC } from '../../../shared/utils/dateUtils';
import { useDebounce } from '../../../shared/hooks/useDebounce';
import useAuthStore from '../../../store/authStore';   // FIX: added import

const PAGE_SIZE = 20;

export function useSales() {
  const queryClient = useQueryClient();
  const user        = useAuthStore(s => s.user);       // FIX: read user from store

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
    enabled:         !!user,   // FIX: prevents query firing before auth hydrates
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