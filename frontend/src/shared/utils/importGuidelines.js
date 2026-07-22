// shared/utils/importGuidelines.js
//
// Import guidelines configuration for all Bulk Import modules.
// Each entry defines the user-facing guidance displayed alongside
// the import buttons, derived directly from existing manual-form
// validation rules (Zod schemas + Pydantic schemas + router logic).
//
// RULE: Do NOT invent new validation rules here.
//       Every rule listed below must already exist in the codebase.
//       If you add a new validation rule to a Create/Edit form,
//       add the corresponding guidance here to keep them in sync.

/**
 * @typedef {Object} GuidelineField
 * @property {string} name     - Display name (column header text)
 * @property {boolean} required - Whether the field is mandatory
 * @property {string} [note]   - Optional tooltip / hint text
 */

/**
 * @typedef {Object} ModuleGuidelines
 * @property {string} title       - Page section title
 * @property {string} description - Brief intro text
 * @property {GuidelineField[]} fields - Field definitions
 * @property {string[]} rules     - Business rules / validation constraints
 * @property {string[]} tips      - Common mistakes and helpful notes
 */

// ─── CATEGORIES (CREATE MODE) ────────────────────────────────────────────────
// Source: categorySchema.js (Zod) + routers/category.py (Pydantic + router)
// Behavior: Name exists → ERROR (row skipped). Name doesn't exist → create.

export const CATEGORY_GUIDELINES = {
  title: 'How to Create Categories',
  description: 'Each row creates a new category. Rows with a category name that already exists are reported as errors and skipped.',
  fields: [
    { name: 'Category Name', required: true, note: 'Max 50 characters. Case-insensitive duplicates are rejected.' },
  ],
  rules: [
    'Category Name is required and cannot be empty.',
    'Category names are unique within your business — if the name already exists (case-insensitive), the row is skipped with an error.',
    'Max 50 characters.',
  ],
  tips: [
    'Create Categories before importing Products — each Product row references a Category by name.',
    'Example values: Grocery, Electronics, Beverages, Stationery.',
  ],
}

// ─── CATEGORIES (UPDATE MODE) ────────────────────────────────────────────────
// Source: categorySchema.js (Zod) + routers/category.py (Pydantic + router)
// Behavior: Name exists → UPDATE. Name doesn't exist → ERROR (row skipped).

export const CATEGORY_UPDATE_GUIDELINES = {
  title: 'How to Update Categories',
  description: 'Only Category Name is required. Existing categories are looked up by name — rows with no match are reported as errors and skipped.',
  fields: [
    { name: 'Category Name', required: true, note: 'Required — matches existing categories (case-insensitive).' },
  ],
  rules: [
    'Category Name is required and must match an existing category in your business.',
    'Categories that don\'t exist are reported as errors and skipped — they will not be created.',
    'Duplicate names (case-insensitive) within the file are reported as errors.',
  ],
  tips: [
    'Export your categories first to see current names, then modify the names you want to update.',
    'Example values: Grocery, Electronics, Beverages, Stationery.',
  ],
}

// ─── CUSTOMERS (CREATE MODE) ─────────────────────────────────────────────────
// Source: customerSchema.js (Zod) + routers/customer.py (Pydantic + router)
// Behavior: Phone exists → ERROR (row skipped). No phone match → create.

export const CUSTOMER_GUIDELINES = {
  title: 'How to Create Customers',
  description: 'Each row creates a new customer. Rows with a phone number matching an existing customer are reported as errors and skipped.',
  fields: [
    { name: 'Customer Name', required: true, note: 'Max 100 characters.' },
    { name: 'Phone',          required: false, note: 'Must be unique. If it matches an existing customer, the row is rejected.' },
    { name: 'Email',          required: false, note: 'Must be a valid email format if provided.' },
    { name: 'Address',        required: false, note: 'Max 300 characters.' },
    { name: 'State',          required: false, note: 'Must be a valid state/province for the selected country.' },
    { name: 'Country Code',   required: false, note: '2-letter ISO code (e.g. IN, US, GB). Defaults to your business country.' },
    { name: 'Tax / GST Number', required: false, note: 'Max 50 characters.' },
  ],
  rules: [
    'Customer Name is required and cannot be empty.',
    'If a Phone number matches an existing customer, the row is skipped with an error — use Bulk Update to modify existing customers.',
    'If no Phone is provided, a new customer is always created.',
    'Email must contain "@" if provided.',
    'If the same Phone number appears more than once in your file, only the first row is imported — later duplicates are reported as errors and skipped.',
  ],
  tips: [
    'Leave optional fields empty — they will not overwrite existing values when updating an existing customer.',
    'Example Country Codes: IN (India), US (United States), GB (United Kingdom).',
  ],
}

