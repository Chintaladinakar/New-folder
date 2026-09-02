import dotenv from 'dotenv';

import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../');

dotenv.config({ path: resolve(projectRoot, '.env') });
dotenv.config({ path: resolve(projectRoot, '.env.local') });

const b2BucketName = process.env.B2_BUCKET_NAME ?? process.env.B2_BUCKET ?? 'personal-mp3-player';
const b2KeyId = process.env.B2_KEY_ID ?? process.env.B2_ACCESS_KEY_ID ?? '';
const b2ApplicationKey = process.env.B2_APPLICATION_KEY ?? process.env.B2_SECRET_ACCESS_KEY ?? '';

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: process.env.DATABASE_URL ?? 'postgresql://neondb_owner:your-password@ep-example.us-east-2.aws.neon.tech/neondb?sslmode=require',
  b2Endpoint: process.env.B2_ENDPOINT ?? '',
  b2Region: process.env.B2_REGION ?? 'us-east-005',
  b2BucketName,
  b2KeyId,
  b2ApplicationKey,
  b2PublicUrl: process.env.B2_PUBLIC_URL ?? '',
  b2SignedUrlTtlSeconds: Number(process.env.B2_SIGNED_URL_TTL_SECONDS ?? 3600),
  uploadMaxSizeMb: Number(process.env.UPLOAD_MAX_SIZE_MB ?? 100),
  viteApiBaseUrl: process.env.VITE_API_BASE_URL ?? 'http://localhost:4000/api',
};

export function validateB2Config(): { ok: boolean; missing: string[] } {
  const missing: string[] = [];

  if (!env.b2Endpoint) missing.push('B2_ENDPOINT');
  if (!env.b2Region) missing.push('B2_REGION');
  if (!env.b2BucketName) missing.push('B2_BUCKET_NAME');
  if (!env.b2KeyId) missing.push('B2_KEY_ID');
  if (!env.b2ApplicationKey) missing.push('B2_APPLICATION_KEY');
  if (!Number.isFinite(env.b2SignedUrlTtlSeconds) || env.b2SignedUrlTtlSeconds <= 0) {
    missing.push('B2_SIGNED_URL_TTL_SECONDS');
  }

  return { ok: missing.length === 0, missing };
}
