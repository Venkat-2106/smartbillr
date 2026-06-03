import api from '../../../api/axios';

// ─────────────────────────────────────────────────────────────────────────────
// WHY limit=100?
// We fetch ALL suppliers at once so we can do client-side search/sort/filter
// on the full dataset. The backend caps limit at 100 (configured in paginate()).
// ─────────────────────────────────────────────────────────────────────────────
export const fetchSuppliers = async () => {
  const res = await api.get('/suppliers', { params: { limit: 100 } });
  const data = res.data;
  // Backend may return a flat array OR a paginated {items:[]} shape
  // We handle both so this never breaks
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  return [];
};

// Fetch a single supplier by ID (used by the detail drawer)
export const fetchSupplier = async (id) => {
  const res = await api.get(`/suppliers/${id}`);
  return res.data;
};

// Create a new supplier
// body → { supp_name, supp_phone, supp_email, supp_address,
//           supp_state, supp_country_code, supp_tax_number }
export const createSupplier = async (body) => {
  const res = await api.post('/suppliers', body);
  return res.data;
};

// Update an existing supplier (backend also sets updated_by automatically)
export const updateSupplier = async (id, body) => {
  const res = await api.put(`/suppliers/${id}`, body);
  return res.data;
};

// Soft-delete a supplier (sets is_deleted = true in DB, not a real DELETE)
export const deleteSupplier = async (id) => {
  const res = await api.delete(`/suppliers/${id}`);
  return res.data;
};