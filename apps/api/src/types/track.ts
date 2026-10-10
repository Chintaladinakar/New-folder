/** A track as one account sees it: isFavorite, playCount and lastPlayedAt are that account's. */
export type TrackRecord = {
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
  storageKey: string;
  fileSize: number;
  mimeType: string;
  artworkKey: string | null;
  contentHash: string | null;
  isFavorite: boolean;
  playCount: number;
  lastPlayedAt: Date | null;
  hasLyrics: boolean;
  lyricsSource: LyricsSource | null;
  createdAt: Date;
  updatedAt: Date;
};

export type LyricsSource = 'embedded' | 'lrclib' | 'manual' | 'none';

export type TrackLyrics = {
  lyrics: string | null;
  syncedLyrics: string | null;
  source: LyricsSource | null;
};

export type TrackInput = {
  fileName: string;
  storageKey: string;
  mimeType: string;
  fileSize: number;
  title: string;
  artist?: string | null;
  album?: string | null;
  albumArtist?: string | null;
  genre?: string | null;
  year?: number | null;
  duration?: number | null;
  trackNumber?: number | null;
  discNumber?: number | null;
  artworkKey?: string | null;
  contentHash?: string | null;
  lyrics?: string | null;
  syncedLyrics?: string | null;
};

/** Tags the admin can edit after upload. (Favorites are per account; see TrackService.setFavorite.) */
export type TrackPatch = Partial<
  Pick<TrackRecord, 'title' | 'artist' | 'album' | 'albumArtist' | 'genre' | 'year' | 'trackNumber' | 'discNumber'>
>;

/** What the API sends to the browser: storage internals replaced by signed URLs. */
export type PublicTrack = Omit<TrackRecord, 'storageKey' | 'artworkKey' | 'contentHash'> & {
  artworkUrl: string | null;
  streamUrl: string | null;
  urlsExpireAt: string | null;
};

export type TrackSort = 'recent' | 'title' | 'artist' | 'album' | 'played' | 'album-order' | 'duration' | 'plays' | 'year';

export type TrackListOptions = {
  limit: number;
  offset: number;
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
  sort: TrackSort;
  /** Flip the sort's natural direction. */
  reverse?: boolean;
};

export type ListeningStats = {
  days: number;
  plays: number;
  /** Sum of the played tracks' lengths, not time actually listened. */
  seconds: number;
  genres: { name: string; plays: number; seconds: number }[];
  artists: { name: string; plays: number }[];
};

export type LibraryFacets = {
  genres: { name: string; count: number }[];
  formats: { mimeType: string; count: number }[];
  yearMin: number | null;
  yearMax: number | null;
};

export type AlbumSummary = {
  name: string;
  artist: string | null;
  trackCount: number;
  year: number | null;
  duration: number;
  artworkKey: string | null;
};

export type ArtistSummary = {
  name: string;
  trackCount: number;
  albumCount: number;
  artworkKey: string | null;
};

export type LibraryStats = {
  trackCount: number;
  albumCount: number;
  artistCount: number;
  favoriteCount: number;
  totalBytes: number;
  totalDuration: number;
};
