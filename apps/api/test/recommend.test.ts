import { describe, expect, it } from 'vitest';
import {
  affinity,
  coListening,
  createContext,
  dailyMixes,
  discoverWeekly,
  homeRecommendations,
  onRepeat,
  playStrength,
  radio,
  rewind,
  type CatalogTrack,
  type EngineInput,
  type PlayEvent,
} from '../src/services/recommend/engine.js';

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 7, 12); // a Wednesday

/** A library of five artists in three genres, six tracks each: <artist initial><number>, e.g. "a1". */
const ARTISTS = [
  { key: 'a', name: 'Aurora', genre: 'Ambient', year: 2019 },
  { key: 'h', name: 'Haze', genre: 'Ambient', year: 2016 },
  { key: 'o', name: 'Owls', genre: 'Synthwave', year: 1987 },
  { key: 'p', name: 'Pulse', genre: 'Synthwave', year: 1989 },
  { key: 'j', name: 'Juniper', genre: 'Folk', year: 2008 },
];
const catalog: CatalogTrack[] = ARTISTS.flatMap((artist) =>
  [1, 2, 3, 4, 5, 6].map((n) => ({
    id: `${artist.key}${n}`,
    title: `${artist.name} ${n}`,
    artist: artist.name,
    albumArtist: artist.name,
    album: `${artist.name} LP`,
    genre: artist.genre,
    year: artist.year,
    duration: 200,
    createdAt: NOW - 200 * DAY,
  })),
);

/** Plays one after another, a minute apart, ending `daysAgo` days ago. */
function session(userId: string, ids: string[], daysAgo: number, options: Partial<PlayEvent> = {}): PlayEvent[] {
  return ids.map((trackId, index) => ({
    userId,
    trackId,
    at: NOW - daysAgo * DAY - (ids.length - index) * 60_000,
    listened: 200,
    skipped: false,
    ...options,
  }));
}

const input = (overrides: Partial<EngineInput>): EngineInput => ({
  now: NOW,
  userId: 'me',
  catalog,
  plays: [],
  favorites: new Map(),
  playlists: [],
  ...overrides,
});

describe('signals', () => {
  it('weighs a play by how much of it was heard, and a skip against', () => {
    expect(playStrength({ listened: 200, skipped: false }, 200)).toBe(1);
    expect(playStrength({ listened: 60, skipped: false }, 200)).toBeCloseTo(0.3);
    expect(playStrength({ listened: null, skipped: false }, 200)).toBe(0.7);
    expect(playStrength({ listened: 5, skipped: true }, 200)).toBe(-1);
    // Long tracks are not penalised for being long: four minutes counts as heard.
    expect(playStrength({ listened: 240, skipped: false }, 900)).toBe(1);
  });

  it('lets recent plays count more than old ones, and skips pull a track down', () => {
    const durations = new Map(catalog.map((track) => [track.id, track.duration]));
    const scores = affinity(
      [...session('me', ['a1'], 1), ...session('me', ['a2'], 90), ...session('me', ['a3', 'a3'], 1, { skipped: true, listened: 4 })],
      new Map(),
      new Set(),
      durations,
      NOW,
      90,
    );
    expect(scores.get('a1')!).toBeGreaterThan(scores.get('a2')!);
    expect(scores.get('a2')!).toBeCloseTo(0.5, 1);
    expect(scores.get('a3')!).toBeLessThan(0);
  });

  it("relates tracks played close together in anyone's sessions or playlists", () => {
    const neighbors = coListening(
      [...session('u1', ['a1', 'o1', 'a2'], 3), ...session('u2', ['a1', 'o1'], 5), ...session('u2', ['j1'], 4)],
      [{ trackIds: ['p1', 'p2'] }],
    );
    const of = (id: string) => (neighbors.get(id) ?? []).map((neighbor) => neighbor.id);
    expect(of('a1')[0]).toBe('o1');
    expect(of('a1')).toContain('a2');
    expect(of('p1')).toEqual(['p2']);
    // A play more than 30 minutes after the last starts a new session: j1 relates to nothing.
    expect(of('j1')).toEqual([]);
    // Skipped plays say nothing about what goes together.
    expect(coListening(session('u1', ['a1', 'o1'], 1, { skipped: true }), []).size).toBe(0);
  });
});

