import type { Readable } from 'stream';

export type StoredObject = { size: number; contentType: string | null };

export type ListedObject = { key: string; size: number; lastModified: Date | null };

export type SignedUrl = { url: string; expiresAt: Date };

export interface MusicStorage {
  readonly bucket: string;
  readonly region: string;
  upload(body: Uint8Array, key: string, contentType: string, options?: { cacheControl?: string }): Promise<void>;
  /** A presigned PUT URL the browser uploads to directly. */
  getUploadUrl(key: string, contentType: string): Promise<string>;
  /** Size and type of an object, or null when it does not exist. */
  head(key: string): Promise<StoredObject | null>;
  delete(key: string): Promise<void>;
  getSignedUrl(key: string): Promise<SignedUrl>;
  getObject(key: string): Promise<Readable>;
  list(prefix: string): AsyncIterable<ListedObject>;
  testConnection(): Promise<void>;
}
