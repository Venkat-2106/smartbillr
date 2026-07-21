// features/categories/importConfig.js
//
// Bulk import configuration for Categories module.
// Passed to <BulkImportPanel> in CategoriesPage.

import {
  CATEGORY_IMPORT_TEMPLATE,
  CATEGORY_IMPORT_SAMPLES,
} from '../../shared/utils/csvExport'
import { CATEGORY_GUIDELINES } from '../../shared/utils/importGuidelines'

export const categoryImportConfig = {
  endpoint: '/categories/import',
  title: 'Categories',
  create: {
    columns: CATEGORY_IMPORT_TEMPLATE,
    sampleRows: CATEGORY_IMPORT_SAMPLES,
    requiredColumns: [
      { key: 'category_name', label: 'Category Name', alternates: ['name'] },
    ],
    guidelines: CATEGORY_GUIDELINES,
  },
}
