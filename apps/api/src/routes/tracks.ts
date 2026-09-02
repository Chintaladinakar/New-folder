import { Router } from 'express';
import multer from 'multer';
import { env } from '../config/env.js';
import { MetadataService } from '../services/metadataService.js';
import { TrackService } from '../services/trackService.js';
import { B2Storage } from '../storage/b2.js';

const router = Router();
const allowedAudioMimeTypes = new Set([
  'audio/aac',
  'audio/flac',
  'audio/mp4',
  'audio/mpeg',
  'audio/mp3',
  'audio/ogg',
  'audio/opus',
  'audio/wav',
  'audio/wave',
  'audio/webm',
  'audio/x-flac',
  'audio/x-m4a',
  'audio/x-mpeg',
  'audio/x-wav',
]);
const allowedAudioExtensions = new Set(['.aac', '.flac', '.m4a', '.mp3', '.oga', '.ogg', '.opus', '.wav', '.webm']);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: (env.uploadMaxSizeMb ?? 100) * 1024 * 1024,
  },
  fileFilter: (_req, file, cb) => {
    const extension = file.originalname.slice(file.originalname.lastIndexOf('.')).toLowerCase();
    if (allowedAudioMimeTypes.has(file.mimetype) || allowedAudioExtensions.has(extension)) {
      cb(null, true);
      return;
    }
    cb(new Error('Supported music formats: AAC, FLAC, M4A, MP3, OGG, OPUS, WAV, and WEBM'));
  },
});

const trackService = new TrackService();
const metadataService = new MetadataService();
const storage = new B2Storage();

router.get('/health', (_req, res) => {
  res.json({ ok: true, status: 'healthy' });
});

router.get('/', async (_req, res) => {
  try {
    const tracks = await trackService.listTracks();
    res.json({ tracks });
  } catch (error) {
    res.status(500).json({ message: 'Failed to list tracks', error: (error as Error).message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const track = await trackService.getTrackById(req.params.id);
    if (!track) {
      res.status(404).json({ message: 'Track not found' });
      return;
    }

    res.json({ track });
  } catch (error) {
    res.status(500).json({ message: 'Failed to load track', error: (error as Error).message });
  }
});

router.get('/:id/stream', async (req, res) => {
  try {
    const track = await trackService.getTrackById(req.params.id);
    if (!track) {
      res.status(404).json({ message: 'Track not found' });
      return;
    }

    const url = await storage.getSignedUrl(track.storageKey);
    res.redirect(url);
  } catch (error) {
    res.status(500).json({ message: 'Failed to stream track', error: (error as Error).message });
  }
});

router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      res.status(400).json({ message: 'No file uploaded' });
      return;
    }

    const metadata = await metadataService.extractMetadata(req.file);
    const storageKey = `tracks/${Date.now()}-${req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    await storage.upload(req.file.buffer, storageKey, req.file.mimetype || 'audio/mpeg');

    const duplicate = await trackService.trackExistsByStorageKey(storageKey);
    if (duplicate) {
      res.status(409).json({ message: 'Duplicate track detected' });
      return;
    }

    const track = await trackService.createTrack({
      fileName: req.file.originalname,
      storageKey,
      mimeType: req.file.mimetype || 'audio/mpeg',
      fileSize: req.file.size,
      title: metadata.title,
      artist: metadata.artist,
      album: metadata.album,
      albumArtist: metadata.albumArtist,
      genre: metadata.genre,
      year: metadata.year,
      duration: metadata.duration ? Math.round(metadata.duration) : null,
      trackNumber: metadata.trackNumber,
      discNumber: metadata.discNumber,
      artworkUrl: metadata.artworkUrl,
    });

    res.status(201).json({ message: 'Track uploaded successfully', track });
  } catch (error) {
    res.status(500).json({ message: 'Upload failed', error: (error as Error).message });
  }
});

export default router;
