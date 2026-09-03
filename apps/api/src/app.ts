import express from 'express';
import cors from 'cors';
import { validateB2Config } from './config/env.js';
import tracksRouter from './routes/tracks.js';
import { B2Storage } from './storage/b2.js';

const app = express();
const b2Storage = (() => {
  try {
    return new B2Storage();
  } catch {
    return null;
  }
})();

app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.get('/', (_req, res) => {
  res.json({ ok: true, service: 'personal-mp3-player-api', health: '/api/health' });
});

app.use('/api/tracks', tracksRouter);

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, status: 'healthy' });
});

app.get('/api/storage/b2/health', async (_req, res) => {
  const configStatus = validateB2Config();

  if (!configStatus.ok) {
    res.status(503).json({
      ok: false,
      status: 'misconfigured',
      missing: configStatus.missing,
      bucket: null,
    });
    return;
  }

  if (!b2Storage) {
    res.status(503).json({
      ok: false,
      status: 'config_error',
      missing: configStatus.missing,
      bucket: null,
    });
    return;
  }

  try {
    const result = await b2Storage.testConnection();
    res.json({
      ok: result.ok,
      status: result.status,
      bucket: result.bucket,
      region: result.region,
    });
  } catch (error) {
    res.status(503).json({
      ok: false,
      status: 'unreachable',
      message: (error as Error).message,
      bucket: null,
    });
  }
});

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ message: 'Internal server error', error: err.message });
});

export default app;
