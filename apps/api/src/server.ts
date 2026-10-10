import { createApp } from './app.js';
import { env, getConfigProblems } from './config/env.js';
import { closeDatabase, createPgDb, getPool } from './db/index.js';
import { runMigrations } from './db/migrate.js';
import { createDefaultDeps } from './deps.js';
import { backfillLegacyArtwork } from './services/maintenance.js';

async function start() {
  const { fatal, warnings } = getConfigProblems();
  for (const warning of warnings) console.warn(`Config warning: ${warning}`);
  if (fatal.length > 0) {
    console.error(`Cannot start the API: ${fatal.join(' ')}`);
    process.exit(1);
  }

  try {
    const applied = await runMigrations(createPgDb(getPool()));
    if (applied.length > 0) console.log(`Applied database migrations: ${applied.join(', ')}`);
  } catch (error) {
    console.error('Failed to prepare the database:', error);
    process.exit(1);
  }

  const deps = createDefaultDeps();
  const server = createApp(deps).listen(env.port, () => {
    console.log(`API listening on http://localhost:${env.port}`);
  });

  if (deps.storage) {
    backfillLegacyArtwork(deps.tracks, deps.storage)
      .then(({ moved, skipped }) => {
        if (moved || skipped) console.log(`Moved ${moved} legacy artwork image(s) to storage; skipped ${skipped}.`);
      })
      .catch((error: Error) => console.error('Artwork backfill failed:', error.message));
  }

  const shutdown = (signal: string) => {
    console.log(`${signal} received, shutting down`);
    setTimeout(() => process.exit(1), 10_000).unref();
    server.close(() => {
      void closeDatabase().finally(() => process.exit(0));
    });
  };
  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.once('SIGINT', () => shutdown('SIGINT'));
}

void start();
