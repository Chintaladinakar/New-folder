import { Pool, types, type PoolClient } from 'pg';
import { env } from '../config/env.js';

// int8 columns (counts, byte sizes) stay far below 2^53, so plain numbers are safe and easier to use.
types.setTypeParser(20, (value) => Number(value));

/** The small slice of a database connection the services need, so tests can run against PGlite. */
export interface Db {
  query<T>(text: string, params?: unknown[]): Promise<T[]>;
  /** Runs one or more statements without parameters (migration files). */
  exec(sql: string): Promise<void>;
  transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T>;
}

export async function queryOne<T>(db: Db, text: string, params: unknown[] = []): Promise<T | null> {
  const rows = await db.query<T>(text, params);
  return rows[0] ?? null;
}

function clientDb(client: PoolClient): Db {
  const db: Db = {
    async query<T>(text: string, params: unknown[] = []) {
      const result = await client.query(text, params);
      return result.rows as T[];
    },
    async exec(sql: string) {
      await client.query(sql);
    },
    // Already inside a transaction: run in the same one.
    transaction: (fn) => fn(db),
  };
  return db;
}

export function createPgDb(pool: Pool): Db {
  return {
    async query<T>(text: string, params: unknown[] = []) {
      const result = await pool.query(text, params);
      return result.rows as T[];
    },
    async exec(sql: string) {
      await pool.query(sql);
    },
    async transaction<T>(fn: (tx: Db) => Promise<T>) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await fn(clientDb(client));
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    },
  };
}

let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    if (!env.databaseUrl) {
      throw new Error('DATABASE_URL is not set');
    }
    pool = new Pool({
      connectionString: env.databaseUrl,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });
    // Neon drops idle connections. Without a listener, that 'error' event would crash the process.
    pool.on('error', (error) => {
      console.error('Idle database connection error:', error.message);
    });
  }
  return pool;
}

export async function closeDatabase(): Promise<void> {
  if (pool) {
    const current = pool;
    pool = null;
    await current.end();
  }
}

/** Postgres unique_violation, optionally for a specific constraint or index. */
export function isUniqueViolation(error: unknown, constraint?: string): boolean {
  const pgError = error as { code?: string; constraint?: string } | null;
  return pgError?.code === '23505' && (!constraint || pgError.constraint === constraint);
}
