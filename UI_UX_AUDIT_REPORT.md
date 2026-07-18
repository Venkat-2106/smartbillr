# SmartBillr — UI/UX Comprehensive Audit Report

**Date:** 2026-07-18
**Scope:** Full frontend (React + Vite + Tailwind CSS 4 + custom design system)
**Benchmark:** Stripe, Linear, Notion, Vercel, Ramp, Slack, Framer, GitHub, Raycast, Clerk, Supabase Dashboard

---

## Executive Summary

SmartBillr has a **solid custom design system** (`index.css`, 745 lines) with CSS custom properties, a consistent card/button/badge/table component library, and thoughtful patterns (lazy routes, React Query, Zustand, portal-based modals/command palette). The application is production-grade with permission-gated routes, server-side pagination, CSV import/export, and Razorpay billing.

**Key Strengths:**
- Well-structured design tokens (colors, spacing, radii, shadows, animations)
- Consistent component API across 25+ shared components
- Good use of React Query for server state, Zustand for client state
- Command palette with keyboard shortcuts (Linear/VS Code-style)
- Lazy-loaded routes for code splitting
- `UpgradeBlur`/`UpgradePrompt` for subscription gating
- Proper error boundaries and loading skeletons

**Key Weaknesses:**
- Heavy inline styles throughout page components (vs. CSS utility classes)
- Inconsistent page header patterns (some use `PageHeader`, some inline)
- No focus-visible states on interactive elements
- Missing skip-to-content link
- Limited keyboard navigation on data tables
- No skeleton loading on some pages
- Missing `aria-live` regions for dynamic content updates
- Inconsistent empty state icons (emojis vs SVG icons)
- Signup form doesn't use React Hook Form (manual state management)

---

## Scores

| Category | Score | Notes |
|----------|-------|-------|
| **UI Design** | 78/100 | Clean, modern design system. Inline styles reduce maintainability. |
| **UX** | 75/100 | Good patterns (search, filters, pagination). Missing some micro-interactions. |
| **Accessibility** | 62/100 | ARIA labels present. Missing focus management, skip links, live regions. |
| **Responsiveness** | 70/100 | Flex-wrap on toolbars. Sidebar needs mobile toggle improvement. |
| **Performance** | 82/100 | Lazy routes, React Query caching, memoized columns. Some re-render issues. |
| **Design Consistency** | 72/100 | Strong tokens. Page headers inconsistent. Empty states vary. |

**Overall: 73/100** — Production-ready with clear improvement path.

---

## Top 20 UI Issues (Confirmed with Evidence)

### 1. Inline Styles Overuse Across All Pages
**Severity:** High | **Category:** Design Consistency / Maintainability
**Evidence:** Every page component (SalesPage, PurchasesPage, PaymentsPage, SuppliersPage, CustomersPage, ExpensesPage, StockPage, SettingsPage) uses extensive inline `style={{...}}` objects instead of CSS utility classes or Tailwind. Example from `PurchasesPage.jsx:190-236` — page header is 30+ lines of inline styles.
**Impact:** Hard to maintain, no IDE autocomplete, no design token enforcement, CSS class proliferation in DOM.

### 2. Inconsistent Page Header Patterns
**Severity:** Medium | **Category:** Design Consistency
**Evidence:** `SuppliersPage` and `CategoriesPage` use `<PageHeader>` component. `PurchasesPage`, `PaymentsPage`, `SalesPage`, `ExpensesPage`, `ProductsPage` build headers inline with `<h1>` + `<p>` + back button. `PageHeader` component exists at `src/shared/components/PageHeader.jsx` but is underutilized.
**Impact:** Visual inconsistency, duplicated code, harder to add global header features.

### 3. No Focus-Visible States on Interactive Elements
**Severity:** High | **Category:** Accessibility
**Evidence:** `Button.jsx` uses `:hover` and `:active` but no `:focus-visible` ring. `Input.jsx` has `outline: 'none'` with no visible focus replacement. `SearchBar.jsx` uses native outline removal. Only `FormField` has error-state border changes. `CommandPalette.jsx:144` removes outline entirely.
**Impact:** Keyboard users cannot see which element is focused. Fails WCAG 2.4.7.

