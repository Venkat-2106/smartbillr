# Subscription Architecture Report

> Based on actual source code analysis of SmartBillr.
> Generated: June 27, 2026

---

## 1. Discovered Modules (19 total)

| # | Module | Backend Router | Frontend Pages | API Endpoints | DB Tables |
|---|--------|---------------|----------------|---------------|-----------|
| 1 | **Authentication** | `/v1/auth` | Login, Signup, ResetPassword, Unauthorized | 1 (logout) | — |
| 2 | **Dashboard** | `/v1/dashboard` | DashboardPage | 2 (summary, trend) | `mv_dashboard_summary`, `mv_sales_trend_monthly` |
| 3 | **Sales** | `/v1/sales` | SalesPage, CreateSalePage | 5 (CRUD + status) | `sales`, `sale_items` |
| 4 | **Purchases** | `/v1/purchases` | PurchasesPage, CreatePurchasePage | 5 (CRUD + status) | `purchases`, `purchase_items` |
| 5 | **Products** | `/v1/products` | ProductsPage | 9 (CRUD, bulk-delete, low-stock, expiring) | `products` |
| 6 | **Customers** | `/v1/customers` | CustomersPage | 5 (CRUD) | `customers` |
| 7 | **Suppliers** | `/v1/suppliers` | SuppliersPage | 5 (CRUD) | `suppliers` |
| 8 | **Payments** | `/v1/payments` | PaymentsPage | 4 (CRUD + status) | `payments` |
| 9 | **Expenses** | `/v1/expenses` | ExpensesPage | 5 (CRUD) | `expenses` |
| 10 | **Stock** | `/v1/stock` | StockPage | 4 (adjust, movements, alerts, delete) | `stock_movements`, `low_stock_alerts` |
| 11 | **Categories** | `/v1/categories` | CategoriesPage | 5 (CRUD) | `categories` |
| 12 | **Sales Returns** | `/v1/sales-returns` | SalesReturnsPage | 5 (CRUD) | `sales_returns`, `sales_return_items` |
| 13 | **Purchase Returns** | `/v1/purchase-returns` | PurchaseReturnsPage | 5 (CRUD) | `purchase_returns`, `purchase_return_items` |
| 14 | **Reports** | `/v1/reports` | ReportsPage | ~45 (12 categories) | (aggregation queries) |
| 15 | **Settings** | `/v1/businesses` | SettingsPage | 3 (GET/PUT/DELETE me) | `businesses` |
| 16 | **Staff** | `/v1/staff` | StaffPage | 6 (CRUD + reset-password) | `profiles` |
| 17 | **Subscription** | (mixed) | SubscriptionPage, SubscriptionBanner | 8 (public reg, status, admin) | `businesses`, `super_admins` |
| 18 | **Public/Landing** | — | LandingPage | — | — |
| 19 | **Profiles** | `/v1/profiles` | — | 2 (me, check-email) | `profiles` |

**Additional infrastructure:** BarcodeScanner component, Audit logs table (`audit_logs`), Business counters (`business_counters`)

---

## 2. Current Architecture Overview

### Backend
- **Framework:** FastAPI with raw SQL (`text()`) throughout
- **Auth:** JWT (Supabase JWKS) → `verify_token()` → session-level PG settings (`app.current_business_id`, `app.current_user_id`)
- **Permissions:** 23 codes via `STRING_AGG` query, cached in-memory (10s TTL)
- **RBAC:** 3 predefined roles (admin, manager, staff) with role→permission mapping
- **Subscription:** ASGI middleware blocking expired/suspended accounts (HTTP 402)
- **Staff limits:** Only feature with per-tier enforcement (via `staff_limits.py` dict)
- **Migration chain:** Diverged into 2 heads (`q1r2s3t4u5v6` + `t1u2v3w4x5y6`)

### Frontend
- **Stack:** React + Vite + React Query + Zustand (persisted to localStorage)
- **Auth:** Token in Zustand → Axios interceptor → 402 redirect to `/subscription`
- **Permission gates:** Route-level (`ProtectedRoute`), sidebar filtering, inline (`usePermissions`)
- **Subscription data:** Fetched on login, stored in Zustand, consumed by `SubscriptionBanner`, pages, and `UpgradePrompt`
- **Staff gating:** Only feature with frontend tier awareness (`canAdd*` booleans)

