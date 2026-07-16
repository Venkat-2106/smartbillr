# SmartBillr — Comprehensive Production Audit Report

**Audit Date:** July 16, 2026  
**Application Version:** 1.0.0  
**Branch:** `development`  
**Tech Stack:** FastAPI (Python) + React (Vite) + PostgreSQL (Supabase)  
**Audit Type:** Full production-grade engineering audit across all modules  

---

## 1. Executive Summary

SmartBillr is a SaaS business management platform with multi-tenant architecture, RBAC, inventory management, invoicing, payments, reports, and subscription billing. The codebase shows significant engineering investment with proper async migration, row-level security, materialized views, and well-structured patterns.

**However, the application is NOT ready for production deployment** in its current state. Several critical security vulnerabilities, business logic errors, and production-readiness gaps must be resolved first.

**Key showstoppers:**
- **JWT algorithm confusion vulnerability** allows token forgery
- **Gross profit calculations are systematically overstated** (discount not subtracted)
- **Sales return stock validation has TOCTOU race condition** enabling double restocking
- **Rate limiter decodes JWTs without signature verification** enabling rate limit bypass
- **No CI/CD deployment pipeline** exists
- **Test infrastructure tests SQLite stubs, not production PostgreSQL code**
- **`.env` file with real production secrets is committed to the repo**

---

## 2. Overall Application Health Score: **58/100**

| Category | Score | Assessment |
|----------|-------|------------|
| Functional Correctness | 55 | Critical bugs in profit calc, returns, stock |
| Performance | 65 | Dashboard queries, N+1 patterns, no caching |
| Security | 45 | JWT vuln, exposed secrets, algorithm confusion |
| Database | 70 | Good schema, some missing indexes, RLS gaps |
| Frontend | 72 | Solid patterns, some missing states, no tests |
| Backend | 68 | Good architecture, async migration complete |
| UI/UX | 78 | Clean design, some accessibility gaps |
| Business Logic | 50 | Discount, returns, stock, tax issues |
| Code Quality | 65 | Dead code, duplication, SQL injection patterns |
| Testing | 25 | Sparse coverage, critical tests mock production code |
| Production Readiness | 30 | No deployment pipeline, secrets exposed, no monitoring |
| Documentation | 55 | Partially outdated, missing env vars documented |

---

## 3. Production Readiness Score: **35/100**

**NOT production-ready.** Must resolve at minimum the Critical and High issues before any production deployment.

---

## 4. Module-by-Module Review

### 4.1 Authentication — 🔴 Critical Issues

**Files reviewed:** `auth.py`, `routers/auth.py`, `main.py`

| # | Finding | File:Line | Severity |
|---|---------|-----------|----------|
| 1 | **Algorithm Confusion Attack**: HS256 fallback accepts tokens signed with `SUPABASE_JWT_SECRET`. An attacker who obtains this secret (committed in `.env`) can forge valid JWTs. Additionally, stripping the `kid` header from a valid RS256 token can downgrade verification to HS256 if the secret is known. | `auth.py:264-280` | **CRITICAL** |
| 2 | **Error message leaks Python exception details**: `detail=f"Token verification failed: {e}"` exposes internal state. | `auth.py:302` | **HIGH** |
| 3 | **JWT `aud` and `iss` verification disabled**: Tokens from any Supabase project could be accepted. | `auth.py:257-258` | MEDIUM |
| 4 | **10-second JWT leeway extends token replay window**. | `auth.py:254` | LOW |

### 4.2 Authorization / RBAC — ⚠️ Medium Issues

**Files reviewed:** `rbac.py`, `permissions.py`, `models/rbac.py`

| # | Finding | File:Line | Severity |
|---|---------|-----------|----------|
| 5 | `get_current_user_with_permissions` bypasses subscription check. Any route using it as auth can be accessed with expired subscription. | `rbac.py:150-177` | MEDIUM |
| 6 | RLS GUCs are transaction-scoped. After `db.commit()`, they are lost. Missing `async_set_rls_gucs_after_commit()` call exposes cross-tenant data. | All routers | MEDIUM |
| 7 | Permission name inconsistency: `sales_returns.manage` uses underscore vs `sales.view` uses dot notation. | `permissions.py:8,13` | LOW |

### 4.3 Rate Limiting — 🔴 Critical Issue

