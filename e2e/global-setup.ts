// e2e/global-setup.ts
import { request } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const API_URL = process.env.E2E_API_URL || 'http://localhost:8000';
const AUTH_FILE = path.resolve(__dirname, '.auth/test-business.json');

export default async function globalSetup() {
  if (fs.existsSync(AUTH_FILE)) {
    console.log('ℹ️  Reusing existing test business from', AUTH_FILE);
    return;
  }

  const stamp = Date.now();
  const email = `e2e_${stamp}@test.smartbillr.dev`;
  const password = 'TestPass123!';

  const payload = {
    business_name: `E2E Test Business ${stamp}`,
    owner_name: 'E2E Test Owner',
    owner_email: email,
    owner_password: password,
    business_country_code: 'IN',
    business_state: 'Tamil Nadu',
  };

  const ctx = await request.newContext({ baseURL: API_URL });
  const res = await ctx.post('/v1/business', { data: payload });
  if (!res.ok()) {
    const body = await res.text();
    throw new Error(`Global setup: business registration failed (${res.status()}): ${body}`);
  }

  const data = await res.json();

  fs.mkdirSync(path.dirname(AUTH_FILE), { recursive: true });
  fs.writeFileSync(
    AUTH_FILE,
    JSON.stringify(
      {
        email,
        password,
        business_id: data.business_id,
      },
      null,
      2
    )
  );

  await ctx.dispose();

  console.log('✅ Test business created successfully');
  console.log(JSON.stringify({ email, business_id: data.business_id }, null, 2));
}

// Allows running this file directly (e.g. `npx tsx e2e/global-setup.ts`).
// Playwright calls the default export directly and won't hit this block.
if (require.main === module) {
  globalSetup().catch((err) => {
    console.error('❌ Global setup failed:', err);
    process.exit(1);
  });
}