import express from 'express';
import cors from 'cors';
import tracksRouter from './routes/tracks.js';

const app = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use('/api/tracks', tracksRouter);

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, status: 'healthy' });
});

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ message: 'Internal server error', error: err.message });
});

export default app;
