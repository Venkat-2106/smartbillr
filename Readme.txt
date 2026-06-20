
═══════════════════════════════════════════════
PROJECT — SmartBillr
═══════════════════════════════════════════════
Multi-tenant billing SaaS. Each tenant is isolated by business_id (never trusted from request body — always from JWT → DB lookup).
Handles: Invoicing (GST/VAT/Sales Tax), Inventory, Purchases, Customers, Suppliers, Expenses, Payments, Stock, Returns, Staff, Analytics.

TECH STACK
Frontend  → React 19, React Router v7, Vite 8, TanStack React Query v5, Zustand v5, React Hook Form v7 + Zod v4, Axios v1, react-hot-toast v2, @heroicons/react v2, Tailwind CSS v4, @supabase/supabase-js v2
Backend   → FastAPI (Python), SQLAlchemy, Pydantic v2, PostgreSQL (Supabase hosted)
Auth      → Supabase Auth JWT RS256, manually base64 decoded (no network verify), DB existence check as second layer
Infra     → Backend: Render | Frontend: Vercel | DB: Supabase
Build     → Vite manual chunks: react-vendor, query-vendor, form-vendor, ui-vendor

PATH      → C:\Project\smartbillr
BRANCH    → development
Run backend  → cd backend && venv\Scripts\activate && python -m uvicorn app.main:app --reload
Run frontend → cd frontend && npm run dev

═══════════════════════════════════════════════
BACKEND FOLDER STRUCTURE
═══════════════════════════════════════════════
backend/app/
├── main.py           ← FastAPI app, GZipMiddleware (min 1000b), CORS, all routers registered
├── database.py       ← pool_size=5, max_overflow=10, pool_pre_ping=True, pool_recycle=300
├── middleware/
│   ├── auth.py       ← verify_token(): base64 decode JWT → check exp → 1 DB query (STRING_AGG) → returns {user_id, business_id, role, permissions:set}
│   └── rbac.py       ← require_permission(code), require_any_permission(*codes), require_all_permissions(*codes), get_current_user_with_permissions
├── models/           ← 17 ORM models (incl. rbac: Role, Permission, RolePermission). updated_by has NO ForeignKey() in ORM (FK exists in DB only). PurchaseItem uses raw SQL only.
├── schemas/          ← 13 Pydantic schema files: XxxCreate, XxxUpdate, XxxOut per domain
├── routers/          ← 16 domain files: business, category, customer, supplier, product, sale, payment, purchase, stock, expense, sales_return, purchase_return, profiles, staff, dashboard, reports (+43 report sub-endpoints)
├── services/
│   └── sale_service.py       ← generate_invoice_number, validate_and_cache_products, calculate_total_amount, create_sale_header, handle_stock_overrides, insert_sale_items, update_sale_tax_totals, auto_record_payment, parse_sale_error, get_sales_list, get_sale_detail
└── utils/
    ├── response.py         ← success_response(data, status_code=200), error_response(msg, status_code=400)
    ├── pagination.py       ← paginate() dep → {page, limit, offset} | pagination_response(data, total, page, limit) → {items, pagination:{total,page,limit,total_pages,has_next,has_prev,truncated}}
    ├── timestamp.py        ← fmt_ts(dt) → ISO "2026-06-05T03:00:00Z" | fmt_date(d) → "2026-06-05". ALWAYS use these, NEVER str(datetime)
    ├── payment_helpers.py  ← record_payment_and_sync(), calculate_payment_status(). Both sale.py + payment.py import from here (no circular imports)
    ├── tax_engine.py       ← Single source of truth for Python-side GST/VAT/Sales Tax calculations (DB trigger handles Sales trigger)
    └── currency.py         ← Country→currency symbol map + formatting helpers