// ─── CUSTOMERS (UPDATE MODE) ─────────────────────────────────────────────────
// Source: customerSchema.js (Zod) + routers/customer.py (Pydantic + router)
// Behavior: Phone match → UPDATE. Name match → UPDATE. No match → ERROR.

export const CUSTOMER_UPDATE_GUIDELINES = {
  title: 'How to Update Customers',
  description: 'Only Customer Name is required. Existing customers are looked up by Phone first, then by Name — rows with no match are reported as errors and skipped.',
  fields: [
    { name: 'Customer Name', required: true, note: 'Required — matches existing customers (case-insensitive).' },
    { name: 'Phone',          required: false, note: 'Leave blank to keep the current phone.' },
    { name: 'Email',          required: false, note: 'Leave blank to keep the current email.' },
    { name: 'Address',        required: false, note: 'Leave blank to keep the current address.' },
    { name: 'State',          required: false, note: 'Leave blank to keep the current state.' },
    { name: 'Country Code',   required: false, note: 'Leave blank to keep the current country.' },
    { name: 'Tax / GST Number', required: false, note: 'Leave blank to keep the current tax number.' },
  ],
  rules: [
    'Customer Name is required and must match an existing customer in your business.',
    'Existing customers are looked up by Phone first, then by Name if no Phone is provided.',
    'Customers that don\'t exist are reported as errors and skipped — they will not be created.',
    'Only include the fields you want to change — all other values stay the same.',
    'Email must contain "@" if provided.',
  ],
  tips: [
    'Export your customers first to see current values, then modify the columns you want to update.',
    'To update only Tax Number for specific customers, include only Customer Name and Tax Number columns.',
  ],
}

// ─── SUPPLIERS (CREATE MODE) ─────────────────────────────────────────────────
// Source: supplierSchema.js (Zod) + routers/supplier.py (Pydantic + router)
// Behavior: Phone exists → ERROR (row skipped). No phone match → create.

export const SUPPLIER_GUIDELINES = {
  title: 'How to Create Suppliers',
  description: 'Each row creates a new supplier. Rows with a phone number matching an existing supplier are reported as errors and skipped.',
  fields: [
    { name: 'Supplier Name', required: true, note: 'Max 100 characters.' },
    { name: 'Phone',         required: false, note: 'Must be unique. If it matches an existing supplier, the row is rejected. Must not contain "@".' },
    { name: 'Email',         required: false, note: 'Must be a valid email format if provided.' },
    { name: 'Address',       required: false },
    { name: 'State',         required: false, note: 'Must be a valid state/province for the selected country.' },
    { name: 'Country',       required: false, note: '2-letter ISO code (e.g. IN, US, GB).' },
    { name: 'Tax Number',    required: false, note: 'Max 50 characters.' },
  ],
  rules: [
    'Supplier Name is required and cannot be empty.',
    'If a Phone number matches an existing supplier, the row is skipped with an error — use Bulk Update to modify existing suppliers.',
    'If no Phone is provided, a new supplier is always created.',
    'Phone field must not contain "@" — use the Email column for email addresses.',
    'Email must contain "@" if provided.',
    'If the same Phone number appears more than once in your file, only the first row is imported — later duplicates are reported as errors and skipped.',
  ],
  tips: [
    'Create Suppliers before importing Purchases — each Purchase row references a Supplier by phone or name.',
    'Example Country Codes: IN (India), US (United States), GB (United Kingdom).',
  ],
}

// ─── SUPPLIERS (UPDATE MODE) ─────────────────────────────────────────────────
// Source: supplierSchema.js (Zod) + routers/supplier.py (Pydantic + router)
// Behavior: Phone match → UPDATE. Name match → UPDATE. No match → ERROR.

