import api from '../../../api/axios';

// ── Sales list — server-side search, status, and pagination ──────────────
// FIX: was hardcoded { limit: 100 } with no search/status support.
// Now accepts { page, limit, search, status } and passes them as axios params.
// undefined values are automatically omitted by axios (no empty query strings).
export const fetchSales = async ({ page = 1, limit = 20, search, status } = {}) => {
  const res = await api.get('/sales', {
    params: {
      page,
      limit,
      search:  search  || undefined,   // don't send empty string
      status:  status  || undefined,   // don't send empty string / "all"
    },
  });
  return res.data;  // shape: { items: [...], pagination: { total, page, limit, total_pages, ... } }
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

// ── Customers for the Create Invoice dropdown ─────────────────────────────
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
