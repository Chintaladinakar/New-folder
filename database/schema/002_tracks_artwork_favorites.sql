-- Artwork moves from base64 data URLs in artwork_url to objects in B2 referenced by artwork_key.
-- artwork_url is no longer read by the API; it is kept so the move to B2 can be re-run safely.
ALTER TABLE tracks ADD COLUMN IF NOT EXISTS artwork_key TEXT;

-- SHA-256 of the audio file, used to stop the same file being uploaded twice.
ALTER TABLE tracks ADD COLUMN IF NOT EXISTS content_hash TEXT;

ALTER TABLE tracks ADD COLUMN IF NOT EXISTS is_favorite BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE tracks ADD COLUMN IF NOT EXISTS play_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE tracks ADD COLUMN IF NOT EXISTS last_played_at TIMESTAMPTZ;

-- INTEGER caps at about 2 GB.
ALTER TABLE tracks ALTER COLUMN file_size TYPE BIGINT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_tracks_content_hash ON tracks (content_hash) WHERE content_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tracks_artwork_key ON tracks (artwork_key) WHERE artwork_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tracks_favorites ON tracks (created_at DESC) WHERE is_favorite;
CREATE INDEX IF NOT EXISTS idx_tracks_last_played_at ON tracks (last_played_at DESC) WHERE last_played_at IS NOT NULL;

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tracks_set_updated_at ON tracks;
CREATE TRIGGER tracks_set_updated_at
  BEFORE UPDATE ON tracks
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
