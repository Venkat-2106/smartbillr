import { test, expect } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '.env') });

const LOGIN_EMAIL = process.env.E2E_LOGIN_EMAIL!;
const LOGIN_PASSWORD = process.env.E2E_LOGIN_PASSWORD!;

test.describe('Customers page', () => {
  test.beforeEach(async ({ page }) => {
  await page.goto('/login');
  await page.locator('input[type="email"]').fill(LOGIN_EMAIL);
  await page.locator('input[type="password"]').fill(LOGIN_PASSWORD);
  await page.getByRole('button', { name: /log in|sign in/i }).click();

  // Handle "Active session detected" dialog if it appears
  const signInAnyway = page.getByRole('button', { name: /sign in anyway/i });
  try {
    await signInAnyway.click({ timeout: 8000 });
  } catch {
    // Dialog never appeared — no active session, continue normally
  }

  await page.waitForURL('**/dashboard');
  });

  test('loads customer table with data', async ({ page }) => {
  await page.goto('/customers');
  await expect(page.getByText(/\d+ customers?/i)).toBeVisible();
  });

  test('shows Add Customer button for admin', async ({ page }) => {
    await page.goto('/customers');
    await expect(page.getByRole('button', { name: /add customer/i })).toBeVisible();
  });

  test('summary cards show correct counts', async ({ page }) => {
    await page.goto('/customers');
    await expect(page.getByText('Total').locator('..')).toContainText('1');
  });
});