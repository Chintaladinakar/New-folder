import { describe, expect, it, vi } from 'vitest';
import { fetchLyricsFromLrclib, looksSynced, lrcTimestamp, lyricsFromTags } from '../src/services/lyricsService.js';
import { createTestApp, makeWav, uploadTrack } from './helpers.js';

describe('lyrics helpers', () => {
  it('formats LRC timestamps and converts synced tags', () => {
    expect(lrcTimestamp(0)).toBe('[00:00.00]');
    expect(lrcTimestamp(83_456)).toBe('[01:23.46]');

    const result = lyricsFromTags([
      {
        contentType: 1,
        timeStampFormat: 2,
        text: undefined,
        syncText: [
          { timestamp: 1000, text: 'First line\n' },
          { timestamp: 4500, text: 'Second line' },
        ],
      },
      { contentType: 1, timeStampFormat: 0, text: 'First line\r\nSecond line\0', syncText: [] },
    ]);
    expect(result).toEqual({ lyrics: 'First line\nSecond line', syncedLyrics: '[00:01.00]First line\n[00:04.50]Second line' });
    expect(looksSynced(result.syncedLyrics)).toBe(true);
    expect(looksSynced(result.lyrics)).toBe(false);
  });

  it('queries lrclib with the track details', async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      const params = new URL(String(url)).searchParams;
      expect(params.get('track_name')).toBe('Song');
      expect(params.get('artist_name')).toBe('Band');
      expect(params.get('duration')).toBe('184');
      return Response.json({ plainLyrics: 'la la', syncedLyrics: '[00:01.00]la la' });
    }) as unknown as typeof fetch;

    expect(await fetchLyricsFromLrclib({ title: 'Song', artist: 'Band', album: null, duration: 183.6 }, fetchImpl)).toEqual({
      lyrics: 'la la',
      syncedLyrics: '[00:01.00]la la',
    });
    expect(await fetchLyricsFromLrclib({ title: 'Song', artist: null, album: null, duration: null }, fetchImpl)).toBeNull();
  });
});

describe('lyrics endpoints', () => {
  it('looks lyrics up once, caches them, and accepts manual edits', async () => {
    const calls: string[] = [];
    const ctx = await createTestApp({
      lyricsFetch: (async (url: string | URL | Request) => {
        calls.push(String(url));
        return calls.length === 1 ? new Response(null, { status: 404 }) : Response.json({ plainLyrics: 'Found later', syncedLyrics: null });
      }) as typeof fetch,
    });
    const id = (await uploadTrack(ctx, 'a.wav', makeWav({ title: 'Song', artist: 'Band' }))).body.track.id;

    const miss = await ctx.authed.get(`/api/tracks/${id}/lyrics`);
    expect(miss.body).toEqual({ lyrics: null, syncedLyrics: null, source: 'none' });
    // A recent miss is not retried...
    await ctx.authed.get(`/api/tracks/${id}/lyrics`);
    expect(calls).toHaveLength(1);
    // ...unless asked to refresh.
    const hit = await ctx.authed.get(`/api/tracks/${id}/lyrics?refresh=1`);
    expect(hit.body).toMatchObject({ lyrics: 'Found later', source: 'lrclib' });
    expect((await ctx.authed.get(`/api/tracks/${id}`)).body.track.hasLyrics).toBe(true);

    const manual = await ctx.authed.put(`/api/tracks/${id}/lyrics`).send({ lyrics: '[00:05.00]Typed in\n[00:09.00]By hand' });
    expect(manual.body).toEqual({ lyrics: null, syncedLyrics: '[00:05.00]Typed in\n[00:09.00]By hand', source: 'manual' });
    // Manual lyrics survive a refresh.
    expect((await ctx.authed.get(`/api/tracks/${id}/lyrics?refresh=1`)).body.source).toBe('manual');
    expect(calls).toHaveLength(2);

    const cleared = await ctx.authed.put(`/api/tracks/${id}/lyrics`).send({ lyrics: '', syncedLyrics: null });
    expect(cleared.body.source).toBe('none');
  });

  it('reports a lyrics service outage as 502', async () => {
    const ctx = await createTestApp({
      lyricsFetch: (async () => {
        throw new Error('network down');
      }) as typeof fetch,
    });
    const id = (await uploadTrack(ctx, 'a.wav', makeWav({ title: 'Song', artist: 'Band' }))).body.track.id;
    expect((await ctx.authed.get(`/api/tracks/${id}/lyrics`)).status).toBe(502);
  });
});

describe('filters and facets', () => {
  it('filters by genre, year range, format and sorts in reverse', async () => {
    const ctx = await createTestApp();
    const ids: string[] = [];
    for (const [title, seconds] of [['One', 1], ['Two', 2], ['Three', 3]] as const) {
      ids.push((await uploadTrack(ctx, `${title}.wav`, makeWav({ title, seconds }))).body.track.id);
    }
    await ctx.authed.patch(`/api/tracks/${ids[0]}`).send({ genre: 'Jazz', year: 1990 });
    await ctx.authed.patch(`/api/tracks/${ids[1]}`).send({ genre: 'Jazz', year: 2005 });
    await ctx.authed.patch(`/api/tracks/${ids[2]}`).send({ genre: 'Rock', year: 2020 });

    const titles = async (query: string) =>
      (await ctx.authed.get(`/api/tracks?${query}`)).body.tracks.map((t: { title: string }) => t.title);

    expect(await titles('genre=Jazz&sort=title')).toEqual(['One', 'Two']);
    expect(await titles('yearFrom=2000&yearTo=2010')).toEqual(['Two']);
    expect(await titles('format=audio/wav&sort=duration')).toEqual(['Three', 'Two', 'One']);
    expect(await titles('sort=duration&reverse=true')).toEqual(['One', 'Two', 'Three']);
    expect(await titles('sort=year')).toEqual(['Three', 'Two', 'One']);
    expect(await titles('hasLyrics=true')).toEqual([]);
    expect((await ctx.authed.get('/api/tracks?format=text/html')).status).toBe(400);

    const facets = (await ctx.authed.get('/api/facets')).body.facets;
    expect(facets).toEqual({
      genres: [
        { name: 'Jazz', count: 2 },
        { name: 'Rock', count: 1 },
      ],
      formats: [{ mimeType: 'audio/wav', count: 3 }],
      yearMin: 1990,
      yearMax: 2020,
    });
  });
});
