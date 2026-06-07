import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect, useRef } from 'react';
import { toast } from 'react-hot-toast';
import { fetchSales, updateSaleStatus, fetchAllSalesForExport } from '../api/salesApi';

const PAGE_SIZE = 20;


// ── Date → UTC ISO boundary converters ───────────────────────────────────────
//
// WHY THESE EXIST:
//   The <input type="date"> gives us a "YYYY-MM-DD" string in the user's LOCAL
//   date system — e.g., the user in EST picks "2026-06-05" meaning their local
//   June 5 (which spans UTC 2026-06-05T05:00:00Z → 2026-06-06T04:59:59Z).
//
//   The backend filters on `sales_created_at` which is stored in UTC.
//   If we send the bare date string "2026-06-05", PostgreSQL treats it as UTC
//   midnight → UTC end-of-day, so records from EST's 7PM–midnight (UTC June 6)
//   are silently excluded even though the table displays them as "Jun 5".
//
// THE FIX:
//   Convert the local date to UTC ISO strings that represent the actual
//   UTC boundaries of the user's local day BEFORE sending to the API.
//
//   new Date("2026-06-05") parses as UTC midnight (JS spec for date-only strings).
//   .setHours(0, 0, 0, 0) shifts to LOCAL midnight in the browser's TZ.
//   .toISOString() converts back to a full UTC ISO string with 'Z' suffix.
//
//   Result for an EST user (UTC-5) selecting "2026-06-05":
//     localDayStartUTC → "2026-06-05T05:00:00.000Z"  (midnight EST in UTC)
//     localDayEndUTC   → "2026-06-06T04:59:59.999Z"  (11:59 PM EST in UTC)
//
//   The backend receives these and compares directly — no T23:59:59 suffix needed.
//
function localDayStartUTC(dateStr) {
  const d = new Date(dateStr);
  d.setHours(0, 0, 0, 0);     // shift to local midnight
  return d.toISOString();      // "2026-06-05T05:00:00.000Z" for EST
}

function localDayEndUTC(dateStr) {
  const d = new Date(dateStr);
  d.setHours(23, 59, 59, 999); // shift to local end-of-day
  return d.toISOString();      // "2026-06-06T04:59:59.999Z" for EST
}


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

  // ── CSV export state ──────────────────────────────────────────────────────
  // Export is lazy: we fetch all matching rows ONLY when the button is clicked.
  // debouncedSearch is declared above so this closure captures it safely.
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const allRows = await fetchAllSalesForExport({
        search:    debouncedSearch || undefined,
        status:    statusFilter    || undefined,
        // FIX: convert local date to UTC ISO boundary before sending to backend
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
  // queryKey includes page + search + status + dates + sort so any change
  // triggers a refetch. sort_by and sort_dir are now sent to the backend so
  // the ORDER BY applies across the FULL filtered result set — not just the
  // 20 rows on the current page.
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
      // FIX: convert local date to UTC ISO boundary before sending to backend
      date_from: dateFrom ? localDayStartUTC(dateFrom) : undefined,
      date_to:   dateTo   ? localDayEndUTC(dateTo)     : undefined,
      // SORT FIX: pass sort params to backend so ORDER BY runs on all matching
      // rows, not just the 20 rows on the current page.
      sort_by:   sortKey  || undefined,
      sort_dir:  sortDir  || undefined,
    }),
    staleTime:        30 * 1000,
    placeholderData: (prev) => prev,
  });

  // Unwrap pagination envelope: { items: [...], pagination: { total, ... } }
  const rawItems   = serverData?.items       ?? [];
  const pagination = serverData?.pagination  ?? {};
  const totalItems = pagination.total        ?? 0;
  const totalPages = pagination.total_pages  ?? 1;

  // ── Client-side sort REMOVED ──────────────────────────────────────────────
  // Previously: useMemo sorted the current page's 20 rows in JavaScript.
  // Now: sort_by + sort_dir are sent to the backend. PostgreSQL applies
  // ORDER BY before OFFSET/LIMIT so the sort is correct across all pages.
  //
  // The server-side date filter (backend handles date_from/date_to) means
  // rawItems is already filtered correctly by both date AND sort.
  const sales = rawItems;

  // ── Sort handler ─────────────────────────────────────────────────────────
  const handleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  };

  // ── Date handler ─────────────────────────────────────────────────────────
  const handleDateChange = (field, val) => {
    if (field === 'from') { setDateFrom(val); setPage(1); }
    else                  { setDateTo(val);   setPage(1); }
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
    // FIX: exportData removed — export is now lazy via handleExport().
    // handleExport() fetches ALL matching rows (up to 1000) with the current
    // active filters, so the CSV always contains the full result set,
    // not just the 20 rows currently visible on screen.
    isExporting,
    handleExport,
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