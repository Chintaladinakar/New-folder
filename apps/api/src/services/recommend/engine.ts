/**
 * Recommendations in the spirit of Spotify's, built from the signals this app has:
 *
 *  - Taste: what an account plays, how much of each play it listens to, what it skips, favorites
 *    and puts in playlists, weighted towards recent listening.
 *  - Co-listening (collaborative filtering): tracks that turn up close together in anyone's
 *    listening sessions or playlists are similar, whatever their tags say.
 *  - Content: a shared artist, album, genre or decade, for tracks nobody has played yet.
 *
 * Everything here is a pure function of its input, so it is deterministic and easy to test;
 * RecommendationService loads the data and caches the results. "Random" choices come from a hash
 * of the account and the day (or week), so a mix stays put until it is due to refresh.
 */

export type CatalogTrack = {
  id: string;
  title: string;
  artist: string | null;
  albumArtist: string | null;
  album: string | null;
  genre: string | null;
  year: number | null;
  duration: number | null;
  /** When it was added to the library (ms). */
  createdAt: number;
};

export type PlayEvent = {
  userId: string;
  trackId: string;
  /** When the play started (ms). */
  at: number;
  /** Seconds actually listened, when the player reported it. */
  listened: number | null;
  skipped: boolean;
};

export type Neighbor = { id: string; score: number };

export type EngineInput = {
  now: number;
  userId: string;
  catalog: CatalogTrack[];
  /** Recent plays by every account, the requesting account's included. Any order. */
  plays: PlayEvent[];
  /** The requesting account's favorites: track id → when it was favorited (ms). */
  favorites: Map<string, number>;
  /** Every account's playlists, as ordered track ids. */
  playlists: { ownerId: string; trackIds: string[] }[];
  /** Precomputed co-listening neighbors and popularity, shared by every account (optional). */
  neighbors?: Map<string, Neighbor[]>;
  popularity?: Map<string, number>;
};

export type MixKind = 'daily' | 'discover' | 'on-repeat' | 'rewind';

export type Mix = {
  id: string;
  kind: MixKind;
  title: string;
  description: string;
  trackIds: string[];
  /** The artists most present in the mix, for its subtitle. */
  artists: string[];
};

export type Shelf = { id: string; title: string; trackIds: string[] };

export type Home = {
  mixes: Mix[];
  shelves: Shelf[];
  /** Too little listening yet for personal mixes. */
  coldStart: boolean;
};

const DAY = 86_400_000;
const SESSION_GAP_MS = 30 * 60 * 1000;
// Monday 1 January 2024 (UTC): weeks are counted from here, so they turn over on Mondays.
const FIRST_MONDAY = Date.UTC(2024, 0, 1);

// ---------------------------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------------------------

/** Halves every `halfLifeDays`. */
export const decay = (ageMs: number, halfLifeDays: number) => Math.pow(0.5, Math.max(0, ageMs) / DAY / halfLifeDays);

/** A stable number in [0, 1) for a string (FNV-1a), used wherever a "random" choice must not change on reload. */
export function hashUnit(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) / 2 ** 32;
}

const fold = (value: string | null | undefined) => (value ?? '').trim().toLowerCase();

export type TrackKeys = { artist: string; album: string; genre: string; decade: number | null };

/** What two tracks are compared on. Multi-genre tags ("Pop; Dance") use the first genre. */
export function keysOf(track: CatalogTrack): TrackKeys {
  const artist = fold(track.artist ?? track.albumArtist);
  const album = fold(track.album);
  return {
    artist,
    album: album ? `${album}\u0000${fold(track.albumArtist ?? track.artist)}` : '',
    genre: fold(track.genre).split(/[;,/|]/)[0]?.trim() ?? '',
    decade: track.year ? Math.floor(track.year / 10) * 10 : null,
  };
}

/** Similarity from tags alone: artist counts most, then genre, album and decade. */
export function contentSimilarity(a: TrackKeys, b: TrackKeys): number {
  let score = 0;
  if (a.artist && a.artist === b.artist) score += 0.5;
  if (a.genre && a.genre === b.genre) score += 0.25;
  if (a.album && a.album === b.album) score += 0.2;
  if (a.decade !== null && a.decade === b.decade) score += 0.05;
  return score;
}

