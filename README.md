# Personal MP3 Player

A modular monorepo for a private personal MP3 player built with React, TypeScript, Vite, Node.js, PostgreSQL, Backblaze B2, and OneDrive backup.

This repository contains the Phase 1 implementation only:

- Monorepo structure
- React + TypeScript web app
- Node.js API
- PostgreSQL database connection and schema
- Backblaze B2 storage abstraction
- Multi-format music upload flow
- Track listing API
- Basic library page
- Basic audio playback

## 1. Folder Structure

```text
personal-mp3-player/
├── apps/
│   ├── api/
│   │   ├── src/
│   │   │   ├── config/
│   │   │   ├── db/
│   │   │   ├── routes/
│   │   │   ├── services/
│   │   │   ├── storage/
│   │   │   ├── types/
│   │   │   ├── utils/
│   │   │   ├── server.ts
│   │   │   └── app.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── web/
│       ├── src/
│       ├── package.json
│       ├── tsconfig.json
│       ├── vite.config.ts
│       └── index.html
├── .env.example
├── .gitignore
├── package.json
├── README.md
└── database/
    └── schema/
        └── 001_tracks.sql
```

## 2. Prerequisites

Install:

- Node.js 20+
- npm 10+
- PostgreSQL 14+
- Backblaze B2 bucket

## 3. Installation

From the repository root:

```bash
npm install
```

## 4. Environment variables

Copy the example file:

```bash
cp .env.example .env
```

Then update the values in `.env`:

```env
NODE_ENV=development
PORT=4000
API_BASE_URL=http://localhost:4000/api
WEB_PORT=5173

DATABASE_URL=postgresql://neondb_owner:your-password@ep-example.us-east-2.aws.neon.tech/neondb?sslmode=require

B2_ENDPOINT=https://s3.us-east-005.backblazeb2.com
B2_REGION=us-east-005
B2_BUCKET_NAME=personal-mp3-player
B2_KEY_ID=your-b2-key-id
B2_APPLICATION_KEY=your-b2-application-key
B2_PUBLIC_URL=https://<public-domain>/
B2_SIGNED_URL_TTL_SECONDS=3600

VITE_API_BASE_URL=http://localhost:4000/api
UPLOAD_MAX_SIZE_MB=100
```

## 5. Database setup

1. Create a Neon Postgres project.
2. Copy the connection string from the Neon dashboard.
3. Add it to `.env` as `DATABASE_URL`.
4. Apply the schema to the Neon database:

```bash
psql "<your-neon-connection-string>" -f database/schema/001_tracks.sql
```

The schema creates the `tracks` table with columns for metadata and storage information.

## 6. Backblaze B2 setup

1. Create a bucket in Backblaze B2.
2. Create an application key with read/write permissions for the bucket.
3. Set the environment variables in `.env`.
4. Use the B2 S3-compatible endpoint for the selected region.
5. Make sure the bucket allows signed read access for playback.

OneDrive remains a backup and master-library sync target only. It is not used for normal playback.

## 7. Running the app

### Run backend

```bash
npm run dev --workspace apps/api
```

### Run frontend

```bash
npm run dev --workspace apps/web
```

### Or run both together

```bash
npm run dev
```

## 8. Frontend URL

Open:

```text
http://localhost:5173
```

## 9. Upload the first music file

1. Open the web app.
2. Navigate to the library page.
3. Use the upload form to choose an MP3 file.
4. The backend validates the file, extracts metadata, uploads to Backblaze B2, and stores the metadata in PostgreSQL.

Supported formats: AAC, FLAC, M4A, MP3, OGG, OPUS, WAV, and WEBM.

## 10. How to test playback

1. Upload a valid MP3 file.
2. The library page shows uploaded tracks.
3. Click a track row or play button.
4. The page loads the stream endpoint and plays the file in the browser audio player.

The stream endpoint is:

```text
GET /api/tracks/:id/stream
```

## 11. API endpoints

- `GET /api/health`
- `GET /api/tracks`
- `GET /api/tracks/:id`
- `GET /api/tracks/:id/stream`
- `POST /api/tracks/upload`

## 12. Notes

This project intentionally delivers the Phase 1 foundation only. The architecture is designed so later phases can add playlisting, authentication, metadata enrichment, and OneDrive backup without rewriting the core storage and API separation.

## 13. Deploying to Vercel

Create one Vercel project linked to the repository root. The checked-in `vercel.json` builds the React app from `apps/web` and exposes the Express API as a Vercel Function at `/api`.

Set these Vercel environment variables for Production (and Preview if needed):

```env
DATABASE_URL=postgresql://...
B2_ENDPOINT=https://s3.us-east-005.backblazeb2.com
B2_REGION=us-east-005
B2_BUCKET_NAME=your-bucket
B2_KEY_ID=your-key-id
B2_APPLICATION_KEY=your-application-key
B2_PUBLIC_URL=https://your-public-b2-domain/
B2_SIGNED_URL_TTL_SECONDS=3600
UPLOAD_MAX_SIZE_MB=100
```

Do not set `VITE_API_BASE_URL` for a single-project deployment; the web app uses the same-origin `/api` path automatically. Set it to the public API URL only when deploying the web app and API as separate Vercel projects. After deployment, verify `https://<your-domain>/api/health` before uploading tracks.
