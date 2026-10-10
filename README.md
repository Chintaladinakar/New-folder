# Sangeetham

*Sangeetham* (సంగీతం) is Telugu for "music". A private music library and player: one admin owns the library, and listener accounts let the people they share it with play it. React + TypeScript (Vite) on the front end, a Node.js/Express API, PostgreSQL (Neon) for the library, and Backblaze B2 for the audio files.

## What it does

- **Accounts.** The admin signs in at `/admin` with the server password and is the only one who can upload, edit or delete music. The sign-in page everywhere else is for listeners and doesn't mention the admin's. Under **Accounts** (in the account menu) the admin makes listener accounts. Listeners sign in with a username and a 6-digit PIN and can play the whole library. Each account has its own favorites, playlists, play counts, listening history and recommendations. The admin can reset a PIN, turn an account off or delete it, and see what each account plays. Five wrong PINs in a row lock an account for 15 minutes.
- **Made for you.** Home shows mixes built from each account's own listening: up to four Daily Mixes (one per taste cluster, mostly familiar songs with a few new ones), Discover Weekly (songs the account hasn't played, new every Monday), On Repeat, and Rewind (old favorites not played in a while). Under the mixes are rows such as "Because you listened to …", "New in the library for you" and, for new accounts, "Popular in the library". Any track or artist can start a radio station. See [How recommendations work](#how-recommendations-work).
- **Upload** many files at once, by button or by dragging onto the page. Files go straight from the browser to B2 through presigned links, with per-file progress, cancel and retry. Duplicates are detected by content hash before anything is uploaded. Formats: AAC, FLAC, M4A, MP3, OGG, OPUS, WAV, WEBM.
- **Tags and cover art** are read on the server. Cover art is stored once per image in B2, not inside the database.
- **Library** with search, sorting, infinite scroll, Albums, Artists, Favorites, Recently Played and Recently Added. You can edit track details and delete tracks.
- **Playlists**: create, rename, delete, add tracks, reorder and remove tracks.
- **Player** with a queue (play next, add to queue, remove), shuffle, repeat all/one, and seeking from any screen. On wide screens it sits in a side panel with Up next and Lyrics tabs; elsewhere it floats in a dock at the bottom. It also has lock-screen and media-key controls (Media Session API), keyboard shortcuts, and resumes your queue and position after a reload.
- **Lyrics** on the Now Playing screen and in the side panel: read from the file's tags, otherwise looked up on [LRCLIB](https://lrclib.net) (free, no key). Synced lyrics follow the song and are clickable to seek; you can also paste your own.
- **Listening history**: every play is recorded with its genre and how long it was actually heard; Settings shows plays, time and top genres over 7 days, 30 days or a year. Skips are not counted.
- **Filters** in the library: genre, decade, format, favorites, "with lyrics", and nine sort orders in either direction. Albums, artists and playlists have their own search and sort.
- **Personalisation** in Settings: dark / black (OLED) / paper (light) / auto theme, eight accent colours, the side panel on or off, motion on/off, list density, playing-indicator style, colour-from-artwork on Now Playing, and more.
- **Installable** as a desktop or home-screen app (PWA): its own window and icon, offline app shell, and an in-app prompt when a new version is available.
- Works on phones: bottom tab bar, compact player, touch-friendly track rows.

Not built yet: OneDrive backup/sync and automatic metadata enrichment (for example from MusicBrainz).

## Repository layout

```text
apps/
  api/                Express API (TypeScript, ESM)
    src/
      config/         environment parsing (zod)
      db/             connection pool, migration runner
      http/           errors, auth + rate-limit middleware, request schemas
      routes/         auth, admin (accounts), health, tracks, plays, library (albums/artists/stats),
                      playlists, recommendations
      services/       tracks, playlists, users, auth tokens and PINs, recommendations
                      (recommend/engine.ts is the algorithm), metadata, artwork, maintenance
      storage/        B2 (S3-compatible) storage
      scripts/        migrate, backfill, cleanup-orphans
      server.ts       entry point
    test/             Vitest + supertest, real Postgres via PGlite
  web/                React app (Vite, Tailwind, React Query, Zustand)
database/schema/      SQL migrations, applied in filename order
infra/b2-cors.json    CORS policy for the B2 bucket
```

## Prerequisites

- Node.js 20+ and npm 10+
- A PostgreSQL 14+ database (Neon works well)
- A Backblaze B2 bucket and an application key with read/write access to it

## Setup

```bash
npm install
cp .env.example .env
```

Fill in `.env`. You need at least:

| Variable | Purpose |
| --- | --- |
| `AUTH_PASSWORD` | The admin's password. Changing it signs everyone out; listeners sign back in with their PINs. |
| `AUTH_SECRET` | 32+ random characters for signing sessions and peppering listener PINs. Generate one with `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`. Changing it signs everyone out, and every listener then needs a new PIN from the admin. |
| `DATABASE_URL` | Postgres connection string. |
| `B2_ENDPOINT`, `B2_REGION`, `B2_BUCKET_NAME`, `B2_KEY_ID`, `B2_APPLICATION_KEY` | B2 bucket and credentials. |

The optional settings are documented in [`.env.example`](.env.example).

### Database

There is nothing to run by hand. The API applies any pending migrations from `database/schema/` on startup, tracked in a `schema_migrations` table and guarded by an advisory lock. A database set up with the old manual `psql -f 001_tracks.sql` step upgrades in place. To run migrations without starting the server: `npm run migrate --workspace apps/api`.

Migration `006_accounts.sql` creates the accounts. Everything recorded before it (favorites, play counts, history, playlists) belonged to the owner, so it moves to the admin account. The old columns on `tracks` are left in place, unused. An older build of the app still running against the same database keeps working: plays and playlists it writes go to the admin.

### B2 bucket CORS

Uploads go from the browser straight to B2, so the bucket must allow your site's origin. Edit `AllowedOrigins` in [`infra/b2-cors.json`](infra/b2-cors.json), then apply it with the AWS CLI:

```bash
aws s3api put-bucket-cors \
  --bucket "$B2_BUCKET_NAME" \
  --endpoint-url "https://s3.us-east-005.backblazeb2.com" \
  --cors-configuration file://infra/b2-cors.json
```

## Running locally

```bash
npm run dev          # API on http://localhost:4000, web app on http://localhost:5173
```

Open http://localhost:5173/admin and sign in with `AUTH_PASSWORD`; the sign-in at any other address is for listeners. To add listeners, open the account menu → **Accounts** → **New account**; the PIN is shown once, to pass on. In development the web app calls `/api`, and Vite proxies it to the API, so `VITE_API_BASE_URL` stays unset.

### How recommendations work

All of it runs in the API from the library's own data. Nothing is sent to an outside service. The logic is in [`apps/api/src/services/recommend/engine.ts`](apps/api/src/services/recommend/engine.ts) as plain functions, with tests in `apps/api/test/recommend.test.ts`.

- **Taste.** The player reports how long each play was heard. A play that stops before 30 seconds, or before half the track if that comes first, counts as a skip. Each track gets an affinity score from plays (weighted by how much was heard), favorites and playlist adds, minus skips. A track skipped twice lately is left out of recommendations. Recent listening counts most: a play's weight halves after about three months (two weeks for On Repeat). These scores add up to a profile of the artists, genres, albums and decades the account likes.
- **Co-listening.** Tracks that people play near each other in a session (gaps under 30 minutes), or keep near each other in playlists, are linked across all accounts. This is collaborative filtering, the approach Spotify is known for: "people who play this also play that". The links are normalised, so a few hugely popular tracks don't swamp everything.
- **Ranking.** Candidates are scored by co-listening with the account's favorites, how well they fit its taste profile, and a small popularity term. A little deterministic jitter, seeded by the day or week, keeps the mixes fresh without changing on every reload. Lists are spread out: usually no more than two tracks per artist or album, and the same artist rarely plays twice in a row.
- **New accounts** start from what is popular and recently added in the library, and become personal after a handful of plays.

### Keyboard shortcuts

Space play/pause · ←/→ seek 5 s · Shift+←/→ previous/next · M mute · S shuffle · R repeat · / search

## Quality checks

```bash
npm run lint         # ESLint (TypeScript + React hooks rules)
npm run typecheck    # tsc for both apps, including tests
npm test             # API: routes and SQL against a real Postgres (PGlite); web: player and queue logic
npm run build
npm run check        # all of the above; GitHub Actions runs the same on every push and pull request
```

### Browser tests (end to end)

`npm run test:e2e` drives a real Chrome through the whole app at three screen sizes (desktop, tablet, phone): signing in, uploading, playback, queue, playlists, lyrics, settings, accessibility (axe), installing and offline use, and hostile or broken input. It starts its own copy of the API on an in-memory database with fake storage, and a production build of the web app, so it never touches your real database or bucket. It needs Google Chrome installed (`E2E_CHANNEL=msedge` uses Edge instead) and takes about 10 minutes per screen size.

```bash
npm run test:e2e                                  # everything, all three sizes
npm run test:e2e -- --project=desktop             # one size
npm run test:e2e -- tests/04-player.spec.ts       # one file
npx playwright show-report apps/e2e/results/html  # open the last report
```

`tests/12-visual.spec.ts` is not a pass/fail test: it saves screenshots of every page in every theme to `apps/e2e/results/screens`, for looking at.

## Deployment

The front end and API deploy separately.

### API on Render

Create a Web Service from this repository:

- **Root directory:** empty (repository root)
- **Build command:** `npm ci && npm run build:api`
- **Start command:** `npm start`
- **Health check path:** `/api/health`
- **Environment:** everything from `.env.example`, with `NODE_ENV=production`. Render provides `PORT`.

Migrations run automatically when the service starts.

### Lyrics lookups

Tracks without embedded lyrics are looked up on lrclib.net from the API server the first time their lyrics are requested (title, artist, album and duration are sent; nothing else). Turn this off per device in Settings → "Look up missing lyrics".

### App icon

`apps/web/public/icon.svg` is the source. After editing it, run `node scripts/generate-icons.mjs` inside `apps/web` to regenerate the PNG sizes.

### Web app on Vercel

Create a project with **Root Directory** `apps/web`; [`apps/web/vercel.json`](apps/web/vercel.json) handles the build and client-side routing. Set one environment variable:

```env
VITE_API_BASE_URL=https://your-api.onrender.com/api
```

Server secrets (database, B2, auth) belong on the API service only, never on the Vercel project.

Optionally set `CORS_ORIGINS=https://your-app.vercel.app` on the API to accept browser requests only from your site. The API works without it, because a request without the bearer token is refused anyway.

## Maintenance scripts

Run these from the repository root with your `.env` in place:

```bash
npm run backfill --workspace apps/api          # one-off upgrade of tracks uploaded by older versions:
                                               #   --artwork  move base64 cover art from the database to B2
                                               #   --hashes   compute content hashes for duplicate detection
                                               #              (downloads every file once)
npm run cleanup:orphans --workspace apps/api   # list B2 files no track uses (abandoned uploads);
                                               #   add --delete to remove them
```

The artwork move also runs in the background each time the API starts, so most installs never need `--artwork`.

## API

Everything except health and sign-in requires `Authorization: Bearer <token>`. Favorites, play counts, history, playlists and recommendations are those of the signed-in account. Routes marked **admin** answer 403 to listeners.

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/health` | Public. Database, storage and auth status, without any configuration details. |
| POST | `/api/auth/login` | The admin: `{ password }` → `{ token, expiresAt, user }`. Rate-limited. |
| POST | `/api/auth/pin` | A listener: `{ username, pin }` → `{ token, expiresAt, user }`. Rate-limited; five wrong PINs in a row lock the account for 15 minutes (429). |
| GET | `/api/auth/session` | Checks a token → `{ user }`. |
| POST | `/api/auth/pin/change` | A listener changes their PIN: `{ currentPin, newPin }`. |
| GET | `/api/storage/b2/health` | **Admin.** Bucket reachability and any missing settings. |
| GET, POST | `/api/admin/users` | **Admin.** List accounts, or create a listener (`{ username, displayName?, pin? }` → `{ user, pin }`; a PIN is generated if none is given). |
| PATCH, DELETE | `/api/admin/users/:id` | **Admin.** Rename (`displayName`), turn off or on (`disabled`), or delete a listener with their favorites, playlists and history. |
| POST | `/api/admin/users/:id/pin` | **Admin.** A new PIN (`{ pin? }` → `{ user, pin }`); signs the listener out everywhere and unlocks the account. |
| GET | `/api/admin/users/:id/listening` | **Admin.** One account's listening, like `/api/listening`. |
| GET | `/api/recommendations` | Mixes (summaries with covers) and shelves of tracks for Home. |
| GET | `/api/recommendations/mixes/:id` | One mix with its tracks. |
| GET | `/api/recommendations/radio` | `?track=<id>` or `?artist=<name>` → a station. |
| GET | `/api/tracks` | `limit`, `offset`, `q`, `artist`, `album`, `albumArtist`, `genre`, `yearFrom`, `yearTo`, `format`, `favorite`, `played`, `hasLyrics`, `sort` (`recent`, `title`, `artist`, `album`, `year`, `duration`, `plays`, `played`, `album-order`), `reverse` → `{ tracks, total }`. |
| POST | `/api/tracks/upload-url` | **Admin.** `{ fileName, fileSize, contentHash? }` → presigned PUT URL. 409 for a duplicate, 413 if too large, 415 if not audio. |
| POST | `/api/tracks/complete-upload` | **Admin.** `{ fileName, storageKey, contentHash? }` → reads tags and creates the track. Safe to retry. |
| GET | `/api/tracks/:id` | One track. |
| GET | `/api/tracks/:id/stream-url` | A fresh signed playback URL. |
| GET | `/api/tracks/:id/lyrics` | Lyrics from tags, the database, or LRCLIB (`?refresh=1` looks up again). A miss is remembered for a week. |
| PUT | `/api/tracks/:id/lyrics` | **Admin.** `{ lyrics }` — plain text or LRC; replaces any looked-up lyrics. |
| GET | `/api/facets` | Genres, formats and year range, for the filter bar. |
| GET | `/api/listening` | `?days=30` → plays, time listened, top genres and artists, skips left out. History starts from migration 005, since older play counts have no dates. |
| PATCH | `/api/tracks/:id` | `isFavorite` for anyone; the tags (`title`, `artist`, `album`, `albumArtist`, `genre`, `year`, `trackNumber`, `discNumber`) for the admin only. |
| DELETE | `/api/tracks/:id` | **Admin.** Deletes the track, its file, and its artwork if no other track uses it. |
| POST | `/api/tracks/:id/play` | Records a play → `{ playId }`. |
| POST | `/api/plays/:playId/finish` | `{ listenedSeconds, completed }` when the play ends or is left; a short, unfinished play becomes a skip. |
| GET | `/api/albums`, `/api/artists`, `/api/stats` | Library summaries. |
| GET, POST | `/api/playlists` | The account's own playlists: list or create (`{ name, description? }`). |
| GET, PATCH, DELETE | `/api/playlists/:id` | Playlist with entries; rename; delete. |
| POST | `/api/playlists/:id/tracks` | `{ trackIds }`, appended in order. |
| DELETE | `/api/playlists/:id/tracks/:entryId` | Remove one entry. |
| PUT | `/api/playlists/:id/order` | `{ entryIds }` listing every entry in its new order. |

Tracks in responses include `artworkUrl` and `streamUrl`. These are signed B2 links that expire at `urlsExpireAt`. Storage keys are never exposed.
