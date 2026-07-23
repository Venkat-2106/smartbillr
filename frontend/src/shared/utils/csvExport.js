import { formatDateCSV, formatDateOnlyCSV } from './formatDate';
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
    format: (val) => formatDateCSV(val) },
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
  { key: 'updated_at',        label: 'Last Updated',
    format: (val) => formatDateCSV(val) },
  { key: 'last_updated_by',   label: 'Last Updated By',
    format: (val) => val || '' },
];

// ─── PRODUCT CSV COLUMNS — TWO VARIANTS ──────────────────────────────────────
//
// WHY TWO VARIANTS:
//   Product profit data (cost price, profit amount) is gated by the
//   'view_product_profit' permission. Staff users should not receive
//   this data even via a CSV download.
//
//   ProductsPage.jsx reads canViewProfit = can('view_product_profit')
//   and selects which column config to pass to ExportButton:
//
//     const csvColumns = canViewProfit
//       ? PRODUCT_CSV_COLUMNS          ← admin / manager
//       : PRODUCT_CSV_COLUMNS_NO_PROFIT ← staff
//
//   This ensures the exported file never contains columns the user
//   is not permitted to see — even if they inspect the download.
//
// NOTE: The backend also strips these values from the API response
// (returns null) when the user lacks the permission. So the CSV
// column being absent is a second layer of protection, not the only one.

/** Column config for Products export — WITH profit fields (admin + manager) */
export const PRODUCT_CSV_COLUMNS = [
  { key: 'prod_name',           label: 'Product Name' },
  { key: 'category_name',       label: 'Category' },
  { key: 'prod_sell_price',     label: 'Sell Price' },
  { key: 'prod_mrp',            label: 'MRP',
    format: (val) => val != null ? String(val) : '' },
  { key: 'prod_cost_price',     label: 'Cost Price' },
  { key: 'prod_profit',         label: 'Profit' },
  { key: 'prod_profit_margin',  label: 'Margin %',
    format: (val) => val != null ? `${Number(val).toFixed(1)}%` : '' },
  { key: 'prod_stock_qty',      label: 'Stock Qty' },
  { key: 'prod_low_stock_alert',label: 'Low Stock Alert' },
  { key: 'tax_rate',            label: 'Tax Rate %',
    format: (val) => val ? `${val}%` : '0%' },
  { key: 'tax_code',            label: 'Tax Code' },
  { key: 'unit',                label: 'Unit' },
  { key: 'barcode',             label: 'Barcode' },
  // Audit columns — all four fields are returned by GET /products/ list
  { key: 'prod_created_at',     label: 'Created On',
    format: (val) => formatDateCSV(val) },
  { key: 'created_by_name',     label: 'Created By',
    format: (val) => val || '' },
  { key: 'updated_at',          label: 'Last Updated',
    format: (val) => formatDateCSV(val) },
  { key: 'last_updated_by',     label: 'Last Updated By',
    format: (val) => val || '' },
];

/** Column config for Products export — WITHOUT profit fields (staff only) */
export const PRODUCT_CSV_COLUMNS_NO_PROFIT = [
  { key: 'prod_name',           label: 'Product Name' },
  { key: 'category_name',       label: 'Category' },
  { key: 'prod_sell_price',     label: 'Sell Price' },
  { key: 'prod_mrp',            label: 'MRP',
    format: (val) => val != null ? String(val) : '' },
  // prod_cost_price OMITTED — staff not permitted to see cost data
  // prod_profit     OMITTED — staff not permitted to see profit data
  { key: 'prod_stock_qty',      label: 'Stock Qty' },
  { key: 'prod_low_stock_alert',label: 'Low Stock Alert' },
  { key: 'tax_rate',            label: 'Tax Rate %',
    format: (val) => val ? `${val}%` : '0%' },
  { key: 'tax_code',            label: 'Tax Code' },
  { key: 'unit',                label: 'Unit' },
  { key: 'barcode',             label: 'Barcode' },
  { key: 'prod_created_at',     label: 'Created On',
    format: (val) => formatDateCSV(val) },
  { key: 'created_by_name',     label: 'Created By',
    format: (val) => val || '' },
  { key: 'updated_at',          label: 'Last Updated',
    format: (val) => formatDateCSV(val) },
  { key: 'last_updated_by',     label: 'Last Updated By',
    format: (val) => val || '' },
];

