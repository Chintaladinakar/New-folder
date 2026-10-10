import dotenv from 'dotenv';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { z } from 'zod';

export const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../');

// Tests build their own dependencies and must never pick up real credentials from .env.
if (!process.env.VITEST) {
  // dotenv never overrides a value that is already set, so the file loaded first wins.
  dotenv.config({ path: resolve(projectRoot, '.env.local') });
  dotenv.config({ path: resolve(projectRoot, '.env') });
}

const blankToUndefined = (value: unknown) => (typeof value === 'string' && value.trim() === '' ? undefined : value);
const optionalString = z.preprocess(blankToUndefined, z.string().trim().optional());
const number = (fallback: number, min: number, max: number) =>
  z.preprocess(blankToUndefined, z.coerce.number().min(min).max(max).default(fallback));

const schema = z.object({
  NODE_ENV: z.preprocess(blankToUndefined, z.enum(['development', 'production', 'test']).default('development')),
  PORT: number(4000, 1, 65535),
  TRUST_PROXY: z.preprocess(blankToUndefined, z.coerce.number().int().min(0).max(10).optional()),
  DATABASE_URL: optionalString,
  B2_ENDPOINT: optionalString,
  B2_REGION: z.preprocess(blankToUndefined, z.string().trim().default('us-east-005')),
  B2_BUCKET_NAME: optionalString,
  B2_BUCKET: optionalString,
  B2_KEY_ID: optionalString,
  B2_ACCESS_KEY_ID: optionalString,
  B2_APPLICATION_KEY: optionalString,
  B2_SECRET_ACCESS_KEY: optionalString,
  // Signed read URLs are valid for at least this long and at most twice as long (see B2Storage.getSignedUrl).
  B2_SIGNED_URL_TTL_SECONDS: number(3600, 60, 302400),
  B2_UPLOAD_URL_TTL_SECONDS: number(900, 60, 86400),
  UPLOAD_MAX_SIZE_MB: number(100, 1, 2048),
  AUTH_PASSWORD: optionalString,
  AUTH_SECRET: optionalString,
  AUTH_TOKEN_TTL_DAYS: number(30, 1, 365),
  CORS_ORIGINS: optionalString,
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  const problems = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
  throw new Error(`Invalid environment configuration: ${problems}`);
}
const vars = parsed.data;
const isProduction = vars.NODE_ENV === 'production';

export const MIN_AUTH_SECRET_LENGTH = 32;

export const env = {
  nodeEnv: vars.NODE_ENV,
  isProduction,
  port: vars.PORT,
  // Render and Vercel sit behind one proxy hop; trusting it gives rate limiting the real client IP.
  trustProxy: vars.TRUST_PROXY ?? (isProduction ? 1 : 0),
  databaseUrl: vars.DATABASE_URL,
  b2: {
    endpoint: vars.B2_ENDPOINT ?? '',
    region: vars.B2_REGION,
    bucketName: vars.B2_BUCKET_NAME ?? vars.B2_BUCKET ?? '',
    keyId: vars.B2_KEY_ID ?? vars.B2_ACCESS_KEY_ID ?? '',
    applicationKey: vars.B2_APPLICATION_KEY ?? vars.B2_SECRET_ACCESS_KEY ?? '',
    signedUrlTtlSeconds: vars.B2_SIGNED_URL_TTL_SECONDS,
    uploadUrlTtlSeconds: vars.B2_UPLOAD_URL_TTL_SECONDS,
  },
  uploadMaxSizeBytes: Math.floor(vars.UPLOAD_MAX_SIZE_MB * 1024 * 1024),
  auth: {
    password: vars.AUTH_PASSWORD,
    secret: vars.AUTH_SECRET,
    tokenTtlDays: vars.AUTH_TOKEN_TTL_DAYS,
  },
  // Empty means any origin. That is safe because the API authenticates with a bearer token, which
  // browsers never attach on their own; set CORS_ORIGINS to restrict it anyway.
  corsOrigins: (vars.CORS_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim().replace(/\/$/, ''))
    .filter(Boolean),
};

export function validateB2Config(): { ok: boolean; missing: string[] } {
  const missing: string[] = [];

  if (!env.b2.endpoint) missing.push('B2_ENDPOINT');
  if (!env.b2.region) missing.push('B2_REGION');
  if (!env.b2.bucketName) missing.push('B2_BUCKET_NAME');
  if (!env.b2.keyId) missing.push('B2_KEY_ID');
  if (!env.b2.applicationKey) missing.push('B2_APPLICATION_KEY');

  return { ok: missing.length === 0, missing };
}

export function getConfigProblems(): { fatal: string[]; warnings: string[] } {
  const fatal: string[] = [];
  const warnings: string[] = [];

  if (!env.databaseUrl) fatal.push('DATABASE_URL is not set.');

  const b2 = validateB2Config();
  if (!b2.ok) warnings.push(`Storage is disabled until these are set: ${b2.missing.join(', ')}.`);

  if (!env.auth.password || !env.auth.secret) {
    warnings.push('AUTH_PASSWORD and AUTH_SECRET are not set, so every library endpoint will answer 503.');
  } else if (env.auth.secret.length < MIN_AUTH_SECRET_LENGTH) {
    warnings.push(`AUTH_SECRET must be at least ${MIN_AUTH_SECRET_LENGTH} characters; sign-in is disabled until it is.`);
  }

  return { fatal, warnings };
}
