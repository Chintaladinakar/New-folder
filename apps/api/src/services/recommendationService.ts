import type { Db } from '../db/index.js';
import {
  coListening,
  homeRecommendations,
  popularity,
  radio,
  type CatalogTrack,
  type EngineInput,
  type Home,
  type Mix,
  type Neighbor,
  type PlayEvent,
} from './recommend/engine.js';

const CATALOG_TTL_MS = 10 * 60 * 1000;
// Co-listening across accounts changes slowly; recomputing it every few minutes is plenty.
const SHARED_TTL_MS = 5 * 60 * 1000;
// An account's Home is reused until its taste changes (see invalidate) or this long has passed.
const HOME_TTL_MS = 30 * 60 * 1000;

type PlayRow = Omit<PlayEvent, 'at'> & { at: Date };

type Shared = {
  plays: PlayEvent[];
  playlists: { ownerId: string; trackIds: string[] }[];
  neighbors: Map<string, Neighbor[]>;
  popularity: Map<string, number>;
  at: number;
};

/**
 * Loads what the recommendation engine needs and caches the results. Call invalidate(userId)
 * whenever an account's taste changes (a play, a favorite, a playlist edit), and invalidateCatalog()
 * when tracks are added, edited or deleted.
 */
export class RecommendationService {
  private catalog: { tracks: CatalogTrack[]; at: number } | null = null;
  private shared: Shared | null = null;
  private sharedStale = false;
  private readonly homes = new Map<string, { home: Home; version: number; at: number }>();
  private readonly versions = new Map<string, number>();

  constructor(
    private readonly db: Db,
    private readonly now: () => number = Date.now,
  ) {}

  invalidate(userId: string): void {
    this.versions.set(userId, (this.versions.get(userId) ?? 0) + 1);
    // Co-listening is learned from everyone's plays, this one's included: rebuild it on next use.
    this.sharedStale = true;
  }

  invalidateCatalog(): void {
    this.catalog = null;
    this.shared = null;
    this.homes.clear();
  }

  async home(userId: string): Promise<Home> {
    const version = this.versions.get(userId) ?? 0;
    const cached = this.homes.get(userId);
    // Mixes are computed for a day; a cached Home from yesterday must not linger past midnight.
    const sameDay = cached && new Date(cached.at).toISOString().slice(0, 10) === new Date(this.now()).toISOString().slice(0, 10);
    if (cached && sameDay && cached.version === version && this.now() - cached.at < HOME_TTL_MS) return cached.home;

    const home = homeRecommendations(await this.input(userId));
    if (this.homes.size > 500) this.homes.clear();
    this.homes.set(userId, { home, version, at: this.now() });
    return home;
  }

  async mix(userId: string, mixId: string): Promise<Mix | null> {
    return (await this.home(userId)).mixes.find((mix) => mix.id === mixId) ?? null;
  }

  async radio(userId: string, seed: { trackId: string } | { artist: string }) {
    return radio(await this.input(userId), seed);
  }

  private async input(userId: string): Promise<EngineInput> {
    const [catalog, shared, own, favorites] = await Promise.all([
      this.loadCatalog(),
      this.loadShared(),
      // The account's own plays are always fresh; the shared set can be a few minutes old.
      this.db.query<PlayRow>(
        `SELECT user_id AS "userId", track_id AS "trackId", played_at AS at, listened_seconds AS listened, skipped
         FROM play_history
         WHERE user_id = $1 AND track_id IS NOT NULL AND played_at >= NOW() - INTERVAL '365 days'
         ORDER BY played_at DESC LIMIT 10000`,
        [userId],
      ),
      this.db.query<{ trackId: string; at: Date }>('SELECT track_id AS "trackId", created_at AS at FROM user_favorites WHERE user_id = $1', [userId]),
    ]);
    return {
      now: this.now(),
      userId,
      catalog,
      plays: [...shared.plays.filter((play) => play.userId !== userId), ...own.map(toPlayEvent)],
      favorites: new Map(favorites.map((row) => [row.trackId, new Date(row.at).getTime()])),
      playlists: shared.playlists,
      neighbors: shared.neighbors,
      popularity: shared.popularity,
    };
  }

  private async loadCatalog(): Promise<CatalogTrack[]> {
    if (this.catalog && this.now() - this.catalog.at < CATALOG_TTL_MS) return this.catalog.tracks;
    const rows = await this.db.query<Omit<CatalogTrack, 'createdAt'> & { createdAt: Date }>(
      `SELECT id, title, artist, album_artist AS "albumArtist", album, genre, year, duration, created_at AS "createdAt" FROM tracks`,
    );
    const tracks = rows.map((row) => ({ ...row, createdAt: new Date(row.createdAt).getTime() }));
    this.catalog = { tracks, at: this.now() };
    return tracks;
  }

  private async loadShared(): Promise<Shared> {
    if (this.shared && !this.sharedStale && this.now() - this.shared.at < SHARED_TTL_MS) return this.shared;
    this.sharedStale = false;
    const [plays, entries] = await Promise.all([
      this.db.query<PlayRow>(
        `SELECT user_id AS "userId", track_id AS "trackId", played_at AS at, listened_seconds AS listened, skipped
         FROM play_history
         WHERE track_id IS NOT NULL AND played_at >= NOW() - INTERVAL '180 days'
         ORDER BY played_at DESC LIMIT 50000`,
      ),
      this.db.query<{ playlistId: string; ownerId: string; trackId: string }>(
        `SELECT p.id AS "playlistId", p.owner_id AS "ownerId", pt.track_id AS "trackId"
         FROM playlist_tracks pt JOIN playlists p ON p.id = pt.playlist_id
         ORDER BY p.id, pt.position, pt.added_at`,
      ),
    ]);
    const byPlaylist = new Map<string, { ownerId: string; trackIds: string[] }>();
    for (const entry of entries) {
      if (!byPlaylist.has(entry.playlistId)) byPlaylist.set(entry.playlistId, { ownerId: entry.ownerId, trackIds: [] });
      byPlaylist.get(entry.playlistId)!.trackIds.push(entry.trackId);
    }
    const events = plays.map(toPlayEvent);
    const playlists = [...byPlaylist.values()];
    this.shared = { plays: events, playlists, neighbors: coListening(events, playlists), popularity: popularity(events, this.now()), at: this.now() };
    return this.shared;
  }
}

const toPlayEvent = (row: PlayRow): PlayEvent => ({
  userId: row.userId,
  trackId: row.trackId,
  at: new Date(row.at).getTime(),
  listened: row.listened,
  skipped: row.skipped,
});
