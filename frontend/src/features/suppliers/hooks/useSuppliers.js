import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useMemo } from 'react';
import { toast } from 'react-hot-toast';
import { useDebounce } from '../../../shared/hooks/useDebounce';
import {
  fetchSuppliers,
  createSupplier,
  updateSupplier,
  deleteSupplier,
} from '../api/suppliersApi';

const PAGE_SIZE = 15;
const QUERY_KEY = ['suppliers'];

export function useSuppliers() {
  const queryClient = useQueryClient();

  // ── Filter / sort / page state ───────────────────────────────────────────
  const [search,   setSearchRaw] = useState('');
  const [dateFrom, setDateFrom]  = useState('');
  const [dateTo,   setDateTo]    = useState('');
  const [sortKey,  setSortKey]   = useState('updated_at');
  const [sortDir,  setSortDir]   = useState('desc');
  const [page,     setPage]      = useState(1);

  const debouncedSearch = useDebounce(search, 350);

  // ── Drawer & modal state ─────────────────────────────────────────────────
  const [drawerSupplier, setDrawerSupplier] = useState(null);
  const [showAdd,        setShowAdd]        = useState(false);
  const [editTarget,     setEditTarget]     = useState(null);
  const [deleteTarget,   setDeleteTarget]   = useState(null);

  // ── Fetch all (limit=100 → client-side filter works on full dataset) ─────
  const { data: allSuppliers = [], isLoading, isError } = useQuery({
    queryKey: QUERY_KEY,
    queryFn:  fetchSuppliers,
    staleTime: 5 * 60 * 1000,
  });

  // ── Client-side: filter → sort → paginate ───────────────────────────────
  const filtered = useMemo(() => {
    let rows = [...allSuppliers];

    // Text search (name, phone, email, state, country)
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase();
      rows = rows.filter((s) =>
        (s.supp_name         || '').toLowerCase().includes(q) ||
        (s.supp_phone        || '').toLowerCase().includes(q) ||
        (s.supp_email        || '').toLowerCase().includes(q) ||
        (s.supp_state        || '').toLowerCase().includes(q) ||
        (s.supp_country_code || '').toLowerCase().includes(q)
      );
    }

    // Date range on updated_at
    if (dateFrom) {
      rows = rows.filter((s) => s.updated_at && s.updated_at >= dateFrom);
    }
    if (dateTo) {
      rows = rows.filter(
        (s) => s.updated_at && s.updated_at <= `${dateTo}T23:59:59`
      );
    }

    // Sort
    rows.sort((a, b) => {
      const av = a[sortKey] ?? '';
      const bv = b[sortKey] ?? '';
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1  : -1;
      return 0;
    });

    return rows;
  }, [allSuppliers, debouncedSearch, dateFrom, dateTo, sortKey, sortDir]);

  const { totalItems, totalPages, paginated } = useMemo(() => {
    const totalItems = filtered.length;
    const totalPages = Math.ceil(totalItems / PAGE_SIZE);
    const activeSearch     = !!debouncedSearch;
    const activeDateFilter = !!(dateFrom || dateTo);
    const paginated = (activeSearch || activeDateFilter)
      ? filtered
      : filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
    return { totalItems, totalPages, paginated };
  }, [filtered, page, debouncedSearch, dateFrom, dateTo]);

  const activeSearch    = !!debouncedSearch;
  const activeDateFilter = !!(dateFrom || dateTo);

  // ── Sort handler ─────────────────────────────────────────────────────────
  const handleSort = (key) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
    setPage(1);
  };

  // ── Date filter handler ──────────────────────────────────────────────────
  const handleDateChange = (field, val) => {
    if (field === 'from') setDateFrom(val);
    else                  setDateTo(val);
    setPage(1);
  };

  // ── Mutations ────────────────────────────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: createSupplier,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      toast.success('Supplier added successfully');
      setShowAdd(false);
    },
    onError: (err) =>
      toast.error(err?.response?.data?.message || 'Failed to add supplier'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }) => updateSupplier(id, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      toast.success('Supplier updated successfully');
      setEditTarget(null);
    },
    onError: (err) =>
      toast.error(err?.response?.data?.message || 'Failed to update supplier'),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteSupplier,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      toast.success('Supplier deleted');
      setDeleteTarget(null);
    },
    onError: (err) =>
      toast.error(err?.response?.data?.message || 'Failed to delete supplier'),
  });

  return {
    // Data
    suppliers: paginated,
    exportData: filtered,        // full filtered set → CSV export
    isLoading,
    isError,
    totalItems,
    totalPages,

    // Search / filter
    search,
    setSearch: (v) => { setSearchRaw(v); setPage(1); },
    dateFrom,
    dateTo,
    handleDateChange,
    activeSearch,
    activeDateFilter,

    // Sort
    sortKey,
    sortDir,
    handleSort,

    // Pagination
    page,
    setPage,

    // Drawer
    drawerSupplier,
    setDrawerSupplier,

    // Modals
    showAdd,        setShowAdd,
    editTarget,     setEditTarget,
    deleteTarget,   setDeleteTarget,

    // Mutations
    createMutation,
    updateMutation,
    deleteMutation,
  };
}