### 4. Missing Skip-to-Content Link
**Severity:** Medium | **Category:** Accessibility
**Evidence:** `DashboardLayout.jsx` renders sidebar + main content but has no skip link at the top. `router.jsx` wraps everything in `BrowserRouter` with no skip navigation.
**Impact:** Screen reader and keyboard users must tab through entire sidebar on every page load.

### 5. Signup Form Not Using React Hook Form
**Severity:** Medium | **Category:** Consistency / UX
**Evidence:** `SignupPage.jsx` uses manual `useState` for form state, manual `validate()` function, manual error setting (lines 83-161). All other forms (SuppliersPage, CustomersPage) use `react-hook-form` with `zodResolver`.
**Impact:** Inconsistent form handling, no built-in touched/dirty states, manual validation duplication.

### 6. Empty State Icons Inconsistent (Emoji vs SVG)
**Severity:** Low | **Category:** Design Consistency
**Evidence:** `SuppliersPage.jsx:318` uses emoji `'🏭'` and `'🔍'` for empty states. `PurchasesPage.jsx:377-389` and `PaymentsPage.jsx:348-358` use inline SVG icons. `EmptyState` component accepts either.
**Impact:** Mixed emoji/SVG rendering across platforms, inconsistent visual language.

### 7. No `aria-live` Regions for Dynamic Content Updates
**Severity:** Medium | **Category:** Accessibility
**Evidence:** When filters change on any list page (Sales, Purchases, Payments, etc.), the result count updates (`{totalItems} purchases`) but is not wrapped in `aria-live="polite"`. Table content changes without screen reader notification.
**Impact:** Screen reader users are not informed of data changes after filter/sort operations.

### 8. Table Row Keyboard Navigation Missing
**Severity:** Medium | **Category:** Accessibility / UX
**Evidence:** `Table.jsx` renders clickable `<tr>` elements with `onClick` handlers but no `tabIndex`, no `onKeyDown` handler, no `role="row"` with keyboard interaction. `ShortcutHelp.jsx:72-78` documents keyboard table shortcuts that are not implemented in the actual `Table` component.
**Impact:** Keyboard-only users cannot navigate or open table rows. Promised features in shortcut help don't work.

### 9. DashboardLayout Sidebar Mobile Toggle Needs Improvement
**Severity:** Medium | **Category:** Responsiveness / UX
**Evidence:** `DashboardLayout.jsx` mobile sidebar uses `useState` for open/close toggle. The hamburger button is present but the sidebar overlay close behavior only triggers on backdrop click. No swipe-to-close gesture, no Escape key to close on mobile.
**Impact:** Mobile UX friction for sidebar navigation.

### 10. CommandPalette Doesn't Scroll Active Item Into View Properly
**Severity:** Low | **Category:** UX
**Evidence:** `CommandPalette.jsx:80-85` uses `el?.scrollIntoView?.({ block: 'nearest' })` which works but the active item styling relies on index-based calculation. If the list re-renders during navigation, the active index may momentarily point to the wrong item.
**Impact:** Minor UX glitch in command palette navigation.

### 11. Missing Skeleton Loading States on Some Pages
**Severity:** Medium | **Category:** UX / Performance Perception
**Evidence:** `DashboardPage.jsx` uses `MetricCard` with `loading` prop. But `PurchasesPage`, `PaymentsPage`, `ExpensesPage` show no content until data loads (just empty table area). `ProductsPage` and `StockPage` use skeleton tables in some sections but not consistently.
**Impact:** Pages feel slow/blank during initial load. No visual feedback that content is coming.

### 12. `selectStyle` Not Applied Consistently to All `<select>` Elements
**Severity:** Low | **Category:** Design Consistency
**Evidence:** `PurchasesPage.jsx:318` uses `{...selectStyle, width: 'auto', padding: '9px 32px 9px 14px', fontSize: 13}`. `PaymentsPage.jsx:289` uses same pattern. But `SignupPage.jsx:236` uses `style={selectStyle}` directly. Some selects have `className="sb-select"` AND `style={selectStyle}` (double application).
**Impact:** Visual inconsistency in select dropdown styling.

### 13. No Confirmation Before Leaving Dirty Forms
**Severity:** Medium | **Category:** UX
**Evidence:** `CreateSalePage` and `CreatePurchasePage` are complex multi-field forms. No `useBlocker` or `beforeunload` handler detected in the codebase. Router navigation happens immediately.
**Impact:** Users lose unsaved work when accidentally navigating away.