describe('mixes', () => {
  // Someone who listens to a lot of ambient and some synthwave, and skips Pulse.
  const plays = [
    ...session('me', ['a1', 'a2', 'h1', 'a1', 'h2', 'a3'], 1),
    ...session('me', ['o1', 'o2', 'o3', 'o1'], 2),
    ...session('me', ['a1', 'h1', 'a2', 'o2'], 9),
    ...session('me', ['p1', 'p1', 'p2', 'p2'], 3, { skipped: true, listened: 6 }),
    // Another listener who likes Aurora and Juniper together: a hint for discovery.
    ...session('friend', ['a1', 'j1', 'a2', 'j2', 'a1', 'j1'], 2),
  ];

  it('builds a daily mix per taste, mostly familiar, with new tracks woven in', () => {
    const ctx = createContext(input({ plays }));
    const mixes = dailyMixes(ctx);
    expect(mixes.map((mix) => mix.title)).toEqual(['Daily Mix 1', 'Daily Mix 2']);

    const [ambient, synth] = mixes;
    expect(ambient.artists).toContain('Aurora');
    expect(ambient.trackIds).toEqual(expect.arrayContaining(['a1', 'a2', 'h1']));
    expect(synth.trackIds).toEqual(expect.arrayContaining(['o1', 'o2', 'o3']));
    // Something the account hasn't played yet is in there, and nothing it keeps skipping.
    expect(ambient.trackIds.some((id) => !ctx.playCounts.has(id))).toBe(true);
    for (const mix of mixes) expect(mix.trackIds.filter((id) => id.startsWith('p') && ['p1', 'p2'].includes(id))).toEqual([]);
    expect(new Set(ambient.trackIds).size).toBe(ambient.trackIds.length);
  });

  it('keeps the same mixes all day, and changes them the next', () => {
    const today = dailyMixes(createContext(input({ plays })));
    const later = dailyMixes(createContext(input({ plays, now: NOW + 3 * 3_600_000 })));
    expect(later.map((mix) => mix.trackIds)).toEqual(today.map((mix) => mix.trackIds));
  });

  it('discovers tracks never played through, at most two per artist, steady for the week', () => {
    const ctx = createContext(input({ plays, favorites: new Map([['h3', NOW - 2 * DAY]]) }));
    const discover = discoverWeekly(ctx)!;
    expect(discover.title).toBe('Discover Weekly');
    for (const id of discover.trackIds) {
      expect(ctx.playCounts.has(id), id).toBe(false);
      expect(id).not.toBe('h3');
      expect(['p1', 'p2']).not.toContain(id);
    }
    const perArtist = new Map<string, number>();
    for (const id of discover.trackIds) perArtist.set(id[0], (perArtist.get(id[0]) ?? 0) + 1);
    expect(Math.max(...perArtist.values())).toBeLessThanOrEqual(2);
    // Juniper rode along with Aurora in a friend's sessions, so it is suggested to this Aurora fan.
    expect(discover.trackIds.some((id) => id.startsWith('j'))).toBe(true);

    const nextDay = discoverWeekly(createContext(input({ plays, favorites: new Map([['h3', NOW - 2 * DAY]]), now: NOW + DAY })))!;
    expect(nextDay.trackIds).toEqual(discover.trackIds);
  });

  it('puts recent repeats in On Repeat and long-unplayed favorites in Rewind', () => {
    const repeats = [...session('me', ['a1', 'a2', 'h1', 'h2', 'o1'], 2), ...session('me', ['a1', 'a2', 'h1', 'h2', 'o1'], 5)];
    const old = [1, 2, 3].flatMap((n) => session('me', ['j1', 'j2', 'j3', 'j4', 'o4'], 90 + n));
    const ctx = createContext(input({ plays: [...repeats, ...old] }));
    expect(new Set(onRepeat(ctx)!.trackIds)).toEqual(new Set(['a1', 'a2', 'h1', 'h2', 'o1']));
    expect(new Set(rewind(ctx)!.trackIds)).toEqual(new Set(['j1', 'j2', 'j3', 'j4', 'o4']));
  });

  it('starts a new account off with what is popular, and no personal mixes', () => {
    const home = homeRecommendations(input({ userId: 'new', plays }));
    expect(home.coldStart).toBe(true);
    expect(home.mixes.filter((mix) => mix.kind === 'daily')).toEqual([]);
    expect(home.shelves.map((shelf) => shelf.id)).toContain('popular');
  });
});

describe('radio', () => {
  it("starts with the seed, follows with what goes with it, and leaves out the account's skips", () => {
    const plays = [
      ...session('friend', ['o1', 'p3', 'o2', 'p3', 'o1', 'p3'], 1),
      ...session('me', ['o3', 'o3'], 1, { skipped: true, listened: 3 }),
    ];
    const station = radio(input({ plays }), { trackId: 'o1' })!;
    expect(station.title).toBe('Owls 1 radio');
    expect(station.trackIds[0]).toBe('o1');
    expect(station.trackIds.slice(1, 4)).toContain('p3');
    expect(station.trackIds).not.toContain('o3');
    // Only related tracks: same artist, same genre, or co-listened. Folk and ambient stay out.
    expect(station.trackIds.every((id) => ['o', 'p'].includes(id[0]))).toBe(true);
    expect(radio(input({}), { trackId: 'missing' })).toBeNull();
    expect(radio(input({}), { artist: 'owls' })!.title).toBe('Owls radio');
  });
});
