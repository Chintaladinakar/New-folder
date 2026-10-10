import { z } from 'zod';

export const uuid = z.string().uuid('Not found');

const booleanFlag = z.enum(['true', 'false', '1', '0']).transform((value) => value === 'true' || value === '1');

const optionalFilter = z.string().trim().min(1).max(500).optional();

const yearParam = z.coerce.number().int().min(1).max(9999).optional();

export const listTracksQuery = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).max(1_000_000).default(0),
  q: z.string().trim().max(200).optional().transform((value) => value || undefined),
  artist: optionalFilter,
  album: optionalFilter,
  albumArtist: optionalFilter,
  genre: optionalFilter,
  yearFrom: yearParam,
  yearTo: yearParam,
  format: z.string().trim().regex(/^audio\/[a-z0-9.+-]+$/i).optional(),
  favorite: booleanFlag.optional(),
  played: booleanFlag.optional(),
  hasLyrics: booleanFlag.optional(),
  sort: z.enum(['recent', 'title', 'artist', 'album', 'played', 'album-order', 'duration', 'plays', 'year']).optional(),
  reverse: booleanFlag.optional(),
});

export const listeningQuery = z.object({
  days: z.coerce.number().int().min(1).max(3650).default(30),
});

const lyricsText = z
  .string()
  .max(50_000, 'Lyrics are too long')
  .nullable()
  .transform((value) => (value?.trim() ? value.replace(/\r\n?/g, '\n').trim() : null));

export const setLyricsBody = z.object({
  lyrics: lyricsText.optional(),
  syncedLyrics: lyricsText.optional(),
});

const contentHash = z
  .string()
  .regex(/^[a-f0-9]{64}$/, 'contentHash must be a lower-case SHA-256 hex digest')
  .optional();

const fileName = z.string().trim().min(1, 'File name is required').max(255, 'File name is too long (255 characters at most)');

export const uploadUrlBody = z.object({
  fileName,
  fileSize: z.number().int().positive('File is empty'),
  contentHash,
});

export const completeUploadBody = z.object({
  fileName,
  storageKey: z.string().regex(/^tracks\/[0-9a-f-]{36}\.[a-z0-9]{2,5}$/, 'Invalid storage key'),
  contentHash,
});

const nullableText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .transform((value) => (value === '' ? null : value));

const nullablePositiveInt = (max: number) => z.number().int().min(1).max(max).nullable();

export const updateTrackBody = z
  .object({
    title: z.string().trim().min(1, 'Title cannot be empty').max(500),
    artist: nullableText(500),
    album: nullableText(500),
    albumArtist: nullableText(500),
    genre: nullableText(200),
    year: nullablePositiveInt(9999),
    trackNumber: nullablePositiveInt(99999),
    discNumber: nullablePositiveInt(999),
    isFavorite: z.boolean(),
  })
  .partial()
  .strict();

export const loginBody = z.object({
  password: z.string().min(1, 'Password is required').max(1000),
});

// Lenient on the way in (a wrong shape is just a wrong PIN); strict when the admin sets one.
export const pinLoginBody = z.object({
  username: z.string().trim().min(1, 'Username is required').max(64),
  pin: z.string().min(1, 'PIN is required').max(20),
});

export const pinField = z.string().regex(/^\d{6}$/, 'The PIN must be exactly 6 digits');

const username = z
  .string()
  .trim()
  .toLowerCase()
  .regex(
    /^[a-z0-9][a-z0-9._-]{2,31}$/,
    'Usernames are 3 to 32 characters: letters, digits, dots, dashes and underscores, starting with a letter or digit',
  );

const displayName = z
  .string()
  .trim()
  .max(60, 'Names are 60 characters at most')
  .nullable()
  .transform((value) => value || null);

export const createAccountBody = z
  .object({ username, displayName: displayName.optional(), pin: pinField.optional() })
  .strict();

export const updateAccountBody = z.object({ displayName: displayName.optional(), disabled: z.boolean().optional() }).strict();

export const resetPinBody = z.object({ pin: pinField.optional() }).strict();

export const changePinBody = z.object({ currentPin: z.string().max(20), newPin: pinField }).strict();

export const finishPlayBody = z
  .object({ listenedSeconds: z.number().int().min(0).max(86_400), completed: z.boolean() })
  .strict();

export const playId = z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER);

export const radioQuery = z
  .object({ track: z.string().uuid('Not found').optional(), artist: z.string().trim().min(1).max(500).optional() })
  .refine((query) => Boolean(query.track) !== Boolean(query.artist), 'Start a radio from a track or an artist');

export const createPlaylistBody = z.object({
  name: z.string().trim().min(1, 'Name is required').max(200),
  description: nullableText(2000).optional(),
});

export const updatePlaylistBody = createPlaylistBody.partial().strict();

export const addPlaylistTracksBody = z.object({
  trackIds: z.array(z.string().uuid()).min(1).max(1000),
});

export const reorderPlaylistBody = z.object({
  entryIds: z.array(z.string().uuid()).max(10000),
});