### 14. MetricCard Grid Layout Inconsistent Across Pages
**Severity:** Low | **Category:** Design Consistency
**Evidence:** `PurchasesPage.jsx:249` uses `className="bento-grid bento-grid-12"` for metric cards. `PaymentsPage.jsx:239-244` uses inline `style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)' }}`. `DashboardPage` uses a mix of both patterns.
**Impact:** Grid layout may break at different breakpoints depending on approach used.

### 15. Error Banners Not Dismissible
**Severity:** Low | **Category:** UX
**Evidence:** Error banners on `PurchasesPage.jsx:357-371`, `PaymentsPage.jsx:327-341`, `SuppliersPage.jsx:300-314` are static divs with no dismiss button and no `role="alert"`. They persist even after the user takes corrective action.
**Impact:** Error state takes up space even when no longer relevant. Screen readers announce once but can't re-check.

### 16. `useEffect` Dependencies Potentially Stale in SuppliersPage
**Severity:** Low | **Category:** Performance
**Evidence:** `SuppliersPage.jsx:70-82` — `useEffect` for resetting edit form depends on `[editTarget]` but references `editForm` which is not in the dependency array. React lint would flag this.
**Impact:** Potential stale closure if form reference changes (unlikely with `useForm` but violates rules of hooks).

### 17. No Dark Mode Toggle Persisted to Backend/Storage
**Severity:** Low | **Category:** UX
**Evidence:** `DashboardLayout.jsx` imports `ThemePanel` component. Theme state appears to be handled by CSS custom properties but no `localStorage` persistence detected in the layout. Theme resets on page refresh.
**Impact:** Users must re-select theme every session.

### 18. Pagination Component Missing Current Page Input
**Severity:** Low | **Category:** UX
**Evidence:** `Pagination.jsx` shows page numbers with ellipsis logic but no direct page number input field. Users with many pages must click through one at a time if the target page is far away.
**Impact:** Minor friction for power users with large datasets.

### 19. Signup Page Hardcoded Country/State Lists
**Severity:** Low | **Category:** Maintainability / UX
**Evidence:** `SignupPage.jsx:8-79` has hardcoded `COUNTRIES` and `STATES_BY_COUNTRY` arrays (10 countries, limited states). The rest of the app uses `shared/data/countries` module. Signup has its own duplicate list with fewer countries.
**Impact:** Different country options between signup and the rest of the app. Maintenance burden.

### 20. `ConfirmDialog` Children Slot Not Documented in Component API
**Severity:** Low | **Category:** Maintainability
**Evidence:** `ConfirmDialog.jsx` accepts `children` prop (used in `PurchasesPage.jsx:458` for "Reduce product stock" checkbox) but this pattern is not documented in the component's JSDoc or usage patterns. Other pages don't know this slot exists.
**Impact:** Feature discovery issue for developers. Checkbox-in-dialog pattern is non-obvious.

---

## Quick Wins (Implementable in < 1 Day Each)

1. **Add `:focus-visible` ring to Button.jsx** — Add `outline: 2px solid var(--accent-500); outline-offset: 2px` on `:focus-visible`. 5 minutes.

2. **Wrap result counts in `aria-live="polite"`** — On all list pages, wrap the `{totalItems} items` span in `<span aria-live="polite">`. 15 minutes per page.

3. **Add skip-to-content link to DashboardLayout** — Add a visually hidden link at the top of `<body>` that skips to `<main>`. 10 minutes.

4. **Standardize empty state icons to SVG only** — Replace emoji in `SuppliersPage.jsx:318` with SVG icons matching other pages. 10 minutes.

5. **Add `role="alert"` to error banners** — On all list page error banners, add `role="alert"` for screen reader announcement. 5 minutes per page.

6. **Standardize page headers to use `<PageHeader>`** — Refactor `PurchasesPage`, `PaymentsPage`, `SalesPage`, `ExpensesPage`, `ProductsPage` to use the existing `PageHeader` component. 20 minutes per page.

7. **Persist theme preference to localStorage** — Add `localStorage.setItem('theme', theme)` in ThemePanel and restore on mount. 15 minutes.

8. **Add `aria-live` to UpgradePrompt banner** — Wrap the banner content in an `aria-live` region. 5 minutes.

---

## Long-Term Improvements (Multi-Day Efforts)

