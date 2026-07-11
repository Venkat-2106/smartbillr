import { test, expect } from '@playwright/test';
import { loginAsTestTenant, getTestBusiness } from './helpers/auth';
import { dbQuery, dbQueryOne, dbExec, dbEnd, setBusinessId } from './helpers/db';

const API = 'http://localhost:8000/v1';

// ── Shared state ─────────────────────────────────────────────────────────────

const business = getTestBusiness();
const ts = Date.now();
const CRUD_NAME = `E2E Cat ${ts}`;
const CRUD_NAME_EDIT = `E2E Cat ${ts} Edited`;
const SEED_PREFIX = 'E2E Scale';
const SEED_COUNT = 155;

let testUserId: string;
let testUserFullName: string;

// ── Helpers ──────────────────────────────────────────────────────────────────

async function getToken(page: import('@playwright/test').Page): Promise<string> {
  const token = await page.evaluate(() => {
    const raw = localStorage.getItem('sb-auth');
    if (!raw) return '';
    try { return JSON.parse(raw).state?.token ?? ''; } catch { return ''; }
  });
  if (!token) throw new Error('Auth token not found in localStorage');
  return token;
}

/**
 * Playwright's fill() sets the DOM value but React Hook Form's ref-based
 * state doesn't always pick it up inside a portal context. This helper
 * uses the native value setter + dispatches a React-compatible input event
 * so RHF's onChange fires and the form state updates.
 */
