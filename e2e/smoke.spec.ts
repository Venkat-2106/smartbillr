// e2e/smoke.spec.ts
import { test, expect } from '@playwright/test';
import { loginAsTestTenant, getTestBusiness } from './helpers/auth';

test('smoke: fresh test tenant can log in and reach dashboard', async ({ page }) => {
  const business = getTestBusiness();
  console.log('Testing with business_id:', business.business_id);

  await loginAsTestTenant(page);

  // We should now be on /dashboard with the shell rendered
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.locator('body')).toBeVisible();
});