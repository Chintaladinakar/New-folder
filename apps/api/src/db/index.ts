import { Pool } from 'pg';
import { env } from '../config/env.js';

export const pool = new Pool({
  connectionString: env.databaseUrl,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

export async function query<T>(text: string, params: unknown[] = []): Promise<T[]> {
  const result = await pool.query(text, params);
  return result.rows as T[];
}

export async function queryOne<T>(text: string, params: unknown[] = []): Promise<T | null> {
  const result = await pool.query(text, params);
  return (result.rows[0] as T | undefined) ?? null;
}

export async function testDatabaseConnection(): Promise<void> {
  await pool.query('SELECT 1');
}
