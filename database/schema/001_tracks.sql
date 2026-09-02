CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS tracks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  artist TEXT,
  album TEXT,
  album_artist TEXT,
  genre TEXT,
  year INTEGER,
  duration INTEGER,
  track_number INTEGER,
  disc_number INTEGER,
  file_name TEXT NOT NULL,
  storage_key TEXT NOT NULL UNIQUE,
  file_size INTEGER NOT NULL,
  mime_type TEXT NOT NULL,
  artwork_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tracks_artist ON tracks (artist);
CREATE INDEX IF NOT EXISTS idx_tracks_album ON tracks (album);
CREATE INDEX IF NOT EXISTS idx_tracks_title ON tracks (title);
CREATE INDEX IF NOT EXISTS idx_tracks_created_at ON tracks (created_at DESC);