/** How much one play says about liking the track: about 1 when finished, -1 when skipped. */
export function playStrength(play: Pick<PlayEvent, 'listened' | 'skipped'>, duration: number | null): number {
  if (play.skipped) return -1;
  // Never reported (the tab was closed mid-song): probably listened to.
  if (play.listened === null) return 0.7;
  const full = Math.min(duration && duration > 0 ? duration : 180, 240);
  return Math.min(1, Math.max(0.3, play.listened / full));
}

// ---------------------------------------------------------------------------------------------
// Signals
// ---------------------------------------------------------------------------------------------

/**
 * How much an account likes each track: its plays (by how much of each it heard, skips counting
 * against), fading with age; favorites, fading slowly but never below half; and playlist entries.
 */
export function affinity(
  plays: PlayEvent[],
  favorites: Map<string, number>,
  playlistTrackIds: Set<string>,
  durations: Map<string, number | null>,
  now: number,
  halfLifeDays: number,
): Map<string, number> {
  const scores = new Map<string, number>();
  const add = (id: string, value: number) => scores.set(id, (scores.get(id) ?? 0) + value);
  for (const play of plays) add(play.trackId, playStrength(play, durations.get(play.trackId) ?? null) * decay(now - play.at, halfLifeDays));
  for (const [id, at] of favorites) add(id, 2 * Math.max(0.5, decay(now - at, halfLifeDays * 4)));
  for (const id of playlistTrackIds) add(id, 0.75);
  return scores;
}

export type Profile = {
  artists: Map<string, number>;
  genres: Map<string, number>;
  albums: Map<string, number>;
  decades: Map<number, number>;
};

/** Taste as weights per artist, genre, album and decade, each scaled so the favorite is 1. */
export function buildProfile(scores: Map<string, number>, keys: Map<string, TrackKeys>): Profile {
  const profile: Profile = { artists: new Map(), genres: new Map(), albums: new Map(), decades: new Map() };
  const add = <K>(map: Map<K, number>, key: K | '' | null, value: number) => {
    if (key === '' || key === null) return;
    map.set(key, (map.get(key) ?? 0) + value);
  };
  for (const [id, score] of scores) {
    const k = keys.get(id);
    if (!k || score <= 0) continue;
    add(profile.artists, k.artist, score);
    add(profile.genres, k.genre, score);
    add(profile.albums, k.album, score);
    add(profile.decades, k.decade, score);
  }
  for (const map of [profile.artists, profile.genres, profile.albums, profile.decades] as Map<unknown, number>[]) {
    const max = Math.max(0, ...map.values());
    if (max > 0) for (const [key, value] of map) map.set(key, value / max);
  }
  return profile;
}

/** How well a track fits a taste profile, in [0, 1]. */
export function tasteMatch(k: TrackKeys, profile: Profile): number {
  return (
    0.45 * (profile.artists.get(k.artist) ?? 0) +
    0.3 * (profile.genres.get(k.genre) ?? 0) +
    0.15 * (profile.albums.get(k.album) ?? 0) +
    0.1 * (k.decade === null ? 0 : (profile.decades.get(k.decade) ?? 0))
  );
}

/** How widely each track is played across accounts lately, in [0, 1]. */
export function popularity(plays: PlayEvent[], now: number, windowDays = 90): Map<string, number> {
  const listeners = new Map<string, Set<string>>();
  const counts = new Map<string, number>();
  for (const play of plays) {
    if (play.skipped || now - play.at > windowDays * DAY) continue;
    if (!listeners.has(play.trackId)) listeners.set(play.trackId, new Set());
    listeners.get(play.trackId)!.add(play.userId);
    counts.set(play.trackId, (counts.get(play.trackId) ?? 0) + 1);
  }
  const raw = new Map([...counts].map(([id, count]) => [id, Math.log1p(2 * listeners.get(id)!.size + count)]));
  const max = Math.max(0, ...raw.values());
  return new Map([...raw].map(([id, value]) => [id, max > 0 ? value / max : 0]));
}