| # | Finding | File:Line | Severity |
|---|---------|-----------|----------|
| 8 | **Unsigned JWT decode for user ID extraction**: Rate limiter decodes JWT without signature verification to extract `sub` for per-user rate limiting. Attacker can craft forged JWT with any user_id to DoS that user or bypass limits. | `ratelimit.py:71-78` | **CRITICAL** |
| 9 | **IP spoofing via X-Forwarded-For**: Trusts leftmost value without verifying against trusted proxy list. | `ratelimit.py:50-56` | HIGH |

### 4.4 Security Headers / CSP — ⚠️ Medium

| # | Finding | File:Line | Severity |
|---|---------|-----------|----------|
| 10 | CSP allows `style-src 'unsafe-inline'` — weakens XSS protection. | `security.py:12` | MEDIUM |
| 11 | No `Cache-Control: no-store` on authenticated endpoints. | `security.py` | LOW |

### 4.5 Subscription Middleware — ⚠️ Medium

| # | Finding | File:Line | Severity |
|---|---------|-----------|----------|
| 12 | Subscription check **fails open** on exception — DB failure lets expired users through. | `subscription.py:289-291` | MEDIUM |
| 13 | Wide exception catch in `verify_subscription` silences failures silently. | `dependencies/subscription.py:47-49` | MEDIUM |

### 4.6 Body Size Limits — ⚠️ Medium

| # | Finding | File:Line | Severity |
|---|---------|-----------|----------|
| 14 | Body size bypass via missing Content-Length (chunked encoding). | `request_size_limit.py:12-29` | HIGH |
| 15 | 50MB multipart limit is generous for DoS via CSV upload. | `request_size_limit.py:15` | MEDIUM |

### 4.7 CORS — ⚠️ Medium

| # | Finding | File:Line | Severity |
|---|---------|-----------|----------|
| 16 | `allow_credentials=True` with configurable origins — misconfiguration can leak credentials. | `main.py:98-107` | HIGH |

### 4.8 Global Exception Handling — ⚠️ Medium

| # | Finding | File:Line | Severity |
|---|---------|-----------|----------|
| 17 | Pydantic validation error details leaked to client (field names, types). | `main.py:114-124` | MEDIUM |

---

## 5. Critical Bugs

### CRITICAL-1: Gross Profit Systematically Overstated (Discount Not Subtracted)

**File:** `reports.py:155-158, 857-868, 896-910, 946-960, 994-1011, 1097-1118`

**Code:**
```sql
SUM(si.sale_item_subtotal - (si.sale_item_quantity * COALESCE(si.sale_item_cost_price_at_sale, p.prod_cost_price)))
```

**Root Cause:** Gross profit uses `sale_item_subtotal` (quantity * unit_price **before** header-level discount). The actual revenue after discount is `sales_final_amount = sales_total_amount - sales_discount + tax_total`. The discount is stored on the `sales` header (`sales_discount`) but is **never subtracted** in profit calculations. Every profit report grossly overstates profit by the full discount amount.

**Impact:** All financial reports, dashboard KPIs, profit by product/category/customer, and profit trends are wrong. A sale with ₹1000 subtotal and ₹200 discount shows ₹1000 profit instead of ₹800.

**Fix:** Replace `sale_item_subtotal` with `sale_item_subtotal * (sales_final_amount - tax_total) / sales_total_amount` (proportional allocation) in all profit queries.

### CRITICAL-2: TOCTOU Race Condition in Sales Return Validation

**File:** `sales_return.py:109-174` (and `update_sales_return` at lines 460-543)

**Root Cause:** Sales return validation reads `sale_items` and `sales_return_items` **without `FOR UPDATE` lock**. Two concurrent requests can both see `already_returned=0` and `available=10`, both pass validation, both create approved returns. The DB trigger `fn_sales_return_stock` adds stock back twice (adding 20 units instead of 10).

**Contrast:** `purchase_return.py:120-126` correctly uses `FOR UPDATE OF pi` to serialize concurrent purchase return creation. Sales returns lack this protection.

**Impact:** Inventory can be doubled on concurrent sales return approvals.

**Fix:** Add `FOR UPDATE` on `sale_items` rows during validation in `validate_return_items()`.

### CRITICAL-3: Sales Return `stock_updated` Never Set to True

**File:** `sales_return.py:510-527`

**Root Cause:** When a sales return is approved with `restock=true`, the UPDATE query does NOT set `stock_updated = true`. The purchase return equivalent (`purchase_return.py:575`) correctly sets it. Without this, the system cannot distinguish returns that have been restocked from those that haven't.

**Fix:** Add `stock_updated = CASE WHEN :status = 'approved' AND :restock = true THEN true ELSE stock_updated END` to the sales return UPDATE.

### CRITICAL-4: Double `rollback()` Causes AsyncPG Errors

