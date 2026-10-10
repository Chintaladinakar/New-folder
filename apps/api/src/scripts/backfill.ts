// Upgrades data created by older versions:
//   --artwork  move base64 cover art from the database into storage
//   --hashes   compute content hashes so older tracks get duplicate detection (downloads every file)
// With no flags, does both.
import { closeDatabase, createPgDb, getPool } from '../db/index.js';
import { runMigrations } from '../db/migrate.js';
import { backfillContentHashes, backfillLegacyArtwork } from '../services/maintenance.js';
import { TrackService } from '../services/trackService.js';
import { createB2StorageOrNull } from '../storage/b2.js';

const flags = new Set(process.argv.slice(2));
const all = !flags.has('--artwork') && !flags.has('--hashes');

try {
  const storage = createB2StorageOrNull();
  if (!storage) throw new Error('Storage is not configured; set the B2_* variables first.');

  const db = createPgDb(getPool());
  await runMigrations(db);
  const tracks = new TrackService(db);

  if (all || flags.has('--artwork')) {
    const { moved, skipped } = await backfillLegacyArtwork(tracks, storage);
    console.log(`Artwork: moved ${moved}, skipped ${skipped} unreadable image(s).`);
  }
  if (all || flags.has('--hashes')) {
    const { hashed, duplicates, failed } = await backfillContentHashes(tracks, storage);
    console.log(`Hashes: computed ${hashed}, found ${duplicates} duplicate(s), ${failed} failed.`);
  }
} catch (error) {
  console.error((error as Error).message);
  process.exitCode = 1;
} finally {
  await closeDatabase();
}
