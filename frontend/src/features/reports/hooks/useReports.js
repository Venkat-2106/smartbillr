import { useQuery } from '@tanstack/react-query'
import * as api from '../api/reportsApi'

// ─── Shared query defaults ──────────────────────────────────────────────────
const DEFAULT_STALE = 5 * 60 * 1000

function dateParams(dateFrom, dateTo) {
  const p = {}
  if (dateFrom) p.date_from = dateFrom
  if (dateTo) p.date_to = dateTo
  return p
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. Dashboard Summary
// ═══════════════════════════════════════════════════════════════════════════════

export function useReportSummary(dateFrom, dateTo) {
  return useQuery({
    queryKey: ['report-summary', dateFrom, dateTo],
    queryFn: () => api.fetchReportSummary(dateParams(dateFrom, dateTo)),
    staleTime: DEFAULT_STALE,
  })
}

// ═══════════════════════════════════════════════════════════════════════════════
// 2. Sales Reports
// ═══════════════════════════════════════════════════════════════════════════════

export function useSalesTrend(period = 'monthly', dateFrom, dateTo) {
  return useQuery({
    queryKey: ['sales-trend', period, dateFrom, dateTo],
    queryFn: () => api.fetchSalesTrend({ period, ...dateParams(dateFrom, dateTo) }),
    staleTime: DEFAULT_STALE,
  })
}

export function useSalesByCustomer(dateFrom, dateTo) {
  return useQuery({
    queryKey: ['sales-by-customer', dateFrom, dateTo],
    queryFn: () => api.fetchSalesByCustomer(dateParams(dateFrom, dateTo)),
    staleTime: DEFAULT_STALE,
  })
}

export function useSalesByProduct(dateFrom, dateTo) {
  return useQuery({
    queryKey: ['sales-by-product', dateFrom, dateTo],
    queryFn: () => api.fetchSalesByProduct(dateParams(dateFrom, dateTo)),
    staleTime: DEFAULT_STALE,
  })
}

export function useSalesByCategory(dateFrom, dateTo) {
  return useQuery({
    queryKey: ['sales-by-category', dateFrom, dateTo],
    queryFn: () => api.fetchSalesByCategory(dateParams(dateFrom, dateTo)),
    staleTime: DEFAULT_STALE,
  })
}

export function useSalesByPaymentMethod(dateFrom, dateTo) {
  return useQuery({
    queryKey: ['sales-by-payment-method', dateFrom, dateTo],
    queryFn: () => api.fetchSalesByPaymentMethod(dateParams(dateFrom, dateTo)),
    staleTime: DEFAULT_STALE,
  })
}

export function useSalesInvoiceStatus(dateFrom, dateTo) {
  return useQuery({
    queryKey: ['sales-invoice-status', dateFrom, dateTo],
    queryFn: () => api.fetchSalesInvoiceStatus(dateParams(dateFrom, dateTo)),
    staleTime: DEFAULT_STALE,
  })
}

// ═══════════════════════════════════════════════════════════════════════════════
// 3. Purchase Reports
// ═══════════════════════════════════════════════════════════════════════════════

export function usePurchaseSummary(dateFrom, dateTo) {
  return useQuery({
    queryKey: ['purchase-summary', dateFrom, dateTo],
    queryFn: () => api.fetchPurchaseSummary(dateParams(dateFrom, dateTo)),
    staleTime: DEFAULT_STALE,
  })
}

export function usePurchaseTrend(period = 'monthly', dateFrom, dateTo) {
  return useQuery({
    queryKey: ['purchase-trend', period, dateFrom, dateTo],
    queryFn: () => api.fetchPurchaseTrend({ period, ...dateParams(dateFrom, dateTo) }),
    staleTime: DEFAULT_STALE,
  })
}

export function usePurchasesBySupplier(dateFrom, dateTo) {
  return useQuery({
    queryKey: ['purchases-by-supplier', dateFrom, dateTo],
    queryFn: () => api.fetchPurchasesBySupplier(dateParams(dateFrom, dateTo)),
    staleTime: DEFAULT_STALE,
  })
}

export function usePurchasesByProduct(dateFrom, dateTo) {
  return useQuery({
    queryKey: ['purchases-by-product', dateFrom, dateTo],
    queryFn: () => api.fetchPurchasesByProduct(dateParams(dateFrom, dateTo)),
    staleTime: DEFAULT_STALE,
  })
}

export function usePurchaseTaxSummary(dateFrom, dateTo) {
  return useQuery({
    queryKey: ['purchase-tax-summary', dateFrom, dateTo],
    queryFn: () => api.fetchPurchaseTaxSummary(dateParams(dateFrom, dateTo)),
    staleTime: DEFAULT_STALE,
  })
}

// ═══════════════════════════════════════════════════════════════════════════════
// 4. Profitability Reports
// ═══════════════════════════════════════════════════════════════════════════════

export function useGrossProfit(dateFrom, dateTo) {
  return useQuery({
    queryKey: ['gross-profit', dateFrom, dateTo],
    queryFn: () => api.fetchGrossProfit(dateParams(dateFrom, dateTo)),
    staleTime: DEFAULT_STALE,
  })
}

export function useProfitByProduct(dateFrom, dateTo) {
  return useQuery({
    queryKey: ['profit-by-product', dateFrom, dateTo],
    queryFn: () => api.fetchProfitByProduct(dateParams(dateFrom, dateTo)),
    staleTime: DEFAULT_STALE,
  })
}

export function useProfitByCategory(dateFrom, dateTo) {
  return useQuery({
    queryKey: ['profit-by-category', dateFrom, dateTo],
    queryFn: () => api.fetchProfitByCategory(dateParams(dateFrom, dateTo)),
    staleTime: DEFAULT_STALE,
  })
}

export function useProfitByCustomer(dateFrom, dateTo) {
  return useQuery({
    queryKey: ['profit-by-customer', dateFrom, dateTo],
    queryFn: () => api.fetchProfitByCustomer(dateParams(dateFrom, dateTo)),
    staleTime: DEFAULT_STALE,
  })
}

export function useProfitTrend(period = 'monthly', dateFrom, dateTo) {
  return useQuery({
    queryKey: ['profit-trend', period, dateFrom, dateTo],
    queryFn: () => api.fetchProfitTrend({ period, ...dateParams(dateFrom, dateTo) }),
    staleTime: DEFAULT_STALE,
  })
}

// ═══════════════════════════════════════════════════════════════════════════════
// 5. Inventory Reports
// ═══════════════════════════════════════════════════════════════════════════════

export function useInventoryValuation() {
  return useQuery({
    queryKey: ['inventory-valuation'],
    queryFn: api.fetchInventoryValuation,
    staleTime: DEFAULT_STALE,
  })
}

export function useInventoryMovementSummary(dateFrom, dateTo) {
  return useQuery({
    queryKey: ['inventory-movement-summary', dateFrom, dateTo],
    queryFn: () => api.fetchInventoryMovementSummary(dateParams(dateFrom, dateTo)),
    staleTime: DEFAULT_STALE,
  })
}

export function useStockFlow(dateFrom, dateTo) {
  return useQuery({
    queryKey: ['stock-flow', dateFrom, dateTo],
    queryFn: () => api.fetchStockFlow(dateParams(dateFrom, dateTo)),
    staleTime: DEFAULT_STALE,
  })
}

export function useMovingProducts(period = 'monthly') {
  return useQuery({
    queryKey: ['moving-products', period],
    queryFn: () => api.fetchMovingProducts({ period }),
    staleTime: DEFAULT_STALE,
  })
}

// ═══════════════════════════════════════════════════════════════════════════════
// 6. Customer Reports
// ═══════════════════════════════════════════════════════════════════════════════

export function useTopCustomers(dateFrom, dateTo, limit = 10) {
  return useQuery({
    queryKey: ['top-customers', dateFrom, dateTo, limit],
    queryFn: () => api.fetchTopCustomers({ limit, ...dateParams(dateFrom, dateTo) }),
    staleTime: DEFAULT_STALE,
  })
}

export function useCustomerHistory(custId) {
  return useQuery({
    queryKey: ['customer-history', custId],
    queryFn: () => api.fetchCustomerHistory(custId),
    enabled: !!custId,
    staleTime: DEFAULT_STALE,
    select: (data) => ({
      ...data,
      sales_history: data?.sales_history?.items ?? [],
      payment_history: data?.payment_history?.items ?? [],
    }),
  })
}

export function useCustomerLifetimeValue() {
  return useQuery({
    queryKey: ['customer-ltv'],
    queryFn: api.fetchCustomerLifetimeValue,
    staleTime: DEFAULT_STALE,
    select: (data) => data?.items ?? [],
  })
}

export function useCustomerOutstanding() {
  return useQuery({
    queryKey: ['customer-outstanding'],
    queryFn: api.fetchCustomerOutstanding,
    staleTime: DEFAULT_STALE,
    select: (data) => data?.items ?? [],
  })
}

// ═══════════════════════════════════════════════════════════════════════════════
// 7. Supplier Reports
// ═══════════════════════════════════════════════════════════════════════════════

export function useTopSuppliers(dateFrom, dateTo, limit = 10) {
  return useQuery({
    queryKey: ['top-suppliers', dateFrom, dateTo, limit],
    queryFn: () => api.fetchTopSuppliers({ limit, ...dateParams(dateFrom, dateTo) }),
    staleTime: DEFAULT_STALE,
  })
}

export function useSupplierHistory(suppId) {
  return useQuery({
    queryKey: ['supplier-history', suppId],
    queryFn: () => api.fetchSupplierHistory(suppId),
    enabled: !!suppId,
    staleTime: DEFAULT_STALE,
    select: (data) => ({
      ...data,
      purchases: data?.purchases?.items ?? [],
    }),
  })
}

export function useSupplierSpendAnalysis() {
  return useQuery({
    queryKey: ['supplier-spend'],
    queryFn: api.fetchSupplierSpendAnalysis,
    staleTime: DEFAULT_STALE,
    select: (data) => data?.items ?? [],
  })
}

// ═══════════════════════════════════════════════════════════════════════════════
// 8. Expense Reports
// ═══════════════════════════════════════════════════════════════════════════════

export function useExpensesByCategory(dateFrom, dateTo) {
  return useQuery({
    queryKey: ['expenses-by-category', dateFrom, dateTo],
    queryFn: () => api.fetchExpensesByCategory(dateParams(dateFrom, dateTo)),
    staleTime: DEFAULT_STALE,
  })
}

export function useExpenseTrend(period = 'monthly', dateFrom, dateTo) {
  return useQuery({
    queryKey: ['expense-trend', period, dateFrom, dateTo],
    queryFn: () => api.fetchExpenseTrend({ period, ...dateParams(dateFrom, dateTo) }),
    staleTime: DEFAULT_STALE,
  })
}

export function useExpenseDistribution(dateFrom, dateTo) {
  return useQuery({
    queryKey: ['expense-distribution', dateFrom, dateTo],
    queryFn: () => api.fetchExpenseDistribution(dateParams(dateFrom, dateTo)),
    staleTime: DEFAULT_STALE,
  })
}

// ═══════════════════════════════════════════════════════════════════════════════
// 9. Tax Reports
// ═══════════════════════════════════════════════════════════════════════════════

export function useTaxCollected(dateFrom, dateTo) {
  return useQuery({
    queryKey: ['tax-collected', dateFrom, dateTo],
    queryFn: () => api.fetchTaxCollected(dateParams(dateFrom, dateTo)),
    staleTime: DEFAULT_STALE,
  })
}

export function useTaxPaid(dateFrom, dateTo) {
  return useQuery({
    queryKey: ['tax-paid', dateFrom, dateTo],
    queryFn: () => api.fetchTaxPaid(dateParams(dateFrom, dateTo)),
    staleTime: DEFAULT_STALE,
  })
}

export function useTaxLiability(dateFrom, dateTo) {
  return useQuery({
    queryKey: ['tax-liability', dateFrom, dateTo],
    queryFn: () => api.fetchTaxLiability(dateParams(dateFrom, dateTo)),
    staleTime: DEFAULT_STALE,
  })
}

export function useTaxByRate(dateFrom, dateTo) {
  return useQuery({
    queryKey: ['tax-by-rate', dateFrom, dateTo],
    queryFn: () => api.fetchTaxByRate(dateParams(dateFrom, dateTo)),
    staleTime: DEFAULT_STALE,
  })
}

// ═══════════════════════════════════════════════════════════════════════════════
// 10. Return Reports
// ═══════════════════════════════════════════════════════════════════════════════

export function useSalesReturns(dateFrom, dateTo) {
  return useQuery({
    queryKey: ['sales-returns', dateFrom, dateTo],
    queryFn: () => api.fetchSalesReturns(dateParams(dateFrom, dateTo)),
    staleTime: DEFAULT_STALE,
  })
}

export function usePurchaseReturns(dateFrom, dateTo) {
  return useQuery({
    queryKey: ['purchase-returns', dateFrom, dateTo],
    queryFn: () => api.fetchPurchaseReturns(dateParams(dateFrom, dateTo)),
    staleTime: DEFAULT_STALE,
  })
}

export function useReturnsTrend(period = 'monthly', dateFrom, dateTo) {
  return useQuery({
    queryKey: ['returns-trend', period, dateFrom, dateTo],
    queryFn: () => api.fetchReturnsTrend({ period, ...dateParams(dateFrom, dateTo) }),
    staleTime: DEFAULT_STALE,
  })
}

export function useReturnsImpact(dateFrom, dateTo) {
  return useQuery({
    queryKey: ['returns-impact', dateFrom, dateTo],
    queryFn: () => api.fetchReturnsImpact(dateParams(dateFrom, dateTo)),
    staleTime: DEFAULT_STALE,
  })
}

// ═══════════════════════════════════════════════════════════════════════════════
// 11. Payment Reports
// ═══════════════════════════════════════════════════════════════════════════════

export function usePaymentCollections(period = 'monthly', dateFrom, dateTo) {
  return useQuery({
    queryKey: ['payment-collections', period, dateFrom, dateTo],
    queryFn: () => api.fetchPaymentCollections({ period, ...dateParams(dateFrom, dateTo) }),
    staleTime: DEFAULT_STALE,
  })
}

export function useOutstandingReceivables() {
  return useQuery({
    queryKey: ['outstanding-receivables'],
    queryFn: api.fetchOutstandingReceivables,
    staleTime: DEFAULT_STALE,
    select: (data) => ({
      ...data,
      invoices: data?.invoices?.items ?? [],
    }),
  })
}

export function usePaymentsByMethod(dateFrom, dateTo) {
  return useQuery({
    queryKey: ['payments-by-method', dateFrom, dateTo],
    queryFn: () => api.fetchPaymentsByMethod(dateParams(dateFrom, dateTo)),
    staleTime: DEFAULT_STALE,
  })
}

export function usePartialPayments() {
  return useQuery({
    queryKey: ['partial-payments'],
    queryFn: api.fetchPartialPayments,
    staleTime: DEFAULT_STALE,
    select: (data) => data?.items ?? [],
  })
}

// ═══════════════════════════════════════════════════════════════════════════════
// 12. Audit Reports (Admin only — calls will 403 without staff.manage)
// ═══════════════════════════════════════════════════════════════════════════════

export function useUserActivities(dateFrom, dateTo, options = {}) {
  return useQuery({
    queryKey: ['user-activities', dateFrom, dateTo],
    queryFn: () => api.fetchUserActivities(dateParams(dateFrom, dateTo)),
    staleTime: DEFAULT_STALE,
    ...options,
  })
}

export function useLoginActivities(dateFrom, dateTo, options = {}) {
  return useQuery({
    queryKey: ['login-activities', dateFrom, dateTo],
    queryFn: () => api.fetchLoginActivities(dateParams(dateFrom, dateTo)),
    staleTime: DEFAULT_STALE,
    ...options,
  })
}

export function useDataChanges(dateFrom, dateTo, options = {}) {
  return useQuery({
    queryKey: ['data-changes', dateFrom, dateTo],
    queryFn: () => api.fetchDataChanges(dateParams(dateFrom, dateTo)),
    staleTime: DEFAULT_STALE,
    ...options,
  })
}

export function useExportActivities(dateFrom, dateTo, options = {}) {
  return useQuery({
    queryKey: ['export-activities', dateFrom, dateTo],
    queryFn: () => api.fetchExportActivities(dateParams(dateFrom, dateTo)),
    staleTime: DEFAULT_STALE,
    ...options,
  })
}

// ─── Backward-compatible aliases (old ReportsPage used these names) ──────────
export { useReportSummary as useOldReportSummary }