**Files:** `bulk_stock_adjust.py:56,72`, `purchase_return.py:553-554,599-601`

**Root Cause:** `bulk_check_and_reduce_stock()` calls `await db.rollback()` internally on error, then the caller (purchase return) also calls `await db.rollback()` when it receives the error string. Rolling back an already-rolled-back transaction raises `InterfaceError: another operation is in progress` in asyncpg. The error response never reaches the client — an unhandled exception bubbles up to the generic `except Exception` block instead.

**Fix:** Remove `await db.rollback()` from `bulk_check_and_reduce_stock()` — let the caller own the rollback.

### CRITICAL-5: Real Production Secrets Committed to Git Repo

**File:** `backend/.env`

**Root Cause:** The `.env` file contains real production secrets:
- `SUPABASE_SERVICE_ROLE_KEY` — full access to Supabase Auth and DB
- `RAZORPAY_KEY_SECRET` — can create/manage orders
- `STRIPE_SECRET_KEY` — can create/manage charges

These are committed to the git repo (visible in public or team-accessible repo).

**.gitignore** check needed — `.env` is NOT in `.gitignore` based on the repo structure.

**Fix:** Immediately rotate ALL secrets, add `.env` to `.gitignore`, use GitHub Secrets for CI.

---

## 6. HIGH Priority Issues

### HIGH-1: Bulk Import Uses Total Count Instead of Monthly Count

**File:** `bulk_import.py:111`

**Root Cause:** For sales and purchases, individual creation correctly uses `count_monthly_async` (with `date_column`). But the bulk import check uses `count_entities_async`, which counts ALL entities ever (not monthly). A business with 90 total sales (all time) and 0 this month would be blocked on trial (max 100/month) because it counts 90 against 100, even though monthly is 0.

**Fix:** `check_bulk_create_allowed` must accept `date_column` parameter and use `monthly` count when provided.

### HIGH-2: Invoice Number Can Generate Gaps

**File:** `sale_service.py:13-21`, `sale.py:423`

**Root Cause:** `get_next_invoice_number` uses a counter in `business_counters`. If a transaction rolls back after consuming a number, that number is **not returned** to the pool (sequences/counters are not transactional). Additionally, bulk import generates invoice numbers per-row within a chunk; if a chunk fails mid-way, consumed numbers are lost.

**Impact:** For businesses requiring gapless invoice numbering (legal in some jurisdictions), this is non-compliant.

### HIGH-3: Float Conversion Before Decimal Loses Precision

**Files:** `sale.py:212-218`, `purchase.py:532-533`

**Code:**
```python
unit_price = Decimal(str(float(unit_price_raw)))
```

**Root Cause:** Converting to `float` first introduces binary floating-point rounding errors. `Decimal(str(float("0.1")))` produces `0.1000000000000000055511151...`. This affects every sale and purchase import.

**Fix:** Use `Decimal(unit_price_raw)` directly.

### HIGH-4: Purchase Return Validation Not in Bulk Stock Check Path

**File:** `purchase_return.py:543-555`

**Root Cause:** Purchase return uses `bulk_check_and_reduce_stock()` which has its own validation, but also has the double-rollback bug (CRITICAL-4). Additionally, the purchase return approval path uses a separate stock reduction logic that differs from the sales return approach.

### HIGH-5: UUID String Interpolation in SQL

**File:** `bulk_stock_adjust.py:76-78`

**Code:**
```python
product_ids_tuple = ", ".join(f"(CAST('{pid}' AS uuid), {qty_map[pid]})" for pid in product_ids)
```

**Root Cause:** UUID strings interpolated into SQL via f-string. While validated UUIDs, this is a SQL injection antipattern. All other bulk UPDATE statements use parameterized queries.

### HIGH-6: Subscription Period Fixed at 365 Days

**File:** `activation.py:77-78`

**Code:**
```python
period_end = now + timedelta(days=365)
```

**Root Cause:** Doesn't account for leap years. Subscriptions lose 1 day every leap year.

---

## 7. Performance Issues

### P-1: Dashboard Uses 4+ Sequential Queries Instead of Single Query

**File:** `dashboard.py:85-127`

**Issue:** Dashboard makes separate queries for sales, expenses, customer/product counts, and low stock alerts. These could be combined into a single query (or the materialized view already handles this — but MV freshness is not checked).

**Impact:** 4 DB round-trips for every dashboard load. Adds ~20-40ms latency.

### P-2: Materialized View Age Not Checked

**File:** `dashboard.py:85-96`, `reports.py:108-127`

