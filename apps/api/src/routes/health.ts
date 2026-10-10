import { Router } from 'express';
import type { AppDeps } from '../deps.js';
import { validateB2Config } from '../config/env.js';
import { requireAdmin } from '../http/middleware.js';

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('timed out')), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/** Public: reports only whether each part is working, never configuration details. */
export function createPublicHealthRouter(deps: AppDeps): Router {
  const router = Router();

  router.get('/health', async (_req, res) => {
    const database = await withTimeout(deps.checkDatabase(), 5000).then(
      () => 'ok' as const,
      () => 'unreachable' as const,
    );
    const ok = database === 'ok';
    res.status(ok ? 200 : 503).json({
      ok,
      status: ok ? 'healthy' : 'degraded',
      database,
      storage: deps.storage ? 'configured' : 'not_configured',
      auth: deps.auth.isConfigured ? 'configured' : 'not_configured',
    });
  });

  return router;
}

/** Admin only: checks the bucket and names any missing settings. */
export function createStorageHealthRouter(deps: AppDeps): Router {
  const router = Router();

  router.get('/storage/b2/health', requireAdmin, async (_req, res) => {
    const config = validateB2Config();
    if (!deps.storage) {
      res.status(503).json({ ok: false, status: 'misconfigured', missing: config.missing, bucket: null });
      return;
    }

    try {
      await withTimeout(deps.storage.testConnection(), 10000);
      res.json({ ok: true, status: 'accessible', bucket: deps.storage.bucket, region: deps.storage.region });
    } catch (error) {
      console.error('Storage health check failed:', error);
      res.status(503).json({ ok: false, status: 'unreachable', bucket: deps.storage.bucket, region: deps.storage.region });
    }
  });

  return router;
}
