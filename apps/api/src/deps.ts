import { env } from './config/env.js';
import { createPgDb, getPool, type Db } from './db/index.js';
import { AuthService } from './services/authService.js';
import { MetadataService } from './services/metadataService.js';
import { PlaylistService } from './services/playlistService.js';
import { Presenter } from './services/presenter.js';
import { RecommendationService } from './services/recommendationService.js';
import { TrackService } from './services/trackService.js';
import { UserService } from './services/userService.js';
import type { MusicStorage } from './storage/base.js';
import { createB2StorageOrNull } from './storage/b2.js';

export type AppDeps = {
  auth: AuthService;
  users: UserService;
  tracks: TrackService;
  playlists: PlaylistService;
  recommendations: RecommendationService;
  metadata: MetadataService;
  presenter: Presenter;
  storage: MusicStorage | null;
  checkDatabase: () => Promise<void>;
  uploadMaxSizeBytes: number;
  /** fetch used for lyrics lookups; tests replace it. */
  lyricsFetch?: typeof fetch;
};

export function buildDeps(
  db: Db,
  storage: MusicStorage | null,
  auth: AuthService,
  uploadMaxSizeBytes: number,
  lyricsFetch?: typeof fetch,
): AppDeps {
  return {
    lyricsFetch,
    auth,
    users: new UserService(db),
    tracks: new TrackService(db),
    playlists: new PlaylistService(db),
    recommendations: new RecommendationService(db),
    metadata: new MetadataService(),
    presenter: new Presenter(storage),
    storage,
    checkDatabase: async () => {
      await db.query('SELECT 1');
    },
    uploadMaxSizeBytes,
  };
}

export function createDefaultDeps(): AppDeps {
  return buildDeps(createPgDb(getPool()), createB2StorageOrNull(), new AuthService(env.auth), env.uploadMaxSizeBytes);
}
