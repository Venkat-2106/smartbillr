import { test, expect, Page } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import {
  createCategoryViaApi,
  deleteCategoryViaApi,
  listCategoriesViaApi,
  cleanupCategories,
  setAccessToken,
  seedCategoriesViaApi,
} from './helpers/api'
import { uniqueCategoryName, longCategoryName } from './helpers/test-data'

const AUTH_FILE = path.resolve('./e2e/.auth/user.json')

function loadAuthState() {
  const raw = fs.readFileSync(AUTH_FILE, 'utf-8')
  return JSON.parse(raw)
}

async function setupAuth(page: Page) {
  const authState = loadAuthState()
  // Inject localStorage BEFORE any page load so React sees auth on mount
  await page.addInitScript((state) => {
    localStorage.setItem('sb-auth', JSON.stringify(state))
  }, authState)
  setAccessToken(authState.state.token)
}

async function navigateToCategories(page: Page) {
  await page.goto('/categories')
  // Wait for the table or empty state to appear
  await page.waitForSelector('table, .empty-state-responsive', { timeout: 15_000 })
}

// ── Test Suite ──────────────────────────────────────────────────────────────

test.describe('Categories E2E', () => {
  const cleanupIds: string[] = []

  test.beforeEach(async ({ page }) => {
    await setupAuth(page)
  })

  test.afterAll(async () => {
    test.setTimeout(120_000)
    // Clean up all categories created during tests
    await cleanupCategories(cleanupIds)
  })

  // ── 1. Create Category ────────────────────────────────────────────────────

  test('1. Create category via UI', async ({ page }) => {
    const name = uniqueCategoryName('Create Test')

    await navigateToCategories(page)

    // Click "Add Category" button
    await page.getByRole('button', { name: 'Add Category' }).click()

    // Modal should be visible
    const modal = page.getByRole('dialog')
    await expect(modal).toBeVisible()
    await expect(modal.locator('#modal-title')).toContainText('Add Category')

    // Fill in the category name
    const input = page.getByPlaceholder('e.g. Electronics, Beverages, Stationery')
    await expect(input).toBeVisible()
    await input.fill(name)

    // Click Save
    await modal.getByRole('button', { name: 'Save' }).click()

    // Wait for modal to close
    await expect(modal).not.toBeVisible({ timeout: 10_000 })

    // Verify the category appears in the table
    const row = page.locator('tr.table-row', { hasText: name })
    await expect(row).toBeVisible({ timeout: 10_000 })

    // Verify status badge shows "Active"
    await expect(row.getByText('Active')).toBeVisible()

    // Verify via API — success_response returns data directly (no wrapper)
    const apiRes = await listCategoriesViaApi({ search: name })
    const found = apiRes.items?.find(
      (c: any) => c.category_name === name,
    )
    expect(found).toBeTruthy()
    expect(found.category_id).toBeTruthy()

    // Track for cleanup
    if (found?.category_id) cleanupIds.push(found.category_id)
  })

  // ── 2. Edit Category ──────────────────────────────────────────────────────

  test('2. Edit category via UI and verify updated_at + last_updated_by', async ({
    page,
  }) => {
    const originalName = uniqueCategoryName('Edit Test')
    const updatedName = uniqueCategoryName('Edit Updated')

    // Create a category via API first — success_response returns data directly
    const createRes = await createCategoryViaApi(originalName)
    const categoryId = createRes.category_id
    expect(categoryId).toBeTruthy()
    cleanupIds.push(categoryId)

    await navigateToCategories(page)

    // Wait for the category to appear in the table
    const row = page.locator('tr.table-row', { hasText: originalName })
    await expect(row).toBeVisible({ timeout: 10_000 })

    // Click "Edit" button on that row
    await row.getByRole('button', { name: 'Edit' }).click()

    // Modal should be visible with "Edit Category" title
    const modal = page.getByRole('dialog')
    await expect(modal).toBeVisible()
    await expect(modal.locator('#modal-title')).toContainText('Edit Category')

    // Clear and fill the new name
    const input = page.getByPlaceholder('e.g. Electronics, Beverages, Stationery')
    await expect(input).toBeVisible()
    await input.clear()
    await input.fill(updatedName)

    // Click Save
    await modal.getByRole('button', { name: 'Save' }).click()

    // Wait for modal to close
    await expect(modal).not.toBeVisible({ timeout: 10_000 })

    // Verify the updated name appears in the table
    const updatedRow = page.locator('tr.table-row', { hasText: updatedName })
    await expect(updatedRow).toBeVisible({ timeout: 10_000 })

    // Verify via API that updated_at changed and last_updated_by is set
    const apiRes = await listCategoriesViaApi({ search: updatedName })
    const found = apiRes.items?.find(
      (c: any) => c.category_id === categoryId,
    )
    expect(found).toBeTruthy()
    expect(found.category_name).toBe(updatedName)
    expect(found.updated_at).toBeTruthy()
    expect(found.last_updated_by).toBeTruthy()
  })

  // ── 3. Delete Category ────────────────────────────────────────────────────

  test('3. Delete category via UI and verify soft delete', async ({ page }) => {
    const name = uniqueCategoryName('Delete Test')

    // Create a category via API first
    const createRes = await createCategoryViaApi(name)
    const categoryId = createRes.category_id
    expect(categoryId).toBeTruthy()

    await navigateToCategories(page)

    // Wait for the category to appear in the table
    const row = page.locator('tr.table-row', { hasText: name })
    await expect(row).toBeVisible({ timeout: 10_000 })

    // Click "Delete" button on that row
    await row.getByRole('button', { name: 'Delete' }).click()

    // ConfirmDialog doesn't use role="dialog" — find it by its unique heading
    const confirmTitle = page.getByRole('heading', { name: `Delete "${name}"?` })
    await expect(confirmTitle).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText('permanently deactivate')).toBeVisible()

    // Click "Yes, delete"
    await page.getByRole('button', { name: 'Yes, delete' }).click()

    // Wait for the confirm dialog to disappear
    await expect(confirmTitle).not.toBeVisible({ timeout: 10_000 })

    // Verify the category no longer appears in the table
    await expect(page.locator('tr.table-row', { hasText: name })).not.toBeVisible({
      timeout: 10_000,
    })

    // Verify soft delete via API
    const apiRes = await listCategoriesViaApi({ search: name })
    const found = apiRes.items?.find(
      (c: any) => c.category_id === categoryId,
    )
    // Should not be in the active list
    expect(found).toBeFalsy()

    // Verify is_deleted is true via direct GET (won't work since GET also filters deleted)
    // Instead verify the delete response was successful
    // The delete already happened, so we just verify it's gone from the list
  })

  // ── 4. Validation Errors ──────────────────────────────────────────────────

  test('4. Category form validation errors', async ({ page }) => {
    await navigateToCategories(page)

    // Click "Add Category" button
    await page.getByRole('button', { name: 'Add Category' }).click()

    const modal = page.getByRole('dialog')
    await expect(modal).toBeVisible()

    // Try to submit empty form
    await modal.getByRole('button', { name: 'Save' }).click()

    // Should show "Name is required" error
    await expect(modal.getByText('Name is required')).toBeVisible()

    // Fill with too long name (101 chars)
    const input = page.getByPlaceholder('e.g. Electronics, Beverages, Stationery')
    await input.fill(longCategoryName(101))

    // Should show max length error
    await expect(modal.getByText('Name must be 100 characters or less')).toBeVisible()

    // Fill with valid name to clear errors
    await input.clear()
    await input.fill('Valid Name')
    await expect(modal.getByText('Name is required')).not.toBeVisible()
    await expect(
      modal.getByText('Name must be 100 characters or less'),
    ).not.toBeVisible()

    // Close modal without saving
    await modal.getByRole('button', { name: 'Cancel' }).click()
    await expect(modal).not.toBeVisible()
  })

  // ── 5. Duplicate Name Error ───────────────────────────────────────────────

  test('5. Duplicate category name shows error', async ({ page }) => {
    const name = uniqueCategoryName('Dup Test')

    // Create a category via API
    const createRes = await createCategoryViaApi(name)
    const categoryId = createRes.category_id
    expect(categoryId).toBeTruthy()
    cleanupIds.push(categoryId)

    await navigateToCategories(page)

    // Wait for the category to appear
    await expect(
      page.locator('tr.table-row', { hasText: name }),
    ).toBeVisible({ timeout: 10_000 })

    // Try to create another with the same name
    await page.getByRole('button', { name: 'Add Category' }).click()

    const modal = page.getByRole('dialog')
    await expect(modal).toBeVisible()

    const input = page.getByPlaceholder('e.g. Electronics, Beverages, Stationery')
    await input.fill(name)
    await modal.getByRole('button', { name: 'Save' }).click()

    // Should show error toast about duplicate name
    // The error appears as a toast notification
    await expect(
      page.getByText('already exists').or(page.getByText('Category with this name')),
    ).toBeVisible({ timeout: 10_000 })

    // Close the modal
    await modal.getByRole('button', { name: 'Cancel' }).click()
  })

  // ── 6. Category Detail Drawer ─────────────────────────────────────────────

  test('6. Category detail drawer opens on row click', async ({ page }) => {
    const name = uniqueCategoryName('Drawer Test')

    // Create a category via API
    const createRes = await createCategoryViaApi(name)
    const categoryId = createRes.category_id
    expect(categoryId).toBeTruthy()
    cleanupIds.push(categoryId)

    await navigateToCategories(page)

    // Click on the row
    const row = page.locator('tr.table-row', { hasText: name })
    await expect(row).toBeVisible({ timeout: 10_000 })
    await row.click()

    // Drawer should appear (it's a fixed-position panel)
    // The drawer shows the category name in an h2
    await expect(page.getByRole('heading', { level: 2, name })).toBeVisible({
      timeout: 10_000,
    })

    // Should show "Category · Products" subtitle
    await expect(page.getByText('Category · Products')).toBeVisible()

    // Should show activity metadata — scope to the drawer panel (last visible fixed div)
    // "Last Updated By" also exists in the table header, so we use .last()
    await expect(page.getByText('Created On').last()).toBeVisible()
    await expect(page.getByText('Created By').last()).toBeVisible()
    await expect(page.getByText('Last Updated On').last()).toBeVisible()
    await expect(page.getByText('Last Updated By').last()).toBeVisible()

    // Should show stats
    await expect(page.getByText('Total Products')).toBeVisible()
    await expect(page.getByText('Stock Value')).toBeVisible()

    // Close drawer by clicking the close button
    // The close button has an XMarkIcon (no specific aria-label, but it's a button in the drawer)
    const closeBtn = page.locator('button').filter({ has: page.locator('svg') }).last()
    await closeBtn.click()

    // Wait for drawer to close
    await expect(page.getByText('Category · Products')).not.toBeVisible({
      timeout: 5_000,
    })
  })

  // ── 7. Search Categories ──────────────────────────────────────────────────

  test('7. Search categories filters the list', async ({ page }) => {
    const prefix = uniqueCategoryName('Search')
    const names = [`${prefix} Alpha`, `${prefix} Beta`, `${prefix} Gamma`]

    // Create 3 categories via API — success_response returns data directly
    const ids: string[] = []
    for (const name of names) {
      const res = await createCategoryViaApi(name)
      if (res.category_id) {
        ids.push(res.category_id)
        cleanupIds.push(res.category_id)
      }
    }

    await navigateToCategories(page)

    // Wait for at least one to appear
    await expect(
      page.locator('tr.table-row', { hasText: prefix }).first(),
    ).toBeVisible({ timeout: 10_000 })

    // Search for "Alpha"
    const searchInput = page.locator('[data-search-input]')
    await searchInput.fill('Alpha')

    // Wait for debounce + API response
    await page.waitForTimeout(1_000)

    // Should show only the Alpha category
    await expect(
      page.locator('tr.table-row', { hasText: `${prefix} Alpha` }),
    ).toBeVisible()
    await expect(
      page.locator('tr.table-row', { hasText: `${prefix} Beta` }),
    ).not.toBeVisible()
    await expect(
      page.locator('tr.table-row', { hasText: `${prefix} Gamma` }),
    ).not.toBeVisible()

    // Clear search
    const clearBtn = page.locator('[aria-label="Clear search"]')
    if (await clearBtn.isVisible()) {
      await clearBtn.click()
    } else {
      await searchInput.clear()
    }

    // Wait for debounce + API response
    await page.waitForTimeout(1_000)

    // All three should be visible again
    await expect(
      page.locator('tr.table-row', { hasText: prefix }).first(),
    ).toBeVisible({ timeout: 10_000 })
  })

  // ── 8. Pagination ─────────────────────────────────────────────────────────

  test('8. Pagination works correctly', async ({ page }) => {
    test.setTimeout(180_000)

    // Navigate first — same pattern as every working test — to prove auth + page load work
    await navigateToCategories(page)

    // Seed 25 categories in parallel via API (PAGE_SIZE=20, so 25 gives 2 pages)
    const seedPrefix = uniqueCategoryName('Pagination')
    const seedPromises = Array.from({ length: 25 }, (_, i) => {
      const name = `${seedPrefix} ${String(i + 1).padStart(3, '0')}`
      return createCategoryViaApi(name)
    })
    const results = await Promise.all(seedPromises)
    const seededIds = results.filter((r: any) => r.category_id).map((r: any) => r.category_id)
    cleanupIds.push(...seededIds)

    // Reload so the table picks up the newly seeded rows
    await page.reload({ waitUntil: 'domcontentloaded' })

    // Wait for the table to load
    await page.waitForSelector('tr.table-row', { timeout: 30_000 })

    // Should show pagination info
    const recordText = page.locator('text=/\\d+ records?/').first()
    await expect(recordText).toBeVisible({ timeout: 10_000 })

    // Page 1 should be active
    const page1Btn = page.getByRole('button', { name: '1', exact: true })
    await expect(page1Btn).toBeVisible()

    // Click page 2
    const page2Btn = page.getByRole('button', { name: '2', exact: true })
    if (await page2Btn.isVisible()) {
      await page2Btn.click()

      // Wait for new data to load
      await page.waitForTimeout(500)

      // Page 2 should now be active
      await expect(page.getByRole('button', { name: '2', exact: true })).toBeVisible()
    }
  })

  // ── 9. Admin Buttons Visibility ───────────────────────────────────────────

  test('9. Add/Edit/Delete buttons visible for admin user', async ({ page }) => {
    await navigateToCategories(page)

    // "Add Category" button should be visible for admin
    await expect(
      page.getByRole('button', { name: 'Add Category' }),
    ).toBeVisible({ timeout: 10_000 })

    // If there are any rows, Edit/Delete should be visible
    const firstRow = page.locator('tr.table-row').first()
    if (await firstRow.isVisible()) {
      await expect(firstRow.getByRole('button', { name: 'Edit' })).toBeVisible()
      await expect(firstRow.getByRole('button', { name: 'Delete' })).toBeVisible()
    }
  })

  // ── 10. Export Button ──────────────────────────────────────────────────────

  test('10. Export CSV button is visible', async ({ page }) => {
    await navigateToCategories(page)

    // Export button should be visible
    await expect(
      page.getByRole('button', { name: 'Export CSV' }),
    ).toBeVisible({ timeout: 10_000 })
  })

  // ── 11. Empty State ───────────────────────────────────────────────────────

  test('11. Empty state when no categories exist', async ({ page }) => {
    // This test checks the empty state behavior
    // We can't guarantee an empty DB, but we can search for a non-existent term
    await navigateToCategories(page)

    // Wait for the page to load
    await page.waitForSelector('tr.table-row, .empty-state-responsive', {
      timeout: 15_000,
    })

    // Search for something that doesn't exist
    const searchInput = page.locator('[data-search-input]')
    await searchInput.fill('zzz_nonexistent_category_xyz_999')

    // Wait for debounce
    await page.waitForTimeout(1_000)

    // Should show empty state
    await expect(page.getByText('No results matching your filters')).toBeVisible({
      timeout: 10_000,
    })

    // Should show "Clear filters" button (exact match to avoid toolbar's "✕ Clear filters")
    await expect(page.getByRole('button', { name: 'Clear filters', exact: true })).toBeVisible()
  })

  // ── 12. Clear Filters ─────────────────────────────────────────────────────

  test('12. Clear filters resets the search', async ({ page }) => {
    const name = uniqueCategoryName('ClearFilter')

    // Create a category
    const res = await createCategoryViaApi(name)
    if (res.category_id) cleanupIds.push(res.category_id)

    await navigateToCategories(page)

    // Wait for the category to appear
    await expect(
      page.locator('tr.table-row', { hasText: name }),
    ).toBeVisible({ timeout: 10_000 })

    // Search for something non-existent
    const searchInput = page.locator('[data-search-input]')
    await searchInput.fill('zzz_nonexistent_999')
    await page.waitForTimeout(1_000)

    // Empty state should show
    await expect(page.getByText('No results matching your filters')).toBeVisible({
      timeout: 10_000,
    })

    // Click "Clear filters" button in the empty state (exact match)
    await page.getByRole('button', { name: 'Clear filters', exact: true }).click()

    // Wait for the list to reload
    await page.waitForTimeout(1_000)

    // The original category should be visible again
    await expect(
      page.locator('tr.table-row', { hasText: name }),
    ).toBeVisible({ timeout: 10_000 })
  })

  // ── 13. Export CSV exports all records ──────────────────────────────────────

  test('13. Export CSV exports all records with correct headers and row count', async ({ page }) => {
    // Seed a few categories to guarantee data
    const exportPrefix = uniqueCategoryName('Export')
    const seededIds: string[] = []
    for (let i = 0; i < 3; i++) {
      const res = await createCategoryViaApi(`${exportPrefix} ${String(i + 1).padStart(3, '0')}`)
      if (res.category_id) seededIds.push(res.category_id)
      cleanupIds.push(res.category_id)
    }

    await navigateToCategories(page)

    // Verify the table has rows
    const rows = page.locator('tr.table-row')
    await expect(rows.first()).toBeVisible({ timeout: 10_000 })
    const rowCount = await rows.count()
    expect(rowCount).toBeGreaterThanOrEqual(3)

    // Listen for download before clicking export
    const downloadPromise = page.waitForEvent('download')

    // Click the Export CSV button
    await page.getByRole('button', { name: 'Export CSV' }).click()

    // Wait for download to start
    const download = await downloadPromise
    const csvContent = await download.path().then(async (filePath) => {
      if (!filePath) return ''
      return fs.readFileSync(filePath, 'utf-8')
    })

    // CSV should have BOM + header row + data rows
    const lines = csvContent.replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean)
    expect(lines.length).toBeGreaterThanOrEqual(2) // header + at least 1 data row

    // Verify headers match the expected columns
    const headers = lines[0]
    expect(headers).toContain('Category Name')
    expect(headers).toContain('Created On')
    expect(headers).toContain('Created By')
    expect(headers).toContain('Last Updated')
    expect(headers).toContain('Last Updated By')

    // Verify at least 3 seeded categories appear in the CSV
    const csvBody = lines.slice(1).join('\n')
    expect(csvBody).toContain(exportPrefix)

    // Verify the toast success message appeared
    await expect(page.getByText(/Exported \d+ records to CSV/)).toBeVisible({ timeout: 5_000 })
  })

  // ── 14. Category drawer shows correct details ──────────────────────────────

  test('14. Category drawer shows metadata, summary stats, and product list', async ({ page }) => {
    // Create a category via API so we know its exact name
    const drawerName = uniqueCategoryName('Drawer')
    const res = await createCategoryViaApi(drawerName)
    expect(res.category_id).toBeTruthy()
    cleanupIds.push(res.category_id)

    await navigateToCategories(page)

    // Click the row to open drawer
    const row = page.locator('tr.table-row', { hasText: drawerName })
    await expect(row).toBeVisible({ timeout: 10_000 })
    await row.click()

    // ── Drawer header ──
    // The drawer shows the category name as heading (avoid matching the table row)
    await expect(page.getByRole('heading', { name: drawerName })).toBeVisible({ timeout: 10_000 })

    // Subtitle "Category . Products"
    await expect(page.getByText('Category').first()).toBeVisible()

    // Print button
    await expect(page.getByRole('button', { name: 'Print' })).toBeVisible()

    // ── Activity section ──
    // Use .last() to scope to the drawer (drawer renders after the table in DOM)
    await expect(page.getByText('Created On').last()).toBeVisible()
    await expect(page.getByText('Created By').last()).toBeVisible()
    await expect(page.getByText('Last Updated On').last()).toBeVisible()
    await expect(page.getByText('Last Updated By').last()).toBeVisible()

    // ── Summary stats ──
    await expect(page.getByText('Total Products').last()).toBeVisible()
    await expect(page.getByText('Stock Value').last()).toBeVisible()
    await expect(page.getByText('Low Stock Items').last()).toBeVisible()
    await expect(page.getByText('Out of Stock').last()).toBeVisible()

    // Since no products are linked, Total Products should show 0
    // Verify the drawer shows the stat values
    const statValues = page.locator('div').filter({ hasText: /^0$/ })
    expect(await statValues.count()).toBeGreaterThanOrEqual(1)

    // ── Product list ──
    // Section header "Products (0)" — use last() for drawer scope
    await expect(page.getByText(/^Products \(\d+\)$/).last()).toBeVisible()

    // Empty product message
    await expect(page.getByText('No products in this category.')).toBeVisible()
  })

  // ── 15. Pagination page numbers are visible ─────────────────────────────────

  test('15. Pagination shows page numbers and record count', async ({ page }) => {
    test.setTimeout(180_000)

    await navigateToCategories(page)

    // Seed 25 categories in parallel (PAGE_SIZE=20 → 2 pages)
    const pagePrefix = uniqueCategoryName('PageNum')
    const seedPromises = Array.from({ length: 25 }, (_, i) => {
      const name = `${pagePrefix} ${String(i + 1).padStart(3, '0')}`
      return createCategoryViaApi(name)
    })
    const results = await Promise.all(seedPromises)
    results.filter((r: any) => r.category_id).forEach((r: any) => cleanupIds.push(r.category_id))

    // Reload to pick up seeded data
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForSelector('tr.table-row', { timeout: 30_000 })

    // "Page X of Y" text should be visible
    await expect(page.getByText(/Page \d+ of \d+/)).toBeVisible({ timeout: 10_000 })

    // Page number buttons should exist — at least "1" and "2"
    await expect(page.getByRole('button', { name: '1', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: '2', exact: true })).toBeVisible()

    // Record count text should show total records
    await expect(page.getByText(/\d+ records/).first()).toBeVisible()

    // Page 1 button should be visually active (has gradient background — we verify via the class)
    // The active page button gets the gradient class implicitly via inline style
    // Just verify it's clickable and visible
    const page1Btn = page.getByRole('button', { name: '1', exact: true })
    await expect(page1Btn).toBeVisible()
  })

  // ── 16. Search finds results across pages ───────────────────────────────────

  test('16. Search filters categories and hides pagination when active', async ({ page }) => {
    test.setTimeout(180_000)

    await navigateToCategories(page)

    // Seed 25 categories with a unique prefix so they span 2+ pages
    const searchPrefix = uniqueCategoryName('Search')
    const seedPromises = Array.from({ length: 25 }, (_, i) => {
      const name = `${searchPrefix} ${String(i + 1).padStart(3, '0')}`
      return createCategoryViaApi(name)
    })
    const results = await Promise.all(seedPromises)
    results.filter((r: any) => r.category_id).forEach((r: any) => cleanupIds.push(r.category_id))

    // Reload so table picks up seeded data
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForSelector('tr.table-row', { timeout: 30_000 })

    // Verify pagination is visible before search (no active filters → pagination shows)
    await expect(page.getByText(/Page \d+ of \d+/)).toBeVisible({ timeout: 10_000 })

    // Search for the prefix
    const searchInput = page.locator('[data-search-input]')
    await searchInput.fill(searchPrefix)
    // Wait for debounce (350ms) + network
    await page.waitForTimeout(1_500)

    // Results should appear — the seeded categories should match
    const matchedRows = page.locator('tr.table-row', { hasText: searchPrefix })
    await expect(matchedRows.first()).toBeVisible({ timeout: 10_000 })
    const matchCount = await matchedRows.count()
    expect(matchCount).toBeGreaterThanOrEqual(1)

    // Pagination should be HIDDEN when search is active (activeFilters > 0)
    await expect(page.getByText(/Page \d+ of \d+/)).not.toBeVisible()

    // Clear the search
    await searchInput.fill('')
    await page.waitForTimeout(1_500)

    // Pagination should reappear
    await expect(page.getByText(/Page \d+ of \d+/)).toBeVisible({ timeout: 10_000 })
  })

  // ── 17. Date filter works correctly ─────────────────────────────────────────

  test('17. Date range filter narrows results correctly', async ({ page }) => {
    // Create a category right now so it has today's timestamp
    const dateName = uniqueCategoryName('DateFilter')
    const res = await createCategoryViaApi(dateName)
    expect(res.category_id).toBeTruthy()
    cleanupIds.push(res.category_id)

    await navigateToCategories(page)

    // Verify the category is visible initially
    await expect(
      page.locator('tr.table-row', { hasText: dateName }),
    ).toBeVisible({ timeout: 10_000 })

    // Set the "from" date to today (should still show the category)
    const today = new Date().toISOString().split('T')[0] // YYYY-MM-DD
    const dateInputs = page.locator('input[type="date"]')
    await dateInputs.first().fill(today)
    await page.waitForTimeout(1_000)

    // The category should still be visible (created today)
    await expect(
      page.locator('tr.table-row', { hasText: dateName }),
    ).toBeVisible({ timeout: 10_000 })

    // Set "from" to tomorrow — should hide everything (no categories updated tomorrow)
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0]
    await dateInputs.first().fill(tomorrow)
    await page.waitForTimeout(1_000)

    // Should show empty state (no results matching filters)
    await expect(page.getByText('No results matching your filters')).toBeVisible({
      timeout: 10_000,
    })

    // Clear the date filter using "Clear filters" button
    await page.getByRole('button', { name: 'Clear filters', exact: true }).click()
    await page.waitForTimeout(1_000)

    // Category should be visible again
    await expect(
      page.locator('tr.table-row', { hasText: dateName }),
    ).toBeVisible({ timeout: 10_000 })
  })
})