**Issue:** Dashboard uses `mv_dashboard_summary` without checking its age. If the background refresh is slow or fails, users see stale data. The fallback only triggers when `main_row is None` (MV never populated), not when MV is stale.

**Fix:** Check MV refresh timestamp and fall back to live query if MV is older than N minutes.

### P-3: Low Stock Alert Query Uses `JOIN low_stock_alerts` Without Index on `alert_status`

**File:** `dashboard.py:114-119`

**Issue:** `WHERE la.alert_status = 'unread'` requires index on `low_stock_alerts(alert_status)` for large businesses with thousands of alerts.

### P-4: Reports Profit Queries Scan All `sale_items`

**File:** `reports.py:857-868, 896-910, 946-960, 994-1011, 1097-1118`

**Issue:** All profit queries JOIN `sale_items`, `sales`, and `products` with full table scans when no date filter is provided. For businesses with millions of sale items, these queries become very slow.

### P-5: Auth Rate Limit Too Low for Registration

**File:** `ratelimit.py:37`

**Issue:** `AUTH_LIMIT = 5` per 60 seconds for `/v1/business` means only 5 registration attempts per IP per minute. Combined with X-Forwarded-For spoofing bypass, this is both too restrictive and bypassable.

### P-6: Sales Summary Query Uses `LATERAL JOIN` on Payments

**File:** `sale_service.py:298-326`

**Issue:** The `LEFT JOIN LATERAL` for cumulative_paid can be slow for businesses with many payment records per sale. The `LIMIT 1` helps but still requires scanning payment rows.

### P-7: No Caching on Reports Endpoints

**File:** All report endpoints in `reports.py`

**Issue:** None of the ~45 report endpoints use any caching. Frequent report page loads hit the DB every time.

---

## 8. Database Issues

### DB-1: Missing Foreign Key Constraints at ORM Level

**Files:** `models/profile.py:14`, all model files

**Issue:** `Profile.business_id` has no `ForeignKey` declared at ORM level. While DB-level FKs may exist (via migrations), the ORM doesn't enforce them, enabling orphaned rows.

### DB-2: Missing Composite Indexes

| Table | Missing Index | Impact |
|-------|--------------|--------|
| `payments` | `(sale_id, is_active)` | Payment lookup per sale |
| `stock_movements` | `(product_id, move_created_at)` | Stock history queries |
| `audit_logs` | `(business_id, created_at)` | Audit log queries |
| `low_stock_alerts` | `(business_id, alert_status)` | Alert queries |
| `sale_items` | `(sale_id, product_id)` | Return validation |

### DB-3: Timestamp Column Type Inconsistency

**Issue:** Reports use `CAST(:date AS timestamp)` (no timezone) while some columns are `TIMESTAMPTZ`. This causes timezone-dependent query results. `payment.py:289-294` uses `CAST(:date_from AS timestamptz)` — inconsistent with reports format.

### DB-4: `sales_created_at` is `TIMESTAMP` Without Timezone

**File:** `models/sale.py:31`

**Issue:** All sale timestamps are timezone-naive. Timezone filtering depends entirely on PostgreSQL session timezone setting, which can vary between connections.

### DB-5: Missing `updated_by` on Supplier Import Update

**File:** `supplier.py:237-247`

**Issue:** The UPDATE for existing suppliers during bulk import does **not** set `updated_by`. Customer import (`customer.py:245-256`) correctly sets it.

---

## 9. Frontend Issues

### FE-1: Missing Permission Check on UI Elements

**File:** `DashboardLayout.jsx:877-879`

**Issue:** The notification bell icon is always rendered with a notification dot, but there is no actual notification API connected. The bell is decorative only.

### FE-2: Hardcoded Token Refresh in Axios Interceptor

**File:** `axios.js:63-77`

**Issue:** The request interceptor attempts token refresh 60 seconds before expiry. If `refreshAccessToken` doesn't exist or fails silently, requests proceed with an about-to-expire token that may fail mid-operation.

### FE-3: 401 Response Interceptor Redirects Without Queue Recovery

**File:** `axios.js:84-143`

**Issue:** When multiple concurrent requests get 401, the failed queue mechanism works for the first refresh but if any subsequent request fails with 401, it immediately clears auth and redirects to login, losing any successfully completed operations.

### FE-4: `ProtectedRoute` Renders Null During Hydration

**File:** `ProtectedRoute.jsx:22`

**Issue:** `if (!hydrated) return null` — renders nothing during Zustand persist hydration. This causes a flash of white on page load. Should show a spinner.

