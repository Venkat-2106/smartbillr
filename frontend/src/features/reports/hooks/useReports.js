import { useQuery } from '@tanstack/react-query'
import { fetchReportSummary, fetchReportTrend } from '../api/reportsApi'

export function useReportSummary() {
  return useQuery({
    queryKey: ['report-summary'],
    queryFn:  fetchReportSummary,
    staleTime: 5 * 60 * 1000,
  })
}

export function useReportTrend(period) {
  return useQuery({
    queryKey: ['report-trend', period],
    queryFn:  () => fetchReportTrend(period),
    staleTime: 5 * 60 * 1000,
  })
}
