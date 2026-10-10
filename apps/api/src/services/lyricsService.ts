import { TimestampFormat, type ILyricsTag } from 'music-metadata';

export type LyricsResult = { lyrics: string | null; syncedLyrics: string | null };

const LRCLIB_URL = 'https://lrclib.net/api/get';
const MAX_LYRICS_LENGTH = 50_000;

const clean = (text: string | null | undefined): string | null => {
  const trimmed = (text ?? '').replace(/\r\n?/g, '\n').replace(/\0/g, '').trim();
  return trimmed ? trimmed.slice(0, MAX_LYRICS_LENGTH) : null;
};

const pad = (value: number, width: number) => String(value).padStart(width, '0');

/** Formats a timestamp in milliseconds as an LRC tag, e.g. [01:23.45]. */
export function lrcTimestamp(ms: number): string {
  const totalCs = Math.max(0, Math.round(ms / 10));
  const minutes = Math.floor(totalCs / 6000);
  const seconds = Math.floor((totalCs % 6000) / 100);
  return `[${pad(minutes, 2)}:${pad(seconds, 2)}.${pad(totalCs % 100, 2)}]`;
}

/** Lyrics embedded in the file's tags (ID3 USLT/SYLT, Vorbis LYRICS, iTunes ©lyr). */
export function lyricsFromTags(tags: ILyricsTag[] | undefined): LyricsResult {
  let lyrics: string | null = null;
  let syncedLyrics: string | null = null;

  for (const tag of tags ?? []) {
    if (!syncedLyrics && tag.syncText?.length && tag.syncText.some((line) => typeof line.timestamp === 'number')) {
      // Timestamps are in milliseconds for the common ID3 format; frame-based timestamps are rare and skipped.
      if (tag.timeStampFormat === TimestampFormat.milliseconds || tag.timeStampFormat === undefined) {
        syncedLyrics = clean(
          tag.syncText
            .filter((line) => typeof line.timestamp === 'number')
            .map((line) => `${lrcTimestamp(line.timestamp as number)}${line.text.replace(/\n+$/, '')}`)
            .join('\n'),
        );
      }
    }
    if (!lyrics) lyrics = clean(tag.text);
  }

  return { lyrics, syncedLyrics };
}

/** True when the text has at least one [mm:ss.xx] line, i.e. it is in LRC format. */
export function looksSynced(text: string | null): boolean {
  return text !== null && /^\[\d{1,2}:\d{2}(?:[.:]\d{1,3})?\]/m.test(text);
}

export type LyricsLookup = {
  title: string;
  artist: string | null;
  album: string | null;
  duration: number | null;
};

/**
 * Looks lyrics up on lrclib.net, a free, open lyrics database that needs no API key.
 * Returns null when nothing matches. Network failures throw.
 */
export async function fetchLyricsFromLrclib(
  lookup: LyricsLookup,
  fetchImpl: typeof fetch = fetch,
): Promise<LyricsResult | null> {
  if (!lookup.artist) return null;

  const params = new URLSearchParams({ track_name: lookup.title, artist_name: lookup.artist });
  if (lookup.album) params.set('album_name', lookup.album);
  if (lookup.duration) params.set('duration', String(Math.round(lookup.duration)));

  const response = await fetchImpl(`${LRCLIB_URL}?${params}`, {
    headers: { 'User-Agent': 'personal-mp3-player (https://github.com/Chintaladinakar/New-folder)' },
    signal: AbortSignal.timeout(8000),
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Lyrics lookup failed (HTTP ${response.status})`);

  const body = (await response.json()) as { plainLyrics?: string | null; syncedLyrics?: string | null; instrumental?: boolean };
  const result = { lyrics: clean(body.plainLyrics), syncedLyrics: clean(body.syncedLyrics) };
  if (!result.lyrics && !result.syncedLyrics) {
    return body.instrumental ? { lyrics: '[Instrumental]', syncedLyrics: null } : null;
  }
  return result;
}