export const SUPPLIER_UPDATE_GUIDELINES = {
  title: 'How to Update Suppliers',
  description: 'Only Supplier Name is required. Existing suppliers are looked up by Phone first, then by Name — rows with no match are reported as errors and skipped.',
  fields: [
    { name: 'Supplier Name', required: true, note: 'Required — matches existing suppliers (case-insensitive).' },
    { name: 'Phone',         required: false, note: 'Leave blank to keep the current phone.' },
    { name: 'Email',         required: false, note: 'Leave blank to keep the current email.' },
    { name: 'Address',       required: false, note: 'Leave blank to keep the current address.' },
    { name: 'State',         required: false, note: 'Leave blank to keep the current state.' },
    { name: 'Country',       required: false, note: 'Leave blank to keep the current country.' },
    { name: 'Tax Number',    required: false, note: 'Leave blank to keep the current tax number.' },
  ],
  rules: [
    'Supplier Name is required and must match an existing supplier in your business.',
    'Existing suppliers are looked up by Phone first, then by Name if no Phone is provided.',
    'Suppliers that don\'t exist are reported as errors and skipped — they will not be created.',
    'Only include the fields you want to change — all other values stay the same.',
    'Email must contain "@" if provided.',
  ],
  tips: [
    'Export your suppliers first to see current values, then modify the columns you want to update.',
    'To update only Phone for specific suppliers, include only Supplier Name and Phone columns.',
  ],
}

// ─── PRODUCTS (CREATE MODE) ──────────────────────────────────────────────────
// Source: productSchemas.js (Zod) + productFormShared.js (units) + routers/product.py
// Behavior: Name exists → ERROR (row skipped). Name doesn't exist → create.

export const PRODUCT_GUIDELINES = {
  title: 'How to Create Products',
  description: 'Each row creates a new product. Rows with a product name that already exists are reported as errors and skipped.',
  warning: [
    'Stock Quantity cannot be updated via Product Bulk Import. The Stock Qty column is used as opening stock when creating new products only.',
    'To update stock for existing products, use the Stock page — Stock Adjustment or Bulk Stock Update.',
  ],
  fields: [
    { name: 'Product Name',    required: true,  note: 'Max 100 characters. Case-insensitive duplicates are rejected.' },
    { name: 'Category',        required: true,  note: 'Must match an existing category name.' },
    { name: 'Sell Price',      required: true,  note: 'Must be 0 or greater.' },
    { name: 'Cost Price',      required: true,  note: 'Must be 0 or greater.' },
    { name: 'MRP',             required: false, note: 'Must be >= Sell Price if provided. Leave empty or 0 if not applicable.' },
    { name: 'Stock Qty',       required: false, note: 'Opening stock for new products only. Ignored for existing products.' },
    { name: 'Low Stock Alert', required: false, note: 'Whole number, 0 or greater. Defaults to 10.' },
    { name: 'Tax Rate %',      required: false, note: 'Number between 0 and 100. Defaults to 0.' },
    { name: 'Tax Code',        required: false, note: 'Max 50 characters (e.g. GST, VAT).' },
    { name: 'Barcode',         required: false, note: 'Max 100 characters. Must be unique if provided.' },
    { name: 'Unit',            required: false, note: 'One of: pcs, kg, g, litre, ml, box, pack, pair, set, dozen. Defaults to pcs.' },
  ],
  rules: [
    'Product Name is required and cannot be empty.',
    'Product names are unique within your business — if the name already exists (case-insensitive), the row is skipped with an error.',
    'Category, Sell Price, and Cost Price are required for new products.',
    'For updates, only include the fields you want to change — fields left blank or missing from the CSV keep their existing values.',
    'Category must already exist — create categories first before importing products.',
    'Sell Price and Cost Price must be 0 or greater.',
    'MRP must be >= Sell Price if provided (otherwise the row will be rejected).',
    'Tax Rate must be between 0 and 100.',
    'Stock Qty and Low Stock Alert must be whole numbers (integers).',
    'Barcode must be unique if provided.',
    'Unit must be one of the supported units listed above.',
    'If the same Product Name appears more than once in your file, only the first row is imported — later duplicates are reported as errors and skipped.',
    'If the same Barcode appears more than once in your file, only the first row is imported — later duplicates are reported as errors and skipped.',
  ],
  tips: [
    'Create Categories before importing Products — each row references a category by its exact name.',
    'To update only Tax Rate for existing products, include only Product Name and Tax Rate columns.',
    'If selling below cost price, the system will flag it (you cannot prevent it via import).',
    'Example Units: pcs (pieces), kg (kilograms), litre, ml (millilitres), box, pack, pair, set, dozen.',
    'Example Tax Codes: GST, VAT, Sales Tax, Exempt.',
  ],
}

// ─── PRODUCTS (UPDATE MODE) ─────────────────────────────────────────────────
// Source: productSchemas.js (Zod) + routers/product.py
// Behavior: Name match → UPDATE. Name doesn't exist → ERROR.