### Phase 1: Accessibility Foundation (1-2 weeks)
- Implement skip-to-content link across all layouts
- Add `:focus-visible` styles to all interactive components (Button, Input, Select, Badge, Pagination, TabBar)
- Wrap dynamic content updates in `aria-live` regions
- Add `role="row"` + keyboard navigation to Table component
- Implement table row focus management with arrow keys
- Add form error announcement via `aria-live` on form submission

### Phase 2: Component Consolidation (1-2 weeks)
- Migrate all inline page styles to CSS utility classes or Tailwind
- Standardize all page headers to use `PageHeader` component
- Migrate `SignupPage` to `react-hook-form` + `zodResolver`
- Standardize all `<select>` elements to use consistent `selectStyle`
- Create shared error banner component with dismiss + `role="alert"`
- Extract inline metric card grids to use `className="bento-grid bento-grid-12"` consistently

### Phase 3: UX Polish (1 week)
- Add skeleton loading states to all list pages
- Add dirty form protection with `useBlocker` on create/edit forms
- Add page number input to Pagination component
- Implement swipe-to-close on mobile sidebar
- Add Escape key to close mobile sidebar
- Deduplicate country/state data between SignupPage and shared module

### Phase 4: Performance & Developer Experience (1 week)
- Audit and fix React Query stale closure issues
- Add ESLint rules for inline style warnings
- Create Storybook stories for shared components
- Document component APIs with JSDoc and usage examples
- Add bundle analysis to CI pipeline

---

## Prioritized Fix Roadmap

| Priority | Issue | Effort | Impact |
|----------|-------|--------|--------|
| **P0** | #3 Focus-visible states | 2h | Critical accessibility gap |
| **P0** | #4 Skip-to-content link | 30m | Critical accessibility gap |
| **P0** | #7 aria-live regions | 1h | Critical accessibility gap |
| **P1** | #8 Table keyboard nav | 1d | Major UX/accessibility gap |
| **P1** | #1 Inline styles migration | 3d | Major maintainability improvement |
| **P1** | #2 Standardize page headers | 4h | Consistency improvement |
| **P1** | #11 Skeleton loading states | 1d | UX perception improvement |
| **P2** | #5 Signup form to RHF+Zod | 4h | Consistency improvement |
| **P2** | #6 Empty state icons | 1h | Visual consistency |
| **P2** | #12 Select style consistency | 2h | Visual consistency |
| **P2** | #13 Dirty form protection | 4h | UX protection |
| **P2** | #14 MetricCard grid consistency | 2h | Layout consistency |
| **P3** | #15 Dismissible error banners | 2h | UX improvement |
| **P3** | #17 Theme persistence | 1h | UX improvement |
| **P3** | #18 Pagination page input | 2h | Power user feature |
| **P3** | #19 Signup country data dedup | 30m | Maintainability |
| **P3** | #20 ConfirmDialog children docs | 30m | Developer experience |

---

## AI Fix Prompts

### Prompt #3: Add Focus-Visible States

```
In the SmartBillr React frontend, add `:focus-visible` keyboard focus styles to all interactive components. The project uses a custom CSS design system in `frontend/src/index.css` with CSS custom properties.

TASK: Add visible focus indicators that only appear for keyboard navigation (not mouse clicks).

FILES TO MODIFY:
1. `frontend/src/shared/components/Button.jsx` — Add CSS class or inline style for `:focus-visible` state. The button already has hover/active states. Add `outline: 2px solid var(--accent-500); outline-offset: 2px;` when `:focus-visible`.

2. `frontend/src/shared/components/Input.jsx` — Currently removes outline with `outline: 'none'`. Replace with `:focus-visible` outline using the accent color.

3. `frontend/src/shared/components/SearchBar.jsx` — Same pattern as Input.

4. `frontend/src/index.css` — Add a global `.focus-ring` utility class and apply to all interactive elements:
   ```css
   .focus-ring:focus-visible {
     outline: 2px solid var(--accent-500);
     outline-offset: 2px;
   }
   ```

5. `frontend/src/shared/components/CommandPalette.jsx` — The search input at line 144 has `outline: 'none'`. Add focus-visible style.

6. `frontend/src/shared/components/Pagination.jsx` — Page number buttons need focus-visible ring.

7. `frontend/src/shared/components/TabBar.jsx` — Tab buttons need focus-visible ring.

8. `frontend/src/shared/components/Badge.jsx` — If clickable, needs focus-visible ring.

CONSTRAINTS:
- Use `outline` property, NOT `box-shadow` (better accessibility, works with high-contrast mode)
- Use `outline-offset: 2px` for visual separation from element border
- Use existing `--accent-500` CSS custom property for the ring color
- Only show focus ring on `:focus-visible`, not `:focus` (so mouse clicks don't show it)
- Ensure focus ring is visible on both light and dark themes (use the existing CSS custom property which already handles theming)
```