### Database
- **All tables** have `business_id` FK and RLS enforcement via `app.current_business_id()` GUC
- **RLS** on 20 tables; `super_admins` has `deny_all` (service-role only)
- **Soft deletes** on 7 entities (`is_deleted` column)
- **Materialized views** for dashboard (`mv_dashboard_summary`, `mv_sales_trend_monthly`)
- **Triggers** for stock tracking, sales return stock reversal, low stock alerts, updated_by, updated_at

---

## 3. Current Subscription Type Values (in DB)

| Value | Label | Staff Limit | Manager Limit | Notes |
|-------|-------|-------------|---------------|-------|
| `trial` | Free Trial | 0 | 0 | Default on signup, `payment_status='pending'` |
| `monthly` | Premium | 2 | 1 | Paid monthly |
| `annual` | Pro | ∞ (None) | ∞ (None) | Paid annually |
| `lifetime` | Lifetime | ∞ (None) | ∞ (None) | Lifetime access |

---

## 4. Recommended Subscription Plan Mapping

**Keep the existing 4-tier structure** — only rename display labels. No new subscription_type values in DB.

| DB Value | Display Name | Branding | Position |
|----------|-------------|----------|----------|
| `trial` | **Free Trial** | Free | Entry tier |
| `monthly` | **Premium** | Monthly paid | Growth tier |
| `annual` | **Pro** | Annual paid | Scale tier |
| `lifetime` | **Lifetime** | Lifetime | Legacy/Nitro tier |

**Rationale:** This maps 1:1 to current DB values. No schema migration needed. `annual` and `lifetime` both unlock all features but with different billing models.

---

## 5. Feature Mapping Per Tier

### Free Trial (`trial`)

| Feature | Status | Enforcement |
|---------|--------|-------------|
| Dashboard (basic KPIs) | ✅ Full | — |
| Products | **Limited: 50** | New: `usage_limits.py` |
| Customers | **Limited: 50** | New: `usage_limits.py` |
| Suppliers | **Limited: 25** | New: `usage_limits.py` |
| Sales | **Limited: 100/month** | New: `usage_limits.py` |
| Purchases | **Limited: 50/month** | New: `usage_limits.py` |
| Staff/Managers | **0** (admin-only) | Existing: `staff_limits.py` |
| Financial Reports | **❌ Blocked** | Existing: `dashboard.financial` permission |
| Product Profit View | **❌ Blocked** | Existing: `view_product_profit` permission |
| Exports | **Limited: 500 rows** | New: limit in `ExportButton`/backend |
| Reports (non-financial) | ✅ Full | — |
| Expenses | ✅ Full | — |
| Sales Returns | ✅ Full | — |
| Purchase Returns | ✅ Full | — |
| Stock Management | ✅ Full | — |
| Categories | ✅ Full | — |
| Payments | ✅ Full | — |
| Settings | ✅ Full | — |

### Premium (`monthly`)

| Feature | Status | Notes |
|---------|--------|-------|
| All Free Trial features | ✅ Upgraded | — |
| Staff/Managers | **2 staff + 1 manager** | Existing: `staff_limits.py` |
| Products | Unlimited | — |
| Customers | Unlimited | — |
| Suppliers | Unlimited | — |
| Sales | Unlimited | — |
| Purchases | Unlimited | — |
| Financial Reports | ✅ Unlocked | Existing `dashboard.financial` |
| Product Profit View | ✅ Unlocked | Existing `view_product_profit` |
| Exports | Full (10,000 rows) | — |

### Pro (`annual`)

| Feature | Status | Notes |
|---------|--------|-------|
| All Premium features | ✅ Upgraded | — |
| Staff/Managers | Unlimited | Existing: `staff_limits.py` |

### Lifetime (`lifetime`)

Identical to Pro with different billing label.

---

## 6. Usage Limit Recommendations

| Entity | Free Trial | Premium | Pro/Lifetime | Enforcement Point |
|--------|-----------|---------|-------------|-------------------|
| **Products** | 50 | Unlimited | Unlimited | `POST /v1/products` |
| **Customers** | 50 | Unlimited | Unlimited | `POST /v1/customers` |
| **Suppliers** | 25 | Unlimited | Unlimited | `POST /v1/suppliers` |
| **Sales/month** | 100 | Unlimited | Unlimited | `POST /v1/sales` |
| **Purchases/month** | 50 | Unlimited | Unlimited | `POST /v1/purchases` |
| **Staff** | 0 | 2 | Unlimited | Already done in `staff.py` |
| **Managers** | 0 | 1 | Unlimited | Already done in `staff.py` |
| **Export rows** | 500 | 10,000 | 10,000 | Backend query + frontend button |

