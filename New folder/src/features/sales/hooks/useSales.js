import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useMemo, useEffect, useRef } from 'react';
import { toast } from 'react-hot-toast';
import { fetchSales, updateSaleStatus } from '../api/salesApi';

const PAGE_SIZE = 20;

export function useSales() {
  const queryClient = useQueryClient();

  // ── Server-side state (drives API calls) ─────────────────────────────────
  const [page,         setPage]        = useState(1);
  const [search,       setSearchRaw]   = useState('');
  const [statusFilter, setStatusRaw]   = useState('');

  // ── Client-side only state (date filter applied locally on returned page) ─
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo,   setDateTo]   = useState('');

  // ── Sort state (applied locally on current page result) ──────────────────
  const [sortKey, setSortKey] = useState('sales_created_at');
  const [sortDir, setSortDir] = useState('desc');

  // ── Drawer state ─────────────────────────────────────────────────────────
  const [drawerSale, setDrawerSale] = useState(null);

  // ── Debounce search (300ms) — local state updates instantly, API waits ───
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const debounceTimer = useRef(null);

  useEffect(() => {
    clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);   // reset to page 1 on new search
    }, 300);
    return () => clearTimeout(debounceTimer.current);
  }, [search]);

  // Reset page when status changes
  useEffect(() => { setPage(1); }, [statusFilter]);

  // ── React Query — server-side fetch ──────────────────────────────────────
  // queryKey includes page + search + status so any change triggers a refetch.
  // keepPreviousData: true keeps the old table visible while the new page loads
  // (no blank flash between pages).
  const {
    data: serverData,
    isLoading,
    isError,
    isFetching,
  } = useQuery({
    queryKey:  ['sales', page, debouncedSearch, statusFilter],
    queryFn:   () => fetchSales({
      page,
      limit:  PAGE_SIZE,
      search: debouncedSearch || undefined,
      status: statusFilter    || undefined,
    }),
    staleTime:        30 * 1000,   // cache for 30s — avoid refetch on tab switch
    keepPreviousData: true,        // table stays visible during page transition
  });

  // Unwrap pagination envelope: { items: [...], pagination: { total, ... } }
  const rawItems   = serverData?.items       ?? [];
  const pagination = serverData?.pagination  ?? {};
  const totalItems = pagination.total        ?? 0;
  const totalPages = pagination.total_pages  ?? 1;

  // ── Client-side date filter (applied on current page only) ───────────────
  // WHY not server-side: the backend doesn't yet have a date param for sales.
  // This is a shallow filter on the ~20 rows already returned — negligible cost.
  const dateFiltered = useMemo(() => {
    let rows = [...rawItems];
    if (dateFrom) {
      rows = rows.filter(s => s.sales_created_at && s.sales_created_at >= dateFrom);
    }
    if (dateTo) {
      rows = rows.filter(s =>
        s.sales_created_at && s.sales_created_at <= `${dateTo}T23:59:59`
      );
    }
    return rows;
  }, [rawItems, dateFrom, dateTo]);

  // ── Client-side sort (on current page only) ──────────────────────────────
  const sales = useMemo(() => {
    const rows = [...dateFiltered];
    rows.sort((a, b) => {
      const av = a[sortKey] ?? '';
      const bv = b[sortKey] ?? '';
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ?  1 : -1;
      return 0;
    });
    return rows;
  }, [dateFiltered, sortKey, sortDir]);

  // ── Sort handler ─────────────────────────────────────────────────────────
  const handleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  };

  // ── Date handler ─────────────────────────────────────────────────────────
  const handleDateChange = (field, val) => {
    if (field === 'from') setDateFrom(val);
    else                  setDateTo(val);
  };

  const activeSearch       = !!debouncedSearch;
  const activeDateFilter   = !!(dateFrom || dateTo);
  const activeStatusFilter = !!statusFilter;
  const anyFilterActive    = activeSearch || activeDateFilter || activeStatusFilter;

  // ── Status mutation ──────────────────────────────────────────────────────
  const statusMutation = useMutation({
    mutationFn: ({ id, status }) => updateSaleStatus(id, status),
    onSuccess: (_, variables) => {
      // Invalidate all sales query keys (any page/search combo)
      queryClient.invalidateQueries({ queryKey: ['sales'] });
      queryClient.invalidateQueries({ queryKey: ['sale', variables.id] });
      toast.success('Payment status updated');
    },
    onError: (err) =>
      toast.error(err?.response?.data?.message || 'Failed to update status'),
  });

  return {
    // Data
    sales,
    exportData: sales,    // export shows current filtered page (server already filtered)
    isLoading: isLoading || isFetching,
    hasData: !!serverData,   // true once first load completes — drives skeleton vs table
    isError,
    totalItems,
    totalPages,

    // Search / filter
    search,
    setSearch:       (v) => setSearchRaw(v),
    statusFilter,
    setStatusFilter: (v) => setStatusRaw(v),
    dateFrom, dateTo, handleDateChange,
    activeSearch, activeDateFilter, activeStatusFilter, anyFilterActive,

    // Sort
    sortKey, sortDir, handleSort,

    // Pagination
    page, setPage,

    // Drawer
    drawerSale, setDrawerSale,

    // Mutations
    statusMutation,
  };
}
