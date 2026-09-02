import type { Readable } from 'stream';

export interface MusicStorage {
  upload(file: Buffer | Uint8Array | Readable, key: string, contentType: string): Promise<string>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  getSignedUrl(key: string, expiresIn?: number): Promise<string>;
  getObject(key: string): Promise<Readable>;
}