/** Column config for Categories export */
export const CATEGORY_CSV_COLUMNS = [
  { key: 'category_name',   label: 'Category Name' },
  { key: 'created_at',      label: 'Created On',
    format: (val) => formatDateCSV(val) },
  { key: 'created_by_name', label: 'Created By',
    format: (val) => val || '' },
  { key: 'updated_at',      label: 'Last Updated',
    format: (val) => formatDateCSV(val) },
  { key: 'last_updated_by', label: 'Last Updated By',
    format: (val) => val || '' },
];

/** Column config for Expenses export */
export const EXPENSE_CSV_COLUMNS = [
  { key: 'expense_category', label: 'Category' },
  { key: 'expense_amount',   label: 'Amount' },
  { key: 'expense_date',     label: 'Date',
    format: (val) => formatDateOnlyCSV(val) },
  { key: 'expense_notes',    label: 'Notes' },
];

/** Column config for Sales export */
//
// FIX (2026-06):
//   Three field keys were wrong — they produced empty columns in every export:
//
//   BEFORE → AFTER (field name the API list response actually uses):
//     'subtotal'        → 'sales_total_amount'   (pre-discount/tax total)
//     'payment_status'  → 'sales_payment_status'  (API snake_case prefix)
//     'payment_method'  → 'sales_payment_method'  (API snake_case prefix)
//
//   Additionally, 'cgst_total', 'sgst_total', 'igst_total' were present in
//   this column config but the GET /sales list endpoint didn't include them
//   in its SELECT. Fix 2 in sale.py adds these three columns to the list query.
//   Both fixes must be applied together for the tax breakdown to work.
export const SALES_CSV_COLUMNS = [
  { key: 'invoice_no',            label: 'Invoice No' },
  { key: 'customer_name',         label: 'Customer' },
  { key: 'sales_total_amount',    label: 'Subtotal',        // FIX: was 'subtotal'
    format: (val) => (val != null ? Number(val).toFixed(2) : '0.00') },
  { key: 'tax_total',             label: 'Tax Total',
    format: (val) => (val != null ? Number(val).toFixed(2) : '0.00') },
  { key: 'cgst_total',            label: 'CGST',
    format: (val) => (val != null ? Number(val).toFixed(2) : '0.00') },
  { key: 'sgst_total',            label: 'SGST',
    format: (val) => (val != null ? Number(val).toFixed(2) : '0.00') },
  { key: 'igst_total',            label: 'IGST',
    format: (val) => (val != null ? Number(val).toFixed(2) : '0.00') },
  { key: 'sales_final_amount',    label: 'Total Amount',
    format: (val) => (val != null ? Number(val).toFixed(2) : '0.00') },
  { key: 'sales_payment_status',  label: 'Payment Status' }, // FIX: was 'payment_status'
  { key: 'sales_payment_method',  label: 'Payment Method' }, // FIX: was 'payment_method'
  { key: 'sales_created_at',      label: 'Invoice Date',
    format: (val) => formatDateCSV(val) },
];

/**
 * Returns country-aware sales CSV columns.
 * For India: includes CGST, SGST, IGST breakdown columns.
 * For other countries: excludes GST-specific columns (uses generic Tax Total).
 */
export function getSalesCsvColumns(country = '') {
  const c = (country || '').toUpperCase();
  const taxFormatter = (val) => (val != null ? Number(val).toFixed(2) : '0.00');
  const dateFormatter = (val) => formatDateCSV(val);

  const baseColumns = [
    { key: 'invoice_no',            label: 'Invoice No' },
    { key: 'customer_name',         label: 'Customer' },
    { key: 'sales_total_amount',    label: 'Subtotal', format: taxFormatter },
    { key: 'tax_total',             label: 'Tax Total', format: taxFormatter },
  ];

  // India-specific CGST/SGST/IGST breakdown
  if (c === 'IN') {
    baseColumns.push(
      { key: 'cgst_total', label: 'CGST', format: taxFormatter },
      { key: 'sgst_total', label: 'SGST', format: taxFormatter },
      { key: 'igst_total', label: 'IGST', format: taxFormatter },
    );
  }

  baseColumns.push(
    { key: 'sales_final_amount',    label: 'Total Amount', format: taxFormatter },
    { key: 'sales_payment_status',  label: 'Payment Status' },
    { key: 'sales_payment_method',  label: 'Payment Method' },
    { key: 'sales_created_at',      label: 'Invoice Date', format: dateFormatter },
  );

  return baseColumns;
}

