// features/stock/importConfig.js
//
// Bulk import configuration for Stock module.
// Passed to <BulkImportPanel> in StockPage.

import {
  STOCK_IMPORT_TEMPLATE,
  STOCK_IMPORT_SAMPLES,
} from '../../shared/utils/csvExport'
import { STOCK_GUIDELINES } from '../../shared/utils/importGuidelines'

export const stockImportConfig = {
  endpoint: '/stock/import',
  title: 'Stock',
  create: {
    columns: STOCK_IMPORT_TEMPLATE,
    sampleRows: STOCK_IMPORT_SAMPLES,
    requiredColumns: [
      { key: 'qty', label: 'Quantity', alternates: ['quantity'] },
      { key: 'product_id', label: 'Product ID', alternates: ['prod_id', 'barcode', 'Barcode', 'prod_name', 'product_name', 'Product Name'] },
    ],
    guidelines: STOCK_GUIDELINES,
  },
}
