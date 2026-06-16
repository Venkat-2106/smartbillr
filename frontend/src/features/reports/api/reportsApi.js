import api from '../../../api/axios'

export async function fetchReportSummary() {
  const res = await api.get('/dashboard/summary/')
  return res.data
}

export async function fetchReportTrend(period = 'weekly') {
  const res = await api.get('/dashboard/trend/', { params: { period } })
  return res.data
}
