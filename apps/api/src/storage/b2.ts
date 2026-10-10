import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { Readable } from 'stream';
import { env, validateB2Config } from '../config/env.js';
import type { ListedObject, MusicStorage, SignedUrl, StoredObject } from './base.js';

function isNotFound(error: unknown): boolean {
  const s3Error = error as { name?: string; $metadata?: { httpStatusCode?: number } } | null;
  return s3Error?.name === 'NotFound' || s3Error?.name === 'NoSuchKey' || s3Error?.$metadata?.httpStatusCode === 404;
}

export class B2Storage implements MusicStorage {
  readonly bucket = env.b2.bucketName;
  readonly region = env.b2.region;
  private client: S3Client;

  constructor() {
    const config = validateB2Config();
    if (!config.ok) {
      throw new Error(`Missing Backblaze B2 configuration: ${config.missing.join(', ')}`);
    }

    this.client = new S3Client({
      region: env.b2.region,
      endpoint: env.b2.endpoint,
      credentials: {
        accessKeyId: env.b2.keyId,
        secretAccessKey: env.b2.applicationKey,
      },
      forcePathStyle: false,
    });
  }

  async upload(body: Uint8Array, key: string, contentType: string, options: { cacheControl?: string } = {}): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        CacheControl: options.cacheControl,
      }),
    );
  }

  async getUploadUrl(key: string, contentType: string): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
    });

    return getSignedUrl(this.client, command, { expiresIn: env.b2.uploadUrlTtlSeconds });
  }

  async head(key: string): Promise<StoredObject | null> {
    try {
      const response = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return { size: response.ContentLength ?? 0, contentType: response.ContentType ?? null };
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  /**
   * Signs a GET URL. The signing time is rounded down to a TTL-sized window, so every request in
   * the same window gets the identical URL and the browser can reuse cached audio and artwork.
   * Each URL stays valid for at least one full TTL.
   */
  async getSignedUrl(key: string): Promise<SignedUrl> {
    const windowMs = env.b2.signedUrlTtlSeconds * 1000;
    const signingDate = new Date(Math.floor(Date.now() / windowMs) * windowMs);
    const expiresIn = env.b2.signedUrlTtlSeconds * 2;
    const url = await getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: key }), {
      expiresIn,
      signingDate,
    });
    return { url, expiresAt: new Date(signingDate.getTime() + expiresIn * 1000) };
  }

  async getObject(key: string): Promise<Readable> {
    const response = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    return response.Body as Readable;
  }

  async *list(prefix: string): AsyncIterable<ListedObject> {
    let continuationToken: string | undefined;
    do {
      const page = await this.client.send(
        new ListObjectsV2Command({ Bucket: this.bucket, Prefix: prefix, ContinuationToken: continuationToken }),
      );
      for (const item of page.Contents ?? []) {
        if (item.Key) {
          yield { key: item.Key, size: item.Size ?? 0, lastModified: item.LastModified ?? null };
        }
      }
      continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (continuationToken);
  }

  async testConnection(): Promise<void> {
    await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
  }
}

/** Storage is optional at startup so the API can still report what is misconfigured. */
export function createB2StorageOrNull(): MusicStorage | null {
  try {
    return new B2Storage();
  } catch (error) {
    console.warn(`Storage disabled: ${(error as Error).message}`);
    return null;
  }
}
