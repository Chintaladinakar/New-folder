import type { MusicStorage, SignedUrl } from '../storage/base.js';
import type { PlaylistEntryRecord, PlaylistRecord, PublicPlaylist, PublicPlaylistEntry } from '../types/playlist.js';
import type { AlbumSummary, ArtistSummary, PublicTrack, TrackRecord } from '../types/track.js';

/** Turns storage keys into short-lived signed URLs; storage internals never reach the browser. */
export class Presenter {
  constructor(private readonly storage: MusicStorage | null) {}

  async signedUrl(key: string | null): Promise<SignedUrl | null> {
    if (!key || !this.storage) return null;
    return this.storage.getSignedUrl(key);
  }

  async track(track: TrackRecord): Promise<PublicTrack> {
    const { storageKey, artworkKey, contentHash: _contentHash, ...rest } = track;
    // Lyrics text is fetched separately per track; lists only carry hasLyrics.
    const [artwork, stream] = await Promise.all([this.signedUrl(artworkKey), this.signedUrl(storageKey)]);
    return {
      ...rest,
      artworkUrl: artwork?.url ?? null,
      streamUrl: stream?.url ?? null,
      urlsExpireAt: stream?.expiresAt.toISOString() ?? null,
    };
  }

  tracks(tracks: TrackRecord[]): Promise<PublicTrack[]> {
    return Promise.all(tracks.map((track) => this.track(track)));
  }

  async withArtwork<T extends AlbumSummary | ArtistSummary | PlaylistRecord>(
    item: T,
  ): Promise<Omit<T, 'artworkKey'> & { artworkUrl: string | null }> {
    const { artworkKey, ...rest } = item;
    return { ...rest, artworkUrl: (await this.signedUrl(artworkKey))?.url ?? null };
  }

  playlist(playlist: PlaylistRecord): Promise<PublicPlaylist> {
    return this.withArtwork(playlist);
  }

  async entries(entries: PlaylistEntryRecord[]): Promise<PublicPlaylistEntry[]> {
    return Promise.all(
      entries.map(async (entry) => ({ entryId: entry.entryId, position: entry.position, track: await this.track(entry.track) })),
    );
  }
}
