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

// ─── CATEGORIES ──────────────────────────────────────────────────────────────
// Source: categorySchema.js (Zod) + routers/category.py (Pydantic + router)

export const CATEGORY_GUIDELINES = {
  title: 'How to Import Categories',
  description: 'Each row creates one category. Categories must have a unique name — duplicate names are skipped.',
  fields: [
    { name: 'Category Name', required: true, note: 'Max 50 characters. Case-insensitive duplicates are rejected.' },
  ],
  rules: [
    'Category Name is required and cannot be empty.',
    'Duplicate category names (case-insensitive) are skipped — they will not create duplicates or overwrite existing categories.',
    'Max 50 characters.',
  ],
  tips: [
    'Create Categories before importing Products — each Product row references a Category by name.',
    'Example values: Grocery, Electronics, Beverages, Stationery.',
  ],
}

// ─── CUSTOMERS ───────────────────────────────────────────────────────────────
// Source: customerSchema.js (Zod) + routers/customer.py (Pydantic + router)

export const CUSTOMER_GUIDELINES = {
  title: 'How to Import Customers',
  description: 'Only Customer Name is required. Rows with a matching Phone number update existing customers (upsert).',
  fields: [
    { name: 'Customer Name', required: true, note: 'Max 100 characters.' },
    { name: 'Phone',          required: false, note: 'Used for upsert — matching phone updates the existing record.' },
    { name: 'Email',          required: false, note: 'Must be a valid email format if provided.' },
    { name: 'Address',        required: false, note: 'Max 300 characters.' },
    { name: 'State',          required: false, note: 'Must be a valid state/province for the selected country.' },
    { name: 'Country Code',   required: false, note: '2-letter ISO code (e.g. IN, US, GB). Defaults to your business country.' },
    { name: 'Tax / GST Number', required: false, note: 'Max 50 characters.' },
  ],
  rules: [
    'Customer Name is required and cannot be empty.',
    'If a Phone number matches an existing customer, the record is updated (not duplicated).',
    'Email must contain "@" if provided.',
    'If the same Phone number appears more than once in your file, only the first row is imported — later duplicates are reported as errors and skipped.',
  ],
  tips: [
    'Leave optional fields empty — they will not overwrite existing values on upsert.',
    'Example Country Codes: IN (India), US (United States), GB (United Kingdom).',
  ],
}

// ─── SUPPLIERS ───────────────────────────────────────────────────────────────
// Source: supplierSchema.js (Zod) + routers/supplier.py (Pydantic + router)

export const SUPPLIER_GUIDELINES = {
  title: 'How to Import Suppliers',
  description: 'Only Supplier Name is required. Rows with a matching Phone number update existing suppliers (upsert).',
  fields: [
    { name: 'Supplier Name', required: true, note: 'Max 100 characters.' },
    { name: 'Phone',         required: false, note: 'Used for upsert — matching phone updates the existing record. Must not contain "@".' },
    { name: 'Email',         required: false, note: 'Must be a valid email format if provided.' },
    { name: 'Address',       required: false },
    { name: 'State',         required: false, note: 'Must be a valid state/province for the selected country.' },
    { name: 'Country',       required: false, note: '2-letter ISO code (e.g. IN, US, GB).' },
    { name: 'Tax Number',    required: false, note: 'Max 50 characters.' },
  ],
  rules: [
    'Supplier Name is required and cannot be empty.',
    'If a Phone number matches an existing supplier, the record is updated (not duplicated).',
    'Phone field must not contain "@" — use the Email column for email addresses.',
    'Email must contain "@" if provided.',
    'If the same Phone number appears more than once in your file, only the first row is imported — later duplicates are reported as errors and skipped.',
  ],
  tips: [
    'Create Suppliers before importing Purchases — each Purchase row references a Supplier by phone or name.',
    'Example Country Codes: IN (India), US (United States), GB (United Kingdom).',
  ],
}

// ─── PRODUCTS ────────────────────────────────────────────────────────────────
// Source: productSchemas.js (Zod) + productFormShared.js (units) + routers/product.py

export const PRODUCT_GUIDELINES = {
  title: 'How to Import Products',
  description: 'Product Name, Category, Sell Price, and Cost Price are required. Rows with a matching Product Name update existing products (upsert).',
  fields: [
    { name: 'Product Name',    required: true,  note: 'Max 100 characters. Used for upsert — case-insensitive match.' },
    { name: 'Category',        required: true,  note: 'Must exactly match an existing category name in your system.' },
    { name: 'Sell Price',      required: true,  note: 'Must be 0 or greater.' },
    { name: 'Cost Price',      required: true,  note: 'Must be 0 or greater.' },
    { name: 'MRP',             required: false, note: 'Must be >= Sell Price if provided. Leave empty or 0 if not applicable.' },
    { name: 'Stock Qty',       required: false, note: 'Whole number, 0 or greater. Defaults to 0.' },
    { name: 'Low Stock Alert', required: false, note: 'Whole number, 0 or greater. Defaults to 10.' },
    { name: 'Tax Rate %',      required: false, note: 'Number between 0 and 100. Defaults to 0.' },
    { name: 'Tax Code',        required: false, note: 'Max 50 characters (e.g. GST, VAT).' },
    { name: 'Barcode',         required: false, note: 'Max 100 characters. Must be unique if provided.' },
    { name: 'Unit',            required: false, note: 'One of: pcs, kg, g, litre, ml, box, pack, pair, set, dozen. Defaults to pcs.' },
  ],
  rules: [
    'Product Name is required and must be unique within your business.',
    'Category must already exist — create categories first before importing products.',
    'Sell Price and Cost Price must be 0 or greater.',
    'MRP must be >= Sell Price if provided (otherwise the row will be rejected).',
    'Tax Rate must be between 0 and 100.',
    'Stock Qty and Low Stock Alert must be whole numbers (integers).',
    'Barcode must be unique if provided.',
    'Unit must be one of the supported units listed above.',
    'Duplicate product names (case-insensitive) update the existing product.',
    'If the same Product Name appears more than once in your file, only the first row is imported — later duplicates are reported as errors and skipped.',
    'If the same Barcode appears more than once in your file, only the first row is imported — later duplicates are reported as errors and skipped.',
  ],
  tips: [
    'Create Categories before importing Products — each row references a category by its exact name.',
    'If selling below cost price, the system will flag it (you cannot prevent it via import).',
    'Example Units: pcs (pieces), kg (kilograms), litre, ml (millilitres), box, pack, pair, set, dozen.',
    'Example Tax Codes: GST, VAT, Sales Tax, Exempt.',
  ],
}

// ─── STOCK ───────────────────────────────────────────────────────────────────
// Source: adjustSchema.js (Zod) + routers/stock.py (Pydantic + router)

export const STOCK_GUIDELINES = {
  title: 'How to Import Stock Adjustments',
  description: 'Adjust stock levels by adding, removing, or setting quantities. Each row targets one product.',
  fields: [
    { name: 'Product ID',  required: false, note: 'UUID of the product. Optional if Barcode or Product Name is provided.' },
    { name: 'Barcode',     required: false, note: 'Optional if Product ID or Product Name is provided.' },
    { name: 'Product Name', required: false, note: 'Exact match. Optional if Product ID or Barcode is provided.' },
    { name: 'Type',        required: true,  note: 'Must be one of: add, remove, set.' },
    { name: 'Quantity',    required: true,  note: 'Positive whole number (1 or greater).' },
    { name: 'Notes',       required: false, note: 'Max 500 characters. Describes the reason for adjustment.' },
  ],
  rules: [
    'At least one product identifier is required: Product ID, Barcode, or Product Name.',
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
