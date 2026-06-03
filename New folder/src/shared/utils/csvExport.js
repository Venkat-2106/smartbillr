// shared/utils/csvExport.js
//
// CSV export utility for SmartBillr.
//
// HOW IT WORKS:
//   1. Takes an array of data objects and column definitions
//   2. Builds a CSV string with proper escaping
//   3. Creates a Blob (file in memory) and triggers browser download
//
// USAGE EXAMPLE (in any page):
//
//   import { exportToCSV } from '../../../shared/utils/csvExport'
//
//   const handleExport = () => {
//     exportToCSV(customers, 'customers', [
//       { key: 'cust_name',         label: 'Customer Name' },
//       { key: 'cust_phone',        label: 'Phone' },
//       { key: 'cust_email',        label: 'Email' },
//       { key: 'cust_state',        label: 'State' },
//       { key: 'cust_country_code', label: 'Country' },
//       { key: 'cust_tax_number',   label: 'Tax Number' },
//       { key: 'cust_created_at',   label: 'Created Date',
//         format: (val) => val ? new Date(val).toLocaleDateString() : '' },
//     ])
//   }
//
// COLUMN DEFINITION OPTIONS:
//   { key: 'field_name', label: 'Column Header', format: (value) => string }
//   - key:    the field name in your data object
//   - label:  the column header row text
//   - format: optional function to transform the value before export
//              (useful for dates, currency, booleans, nested objects)
//
// MULTI-LEVEL FIELD ACCESS:
//   If your data has nested objects, use a custom format fn:
//   { key: 'category', label: 'Category', format: (val) => val?.category_name || '' }

/**
 * Escape a single cell value for safe CSV output.
 *
 * CSV rules:
 *   - Values containing commas → wrap in double quotes
 *   - Values containing double quotes → wrap in double quotes AND escape each " as ""
 *   - Values containing newlines → wrap in double quotes
 *   - null / undefined → empty string
 */
function escapeCsvCell(value) {
  if (value === null || value === undefined) return '';

  const str = String(value);

  // If the value contains any special characters, wrap in quotes
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    // Escape any existing double-quote characters by doubling them
    return '"' + str.replace(/"/g, '""') + '"';
  }

  return str;
}


/**
 * Build a CSV string from data + column definitions.
 *
 * @param {Array<Object>} data - Array of plain objects (your records)
 * @param {Array<{key: string, label: string, format?: Function}>} columns - Column definitions
 * @returns {string} - Complete CSV string with header row
 */
function buildCsvString(data, columns) {
  // Header row — column labels
  const headerRow = columns.map(col => escapeCsvCell(col.label)).join(',');

  // Data rows
  const dataRows = data.map(row => {
    return columns.map(col => {
      const rawValue = row[col.key];
      // If a format function is provided, run the raw value through it first
      const formattedValue = col.format ? col.format(rawValue, row) : rawValue;
      return escapeCsvCell(formattedValue);
    }).join(',');
  });

  // Combine header + data rows with Windows-compatible line endings (\r\n)
  // Some versions of Excel on Windows require \r\n to display correctly
  return [headerRow, ...dataRows].join('\r\n');
}


/**
 * Trigger a browser file download with the given CSV content.
 *
 * @param {string} csvString - The complete CSV string to download
 * @param {string} filename - Filename (without .csv extension — it's added automatically)
 */