/**
 * Collaborative filtering from co-occurrence. Tracks played near each other in a listening
 * session (a run of plays without a 30-minute gap), or near each other in a playlist, count as
 * related; nearer counts more. The counts are normalised like cosine similarity, so a track
 * everyone plays isn't everyone's neighbour. Keeps the strongest `maxPerTrack` neighbours.
 */
export function coListening(
  plays: PlayEvent[],
  playlists: { trackIds: string[] }[],
  options: { window?: number; playlistWindow?: number; maxPerTrack?: number } = {},
): Map<string, Neighbor[]> {
  const { window = 8, playlistWindow = 12, maxPerTrack = 30 } = options;
  const co = new Map<string, Map<string, number>>();
  const bump = (a: string, b: string, weight: number) => {
    if (a === b) return;
    for (const [from, to] of [
      [a, b],
      [b, a],
    ]) {
      let row = co.get(from);
      if (!row) co.set(from, (row = new Map()));
      row.set(to, (row.get(to) ?? 0) + weight);
    }
  };
  const pairUp = (ids: string[], span: number, weight: number, falloff: number) => {
    for (let i = 0; i < ids.length; i += 1) {
      for (let j = i + 1; j < Math.min(ids.length, i + 1 + span); j += 1) bump(ids[i], ids[j], weight / (1 + (j - i - 1) / falloff));
    }
  };

  const byUser = new Map<string, PlayEvent[]>();
  for (const play of plays) {
    if (play.skipped) continue;
    if (!byUser.has(play.userId)) byUser.set(play.userId, []);
    byUser.get(play.userId)!.push(play);
  }
  for (const own of byUser.values()) {
    own.sort((a, b) => a.at - b.at);
    let session: string[] = [];
    let last = -Infinity;
    const flush = () => {
      // Very long sessions (a party playlist on all night) are cut to their latest stretch.
      if (session.length > 1) pairUp(session.slice(-60), window, 1, 2);
      session = [];
    };
    for (const play of own) {
      if (play.at - last > SESSION_GAP_MS) flush();
      if (session[session.length - 1] !== play.trackId) session.push(play.trackId);
      last = play.at;
    }
    flush();
  }
  for (const playlist of playlists) pairUp([...new Set(playlist.trackIds)].slice(0, 500), playlistWindow, 1.5, 3);

  const degree = new Map([...co].map(([id, row]) => [id, [...row.values()].reduce((sum, value) => sum + value, 0)]));
  const neighbors = new Map<string, Neighbor[]>();
  for (const [id, row] of co) {
    const list = [...row].map(([other, count]) => ({ id: other, score: count / Math.sqrt(degree.get(id)! * degree.get(other)!) }));
    list.sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : 1));
    neighbors.set(id, list.slice(0, maxPerTrack));
  }
  return neighbors;
}

// ---------------------------------------------------------------------------------------------
// One account's view of the library
// ---------------------------------------------------------------------------------------------

export type Context = ReturnType<typeof createContext>;