### Prompt #4: Add Skip-to-Content Link

```
In the SmartBillr React frontend, add a skip-to-content link to the main app layout. This is a WCAG 2.4.1 requirement for keyboard and screen reader users.

TASK: Add a visually hidden skip link that becomes visible on keyboard focus, allowing users to bypass the sidebar navigation.

FILE TO MODIFY: `frontend/src/app/layouts/DashboardLayout.jsx`

IMPLEMENTATION:
1. At the very beginning of the component's return JSX, before the sidebar, add:
```jsx
<a
  href="#main-content"
  className="skip-link"
  style={{
    position: 'absolute',
    left: '-9999px',
    zIndex: 9999,
    padding: '8px 16px',
    background: 'var(--accent-600)',
    color: '#fff',
    borderRadius: 'var(--r-md)',
    fontSize: 14,
    fontWeight: 600,
    textDecoration: 'none',
  }}
  onFocus={(e) => {
    e.currentTarget.style.left = '16px'
    e.currentTarget.style.top = '16px'
  }}
  onBlur={(e) => {
    e.currentTarget.style.left = '-9999px'
    e.currentTarget.style.top = 'auto'
  }}
>
  Skip to main content
</a>
```

2. Add `id="main-content"` to the main content area's outermost element (the `<main>` or wrapper div that contains `<Outlet />`).

3. Alternatively, add the focus styles to `index.css`:
```css
.skip-link {
  position: absolute;
  left: -9999px;
  z-index: 9999;
  padding: 8px 16px;
  background: var(--accent-600);
  color: #fff;
  border-radius: var(--r-md);
  font-size: 14px;
  font-weight: 600;
  text-decoration: none;
}
.skip-link:focus {
  left: 16px;
  top: 16px;
}
```

CONSTRAINTS:
- The link must be the first focusable element in the DOM
- It must be visually hidden until focused via keyboard (Tab key)
- It must have sufficient color contrast (use accent color which passes WCAG AA)
- It must work in both light and dark themes
```

### Prompt #7: Add aria-live Regions for Dynamic Content

```
In the SmartBillr React frontend, add `aria-live="polite"` regions so screen readers announce when list page content updates (after search, filter, sort, or pagination changes).

TASK: Wrap dynamic content counters in `aria-live` regions across all list pages.

FILES TO MODIFY (one pattern applied to each):

For each of these files, find the element showing the total count (e.g., `{totalItems} purchases`, `{totalItems} records`) and wrap it in a `<span aria-live="polite">`:

1. `frontend/src/features/purchases/pages/PurchasesPage.jsx` — Line 326-329: Wrap the count text
2. `frontend/src/features/sales/pages/SalesPage.jsx` — Find the equivalent count display
3. `frontend/src/features/payments/pages/PaymentsPage.jsx` — Line 297-300: Wrap the count text
4. `frontend/src/features/suppliers/pages/SuppliersPage.jsx` — Line 274-277: Wrap the count text
5. `frontend/src/features/customers/pages/CustomersPage.jsx` — Find the equivalent count display
6. `frontend/src/features/products/pages/ProductsPage.jsx` — Find the equivalent count display
7. `frontend/src/features/expenses/pages/ExpensesPage.jsx` — Find the equivalent count display
8. `frontend/src/features/stock/pages/StockPage.jsx` — Find the equivalent count display

PATTERN:
Replace:
```jsx
<span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 500 }}>
  {totalItems} purchase{totalItems !== 1 ? 's' : ''}
  {activeFilters > 0 && ' (filtered)'}
</span>
```

With:
```jsx
<span aria-live="polite" style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 500 }}>
  {totalItems} purchase{totalItems !== 1 ? 's' : ''}
  {activeFilters > 0 && ' (filtered)'}
