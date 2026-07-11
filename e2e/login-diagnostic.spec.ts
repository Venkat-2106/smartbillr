import { test, expect } from '@playwright/test';
import { getTestBusiness } from './helpers/auth';

test('Login after session confirm', async ({ page }) => {
  test.setTimeout(120000);
  const { email, password } = getTestBusiness();

  page.on('response', async (res) => {
    const url = res.url();
    if (url.includes('localhost:8000')) {
      console.log(`  [NET] ${res.status()} ${res.url().replace('http://localhost:8000', '').substring(0, 100)}`);
    }
  });
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) {
      console.log(`  [NAV] → ${frame.url().substring(0, 120)}`);
    }
  });

  await page.goto('/login');
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole('button', { name: /sign in to smartbillr/i }).click();
  console.log('Clicked login');

  // Wait for the "Sign in anyway" button to appear
  const signInAnyway = page.getByRole('button', { name: /sign in anyway/i });
  await signInAnyway.waitFor({ state: 'visible', timeout: 15000 });
  console.log('"Sign in anyway" visible — clicking');
  await signInAnyway.click();
  console.log('Clicked "Sign in anyway" — monitoring...');

  // Monitor every 2s
  for (let i = 0; i < 30; i++) {
    await page.waitForTimeout(2000);
    const url = page.url();
    console.log(`[${i * 2}s] URL: ${url}`);
    if (!url.includes('/login')) {
      console.log('SUCCESS — navigated away from login');
      break;
    }
  }
});