export function createContext(input: EngineInput) {
  const { now, userId, catalog } = input;
  const byId = new Map(catalog.map((track) => [track.id, track]));
  const keys = new Map(catalog.map((track) => [track.id, keysOf(track)]));
  const durations = new Map(catalog.map((track) => [track.id, track.duration]));

  // Display names, keyed by the folded artist, as first written in the library.
  const artistNames = new Map<string, string>();
  for (const track of catalog) {
    const key = keys.get(track.id)!.artist;
    if (key && !artistNames.has(key)) artistNames.set(key, (track.artist ?? track.albumArtist)!.trim());
  }

  const plays = input.plays.filter((play) => byId.has(play.trackId));
  const own = plays.filter((play) => play.userId === userId);
  const favorites = new Map([...input.favorites].filter(([id]) => byId.has(id)));
  const ownPlaylists = new Set(input.playlists.filter((playlist) => playlist.ownerId === userId).flatMap((playlist) => playlist.trackIds));

  const lastPlayed = new Map<string, number>();
  const playCounts = new Map<string, number>();
  const recentPlayCounts = new Map<string, number>();
  const recentSkips = new Map<string, number>();
  for (const play of own) {
    lastPlayed.set(play.trackId, Math.max(lastPlayed.get(play.trackId) ?? 0, play.at));
    if (play.skipped) {
      if (now - play.at < 60 * DAY) recentSkips.set(play.trackId, (recentSkips.get(play.trackId) ?? 0) + 1);
    } else {
      playCounts.set(play.trackId, (playCounts.get(play.trackId) ?? 0) + 1);
      if (now - play.at < 30 * DAY) recentPlayCounts.set(play.trackId, (recentPlayCounts.get(play.trackId) ?? 0) + 1);
    }
  }

  const longAffinity = affinity(own, favorites, ownPlaylists, durations, now, 90);
  const shortAffinity = affinity(own, new Map(), new Set(), durations, now, 14);

  return {
    input,
    now,
    userId,
    catalog,
    byId,
    keys,
    artistNames,
    favorites,
    ownPlays: own,
    lastPlayed,
    playCounts,
    recentPlayCounts,
    recentSkips,
    longAffinity,
    shortAffinity,
    profile: buildProfile(longAffinity, keys),
    popularity: input.popularity ?? popularity(plays, now),
    neighbors: input.neighbors ?? coListening(plays, input.playlists),
    daySeed: `${userId}:${new Date(now).toISOString().slice(0, 10)}`,
    weekSeed: `${userId}:w${Math.floor((now - FIRST_MONDAY) / (7 * DAY))}`,
  };
}

/** Tracks the account has skipped at least twice lately: left out of everything. */
const disliked = (ctx: Context, id: string) => (ctx.recentSkips.get(id) ?? 0) >= 2;

const artistName = (ctx: Context, id: string) => ctx.artistNames.get(ctx.keys.get(id)?.artist ?? '') ?? null;

/** The most present artists, by display name. */
function topArtists(ctx: Context, ids: string[], count = 3): string[] {
  const tally = new Map<string, number>();
  for (const id of ids) {
    const name = artistName(ctx, id);
    if (name) tally.set(name, (tally.get(name) ?? 0) + 1);
  }
  return [...tally].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, count).map(([name]) => name);
}

/**
 * Ranks every track in the library as a recommendation built on `seeds` (track → weight):
 * co-listening with the seeds, fit with the account's taste, popularity, how new it is, and a
 * little seeded variety; recent skips count against.
 */
export function rankCandidates(
  ctx: Context,
  seeds: Map<string, number>,
  options: { exclude: (id: string) => boolean; salt: string; requireEvidence?: (id: string, cf: number) => boolean },
): string[] {
  const cf = new Map<string, number>();
  for (const [seed, weight] of seeds) {
    if (weight <= 0) continue;
    for (const neighbor of ctx.neighbors.get(seed) ?? []) cf.set(neighbor.id, (cf.get(neighbor.id) ?? 0) + weight * neighbor.score);
  }
  const maxCf = Math.max(0, ...cf.values()) || 1;

  const scored: [string, number][] = [];
  for (const track of ctx.catalog) {
    const id = track.id;
    if (seeds.has(id) || options.exclude(id) || disliked(ctx, id)) continue;
    const evidence = (cf.get(id) ?? 0) / maxCf;
    if (options.requireEvidence && !options.requireEvidence(id, evidence)) continue;
    const score =
      0.4 * evidence +
      0.35 * tasteMatch(ctx.keys.get(id)!, ctx.profile) +
      0.1 * (ctx.popularity.get(id) ?? 0) +
      0.1 * decay(ctx.now - track.createdAt, 21) +
      0.05 * hashUnit(`${id}:${options.salt}`) -
      0.25 * Math.min(1, ctx.recentSkips.get(id) ?? 0);
    scored.push([id, score]);
  }
  scored.sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
  return scored.map(([id]) => id);
}

/**
 * Takes from `ids` in order, at most `maxPerArtist` per artist and `maxPerAlbum` per album.
 * `relaxed` tops up past those limits when there aren't enough, for lists that should stay long
 * (radio) rather than varied.
 */
