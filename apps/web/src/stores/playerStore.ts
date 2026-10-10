import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { api } from '../lib/api';
import { getAudioElement, safeStorage } from '../lib/browser';
import { identityOrder, nextPosition, previousPosition, shuffleOrder, type RepeatMode } from '../lib/queue';
import { queryClient } from '../lib/queryClient';
import type { Track, TrackFilters } from '../types';

/**
 * Time and buffering change several times a second, so they live in their own store:
 * the persisted player store is only written when the queue or settings change.
 */
export const usePlaybackProgress = create<{ currentTime: number; duration: number; buffering: boolean }>(() => ({
  currentTime: 0,
  duration: 0,
  buffering: false,
}));

type PlayerState = {
  queue: Track[];
  /** Play order as indices into `queue`; a shuffled permutation when shuffle is on. */
  order: number[];
  /** Index into `order` of the current track, or -1 when nothing is selected. */
  position: number;
  isPlaying: boolean;
  error: string | null;
  volume: number;
  isMuted: boolean;
  shuffle: boolean;
  repeat: RepeatMode;
  queueOpen: boolean;

  playTracks: (tracks: Track[], startIndex?: number, options?: { shuffle?: boolean }) => void;
  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  seek: (time: number) => void;
  seekBy: (seconds: number) => void;
  next: () => void;
  previous: () => void;
  jumpTo: (position: number) => void;
  setVolume: (volume: number) => void;
  toggleMute: () => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  addToQueue: (tracks: Track[]) => void;
  playNext: (tracks: Track[]) => void;
  removeFromQueue: (position: number) => void;
  clearUpcoming: () => void;
  updateTrack: (track: Track) => void;
  removeTrack: (trackId: string) => void;
  setQueueOpen: (open: boolean) => void;
  stop: () => void;
};

export const currentTrackOf = (state: Pick<PlayerState, 'queue' | 'order' | 'position'>): Track | null =>
  state.position >= 0 ? (state.queue[state.order[state.position]] ?? null) : null;

// ---------------------------------------------------------------------------
// Audio element plumbing (module-level: there is exactly one element).
// ---------------------------------------------------------------------------

const RESUME_KEY = 'mp3-player:resume';
const PREVIOUS_RESTARTS_AFTER = 3;

let loadedTrackId: string | null = null;
let loadToken = 0;
let retriedToken = -1;
let recordedToken = -1;
let lastResumeWrite = 0;
let wired = false;

/**
 * The play in progress, as the server knows it. How long it was actually heard (seeks don't
 * count) is reported when it ends or is left, which is how recommendations tell a skip from a
 * favourite.
 */
type ActivePlay = { token: number; playId: Promise<number | null>; resolvedId?: number | null; listened: number; lastTime: number };
let activePlay: ActivePlay | null = null;

function finishActivePlay(completed: boolean, keepalive = false) {
  const play = activePlay;
  activePlay = null;
  if (!play) return;
  const listened = Math.round(play.listened);
  const send = (playId: number | null) => (playId === null ? undefined : api.finishPlay(playId, listened, completed, keepalive));
  // On page close there is no time to wait for the id: use it if it has already arrived.
  const sent = play.resolvedId !== undefined ? Promise.resolve(send(play.resolvedId)) : play.playId.then(send);
  sent.catch(() => undefined);
}

const hasMediaSession = () => typeof navigator !== 'undefined' && 'mediaSession' in navigator;

function readResume(trackId: string): number {
  try {
    const saved = JSON.parse(safeStorage.getItem(RESUME_KEY) ?? 'null') as { trackId: string; time: number } | null;
    return saved?.trackId === trackId && Number.isFinite(saved.time) ? saved.time : 0;
  } catch {
    return 0;
  }
}

function writeResume(trackId: string, time: number) {
  safeStorage.setItem(RESUME_KEY, JSON.stringify({ trackId, time }));
}

