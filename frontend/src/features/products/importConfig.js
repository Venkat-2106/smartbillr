// features/products/importConfig.js
//
// Bulk import configuration for Products module.
// Passed to <BulkImportPanel> in ProductsPage.

import {
  PRODUCT_IMPORT_TEMPLATE,
  PRODUCT_IMPORT_SAMPLES,
  PRODUCT_UPDATE_SAMPLES,
} from '../../shared/utils/csvExport'
import {
  PRODUCT_GUIDELINES,
  PRODUCT_UPDATE_GUIDELINES,
} from '../../shared/utils/importGuidelines'

export const productImportConfig = {
  endpoint: '/products/import',
  title: 'Products',
  create: {
    columns: PRODUCT_IMPORT_TEMPLATE,
    sampleRows: PRODUCT_IMPORT_SAMPLES,
    requiredColumns: [
      { key: 'prod_name',       label: 'Product Name', alternates: ['name'] },
      { key: 'category_name',   label: 'Category',     alternates: ['Category'] },
      { key: 'prod_sell_price', label: 'Sell Price',   alternates: ['sell_price'] },
      { key: 'prod_cost_price', label: 'Cost Price',   alternates: ['cost_price'] },
    ],
    guidelines: PRODUCT_GUIDELINES,
  },
  update: {
    sampleRows: PRODUCT_UPDATE_SAMPLES,
    requiredColumns: [],
    guidelines: PRODUCT_UPDATE_GUIDELINES,
  },
}