// ── PAYMENT CSV COLUMNS ───────────────────────────────────────────────────────
export const PAYMENT_CSV_COLUMNS = [
  { key: 'invoice_no',          label: 'Invoice No' },
  { key: 'customer_name',       label: 'Customer' },
  { key: 'sales_final_amount',  label: 'Invoice Total',
    format: (val) => (val != null ? Number(val).toFixed(2) : '0.00') },
  { key: 'cumulative_paid',     label: 'Total Paid',
    format: (val) => (val != null ? Number(val).toFixed(2) : '0.00') },
  { key: 'remaining_balance',   label: 'Remaining Balance',
    format: (val) => (val != null ? Number(val).toFixed(2) : '0.00') },
  { key: 'payment_status',      label: 'Payment Status' },
  { key: 'payment_method',      label: 'Payment Method' },
  { key: 'payment_paid_at',     label: 'Last Payment Date',
    format: (val) => formatDateCSV(val) },
];
/** Column config for Purchases export */
export const PURCHASE_CSV_COLUMNS = [
  { key: 'supp_name',          label: 'Supplier' },
  { key: 'pur_total_amount',   label: 'Subtotal',
    format: (val) => (val != null ? Number(val).toFixed(2) : '0.00') },
  { key: 'pur_discount',       label: 'Discount',
    format: (val) => (val != null ? Number(val).toFixed(2) : '0.00') },
  { key: 'pur_tax_total',      label: 'Tax Total',
    format: (val) => (val != null ? Number(val).toFixed(2) : '0.00') },
  { key: 'pur_cgst_total',     label: 'CGST',
    format: (val) => (val != null ? Number(val).toFixed(2) : '0.00') },
  { key: 'pur_sgst_total',     label: 'SGST',
    format: (val) => (val != null ? Number(val).toFixed(2) : '0.00') },
  { key: 'pur_igst_total',     label: 'IGST',
    format: (val) => (val != null ? Number(val).toFixed(2) : '0.00') },
  { key: 'pur_final_amount',   label: 'Total Amount',
    format: (val) => (val != null ? Number(val).toFixed(2) : '0.00') },
  { key: 'pur_payment_status', label: 'Payment Status' },
  { key: 'pur_created_at',     label: 'Purchase Date',
    format: (val) => formatDateCSV(val) },
  { key: 'updated_at',         label: 'Last Updated',
    format: (val) => formatDateCSV(val) },
  { key: 'last_updated_by',    label: 'Last Updated By',
    format: (val) => val || '' },
];

/**
 * Returns country-aware purchase CSV columns.
 * For India: includes CGST, SGST, IGST breakdown columns.
 * For other countries: excludes GST-specific columns (uses generic Tax Total).
 */
export function getPurchaseCsvColumns(country = '') {
  const c = (country || '').toUpperCase();
  const taxFormatter = (val) => (val != null ? Number(val).toFixed(2) : '0.00');
  const dateFormatter = (val) => formatDateCSV(val);

  const baseColumns = [
    { key: 'supp_name',          label: 'Supplier' },
    { key: 'pur_total_amount',   label: 'Subtotal', format: taxFormatter },
    { key: 'pur_discount',       label: 'Discount', format: taxFormatter },
    { key: 'pur_tax_total',      label: 'Tax Total', format: taxFormatter },
  ];

  // India-specific CGST/SGST/IGST breakdown
  if (c === 'IN') {
    baseColumns.push(
      { key: 'pur_cgst_total', label: 'CGST', format: taxFormatter },
      { key: 'pur_sgst_total', label: 'SGST', format: taxFormatter },
      { key: 'pur_igst_total', label: 'IGST', format: taxFormatter },
    );
  }

  baseColumns.push(
    { key: 'pur_final_amount',   label: 'Total Amount', format: taxFormatter },
    { key: 'pur_payment_status', label: 'Payment Status' },
    { key: 'pur_created_at',     label: 'Purchase Date', format: dateFormatter },
    { key: 'updated_at',         label: 'Last Updated', format: dateFormatter },
    { key: 'last_updated_by',    label: 'Last Updated By', format: (val) => val || '' },
  );

  return baseColumns;
}

