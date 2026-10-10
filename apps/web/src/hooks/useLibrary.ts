import { useInfiniteQuery, useMutation, useQuery, type QueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { api } from '../lib/api';
import { queryClient } from '../lib/queryClient';
import { useAuthStore } from '../stores/authStore';
import { usePlayerStore } from '../stores/playerStore';
import { toast } from '../stores/toastStore';
import type { PlaylistEntry, Track, TrackFilters, TrackPage, TrackPatch } from '../types';

const PAGE_SIZE = 100;

export function useTrackPages(filters: TrackFilters) {
  const query = useInfiniteQuery({
    queryKey: ['tracks', filters, 'pages'],
    queryFn: ({ pageParam }) => api.listTracks({ ...filters, limit: PAGE_SIZE, offset: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, pages) => {
      const loaded = pages.reduce((count, page) => count + page.tracks.length, 0);
      return loaded < lastPage.total && lastPage.tracks.length > 0 ? loaded : undefined;
    },
  });
  const tracks = useMemo(() => query.data?.pages.flatMap((page) => page.tracks) ?? [], [query.data]);
  return { ...query, tracks, total: query.data?.pages[0]?.total ?? 0 };
}

export function useTrackPreview(filters: TrackFilters, limit: number) {
  return useQuery({
    queryKey: ['tracks', filters, 'preview', limit],
    queryFn: () => api.listTracks({ ...filters, limit, offset: 0 }),
  });
}

export const useFacets = () => useQuery({ queryKey: ['facets'], queryFn: api.facets, staleTime: 5 * 60_000 });

export function useLyrics(trackId: string | null, enabled = true) {
  return useQuery({
    queryKey: ['lyrics', trackId],
    queryFn: () => api.getLyrics(trackId as string),
    enabled: enabled && trackId !== null,
    staleTime: Infinity,
  });
}

export function useRefreshLyrics() {
  return useMutation({
    mutationFn: (trackId: string) => api.getLyrics(trackId, true),
    onSuccess: (lyrics, trackId) => {
      queryClient.setQueryData(['lyrics', trackId], lyrics);
      void queryClient.invalidateQueries({ queryKey: ['tracks'] });
      if (!lyrics.lyrics && !lyrics.syncedLyrics) toast('No lyrics found for this track');
    },
    onError: showError,
  });
}

export function useSetLyrics() {
  return useMutation({
    mutationFn: ({ trackId, lyrics }: { trackId: string; lyrics: string | null }) => api.setLyrics(trackId, { lyrics }),
    onSuccess: (lyrics, { trackId }) => {
      queryClient.setQueryData(['lyrics', trackId], lyrics);
      void queryClient.invalidateQueries({ queryKey: ['tracks'] });
      toast('Lyrics saved');
    },
    onError: showError,
  });
}

export const useAlbums = () => useQuery({ queryKey: ['albums'], queryFn: api.albums });
export const useArtists = () => useQuery({ queryKey: ['artists'], queryFn: api.artists });
export const useStats = () => useQuery({ queryKey: ['stats'], queryFn: api.stats });
export const usePlaylists = () => useQuery({ queryKey: ['playlists'], queryFn: api.playlists });
export const usePlaylist = (id: string) => useQuery({ queryKey: ['playlist', id], queryFn: () => api.playlist(id) });

type CachedTracks = { pages?: TrackPage[]; tracks?: Track[]; entries?: PlaylistEntry[] } | undefined;

/** Puts an updated track into every cached list that shows it, and into the player queue. */
function syncTrack(client: QueryClient, track: Track) {
  const swap = (t: Track) => (t.id === track.id ? track : t);
  const replace = (data: CachedTracks): CachedTracks => {
    if (!data) return data;
    if (data.pages) return { ...data, pages: data.pages.map((page) => ({ ...page, tracks: page.tracks.map(swap) })) };
    if (data.tracks) return { ...data, tracks: data.tracks.map(swap) };
    if (data.entries) return { ...data, entries: data.entries.map((entry) => ({ ...entry, track: swap(entry.track) })) };
    return data;
  };
  client.setQueriesData<CachedTracks>({ queryKey: ['tracks'] }, replace);
  client.setQueriesData<CachedTracks>({ queryKey: ['playlist'] }, replace);
  usePlayerStore.getState().updateTrack(track);
}

const showError = (error: Error) => toast(error.message, 'error');

export function useUpdateTrack() {
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: TrackPatch }) => api.updateTrack(id, patch),
    onSuccess: (track, { patch }) => {
      syncTrack(queryClient, track);
      const onlyFavorite = Object.keys(patch).every((key) => key === 'isFavorite');
      void queryClient.invalidateQueries({
        queryKey: ['tracks'],
        // A favourite toggle only changes favourite lists; metadata edits can change any sort or filter.
        predicate: onlyFavorite ? (query) => (query.queryKey[1] as TrackFilters | undefined)?.favorite === true : undefined,
      });
      void queryClient.invalidateQueries({ queryKey: ['stats'] });
      if (!onlyFavorite) {
        void queryClient.invalidateQueries({ queryKey: ['albums'] });
        void queryClient.invalidateQueries({ queryKey: ['artists'] });
        void queryClient.invalidateQueries({ queryKey: ['facets'] });
      }
    },
    onError: showError,
  });
}

