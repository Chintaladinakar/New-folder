// Applies pending database migrations. The server also does this on startup.
import { closeDatabase, createPgDb, getPool } from '../db/index.js';
import { runMigrations } from '../db/migrate.js';

try {
  const applied = await runMigrations(createPgDb(getPool()));
  console.log(applied.length > 0 ? `Applied: ${applied.join(', ')}` : 'Database is up to date.');
} catch (error) {
  console.error((error as Error).message);
  process.exitCode = 1;
} finally {
  await closeDatabase();
}