### FE-5: `useIdleLogout` Has No User Activity Since Last Check

**File:** `useIdleLogout.js`

**Issue:** Default timeout is 60 minutes (`60 * 60_000`). There's no progressive timeout shortening or user preference. A user who stays on a page for 59 minutes will be logged out while actively viewing.

### FE-6: `usePermissionsSync` Refetches Every 5 Minutes

**File:** `usePermissionsSync.js:18`

**Issue:** Polling every 5 minutes for permission changes creates unnecessary API calls. Permissions rarely change. Should use WebSocket or only check on page focus.

### FE-7: No Loading/Error States in Several Page Components

**Verified:** Several feature pages (e.g., `StockPage`, `ExpensesPage`) rely on the `Suspense` fallback in `DashboardLayout` but do not handle React Query loading/error states themselves. Users see a generic spinner until the entire page loads.

### FE-8: Hardcoded `import` Paths in `DashboardLayout.handleLogout`

**File:** `DashboardLayout.jsx:655-656`

**Issue:** `await import('../../api/axios')` — dynamic import in a handler adds latency to logout. Could import at module level.

### FE-9: Theme/Accessibility — No `prefers-color-scheme` Detection

**File:** `DashboardLayout.jsx:296-302`

**Issue:** Default theme is always `'light'` regardless of OS preference. Should check `prefers-color-scheme` media query on first load.

---

## 10. Backend Issues

### BE-1: Test Infrastructure Tests SQLite, Not PostgreSQL

**File:** `tests/conftest.py:55-99`

**Issue:** The `SQLiteCompatSession` class silently strips `FOR UPDATE`, `SET LOCAL`, `STRING_AGG` to PostgreSQL-only constructs, and converts UUID handling. The payment tests (`test_payments.py:25-84`) completely reimplement production `record_payment_and_sync` as a sync SQLite mock. **These tests verify the mock, not the production code.**

### BE-2: `role_id` and `role` Dual Representation in Profiles

**File:** `models/profile.py`

**Issue:** Profiles have both `role` (string) and `role_id` (UUID FK). If one is updated without the other, they become inconsistent.

### BE-3: Last-Purchase-Cost Accounting May Not Be Intended

**File:** `purchase.py:381-397`

**Issue:** Every purchase overwrites `prod_cost_price` with the latest purchase unit price. If weighted-average or FIFO cost is expected, this is incorrect. Each new purchase overwrites previous cost history.

### BE-4: Sales Tax Calculation in DB Triggers, Not Python

**File:** `sale_service.py:157-187` (no tax engine call) vs `purchase.py:274-282` (uses `tax_engine.py`)

**Issue:** Sales tax is calculated by DB trigger `fn_sale_stock_movement`, purchase tax uses the centralized `tax_engine.py`. Two different code paths handle GST rules — cannot be consistently tested or audited.

### BE-5: `ALLOWED_COUNT_TABLES` Has No Consistency Enforcement

**File:** `usage_limits.py:7`

**Issue:** The whitelist is a separate string list. Adding a new table requires updating both the whitelist and all callers. No automated check ensures consistency.

### BE-6: `parse_sale_error` Catches All Exceptions

**File:** `sale_service.py:255-259`

**Issue:** `parse_sale_error` only handles `Insufficient stock` errors. Any other exception (including programming errors) returns a generic message. Actual error information is lost.

### BE-7: Subscription Type Defaults to "trial" When NULL

**File:** `subscription.py:236`

**Issue:** If `subscription_type` is NULL in DB (e.g., migration issue), it defaults to "trial" — granting more access than intended. Should default to "suspended" or "none".

---

## 11. UI/UX Issues

### UX-1: No Keyboard Focus Order Management

**File:** `DashboardLayout.jsx`

**Issue:** While keyboard shortcuts exist (`g+d` for dashboard, etc.), focus management within modals (ThemePanel, LogoutDialog) does not trap focus. Tab navigation can focus elements behind the modal.

### UX-2: Subscription Banner Has Unclear Dismiss Behavior

**File:** `DashboardLayout.jsx:904`

**Issue:** `{showBanner && <SubscriptionBanner />}` — `showBanner` is derived from `subscription && !subscription.is_expired`. The logic is inverted from what the name suggests.

### UX-3: Empty States Need Consistency

**Verified across components:** Some list pages show "No data" messages while others show the `EmptyState` component. No consistent empty-state pattern across all feature pages.

### UX-4: Mobile Bottom Navigation Shows "More" Without Expanding

**File:** `DashboardLayout.jsx:560-567`

