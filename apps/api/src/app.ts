import cors from 'cors';
import express from 'express';
import { env } from './config/env.js';
import type { AppDeps } from './deps.js';
import { errorHandler } from './http/errors.js';
import { rateLimit, rejectNulBytes, requireAdmin, requireAuth, securityHeaders } from './http/middleware.js';
import { createAdminRouter } from './routes/admin.js';
import { createAuthRouter } from './routes/auth.js';
import { createPublicHealthRouter, createStorageHealthRouter } from './routes/health.js';
import { createLibraryRouter } from './routes/library.js';
import { createPlaylistsRouter } from './routes/playlists.js';
import { createPlaysRouter } from './routes/plays.js';
import { createRecommendationsRouter } from './routes/recommendations.js';
import { createTracksRouter } from './routes/tracks.js';

export function createApp(deps: AppDeps, options: { corsOrigins?: string[]; trustProxy?: number } = {}) {
  const corsOrigins = options.corsOrigins ?? env.corsOrigins;
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', options.trustProxy ?? env.trustProxy);
  app.use(securityHeaders);
  app.use(
    cors({
      origin: corsOrigins.length === 0 ? true : (origin, callback) => callback(null, !origin || corsOrigins.includes(origin)),
      maxAge: 600,
    }),
  );
  app.use(express.json({ limit: '100kb' }));
  app.use(rejectNulBytes);

  app.get('/', (_req, res) => {
    res.json({ ok: true, service: 'personal-mp3-player-api', health: '/api/health' });
  });

  // Public routes.
  app.use('/api', createPublicHealthRouter(deps));
  app.use('/api/auth', createAuthRouter(deps));

  // Everything below needs a signed-in account; routes that change the library also need the admin.
  app.use(
    '/api',
    rateLimit({ windowMs: 60 * 1000, max: 600, message: 'Too many requests. Slow down and try again shortly.' }),
    requireAuth(deps.auth, deps.users),
  );
  app.use('/api', createStorageHealthRouter(deps));
  app.use('/api', createLibraryRouter(deps));
  app.use('/api/tracks', createTracksRouter(deps));
  app.use('/api/plays', createPlaysRouter(deps));
  app.use('/api/playlists', createPlaylistsRouter(deps));
  app.use('/api/recommendations', createRecommendationsRouter(deps));
  app.use('/api/admin', requireAdmin, createAdminRouter(deps));

  app.use('/api', (_req, res) => {
    res.status(404).json({ message: 'Not found' });
  });
  app.use(errorHandler);

  return app;
}
