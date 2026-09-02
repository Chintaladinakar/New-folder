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
  artworkUrl: string | null;
  createdAt: string;
  updatedAt: string;
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
  artworkUrl?: string | null;
};