function isFresh(expiresAt: string | null): boolean {
  return expiresAt !== null && Date.parse(expiresAt) - Date.now() > 60_000;
}

function audio(): HTMLAudioElement {
  const element = getAudioElement();
  if (!wired) {
    wired = true;
    wireAudio(element);
  }
  return element;
}

function playElement(element: HTMLAudioElement) {
  element.play().catch((error: Error) => {
    // AbortError: a newer load replaced this one. NotAllowedError: the browser wants a tap first.
    if (error.name !== 'AbortError') {
      usePlayerStore.setState({ isPlaying: false });
      usePlaybackProgress.setState({ buffering: false });
    }
  });
}

function fail(message: string) {
  usePlayerStore.setState({ isPlaying: false, error: message });
  usePlaybackProgress.setState({ buffering: false });
}

function updateMediaMetadata(track: Track | null) {
  if (!hasMediaSession()) return;
  try {
    navigator.mediaSession.metadata = track
      ? new MediaMetadata({
          title: track.title,
          artist: track.artist ?? '',
          album: track.album ?? '',
          artwork: track.artworkUrl ? [{ src: track.artworkUrl }] : [],
        })
      : null;
  } catch {
    // MediaMetadata is missing in some embedded browsers.
  }
}

function seekWhenReady(element: HTMLAudioElement, token: number, time: number) {
  if (time <= 0) return;
  element.addEventListener(
    'loadedmetadata',
    () => {
      if (token === loadToken) element.currentTime = time;
    },
    { once: true },
  );
}

function loadTrack(track: Track, autoplay: boolean, startAt = 0) {
  const element = audio();
  // Whatever was playing is being left before its end.
  finishActivePlay(false);
  const token = ++loadToken;
  loadedTrackId = track.id;
  usePlaybackProgress.setState({ currentTime: startAt, duration: track.duration ?? 0, buffering: autoplay });
  usePlayerStore.setState({ error: null });
  updateMediaMetadata(track);

  const start = (url: string) => {
    if (token !== loadToken) return;
    element.src = url;
    seekWhenReady(element, token, startAt);
    if (autoplay) playElement(element);
  };

  // Using the URL that came with the track keeps play() inside the user's tap,
  // which mobile browsers require before they allow audio.
  if (track.streamUrl && isFresh(track.urlsExpireAt)) {
    start(track.streamUrl);
  } else {
    api.getStreamUrl(track.id).then(
      ({ url }) => start(url),
      (error: Error) => token === loadToken && fail(error.message),
    );
  }
}

function unload() {
  const element = audio();
  finishActivePlay(false);
  loadToken += 1;
  loadedTrackId = null;
  element.pause();
  element.removeAttribute('src');
  element.load();
  usePlaybackProgress.setState({ currentTime: 0, duration: 0, buffering: false });
  updateMediaMetadata(null);
}

function goTo(position: number, autoplay: boolean) {
  usePlayerStore.setState({ position });
  const track = currentTrackOf(usePlayerStore.getState());
  if (track) loadTrack(track, autoplay);
}

function handleEnded() {
  const state = usePlayerStore.getState();
  const element = audio();
  finishActivePlay(true);
  if (state.repeat === 'one') {
    // Each time round is a play of its own.
    recordedToken = -1;
    element.currentTime = 0;
    playElement(element);
    return;
  }

  const next = nextPosition(state.position, state.order.length, state.repeat);
  if (next === null) {
    // End of the queue: stop on the last track, rewound, ready to play again.
    element.currentTime = 0;
    usePlayerStore.setState({ isPlaying: false });
    usePlaybackProgress.setState({ currentTime: 0 });
    return;
  }
  goTo(next, true);
}

