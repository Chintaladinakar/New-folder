import { readdir, readFile } from 'fs/promises';
import { join, resolve } from 'path';
import { projectRoot } from '../config/env.js';
import type { Db } from './index.js';

export const defaultMigrationsDir = resolve(projectRoot, 'database/schema');

// Arbitrary constant shared by every instance, so two servers starting together don't both migrate.
const MIGRATION_LOCK_ID = 727_001;

/**
 * Applies every database/schema/*.sql file that has not run yet, in filename order, inside one
 * transaction. Returns the names of the files it applied.
 */
export async function runMigrations(db: Db, dir = defaultMigrationsDir): Promise<string[]> {
  const files = (await readdir(dir)).filter((name) => name.endsWith('.sql')).sort();

  return db.transaction(async (tx) => {
    await tx.query('SELECT pg_advisory_xact_lock($1)', [MIGRATION_LOCK_ID]);
    await tx.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const appliedRows = await tx.query<{ name: string }>('SELECT name FROM schema_migrations');
    const applied = new Set(appliedRows.map((row) => row.name));
    const pending = files.filter((name) => !applied.has(name));

    for (const name of pending) {
      const sql = await readFile(join(dir, name), 'utf8');
      try {
        await tx.exec(sql);
      } catch (error) {
        throw new Error(`Migration ${name} failed: ${(error as Error).message}`);
      }
      await tx.query('INSERT INTO schema_migrations (name) VALUES ($1)', [name]);
    }

    return pending;
  });
}
