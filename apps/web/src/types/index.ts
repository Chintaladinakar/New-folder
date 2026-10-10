export type Track = {
  id: string;
  title: string;
  artist: string | null;
  album: string | null;
  albumArtist: string | null;
  genre: string | null;
  year: number | null;
  duration: number | null;
  trackNumber: number | null;
  discNumber: number | null;
  fileName: string;
  fileSize: number;
  mimeType: string;
  isFavorite: boolean;
  playCount: number;
  lastPlayedAt: string | null;
  hasLyrics: boolean;
  lyricsSource: LyricsSource | null;
  createdAt: string;
  updatedAt: string;
  /** Signed URLs; both expire at `urlsExpireAt`. */
  artworkUrl: string | null;
  streamUrl: string | null;
  urlsExpireAt: string | null;
};

export type LyricsSource = 'embedded' | 'lrclib' | 'manual' | 'none';

export type TrackLyrics = { lyrics: string | null; syncedLyrics: string | null; source: LyricsSource | null };

export type TrackSort = 'recent' | 'title' | 'artist' | 'album' | 'played' | 'album-order' | 'duration' | 'plays' | 'year';

export type TrackFilters = {
  q?: string;
  artist?: string;
  album?: string;
  albumArtist?: string;
  genre?: string;
  yearFrom?: number;
  yearTo?: number;
  format?: string;
  favorite?: boolean;
  played?: boolean;
  hasLyrics?: boolean;
  sort?: TrackSort;
  reverse?: boolean;
};

export type LibraryFacets = {
  genres: { name: string; count: number }[];
  formats: { mimeType: string; count: number }[];
  yearMin: number | null;
  yearMax: number | null;
};

export type TrackPage = { tracks: Track[]; total: number };

export type TrackPatch = Partial<
  Pick<Track, 'title' | 'artist' | 'album' | 'albumArtist' | 'genre' | 'year' | 'trackNumber' | 'discNumber' | 'isFavorite'>
>;

export type Album = {
  name: string;
  artist: string | null;
  trackCount: number;
  year: number | null;
  duration: number;
  artworkUrl: string | null;
};

export type Artist = {
  name: string;
  trackCount: number;
  albumCount: number;
  artworkUrl: string | null;
};

export type Playlist = {
  id: string;
  name: string;
  description: string | null;
  trackCount: number;
  duration: number;
  artworkUrl: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PlaylistEntry = { entryId: string; position: number; track: Track };

export type LibraryStats = {
  trackCount: number;
  albumCount: number;
  artistCount: number;
  favoriteCount: number;
  totalBytes: number;
  totalDuration: number;
};

export type HealthStatus = {
  ok: boolean;
  status: string;
  database: 'ok' | 'unreachable';
  storage: 'configured' | 'not_configured';
  auth: 'configured' | 'not_configured';
};

export type StorageHealth = {
  ok: boolean;
  status: string;
  bucket: string | null;
  region?: string;
  missing?: string[];
};

export type Role = 'admin' | 'listener';

/** The signed-in account. */
export type SessionUser = { id: string; username: string; displayName: string | null; role: Role };

/** An account as the admin panel shows it. */
export type Account = SessionUser & {
  createdAt: string;
  lastLoginAt: string | null;
  lastSeenAt: string | null;
  lastPlayedAt: string | null;
  disabled: boolean;
  locked: boolean;
  plays30d: number;
  favoriteCount: number;
  playlistCount: number;
};

export type MixKind = 'daily' | 'discover' | 'on-repeat' | 'rewind';

export type MixSummary = {
  id: string;
  kind: MixKind;
  title: string;
  description: string;
  artists: string[];
  trackCount: number;
  /** Seconds. */
  duration: number;
  /** Up to four artwork URLs from the start of the mix, for a collage. */
  covers: string[];
};

export type RecommendationShelf = { id: string; title: string; tracks: Track[] };

export type Recommendations = { coldStart: boolean; mixes: MixSummary[]; shelves: RecommendationShelf[] };

export type ListeningStats = {
  days: number;
  plays: number;
  /** Time listened where the player reported it, otherwise the played tracks' lengths. Skips don't count. */
  seconds: number;
  genres: { name: string; plays: number; seconds: number }[];
  artists: { name: string; plays: number }[];
};