export const PRODUCT_UPDATE_GUIDELINES = {
  title: 'How to Update Products',
  description: 'Only Product Name is required. Existing products are looked up by name (case-insensitive) — rows with no match are reported as errors and skipped.',
  warning: [
    'Stock Quantity cannot be updated via Product Bulk Import. Use the Stock page for stock adjustments.',
  ],
  fields: [
    { name: 'Product Name',    required: true,  note: 'Required — matches existing products (case-insensitive).' },
    { name: 'Category',        required: false, note: 'Leave blank to keep the current category.' },
    { name: 'Sell Price',      required: false, note: 'Leave blank to keep the current price.' },
    { name: 'Cost Price',      required: false, note: 'Leave blank to keep the current price.' },
    { name: 'MRP',             required: false, note: 'Leave blank to keep the current MRP.' },
    { name: 'Stock Qty',       required: false, note: 'Ignored for existing products.' },
    { name: 'Low Stock Alert', required: false, note: 'Leave blank to keep the current value.' },
    { name: 'Tax Rate %',      required: false, note: 'Leave blank to keep the current rate.' },
    { name: 'Tax Code',        required: false, note: 'Leave blank to keep the current code.' },
    { name: 'Barcode',         required: false, note: 'Must be unique. Leave blank to keep the current barcode.' },
    { name: 'Unit',            required: false, note: 'Leave blank to keep the current unit.' },
  ],
  rules: [
    'Product Name is required and must match an existing product in your business.',
    'Only include the fields you want to change — all other values stay the same.',
    'Products that don\'t exist are reported as errors and skipped — they will not be created.',
    'To update Tax Rate for specific products, include only Product Name and Tax Rate columns.',
    'To change category for specific products, include Product Name and Category columns.',
    'Barcode must be unique — you cannot assign a barcode that belongs to another product.',
  ],
  tips: [
    'Export your products first to see current values, then modify the columns you want to update.',
    'If selling below cost price, the system will flag it.',
    'Example Tax Codes: GST, VAT, Sales Tax, Exempt.',
  ],
}

// ─── STOCK ───────────────────────────────────────────────────────────────────
// Source: adjustSchema.js (Zod) + routers/stock.py (Pydantic + router)
// Behavior: No create/update modes. Adjusts stock on existing products.

export const STOCK_GUIDELINES = {
  title: 'How to Create Stock Adjustments',
  description: 'Adjust stock levels by adding, removing, or setting quantities. Each row targets one existing product.',
  fields: [
    { name: 'Product ID',  required: false, note: 'UUID of the product. Optional if Barcode or Product Name is provided.' },
    { name: 'Barcode',     required: false, note: 'Optional if Product ID or Product Name is provided.' },
    { name: 'Product Name', required: false, note: 'Exact match (case-sensitive). Optional if Product ID or Barcode is provided.' },
    { name: 'Type',        required: true,  note: 'Must be one of: add, remove, set.' },
    { name: 'Quantity',    required: true,  note: 'Positive whole number (1 or greater).' },
    { name: 'Notes',       required: false, note: 'Max 500 characters. Describes the reason for adjustment.' },
  ],
  rules: [
    'At least one product identifier is required: Product ID, Barcode, or Product Name.',
    'The product must already exist — products are not created via stock import.',
    'Quantity must be a positive integer (1 or greater).',
    'Type must be exactly "add", "remove", or "set".',
    '"add" increases stock by the specified quantity.',
    '"remove" decreases stock — cannot remove more than available stock.',
    '"set" overwrites the current stock to the specified quantity.',
    'Each adjustment is logged in the stock movements history.',
    'Low stock alerts are updated automatically after each adjustment.',
  ],
  tips: [
    'Use Product Name or Barcode if you don\'t have the Product ID.',
    'Example Types: add (received goods), remove (damaged/expired), set (physical count).',
    'If multiple rows target the same product, each adjustment is applied sequentially.',
  ],
}

// ─── PURCHASES ───────────────────────────────────────────────────────────────
// Source: CreatePurchasePage.jsx (imperative validation) + routers/purchase.py