</span>
```

CONSTRAINTS:
- Use `aria-live="polite"` (not "assertive") — this is non-urgent content
- Only wrap the text content, not the entire toolbar
- The element should have minimal DOM structure inside it (just text)
- Do NOT add `aria-live` to the table itself (too chatty for screen readers)
- Also add `role="status"` as an alternative/addition for better screen reader support
```

### Prompt #8: Add Table Keyboard Navigation

```
In the SmartBillr React frontend, implement keyboard navigation for the `Table` component. Currently, table rows are clickable via mouse but not keyboard-accessible.

TASK: Add keyboard navigation to `frontend/src/shared/components/Table.jsx` so users can:
- Tab to focus the table
- Use Arrow Up/Down to navigate rows
- Press Enter to activate the row click handler
- Press Tab to move focus to the next interactive element after the table

MODIFY: `frontend/src/shared/components/Table.jsx`

IMPLEMENTATION:
1. Add a `tableRef = useRef(null)` and `focusedRowIndex` state
2. Make the `<table>` element focusable with `tabIndex={0}` and `role="grid"` (for data grid semantics)
3. Add `onKeyDown` handler to the table:
   - ArrowDown: Move focus to next row
   - ArrowUp: Move focus to previous row
   - Enter/Space: Trigger `onRowClick` for the focused row
   - Home: Focus first row
   - End: Focus last row
4. On each `<tr>`, add `role="row"` and `tabIndex={-1}` (programmatic focus only)
5. When a row receives focus (via arrow keys), apply a visual highlight style matching the existing hover style
6. Announce the current row to screen readers using `aria-rowindex` and `aria-rowcount`

VISUAL STYLING:
- Focused row should show `background: var(--bg-hover)` (same as existing hover style)
- Add a subtle `outline: 2px solid var(--accent-500)` on the focused row for keyboard users
- Use `useEffect` to manage focus when `focusedRowIndex` changes

CONSTRAINTS:
- Don't break existing mouse click behavior (`onRowClick`)
- Don't break existing sort behavior (header clicks)
- Keep loading skeleton rows non-focusable
- Arrow keys should only work when the table has focus (not globally)
- Maintain existing `loading` prop behavior
```

### Prompt #1: Migrate Inline Styles to CSS Classes

```
In the SmartBillr React frontend, refactor page components to move inline styles to CSS classes or Tailwind utility classes. The project uses Tailwind CSS 4 but most pages use inline `style={{...}}` objects.

TASK: Create a reusable page layout CSS file and migrate the most impactful inline styles.

FILES TO CREATE/MODIFY:

1. Create `frontend/src/shared/styles/pages.css` with utility classes for common page patterns:
```css
/* Page Layout */
.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 24px;
  flex-wrap: wrap;
  gap: 12px;
}

.page-header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.page-title {
  font-size: 28px;
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: -0.03em;
  margin: 0;
}

.page-subtitle {
  font-size: 13px;
  color: var(--text-secondary);
  margin: 4px 0 0 0;
}

.page-actions {
  display: flex;
  gap: 10px;
  align-items: center;
}

/* Toolbar */
.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
  gap: 12px;
  flex-wrap: wrap;
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

/* Filter count badge */
.filter-count {
  font-size: 13px;
  color: var(--text-muted);
  font-weight: 500;
}

/* Clear filters button */
.clear-filters {
  background: none;
  border: none;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--accent-600);
  font-weight: 600;
  padding: 2px 6px;
}

/* Error banner */
.error-banner {
  display: flex;
  align-items: center;
  gap: 10px;
  background: var(--danger-bg);
  border: 1px solid var(--danger-border);
  border-radius: 12px;
  padding: 12px 16px;
  color: var(--danger-text);
  font-size: 13px;
  margin-bottom: 24px;
  font-weight: 500;
}

/* Metric card grid */
.metric-grid {
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  gap: 16px;
  margin-bottom: 24px;
}
```

2. Then migrate `PurchasesPage.jsx` as the reference implementation:
   - Replace the inline page header (lines 190-237) with the new CSS classes
   - Replace toolbar (lines 306-354) with CSS classes
   - Replace error banner (lines 357-371) with `.error-banner` class
   - Replace metric grid (line 249) with `.metric-grid` class

3. Apply the same pattern to `PaymentsPage.jsx`, `SalesPage.jsx`, `ExpensesPage.jsx`, `SuppliersPage.jsx`, `CustomersPage.jsx`.

CONSTRAINTS:
- Do NOT change any functionality — only extract styles to classes
- Import the new CSS file in `main.jsx` or `index.css`
- Keep existing CSS custom properties for theming
- Use CSS specificity carefully to not break existing component styles
- Test that both light and dark themes still work
```

