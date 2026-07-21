// features/suppliers/importConfig.js
//
// Bulk import configuration for Suppliers module.
// Passed to <BulkImportPanel> in SuppliersPage.

import {
  SUPPLIER_IMPORT_TEMPLATE,
  SUPPLIER_IMPORT_SAMPLES,
  SUPPLIER_UPDATE_TEMPLATE,
  SUPPLIER_UPDATE_SAMPLES,
} from '../../shared/utils/csvExport'
import {
  SUPPLIER_GUIDELINES,
  SUPPLIER_UPDATE_GUIDELINES,
} from '../../shared/utils/importGuidelines'

export const supplierImportConfig = {
  endpoint: '/suppliers/import',
  title: 'Suppliers',
  create: {
    columns: SUPPLIER_IMPORT_TEMPLATE,
    sampleRows: SUPPLIER_IMPORT_SAMPLES,
    requiredColumns: [
      { key: 'supp_name', label: 'Supplier Name', alternates: ['name'] },
    ],
    guidelines: SUPPLIER_GUIDELINES,
  },
  update: {
    columns: SUPPLIER_UPDATE_TEMPLATE,
    sampleRows: SUPPLIER_UPDATE_SAMPLES,
    requiredColumns: [
      { key: 'supp_name', label: 'Supplier Name', alternates: ['name'] },
    ],
    guidelines: SUPPLIER_UPDATE_GUIDELINES,
  },
}