function handleError(element: HTMLAudioElement) {
  const track = currentTrackOf(usePlayerStore.getState());
  if (!track || !element.error || loadedTrackId !== track.id) return;

  if (retriedToken !== loadToken) {
    // Most failures are an expired signed URL: fetch a fresh one once and carry on from the same spot.
    retriedToken = loadToken;
    const token = loadToken;
    const resumeAt = usePlaybackProgress.getState().currentTime;
    const shouldPlay = usePlayerStore.getState().isPlaying || usePlaybackProgress.getState().buffering;
    api.getStreamUrl(track.id).then(
      ({ url }) => {
        if (token !== loadToken) return;
        element.src = url;
        seekWhenReady(element, token, resumeAt);
        if (shouldPlay) playElement(element);
      },
      (error: Error) => token === loadToken && fail(error.message),
    );
    return;
  }
  fail(`"${track.title}" could not be played.`);
}

function wireAudio(element: HTMLAudioElement) {
  const state = usePlayerStore.getState();
  element.volume = state.volume;
  element.muted = state.isMuted;

  const syncPosition = () => {
    if (!hasMediaSession() || !Number.isFinite(element.duration) || element.duration <= 0) return;
    try {
      navigator.mediaSession.setPositionState({
        duration: element.duration,
        position: Math.min(element.currentTime, element.duration),
        playbackRate: element.playbackRate,
      });
    } catch {
      // Unsupported or invalid state; position display is optional.
    }
  };

  element.addEventListener('timeupdate', () => {
    usePlaybackProgress.setState({ currentTime: element.currentTime });
    if (activePlay?.token === loadToken) {
      // Only steady forward progress is listening; a jump is a seek.
      const step = element.currentTime - activePlay.lastTime;
      if (!element.paused && step > 0 && step < 2.5) activePlay.listened += step;
      activePlay.lastTime = element.currentTime;
    }
    const now = Date.now();
    if (loadedTrackId && now - lastResumeWrite > 5000) {
      lastResumeWrite = now;
      writeResume(loadedTrackId, element.currentTime);
    }
  });
  element.addEventListener('durationchange', () => {
    if (Number.isFinite(element.duration)) usePlaybackProgress.setState({ duration: element.duration });
    syncPosition();
  });
  element.addEventListener('play', () => {
    usePlayerStore.setState({ isPlaying: true });
    if (hasMediaSession()) navigator.mediaSession.playbackState = 'playing';
  });
  element.addEventListener('pause', () => {
    usePlayerStore.setState({ isPlaying: false });
    if (loadedTrackId) writeResume(loadedTrackId, element.currentTime);
    if (hasMediaSession()) navigator.mediaSession.playbackState = 'paused';
    syncPosition();
  });
  element.addEventListener('waiting', () => usePlaybackProgress.setState({ buffering: true }));
  element.addEventListener('canplay', () => usePlaybackProgress.setState({ buffering: false }));
  element.addEventListener('seeked', () => {
    if (activePlay) activePlay.lastTime = element.currentTime;
    syncPosition();
  });
  // Closing the tab or app mid-song still reports how much of it was heard.
  if (typeof window !== 'undefined') window.addEventListener('pagehide', () => finishActivePlay(false, true));
  element.addEventListener('playing', () => {
    usePlaybackProgress.setState({ buffering: false });
    usePlayerStore.setState({ error: null });
    syncPosition();
    if (recordedToken !== loadToken && loadedTrackId) {
      recordedToken = loadToken;
      const play: ActivePlay = { token: loadToken, listened: 0, lastTime: element.currentTime, playId: Promise.resolve(null) };
      play.playId = api
        .recordPlay(loadedTrackId)
        .then((result) => {
          void queryClient.invalidateQueries({
            queryKey: ['tracks'],
            predicate: (query) => (query.queryKey[1] as TrackFilters | undefined)?.played === true,
          });
          return result?.playId ?? null;
        })
        .catch(() => null)
        .then((playId) => (play.resolvedId = playId));
      activePlay = play;
    }
  });
  element.addEventListener('ended', handleEnded);
  element.addEventListener('error', () => handleError(element));

  if (hasMediaSession()) {
    const actions: [MediaSessionAction, MediaSessionActionHandler][] = [
      ['play', () => usePlayerStore.getState().play()],
      ['pause', () => usePlayerStore.getState().pause()],
      ['previoustrack', () => usePlayerStore.getState().previous()],
      ['nexttrack', () => usePlayerStore.getState().next()],
      ['seekbackward', (details) => usePlayerStore.getState().seekBy(-(details.seekOffset ?? 10))],
      ['seekforward', (details) => usePlayerStore.getState().seekBy(details.seekOffset ?? 10)],
      ['seekto', (details) => details.seekTime !== undefined && usePlayerStore.getState().seek(details.seekTime)],
    ];
    for (const [action, handler] of actions) {
      try {
        navigator.mediaSession.setActionHandler(action, handler);
      } catch {
        // Action not supported by this browser.
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

const MAX_PERSISTED_QUEUE = 1000;

export const usePlayerStore = create<PlayerState>()(
  persist(
    (set, get) => ({
      queue: [],
      order: [],
      position: -1,
      isPlaying: false,
      error: null,
      volume: 1,
      isMuted: false,
      shuffle: false,
      repeat: 'off',
      queueOpen: false,

      playTracks: (tracks, startIndex = 0, options = {}) => {
        if (tracks.length === 0) return;
        const shuffle = options.shuffle ?? get().shuffle;
        const first = options.shuffle && startIndex === 0 ? Math.floor(Math.random() * tracks.length) : startIndex;
        const order = shuffle ? shuffleOrder(tracks.length, first) : identityOrder(tracks.length);
        set({ queue: tracks, order, position: shuffle ? 0 : startIndex, shuffle, error: null });
        const track = currentTrackOf(get());
        if (track) loadTrack(track, true);
      },

      play: () => {
        const track = currentTrackOf(get());
        if (!track) return;
        if (loadedTrackId !== track.id) {
          loadTrack(track, true, readResume(track.id));
        } else {
          playElement(audio());
        }
      },

      pause: () => audio().pause(),

      togglePlay: () => {
        const track = currentTrackOf(get());
        if (!track) return;
        if (loadedTrackId === track.id && !audio().paused) {
          audio().pause();
        } else {
          get().play();
        }
      },

      seek: (time) => {
        const duration = usePlaybackProgress.getState().duration;
        const target = Math.max(0, duration > 0 ? Math.min(time, duration) : time);
        usePlaybackProgress.setState({ currentTime: target });
        if (loadedTrackId) {
          audio().currentTime = target;
          writeResume(loadedTrackId, target);
        }
      },

      seekBy: (seconds) => get().seek(usePlaybackProgress.getState().currentTime + seconds),

      next: () => {
        const state = get();
        const next = nextPosition(state.position, state.order.length, state.repeat);
        if (next !== null) goTo(next, true);
      },

      previous: () => {
        const state = get();
        if (usePlaybackProgress.getState().currentTime > PREVIOUS_RESTARTS_AFTER) {
          state.seek(0);
          return;
        }
        const previous = previousPosition(state.position, state.order.length, state.repeat);
        if (previous === null) {
          state.seek(0);
        } else {
          goTo(previous, true);
        }
      },

      jumpTo: (position) => {
        if (position >= 0 && position < get().order.length) goTo(position, true);
      },

      setVolume: (volume) => {
        const clamped = Math.min(1, Math.max(0, volume));
        const element = audio();
        element.volume = clamped;
        const isMuted = clamped > 0 ? false : get().isMuted;
        element.muted = isMuted;
        set({ volume: clamped, isMuted });
      },

      toggleMute: () => {
        const isMuted = !get().isMuted;
        audio().muted = isMuted;
        set({ isMuted });
      },

      toggleShuffle: () => {
        const state = get();
        const currentIndex = state.position >= 0 ? state.order[state.position] : null;
        if (state.shuffle) {
          set({ shuffle: false, order: identityOrder(state.queue.length), position: currentIndex ?? -1 });
        } else {
          const order = shuffleOrder(state.queue.length, currentIndex);
          set({ shuffle: true, order, position: currentIndex === null ? -1 : 0 });
        }
      },

      cycleRepeat: () => {
        const next: Record<RepeatMode, RepeatMode> = { off: 'all', all: 'one', one: 'off' };
        set({ repeat: next[get().repeat] });
      },

      addToQueue: (tracks) => {
        if (tracks.length === 0) return;
        const state = get();
        const start = state.queue.length;
        set({
          queue: [...state.queue, ...tracks],
          order: [...state.order, ...tracks.map((_, i) => start + i)],
          position: state.position === -1 ? state.order.length : state.position,
        });
      },

      playNext: (tracks) => {
        if (tracks.length === 0) return;
        const state = get();
        const start = state.queue.length;
        const inserted = tracks.map((_, i) => start + i);
        const at = state.position + 1;
        set({
          queue: [...state.queue, ...tracks],
          order: [...state.order.slice(0, at), ...inserted, ...state.order.slice(at)],
          position: state.position === -1 ? 0 : state.position,
        });
      },

      removeFromQueue: (position) => {
        const state = get();
        if (position === state.position || position < 0 || position >= state.order.length) return;
        const removedIndex = state.order[position];
        set({
          queue: state.queue.filter((_, i) => i !== removedIndex),
          order: state.order.filter((_, i) => i !== position).map((i) => (i > removedIndex ? i - 1 : i)),
          position: position < state.position ? state.position - 1 : state.position,
        });
      },

      clearUpcoming: () => {
        const state = get();
        const kept = state.order.slice(0, state.position + 1);
        set({ queue: kept.map((i) => state.queue[i]), order: identityOrder(kept.length), position: kept.length - 1 });
      },

      updateTrack: (track) => {
        const state = get();
        if (!state.queue.some((t) => t.id === track.id)) return;
        set({ queue: state.queue.map((t) => (t.id === track.id ? track : t)) });
        if (currentTrackOf(get())?.id === track.id) updateMediaMetadata(track);
      },

      removeTrack: (trackId) => {
        const state = get();
        const current = currentTrackOf(state);
        const newIndex = new Map<number, number>();
        const queue: Track[] = [];
        state.queue.forEach((track, i) => {
          if (track.id !== trackId) {
            newIndex.set(i, queue.length);
            queue.push(track);
          }
        });
        if (queue.length === state.queue.length) return;

        const order = state.order.filter((i) => newIndex.has(i)).map((i) => newIndex.get(i)!);
        let position: number;
        if (current && current.id !== trackId) {
          position = order.indexOf(newIndex.get(state.order[state.position])!);
        } else {
          // The current track was deleted: stop, and select whatever now sits in its place.
          if (current) unload();
          const removedBefore = state.order.slice(0, state.position).filter((i) => !newIndex.has(i)).length;
          position = Math.min(state.position - removedBefore, order.length - 1);
        }
        set({ queue, order, position: order.length > 0 ? position : -1 });
      },

      setQueueOpen: (queueOpen) => set({ queueOpen }),

      stop: () => {
        if (wired || loadedTrackId) unload();
        safeStorage.removeItem(RESUME_KEY);
        set({ queue: [], order: [], position: -1, isPlaying: false, error: null, queueOpen: false });
      },
    }),
    {
      name: 'mp3-player:player',
      version: 1,
      storage: createJSONStorage(() => safeStorage),
      partialize: (state) => {
        const settings = { volume: state.volume, isMuted: state.isMuted, shuffle: state.shuffle, repeat: state.repeat };
        if (state.queue.length <= MAX_PERSISTED_QUEUE) {
          return { ...settings, queue: state.queue, order: state.order, position: state.position };
        }
        // Very long queues: remember only the current track.
        const current = currentTrackOf(state);
        return { ...settings, queue: current ? [current] : [], order: current ? [0] : [], position: current ? 0 : -1 };
      },
    },
  ),
);