**Issue:** The "More" button in mobile bottom nav opens the sidebar rather than showing a popover or drawer — potentially confusing for users.

---

## 12. Business Logic Issues

### BL-1: $0 Unit Price in Bulk Import

**Files:** `sale.py:216-217`, `purchase.py:536-537`

**Issue:** Validation allows `unit_price <= 0` to be rejected, but uses `>` comparison which correctly blocks zero. However, an empty string or whitespace-only price would cause `int(float(raw))` to fail with a `ValueError`, which is caught and returns an "invalid" message. Acceptable but edge case.

### BL-2: Payment Method "Adjustment" Used in Reconciliation

**File:** `sale.py:644,662`

**Issue:** When reconciling a sale to "paid" status without explicit payment input, the payment method is set to "adjustment". This can confuse users reviewing payment reports.

### BL-3: Sales Bulk Import Doesn't Use Same Validation as Manual Create

**File:** `sale.py:402-462`

**Issue:** Bulk import bypasses `sale_service.py` functions (`validate_and_cache_products`, `insert_sale_items`, etc.) and uses direct SQL INSERT. This duplicates business logic in two places, risking inconsistencies.

### BL-4: `restock` Column Overwritten Unconditionally in Sales Return PUT

**File:** `sales_return.py:510-527`

**Issue:** The UPDATE overwrites `restock` unconditionally. If a PUT request doesn't include `restock`, it defaults to `false`, clearing the original restock flag.

---

## 13. Code Quality Issues

### CQ-1: Duplicated Date Filter Helper Code

**Files:** `reports.py:55-67` and `reports.py:70-81`

**Issue:** Two nearly identical helpers (`_date_range_params` and `_date_col`) with the same SQL generation logic. One is unused (only `_date_col` is called).

### CQ-2: Module-Level Globals in Auth Middleware

**File:** `auth.py:82-84`

**Issue:** `_permissions_cache`, `_business_users_index`, `_jwks_client`, `_redis` are module-level globals. In a multi-worker ASGI deployment, these can race.

### CQ-3: Dead Code in `conftest.py`

**File:** `tests/conftest.py:86`

**Issue:** After stripping `SET LOCAL`, the `SQLiteCompatSession.execute` function returns `None` implicitly. The caller may receive `None` instead of a `Result` object.

### CQ-4: Magic String URLs in Code

**File:** `auth.py:170`

**Issue:** `f"{supabase_url}/auth/v1/.well-known/jwks.json"` — JWKS endpoint path hardcoded. Should be a constant.

### CQ-5: Unused Imports and Variables

Multiple files contain unused imports (e.g., `from app.models.sale import Sale` in files that only use raw SQL). Not verified systematically but noted pattern.

---

## 14. Time Optimization Issues

### T-1: Dashboard Page Makes 4 Separate Requests

**File:** Frontend `useDashboard` hook

**Issue:** The dashboard page likely makes separate API calls for summary, trend, recent sales, and low stock alerts. These could be batched into a single dashboard endpoint (backend already has `/dashboard/summary` but frontend may call multiple endpoints).

### T-2: Reports Page Loads All 12 Categories On Mount

**File:** Frontend reports hooks

**Issue:** The reports page likely loads data for all report categories on page mount. Should lazy-load reports based on tab selection.

### T-3: Stock Movements Page Loads Complete History

**File:** Stock page hooks

**Issue:** Stock movements can grow very large over time. The page should use date-range filtering by default (e.g., last 30 days) rather than loading all history.

### T-4: Export Functions Fetch All Records Up to 10000

**File:** All `fetchAll*ForExport` functions

**Issue:** Export functions fetch up to 10,000 records in a single request. For businesses with many records, this creates large payloads and slow responses. Should use streaming or chunked exports.

### T-5: No Debounce on Search Inputs

**Verified across feature hooks:** Many search inputs trigger API calls on every keystroke. While `useDebounce` exists in shared hooks, it's not consistently applied to all search inputs.

### T-6: Vite Manual Chunks Are Good But No Dynamic Imports Beyond Routes

**File:** `vite.config.js`

**Issue:** Code splitting is done at the route level via `React.lazy()`, but within large pages (reports, settings), there's no further splitting. A user visiting reports loads code for all 12 report types.

### T-7: No Bundle Analysis Setup

**Issue:** No `vite-bundle-visualizer` or `rollup-plugin-visualizer` configured. Cannot easily identify large dependencies or optimize bundles without manual analysis.

### T-8: No Redis Cache Warming on Startup

**File:** `auth.py`