export function diversify(ctx: Context, ids: string[], limit: number, maxPerArtist = 2, maxPerAlbum = 2, relaxed = false): string[] {
  const perArtist = new Map<string, number>();
  const perAlbum = new Map<string, number>();
  const picked: string[] = [];
  const deferred: string[] = [];
  for (const id of ids) {
    if (picked.length >= limit) break;
    const k = ctx.keys.get(id)!;
    if ((k.artist && (perArtist.get(k.artist) ?? 0) >= maxPerArtist) || (k.album && (perAlbum.get(k.album) ?? 0) >= maxPerAlbum)) {
      deferred.push(id);
      continue;
    }
    picked.push(id);
    if (k.artist) perArtist.set(k.artist, (perArtist.get(k.artist) ?? 0) + 1);
    if (k.album) perAlbum.set(k.album, (perAlbum.get(k.album) ?? 0) + 1);
  }
  if (relaxed) {
    for (const id of deferred) {
      if (picked.length >= limit) break;
      picked.push(id);
    }
  }
  return picked;
}

/**
 * Reorders so the same artist rarely plays twice in a row, looking a few tracks ahead.
 * `after` is the track that plays just before the first of them, if any.
 */
export function spreadArtists(ctx: Context, ids: string[], after?: string): string[] {
  const remaining = [...ids];
  const ordered: string[] = [];
  while (remaining.length) {
    const last = ordered.length ? ordered[ordered.length - 1] : after;
    const previous = last ? ctx.keys.get(last)!.artist : null;
    const index = remaining.slice(0, 6).findIndex((id) => !previous || ctx.keys.get(id)!.artist !== previous);
    ordered.push(...remaining.splice(Math.max(0, index), 1));
  }
  return ordered;
}

const byScore = (scores: Map<string, number>) => [...scores].filter(([, score]) => score > 0).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));

// ---------------------------------------------------------------------------------------------
// Mixes and shelves
// ---------------------------------------------------------------------------------------------

/**
 * Up to four Daily Mixes. The account's best-liked tracks are grouped by genre (an untagged track
 * takes its artist's usual genre, else groups with its artist); each group becomes a mix of
 * mostly familiar tracks with some deeper cuts and discoveries woven in. New every day.
 */
