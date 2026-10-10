import { parseStream, type IAudioMetadata } from 'music-metadata';
import type { Readable } from 'stream';
import { titleFromFileName } from '../utils/file.js';
import { lyricsFromTags } from './lyricsService.js';

export type ExtractedPicture = {
  data: Uint8Array;
  format: string;
};

export type MetadataExtractionResult = {
  title: string;
  artist: string | null;
  album: string | null;
  albumArtist: string | null;
  genre: string | null;
  year: number | null;
  duration: number | null;
  trackNumber: number | null;
  discNumber: number | null;
  picture: ExtractedPicture | null;
  lyrics: string | null;
  syncedLyrics: string | null;
};

export class MetadataService {
  /**
   * Reads tags from an audio stream. Passing the size lets the parser estimate the duration of
   * constant-bitrate MP3s that have no Xing/VBRI header.
   */
  async extractMetadataFromStream(
    stream: Readable,
    fileInfo: { mimeType: string; size: number },
    originalName: string,
  ): Promise<MetadataExtractionResult> {
    try {
      const metadata = await parseStream(stream, fileInfo, { skipPostHeaders: true });
      // For most formats the parser returns empty results instead of throwing on non-audio data.
      const { container, codec, sampleRate } = metadata.format;
      if (!container && !codec && !sampleRate) {
        throw new Error('No audio stream found');
      }
      return this.mapMetadata(metadata, originalName);
    } finally {
      // The parser stops once it has the tags; release the rest of the download.
      stream.destroy();
    }
  }

  mapMetadata(metadata: IAudioMetadata, originalName: string): MetadataExtractionResult {
    const common = metadata.common;
    const firstPicture = common.picture?.[0];
    const duration = metadata.format.duration;

    return {
      title: this.cleanText(common.title) ?? titleFromFileName(originalName),
      artist: this.cleanText(common.artist),
      album: this.cleanText(common.album),
      albumArtist: this.cleanText(common.albumartist),
      genre: this.cleanText(common.genre?.[0]),
      year: this.parseYear(common.year),
      duration: typeof duration === 'number' && Number.isFinite(duration) && duration > 0 ? Math.round(duration) : null,
      trackNumber: this.parsePositiveInt(common.track?.no),
      discNumber: this.parsePositiveInt(common.disk?.no),
      picture: firstPicture?.data?.length ? { data: firstPicture.data, format: firstPicture.format } : null,
      ...lyricsFromTags(common.lyrics),
    };
  }

  private cleanText(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const trimmed = value.replace(/\0/g, '').trim();
    return trimmed === '' ? null : trimmed.slice(0, 500);
  }

  private parsePositiveInt(value: unknown): number | null {
    const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value.trim()) : NaN;
    return Number.isInteger(parsed) && parsed > 0 && parsed < 100000 ? parsed : null;
  }

  private parseYear(value: unknown): number | null {
    const raw = Array.isArray(value) ? value[0] : value;
    const year =
      typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw.match(/\d{4}/)?.[0] ?? NaN) : NaN;
    return Number.isInteger(year) && year > 0 && year < 10000 ? year : null;
  }
}
