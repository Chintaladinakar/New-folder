import { queryOne, type Db } from '../db/index.js';
import type {
  AlbumSummary,
  ArtistSummary,
  LibraryFacets,
  LibraryStats,
  ListeningStats,
  TrackInput,
  TrackListOptions,
  TrackLyrics,
  TrackPatch,
  TrackRecord,
  TrackSort,
} from '../types/track.js';

/**
 * SELECT list for a full TrackRecord. The per-account fields come from `f` (favorites) and `s`
 * (play counts), so it must be used with trackJoins() on the same alias.
 */
export function trackColumns(alias = 't'): string {
  const p = `${alias}.`;
  return `
    ${p}id,
    ${p}title,
    ${p}artist,
    ${p}album,
    ${p}album_artist AS "albumArtist",
    ${p}genre,
    ${p}year,
    ${p}duration,
    ${p}track_number AS "trackNumber",
    ${p}disc_number AS "discNumber",
    ${p}file_name AS "fileName",
    ${p}storage_key AS "storageKey",
    ${p}file_size AS "fileSize",
    ${p}mime_type AS "mimeType",
    ${p}artwork_key AS "artworkKey",
    ${p}content_hash AS "contentHash",
    (f.track_id IS NOT NULL) AS "isFavorite",
    COALESCE(s.play_count, 0) AS "playCount",
    s.last_played_at AS "lastPlayedAt",
    (${p}lyrics IS NOT NULL OR ${p}synced_lyrics IS NOT NULL) AS "hasLyrics",
    ${p}lyrics_source AS "lyricsSource",
    ${p}created_at AS "createdAt",
    ${p}updated_at AS "updatedAt"`;
}

/** The account's favorite (`f`) and play counts (`s`) for each track; `userParam` may be NULL. */
export function trackJoins(alias: string, userParam: string): string {
  return `
    LEFT JOIN user_favorites f ON f.track_id = ${alias}.id AND f.user_id = ${userParam}::uuid
    LEFT JOIN user_track_stats s ON s.track_id = ${alias}.id AND s.user_id = ${userParam}::uuid`;
}

// Each sort as [column expression, natural direction]; the final `t.id` keeps paging stable.
const SORT_KEYS: Record<TrackSort, [string, 'ASC' | 'DESC'][]> = {
  recent: [['t.created_at', 'DESC']],
  title: [['lower(t.title)', 'ASC']],
  artist: [
    ['lower(t.artist)', 'ASC'],
    ['lower(t.album)', 'ASC'],
    ['t.disc_number', 'ASC'],
    ['t.track_number', 'ASC'],
  ],
  album: [
    ['lower(t.album)', 'ASC'],
    ['t.disc_number', 'ASC'],
    ['t.track_number', 'ASC'],
  ],
  played: [['s.last_played_at', 'DESC']],
  'album-order': [
    ['t.disc_number', 'ASC'],
    ['t.track_number', 'ASC'],
    ['lower(t.title)', 'ASC'],
  ],
  duration: [['t.duration', 'DESC']],
  plays: [
    ['COALESCE(s.play_count, 0)', 'DESC'],
    ['s.last_played_at', 'DESC'],
  ],
  year: [
    ['t.year', 'DESC'],
    ['lower(t.album)', 'ASC'],
    ['t.track_number', 'ASC'],
  ],
};

function orderBy(sort: TrackSort, reverse: boolean): string {
  const flip = (direction: 'ASC' | 'DESC') => (reverse ? (direction === 'ASC' ? 'DESC' : 'ASC') : direction);
  const keys = SORT_KEYS[sort].map(([column, direction]) => `${column} ${flip(direction)} NULLS LAST`);
  return [...keys, `t.id ${reverse ? 'DESC' : 'ASC'}`].join(', ');
}

const PATCH_COLUMNS: Record<keyof TrackPatch, string> = {
  title: 'title',
  artist: 'artist',
  album: 'album',
  albumArtist: 'album_artist',
  genre: 'genre',
  year: 'year',
  trackNumber: 'track_number',
  discNumber: 'disc_number',
};

const escapeLike = (value: string) => value.replace(/[\\%_]/g, (char) => `\\${char}`);