### Why these entities?
- **Products/Customers/Suppliers** — Core master data. Limiting them creates natural upgrade pressure without breaking workflows.
- **Sales/Purchases** — Transaction volume cap per month. Monthly counter can use `business_counters` or COUNT query.
- **Staff/Managers** — Already implemented. Kept as-is.
- **Exports** — Simple backend parameter change.

### Entities NOT suitable for limits:
- **Categories** — Low cardinality, rarely a reason to upgrade
- **Payments** — Dependent on sales, can't limit without breaking sales flow
- **Expenses** — Low business value for upgrade pressure
- **Stock movements** — Dependent on sales/purchases
- **Returns** — Dependent on sales/purchases
- **Reports** — Already gated by financial permission

---

## 7. APIs Requiring Subscription Validation

### Already validated by middleware (expired/suspended users)
**All endpoints** behind `verify_token()` — middleware returns 402 if subscription is expired.

### Need new tier-based validation (trial vs paid)

#### Create endpoints (usage counting)
| Endpoint | Method | Module | Limit |
|----------|--------|--------|-------|
| `/v1/products` | POST | Product | 50 for trial |
| `/v1/customers` | POST | Customer | 50 for trial |
| `/v1/suppliers` | POST | Supplier | 25 for trial |
| `/v1/sales` | POST | Sale | 100/month for trial |
| `/v1/purchases` | POST | Purchase | 50/month for trial |
| `/v1/staff` | POST | Staff | Already done |

#### Financial/Profit endpoints (feature access)
| Endpoint | Method | Module | Restriction |
|----------|--------|--------|-------------|
| `/v1/dashboard/summary` | GET | Dashboard | Financial fields null for trial (already done via `dashboard.financial`) |
| `/v1/dashboard/trend` | GET | Dashboard | Financial fields null for trial |
| `/v1/reports/financial/*` | GET | Reports | 7 endpoints blocked for trial (already done via `dashboard.financial`) |
| `/v1/products` `prod_cost_price`, `prod_profit` | GET | Product | Hidden for trial (already done via `view_product_profit`) |
| `/v1/stock` `prod_cost_price`, `prod_profit` | GE stock | Stock | Hidden for trial (already done via `view_product_profit`) |

#### Export endpoints
| Endpoint | Module | Restriction |
|----------|--------|-------------|
| All export endpoints in reports | Reports | `max_rows` param set to 500 for trial |

### No change needed
| Endpoint | Module | Reason |
|----------|--------|--------|
| PUT/DELETE endpoints | All | Editing/deleting own data should always work |
| GET detail endpoints (single entity) | All | Reading own data should always work |
| Expenses CRUD | Expense | No limit |
| Payments CRUD | Payment | No limit |
| Returns CRUD | Returns | No limit |
| Stock adjust | Stock | Needed for workflow |
| Categories CRUD | Category | No limit |
| Settings | Business | Needed for business operations |
| Subscription | Subscription | Must stay accessible |

---

## 8. Frontend Pages Requiring Tier Awareness

### Already handled
| Page | Current State |
|------|---------------|
| Subscription page | Shows status + contact for upgrade |
| Staff page | Shows UpgradePrompt, disables Add button |
| Dashboard | Financial metrics hidden per permission |

### Need new tier-aware UI

#### Add upgrade prompts / banners
| Page | What to show | Condition |
|------|-------------|-----------|
| **ProductsPage** | Inline UpgradePrompt in Add modal, banner at top | Trial + at limit (50) |
| **CustomersPage** | Inline UpgradePrompt in Add modal | Trial + at limit (50) |
| **SuppliersPage** | Inline UpgradePrompt in Add modal | Trial + at limit (25) |
| **SalesPage + CreateSalePage** | Banner at top, disable Create button | Trial + at monthly limit (100) |
| **PurchasesPage + CreatePurchasePage** | Banner at top, disable Create button | Trial + at monthly limit (50) |

#### Show usage badges
| Page | Badge | Location |
|------|-------|----------|
| ProductsPage | "50/50 used" | Next to page title or in toolbar |
| CustomersPage | "50/50 used" | Next to page title or in toolbar |
| SuppliersPage | "25/25 used" | Next to page title or in toolbar |

