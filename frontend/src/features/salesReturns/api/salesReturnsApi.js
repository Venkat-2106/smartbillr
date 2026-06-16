import api from '../../../api/axios'

export async function fetchSalesReturns({
  page      = 1,
  limit     = 20,
  search    = '',
  status    = '',
  sort_by   = 'return_created_at',
  sort_dir  = 'desc',
  date_from = '',
  date_to   = '',
} = {}) {
  const params = { page, limit }
  if (search.trim())  params.search    = search.trim()
  if (status)         params.status    = status
  if (sort_by)        params.sort_by   = sort_by
  if (sort_dir)       params.sort_dir  = sort_dir
  if (date_from)      params.date_from = date_from
  if (date_to)        params.date_to   = date_to

  const res = await api.get('/sales-returns/', { params })
  return res.data
}

export async function fetchAllSalesReturnsForExport({
  search    = '',
  status    = '',
  sort_by   = 'return_created_at',
  sort_dir  = 'desc',
  date_from = '',
  date_to   = '',
} = {}) {
  const params = { page: 1, limit: 10000 }
  if (search.trim())  params.search    = search.trim()
  if (status)         params.status    = status
  if (sort_by)        params.sort_by   = sort_by
  if (sort_dir)       params.sort_dir  = sort_dir
  if (date_from)      params.date_from = date_from
  if (date_to)        params.date_to   = date_to

  const res = await api.get('/sales-returns/', { params })
  return res.data?.items ?? []
}

export async function fetchSalesReturn(returnId) {
  const res = await api.get(`/sales-returns/${returnId}/`)
  return res.data
}

export async function updateSalesReturnStatus(returnId, payload) {
  const res = await api.put(`/sales-returns/${returnId}/`, payload)
  return res.data
}

export async function deleteSalesReturn(returnId) {
  const res = await api.delete(`/sales-returns/${returnId}/`)
  return res.data
}