export const PURCHASE_GUIDELINES = {
  title: 'How to Import Purchases',
  description: 'Each row creates a single-item purchase. Provide the product and supplier details, and the system calculates tax automatically.',
  fields: [
    { name: 'Supplier Phone', required: false, note: 'Preferred lookup method. If provided, Supplier Name is ignored.' },
    { name: 'Supplier Name',  required: false, note: 'Used only if Supplier Phone is empty. Must match an existing supplier.' },
    { name: 'Product Name',   required: true,  note: 'Must match an existing product name exactly.' },
    { name: 'Barcode',        required: false, note: 'Alternative to Product Name for product lookup.' },
    { name: 'Quantity',       required: true,  note: 'Must be 1 or greater (whole number).' },
    { name: 'Unit Price',     required: true,  note: 'Must be greater than 0.' },
    { name: 'Discount',       required: false, note: 'Must be 0 or greater. Defaults to 0.' },
    { name: 'Payment Status', required: false, note: 'One of: pending, paid, partial. Defaults to pending.' },
    { name: 'Notes',          required: false, note: 'Purchase notes or reference.' },
  ],
  rules: [
    'At least one of Product Name or Barcode is required.',
    'Quantity must be 1 or greater.',
    'Unit Price must be greater than 0.',
    'Discount must be 0 or greater if provided.',
    'Payment Status must be one of: pending, paid, partial.',
    'Supplier is looked up by Phone first, then by Name (if Phone is empty).',
    'Product is looked up by Name first, then by Barcode.',
    'Tax is calculated automatically based on your business and supplier locations.',
    'If Payment Status is "paid", an expense record is automatically created.',
    'Each row creates its own purchase — errors in one row do not affect other rows.',
  ],
  tips: [
    'Create Suppliers before importing Purchases.',
    'Create Products before importing Purchases.',
    'Example Payment Status: paid (fully paid), pending (unpaid), partial (partially paid).',
  ],
}

// ─── SALES ───────────────────────────────────────────────────────────────────
// Source: useCreateSale.js (validation) + CreateSalePage.jsx + routers/sale.py

export const SALES_GUIDELINES = {
  title: 'How to Import Sales',
  description: 'Each row creates a single-item sale. Invoice numbers are generated automatically.',
  fields: [
    { name: 'Customer Phone', required: false, note: 'Preferred lookup method. If provided, Customer Name is ignored.' },
    { name: 'Customer Name',  required: false, note: 'Used only if Customer Phone is empty. Must match an existing customer.' },
    { name: 'Product Name',   required: true,  note: 'Must match an existing product name exactly.' },
    { name: 'Barcode',        required: false, note: 'Alternative to Product Name for product lookup.' },
    { name: 'Quantity',       required: true,  note: 'Must be 1 or greater (whole number).' },
    { name: 'Unit Price',     required: true,  note: 'Must be greater than 0.' },
    { name: 'Discount',       required: false, note: 'Must be 0 or greater. Defaults to 0.' },
    { name: 'Payment Method', required: false, note: 'One of: cash, upi, card, bank, split. Defaults to cash.' },
    { name: 'Payment Status', required: false, note: 'One of: pending, paid, partial. Defaults to pending.' },
    { name: 'Paid Amount',    required: false, note: 'Required when status is partial. Must be > 0 and < total.' },
    { name: 'Allow Stock Override', required: false, note: 'true/false or yes/no. Defaults to false. If false, rows with insufficient stock are rejected.' },
  ],
  rules: [
    'At least one of Product Name or Barcode is required.',
    'Quantity must be 1 or greater.',
    'Unit Price must be greater than 0.',
    'Discount must be 0 or greater if provided.',
    'Payment Method must be one of: cash, upi, card, bank, split.',
    'Payment Status must be one of: pending, paid, partial.',
    'If Payment Status is "partial", Paid Amount must be > 0 and less than the total.',
    'Stock is checked by default — rows exceeding available stock are rejected unless Allow Stock Override is "true".',
    'Customer is looked up by Phone first, then by Name (if Phone is empty).',
    'Product is looked up by Name first, then by Barcode.',
    'Invoice numbers are generated automatically — do not include them in the CSV.',
    'Each row creates its own sale — errors in one row do not affect other rows.',
  ],
  tips: [
    'Create Customers before importing Sales (optional — walk-in sales need no customer).',
    'Create Products before importing Sales.',
    'Example Payment Methods: cash, upi, card, bank, split.',
    'Example Payment Status: paid, pending, partial.',
    'Use "true" or "yes" in the Allow Stock Override column to skip stock checks.',
  ],
}

// ─── ALL GUIDELINES MAP ──────────────────────────────────────────────────────
// Convenience export: import this to get guidelines by module key.

export const ALL_IMPORT_GUIDELINES = {
  categories: CATEGORY_GUIDELINES,
  customers:  CUSTOMER_GUIDELINES,
  suppliers:  SUPPLIER_GUIDELINES,
  products:   PRODUCT_GUIDELINES,
  stock:      STOCK_GUIDELINES,
  purchases:  PURCHASE_GUIDELINES,
  sales:      SALES_GUIDELINES,
}
