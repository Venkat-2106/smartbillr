import api from '../../../api/axios'

export async function fetchExpenses({
  page         = 1,
  limit        = 20,
  search       = '',
  category     = '',
  sort_by      = 'expense_date',
  sort_dir     = 'desc',
  date_from    = '',
  date_to      = '',
} = {}) {
  const params = { page, limit }
  if (search.trim())   params.search    = search.trim()
  if (category)        params.category  = category
  if (sort_by)         params.sort_by   = sort_by
  if (sort_dir)        params.sort_dir  = sort_dir
  if (date_from)       params.date_from = date_from
  if (date_to)         params.date_to   = date_to

  const res = await api.get('/expenses/', { params })
  return res.data
}

export async function fetchAllExpensesForExport({
  search       = '',
  category     = '',
  sort_by      = 'expense_date',
  sort_dir     = 'desc',
  date_from    = '',
  date_to      = '',
} = {}) {
  const params = { page: 1, limit: 10000 }
  if (search.trim())   params.search    = search.trim()
  if (category)        params.category  = category
  if (sort_by)         params.sort_by   = sort_by
  if (sort_dir)        params.sort_dir  = sort_dir
  if (date_from)       params.date_from = date_from
  if (date_to)         params.date_to   = date_to

  const res = await api.get('/expenses/', { params })
  return res.data?.items ?? []
}

export async function fetchExpense(expenseId) {
  const res = await api.get(`/expenses/${expenseId}/`)
  return res.data
}

export async function createExpense(payload) {
  const res = await api.post('/expenses/', payload)
  return res.data
}

export async function updateExpense(expenseId, payload) {
  const res = await api.put(`/expenses/${expenseId}/`, payload)
  return res.data
}

export async function deleteExpense(expenseId) {
  const res = await api.delete(`/expenses/${expenseId}/`)
  return res.data
}