function downloadCsv(csvString, filename) {
  // Add UTF-8 BOM so Excel opens the file with correct encoding
  // (prevents garbled text for non-ASCII characters like ₹, Tamil names, etc.)
  const BOM = '\uFEFF';
  const blob = new Blob([BOM + csvString], { type: 'text/csv;charset=utf-8;' });

  // Create a temporary hidden link and click it
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename}_${getTodayDateString()}.csv`;
  link.style.display = 'none';

  document.body.appendChild(link);
  link.click();

  // Clean up
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}


/**
 * Returns today's date as YYYY-MM-DD for use in filenames.
 * Example: "2025-08-15"
 */
function getTodayDateString() {
  const d = new Date();
  const year  = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day   = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}


/**
 * Main export function — call this from any page.
 *
 * @param {Array<Object>} data - The records to export
 * @param {string} filename - Base filename (date is appended automatically)
 * @param {Array<Object>} columns - Column definitions with key, label, optional format
 *
 * @example
 * exportToCSV(products, 'products', [
 *   { key: 'prod_name',       label: 'Product Name' },
 *   { key: 'prod_sell_price', label: 'Sell Price', format: v => v ? `${v}` : '0' },
 *   { key: 'prod_cost_price', label: 'Cost Price', format: v => v ? `${v}` : '0' },
 *   { key: 'prod_stock_qty',  label: 'Stock Qty' },
 *   { key: 'tax_rate',        label: 'Tax Rate %', format: v => v ? `${v}%` : '0%' },
 *   { key: 'unit',            label: 'Unit' },
 *   { key: 'is_deleted',      label: 'Active', format: v => v ? 'No' : 'Yes' },
 * ])
 */
export function exportToCSV(data, filename, columns) {
  if (!data || data.length === 0) {
    // Nothing to export — caller should show a toast before calling
    console.warn('[exportToCSV] No data to export');
    return;
  }

  const csvString = buildCsvString(data, columns);
  downloadCsv(csvString, filename);
}


// ─── PRE-BUILT COLUMN CONFIGS FOR EACH MODULE ─────────────────────────────
// Import these directly in each feature to avoid redefining columns every time.
// You can override or extend these in each page if needed.

/** Column config for Customers export */
export const CUSTOMER_CSV_COLUMNS = [
  { key: 'cust_name',         label: 'Customer Name' },
  { key: 'cust_phone',        label: 'Phone' },
  { key: 'cust_email',        label: 'Email' },
  { key: 'cust_address',      label: 'Address' },
  { key: 'cust_state',        label: 'State' },
  { key: 'cust_country_code', label: 'Country Code' },
  { key: 'cust_tax_number',   label: 'Tax / GST Number' },
  { key: 'updated_at',        label: 'Last Updated',
    format: (val) => val ? new Date(val).toLocaleDateString('en-IN') : '' },
  { key: 'last_updated_by',   label: 'Last Updated By',
    format: (val) => val || '' },
];

/** Column config for Suppliers export */
export const SUPPLIER_CSV_COLUMNS = [
  { key: 'supp_name',         label: 'Supplier Name' },
  { key: 'supp_phone',        label: 'Phone' },
  { key: 'supp_email',        label: 'Email' },
  { key: 'supp_address',      label: 'Address' },
  { key: 'supp_state',        label: 'State' },
  { key: 'supp_country_code', label: 'Country' },
  { key: 'supp_tax_number',   label: 'Tax Number' },
  {
    key: 'updated_at',
    label: 'Last Updated',
    format: (val) => (val ? new Date(val).toLocaleDateString('en-IN') : ''),
  },
  // FIX: last_updated_by removed — suppliers table has NO updated_by column in DB.
  // The DB trigger (trg_suppliers_updated_at) auto-sets updated_at but there is no
  // updated_by FK on the suppliers table, so last_updated_by cannot be populated.
];

/** Column config for Products export */
export const PRODUCT_CSV_COLUMNS = [
  { key: 'prod_name',           label: 'Product Name' },
  { key: 'prod_sell_price',     label: 'Sell Price' },
  { key: 'prod_cost_price',     label: 'Cost Price' },
  { key: 'prod_profit',         label: 'Profit' },
  { key: 'prod_stock_qty',      label: 'Stock Qty' },
  { key: 'prod_low_stock_alert',label: 'Low Stock Alert' },
  { key: 'tax_rate',            label: 'Tax Rate %',
    format: (val) => val ? `${val}%` : '0%' },
  { key: 'tax_code',            label: 'Tax Code' },
  { key: 'unit',                label: 'Unit' },
  { key: 'barcode',         label: 'Barcode' },
  // FIX: DB has updated_at + updated_by on products table.
  // prod_created_at replaced with updated_at to match "Last Updated" column shown in UI.
  // last_updated_by added — products router returns it via LEFT JOIN on profiles.
  { key: 'updated_at',      label: 'Last Updated',
    format: (val) => val ? new Date(val).toLocaleDateString('en-IN') : '' },
  { key: 'last_updated_by', label: 'Last Updated By' },
];

/** Column config for Categories export */
export const CATEGORY_CSV_COLUMNS = [
  { key: 'category_name', label: 'Category Name' },
  // FIX: DB has updated_at + updated_by on categories table.
  // created_at replaced with updated_at to match "Last Updated" column shown in UI.
  // last_updated_by added — categories router returns it via LEFT JOIN on profiles.
  { key: 'updated_at',      label: 'Last Updated',
    format: (val) => val ? new Date(val).toLocaleDateString('en-IN') : '' },
  { key: 'last_updated_by', label: 'Last Updated By' },
];

/** Column config for Expenses export */
export const EXPENSE_CSV_COLUMNS = [
  { key: 'expense_category', label: 'Category' },
  { key: 'expense_amount',   label: 'Amount' },
  { key: 'expense_date',     label: 'Date',
    format: (val) => val ? new Date(val).toLocaleDateString('en-IN') : '' },
  { key: 'expense_notes',    label: 'Notes' },
];

/** Column config for Sales export */
export const SALES_CSV_COLUMNS = [
  { key: 'invoice_no',         label: 'Invoice No' },
  { key: 'customer_name',      label: 'Customer' },
  { key: 'subtotal',           label: 'Subtotal',
    format: (val) => (val != null ? Number(val).toFixed(2) : '0.00') },
  { key: 'tax_total',          label: 'Tax Total',
    format: (val) => (val != null ? Number(val).toFixed(2) : '0.00') },
  { key: 'cgst_total',         label: 'CGST',
    format: (val) => (val != null ? Number(val).toFixed(2) : '0.00') },
  { key: 'sgst_total',         label: 'SGST',
    format: (val) => (val != null ? Number(val).toFixed(2) : '0.00') },
  { key: 'igst_total',         label: 'IGST',
    format: (val) => (val != null ? Number(val).toFixed(2) : '0.00') },
  { key: 'sales_final_amount', label: 'Total Amount',
    format: (val) => (val != null ? Number(val).toFixed(2) : '0.00') },
  { key: 'payment_status',     label: 'Payment Status' },
  { key: 'payment_method',     label: 'Payment Method' },
  { key: 'sales_created_at',   label: 'Invoice Date',
    format: (val) => val ? new Date(val).toLocaleDateString('en-IN') : '' },
];