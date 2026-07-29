import api from '../../../api/axios'
import { getTzOffsetMinutes } from '../../../shared/utils/dateUtils'

function p(params) {
  const clean = {}
  for (const [k, v] of Object.entries(params || {})) {
    if (v !== null && v !== undefined && v !== '') clean[k] = v
  }
  return clean
}

// 1. Dashboard Summary
export const fetchReportSummary = (params) =>
  api.get('/reports/summary', { params: p(params) }).then(r => r.data)

// 2. Sales Reports
export const fetchSalesTrend = (params) =>
  api.get('/reports/sales/trend', { params: p({ ...params, tz_offset_minutes: getTzOffsetMinutes() }) }).then(r => r.data)

export const fetchSalesByCustomer = (params) =>
  api.get('/reports/sales/by-customer', { params: p(params) }).then(r => r.data)

export const fetchSalesByProduct = (params) =>
  api.get('/reports/sales/by-product', { params: p(params) }).then(r => r.data)

export const fetchSalesByCategory = (params) =>
  api.get('/reports/sales/by-category', { params: p(params) }).then(r => r.data)

export const fetchSalesByPaymentMethod = (params) =>
  api.get('/reports/sales/by-payment-method', { params: p(params) }).then(r => r.data)

export const fetchSalesInvoiceStatus = (params) =>
  api.get('/reports/sales/invoice-status', { params: p(params) }).then(r => r.data)

// 3. Purchase Reports
export const fetchPurchaseSummary = (params) =>
  api.get('/reports/purchases/summary', { params: p(params) }).then(r => r.data)

export const fetchPurchaseTrend = (params) =>
  api.get('/reports/purchases/trend', { params: p({ ...params, tz_offset_minutes: getTzOffsetMinutes() }) }).then(r => r.data)

export const fetchPurchasesBySupplier = (params) =>
  api.get('/reports/purchases/by-supplier', { params: p(params) }).then(r => r.data)

export const fetchPurchasesByProduct = (params) =>
  api.get('/reports/purchases/by-product', { params: p(params) }).then(r => r.data)

export const fetchPurchaseTaxSummary = (params) =>
  api.get('/reports/purchases/tax-summary', { params: p(params) }).then(r => r.data)

// 4. Profitability Reports
export const fetchGrossProfit = (params) =>
  api.get('/reports/profit/gross', { params: p(params) }).then(r => r.data)

export const fetchProfitByProduct = (params) =>
  api.get('/reports/profit/by-product', { params: p(params) }).then(r => r.data)

export const fetchProfitByCategory = (params) =>
  api.get('/reports/profit/by-category', { params: p(params) }).then(r => r.data)

export const fetchProfitByCustomer = (params) =>
  api.get('/reports/profit/by-customer', { params: p(params) }).then(r => r.data)

export const fetchProfitTrend = (params) =>
  api.get('/reports/profit/trend', { params: p({ ...params, tz_offset_minutes: getTzOffsetMinutes() }) }).then(r => r.data)

// 5. Inventory Reports
export const fetchInventoryValuation = () =>
  api.get('/reports/inventory/valuation').then(r => r.data)

export const fetchInventoryMovementSummary = (params) =>
  api.get('/reports/inventory/movement-summary', { params: p(params) }).then(r => r.data)

export const fetchStockFlow = (params) =>
  api.get('/reports/inventory/stock-flow', { params: p(params) }).then(r => r.data)

export const fetchMovingProducts = (params) =>
  api.get('/reports/inventory/moving-products', { params: p(params) }).then(r => r.data)

// 6. Customer Reports
export const fetchTopCustomers = (params) =>
  api.get('/reports/customers/top', { params: p(params) }).then(r => r.data)

export const fetchCustomerHistory = (custId, params) =>
  api.get(`/reports/customers/${custId}/history`, { params: p(params) }).then(r => r.data)