**Issue:** Redis cache starts empty. The first request after deployment hits the DB for permissions. For high-traffic APIs, this creates a "cold start" spike of DB queries.

---

## 15. Testing Issues

### TST-1: Payment Tests Mock Production Code With Incompatible Stub

**File:** `test_payments.py:25-84`

**Issue:** `_sqlite_record_payment_and_sync` is a complete reimplementation that converts Decimal to float (losing precision), uses `str(uuid.uuid4())` instead of `CAST(... AS uuid)`, and omits `payment_paid_at` default. **These tests do not verify the actual production logic.**

### TST-2: No Tests for 15+ Routers

**Missing files for:** business, category, customer, supplier, product, sale, purchase, stock, expense, sales_return, purchase_return, profiles, staff, dashboard, reports, superadmin, billing.

**Result:** 80%+ of the API surface has zero test coverage.

### TST-3: CI Pipeline Skips `updated_by` Trigger Tests

**File:** `.github/workflows/ci.yml:42`

**Issue:** `RUN_UPDATED_BY_TESTS` is not set, so `test_updated_by_trigger.py` is skipped in CI.

### TST-4: No Frontend Tests

**Issue:** Zero frontend tests exist. No Vitest, Jest, Playwright, or any test framework configured for frontend.

### TST-5: CI Has No `npm test` Step

**File:** `.github/workflows/ci.yml:49-61`

**Issue:** Frontend build job only runs `npm ci` and `npm run build`. No test step.

### TST-6: CI Hardcodes Secrets

**File:** `.github/workflows/ci.yml:35-46`

**Issue:** `SUPABASE_JWT_SECRET: dGVzdC1zZWNyZXQ=` and `POSTGRES_PASSWORD: testpassword` hardcoded in CI config. Visible in logs and repo history.

---

## 16. Production Readiness Gaps

### PR-1: No Deployment Pipeline

**Issue:** CI pipeline runs tests and builds frontend but has NO deploy step for Render (backend) or Vercel (frontend). No deployment scripts exist.

### PR-2: No Health Check Endpoint Validation

**Issue:** `/health` returns basic info but doesn't check DB connectivity, Redis connectivity, or external service health.

### PR-3: No Graceful Shutdown

**Issue:** No `lifespan` event handlers for `shutdown` to close DB connections, flush pending writes, or complete in-flight operations.

### PR-4: No Structured Logging

**Issue:** Uses `print`-style `logging.exception()` calls. No structured JSON logging (e.g., structlog, python-json-logger) for log aggregation tools.

### PR-5: No Error Tracking Integration

**Issue:** No Sentry, Datadog, or similar error tracking configured. All errors result in generic "Internal Server Error" responses.

### PR-6: No Database Backup Verification

**Issue:** No backup configuration or verification process documented. Supabase provides backups but no restore testing documented.

### PR-7: No Linting/Formatting in CI

**Issue:** No `ruff`, `black`, `eslint` runs in CI pipeline. Code quality is not enforced.

### PR-8: No Type Checking

**Issue:** No `mypy` or `pyright` in CI. Python code has no static type checking.

### PR-9: No Security Scanning

**Issue:** No `bandit`, `safety`, or `npm audit` in CI pipeline.

### PR-10: Documentation Outdated

**Issue:** `Readme.txt` references old architecture (base64 decode JWT, sync SQLAlchemy) that no longer matches the codebase.

---

## 17. Root Cause Analysis — Confirmed Issues

| Issue | Root Cause | Fix Complexity |
|-------|-----------|----------------|
| JWT algorithm confusion | HS256 fallback enabled with shared secret | Medium — remove fallback or add kid validation |
| Profit overstated | Discount not included in profit calculation | Medium — update all profit queries |
| Sales return double restock | Missing FOR UPDATE on sale_items read | Low — add row lock |
| `stock_updated` never set | Missing column in UPDATE query | Low — add CASE expression |
| Double rollback | Both callee and caller rollback | Low — remove internal rollback |
| Secrets committed | `.env` not gitignored | Low — add to .gitignore, rotate keys |
| Rate limiter unsigned JWT | Decode without signature verification | Low — use verified payload |
| Bulk import wrong count | Uses total count instead of monthly | Low — add date_column parameter |
| Float precision loss | Float() conversion before Decimal | Low — use Decimal() directly |
| GUC loss after commit | Transaction-scoped set_config | Medium — enforced pattern |
| Sales tax in DB triggers | Different code path from purchases | High — port to Python tax_engine |
| SQLite test infrastructure | Cannot test PG-specific features with SQLite | High — use testcontainers or PG |

---