/** A play counts as a skip when it ended early: before 30 seconds, or half of a shorter track. */
export const SKIP_THRESHOLD_SECONDS = 30;

export class TrackService {
  constructor(private readonly db: Db) {}

  /** Tracks as `userId` sees them (their favorites and play counts). */
  async listTracks(options: TrackListOptions, userId: string | null = null): Promise<{ tracks: TrackRecord[]; total: number }> {
    const conditions: string[] = [];
    const params: unknown[] = [userId];
    const param = (value: unknown) => {
      params.push(value);
      return `$${params.length}`;
    };

    if (options.q) {
      const pattern = param(`%${escapeLike(options.q)}%`);
      conditions.push(
        `(t.title ILIKE ${pattern} OR t.artist ILIKE ${pattern} OR t.album ILIKE ${pattern} OR t.album_artist ILIKE ${pattern})`,
      );
    }
    if (options.artist) {
      const artist = param(options.artist);
      conditions.push(`(t.artist = ${artist} OR t.album_artist = ${artist})`);
    }
    if (options.album) conditions.push(`t.album = ${param(options.album)}`);
    if (options.albumArtist) conditions.push(`COALESCE(t.album_artist, t.artist) = ${param(options.albumArtist)}`);
    if (options.genre) conditions.push(`t.genre = ${param(options.genre)}`);
    if (options.yearFrom !== undefined) conditions.push(`t.year >= ${param(options.yearFrom)}`);
    if (options.yearTo !== undefined) conditions.push(`t.year <= ${param(options.yearTo)}`);
    if (options.format) conditions.push(`t.mime_type = ${param(options.format)}`);
    if (options.favorite !== undefined) conditions.push(`(f.track_id IS NOT NULL) = ${param(options.favorite)}`);
    if (options.played) conditions.push('s.last_played_at IS NOT NULL');
    if (options.hasLyrics !== undefined) {
      conditions.push(`(t.lyrics IS NOT NULL OR t.synced_lyrics IS NOT NULL) = ${param(options.hasLyrics)}`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const filterParams = [...params];

    const [tracks, countRow] = await Promise.all([
      this.db.query<TrackRecord>(
        `SELECT ${trackColumns()} FROM tracks t ${trackJoins('t', '$1')} ${where}
         ORDER BY ${orderBy(options.sort, options.reverse ?? false)}
         LIMIT ${param(options.limit)} OFFSET ${param(options.offset)}`,
        params,
      ),
      queryOne<{ total: number }>(this.db, `SELECT COUNT(*) AS total FROM tracks t ${trackJoins('t', '$1')} ${where}`, filterParams),
    ]);

    return { tracks, total: countRow?.total ?? 0 };
  }

  async getTrackById(id: string, userId: string | null = null): Promise<TrackRecord | null> {
    return queryOne<TrackRecord>(this.db, `SELECT ${trackColumns()} FROM tracks t ${trackJoins('t', '$2')} WHERE t.id = $1`, [id, userId]);
  }

  /** Tracks in the order of `ids`; unknown ids are left out. */
  async getTracksByIds(ids: string[], userId: string | null = null): Promise<TrackRecord[]> {
    if (ids.length === 0) return [];
    const rows = await this.db.query<TrackRecord>(
      `SELECT ${trackColumns()} FROM tracks t ${trackJoins('t', '$2')} WHERE t.id = ANY($1::uuid[])`,
      [ids, userId],
    );
    const byId = new Map(rows.map((row) => [row.id, row]));
    return ids.flatMap((id) => byId.get(id) ?? []);
  }

  async findByStorageKey(storageKey: string, userId: string | null = null): Promise<TrackRecord | null> {
    return queryOne<TrackRecord>(
      this.db,
      `SELECT ${trackColumns()} FROM tracks t ${trackJoins('t', '$2')} WHERE t.storage_key = $1`,
      [storageKey, userId],
    );
  }

  async findByContentHash(contentHash: string, userId: string | null = null): Promise<TrackRecord | null> {
    return queryOne<TrackRecord>(
      this.db,
      `SELECT ${trackColumns()} FROM tracks t ${trackJoins('t', '$2')} WHERE t.content_hash = $1`,
      [contentHash, userId],
    );
  }

  async createTrack(input: TrackInput, userId: string | null = null): Promise<TrackRecord> {
    const row = await queryOne<{ id: string }>(
      this.db,
      `
        INSERT INTO tracks (
          title, artist, album, album_artist, genre, year, duration, track_number, disc_number,
          file_name, storage_key, file_size, mime_type, artwork_key, content_hash,
          lyrics, synced_lyrics, lyrics_source
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
        RETURNING id
      `,
      [
        input.title,
        input.artist ?? null,
        input.album ?? null,
        input.albumArtist ?? null,
        input.genre ?? null,
        input.year ?? null,
        input.duration ?? null,
        input.trackNumber ?? null,
        input.discNumber ?? null,
        input.fileName,
        input.storageKey,
        input.fileSize,
        input.mimeType,
        input.artworkKey ?? null,
        input.contentHash ?? null,
        input.lyrics ?? null,
        input.syncedLyrics ?? null,
        input.lyrics || input.syncedLyrics ? 'embedded' : null,
      ],
    );

    const track = row ? await this.getTrackById(row.id, userId) : null;
    if (!track) {
      throw new Error('Track creation failed');
    }
    return track;
  }

  /** Edits tags; returns the track as `userId` sees it. */
  async updateTrack(id: string, patch: TrackPatch, userId: string | null = null): Promise<TrackRecord | null> {
    const assignments: string[] = [];
    const params: unknown[] = [id];
    for (const [field, column] of Object.entries(PATCH_COLUMNS) as [keyof TrackPatch, string][]) {
      if (patch[field] !== undefined) {
        params.push(patch[field]);
        assignments.push(`${column} = $${params.length}`);
      }
    }
    if (assignments.length > 0) {
      const row = await queryOne<{ id: string }>(this.db, `UPDATE tracks SET ${assignments.join(', ')} WHERE id = $1 RETURNING id`, params);
      if (!row) return null;
    }
    return this.getTrackById(id, userId);
  }

  /** Adds or removes one account's favorite. False if the track does not exist. */
  async setFavorite(userId: string, trackId: string, favorite: boolean): Promise<boolean> {
    if (favorite) {
      const rows = await this.db.query<{ id: string }>(
        `WITH added AS (
           INSERT INTO user_favorites (user_id, track_id) SELECT $1, id FROM tracks WHERE id = $2
           ON CONFLICT DO NOTHING
         )
         SELECT id FROM tracks WHERE id = $2`,
        [userId, trackId],
      );
      return rows.length > 0;
    }
    await this.db.query('DELETE FROM user_favorites WHERE user_id = $1 AND track_id = $2', [userId, trackId]);
    return (await queryOne<{ id: string }>(this.db, 'SELECT id FROM tracks WHERE id = $1', [trackId])) !== null;
  }

  /** Deletes the row and returns its stored files, so the caller can remove them. */
  async deleteTrack(id: string): Promise<{ storageKey: string; artworkKey: string | null } | null> {
    return queryOne(this.db, 'DELETE FROM tracks WHERE id = $1 RETURNING storage_key AS "storageKey", artwork_key AS "artworkKey"', [id]);
  }

  async isArtworkInUse(artworkKey: string): Promise<boolean> {
    const row = await queryOne<{ id: string }>(this.db, 'SELECT id FROM tracks WHERE artwork_key = $1 LIMIT 1', [
      artworkKey,
    ]);
    return row !== null;
  }

  /**
   * Starts a play: a history row (with the genre as it is right now) and the account's counters,
   * in one statement. Returns the history row's id, which finishPlay() completes. Null if the
   * track does not exist.
   */
  async recordPlay(trackId: string, userId: string): Promise<number | null> {
    const row = await queryOne<{ playId: number }>(
      this.db,
      `WITH track AS (
         SELECT id, genre, artist, duration FROM tracks WHERE id = $1
       ),
       counted AS (
         INSERT INTO user_track_stats (user_id, track_id, play_count, last_played_at)
         SELECT $2, id, 1, NOW() FROM track
         ON CONFLICT (user_id, track_id)
         DO UPDATE SET play_count = user_track_stats.play_count + 1, last_played_at = NOW()
       )
       INSERT INTO play_history (user_id, track_id, genre, artist, duration)
       SELECT $2, id, genre, artist, duration FROM track
       RETURNING id AS "playId"`,
      [trackId, userId],
    );
    return row?.playId ?? null;
  }

  /**
   * Records how a play went. A play that ended early counts as a skip: it moves from the
   * account's play count to its skip count, and recommendations read it as "not this one".
   * Each play can be finished once. Null if the play isn't this account's or was already finished.
   */
  async finishPlay(playId: number, userId: string, listenedSeconds: number, completed: boolean): Promise<{ trackId: string | null; skipped: boolean } | null> {
    const row = await queryOne<{ trackId: string | null; skipped: boolean }>(
      this.db,
      `UPDATE play_history SET
         listened_seconds = LEAST($3, COALESCE(duration, $3) + 5),
         skipped = NOT $4 AND $3 < LEAST($5, COALESCE(duration, 60) * 0.5)
       WHERE id = $1 AND user_id = $2 AND listened_seconds IS NULL
       RETURNING track_id AS "trackId", skipped`,
      [playId, userId, listenedSeconds, completed, SKIP_THRESHOLD_SECONDS],
    );
    if (row?.skipped && row.trackId) {
      await this.db.query(
        `UPDATE user_track_stats SET play_count = GREATEST(play_count - 1, 0), skip_count = skip_count + 1
         WHERE user_id = $1 AND track_id = $2`,
        [userId, row.trackId],
      );
    }
    return row;
  }

  /**
   * What `userId` played in the last `days` days, skips left out. Time is what was actually
   * listened where the player reported it, and the track's length otherwise.
   */
  async getListeningStats(userId: string, days: number): Promise<ListeningStats> {
    const scope = `user_id = $1 AND NOT skipped AND played_at >= NOW() - make_interval(days => $2)`;
    const seconds = 'COALESCE(SUM(COALESCE(listened_seconds, duration)), 0)::float8';
    const [totals, genres, artists] = await Promise.all([
      queryOne<{ plays: number; seconds: number }>(
        this.db,
        `SELECT COUNT(*)::int AS plays, ${seconds} AS seconds FROM play_history WHERE ${scope}`,
        [userId, days],
      ),
      this.db.query<ListeningStats['genres'][number]>(
        `SELECT COALESCE(genre, 'Unknown') AS name, COUNT(*)::int AS plays, ${seconds} AS seconds
         FROM play_history WHERE ${scope}
         GROUP BY 1 ORDER BY plays DESC, seconds DESC, name LIMIT 10`,
        [userId, days],
      ),
      this.db.query<ListeningStats['artists'][number]>(
        `SELECT artist AS name, COUNT(*)::int AS plays FROM play_history
         WHERE ${scope} AND artist IS NOT NULL
         GROUP BY artist ORDER BY plays DESC, artist LIMIT 5`,
        [userId, days],
      ),
    ]);
    return { days, plays: totals?.plays ?? 0, seconds: totals?.seconds ?? 0, genres, artists };
  }

  async getLyrics(id: string): Promise<(TrackLyrics & { checkedAt: Date | null }) | null> {
    return queryOne(
      this.db,
      `SELECT lyrics, synced_lyrics AS "syncedLyrics", lyrics_source AS source, lyrics_checked_at AS "checkedAt"
       FROM tracks WHERE id = $1`,
      [id],
    );
  }

  async setLyrics(id: string, lyrics: TrackLyrics): Promise<boolean> {
    const row = await queryOne<{ id: string }>(
      this.db,
      `UPDATE tracks
       SET lyrics = $2, synced_lyrics = $3, lyrics_source = $4, lyrics_checked_at = NOW()
       WHERE id = $1 RETURNING id`,
      [id, lyrics.lyrics, lyrics.syncedLyrics, lyrics.source],
    );
    return row !== null;
  }

  async getFacets(): Promise<LibraryFacets> {
    const [genres, formats, years] = await Promise.all([
      this.db.query<{ name: string; count: number }>(
        `SELECT genre AS name, COUNT(*)::int AS count FROM tracks WHERE genre IS NOT NULL
         GROUP BY genre ORDER BY count DESC, lower(genre) LIMIT 100`,
      ),
      this.db.query<{ mimeType: string; count: number }>(
        `SELECT mime_type AS "mimeType", COUNT(*)::int AS count FROM tracks GROUP BY mime_type ORDER BY count DESC`,
      ),
      queryOne<{ yearMin: number | null; yearMax: number | null }>(
        this.db,
        'SELECT MIN(year) AS "yearMin", MAX(year) AS "yearMax" FROM tracks',
      ),
    ]);
    return { genres, formats, yearMin: years?.yearMin ?? null, yearMax: years?.yearMax ?? null };
  }

  async listAlbums(): Promise<AlbumSummary[]> {
    return this.db.query<AlbumSummary>(`
      SELECT
        album AS name,
        COALESCE(album_artist, artist) AS artist,
        COUNT(*)::int AS "trackCount",
        MAX(year) AS year,
        COALESCE(SUM(duration), 0)::int AS duration,
        (ARRAY_AGG(artwork_key ORDER BY disc_number NULLS LAST, track_number NULLS LAST)
          FILTER (WHERE artwork_key IS NOT NULL))[1] AS "artworkKey"
      FROM tracks
      WHERE album IS NOT NULL
      GROUP BY album, COALESCE(album_artist, artist)
      ORDER BY lower(album), lower(COALESCE(album_artist, artist)) NULLS LAST
    `);
  }

  async listArtists(): Promise<ArtistSummary[]> {
    return this.db.query<ArtistSummary>(`
      SELECT
        artist AS name,
        COUNT(*)::int AS "trackCount",
        COUNT(DISTINCT album)::int AS "albumCount",
        (ARRAY_AGG(artwork_key ORDER BY created_at DESC) FILTER (WHERE artwork_key IS NOT NULL))[1] AS "artworkKey"
      FROM tracks
      WHERE artist IS NOT NULL
      GROUP BY artist
      ORDER BY lower(artist)
    `);
  }

  /** Library totals, with `userId`'s own favorites count. */
  async getStats(userId: string | null = null): Promise<LibraryStats> {
    const row = await queryOne<LibraryStats>(
      this.db,
      `
        SELECT
          COUNT(*)::int AS "trackCount",
          COUNT(DISTINCT album)::int AS "albumCount",
          COUNT(DISTINCT artist)::int AS "artistCount",
          (SELECT COUNT(*)::int FROM user_favorites WHERE user_id = $1::uuid) AS "favoriteCount",
          COALESCE(SUM(file_size), 0)::float8 AS "totalBytes",
          COALESCE(SUM(duration), 0)::float8 AS "totalDuration"
        FROM tracks
      `,
      [userId],
    );
    return row as LibraryStats;
  }

  /** Every object key the database points at, for finding orphaned files in storage. */
  async listReferencedKeys(): Promise<Set<string>> {
    const rows = await this.db.query<{ key: string }>(`
      SELECT storage_key AS key FROM tracks
      UNION
      SELECT artwork_key AS key FROM tracks WHERE artwork_key IS NOT NULL
    `);
    return new Set(rows.map((row) => row.key));
  }

  async listLegacyArtwork(limit: number): Promise<{ id: string; artworkUrl: string }[]> {
    return this.db.query(
      `SELECT id, artwork_url AS "artworkUrl" FROM tracks
       WHERE artwork_key IS NULL AND artwork_url LIKE 'data:%'
       ORDER BY created_at
       LIMIT $1`,
      [limit],
    );
  }

  async setArtworkKey(id: string, artworkKey: string): Promise<void> {
    await this.db.query('UPDATE tracks SET artwork_key = $2 WHERE id = $1', [id, artworkKey]);
  }

  async listMissingHashes(limit: number, afterId: string | null): Promise<{ id: string; storageKey: string }[]> {
    return this.db.query(
      `SELECT id, storage_key AS "storageKey" FROM tracks
       WHERE content_hash IS NULL AND ($2::uuid IS NULL OR id > $2::uuid)
       ORDER BY id
       LIMIT $1`,
      [limit, afterId],
    );
  }

  async setContentHash(id: string, contentHash: string): Promise<void> {
    await this.db.query('UPDATE tracks SET content_hash = $2 WHERE id = $1', [id, contentHash]);
  }
}