export const fetchCustomerLifetimeValue = (params) =>
  api.get('/reports/customers/lifetime-value', { params: p(params) }).then(r => r.data)

export const fetchCustomerOutstanding = (params) =>
  api.get('/reports/customers/outstanding', { params: p(params) }).then(r => r.data)

// 7. Supplier Reports
export const fetchTopSuppliers = (params) =>
  api.get('/reports/suppliers/top', { params: p(params) }).then(r => r.data)

export const fetchSupplierHistory = (suppId, params) =>
  api.get(`/reports/suppliers/${suppId}/history`, { params: p(params) }).then(r => r.data)

export const fetchSupplierSpendAnalysis = (params) =>
  api.get('/reports/suppliers/spend-analysis', { params: p(params) }).then(r => r.data)

// 8. Expense Reports
export const fetchExpensesByCategory = (params) =>
  api.get('/reports/expenses/by-category', { params: p(params) }).then(r => r.data)

export const fetchExpenseTrend = (params) =>
  api.get('/reports/expenses/trend', { params: p(params) }).then(r => r.data)

export const fetchExpenseDistribution = (params) =>
  api.get('/reports/expenses/distribution', { params: p(params) }).then(r => r.data)

// 9. Tax Reports
export const fetchTaxCollected = (params) =>
  api.get('/reports/tax/collected', { params: p(params) }).then(r => r.data)

export const fetchTaxPaid = (params) =>
  api.get('/reports/tax/paid', { params: p(params) }).then(r => r.data)

export const fetchTaxLiability = (params) =>
  api.get('/reports/tax/liability', { params: p(params) }).then(r => r.data)

export const fetchTaxByRate = (params) =>
  api.get('/reports/tax/by-rate', { params: p(params) }).then(r => r.data)

export const fetchPurchaseTaxByRate = (params) =>
  api.get('/reports/tax/purchases/by-rate', { params: p(params) }).then(r => r.data)

export const fetchTaxTrend = (params) =>
  api.get('/reports/tax/trend', { params: p({ ...params, tz_offset_minutes: getTzOffsetMinutes() }) }).then(r => r.data)

// 10. Return Reports
export const fetchSalesReturns = (params) =>
  api.get('/reports/returns/sales', { params: p(params) }).then(r => r.data)

export const fetchPurchaseReturns = (params) =>
  api.get('/reports/returns/purchases', { params: p(params) }).then(r => r.data)

export const fetchReturnsTrend = (params) =>
  api.get('/reports/returns/trend', { params: p({ ...params, tz_offset_minutes: getTzOffsetMinutes() }) }).then(r => r.data)

export const fetchReturnsImpact = (params) =>
  api.get('/reports/returns/impact', { params: p(params) }).then(r => r.data)

// 11. Payment Reports
export const fetchPaymentCollections = (params) =>
  api.get('/reports/payments/collections', { params: p({ ...params, tz_offset_minutes: getTzOffsetMinutes() }) }).then(r => r.data)

export const fetchOutstandingReceivables = (params) =>
  api.get('/reports/payments/outstanding', { params: p(params) }).then(r => r.data)

export const fetchPaymentsByMethod = (params) =>
  api.get('/reports/payments/by-method', { params: p(params) }).then(r => r.data)

export const fetchPartialPayments = (params) =>
  api.get('/reports/payments/partial', { params: p(params) }).then(r => r.data)

// 12. Audit Reports (Admin only)
export const fetchUserActivities = (params) =>
  api.get('/reports/audit/user-activities', { params: p(params) }).then(r => r.data)

export const fetchLoginActivities = (params) =>
  api.get('/reports/audit/login-activities', { params: p(params) }).then(r => r.data)

export const fetchDataChanges = (params) =>
  api.get('/reports/audit/data-changes', { params: p(params) }).then(r => r.data)

export const fetchExportActivities = (params) =>
  api.get('/reports/audit/exports', { params: p(params) }).then(r => r.data)
