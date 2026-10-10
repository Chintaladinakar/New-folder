-- Lyrics: plain text and LRC-format synced lyrics, from tags, lrclib.net, or typed in by hand.
ALTER TABLE tracks ADD COLUMN IF NOT EXISTS lyrics TEXT;
ALTER TABLE tracks ADD COLUMN IF NOT EXISTS synced_lyrics TEXT;
-- 'embedded' | 'lrclib' | 'manual' | 'none' (looked up, nothing found)
ALTER TABLE tracks ADD COLUMN IF NOT EXISTS lyrics_source TEXT;
ALTER TABLE tracks ADD COLUMN IF NOT EXISTS lyrics_checked_at TIMESTAMPTZ;

-- Filter bar facets.
CREATE INDEX IF NOT EXISTS idx_tracks_genre ON tracks (genre) WHERE genre IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tracks_year ON tracks (year) WHERE year IS NOT NULL;
