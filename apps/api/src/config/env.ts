import dotenv from 'dotenv';

dotenv.config({ path: ['.env.local', '.env'] });

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/personal_mp3_player',
  b2Endpoint: process.env.B2_ENDPOINT ?? '',
  b2Region: process.env.B2_REGION ?? 'us-east-005',
  b2Bucket: process.env.B2_BUCKET ?? 'personal-mp3-player',
  b2AccessKeyId: process.env.B2_ACCESS_KEY_ID ?? '',
  b2SecretAccessKey: process.env.B2_SECRET_ACCESS_KEY ?? '',
  b2PublicUrl: process.env.B2_PUBLIC_URL ?? '',
  b2SignedUrlTtlSeconds: Number(process.env.B2_SIGNED_URL_TTL_SECONDS ?? 3600),
  uploadMaxSizeMb: Number(process.env.UPLOAD_MAX_SIZE_MB ?? 100),
  viteApiBaseUrl: process.env.VITE_API_BASE_URL ?? 'http://localhost:4000/api',
};
