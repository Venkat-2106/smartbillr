import api from '../../../api/axios';

// ── Sales list — server-side search, status, and pagination ──────────────
// FIX: was hardcoded { limit: 100 } with no search/status support.
// Now accepts { page, limit, search, status } and passes them as axios params.
// undefined values are automatically omitted by axios (no empty query strings).
export const fetchSales = async ({ page = 1, limit = 20, search, status, date_from, date_to } = {}) => {
  const res = await api.get('/sales', {
    params: {
      page,
      limit,
      search:    search    || undefined,
      status:    status    || undefined,
      date_from: date_from || undefined,
      date_to:   date_to   || undefined,
    },
  });
  return res.data;
};

// ── Single sale detail with items ─────────────────────────────────────────
export const fetchSale = async (id) => {
  const res = await api.get(`/sales/${id}`);
  return res.data;
};

// ── Create new sale ───────────────────────────────────────────────────────
export const createSale = async (body) => {
  const res = await api.post('/sales', body);
  return res.data;
};

// ── Update payment status only ────────────────────────────────────────────
// WHY /status suffix: backend route is PATCH /sales/{id}/status
// WHY { status }: SaleStatusUpdate schema expects key "status", not "payment_status"
export const updateSaleStatus = async (id, payment_status) => {
  const res = await api.patch(`/sales/${id}/status`, { status: payment_status });
  return res.data;
};

// ── Export: fetch ALL matching sales (up to 1000) for CSV download ────────
// The normal fetchSales call is paginated (20 rows). This call uses limit=1000
// and passes the same active filters so the exported file matches what the
// user is currently viewing — not just the current page.
export const fetchAllSalesForExport = async ({ search, status, date_from, date_to } = {}) => {
  const res = await api.get('/sales', {
    params: {
      page:      1,
      limit:     1000,
      search:    search    || undefined,
      status:    status    || undefined,
      date_from: date_from || undefined,
      date_to:   date_to   || undefined,
    },
  });
  return res.data?.items ?? [];
};
export const fetchCustomersForSale = async () => {
  const res = await api.get('/customers', { params: { limit: 100 } });
  const data = res.data;
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  return [];
};

// ── Products for line items in Create Invoice ─────────────────────────────
export const fetchProductsForSale = async () => {
  const res = await api.get('/products', { params: { limit: 100 } });
  const data = res.data;
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  return [];
};