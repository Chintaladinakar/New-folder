import { queryOne, type Db } from '../db/index.js';
import type { PlaylistEntryRecord, PlaylistRecord } from '../types/playlist.js';
import type { TrackRecord } from '../types/track.js';
import { trackColumns, trackJoins } from './trackService.js';

const PLAYLIST_SUMMARY = `
  SELECT
    p.id,
    p.name,
    p.description,
    COUNT(t.id)::int AS "trackCount",
    COALESCE(SUM(t.duration), 0)::int AS duration,
    (ARRAY_AGG(t.artwork_key ORDER BY pt.position) FILTER (WHERE t.artwork_key IS NOT NULL))[1] AS "artworkKey",
    p.created_at AS "createdAt",
    p.updated_at AS "updatedAt"
  FROM playlists p
  LEFT JOIN playlist_tracks pt ON pt.playlist_id = p.id
  LEFT JOIN tracks t ON t.id = pt.track_id
`;

/**
 * Playlists belong to one account. Every method takes the account and only ever touches its
 * playlists: someone else's playlist id behaves exactly like one that doesn't exist.
 */
export class PlaylistService {
  constructor(private readonly db: Db) {}

  async listPlaylists(ownerId: string): Promise<PlaylistRecord[]> {
    return this.db.query<PlaylistRecord>(
      `${PLAYLIST_SUMMARY} WHERE p.owner_id = $1 GROUP BY p.id ORDER BY lower(p.name), p.created_at`,
      [ownerId],
    );
  }

  async getPlaylist(id: string, ownerId: string): Promise<PlaylistRecord | null> {
    return queryOne<PlaylistRecord>(this.db, `${PLAYLIST_SUMMARY} WHERE p.id = $1 AND p.owner_id = $2 GROUP BY p.id`, [id, ownerId]);
  }

  async getEntries(id: string, ownerId: string): Promise<PlaylistEntryRecord[]> {
    const rows = await this.db.query<TrackRecord & { entryId: string; position: number }>(
      `SELECT pt.id AS "entryId", pt.position, ${trackColumns('t')}
       FROM playlist_tracks pt
       JOIN playlists p ON p.id = pt.playlist_id AND p.owner_id = $2
       JOIN tracks t ON t.id = pt.track_id
       ${trackJoins('t', '$2')}
       WHERE pt.playlist_id = $1
       ORDER BY pt.position, pt.added_at`,
      [id, ownerId],
    );
    return rows.map(({ entryId, position, ...track }) => ({ entryId, position, track }));
  }

  async createPlaylist(ownerId: string, name: string, description: string | null): Promise<PlaylistRecord> {
    const row = await queryOne<{ id: string }>(
      this.db,
      'INSERT INTO playlists (owner_id, name, description) VALUES ($1, $2, $3) RETURNING id',
      [ownerId, name, description],
    );
    return (await this.getPlaylist(row!.id, ownerId)) as PlaylistRecord;
  }

  async updatePlaylist(
    id: string,
    ownerId: string,
    patch: { name?: string; description?: string | null },
  ): Promise<PlaylistRecord | null> {
    const row = await queryOne<{ id: string }>(
      this.db,
      `UPDATE playlists
       SET name = COALESCE($3, name),
           description = CASE WHEN $4 THEN $5 ELSE description END
       WHERE id = $1 AND owner_id = $2
       RETURNING id`,
      [id, ownerId, patch.name ?? null, patch.description !== undefined, patch.description ?? null],
    );
    return row ? this.getPlaylist(id, ownerId) : null;
  }

  async deletePlaylist(id: string, ownerId: string): Promise<boolean> {
    const row = await queryOne<{ id: string }>(this.db, 'DELETE FROM playlists WHERE id = $1 AND owner_id = $2 RETURNING id', [
      id,
      ownerId,
    ]);
    return row !== null;
  }

  /** Appends tracks in the given order. Unknown track ids are skipped. Returns null if the playlist is missing. */
  async addTracks(id: string, ownerId: string, trackIds: string[]): Promise<number | null> {
    return this.db.transaction(async (tx) => {
      // Lock the playlist so concurrent appends cannot take the same positions.
      const playlist = await queryOne<{ id: string }>(tx, 'SELECT id FROM playlists WHERE id = $1 AND owner_id = $2 FOR UPDATE', [
        id,
        ownerId,
      ]);
      if (!playlist) return null;

      const last = await queryOne<{ max: number | null }>(
        tx,
        'SELECT MAX(position) AS max FROM playlist_tracks WHERE playlist_id = $1',
        [id],
      );
      const inserted = await tx.query<{ id: string }>(
        `INSERT INTO playlist_tracks (playlist_id, track_id, position)
         SELECT $1, t.id, $2 + ids.ord
         FROM unnest($3::uuid[]) WITH ORDINALITY AS ids(track_id, ord)
         JOIN tracks t ON t.id = ids.track_id
         RETURNING id`,
        [id, last?.max ?? 0, trackIds],
      );
      await tx.query('UPDATE playlists SET updated_at = NOW() WHERE id = $1', [id]);
      return inserted.length;
    });
  }

  async removeEntry(id: string, ownerId: string, entryId: string): Promise<boolean> {
    const row = await queryOne<{ id: string }>(
      this.db,
      `DELETE FROM playlist_tracks pt
       USING playlists p
       WHERE pt.playlist_id = p.id AND p.id = $1 AND p.owner_id = $2 AND pt.id = $3
       RETURNING pt.id`,
      [id, ownerId, entryId],
    );
    if (row) {
      await this.db.query('UPDATE playlists SET updated_at = NOW() WHERE id = $1', [id]);
    }
    return row !== null;
  }

  /**
   * Rewrites the order. `entryIds` must list every entry of the playlist exactly once.
   * Returns 'not-found' for a missing playlist and 'mismatch' when the list does not match.
   */
  async reorder(id: string, ownerId: string, entryIds: string[]): Promise<'ok' | 'not-found' | 'mismatch'> {
    return this.db.transaction(async (tx) => {
      const playlist = await queryOne<{ id: string }>(tx, 'SELECT id FROM playlists WHERE id = $1 AND owner_id = $2 FOR UPDATE', [
        id,
        ownerId,
      ]);
      if (!playlist) return 'not-found';

      const current = await tx.query<{ id: string }>('SELECT id FROM playlist_tracks WHERE playlist_id = $1', [id]);
      const currentIds = new Set(current.map((row) => row.id));
      const requested = new Set(entryIds);
      if (
        requested.size !== entryIds.length ||
        requested.size !== currentIds.size ||
        entryIds.some((entryId) => !currentIds.has(entryId))
      ) {
        return 'mismatch';
      }

      await tx.query(
        `UPDATE playlist_tracks pt
         SET position = o.ord
         FROM unnest($2::uuid[]) WITH ORDINALITY AS o(id, ord)
         WHERE pt.id = o.id AND pt.playlist_id = $1`,
        [id, entryIds],
      );
      await tx.query('UPDATE playlists SET updated_at = NOW() WHERE id = $1', [id]);
      return 'ok';
    });
  }
}
