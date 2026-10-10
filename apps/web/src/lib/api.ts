import { useAuthStore } from '../stores/authStore';
import type {
  Account,
  Album,
  Artist,
  HealthStatus,
  LibraryFacets,
  LibraryStats,
  ListeningStats,
  MixSummary,
  Playlist,
  PlaylistEntry,
  Recommendations,
  SessionUser,
  StorageHealth,
  Track,
  TrackFilters,
  TrackLyrics,
  TrackPage,
  TrackPatch,
} from '../types';

const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim().replace(/\/$/, '');

/** Unset in development: requests go to /api and Vite proxies them to the local API. */
export const API_BASE_URL = configuredBaseUrl
  ? configuredBaseUrl.endsWith('/api')
    ? configuredBaseUrl
    : `${configuredBaseUrl}/api`
  : '/api';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly body: Record<string, unknown> | null = null,
  ) {
    super(message);
  }
}

/** `keepalive` lets a request finish after the page is closed (the last play report). */
type RequestOptions = { method?: string; json?: unknown; keepalive?: boolean };

export async function apiRequest<T>(path: string, { method = 'GET', json, keepalive }: RequestOptions = {}): Promise<T> {
  const token = useAuthStore.getState().token;
  const headers: Record<string, string> = {};
  if (json !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: json === undefined ? undefined : JSON.stringify(json),
      keepalive,
    });
  } catch {
    throw new ApiError(0, 'Could not reach the server. Check your connection and try again.');
  }

  if (response.status === 204) return undefined as T;

  const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!response.ok) {
    // An expired or revoked session: drop it so the sign-in screen shows.
    if (response.status === 401 && token) useAuthStore.getState().signOut();
    const message = typeof body?.message === 'string' ? body.message : `Request failed (${response.status})`;
    throw new ApiError(response.status, message, body);
  }
  return body as T;
}

function queryString(params: Record<string, string | number | boolean | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}

const id = encodeURIComponent;

export type SignedIn = { token: string; expiresAt: string; user: SessionUser };