// ── STOCK CSV COLUMNS (with cost price / stock value — view_product_profit) ───
export const STOCK_CSV_COLUMNS = [
  { key: 'prod_name',           label: 'Product Name' },
  { key: 'barcode',              label: 'Barcode',
    format: (val) => val || '' },
  { key: 'category_name',        label: 'Category',
    format: (val) => val || '' },
  { key: 'unit',                  label: 'Unit' },
  { key: 'prod_stock_qty',        label: 'Current Stock' },
  { key: 'available_stock',       label: 'Available Stock' },
  { key: 'prod_low_stock_alert',  label: 'Reorder Level' },
  { key: 'prod_sell_price',       label: 'Selling Price',
    format: (val) => (val != null ? Number(val).toFixed(2) : '0.00') },
  { key: 'prod_cost_price',       label: 'Cost Price',
    format: (val) => (val != null ? Number(val).toFixed(2) : '') },
  { key: 'stock_value',           label: 'Stock Value',
    format: (val) => (val != null ? Number(val).toFixed(2) : '') },
  { key: 'stock_status',          label: 'Stock Status' },
  { key: 'updated_at',            label: 'Last Updated',
    format: (val) => formatDateCSV(val) },
];

// ── STOCK CSV COLUMNS — no profit (cost price / stock value omitted) ──────────
export const STOCK_CSV_COLUMNS_NO_PROFIT = [
  { key: 'prod_name',           label: 'Product Name' },
  { key: 'barcode',              label: 'Barcode',
    format: (val) => val || '' },
  { key: 'category_name',        label: 'Category',
    format: (val) => val || '' },
  { key: 'unit',                  label: 'Unit' },
  { key: 'prod_stock_qty',        label: 'Current Stock' },
  { key: 'available_stock',       label: 'Available Stock' },
  { key: 'prod_low_stock_alert',  label: 'Reorder Level' },
  { key: 'prod_sell_price',       label: 'Selling Price',
    format: (val) => (val != null ? Number(val).toFixed(2) : '0.00') },
  { key: 'stock_status',          label: 'Stock Status' },
  { key: 'updated_at',            label: 'Last Updated',
    format: (val) => formatDateCSV(val) },
];

// ─── IMPORT TEMPLATE DOWNLOADER ────────────────────────────────────────────────
// Generates a header-only CSV for each module so users can fill it in
// and upload it via the Import button.

