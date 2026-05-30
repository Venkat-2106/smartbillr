import api from '../../../api/axios';

// ── Sales list (limit=100 → client-side filter/sort) ─────────────────────
export const fetchSales = async () => {
  const res = await api.get('/sales', { params: { limit: 100 } });
  const data = res.data;
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  return [];
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