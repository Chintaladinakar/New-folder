/** localStorage that never throws (private mode, blocked storage, quota exceeded). */
export const safeStorage = {
  getItem(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {
      // Losing a saved preference is better than breaking playback.
    }
  },
  removeItem(key: string): void {
    try {
      localStorage.removeItem(key);
    } catch {
      // Ignore.
    }
  },
};

/** SHA-256 of a file as lower-case hex, or undefined where Web Crypto is unavailable (plain-HTTP origins). */
export async function sha256Hex(file: Blob): Promise<string | undefined> {
  if (!globalThis.crypto?.subtle || file.size > 512 * 1024 * 1024) return undefined;
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** The single <audio> element the whole app plays through. */
let audioElement: HTMLAudioElement | null = null;

export function getAudioElement(): HTMLAudioElement {
  if (!audioElement) {
    audioElement = new Audio();
    audioElement.preload = 'auto';
  }
  return audioElement;
}
