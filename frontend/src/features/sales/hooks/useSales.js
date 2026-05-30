import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useMemo } from 'react';
import { toast } from 'react-hot-toast';
import { useDebounce } from '../../../shared/hooks/useDebounce';
import { fetchSales, updateSaleStatus } from '../api/salesApi';

const PAGE_SIZE  = 15;
const QUERY_KEY  = ['sales'];

export function useSales() {
  const queryClient = useQueryClient();

  // ── Filter / sort / page state ───────────────────────────────────────────
  const [search,        setSearchRaw]       = useState('');
  const [statusFilter,  setStatusFilterRaw] = useState('');
  const [dateFrom,      setDateFrom]        = useState('');
  const [dateTo,        setDateTo]          = useState('');
  const [sortKey,       setSortKey]         = useState('sales_created_at');
  const [sortDir,       setSortDir]         = useState('desc');
  const [page,          setPage]            = useState(1);

  // ── Drawer state ─────────────────────────────────────────────────────────
  const [drawerSale, setDrawerSale] = useState(null);

  const debouncedSearch = useDebounce(search, 350);

  // ── Fetch all ────────────────────────────────────────────────────────────
  const { data: allSales = [], isLoading, isError } = useQuery({
    queryKey: QUERY_KEY,
    queryFn:  fetchSales,
    staleTime: 5 * 60 * 1000,
  });

  // ── Client-side: filter → sort → paginate ───────────────────────────────
  const filtered = useMemo(() => {
    let rows = [...allSales];

    // Text search: invoice_no or customer_name
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase();
      rows = rows.filter(s =>
        (s.invoice_no    || '').toLowerCase().includes(q) ||
        (s.customer_name || '').toLowerCase().includes(q)
      );
    }

    // Payment status filter — backend field is sales_payment_status
    if (statusFilter) {
      rows = rows.filter(s => s.sales_payment_status === statusFilter);
    }

    // Date range on sales_created_at (sales use invoice date, not updated_at)
    if (dateFrom) {
      rows = rows.filter(s => s.sales_created_at && s.sales_created_at >= dateFrom);
    }
    if (dateTo) {
      rows = rows.filter(s =>
        s.sales_created_at && s.sales_created_at <= `${dateTo}T23:59:59`
      );
    }

    // Sort
    rows.sort((a, b) => {
      const av = a[sortKey] ?? '';
      const bv = b[sortKey] ?? '';
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ?  1 : -1;
      return 0;
    });

    return rows;
  }, [allSales, debouncedSearch, statusFilter, dateFrom, dateTo, sortKey, sortDir]);

  const totalItems        = filtered.length;
  const totalPages        = Math.ceil(totalItems / PAGE_SIZE);
  const activeSearch      = !!debouncedSearch;
  const activeDateFilter  = !!(dateFrom || dateTo);
  const activeStatusFilter = !!statusFilter;
  const anyFilterActive   = activeSearch || activeDateFilter || activeStatusFilter;

  const paginated = anyFilterActive
    ? filtered
    : filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // ── Sort handler ─────────────────────────────────────────────────────────
  const handleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
    setPage(1);
  };

  // ── Date handler ─────────────────────────────────────────────────────────
  const handleDateChange = (field, val) => {
    if (field === 'from') setDateFrom(val);
    else                  setDateTo(val);
    setPage(1);
  };

  // ── Status mutation ──────────────────────────────────────────────────────
  const statusMutation = useMutation({
    mutationFn: ({ id, status }) => updateSaleStatus(id, status),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: ['sale', variables.id] });
      toast.success('Payment status updated');
    },
    onError: (err) =>
      toast.error(err?.response?.data?.message || 'Failed to update status'),
  });

  return {
    // Data
    sales: paginated,
    exportData: filtered,
    isLoading, isError,
    totalItems, totalPages,

    // Search / filter
    search,
    setSearch:       (v) => { setSearchRaw(v);       setPage(1); },
    statusFilter,
    setStatusFilter: (v) => { setStatusFilterRaw(v); setPage(1); },
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