export function downloadTemplateCsv(filename, columns, sampleRows = []) {
  const headerRow = columns.map(col => escapeCsvCell(col.label)).join(',');
  const dataRows = sampleRows.map(row =>
    row.map(val => escapeCsvCell(val != null ? String(val) : '')).join(',')
  ).join('\r\n');
  const csvString = headerRow + '\r\n' + (dataRows ? dataRows + '\r\n' : '');

  const BOM = '\uFEFF';
  const blob = new Blob([BOM + csvString], { type: 'text/csv;charset=utf-8;' });

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename}_template.csv`;
  link.style.display = 'none';

  document.body.appendChild(link);
  link.click();

  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// ─── IMPORT TEMPLATE COLUMN CONFIGS ─────────────────────────────────────────────
// These match the CSV columns accepted by the backend /import endpoints.
// They use the PRIMARY KEY names (the first column name the backend reads).

/** Import template for Categories */
export const CATEGORY_IMPORT_TEMPLATE = [
  { key: 'category_name', label: 'Category Name' },
];

/** Import template for Customers */
export const CUSTOMER_IMPORT_TEMPLATE = [
  { key: 'cust_name',         label: 'Customer Name' },
  { key: 'cust_phone',        label: 'Phone' },
  { key: 'cust_email',        label: 'Email' },
  { key: 'cust_address',      label: 'Address' },
  { key: 'cust_state',        label: 'State' },
  { key: 'cust_country_code', label: 'Country Code' },
  { key: 'cust_tax_number',   label: 'Tax / GST Number' },
];

/** Import template for Suppliers */
export const SUPPLIER_IMPORT_TEMPLATE = [
  { key: 'supp_name',         label: 'Supplier Name' },
  { key: 'supp_phone',        label: 'Phone' },
  { key: 'supp_email',        label: 'Email' },
  { key: 'supp_address',      label: 'Address' },
  { key: 'supp_state',        label: 'State' },
  { key: 'supp_country_code', label: 'Country' },
  { key: 'supp_tax_number',   label: 'Tax Number' },
];

/** Import template for Products */
export const PRODUCT_IMPORT_TEMPLATE = [
  { key: 'prod_name',           label: 'Product Name' },
  { key: 'category_name',       label: 'Category' },
  { key: 'prod_sell_price',     label: 'Sell Price' },
  { key: 'prod_cost_price',     label: 'Cost Price' },
  { key: 'prod_mrp',            label: 'MRP' },
  { key: 'prod_stock_qty',      label: 'Stock Qty' },
  { key: 'prod_low_stock_alert',label: 'Low Stock Alert' },
  { key: 'tax_rate',            label: 'Tax Rate %' },
  { key: 'tax_code',            label: 'Tax Code' },
  { key: 'barcode',             label: 'Barcode' },
  { key: 'unit',                label: 'Unit' },
];

/** Update template for Products (Stock Qty excluded — use Stock page) */
export const PRODUCT_UPDATE_TEMPLATE = [
  { key: 'prod_name',           label: 'Product Name' },
  { key: 'category_name',       label: 'Category' },
  { key: 'prod_sell_price',     label: 'Sell Price' },
  { key: 'prod_cost_price',     label: 'Cost Price' },
  { key: 'prod_mrp',            label: 'MRP' },
  { key: 'prod_low_stock_alert',label: 'Low Stock Alert' },
  { key: 'tax_rate',            label: 'Tax Rate %' },
  { key: 'tax_code',            label: 'Tax Code' },
  { key: 'barcode',             label: 'Barcode' },
  { key: 'unit',                label: 'Unit' },
];

/** Import template for Stock */
export const STOCK_IMPORT_TEMPLATE = [
  { key: 'product_id',       label: 'Product ID' },
  { key: 'barcode',          label: 'Barcode' },
  { key: 'prod_name',        label: 'Product Name' },
  { key: 'adjustment_type',  label: 'Type (add/remove/set)' },
  { key: 'qty',              label: 'Quantity' },
  { key: 'move_notes',       label: 'Notes' },
];

/** Import template for Purchases */
export const PURCHASE_IMPORT_TEMPLATE = [
  { key: 'supp_phone',      label: 'Supplier Phone' },
  { key: 'supp_name',       label: 'Supplier Name' },
  { key: 'prod_name',       label: 'Product Name' },
  { key: 'barcode',         label: 'Barcode' },
  { key: 'qty',             label: 'Quantity' },
  { key: 'unit_price',      label: 'Unit Price' },
  { key: 'discount',        label: 'Discount' },
  { key: 'payment_status',  label: 'Payment Status (pending/paid/partial)' },
  { key: 'notes',           label: 'Notes' },
];

/** Import template for Sales */
export const SALES_IMPORT_TEMPLATE = [
  { key: 'cust_phone',           label: 'Customer Phone' },
  { key: 'cust_name',            label: 'Customer Name' },
  { key: 'prod_name',            label: 'Product Name' },
  { key: 'barcode',              label: 'Barcode' },
  { key: 'qty',                  label: 'Quantity' },
  { key: 'unit_price',           label: 'Unit Price' },
  { key: 'discount',             label: 'Discount' },
  { key: 'payment_method',       label: 'Payment Method (cash/upi/card/bank/split)' },
  { key: 'payment_status',       label: 'Payment Status (pending/paid/partial)' },
  { key: 'paid_amount',          label: 'Paid Amount' },
  { key: 'allow_stock_override', label: 'Allow Stock Override (true/false)' },
];

// ─── SAMPLE DATA FOR IMPORT TEMPLATES ──────────────────────────────────────────
// Example rows to help users understand the expected format.
// These are for guidance only — users should replace them with their own data.

export const CATEGORY_IMPORT_SAMPLES = [
  ['Grocery'],
  ['Electronics'],
];

export const CUSTOMER_IMPORT_SAMPLES = [
  ['Rahul Sharma', '9876543210', 'rahul@example.com', '12 MG Road, Mumbai', 'Maharashtra', 'IN', '27AABCU9603R1ZM'],
  ['Priya Patel', '9876543211', 'priya@example.com', '45 Anna Salai, Chennai', 'Tamil Nadu', 'IN', '33AABCP1234F1Z5'],
];

export const SUPPLIER_IMPORT_SAMPLES = [
  ['Fresh Foods Ltd', '9876543220', 'contact@freshfoods.com', '78 Industrial Area, Delhi', 'Delhi', 'IN', '07AABCF5678G1Z2'],
  ['Global Traders', '9876543221', 'info@globaltraders.com', '12 Market Road, Bangalore', 'Karnataka', 'IN', '29AABCG9012H1Z8'],
];

export const PRODUCT_IMPORT_SAMPLES = [
  ['Wheat Flour 5kg', 'Grocery', '245', '210', '245', '60', '15', '5', '', '2135484232', 'pcs'],
  ['Sugar 1kg', 'Grocery', '48', '42', '48', '120', '25', '5', '', '2135484233', 'pcs'],
];

/** Minimal sample rows for the Product Bulk Update template — only Product Name + the fields to update */
export const PRODUCT_UPDATE_SAMPLES = [
  ['Wheat Flour 5kg', '', '', '', '', '', '18', 'GST', '', ''],
  ['Sugar 1kg', '', '', '', '', '', '5', '', '', 'pcs'],
];

export const STOCK_IMPORT_SAMPLES = [
  ['', '2135484232', 'Wheat Flour 5kg', 'add', '20', 'Restocked from warehouse'],
  ['', '2135484233', 'Sugar 1kg', 'remove', '5', 'Damaged goods'],
];

export const PURCHASE_IMPORT_SAMPLES = [
  ['9876543220', 'Fresh Foods Ltd', 'Wheat Flour 5kg', '2135484232', '50', '210', '0', 'paid', 'Monthly restock'],
  ['9876543220', 'Fresh Foods Ltd', 'Sugar 1kg', '2135484233', '100', '42', '0', 'pending', ''],
];

export const SALES_IMPORT_SAMPLES = [
  ['9876543210', 'Rahul Sharma', 'Wheat Flour 5kg', '2135484232', '2', '245', '0', 'cash', 'paid', '490', 'false'],
  ['9876543211', 'Priya Patel', 'Sugar 1kg', '2135484233', '3', '48', '0', 'upi', 'paid', '144', 'false'],
];

// ─── UPDATE MODE IMPORT TEMPLATES ─────────────────────────────────────────────
// Minimal templates for update mode — only the lookup key + fields to update.

/** Import template for Categories (update mode) */
export const CATEGORY_UPDATE_TEMPLATE = [
  { key: 'category_name', label: 'Category Name' },
];

/** Minimal sample rows for Category Bulk Update template */
export const CATEGORY_UPDATE_SAMPLES = [
  ['Grocery'],
  ['Electronics'],
];

/** Import template for Customers (update mode) */
export const CUSTOMER_UPDATE_TEMPLATE = [
  { key: 'cust_name',         label: 'Customer Name' },
  { key: 'cust_phone',        label: 'Phone' },
  { key: 'cust_email',        label: 'Email' },
  { key: 'cust_address',      label: 'Address' },
  { key: 'cust_state',        label: 'State' },
  { key: 'cust_country_code', label: 'Country Code' },
  { key: 'cust_tax_number',   label: 'Tax / GST Number' },
];

/** Minimal sample rows for Customer Bulk Update template */
export const CUSTOMER_UPDATE_SAMPLES = [
  ['Rahul Sharma', '', '', '', '', '', '27AABCU9603R1ZM'],
  ['Priya Patel', '', 'priya.updated@example.com', '', '', '', ''],
];

/** Import template for Suppliers (update mode) */
export const SUPPLIER_UPDATE_TEMPLATE = [
  { key: 'supp_name',         label: 'Supplier Name' },
  { key: 'supp_phone',        label: 'Phone' },
  { key: 'supp_email',        label: 'Email' },
  { key: 'supp_address',      label: 'Address' },
  { key: 'supp_state',        label: 'State' },
  { key: 'supp_country_code', label: 'Country' },
  { key: 'supp_tax_number',   label: 'Tax Number' },
];

/** Minimal sample rows for Supplier Bulk Update template */
export const SUPPLIER_UPDATE_SAMPLES = [
  ['Fresh Foods Ltd', '', 'updated@freshfoods.com', '', '', '', ''],
  ['Global Traders', '', '', '', '', '', ''],
];