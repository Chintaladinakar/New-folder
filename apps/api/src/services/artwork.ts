import { createHash } from 'crypto';
import type { MusicStorage } from '../storage/base.js';
import { normalizeImageFormat } from '../utils/file.js';
import type { ExtractedPicture } from './metadataService.js';

const MAX_ARTWORK_BYTES = 10 * 1024 * 1024;

/**
 * Stores cover art under a content-addressed key, so every track of an album shares one object.
 * Returns the key, or null when the picture is unusable.
 */
export async function storeArtwork(storage: MusicStorage, picture: ExtractedPicture): Promise<string | null> {
  const format = normalizeImageFormat(picture.format);
  if (!format || picture.data.length === 0 || picture.data.length > MAX_ARTWORK_BYTES) {
    return null;
  }

  const hash = createHash('sha256').update(picture.data).digest('hex');
  const key = `artwork/${hash}.${format.extension}`;
  if (!(await storage.head(key))) {
    await storage.upload(picture.data, key, format.mimeType, { cacheControl: 'private, max-age=31536000, immutable' });
  }
  return key;
}

/** Parses the base64 data URLs that older versions stored in tracks.artwork_url. */
export function pictureFromDataUrl(dataUrl: string): ExtractedPicture | null {
  const match = dataUrl.match(/^data:([^;,]+);base64,(.+)$/s);
  if (!match) return null;
  return { format: match[1], data: Buffer.from(match[2], 'base64') };
}