export function useDeleteTrack() {
  return useMutation({
    mutationFn: (track: Track) => api.deleteTrack(track.id),
    onSuccess: (_, track) => {
      usePlayerStore.getState().removeTrack(track.id);
      for (const key of ['tracks', 'albums', 'artists', 'stats', 'playlists', 'playlist', 'facets']) {
        void queryClient.invalidateQueries({ queryKey: [key] });
      }
      toast(`Deleted "${track.title}"`);
    },
    onError: showError,
  });
}

const refreshPlaylists = (id?: string) => {
  void queryClient.invalidateQueries({ queryKey: ['playlists'] });
  if (id) void queryClient.invalidateQueries({ queryKey: ['playlist', id] });
};

export function useCreatePlaylist() {
  return useMutation({
    mutationFn: api.createPlaylist,
    onSuccess: () => refreshPlaylists(),
    onError: showError,
  });
}

export function useUpdatePlaylist() {
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: { name?: string; description?: string | null } }) =>
      api.updatePlaylist(id, patch),
    onSuccess: (playlist) => refreshPlaylists(playlist.id),
    onError: showError,
  });
}

export function useDeletePlaylist() {
  return useMutation({
    mutationFn: (id: string) => api.deletePlaylist(id),
    // The detail page is still mounted until it navigates away; removing its query here would make it
    // fetch the deleted playlist again (a 404). It is dropped from the cache once nothing is watching it.
    onSuccess: () => refreshPlaylists(),
    onError: showError,
  });
}

export function useAddToPlaylist() {
  return useMutation({
    mutationFn: ({ id, trackIds }: { id: string; name: string; trackIds: string[] }) => api.addToPlaylist(id, trackIds),
    onSuccess: ({ added }, { id, name }) => {
      refreshPlaylists(id);
      toast(`Added ${added === 1 ? '1 track' : `${added} tracks`} to ${name}`);
    },
    onError: showError,
  });
}

export function useRemoveFromPlaylist() {
  return useMutation({
    mutationFn: ({ id, entryId }: { id: string; entryId: string }) => api.removeFromPlaylist(id, entryId),
    onSuccess: (_, { id }) => refreshPlaylists(id),
    onError: showError,
  });
}

/** Made for you: mixes and shelves, from the server's recommendation engine. */
export const useRecommendations = () =>
  useQuery({ queryKey: ['recommendations'], queryFn: api.recommendations, staleTime: 5 * 60_000 });

const mixQuery = (mixId: string) => ({ queryKey: ['mix', mixId], queryFn: () => api.mix(mixId), staleTime: 5 * 60_000 });

export const useMix = (mixId: string) => useQuery(mixQuery(mixId));

/** Plays one of the account's mixes from the top, fetching it unless it is already loaded. */
export async function playMix(mixId: string) {
  try {
    const { tracks } = await queryClient.fetchQuery(mixQuery(mixId));
    if (tracks.length) usePlayerStore.getState().playTracks(tracks, 0, { shuffle: false });
    else toast('This mix is empty today');
  } catch (error) {
    showError(error as Error);
  }
}

/** Plays a radio station built from a track or an artist. */
export async function startRadio(seed: { track: string } | { artist: string }) {
  try {
    const station = await api.radio(seed);
    if (station.tracks.length === 0) {
      toast('Nothing in the library goes with that yet');
      return;
    }
    usePlayerStore.getState().playTracks(station.tracks, 0, { shuffle: false });
    toast(`Playing ${station.title}`);
  } catch (error) {
    showError(error as Error);
  }
}

export const useAccounts = () => useQuery({ queryKey: ['accounts'], queryFn: api.accounts });

const refreshAccounts = () => void queryClient.invalidateQueries({ queryKey: ['accounts'] });

// Creating an account and resetting a PIN happen in dialogs, which show their own errors.
export function useCreateAccount() {
  return useMutation({ mutationFn: api.createAccount, onSuccess: refreshAccounts });
}

export function useUpdateAccount() {
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: { displayName?: string | null; disabled?: boolean } }) => api.updateAccount(id, patch),
    onSuccess: ({ id, username, displayName, role }) => {
      refreshAccounts();
      // Renaming yourself: the top bar shows the new name straight away.
      if (useAuthStore.getState().user?.id === id) useAuthStore.getState().setUser({ id, username, displayName, role });
    },
    onError: showError,
  });
}

export function useResetPin() {
  return useMutation({ mutationFn: ({ id, pin }: { id: string; pin?: string }) => api.resetPin(id, pin), onSuccess: refreshAccounts });
}

export function useDeleteAccount() {
  return useMutation({ mutationFn: api.deleteAccount, onSuccess: refreshAccounts, onError: showError });
}

export function useReorderPlaylist() {
  return useMutation({
    mutationFn: ({ id, entries }: { id: string; entries: PlaylistEntry[] }) =>
      api.reorderPlaylist(
        id,
        entries.map((entry) => entry.entryId),
      ),
    // Show the new order immediately; roll back if the server refuses.
    onMutate: ({ id, entries }) => {
      const key = ['playlist', id];
      const previous = queryClient.getQueryData(key);
      queryClient.setQueryData<{ entries: PlaylistEntry[] }>(key, (data) => (data ? { ...data, entries } : data));
      return { previous, key };
    },
    onError: (error, _, context) => {
      if (context) queryClient.setQueryData(context.key, context.previous);
      showError(error);
    },
    onSettled: (_, __, { id }) => refreshPlaylists(id),
  });
}
