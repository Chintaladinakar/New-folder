import { randomUUID } from 'crypto';
import { query, queryOne } from '../db/index.js';
import { env } from '../config/env.js';
import type { TrackInput, TrackRecord } from '../types/track.js';

export class TrackService {
  async listTracks(): Promise<TrackRecord[]> {
    const rows = await query<TrackRecord>(
      `
        SELECT
          id,
          title,
          artist,
          album,
          album_artist AS "albumArtist",
          genre,
          year,
          duration,
          track_number AS "trackNumber",
          disc_number AS "discNumber",
          file_name AS "fileName",
          storage_key AS "storageKey",
          file_size AS "fileSize",
          mime_type AS "mimeType",
          artwork_url AS "artworkUrl",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
        FROM tracks
        ORDER BY created_at DESC
      `,
    );

    return rows;
  }

  async getTrackById(id: string): Promise<TrackRecord | null> {
    return queryOne<TrackRecord>(
      `
        SELECT
          id,
          title,
          artist,
          album,
          album_artist AS "albumArtist",
          genre,
          year,
          duration,
          track_number AS "trackNumber",
          disc_number AS "discNumber",
          file_name AS "fileName",
          storage_key AS "storageKey",
          file_size AS "fileSize",
          mime_type AS "mimeType",
          artwork_url AS "artworkUrl",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
        FROM tracks
        WHERE id = $1
      `,
      [id],
    );
  }

  async createTrack(input: TrackInput): Promise<TrackRecord> {
    const id = randomUUID();

    const result = await queryOne<TrackRecord>(
      `
        INSERT INTO tracks (
          id,
          title,
          artist,
          album,
          album_artist,
          genre,
          year,
          duration,
          track_number,
          disc_number,
          file_name,
          storage_key,
          file_size,
          mime_type,
          artwork_url,
          created_at,
          updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW(), NOW()
        )
        RETURNING
          id,
          title,
          artist,
          album,
          album_artist AS "albumArtist",
          genre,
          year,
          duration,
          track_number AS "trackNumber",
          disc_number AS "discNumber",
          file_name AS "fileName",
          storage_key AS "storageKey",
          file_size AS "fileSize",
          mime_type AS "mimeType",
          artwork_url AS "artworkUrl",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
      `,
      [
        id,
        input.title,
        input.artist ?? null,
        input.album ?? null,
        input.albumArtist ?? null,
        input.genre ?? null,
        input.year ?? null,
        input.duration ?? null,
        input.trackNumber ?? null,
        input.discNumber ?? null,
        input.fileName,
        input.storageKey,
        input.fileSize,
        input.mimeType,
        input.artworkUrl ?? null,
      ],
    );

    if (!result) {
      throw new Error('Track creation failed');
    }

    return result;
  }

  async trackExistsByStorageKey(storageKey: string): Promise<boolean> {
    const row = await queryOne<{ id: string }>('SELECT id FROM tracks WHERE storage_key = $1', [storageKey]);
    return Boolean(row);
  }

  buildStreamUrl(track: Pick<TrackRecord, 'id' | 'storageKey'>): string {
    return `${env.viteApiBaseUrl.replace(/\/$/, '')}/tracks/${track.id}/stream`;
  }
}