### Prompt #2: Standardize Page Headers to PageHeader Component

```
In the SmartBillr React frontend, the `PageHeader` component exists at `frontend/src/shared/components/PageHeader.jsx` but is only used by some pages. Standardize all list pages to use it.

TASK: Refactor these pages to use `<PageHeader>` instead of inline header markup:

PAGES TO UPDATE:
1. `frontend/src/features/purchases/pages/PurchasesPage.jsx`
   - Replace the inline header (lines 190-237) with:
   ```jsx
   <PageHeader
     title="Purchases"
     subtitle="View and manage all stock purchases from suppliers"
     back
     onBack={() => navigate('/dashboard')}
     action={
       <div style={{ display: 'flex', gap: 10 }}>
         <ExportButton ... />
         {canCreate && <ImportButton ... />}
         {canCreate && <Button variant="primary" onClick={() => navigate('/purchases/new')}>+ New Purchase</Button>}
       </div>
     }
   />
   ```

2. `frontend/src/features/payments/pages/PaymentsPage.jsx` — Same pattern (no back button needed, has no back navigation)

3. `frontend/src/features/sales/pages/SalesPage.jsx` — Has back button in header

4. `frontend/src/features/expenses/pages/ExpensesPage.jsx` — Has back button

5. `frontend/src/features/products/pages/ProductsPage.jsx` — Has back button

CONSTRAINTS:
- Preserve all existing action buttons (Export, Import, Create)
- Preserve back button navigation where it exists
- The `PageHeader` component accepts: `title`, `subtitle`, `action`, `back`, `onBack`
- Do NOT modify the `PageHeader` component itself
- Keep all permission-gated action buttons working
- Maintain the UpgradePrompt banner placement AFTER the header (not inside it)
```

### Prompt #5: Migrate SignupPage to React Hook Form + Zod

```
In the SmartBillr React frontend, refactor `SignupPage.jsx` to use `react-hook-form` with `zodResolver` for consistency with the rest of the application.

TASK: Replace manual useState-based form management with react-hook-form.

FILE TO MODIFY: `frontend/src/features/auth/pages/Pages/SignupPage.jsx`

STEPS:
1. Add imports:
```jsx
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
```

2. Create a Zod schema:
```jsx
const signupSchema = z.object({
  business_name: z.string().min(1, 'Business name is required'),
  owner_name: z.string().min(1, 'Your name is required'),
  owner_email: z.string().email('Enter a valid email'),
  owner_password: z.string().min(8, 'Minimum 8 characters'),
  business_phone: z.string().optional(),
  business_address: z.string().optional(),
  business_country_code: z.string().min(1, 'Country is required'),
  business_state: z.string().min(1, 'State is required'),
})
```

3. Initialize the form:
```jsx
const { register, handleSubmit, watch, setValue, formState: { errors, isSubmitting } } = useForm({
  resolver: zodResolver(signupSchema),
  defaultValues: {
    business_name: '',
    owner_name: '',
    owner_email: '',
    owner_password: '',
    business_phone: '',
    business_address: '',
    business_country_code: '',
    business_state: '',
  },
})
```

4. Replace all manual `<input>` elements with `<input {...register('field_name')} />` and use `<FormField error={errors.field_name?.message}>` for error display.

5. Replace the manual `handleSubmit` with `handleSubmit(onSubmit)` from react-hook-form.

6. Remove the manual `validate()` function, `errors` state, `submitted` state, and `set(field, value)` helper.

7. Handle country change to reset state:
```jsx
const countryCode = watch('business_country_code')
React.useEffect(() => {
  if (countryCode) setValue('business_state', '')
}, [countryCode, setValue])
```

CONSTRAINTS:
- Preserve all existing form fields and their order
- Preserve the server error display
- Preserve the "Already have an account?" and "View pricing plans" links
- Use the existing `selectStyle` from FormField for select elements
- Use the existing `FormField` component for all field wrappers
- Keep the same submission logic (registerBusiness API call)
- Keep the same toast.success notification on success
```

