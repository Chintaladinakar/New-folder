/** Lower-case extension without the dot, or '' when there is none. */
export function getFileExtension(fileName: string): string {
  const base = fileName.split(/[\\/]/).pop() ?? '';
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : '';
}

export function stripExtension(fileName: string): string {
  return fileName.replace(/\.[^/.]+$/, '');
}

/** A readable fallback title from a file name, e.g. "01_my_song.mp3" -> "01 my song". */
export function titleFromFileName(fileName: string): string {
  const base = stripExtension(fileName.split(/[\\/]/).pop() ?? '')
    .replace(/_+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return base || 'Untitled Track';
}

const AUDIO_MIME_TYPES: Record<string, string> = {
  aac: 'audio/aac',
  flac: 'audio/flac',
  m4a: 'audio/mp4',
  mp3: 'audio/mpeg',
  oga: 'audio/ogg',
  ogg: 'audio/ogg',
  opus: 'audio/ogg',
  wav: 'audio/wav',
  webm: 'audio/webm',
};

export const SUPPORTED_AUDIO_FORMATS = 'AAC, FLAC, M4A, MP3, OGG, OPUS, WAV, and WEBM';

/**
 * The Content-Type to store an upload under, chosen from its extension.
 * Browsers report inconsistent (often empty) types for audio, so the client's value is ignored.
 */
export function audioMimeTypeFor(fileName: string): string | null {
  return AUDIO_MIME_TYPES[getFileExtension(fileName)] ?? null;
}

const IMAGE_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/bmp': 'bmp',
};

/** Normalises the picture formats found in tags ("image/jpg", "JPG", "png") to a MIME type and extension. */
export function normalizeImageFormat(format: string): { mimeType: string; extension: string } | null {
  const lower = format.trim().toLowerCase();
  const mimeType = lower.includes('/') ? lower : `image/${lower}`;
  const extension = IMAGE_EXTENSIONS[mimeType];
  return extension ? { mimeType: mimeType === 'image/jpg' ? 'image/jpeg' : mimeType, extension } : null;
}