export function dailyMixes(ctx: Context): Mix[] {
  const top = byScore(ctx.longAffinity).filter(([id]) => ctx.byId.has(id) && !disliked(ctx, id)).slice(0, 120);
  if (top.length < 6) return [];

  const usualGenre = new Map<string, Map<string, number>>();
  for (const track of ctx.catalog) {
    const k = ctx.keys.get(track.id)!;
    if (!k.artist || !k.genre) continue;
    if (!usualGenre.has(k.artist)) usualGenre.set(k.artist, new Map());
    const tally = usualGenre.get(k.artist)!;
    tally.set(k.genre, (tally.get(k.genre) ?? 0) + 1);
  }
  const genreOf = (id: string) => {
    const k = ctx.keys.get(id)!;
    if (k.genre) return `genre:${k.genre}`;
    const tally = usualGenre.get(k.artist);
    if (tally?.size) return `genre:${[...tally].sort((a, b) => b[1] - a[1])[0][0]}`;
    return k.artist ? `artist:${k.artist}` : 'other';
  };

  let groups = new Map<string, [string, number][]>();
  for (const entry of top) {
    const group = genreOf(entry[0]);
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group)!.push(entry);
  }

  // A library that is all one genre still deserves more than one mix: split it by artist.
  if (groups.size === 1 && top.length >= 16) {
    const artists = new Map<string, [string, number][]>();
    for (const entry of top) {
      const artist = ctx.keys.get(entry[0])!.artist || 'other';
      if (!artists.has(artist)) artists.set(artist, []);
      artists.get(artist)!.push(entry);
    }
    const ranked = [...artists.values()].sort((a, b) => weightOf(b) - weightOf(a));
    const buckets: [string, number][][] = [[], [], []];
    ranked.forEach((entries, index) => buckets[index % 3].push(...entries));
    groups = new Map(buckets.filter((bucket) => bucket.length).map((bucket, index) => [`split:${index}`, bucket]));
  }

  // A taste needs three tracks, and a tenth of the strongest taste's weight, to be a mix of its own;
  // smaller groups join the group they are most co-listened with, or are left out.
  const heaviest = Math.max(...[...groups.values()].map(weightOf));
  const isMix = (entries: [string, number][]) => entries.length >= 3 && weightOf(entries) >= heaviest * 0.1;
  const large = [...groups].filter(([, entries]) => isMix(entries));
  for (const [, entries] of [...groups].filter(([, entries]) => !isMix(entries))) {
    for (const entry of entries) {
      const ties = (ctx.neighbors.get(entry[0]) ?? []).filter((neighbor) => neighbor.score > 0.05);
      let best: [string, number][] | null = null;
      let bestScore = 0;
      for (const [, candidate] of large) {
        const members = new Set(candidate.map(([id]) => id));
        const score = ties.reduce((sum, neighbor) => sum + (members.has(neighbor.id) ? neighbor.score : 0), 0);
        if (score > bestScore) [best, bestScore] = [candidate, score];
      }
      best?.push(entry);
    }
  }

  return large
    .sort((a, b) => weightOf(b[1]) - weightOf(a[1]))
    .slice(0, 4)
    .map(([, entries], index) => {
      const salt = `${ctx.daySeed}:mix${index}`;
      const familiar = entries
        .map(([id, score]) => [id, score * (0.85 + 0.3 * hashUnit(`${id}:${salt}`))] as const)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 14)
        .map(([id]) => id);
      const familiarSet = new Set(familiar);
      const artists = new Set(familiar.map((id) => ctx.keys.get(id)!.artist).filter(Boolean));
      const genres = new Set(familiar.map((id) => ctx.keys.get(id)!.genre).filter(Boolean));

      // Deeper cuts: the same artists' other tracks.
      const deeper = ctx.catalog
        .filter((track) => !familiarSet.has(track.id) && artists.has(ctx.keys.get(track.id)!.artist) && !disliked(ctx, track.id))
        .map((track) => [track.id, tasteMatch(ctx.keys.get(track.id)!, ctx.profile) + 0.3 * hashUnit(`${track.id}:${salt}`)] as const)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([id]) => id);

      // Discoveries: unplayed tracks that are co-listened with the familiar ones, or share their genre.
      const taken = new Set([...familiar, ...deeper]);
      const discoveries = diversify(
        ctx,
        rankCandidates(ctx, new Map(familiar.map((id) => [id, ctx.longAffinity.get(id) ?? 0])), {
          exclude: (id) => taken.has(id) || (ctx.playCounts.get(id) ?? 0) > 0,
          salt,
          requireEvidence: (id, cf) => cf > 0 || genres.has(ctx.keys.get(id)!.genre),
        }),
        6,
      );

      // Mostly familiar: two known tracks, then one new to the account, and so on.
      const fresh = [...deeper, ...discoveries];
      const woven: string[] = [];
      familiar.forEach((id, position) => {
        woven.push(id);
        if (position % 2 === 1 && fresh.length) woven.push(fresh.shift()!);
      });
      woven.push(...fresh);

      const names = topArtists(ctx, familiar);
      return {
        id: `daily-${index + 1}`,
        kind: 'daily' as const,
        title: `Daily Mix ${index + 1}`,
        description: names.length ? `${names.join(', ')} and more` : 'Your favorites, and a few to try',
        trackIds: spreadArtists(ctx, woven),
        artists: names,
      };
    });
}

const weightOf = (entries: [string, number][]) => entries.reduce((sum, [, score]) => sum + score, 0);

/**
 * Discover Weekly: thirty tracks the account has never played through, ranked from its taste and
 * from what is co-listened with its favorites, at most two per artist. New every Monday. With no
 * listening yet, it leans on what is popular and new in the library.
 */
export function discoverWeekly(ctx: Context): Mix | null {
  const seeds = new Map(byScore(ctx.longAffinity).slice(0, 40));
  const ranked = rankCandidates(ctx, seeds, {
    exclude: (id) => (ctx.playCounts.get(id) ?? 0) > 0 || ctx.favorites.has(id) || (ctx.recentSkips.get(id) ?? 0) > 0,
    salt: ctx.weekSeed,
  });
  const trackIds = spreadArtists(ctx, diversify(ctx, ranked, 30, 2, 2));
  if (trackIds.length < 6) return null;
  return {
    id: 'discover',
    kind: 'discover',
    title: 'Discover Weekly',
    description: "Songs you haven't played yet, picked for you. New every Monday.",
    trackIds,
    artists: topArtists(ctx, trackIds),
  };
}

