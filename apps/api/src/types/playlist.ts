import type { PublicTrack, TrackRecord } from './track.js';

export type PlaylistRecord = {
  id: string;
  name: string;
  description: string | null;
  trackCount: number;
  duration: number;
  artworkKey: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type PlaylistEntryRecord = {
  entryId: string;
  position: number;
  track: TrackRecord;
};

export type PublicPlaylist = Omit<PlaylistRecord, 'artworkKey'> & { artworkUrl: string | null };

export type PublicPlaylistEntry = {
  entryId: string;
  position: number;
  track: PublicTrack;
};
