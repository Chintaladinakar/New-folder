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
const storage = (() => {
  try {
    return new B2Storage();
  } catch {
    return null;
  }
})();

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

router.post('/upload-url', async (req, res) => {
  try {
    if (!storage) {
      res.status(503).json({ message: 'Backblaze B2 storage is not configured' });
      return;
    }

    const { fileName, contentType } = req.body as { fileName?: string; contentType?: string };
    if (!fileName) {
      res.status(400).json({ message: 'File name is required' });
      return;
    }

    const safeFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storageKey = `tracks/${Date.now()}-${safeFileName}`;
    const mimeType = contentType || 'audio/mpeg';
    const uploadUrl = await storage.getUploadUrl(storageKey, mimeType);
    res.json({ uploadUrl, storageKey, mimeType });
  } catch (error) {
    res.status(500).json({ message: 'Failed to create upload URL', error: (error as Error).message });
  }
});

router.post('/complete-upload', async (req, res) => {
  try {
    if (!storage) {
      res.status(503).json({ message: 'Backblaze B2 storage is not configured' });
      return;
    }

    const input = req.body as {
      fileName?: string;
      storageKey?: string;
      mimeType?: string;
      fileSize?: number;
      title?: string;
    };
    if (!input.fileName || !input.storageKey || !input.fileSize) {
      res.status(400).json({ message: 'File name, storage key, and file size are required' });
      return;
    }

    if (!(await storage.exists(input.storageKey))) {
      res.status(400).json({ message: 'Uploaded file was not found in storage' });
      return;
    }

    const track = await trackService.createTrack({
      fileName: input.fileName,
      storageKey: input.storageKey,
      mimeType: input.mimeType || 'audio/mpeg',
      fileSize: input.fileSize,
      title: input.title || input.fileName.replace(/\.[^/.]+$/, ''),
    });

    res.status(201).json({ message: 'Track uploaded successfully', track });
  } catch (error) {
    res.status(500).json({ message: 'Failed to save uploaded track', error: (error as Error).message });
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
    if (!storage) {
      res.status(503).json({ message: 'Backblaze B2 storage is not configured' });
      return;
    }

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
    if (!storage) {
      res.status(503).json({ message: 'Backblaze B2 storage is not configured' });
      return;
    }

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