### Prompt #11: Add Skeleton Loading States to All List Pages

```
In the SmartBillr React frontend, add skeleton loading states to all list pages that currently show empty content during initial load.

TASK: Replace blank/empty states during loading with skeleton placeholders.

The project already has skeleton components:
- `SkeletonTable` from `frontend/src/shared/components/SkeletonTable.jsx`
- `SkeletonCard` from `frontend/src/shared/components/PremiumSkeleton.jsx`
- `MetricCard` already supports a `loading` prop

PAGES TO UPDATE:

1. `frontend/src/features/purchases/pages/PurchasesPage.jsx`
   - The metric cards already use `loading={isLoading}` — good
   - Wrap the table section in a loading check: when `isLoading` is true, show `<SkeletonTable rows={5} />` instead of the empty state or table
   - Keep the existing empty state for when data is actually empty

2. `frontend/src/features/payments/pages/PaymentsPage.jsx`
   - Same pattern — show skeleton during load

3. `frontend/src/features/expenses/pages/ExpensesPage.jsx`
   - Same pattern

4. `frontend/src/features/stock/pages/StockPage.jsx`
   - Same pattern for each tab

5. `frontend/src/features/sales/pages/SalesPage.jsx`
   - Same pattern

PATTERN:
Replace:
```jsx
{!isLoading && purchases.length === 0 ? (
  <BentoCard><EmptyState ... /></BentoCard>
) : (
  <BentoCard padding={false}>
    <Table ... />
  </BentoCard>
)}
```

With:
```jsx
{isLoading ? (
  <BentoCard padding={false}>
    <SkeletonTable rows={8} columns={5} />
  </BentoCard>
) : purchases.length === 0 ? (
  <BentoCard><EmptyState ... /></BentoCard>
) : (
  <BentoCard padding={false}>
    <Table ... />
  </BentoCard>
)}
```

CONSTRAINTS:
- Import `SkeletonTable` from shared components
- Use 8 rows as the default skeleton count (matches typical page size)
- Preserve all existing loading/error/empty state logic
- Don't show skeleton AND table at the same time
- Keep existing error banners visible during error state
- The skeleton should visually match the table layout (same column widths approximated)
```

### Prompt #13: Add Dirty Form Protection

```
In the SmartBillr React frontend, add form dirty state detection and navigation blocker to prevent users from accidentally losing unsaved work in create/edit forms.

TASK: Implement `useBlocker` from React Router and `beforeunload` event handler.

FILES TO MODIFY:
1. `frontend/src/features/sales/pages/CreateSalePage.jsx`
2. `frontend/src/features/purchases/pages/CreatePurchasePage.jsx`

IMPLEMENTATION:

In each create/edit form page, add:

```jsx
import { useBlocker } from 'react-router-dom'
import { useEffect, useCallback } from 'react'

// Inside the component, after the form hook:
const isDirty = form.formState.isDirty // or your equivalent dirty check

// Block navigation when form is dirty
const blocker = useBlocker(
  ({ currentLocation, nextLocation }) =>
    isDirty && currentLocation.pathname !== nextLocation.pathname
)

// Show confirmation dialog when navigation is blocked
useEffect(() => {
  if (blocker.state === 'blocked') {
    const confirmed = window.confirm(
      'You have unsaved changes. Are you sure you want to leave?'
    )
    if (confirmed) {
      blocker.proceed()
    } else {
      blocker.reset()
    }
  }
}, [blocker])

// Also handle browser tab close / refresh
useEffect(() => {
  const handler = (e) => {
    if (isDirty) {
      e.preventDefault()
      e.returnValue = '' // Chrome requires this
    }
  }
  window.addEventListener('beforeunload', handler)
  return () => window.removeEventListener('beforeunload', handler)
}, [isDirty])
```

CONSTRAINTS:
- Only block when the form is dirty (has unsaved changes)
- Use `window.confirm()` for the navigation blocker (simple and accessible)
- Clear dirty state after successful submission
- Don't block navigation within the same page (e.g., tab changes)
- Handle the case where the user clicks "Save" and the API call succeeds — don't show the blocker
- Test that the browser refresh/close warning works on Chrome, Firefox, Safari
```

---

*End of Report*
