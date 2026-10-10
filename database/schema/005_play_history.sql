-- One row per play. Genre, artist and duration are copied at play time, so the history stays
-- accurate if the track is later re-tagged, and survives the track being deleted.
CREATE TABLE IF NOT EXISTS play_history (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  track_id UUID REFERENCES tracks (id) ON DELETE SET NULL,
  genre TEXT,
  artist TEXT,
  duration INTEGER,
  played_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_play_history_played_at ON play_history (played_at DESC);
CREATE INDEX IF NOT EXISTS idx_play_history_track ON play_history (track_id);

-- Existing play counts have no timestamps, so history starts from this migration.