═══════════════════════════════════════════════
FRONTEND FOLDER STRUCTURE
═══════════════════════════════════════════════
frontend/src/
├── api/axios.js            ← Single Axios instance. Interceptor: auto-adds trailing slash + attaches JWT. NEVER add trailing slashes manually in api files.
├── app/router.jsx          ← All routes with React.lazy (code split per route) + ProtectedRoute
├── app/providers.jsx       ← QueryClient: staleTime=5min, retry=1, refetchOnWindowFocus=false
├── app/layouts/DashboardLayout.jsx  ← Sidebar (always dark #0B0F1A) + topbar + theme/accent switcher
├── features/<feature>/     ← 18 features: auth, businesses, categories, customers, dashboard, expenses, payments, products, public, purchaseReturns, purchases, reports, sales, salesReturns, settings, staff, stock, suppliers
│   ├── pages/      ← Render only. Destructures everything from hook.
│   ├── hooks/      ← useXxx.js. Owns ALL server state + filter/sort/page UI state.
│   ├── api/        ← xxxApi.js. HTTP calls only. Returns res.data. NEVER import authStore here.
│   ├── components/ ← Feature drawers, forms (all except public, reports, settings)
│   └── schemas/    ← Zod validation schemas (auth, dashboard, public, reports, settings, staff omit this dir)
├── shared/components/index.js  ← Barrel: named exports for all 25 shared components
├── shared/hooks/   ← usePermissions, useDebounce, useMediaQuery, useServerTableState, useShortcut, useTableKeyboardNav (6 hooks)
├── shared/utils/   ← formatDate, formatCurrency, formatTax, csvExport, dateUtils, printUtils, preferences, scrollLock (8 utils)
├── shared/constants/ ← paymentMethods, expenseCategories, taxFormats, styles (4 constant files)
├── shared/data/    ← countries.js, countryStates.js
└── store/authStore.js  ← Zustand persist('sb-auth'): token, user, business, profile, permissions[], hasPermission(code), hasAnyPermission(...codes), clearAuth()

═══════════════════════════════════════════════
CRITICAL RULES — NEVER BREAK THESE
═══════════════════════════════════════════════

RESPONSE UNWRAPPING
success_response() returns data DIRECTLY — no {success,data} wrapper.
→ Always use res.data, NEVER res.data.data
→ Error responses have {success:false, message:"..."} shape

IMPORT ALIAS
@/ alias is NOT configured. Always use relative imports.
→ CORRECT: import useAuthStore from '../../../store/authStore'
→ WRONG:   import useAuthStore from '@/store/authStore'

TRAILING SLASH
Axios interceptor adds trailing slash automatically.
→ CORRECT: api.get('/customers')   becomes GET /customers/
→ NEVER:   api.get('/customers/')  — don't add it manually

EXPORTS
Named exports from shared barrel: import { Button, Modal, DateRangeFilter } from '../../../shared/components'
selectStyle + textareaStyle → named exports from FormField: import FormField, { selectStyle, textareaStyle } from '../../../shared/components/FormField'
useDebounce + usePermissions → named exports from their files

STATE SEPARATION
Server data (lists, details) → React Query (useQuery / useMutation in hooks)
Auth/permissions            → Zustand authStore (persisted)
Form values                 → React Hook Form (NEVER useState for form fields)
Filter/sort/page state      → Hook-local useState, passed to queryKey
Theme/accent                → localStorage directly (sb-theme, sb-accent)

DATA FLOW
Page → destructures from Hook → Hook calls useQuery/useMutation → queryFn calls xxxApi.js → axios → FastAPI
NEVER skip a layer. NEVER fetch in a component directly.

PERMISSIONS
Always use permission CODES, never role names in JSX.
→ CORRECT: can('suppliers.manage') using usePermissions() hook
→ WRONG:   profile.role === 'admin'
Backend: always require_permission("code") dependency, never if role=="admin" inside route

BUSINESS_ID ISOLATION
Every SQL query MUST filter by business_id = CAST(:bid AS uuid).
business_id always comes from current_user["business_id"] (from JWT → DB). NEVER from request body.

GENERATED COLUMNS — NEVER INSERT
sales.sales_final_amount (DB generated, no Computed() in ORM)
sale_items.sale_item_subtotal, item_tax_total, item_total_with_tax
purchase_items.item_subtotal, item_tax_total, item_total_with_tax (raw SQL only — no ORM model)
products.prod_profit
purchases.pur_final_amount (DB generated, no Computed() in ORM)
stock_movements.move_new_stock
purchase_return_items.return_item_subtotal
Use raw SQL and omit these columns entirely on INSERT.

DB TRIGGERS — NEVER DUPLICATE IN PYTHON (7 triggers + 1 function, no .sql files — defined directly on PostgreSQL)
fn_set_updated_at → BEFORE UPDATE on all major tables (sets updated_at automatically — NEVER set updated_at in Python)
fn_sale_stock_movement → AFTER INSERT on sale_items (deducts stock, calculates CGST/SGST/IGST/tax totals)
fn_purchase_stock_movement → AFTER INSERT on purchase_items (adds stock)
fn_sales_return_stock → AFTER UPDATE on sales_returns (restocks on approval)
fn_audit_log → INSERT/UPDATE/DELETE on 6+ tables (reads app.current_user_id session var set by auth.py)
fn_validate_sales_return_items → BEFORE INSERT on sales_return_items
fn_recalculate_return_total → AFTER INSERT/UPDATE/DELETE on sales_return_items (recalculates header total)
get_next_invoice_number() → SELECT FOR UPDATE lock on business_counters (prevents duplicate invoice numbers)

UPDATED_BY PATTERN
updated_at → set by DB trigger automatically. NEVER set in Python.
updated_by → set manually in PUT route: record.updated_by = current_user["user_id"]
last_updated_by → resolved in GET list via LEFT JOIN profiles p ON p.id = x.updated_by → returns p.full_name

ORM MODEL PATTERN FOR updated_by
updated_by = Column(UUID(as_uuid=True), nullable=True)  ← NO ForeignKey() in ORM model
The FK constraint exists in DB (REFERENCES profiles(id) ON DELETE SET NULL). Resolve name via raw SQL JOIN.

SORT COLUMN WHITELIST (prevents SQL injection)
SORTABLE = {"col_name": "alias.col_name", ...}
order_col = SORTABLE.get(sort_by, "default_col")
order_dir = "DESC" if str(sort_dir).lower() == "desc" else "ASC"

DATE FILTER PATTERN
Frontend: use localDayStartUTC(dateFrom) / localDayEndUTC(dateTo) from shared/utils/dateUtils.js
Backend: compare directly against timestamptz columns (no casting to date)
updated_from → s.updated_at >= :updated_from | updated_to → s.updated_at <= :updated_to

DATE DISPLAY
ALWAYS use formatDate() from shared/utils/formatDate.js
NEVER call .toLocaleDateString() directly in components

PAGINATION
Pagination component returns null when total_pages <= 1. Do NOT add totalPages > 1 guard around it.
Server-paginated pages (customers, suppliers, categories, products, sales): show Pagination ALWAYS — filters do not hide it. Filters narrow server results but do not eliminate the need for pagination.
Pagination component expects: pagination={paginationObject} onPageChange={setPage}

PAGINATION LIMITS
Normal UI: page=N, limit=20 (default) — server returns one page
Export: page=1, limit=10000 — server returns all matching rows (hard cap, truncated flag set if exceeded)

DEBOUNCE
All search inputs: useDebounce(search, 350). Include debouncedSearch in queryKey.
On search change: always setPage(1)

MODAL PATTERN
<Modal key={editTarget?.id || 'new'} ...> resets React Hook Form when opening for different item
Modal.Footer inside children (not footer prop) — Modal separates it automatically as sticky footer
Sizes: sm=400px, md=520px, lg=680px, xl=860px. Use lg for forms with many fields.

TABLE PATTERN
Table is React.memo. sortKey/sortDir/onSort owned by hook, passed to Table.
loading={true} shows 8 skeleton rows automatically.
rowKey must match the PK field of the entity (e.g. 'cust_id', 'supp_id', 'prod_id').

REACT PERF (CreateSalePage pattern)
Module-level constants for style objects and stable references (EMPTY_ARRAY, NUM_INPUT_STYLE)
useCallback([]) for stable handlers + functional setState (prev => ...)
useRef for values that should not trigger re-renders (itemsRef.current)

CIRCULAR IMPORT RULE
Never import from another router. Extract shared logic to utils/.
payment_helpers.py exists specifically because sale.py + payment.py both need the same functions.

STAFF CREATION
Only via Supabase Auth Admin API using SUPABASE_SERVICE_ROLE_KEY (in .env, never exposed to frontend).

LEAN ENDPOINTS (declared BEFORE /{id} routes in FastAPI)
GET /customers/lean → [{cust_id, cust_name, cust_phone}] — for Create Invoice dropdown
GET /products/search?q=X → lean product search (min 2 chars) — for Create Invoice product search

STOCK OVERRIDE
allow_stock_override=False (default): over-stock returns HTTP 400 with error_code:"INSUFFICIENT_STOCK" + stock_errors array
allow_stock_override=True: backend writes manual adjustment movement → trigger won't raise "Insufficient stock"

DASHBOARD
GET /dashboard/summary → single merged SQL query with subqueries. Financial fields gated by dashboard.financial permission (null when absent).
GET /dashboard/trend → generate_series for zero-count days. All aggregations server-side.

PRINT
Use triggerPrint(html) from shared/utils/printUtils.js
Get business data via useAuthStore.getState().business (safe outside React)

EXPORT PATTERN
ExportButton with onFetch={handleExport} for server-paginated pages
handleExport() fetches backend with same active filters + limit=10000
CSV always includes updated_at + last_updated_by for pages with audit tracking

CURRENCY + TAX
formatCurrency(amount, countryCode) from shared/utils/formatCurrency.js
getTaxLabel(countryCode), getTaxBreakdown(countryCode, saleType) from shared/utils/formatTax.js

ENVIRONMENT
Backend .env: DATABASE_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_JWT_SECRET, SECRET_KEY, ENVIRONMENT (development|production), ALLOWED_ORIGINS
Frontend .env: VITE_API_URL, VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
/test-auth endpoint only exists when ENVIRONMENT=development — never in production

═══════════════════════════════════════════════
DESIGN SYSTEM — LOCKED, DO NOT CHANGE
═══════════════════════════════════════════════
Font        → Plus Jakarta Sans (loaded in index.html, not @import)
Themes      → Light/Dark via data-theme on <html> (persisted as sb-theme)
Accents     → Royal Purple/Ocean Blue/Emerald/Amber Gold via data-accent on <html> (persisted as sb-accent)
Sidebar     → ALWAYS dark (#0B0F1A = var(--sb-bg)) regardless of theme
Page bg     → var(--bg-page)
Card bg     → var(--bg-card), border var(--border), shadow var(--shadow-card)
Primary     → var(--accent-600)
Text        → var(--text-primary) / var(--text-secondary) / var(--text-muted)
Card radius → 14–18px (var(--r-xl) = 18px, var(--r-lg) = 14px)

STAT CARD GRADIENTS (LOCKED):
Revenue      → linear-gradient(135deg, #4F46E5, #7C3AED)
Expenses     → linear-gradient(135deg, #8B5CF6, #A855F7)
Invoices     → linear-gradient(135deg, #0EA5E9, #06B6D4)
Customers    → linear-gradient(135deg, #10B981, #059669)
Products     → linear-gradient(135deg, #F59E0B, #F97316)
Pending      → linear-gradient(135deg, #F97316, #EF4444)
Low Stock    → linear-gradient(135deg, #EF4444, #DC2626)

TREND CHART: Line + dot + area must use var(--accent-*) CSS vars. NEVER hardcoded hex in SVG.
COLORS: NEVER hardcode hex in components. Always use var(--accent-*), var(--bg-*), var(--text-*), var(--border) etc.

═══════════════════════════════════════════════
STANDARD LIST PAGE PATTERN (ALL PAGES FOLLOW THIS)
═══════════════════════════════════════════════
1. PageHeader: title, subtitle, back button (→ /dashboard), action slot (ExportButton + Add button gated by canManage)
2. Toolbar: SearchBar (left) + record count + active filter label | DateRangeFilter label="Last Updated" (right)
3. Table: sortKey/sortDir/onSort from hook. Default sort: updated_at DESC.
4. Pagination (always shown on server-paginated pages)
5. Drawers + Modals (Add / Edit / ConfirmDialog for delete)

COLUMNS: Every list page shows "Last Updated" (updated_at via formatDate) + "Last Updated By" (last_updated_by from JOIN) + Actions column.
Pagination: server-paginated pages show it always. It handles total_pages ≤ 1 internally.
Export: always visible (no permission gate). CSV includes updated_at + last_updated_by.
Add/Edit/Delete buttons: gated by canManage = can('feature.manage')

HOOK PATTERN (useXxx.js):
- staleTime: 30_000 for list pages
- placeholderData: (prev) => prev (keeps old rows visible during refetch)
- queryKey includes: [feature, page, debouncedSearch, sortKey, sortDir, dateFrom, dateTo]
- enabled: !!user (prevents query before login)
- On mutation success: invalidate queryKey + toast.success/error

API FILE PATTERN (xxxApi.js):
- fetchAll: sends page, limit, search, sort_by, sort_dir, updated_from, updated_to
- fetchAllForExport: same filters + limit=10000, returns res.data?.items ?? []
- CRUD: create, update, delete return res.data
- Never import authStore

═══════════════════════════════════════════════
API FIELD NAMES (EXACT)
═══════════════════════════════════════════════
Business/Settings: business_id, business_name, business_email, business_phone, business_address, business_state, gstin, is_gst_registered, business_country_code, is_deleted, created_at
Customers: cust_id, business_id, cust_name, cust_phone, cust_email, cust_address, cust_state, cust_country_code, cust_tax_number, is_deleted, cust_created_at, updated_at, updated_by, last_updated_by
Suppliers: supp_id, business_id, supp_name, supp_phone, supp_email, supp_address, supp_state, supp_country_code, supp_tax_number, is_deleted, supp_created_at, updated_at, updated_by, last_updated_by
Categories: category_id, business_id, category_name, is_deleted, created_at, updated_at, updated_by, last_updated_by, created_by
Products: prod_id, business_id, category_id, category_name, prod_name, prod_sell_price, prod_mrp, prod_cost_price, prod_profit(generated), prod_stock_qty, prod_low_stock_alert, tax_rate, tax_code, barcode, unit, is_deleted, prod_created_at, updated_at, created_by, created_by_name, updated_by, last_updated_by
Sales: sales_id, business_id, customer_id, customer_name, invoice_no, sales_total_amount, sales_discount, cgst_total, sgst_total, igst_total, tax_total, sales_final_amount(generated), sales_payment_status, sales_payment_method, sales_created_at, total_paid, remaining_balance, items[{sale_item_id, product_id, product_name, sale_item_quantity, sale_item_unit_price, item_mrp, sale_item_cost_price_at_sale, sale_item_subtotal(generated), cgst_amount, sgst_amount, igst_amount, tax_amount, item_tax_total(generated), item_total_with_tax(generated)}]
Payments: payment_id, business_id, sale_id, invoice_no, customer_name, sales_final_amount, payment_amount, cumulative_paid, payment_method, payment_paid_at, payment_status, is_active, remaining_balance
Purchases: pur_id, business_id, supp_id, supplier_name, invoice_no, pur_total_amount, pur_discount, pur_cgst_total, pur_sgst_total, pur_igst_total, pur_tax_total, pur_final_amount(generated), pur_payment_status, pur_created_at, items[{purchase_item_id, product_id, product_name, pur_item_qty, item_unit_price, item_subtotal(generated), cgst_amount, sgst_amount, igst_amount, tax_amount, item_tax_total(generated), item_total_with_tax(generated)}]
Expenses: expense_id, business_id, expense_category, expense_amount, expense_date, expense_notes, is_deleted, created_at, created_by, updated_at, updated_by
Stock Movements: move_id, business_id, product_id, product_name, move_type, move_qty, move_prev_stock, move_new_stock(generated), sale_reference_id, purchase_reference_id, reference_type, reference_id, move_notes, move_created_at, move_created_by
Stock Alerts: alert_id, business_id, product_id, alert_stock_qty, alert_threshold, alert_status, alert_created_at
Sales Returns: return_id, business_id, sale_id, invoice_no, customer_name, sales_final_amount, return_amount, return_reason, return_status, restock, stock_updated, refund_method, approved_by, approved_at, rejected_reason, return_created_at, created_by, items[{return_item_id, product_id, product_name, return_qty, refund_amount, return_item_subtotal(generated)}]
Purchase Returns: return_id, business_id, pur_id, supp_name, return_reason, return_status, restock, stock_updated, refund_method, approved_by, approved_at, rejected_reason, return_amount, return_created_at, created_by, items[{return_item_id, product_id, product_name, return_qty, refund_amount, return_item_subtotal(generated)}]

PERMISSION CODES (22 unique codes):
dashboard.view | dashboard.financial (gates revenue/cost/profit in dash + reports)
sales.view | sales.create | sales.edit | sales.delete
customers.manage | suppliers.manage
products.view | products.edit (categories CRUD also uses products.edit)
purchases.view | purchases.create | purchases.edit | purchases.delete
payments.manage | expenses.manage
stock.view | stock.adjust
sales_returns.manage | purchase_returns.manage
reports.view | settings.manage | staff.manage
view_product_profit (gates prod_cost_price + prod_profit — omitted from response when absent)

PAYMENT STATUS: pending (total_paid ≤ 0) | partial (0 < total_paid < final) | paid (total_paid ≥ final)

═══════════════════════════════════════════════
PAGES STATUS
═══════════════════════════════════════════════
✅ Dashboard /dashboard | permission: dashboard.view
✅ Categories /categories | permission: products.view (read) / products.edit (write)
✅ Products /products | permission: products.view
✅ Customers /customers | permission: customers.manage
✅ Suppliers /suppliers | permission: suppliers.manage
✅ Sales /sales + /sales/new | permission: sales.view / sales.create
✅ Payments /payments | permission: payments.manage
✅ Purchases /purchases + /purchases/new | permission: purchases.view / purchases.create
✅ Stock /stock | permission: stock.view
✅ Expenses /expenses | permission: expenses.manage
✅ Sales Returns /sales-returns | permission: sales_returns.manage
✅ Purchase Returns /purchase-returns | permission: purchase_returns.manage
✅ Settings /settings | permission: settings.manage
✅ Staff /staff | permission: staff.manage
✅ Reports /reports | permission: reports.view

ALL PAGES IMPLEMENTED

═══════════════════════════════════════════════
REPORTS MODULE
═══════════════════════════════════════════════
12 report categories (~45 endpoints) at GET /reports/:

1. Sales Summary          → trend, by-customer, by-product, by-category, by-payment-method, invoice-status
2. Purchase Summary       → trend, by-supplier, by-product, tax-summary
3. Expense Summary        → by-category, trend, distribution
4. Customer Revenue       → top, customer-history, lifetime-value, outstanding
5. Product Performance    → moving-products, sales-by-product
6. Inventory Valuation    → valuation, movement-summary, stock-flow
7. Tax Liability          → collected, paid, liability, by-rate
8. Profit by Product      → gross, by-product, by-category, trend
9. Profit by Customer     → by-customer, gross, trend
10. Cash Flow             → collections, outstanding, by-method, partial
11. Stock Movement History → stock-flow, movement-summary
12. Audit Logs            → user-activities, login-activities, data-changes, exports

Permission: reports.view. Financial KPIs gated by dashboard.financial.
Cost/profit visibility gated by view_product_profit.
Audit reports gated by staff.manage.

═══════════════════════════════════════════════
NEXT STEPS
═══════════════════════════════════════════════
1. Update reports profit queries (reports.py) to use sale_items.sale_item_cost_price_at_sale
   instead of products.prod_cost_price for accurate historical profit calculation.

═══════════════════════════════════════════════
SHARED COMPONENTS QUICK REFERENCE (25 components)
═══════════════════════════════════════════════
Badge           → variant(success/warning/danger/info/neutral)
BarChart         → data, keys, indexBy, height
Button          → variant(primary/secondary/ghost/outline/danger), size(sm/md/lg), loading, disabled
CommandPalette  → Cmd+K global search palette
ConfirmDialog   → open, onClose, onConfirm, title, message, confirmText, loading
DateRangeFilter → label, from, to, onChange(field,value)
DonutChart      → data, colors, height
EmptyState      → icon, title, description, action
ErrorBoundary   → React error boundary with fallback UI
ExportButton    → onFetch(async fn→array) OR data(array), filename, columns
FormField       → label, error, required, helper, children. Exports: selectStyle, textareaStyle
Input           → standalone styled input (use outside FormField)
LineChart        → data, lines, height, enableArea
Modal           → open, onClose, title, subtitle, size(sm/md/lg/xl), hideClose. Modal.Footer = sticky footer.
ModalPortal     → teleported modal wrapper
PageHeader      → title, subtitle, back, onBack, action(JSX)
Pagination      → pagination(object), onPageChange
SearchBar       → value, onChange, onSearch, placeholder, width
SelectField     → separate component for styled selects
ShortcutHelp    → keyboard shortcuts reference modal
SkeletonTable   → rows, cols
Spinner          → loading spinner with optional label
StateDropdown   → countryCode, value, onChange, label, error
Table           → columns, rows, loading, rowKey, sortKey, sortDir, onSort, onRowClick, emptyText

═══════════════════════════════════════════════
WHAT MUST NEVER BE DONE
═══════════════════════════════════════════════
✗ res.data.data — no double wrapper
✗ @/ imports — not configured
✗ Trailing slash in api calls — interceptor adds it
✗ authStore in api files
✗ Fetch in page components — always use a hook
✗ useState for form fields — use React Hook Form
✗ role === "admin" checks — use permission codes
✗ business_id from request body — always from current_user
✗ INSERT generated columns — DB rejects it
✗ Set updated_at in Python — DB trigger handles it
✗ Duplicate trigger logic in Python
✗ Cross-import between routers — use utils/
✗ str(datetime) — use fmt_ts()
✗ .toLocaleDateString() in components — use formatDate()
✗ Hardcoded hex colors — use CSS variables
✗ Hardcoded accent colors in SVG charts
✗ Change sidebar background to light color
✗ Change stat card gradients
✗ limit=10000 on normal page loads — use limit=20
✗ Hide Pagination when filter is active on server-paginated pages

═══════════════════════════════════════════════
DATABASE MIGRATIONS (Alembic)
═══════════════════════════════════════════════
Schema changes must be made via Alembic revisions, not directly in Supabase.

  alembic revision --autogenerate -m "description_of_change"
  alembic upgrade head           # apply pending migrations

The initial baseline (da22e1256e21) is an empty revision; the DB was stamped
at that revision. All future schema changes go through new Alembic revisions.

No raw .sql files are stored in the repo — triggers, functions, and indexes
are defined directly on the PostgreSQL database instance.

═══════════════════════════════════════════════
HOW TO START EVERY SESSION
═══════════════════════════════════════════════
1. Always read the actual files before writing any code
2. Confirm the issue exists in the real code — no assumptions
3. Implement the smallest safe fix
4. Preserve existing architecture and UI
5. Commit to git on success: git add . && git commit -m "Step X.X — description" && git push origin development