export const api = {
  login: (password: string) => apiRequest<SignedIn>('/auth/login', { method: 'POST', json: { password } }),
  pinLogin: (username: string, pin: string) => apiRequest<SignedIn>('/auth/pin', { method: 'POST', json: { username, pin } }),
  session: () => apiRequest<{ ok: true; user: SessionUser }>('/auth/session').then((r) => r.user),
  changePin: (currentPin: string, newPin: string) =>
    apiRequest<void>('/auth/pin/change', { method: 'POST', json: { currentPin, newPin } }),

  health: () => apiRequest<HealthStatus>('/health'),
  storageHealth: () => apiRequest<StorageHealth>('/storage/b2/health'),
  stats: () => apiRequest<{ stats: LibraryStats; uploadMaxSizeBytes: number }>('/stats'),

  listTracks: (params: TrackFilters & { limit: number; offset: number }) =>
    apiRequest<TrackPage>(`/tracks${queryString(params)}`),
  getStreamUrl: (trackId: string) =>
    apiRequest<{ url: string; expiresAt: string }>(`/tracks/${id(trackId)}/stream-url`),
  updateTrack: (trackId: string, patch: TrackPatch) =>
    apiRequest<{ track: Track }>(`/tracks/${id(trackId)}`, { method: 'PATCH', json: patch }).then((r) => r.track),
  deleteTrack: (trackId: string) => apiRequest<void>(`/tracks/${id(trackId)}`, { method: 'DELETE' }),
  recordPlay: (trackId: string) => apiRequest<{ playId: number }>(`/tracks/${id(trackId)}/play`, { method: 'POST' }),
  /** How a play went; `keepalive` when the page is being closed. */
  finishPlay: (playId: number, listenedSeconds: number, completed: boolean, keepalive = false) =>
    apiRequest<void>(`/plays/${playId}/finish`, { method: 'POST', json: { listenedSeconds, completed }, keepalive }),
  getLyrics: (trackId: string, refresh = false) =>
    apiRequest<TrackLyrics>(`/tracks/${id(trackId)}/lyrics${refresh ? '?refresh=1' : ''}`),
  setLyrics: (trackId: string, input: { lyrics?: string | null; syncedLyrics?: string | null }) =>
    apiRequest<TrackLyrics>(`/tracks/${id(trackId)}/lyrics`, { method: 'PUT', json: input }),
  facets: () => apiRequest<{ facets: LibraryFacets }>('/facets').then((r) => r.facets),
  listening: (days: number) => apiRequest<{ listening: ListeningStats }>(`/listening?days=${days}`).then((r) => r.listening),

  createUploadUrl: (input: { fileName: string; fileSize: number; contentHash?: string }) =>
    apiRequest<{ uploadUrl: string; storageKey: string; mimeType: string }>('/tracks/upload-url', {
      method: 'POST',
      json: input,
    }),
  completeUpload: (input: { fileName: string; storageKey: string; contentHash?: string }) =>
    apiRequest<{ track: Track }>('/tracks/complete-upload', { method: 'POST', json: input }).then((r) => r.track),

  albums: () => apiRequest<{ albums: Album[] }>('/albums').then((r) => r.albums),
  artists: () => apiRequest<{ artists: Artist[] }>('/artists').then((r) => r.artists),

  playlists: () => apiRequest<{ playlists: Playlist[] }>('/playlists').then((r) => r.playlists),
  playlist: (playlistId: string) =>
    apiRequest<{ playlist: Playlist; entries: PlaylistEntry[] }>(`/playlists/${id(playlistId)}`),
  createPlaylist: (input: { name: string; description?: string | null }) =>
    apiRequest<{ playlist: Playlist }>('/playlists', { method: 'POST', json: input }).then((r) => r.playlist),
  updatePlaylist: (playlistId: string, patch: { name?: string; description?: string | null }) =>
    apiRequest<{ playlist: Playlist }>(`/playlists/${id(playlistId)}`, { method: 'PATCH', json: patch }).then(
      (r) => r.playlist,
    ),
  deletePlaylist: (playlistId: string) => apiRequest<void>(`/playlists/${id(playlistId)}`, { method: 'DELETE' }),
  addToPlaylist: (playlistId: string, trackIds: string[]) =>
    apiRequest<{ added: number }>(`/playlists/${id(playlistId)}/tracks`, { method: 'POST', json: { trackIds } }),
  removeFromPlaylist: (playlistId: string, entryId: string) =>
    apiRequest<void>(`/playlists/${id(playlistId)}/tracks/${id(entryId)}`, { method: 'DELETE' }),
  reorderPlaylist: (playlistId: string, entryIds: string[]) =>
    apiRequest<void>(`/playlists/${id(playlistId)}/order`, { method: 'PUT', json: { entryIds } }),

  recommendations: () => apiRequest<Recommendations>('/recommendations'),
  mix: (mixId: string) => apiRequest<{ mix: MixSummary; tracks: Track[] }>(`/recommendations/mixes/${id(mixId)}`),
  radio: (seed: { track: string } | { artist: string }) =>
    apiRequest<{ title: string; tracks: Track[] }>(
      `/recommendations/radio${queryString('track' in seed ? { track: seed.track } : { artist: seed.artist })}`,
    ),

  accounts: () => apiRequest<{ users: Account[] }>('/admin/users').then((r) => r.users),
  createAccount: (input: { username: string; displayName?: string | null; pin?: string }) =>
    apiRequest<{ user: Account; pin: string }>('/admin/users', { method: 'POST', json: input }),
  updateAccount: (accountId: string, patch: { displayName?: string | null; disabled?: boolean }) =>
    apiRequest<{ user: Account }>(`/admin/users/${id(accountId)}`, { method: 'PATCH', json: patch }).then((r) => r.user),
  resetPin: (accountId: string, pin?: string) =>
    apiRequest<{ user: Account; pin: string }>(`/admin/users/${id(accountId)}/pin`, { method: 'POST', json: pin ? { pin } : {} }),
  deleteAccount: (accountId: string) => apiRequest<void>(`/admin/users/${id(accountId)}`, { method: 'DELETE' }),
  accountListening: (accountId: string, days: number) =>
    apiRequest<{ listening: ListeningStats }>(`/admin/users/${id(accountId)}/listening?days=${days}`).then((r) => r.listening),
};
