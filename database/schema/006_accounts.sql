-- Accounts. The admin owns the library and signs in with AUTH_PASSWORD. Listeners sign in with a
-- username and a 6-digit PIN; they can play everything but upload, edit and delete nothing.
--
-- Favorites, play counts, listening history and playlists become per account. Everything recorded
-- before this migration belonged to the owner, so it moves to the admin account. Nothing is
-- dropped: the old columns on tracks stay, unused, so the move can be checked afterwards.

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Lower-case; letters, digits, dot, underscore and hyphen; 3 to 32 characters.
  username TEXT NOT NULL UNIQUE CHECK (username ~ '^[a-z0-9][a-z0-9._-]{2,31}$'),
  display_name TEXT CHECK (display_name IS NULL OR char_length(display_name) BETWEEN 1 AND 60),
  role TEXT NOT NULL CHECK (role IN ('admin', 'listener')),
  -- scrypt hash of the PIN, peppered with AUTH_SECRET. Listeners only.
  pin_hash TEXT,
  -- Bumped to sign the account out everywhere (PIN reset, disabled).
  token_version INTEGER NOT NULL DEFAULT 1,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ,
  disabled_at TIMESTAMPTZ,
  last_login_at TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One admin: the owner.
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_one_admin ON users (role) WHERE role = 'admin';

DROP TRIGGER IF EXISTS users_set_updated_at ON users;
CREATE TRIGGER users_set_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

INSERT INTO users (username, display_name, role) VALUES ('admin', 'Admin', 'admin') ON CONFLICT DO NOTHING;

-- The owner's account. Also the default for plays and playlists written without an account, which
-- only a build from before accounts does (say, an older deployment on the same database).
CREATE OR REPLACE FUNCTION admin_user_id() RETURNS UUID LANGUAGE sql STABLE AS $$ SELECT id FROM users WHERE role = 'admin' $$;

-- Favorites, per account.
CREATE TABLE IF NOT EXISTS user_favorites (
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  track_id UUID NOT NULL REFERENCES tracks (id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, track_id)
);
CREATE INDEX IF NOT EXISTS idx_user_favorites_recent ON user_favorites (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_favorites_track ON user_favorites (track_id);

INSERT INTO user_favorites (user_id, track_id, created_at)
SELECT admin_user_id(), id, updated_at FROM tracks WHERE is_favorite
ON CONFLICT DO NOTHING;

-- Play counts, per account. A play that turns out to be a skip moves from play_count to skip_count.
CREATE TABLE IF NOT EXISTS user_track_stats (
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  track_id UUID NOT NULL REFERENCES tracks (id) ON DELETE CASCADE,
  play_count INTEGER NOT NULL DEFAULT 0,
  skip_count INTEGER NOT NULL DEFAULT 0,
  last_played_at TIMESTAMPTZ,
  PRIMARY KEY (user_id, track_id)
);
CREATE INDEX IF NOT EXISTS idx_user_track_stats_played ON user_track_stats (user_id, last_played_at DESC) WHERE last_played_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_user_track_stats_track ON user_track_stats (track_id);

INSERT INTO user_track_stats (user_id, track_id, play_count, last_played_at)
SELECT admin_user_id(), id, play_count, last_played_at FROM tracks
WHERE play_count > 0 OR last_played_at IS NOT NULL
ON CONFLICT DO NOTHING;

-- Listening history, per account, and how each play went: the seconds actually listened are
-- reported when the track ends or is left (NULL when that never arrived, e.g. the tab was closed).
ALTER TABLE play_history ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users (id) ON DELETE CASCADE;
UPDATE play_history SET user_id = admin_user_id() WHERE user_id IS NULL;
ALTER TABLE play_history ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE play_history ALTER COLUMN user_id SET DEFAULT admin_user_id();
ALTER TABLE play_history ADD COLUMN IF NOT EXISTS listened_seconds INTEGER;
ALTER TABLE play_history ADD COLUMN IF NOT EXISTS skipped BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS idx_play_history_user ON play_history (user_id, played_at DESC);

-- Playlists, per account.
ALTER TABLE playlists ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES users (id) ON DELETE CASCADE;
UPDATE playlists SET owner_id = admin_user_id() WHERE owner_id IS NULL;
ALTER TABLE playlists ALTER COLUMN owner_id SET NOT NULL;
ALTER TABLE playlists ALTER COLUMN owner_id SET DEFAULT admin_user_id();
CREATE INDEX IF NOT EXISTS idx_playlists_owner ON playlists (owner_id, lower(name));

COMMENT ON COLUMN tracks.is_favorite IS 'Superseded by user_favorites (006_accounts). No longer written.';
COMMENT ON COLUMN tracks.play_count IS 'Superseded by user_track_stats (006_accounts). No longer written.';
COMMENT ON COLUMN tracks.last_played_at IS 'Superseded by user_track_stats (006_accounts). No longer written.';
