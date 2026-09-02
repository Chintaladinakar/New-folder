import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { Readable } from 'stream';
import { env } from '../config/env.js';
import type { MusicStorage } from './base.js';

export class B2Storage implements MusicStorage {
  private client: S3Client;

  constructor() {
    this.client = new S3Client({
      region: env.b2Region,
      endpoint: env.b2Endpoint,
      credentials: {
        accessKeyId: env.b2AccessKeyId,
        secretAccessKey: env.b2SecretAccessKey,
      },
      forcePathStyle: false,
    });
  }

  async upload(file: Buffer | Uint8Array | Readable, key: string, contentType: string): Promise<string> {
    const body = Buffer.isBuffer(file) ? file : Buffer.from(file as Uint8Array);

    await this.client.send(
      new PutObjectCommand({
        Bucket: env.b2Bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );

    return key;
  }

  async delete(key: string): Promise<void> {
    await this.client.send({
      Bucket: env.b2Bucket,
      Key: key,
      Delete: { Objects: [{ Key: key }] },
    } as never);
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.client.send(
        new HeadObjectCommand({
          Bucket: env.b2Bucket,
          Key: key,
        }),
      );
      return true;
    } catch {
      return false;
    }
  }

  async getSignedUrl(key: string, expiresIn = env.b2SignedUrlTtlSeconds): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: env.b2Bucket,
      Key: key,
    });

    return getSignedUrl(this.client, command, {
      expiresIn,
    });
  }

  async getObject(key: string): Promise<Readable> {
    const command = new GetObjectCommand({
      Bucket: env.b2Bucket,
      Key: key,
    });

    const response = await this.client.send(command);
    return response.Body as Readable;
  }
}
