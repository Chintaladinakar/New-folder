import * as mm from 'music-metadata';
import type { IAudioMetadata } from 'music-metadata';

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
  artworkUrl: string | null;
};

export class MetadataService {
  async extractMetadata(file: Express.Multer.File): Promise<MetadataExtractionResult> {
    const metadata = await mm.parseBuffer(file.buffer, file.mimetype || 'audio/mpeg');
    const common = metadata.common;
    const trackNumber = this.parseNumber(common.track?.no);
    const discNumber = this.parseNumber(common.disk?.no);
    const title = common.title ?? this.fromFilename(file.originalname, 'title');
    const artist = common.artist ?? null;
    const album = common.album ?? null;
    const albumArtist = common.albumartist ?? null;
    const genre = common.genre?.[0] ?? null;
    const year = this.parseYear(common.year);
    const duration = metadata.format.duration ?? null;
    const artworkUrl = this.extractArtwork(common.picture, file.originalname);

    return {
      title,
      artist,
      album,
      albumArtist,
      genre,
      year,
      duration,
      trackNumber,
      discNumber,
      artworkUrl,
    };
  }

  private parseNumber(value: unknown): number | null {
    if (typeof value === 'number') return value;
    if (typeof value === 'string' && value.trim() !== '') {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  }

  private parseYear(value: unknown): number | null {
    if (typeof value === 'number') return value;
    if (Array.isArray(value)) {
      const first = value[0];
      if (typeof first === 'number') return first;
      if (typeof first === 'string') return Number(first) || null;
    }
    if (typeof value === 'string') {
      const match = value.match(/(\d{4})/);
      return match ? Number(match[1]) : null;
    }
    return null;
  }

  private extractArtwork(pictures: IAudioMetadata['common']['picture'] = [], fileName: string): string | null {
    const firstPicture = pictures[0];
    if (!firstPicture) {
      return null;
    }

    const base64 = Buffer.from(firstPicture.data).toString('base64');
    return `data:${firstPicture.format};base64,${base64}`;
  }

  private fromFilename(fileName: string, mode: 'title'): string {
    const base = fileName.replace(/\.[^/.]+$/, '').replace(/[_-]+/g, ' ').trim();
    if (mode === 'title') {
      return base || 'Untitled Track';
    }
    return 'Untitled Track';
  }
}
