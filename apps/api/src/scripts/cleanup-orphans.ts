// Lists files in storage that no track points at (abandoned uploads, leftovers from failed deletes).
// Dry run by default; pass --delete to remove them. Files newer than 24 hours are ignored.
import { closeDatabase, createPgDb, getPool } from '../db/index.js';
import { findOrphanedObjects } from '../services/maintenance.js';
import { TrackService } from '../services/trackService.js';
import { createB2StorageOrNull } from '../storage/b2.js';

const shouldDelete = process.argv.includes('--delete');

try {
  const storage = createB2StorageOrNull();
  if (!storage) throw new Error('Storage is not configured; set the B2_* variables first.');

  const orphans = await findOrphanedObjects(new TrackService(createPgDb(getPool())), storage, 24 * 60 * 60 * 1000);
  const totalMb = orphans.reduce((sum, orphan) => sum + orphan.size, 0) / (1024 * 1024);

  for (const orphan of orphans) {
    if (shouldDelete) await storage.delete(orphan.key);
    console.log(`${shouldDelete ? 'deleted' : 'orphan '}  ${orphan.key}  (${(orphan.size / 1024).toFixed(0)} KB)`);
  }
  console.log(
    `${orphans.length} orphaned file(s), ${totalMb.toFixed(1)} MB.` +
      (shouldDelete || orphans.length === 0 ? '' : ' Run again with --delete to remove them.'),
  );
} catch (error) {
  console.error((error as Error).message);
  process.exitCode = 1;
} finally {
  await closeDatabase();
}