/** On Repeat: what the account has played at least twice in the last 30 days, most-played first. */
export function onRepeat(ctx: Context): Mix | null {
  const trackIds = [...ctx.recentPlayCounts]
    .filter(([, count]) => count >= 2)
    .sort((a, b) => (ctx.shortAffinity.get(b[0]) ?? 0) - (ctx.shortAffinity.get(a[0]) ?? 0) || (a[0] < b[0] ? -1 : 1))
    .slice(0, 30)
    .map(([id]) => id);
  if (trackIds.length < 5) return null;
  return {
    id: 'on-repeat',
    kind: 'on-repeat',
    title: 'On Repeat',
    description: 'The songs you keep coming back to lately.',
    trackIds,
    artists: topArtists(ctx, trackIds),
  };
}

/** Rewind: long-time favorites (three or more plays, or a heart) that haven't been played in 45 days. */
export function rewind(ctx: Context): Mix | null {
  const trackIds = byScore(ctx.longAffinity)
    .filter(([id]) => {
      const last = ctx.lastPlayed.get(id) ?? 0;
      return ctx.now - last > 45 * DAY && ((ctx.playCounts.get(id) ?? 0) >= 3 || ctx.favorites.has(id)) && !disliked(ctx, id);
    })
    .slice(0, 30)
    .map(([id]) => id);
  if (trackIds.length < 5) return null;
  return {
    id: 'rewind',
    kind: 'rewind',
    title: 'Rewind',
    description: "Old favorites you haven't played in a while.",
    trackIds: spreadArtists(ctx, trackIds),
    artists: topArtists(ctx, trackIds),
  };
}

/** "Because you listened to <artist>": other artists' tracks that go with the one played most lately. */
export function becauseYouListened(ctx: Context): Shelf | null {
  const recent = new Map<string, number>();
  for (const [id, score] of ctx.shortAffinity) {
    const artist = ctx.keys.get(id)?.artist;
    if (artist && score > 0) recent.set(artist, (recent.get(artist) ?? 0) + score);
  }
  const seedArtist = [...recent].sort((a, b) => b[1] - a[1])[0]?.[0];
  if (!seedArtist) return null;

  const seedTracks = new Map(ctx.catalog.filter((track) => ctx.keys.get(track.id)!.artist === seedArtist).map((track) => [track.id, Math.max(0.2, ctx.longAffinity.get(track.id) ?? 0)]));
  const genres = new Set([...seedTracks.keys()].map((id) => ctx.keys.get(id)!.genre).filter(Boolean));
  const ranked = rankCandidates(ctx, seedTracks, {
    exclude: (id) => ctx.keys.get(id)!.artist === seedArtist,
    salt: ctx.daySeed,
    requireEvidence: (id, cf) => cf > 0 || genres.has(ctx.keys.get(id)!.genre),
  });
  const trackIds = diversify(ctx, ranked, 16, 2);
  if (trackIds.length < 4) return null;
  return { id: `because:${seedArtist}`, title: `Because you listened to ${ctx.artistNames.get(seedArtist) ?? seedArtist}`, trackIds };
}

/** New in the library for you: added in the last 30 days and not played yet, best fit first. */
export function newForYou(ctx: Context): Shelf | null {
  const trackIds = ctx.catalog
    .filter((track) => ctx.now - track.createdAt < 30 * DAY && !ctx.playCounts.has(track.id) && !disliked(ctx, track.id))
    .map((track) => [track.id, 0.6 * tasteMatch(ctx.keys.get(track.id)!, ctx.profile) + 0.4 * decay(ctx.now - track.createdAt, 10)] as const)
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .map(([id]) => id);
  const picked = diversify(ctx, trackIds, 16, 3, 3, true);
  return picked.length >= 3 ? { id: 'new-for-you', title: 'New in the library for you', trackIds: picked } : null;
}