### No change needed
Dashboard, Reports, Expenses, Payments, Stock, Categories, Returns (both), Settings, Subscription

---

## 9. Database Changes Required

### No new tables needed.
The existing schema is sufficient. Usage limits can be stored in-memory (Python dicts) following the `STAFF_LIMITS` pattern.

### Optional enhancement: Monthly counter columns
If precise monthly counting is needed for sales/purchases, add to `business_counters`:

```sql
ALTER TABLE business_counters
  ADD COLUMN sales_this_month INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN purchases_this_month INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN sales_month INTEGER NOT NULL DEFAULT 0,  -- month number for reset detection
  ADD COLUMN purchases_month INTEGER NOT NULL DEFAULT 0;
```

**Note:** This is optional. COUNT queries on `sales`/`purchases` with a date range filter (`sales_created_at >= date_trunc('month', now())`) work just as well and don't require a migration.

### Migration needed: Merge divergent heads
Create a new migration that merges the two current heads:
- `q1r2s3t4u5v6` (expense amount CHECK constraint)
- `t1u2v3w4x5y6` (audit_logs timezone fix)

```python
revision = 'm1n2o3p4q5r6'
down_revision = ('q1r2s3t4u5v6', 't1u2v3w4x5y6')
```

(Or simply create all future migrations with `down_revision = t1u2v3w4x5y6` since it's the faster path.)

---

## 10. Middleware and Service Changes Required

### Backend

#### New file: `backend/app/utils/subscription_features.py`
Pattern: Dict-based feature map, mirroring `staff_limits.py`.

```python
# Tier → feature access flags
TIER_FEATURES = {
    "trial": {
        "max_products": 50,
        "max_customers": 50,
        "max_suppliers": 25,
        "max_sales_per_month": 100,
        "max_purchases_per_month": 50,
        "max_export_rows": 500,
        "financial_reports": False,
        "product_profit_view": False,
    },
    "monthly": {
        "max_products": None,       # None = unlimited
        "max_customers": None,
        "max_suppliers": None,
        "max_sales_per_month": None,
        "max_purchases_per_month": None,
        "max_export_rows": 10_000,
        "financial_reports": True,
        "product_profit_view": True,
    },
    "annual": {
        "max_products": None,
        "max_customers": None,
        "max_suppliers": None,
        "max_sales_per_month": None,
        "max_purchases_per_month": None,
        "max_export_rows": 10_000,
        "financial_reports": True,
        "product_profit_view": True,
    },
    "lifetime": {
        "max_products": None,
        "max_customers": None,
        "max_suppliers": None,
        "max_sales_per_month": None,
        "max_purchases_per_month": None,
        "max_export_rows": 10_000,
        "financial_reports": True,
        "product_profit_view": True,
    },
}

def get_feature_limits(subscription_type: str) -> dict:
    return TIER_FEATURES.get(subscription_type, TIER_FEATURES["trial"])
```

#### New utility: `backend/app/utils/usage_limits.py`
Helper to check counts against tier limits. Reusable across routers.

```python
def count_entities(db: Session, business_id: UUID, table: str) -> int:
    result = db.execute(text(f"""
        SELECT COUNT(*) FROM {table}
        WHERE business_id = CAST(:bid AS uuid) AND is_deleted = false
    """), {"bid": str(business_id)}).fetchone()
    return result[0]

def count_monthly(db: Session, business_id: UUID, table: str, date_column: str) -> int:
    result = db.execute(text(f"""
        SELECT COUNT(*) FROM {table}
        WHERE business_id = CAST(:bid AS uuid)
          AND {date_column} >= date_trunc('month', now())
          AND is_deleted = false
    """), {"bid": str(business_id)}).fetchone()
    return result[0]

def check_create_allowed(
    db: Session, business_id: UUID,
    subscription_type: str, limit_key: str,
    table: str, date_column: str = None
) -> tuple[bool, str]:
    limits = get_feature_limits(subscription_type)
    max_val = limits.get(limit_key)
    if max_val is None:
        return True, ""
    if date_column:
        current = count_monthly(db, business_id, table, date_column)
    else:
        current = count_entities(db, business_id, table)
    if current >= max_val:
        plan_label = subscription_type.capitalize()
        return False, f"Your {plan_label} plan allows a maximum of {max_val} {limit_key.replace('_', ' ')}. Upgrade to add more."
    return True, ""
```

#### Modified: `backend/app/routers/product.py`
Add limit check in `POST /v1/products` after auth, before insert.

#### Modified: `backend/app/routers/customer.py`
Add limit check in `POST /v1/customers`.

#### Modified: `backend/app/routers/supplier.py`
Add limit check in `POST /v1/suppliers`.

#### Modified: `backend/app/routers/sale.py`
Add monthly limit check in `POST /v1/sales`. Count sales with `sales_created_at >= date_trunc('month', now())`.

#### Modified: `backend/app/routers/purchase.py`
Add monthly limit check in `POST /v1/purchases`. Count purchases with `pur_created_at >= date_trunc('month', now())`.

#### Modified: `backend/app/routers/reports.py`
Existing `dashboard.financial` permission check covers financial reports. No change needed.

#### Modified: `backend/app/routers/staff.py`
- Fix hardcoded plan names in error messages (replace "Premium" and "Pro" with dynamic names)
- Already reviewed: lines 186-206 need `subscription_type.capitalize()` and the actual upgrade tier name

### Frontend

#### New utility: `frontend/src/shared/hooks/useSubscriptionLimits.js`
Hook to expose feature limits and usage for any module.

```javascript
import { useQuery } from '@tanstack/react-query'
import { fetchStaffSummary } from '../../features/staff/api/staffApi'

export function useSubscriptionLimits(module) {
  const { data: summary } = useQuery({
    queryKey: ['staff-summary'],
    queryFn: fetchStaffSummary,
    staleTime: 60_000,
  })

  const limits = summary?.limits || {}
  // Generic hook for any module
  const moduleLimits = summary?.limits?.[module] || {}

  return {
    limits: moduleLimits,
    tier: summary?.subscription_type,
  }
}
```

#### Modified: `frontend/src/features/products/pages/ProductsPage.jsx`
- Add upgrade banner when trial + at product limit

#### Modified: `frontend/src/features/customers/pages/CustomersPage.jsx`
- Add upgrade prompt in add modal when at customer limit

#### Modified: `frontend/src/features/suppliers/pages/SuppliersPage.jsx`
- Add upgrade prompt in add modal when at supplier limit

#### Modified: `frontend/src/features/sales/pages/SalesPage.jsx`
- Add banner when trial + at monthly sales limit

#### Modified: `frontend/src/features/purchases/pages/PurchasesPage.jsx`
- Add banner when trial + at monthly purchase limit

#### Modified: `frontend/src/api/axios.js`
- The 402 interceptor is already correct. Ensure it doesn't redirect when an API call prefetch happens silently. Consider adding a check for React Query background refetches.

---

## 11. Security Findings Related to Subscription Enforcement

### High Priority

| # | Finding | Severity | File | Details |
|---|---------|----------|------|---------|
| 1 | **No feature-level tier enforcement beyond staff** | High | All routers | Trial users can create unlimited products/customers/sales. Only global middleware blocks expired accounts. |
| 2 | **In-memory subscription cache not shared across instances** | Medium | `middleware/subscription.py` | `TTLCache` is per-process. With multiple Render instances, subscription changes on instance A take up to 60s to reflect on instance B. |
| 3 | **Error messages hardcode tier names** | Low | `routers/staff.py:186-206` | "Premium plan allows…" should be dynamic: "Your Monthly plan allows…" or `subscription_type.capitalize()`. |

### Medium Priority

| # | Finding | Severity | File | Details |
|---|---------|----------|------|---------|
| 4 | **Subscription page contact-based (no self-service)** | Medium | `SubscriptionPage.jsx` | No upgrade path exists. Users must contact support manually. The `/subscription` page shows "Contact us to renew or upgrade" with no payment integration. |
| 5 | **`UpgradePrompt` missing `lifetime` plan** | Low | `UpgradePrompt.jsx` | `PLAN_COMPARISON` only has trial/monthly/annual. Lifetime users will show broken plan comparison if they somehow see the prompt. |
| 6 | **No subscription expiry grace period or notification** | Low | `subscription_expiry.py` | The cron job immediately suspends expired subscriptions. No email/notification warning. No grace period. |

### Low Priority

| # | Finding | Severity | File | Details |
|---|---------|----------|------|---------|
| 7 | **Subscription expiry logic differs slightly between middleware and router** | Low | `subscription.py` (router vs middleware) | Middleware does its own DB query with different logic than the router endpoint. Could drift. |
| 8 | **No webhook handler for payment provider** | Low | Missing | Would need Razorpay/Stripe integration to auto-upgrade users. |

### Existing Good Practices (no change needed)

| Practice | Location | Details |
|----------|----------|---------|
| ✅ 402 for subscription errors | middleware | Distinguished from 403 (permission) errors |
| ✅ Subscription endpoint excluded from middleware | `EXCLUDED_PATHS` | Users can always check their status |
| ✅ RLS on all tenant tables | `a2b3c4d5e6f7` migration | Enforced at DB level |
| ✅ `super_admins` deny-all policy | `r1s2t3u4v5w6` migration | Service-role only |
| ✅ Token revocation (`last_logout_at`) | `auth.py` | JWT `iat` < `last_logout_at` → reject |
| ✅ Axios 402 interceptor | `axios.js` | Catches mid-session subscription expiry |

---

## 12. Code Quality Issues

| # | Issue | File | Lines | Recommendation |
|---|-------|------|-------|----------------|
| 1 | Hardcoded plan names in error messages | `staff.py` | 186, 203, 206 | Use `subscription_type.capitalize()` and dynamic tier labels |
| 2 | `UpgradePrompt` missing `lifetime` in `PLAN_COMPARISON` | `UpgradePrompt.jsx` | 11-15 | Add `lifetime` key |
| 3 | Unused `currentIdx` variable | `UpgradePrompt.jsx` | 160 | Remove |
| 4 | Unused `PlanDots` component (already removed) | `UpgradePrompt.jsx` | (deleted) | Was unused |
| 5 | `STAFF_LIMITS` and `get_staff_limits` redundant with `TIER_FEATURES` | `staff_limits.py` | Full file | Merge into `subscription_features.py` or keep separate (staff limits are role-based, not entity limits) |
| 6 | `businesses/` feature directory empty | `frontend/src/features/businesses/` | All files | Either remove or implement |

---

## 13. Implementation Order

### Phase 1: Foundation (minimal breaking changes)
1. ✅ Fix hardcoded plan names in `staff.py` error messages
2. ✅ Add `lifetime` to `UpgradePrompt.jsx` `PLAN_COMPARISON`
3. Create `backend/app/utils/subscription_features.py` (tier→feature map)
4. Create `backend/app/utils/usage_limits.py` (count helpers)
5. Merge Alembic heads into single chain

### Phase 2: Backend Enforcement
6. Add limit check to `POST /v1/products` (max 50 for trial)
7. Add limit check to `POST /v1/customers` (max 50 for trial)
8. Add limit check to `POST /v1/suppliers` (max 25 for trial)
9. Add monthly limit check to `POST /v1/sales` (max 100 for trial)
10. Add monthly limit check to `POST /v1/purchases` (max 50 for trial)

### Phase 3: Frontend Feedback
11. Add product count display + UpgradePrompt to `ProductsPage`
12. Add customer count display + UpgradePrompt to `CustomersPage`
13. Add supplier count display + UpgradePrompt to `SuppliersPage`
14. Add sales count banner to `SalesPage`
15. Add purchase count banner to `PurchasesPage`

### Phase 4: Polish
16. Add export row limit param for trial users
17. Add subscription type → display name mapping utility
18. (Future) Payment provider integration for self-service upgrades

---

## 14. Existing Files That Need Modification

### Backend (16 files)

| File | Change Type | What to Change |
|------|-------------|----------------|
| `backend/app/utils/staff_limits.py` | ✅ Fix | Error messages use dynamic plan names |
| `backend/app/routers/staff.py` | ✅ Fix | Lines 186, 203, 206 — remove hardcoded "Premium", "Pro" |
| `backend/app/utils/subscription_features.py` | **NEW** | Create tier→feature limit map |
| `backend/app/utils/usage_limits.py` | **NEW** | Create count helpers |
| `backend/app/routers/product.py` | ✏️ Edit | Add limit check in POST |
| `backend/app/routers/customer.py` | ✏️ Edit | Add limit check in POST |
| `backend/app/routers/supplier.py` | ✏️ Edit | Add limit check in POST |
| `backend/app/routers/sale.py` | ✏️ Edit | Add monthly limit check in POST |
| `backend/app/routers/purchase.py` | ✏️ Edit | Add monthly limit check in POST |
| `backend/app/routers/reports.py` | ✅ No change | Already gated by `dashboard.financial` |
| `backend/app/middleware/subscription.py` | ✅ No change | Global middleware works correctly |
| `backend/alembic/versions/merge_heads.py` | **NEW** | Merge diverged migrations |

### Frontend (7 files)

| File | Change Type | What to Change |
|------|-------------|----------------|
| `frontend/src/shared/components/UpgradePrompt.jsx` | ✅ Fix | Add `lifetime` to `PLAN_COMPARISON` |
| `frontend/src/features/products/pages/ProductsPage.jsx` | ✏️ Edit | Add usage badge + UpgradePrompt |
| `frontend/src/features/customers/pages/CustomersPage.jsx` | ✏️ Edit | Add usage badge + UpgradePrompt |
| `frontend/src/features/suppliers/pages/SuppliersPage.jsx` | ✏️ Edit | Add usage badge + UpgradePrompt |
| `frontend/src/features/sales/pages/SalesPage.jsx` | ✏️ Edit | Add monthly limit banner |
| `frontend/src/features/purchases/pages/PurchasesPage.jsx` | ✏️ Edit | Add monthly limit banner |

---

## 15. Production-Ready Prompts for Each Implementation Phase

### Phase 1, Item 1: Fix hardcoded plan names in staff.py

> **File:** `backend/app/routers/staff.py`
> **Change:** Replace hardcoded "Premium" and "Pro" in error messages with dynamic values. Use `subscription_type.capitalize()` for the current plan name. For upgrade suggestions, use the next tier up (monthly→annual for monthly users, annual for everyone else). The limit variables are `role_limit` and `current_count`. The error at line ~203 reads "Your Premium plan allows a maximum of {role_limit}... Upgrade to Pro for unlimited team members." — replace "Premium" with the actual subscription type and "Pro" with the next tier.

### Phase 1, Item 3: Create subscription_features.py

> **File:** `backend/app/utils/subscription_features.py` (new)
> **Content:** Create a Python module that defines `TIER_FEATURES` dict mapping each subscription_type to a dict of feature limits. Keys: `max_products`, `max_customers`, `max_suppliers`, `max_sales_per_month`, `max_purchases_per_month`, `max_export_rows`, `financial_reports`, `product_profit_view`. Trial: 50/50/25/100/50/500/False/False. monthly/annual/lifetime: all None/True except export rows (10,000). Export a `get_feature_limits(subscription_type: str) -> dict` function. Follow the exact pattern of `staff_limits.py`.

### Phase 1, Item 4: Create usage_limits.py

> **File:** `backend/app/utils/usage_limits.py` (new)
> **Content:** Create helper functions: `count_entities(db, business_id, table_name, extra_where="")` returns integer count of active rows for that business. `count_monthly(db, business_id, table_name, date_column)` returns count where date >= start of current month. `check_create_allowed(db, business_id, subscription_type, limit_key, table_name, date_column=None)` returns `(allowed: bool, message: str)`. Uses `get_feature_limits()` from subscription_features.py. All functions use raw SQL via `text()` to match project convention.

### Phase 1, Item 5: Merge Alembic heads

> **File:** `backend/alembic/versions/m1n2o3p4q5r6_merge_heads.py` (new)
> **Content:** Create a merge migration with `down_revision = ('q1r2s3t4u5v6', 't1u2v3w4x5y6')`, `depends_on = None`, and an empty `upgrade()`/`downgrade()`. Label: "merge divergent migration heads."

### Phase 2, Items 6-10: Add create limit checks to 5 routers

> **File:** `backend/app/routers/product.py`, `customer.py`, `supplier.py`, `sale.py`, `purchase.py`
> **Change pattern:** In the POST handler, after loading `current_user` but before any DB logic, fetch the business's `subscription_type` from the DB (single SELECT query), call `check_create_allowed()` from usage_limits.py, and if not allowed return HTTP 403 with the error message. For product/customer/supplier, use `count_entities()`. For sale/purchase, use `count_monthly()` with `sales_created_at`/`pur_created_at` as the date column. Add imports for `check_create_allowed`, `get_feature_limits`.

### Phase 3, Items 11-15: Frontend tier feedback

> **File:** `frontend/src/features/products/pages/ProductsPage.jsx`
> **Change pattern:** Import `useStaff` hook to get `summary` (contains `subscription_type`). Import `UpgradePrompt`. Add state for banner dismissal. At top of page content, render `<UpgradePrompt variant="banner" />` when `subscription_type === 'trial'`. In the Add Product modal, replace the submit button area with logic that checks if at limit based on product count from API.

> **File:** `frontend/src/features/customers/pages/CustomersPage.jsx`
> **Same pattern** as ProductsPage for customers.

> **File:** `frontend/src/features/suppliers/pages/SuppliersPage.jsx`
> **Same pattern** as ProductsPage for suppliers.

> **File:** `frontend/src/features/sales/pages/SalesPage.jsx`
> **Change pattern:** Add a banner at the top of the page when `subscription_type === 'trial'`, warning of monthly sales limit. The Create Sale button should show an upgrade tooltip when at limit.

> **File:** `frontend/src/features/purchases/pages/PurchasesPage.jsx`
> **Same pattern** as SalesPage for purchases.

---

## 16. Feature Dependency Analysis

| Core Feature | Depends On | Risk if Restricted |
|-------------|-----------|-------------------|
| Sales | Customers, Products, Inventory, Stock | 🚨 **Critical**: Cannot create sale without customer or product. If either is at limit, sale creation breaks. |
| Purchases | Suppliers, Products | 🚨 **Critical**: Cannot create purchase without supplier or product. |
| Sales Returns | Sales, Stock | ⚠️ **Medium**: Depends on existing sale. Restricting returns would break refund flow. |
| Purchase Returns | Purchases, Stock | ⚠️ **Medium**: Same as sales returns. |
| Payments | Sales | ⚠️ **Medium**: Payment against a sale. |
| Stock Adjustments | Products | ⚠️ **Medium**: Manual stock changes. |
| Reports | All data modules | ✅ **Safe**: Reports are read-only. |
| Dashboard | All data modules | ✅ **Safe**: Dashboard is read-only. |

### Safety Rules for Dependency Chain

1. **If a sale references a customer that was created during trial**, and the user later upgrades, that customer must remain accessible. Soft deletes + `is_deleted` filter ensure this.

2. **Do NOT block edit/delete endpoints** — only block creation. Users who created entities during trial should be able to edit them. This prevents data loss on upgrade.

3. **Do NOT block returns** — returns are business-critical and depend on existing transactions. Blocking returns would leave users unable to correct errors.

4. **Do NOT block payments** — payments are the core revenue cycle. Blocking payments would break the business.

5. **Monthly limit counters should reset automatically** — use `date_trunc('month', now())` comparison. No manual reset needed.

6. **Frontend should display current count/limit** alongside creation buttons — prevents confusing 403 errors.

---

## 17. Missing Subscription Infrastructure

| Component | Status | Priority |
|-----------|--------|----------|
| Tier→feature limit map | ❌ Missing (replaces manual `staff_limits.py` approach) | High |
| Usage count helpers | ❌ Missing | High |
| Frontend usage display hook | ❌ Missing | Medium |
| Self-service upgrade UI | ❌ Missing (currently contact-based) | Medium |
| Payment provider integration | ❌ Missing (requires Razorpay/Stripe) | Low |
| Webhook handler | ❌ Missing | Low |
| Email/notification on expiry | ❌ Missing | Low |
| Redis-backed subscription cache | ❌ Missing (uses in-memory only) | Low |
| Grace period mechanism | ❌ Missing | Low |

---

## 18. Summary

### What's already working well
- Subscription middleware (402 blocking for expired/suspended)
- Staff limit enforcement (backend + frontend + UpgradePrompt)
- Permission-based RBAC (23 codes, route-level + UI-level)
- Login expiry redirect + axios 402 interceptor
- Tenant isolation via RLS on all tables

### What needs to change
1. **Add entity-level usage limits** (products, customers, suppliers, sales/month, purchases/month) via `subscription_features.py` + `usage_limits.py`
2. **Enforce at POST endpoints** in 5 router files
3. **Surface limits in frontend** for 5 pages
4. **Fix hardcoded tier names** in staff.py
5. **Add `lifetime` plan** to UpgradePrompt
6. **Merge Alembic heads**

### What should NOT change
- Subscription middleware (correct as-is)
- RLS policies (correct as-is)
- Permission system (correct as-is)
- Login/redirect flow (correct as-is)
- Staff limit enforcement (already complete)
- Route protection (correct as-is)
- Database schema (no new tables needed)

---

*End of report.*
