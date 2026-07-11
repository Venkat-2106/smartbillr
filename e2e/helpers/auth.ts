// e2e/helpers/auth.ts
import { Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const AUTH_FILE = path.resolve(__dirname, '../.auth/test-business.json');

export function getTestBusiness(): { email: string; password: string; business_id: string } {
  if (!fs.existsSync(AUTH_FILE)) {
    throw new Error(
      `Test business file not found at ${AUTH_FILE}. Did global setup run? (npx tsx e2e/global-setup.ts)`
    );
  }
  return JSON.parse(fs.readFileSync(AUTH_FILE, 'utf-8'));
}

export async function loginAsTestTenant(page: Page) {
  const { email, password } = getTestBusiness();

  await page.goto('/login');
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole('button', { name: /sign in to smartbillr/i }).click();

  // The "Active session detected" overlay has no role="dialog" — find the button directly.
  // Use .click() with timeout which auto-waits for the element to be visible + enabled.
  const signInAnyway = page.getByRole('button', { name: /sign in anyway/i });
  await signInAnyway.click({ timeout: 15000 }).catch(() => {
    // Button never appeared — no existing session conflict, login proceeds directly
  });

  // After clicking (or if there was no conflict), wait for navigation away from /login.
  // confirmSession → completeLogin makes 3 API calls that take ~10s total.
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 60000 });
}