async function rhfFill(page: import('@playwright/test').Page, selector: string, value: string) {
  await page.evaluate(({ sel, val }) => {
    const el = document.querySelector(sel) as HTMLInputElement | null;
    if (!el) throw new Error(`Element not found: ${sel}`);
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    setter.call(el, val);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, { sel: selector, val: value });
}

async function apiGet(
  page: import('@playwright/test').Page,
  requestCtx: import('@playwright/test').APIRequestContext,
  path: string,
  params?: Record<string, string>,
) {
  const token = await getToken(page);
  const res = await requestCtx.get(`${API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    params,
  });
  expect(res.ok()).toBeTruthy();
  return res.json();
}

// ── Tests ────────────────────────────────────────────────────────────────────

test.describe.serial('Categories E2E', () => {

  test.beforeAll(async () => {
    setBusinessId(business.business_id);

    const profile = await dbQueryOne<{ id: string; full_name: string }>(
      `SELECT id::text, full_name FROM profiles
       WHERE business_id = $1::uuid AND role = 'admin' LIMIT 1`,
      [business.business_id],
    );
    if (!profile) throw new Error(
      `Profile not found for business ${business.business_id}`
    );
    testUserId = profile.id;
    testUserFullName = profile.full_name;
  });

  // ── 1. Create category via UI, verify via API ──────────────────────────────

  test('1 – Create category via UI, verify via API', async ({ page, request }) => {
    await loginAsTestTenant(page);
    await page.goto('/categories');

    await page.getByRole('button', { name: /add category/i }).click();
    await page.getByRole('dialog').waitFor({ state: 'visible' });

    const input = page.getByRole('dialog').locator('input[name="category_name"]');
    await input.waitFor({ state: 'visible' });

    // fill() sets the DOM value and dispatches input/change events.
    await input.fill(CRUD_NAME);

    // Click save — wait for POST response
    const [resp] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes('/v1/categories/') && r.request().method() === 'POST',
      ),
      page.getByRole('button', { name: /^save$/i }).click(),
    ]);
    console.log('POST response:', resp.status(), await resp.text().catch(()=>''));
    expect(resp.ok()).toBeTruthy();

    // Dialog should close on success
    await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 10000 });

    // Verify via API
    const data = await apiGet(page, request, '/categories/', { search: CRUD_NAME });
    const match = data.items.find((c: any) => c.category_name === CRUD_NAME);
    expect(match).toBeDefined();
    expect(match.category_name).toBe(CRUD_NAME);
  });

  // ── 2. Edit category via UI, verify updated_at + last_updated_by ───────────

  test('2 – Edit category via UI, verify updated_at and last_updated_by', async ({ page, request }) => {
    await loginAsTestTenant(page);
    await page.goto('/categories');

    const row = page.getByRole('row').filter({ hasText: CRUD_NAME });
    await row.getByRole('button', { name: /edit/i }).click();
    await page.getByRole('dialog').waitFor({ state: 'visible' });
    const editInput = page.getByRole('dialog').locator('input[name="category_name"]');
    await editInput.waitFor({ state: 'visible' });
    await editInput.fill(CRUD_NAME_EDIT);

    const respPromise = page.waitForResponse(
      (r) => r.url().includes('/v1/categories/') && r.request().method() === 'PUT',
    );
    await page.getByRole('button', { name: /^save$/i }).click();
    const resp = await respPromise;
    expect(resp.ok()).toBeTruthy();

    await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 10000 });

    const data = await apiGet(page, request, '/categories/', { search: CRUD_NAME_EDIT });
    const match = data.items.find((c: any) => c.category_name === CRUD_NAME_EDIT);
    expect(match).toBeDefined();
    expect(match.updated_at).toBeTruthy();
    expect(match.last_updated_by).toBe(testUserFullName);
  });

  // ── 3. Delete via UI, verify soft-delete via DB + exclusion from list ───────

  test('3 – Delete via UI, verify is_deleted via DB and excluded from list', async ({ page, request }) => {
    await loginAsTestTenant(page);
    await page.goto('/categories');

    const row = page.getByRole('row').filter({ hasText: CRUD_NAME_EDIT });
    await row.getByRole('button', { name: /delete/i }).click();
    const respPromise = page.waitForResponse(
      (r) => r.url().includes('/v1/categories/') && r.request().method() === 'DELETE',
    );
    await page.getByRole('button', { name: /yes, delete/i }).click();
    const resp = await respPromise;
    expect(resp.ok()).toBeTruthy();

    await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 10000 });

    const cat = await dbQueryOne<{ is_deleted: boolean }>(
      `SELECT is_deleted FROM categories
       WHERE category_name = $1 AND business_id = $2::uuid`,
      [CRUD_NAME_EDIT, business.business_id],
    );
    expect(cat).not.toBeNull();
    expect(cat!.is_deleted).toBe(true);

    const data = await apiGet(page, request, '/categories/', {});
    const found = data.items.some((c: any) => c.category_name === CRUD_NAME_EDIT);
    expect(found).toBe(false);
  });

  // ── 4. Add/Edit/Delete buttons visible for tenant owner ─────────────────────

  test('4 – Add/Edit/Delete buttons visible for tenant owner', async ({ page }) => {
    await loginAsTestTenant(page);
    await page.goto('/categories');

    await expect(page.getByRole('button', { name: /add category/i })).toBeVisible();
    const editBtn = page.getByRole('button', { name: /^edit$/i }).first();
    const deleteBtn = page.getByRole('button', { name: /^delete$/i }).first();
    await expect(editBtn).toBeVisible();
    await expect(deleteBtn).toBeVisible();
  });

  // ── 5. Seed 155 categories via direct SQL ───────────────────────────────────

  test('5 – Seed 155 categories via SQL insert', async () => {
    await dbQuery(
      `INSERT INTO categories (category_id, business_id, category_name, is_deleted, created_by, updated_by)
       SELECT
         gen_random_uuid(),
         $1::uuid,
         $2 || ' ' || LPAD(s.i::text, 3, '0'),
         false,
         $3::uuid,
         $3::uuid
       FROM generate_series(1, $4::int) AS s(i)`,
      [business.business_id, SEED_PREFIX, testUserId, SEED_COUNT],
    );

    const row = await dbQueryOne<{ cnt: string }>(
      `SELECT COUNT(*)::text AS cnt FROM categories
       WHERE business_id = $1::uuid
         AND is_deleted = false
         AND category_name LIKE $2 || '%'`,
      [business.business_id, SEED_PREFIX],
    );
    expect(Number(row!.cnt)).toBeGreaterThanOrEqual(SEED_COUNT);
  });

  // ── 6. Pagination API: total, no dupes, has_next/prev/total_pages ──────────

  test('6 – Pagination API correctness across all pages', async ({ page, request }) => {
    await loginAsTestTenant(page);

    const dbRow = await dbQueryOne<{ cnt: string }>(
      `SELECT COUNT(*)::text AS cnt FROM categories
       WHERE business_id = $1::uuid AND is_deleted = false`,
      [business.business_id],
    );
    const dbTotal = Number(dbRow!.cnt);

    const allIds = new Set<string>();
    let totalPages = 0;

    const first = await apiGet(page, request, '/categories/', { page: '1', limit: '20' });
    totalPages = first.pagination.total_pages;
    expect(first.pagination.total).toBe(dbTotal);
    expect(first.pagination.has_prev).toBe(false);
    expect(first.pagination.has_next).toBe(totalPages > 1);
    expect(first.pagination.total_pages).toBe(Math.ceil(dbTotal / 20));

    for (let p = 1; p <= totalPages; p++) {
      const data = await apiGet(page, request, '/categories/', { page: String(p), limit: '20' });
      expect(data.pagination.total).toBe(dbTotal);
      expect(data.pagination.page).toBe(p);
      expect(data.pagination.limit).toBe(20);
      expect(data.pagination.total_pages).toBe(totalPages);

      for (const item of data.items ?? []) {
        expect(allIds.has(item.category_id)).toBe(false);
        allIds.add(item.category_id);
      }

      if (p > 1 && p < totalPages) {
        expect(data.pagination.has_prev).toBe(true);
        expect(data.pagination.has_next).toBe(true);
      }
      if (p === totalPages && totalPages > 1) {
        expect(data.pagination.has_next).toBe(false);
        expect(data.pagination.has_prev).toBe(true);
      }
    }

    expect(allIds.size).toBe(dbTotal);
  });

  // ── 7. UI pagination visible, pages load distinct rows ──────────────────────

  test('7 – UI pagination visible, pages load distinct rows', async ({ page }) => {
    await loginAsTestTenant(page);
    await page.goto('/categories');

    await expect(page.getByText(/Page 1 of \d+/)).toBeVisible({ timeout: 10000 });

    const page1Rows = await page.locator('table tbody tr').allInnerTexts();
    expect(page1Rows.length).toBeGreaterThan(0);

    await page.locator('button.page-btn').filter({ hasText: /^2$/ }).click();
    await page.waitForResponse(
      (r) => r.url().includes('/v1/categories/') && r.url().includes('page=2'),
    );

    const page2Rows = await page.locator('table tbody tr').allInnerTexts();
    expect(page2Rows.length).toBeGreaterThan(0);

    const overlap = page1Rows.filter((t) => page2Rows.includes(t));
    expect(overlap).toHaveLength(0);
  });

  // ── 8. CSV export row count matches DB count ────────────────────────────────

  test('8 – CSV export row count matches DB count', async ({ page }) => {
    await loginAsTestTenant(page);
    await page.goto('/categories');

    const dbRow = await dbQueryOne<{ cnt: string }>(
      `SELECT COUNT(*)::text AS cnt FROM categories
       WHERE business_id = $1::uuid AND is_deleted = false`,
      [business.business_id],
    );
    const dbTotal = Number(dbRow!.cnt);

    const exportPromise = page.waitForResponse(
      (r) => r.url().includes('/v1/categories/') && r.url().includes('limit=10000'),
    );
    await page.getByRole('button', { name: /export csv/i }).click();
    const exportResp = await exportPromise;
    const body = await exportResp.json();

    expect(body.pagination.total).toBe(dbTotal);
    expect(body.items.length).toBe(dbTotal);
  });

  // ── Cleanup ────────────────────────────────────────────────────────────────

  test.afterAll(async () => {
    await dbQuery(
      `UPDATE categories SET is_deleted = true
       WHERE business_id = $1::uuid
         AND category_name LIKE $2 || '%'
         AND is_deleted = false`,
      [business.business_id, SEED_PREFIX],
    );
    await dbEnd();
  });
});
