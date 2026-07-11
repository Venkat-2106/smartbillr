import { Pool, PoolClient } from 'pg';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../backend/.env') });

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: 30000,
});

// Business ID injected after login; used to set RLS session variable.
let _businessId: string | null = null;

export function setBusinessId(id: string) {
  _businessId = id;
}

async function withRls<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (_businessId) {
      await client.query(`SET LOCAL app.current_business_id = '${_businessId}'`);
    }
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

export async function dbQuery<T = any>(text: string, params?: any[]): Promise<T[]> {
  return withRls(async (client) => {
    const { rows } = await client.query(text, params);
    return rows as T[];
  });
}

export async function dbQueryOne<T = any>(text: string, params?: any[]): Promise<T | null> {
  const rows = await dbQuery<T>(text, params);
  return rows[0] ?? null;
}

export async function dbExec(text: string, params?: any[]): Promise<void> {
  await withRls(async (client) => {
    await client.query(text, params);
  });
}

export async function dbEnd() {
  await pool.end();
}
