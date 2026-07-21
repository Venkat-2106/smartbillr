// features/customers/importConfig.js
//
// Bulk import configuration for Customers module.
// Passed to <BulkImportPanel> in CustomersPage.

import {
  CUSTOMER_IMPORT_TEMPLATE,
  CUSTOMER_IMPORT_SAMPLES,
  CUSTOMER_UPDATE_TEMPLATE,
  CUSTOMER_UPDATE_SAMPLES,
} from '../../shared/utils/csvExport'
import {
  CUSTOMER_GUIDELINES,
  CUSTOMER_UPDATE_GUIDELINES,
} from '../../shared/utils/importGuidelines'

export const customerImportConfig = {
  endpoint: '/customers/import',
  title: 'Customers',
  create: {
    columns: CUSTOMER_IMPORT_TEMPLATE,
    sampleRows: CUSTOMER_IMPORT_SAMPLES,
    requiredColumns: [
      { key: 'cust_name', label: 'Customer Name', alternates: ['name'] },
    ],
    guidelines: CUSTOMER_GUIDELINES,
  },
  update: {
    columns: CUSTOMER_UPDATE_TEMPLATE,
    sampleRows: CUSTOMER_UPDATE_SAMPLES,
    requiredColumns: [
      { key: 'cust_name', label: 'Customer Name', alternates: ['name'] },
    ],
    guidelines: CUSTOMER_UPDATE_GUIDELINES,
  },
}