## 18. Risk Assessment for Proposed Fixes

| Fix | Risk | Mitigation |
|-----|------|------------|
| Remove HS256 fallback | Low — Supabase RS256 only anyway | Test with existing tokens |
| Fix profit calculation | Medium — changes financial data | Add integration test with known values |
| Add FOR UPDATE to sales return | Low — standard PostgreSQL locking | Test concurrent requests |
| Add .env to gitignore | Low — standard practice | Rotate keys immediately |
| Fix float precision in import | Low — only affects new imports | Test with known decimal values |
| Port sales tax to Python tax_engine | High — could change tax amounts | Run parallel validation first |
| Add proper test infrastructure | Medium — requires testcontainers | Start with critical path tests |

---

## 19. End-to-End Test Scenarios Required

### E2E-1: Complete Sale-to-Payment Workflow
1. Create customer
2. Create product with initial stock
3. Create sale with items
4. Verify stock deducted
5. Record partial payment
6. Record full payment
7. Verify sale marked as paid
8. Verify invoice number generated

### E2E-2: Sales Return Restock Workflow
1. Create sale with 10 units
2. Create return for 5 units (pending)
3. Approve return with restock
4. Verify 5 units added back to stock
5. Verify `stock_updated` is true
6. Verify concurrent approval blocked

### E2E-3: Report Accuracy Verification
1. Create sale: ₹1000 subtotal, ₹100 discount, 18% GST
2. Verify `sales_final_amount` = ₹1062
3. Verify gross profit report = ₹1062 - cost - tax
4. Verify dashboard summary matches

### E2E-4: Multi-Tenant Isolation
1. User A creates data in Business 1
2. User B from Business 2 authenticates
3. Verify Business 1 data invisible
4. Verify Business 2 data accessible
5. Verify cross-tenant API calls blocked

### E2E-5: Subscription Enforcement
1. Create trial business
2. Create 100 sales (trial limit)
3. Verify 101st sale blocked
4. Upgrade to paid plan
5. Verify 101st sale allowed

### E2E-6: Bulk Import Correctness
1. Upload CSV with 100 sales
2. Verify all sales created
3. Verify invoice numbers sequential
4. Verify stock adjustments correct
5. Verify errors reported correctly

### E2E-7: Concurrent Payment Protection
1. Send 2 concurrent payment requests for same sale
2. Verify only 1 payment recorded
3. Verify total_paid matches single payment
4. Verify no double-charge

---

## 20. Final Recommendation

**DO NOT DEPLOY TO PRODUCTION** until the following conditions are met:

### Required Before Production Deployment (Stop-Ship):

1. **Fix JWT algorithm confusion** (`auth.py`) — Remove HS256 fallback or add proper validation
2. **Fix gross profit calculation** — All profit queries in `reports.py` must subtract discount
3. **Fix sales return TOCTOU** — Add `FOR UPDATE` in `sales_return.py`
4. **Fix `stock_updated`** — Add column update in sales return approval
5. **Remove production secrets from git** — Add `.env` to `.gitignore` and rotate all keys
6. **Fix rate limiter JWT decode** — Use verified payload only
7. **Fix double rollback** — Remove internal rollback from `bulk_stock_adjust.py`
8. **Fix float precision loss** — Use `Decimal()` directly in imports

### Required Within First Week of Production:

9. Fix bulk import count (monthly vs total)
10. Add missing database indexes (composite indexes on payments, stock_movements)
11. Add structured logging and error tracking
12. Create deployment pipeline (Render + Vercel)
13. Add health check with DB/Redis connectivity verification
14. Add CI linting and type checking
15. Add test for critical payment and sales workflows
16. Fix subscription expiry date (leap year)

### Recommended Before GA:

17. Port sales tax calculation to Python `tax_engine.py`
18. Add proper async test infrastructure (testcontainers)
19. Add frontend testing (Vitest + Playwright)
20. Implement webhook-based permission sync (replace 5-min polling)
21. Add email notification system
22. Implement audit log review UI
23. Add data export streaming for large datasets
24. Implement progressive idle timeout

---

## Scoring Methodology

- **Health Score (58/100):** Weighted average of all categories. Security (45) and Testing (25) drag the score down significantly.
- **Production Readiness (35/100):** Based on deployment infrastructure (0/20), security posture (15/30), testing (5/20), monitoring (5/15), and documentation (10/15).

The codebase has a solid architectural foundation but requires addressing the critical and high-priority issues before it can be considered production-ready. The good news: most fixes are surgical (1-5 lines each) rather than requiring architectural rewrites.