/** What other accounts are playing most, for an account still finding its feet. */
export function popularHere(ctx: Context): Shelf | null {
  const trackIds = [...ctx.popularity]
    .filter(([id]) => ctx.byId.has(id) && !disliked(ctx, id))
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .map(([id]) => id);
  const picked = diversify(ctx, trackIds, 16, 2, 2, true);
  return picked.length >= 4 ? { id: 'popular', title: 'Popular in the library', trackIds: picked } : null;
}

/** Everything for Home. */
export function homeRecommendations(input: EngineInput): Home {
  const ctx = createContext(input);
  const listened = [...ctx.playCounts.values()].reduce((sum, count) => sum + count, 0);
  const coldStart = listened < 5 && ctx.favorites.size < 3;

  const mixes = [...dailyMixes(ctx), discoverWeekly(ctx), onRepeat(ctx), rewind(ctx)].filter((mix): mix is Mix => mix !== null);
  const shelves = [becauseYouListened(ctx), newForYou(ctx), listened < 15 ? popularHere(ctx) : null].filter(
    (shelf): shelf is Shelf => shelf !== null,
  );
  return { mixes, shelves, coldStart };
}

/**
 * A radio station from a track or an artist: tracks co-listened with the seed, sharing its tags,
 * and fitting the account's taste, at most three per artist (more for an artist's own radio),
 * reshuffled every hour. A track's radio starts with the track itself.
 */
export function radio(input: EngineInput, seed: { trackId: string } | { artist: string }, limit = 40): { title: string; trackIds: string[] } | null {
  const ctx = createContext(input);
  let seedIds: string[];
  let title: string;
  let artistKey: string | null = null;

  if ('trackId' in seed) {
    const track = ctx.byId.get(seed.trackId);
    if (!track) return null;
    seedIds = [track.id];
    title = `${track.title} radio`;
  } else {
    artistKey = fold(seed.artist);
    seedIds = ctx.catalog
      .filter((track) => ctx.keys.get(track.id)!.artist === artistKey)
      .map((track) => [track.id, (ctx.longAffinity.get(track.id) ?? 0) + (ctx.popularity.get(track.id) ?? 0)] as const)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([id]) => id);
    if (!seedIds.length) return null;
    title = `${ctx.artistNames.get(artistKey) ?? seed.artist} radio`;
  }

  const salt = `${ctx.userId}:${seedIds[0]}:${Math.floor(ctx.now / 3_600_000)}`;
  const seedKeys = seedIds.map((id) => ctx.keys.get(id)!);
  const cf = new Map<string, number>();
  for (const id of seedIds) for (const neighbor of ctx.neighbors.get(id) ?? []) cf.set(neighbor.id, (cf.get(neighbor.id) ?? 0) + neighbor.score);
  const maxCf = Math.max(0, ...cf.values()) || 1;

  const scored: [string, number][] = [];
  for (const track of ctx.catalog) {
    if (seedIds.includes(track.id) || disliked(ctx, track.id)) continue;
    const k = ctx.keys.get(track.id)!;
    const content = Math.max(...seedKeys.map((seedKey) => contentSimilarity(seedKey, k)));
    const evidence = (cf.get(track.id) ?? 0) / maxCf;
    if (content === 0 && evidence === 0) continue;
    scored.push([
      track.id,
      0.4 * evidence +
        0.3 * content +
        0.2 * tasteMatch(k, ctx.profile) +
        0.05 * (ctx.popularity.get(track.id) ?? 0) +
        0.05 * hashUnit(`${track.id}:${salt}`) -
        0.3 * Math.min(1, ctx.recentSkips.get(track.id) ?? 0),
    ]);
  }
  scored.sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));

  const rest = diversify(ctx, scored.map(([id]) => id), limit - 1, artistKey ? 8 : 3, 3, true);
  const start = 'trackId' in seed ? seedIds : seedIds.slice(0, 2);
  const trackIds = [...start, ...spreadArtists(ctx, rest.filter((id) => !start.includes(id)), start[start.length - 1])].slice(0, limit);
  return trackIds.length > 1 ? { title, trackIds } : null;
}
