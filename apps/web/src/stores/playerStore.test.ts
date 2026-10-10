import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Track } from '../types';

/** Just enough of HTMLAudioElement for the store, driven by the test. */
class FakeAudio extends EventTarget {
  src = '';
  currentTime = 0;
  duration = Number.NaN;
  paused = true;
  volume = 1;
  muted = false;
  playbackRate = 1;
  preload = '';
  error: { code: number } | null = null;

  play() {
    this.paused = false;
    this.dispatchEvent(new Event('play'));
    this.dispatchEvent(new Event('playing'));
    return Promise.resolve();
  }
  pause() {
    if (this.paused) return;
    this.paused = true;
    this.dispatchEvent(new Event('pause'));
  }
  load() {}
  removeAttribute(name: string) {
    if (name === 'src') this.src = '';
  }
  finish() {
    this.paused = true;
    this.dispatchEvent(new Event('pause'));
    this.dispatchEvent(new Event('ended'));
  }
}

const audio = new FakeAudio();
const getStreamUrl = vi.fn(async (id: string) => ({ url: `https://fresh.test/${id}`, expiresAt: '2999-01-01T00:00:00Z' }));
let nextPlayId = 1;
const recordPlay = vi.fn(async (_trackId: string) => ({ playId: nextPlayId++ }));
const finishPlay = vi.fn(async (_playId: number, _listened: number, _completed: boolean, _keepalive?: boolean) => undefined);

vi.mock('../lib/browser', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/browser')>()),
  getAudioElement: () => audio,
}));
vi.mock('../lib/api', () => ({
  ApiError: class ApiError extends Error {},
  api: {
    getStreamUrl: (id: string) => getStreamUrl(id),
    recordPlay: (id: string) => recordPlay(id),
    finishPlay: (playId: number, listened: number, completed: boolean, keepalive?: boolean) => finishPlay(playId, listened, completed, keepalive),
  },
}));

const { currentTrackOf, usePlaybackProgress, usePlayerStore } = await import('./playerStore');

const future = new Date(Date.now() + 3600_000).toISOString();
const track = (id: string, overrides: Partial<Track> = {}): Track => ({
  id,
  title: `Track ${id}`,
  artist: null,
  album: null,
  albumArtist: null,
  genre: null,
  year: null,
  duration: 200,
  trackNumber: null,
  discNumber: null,
  fileName: `${id}.mp3`,
  fileSize: 1,
  mimeType: 'audio/mpeg',
  isFavorite: false,
  playCount: 0,
  lastPlayedAt: null,
  hasLyrics: false,
  lyricsSource: null,
  createdAt: '',
  updatedAt: '',
  artworkUrl: null,
  streamUrl: `https://signed.test/${id}`,
  urlsExpireAt: future,
  ...overrides,
});

const tracks = [track('a'), track('b'), track('c')];
const current = () => currentTrackOf(usePlayerStore.getState())?.id;

describe('player store', () => {
  beforeEach(() => {
    usePlayerStore.getState().stop();
    usePlayerStore.setState({ shuffle: false, repeat: 'off' });
    getStreamUrl.mockClear();
    recordPlay.mockClear();
    finishPlay.mockClear();
    nextPlayId = 1;
    audio.currentTime = 0;
  });

  it('reports how much of each play was heard, and whether it finished', async () => {
    const tick = (time: number) => {
      audio.currentTime = time;
      audio.dispatchEvent(new Event('timeupdate'));
    };
    usePlayerStore.getState().playTracks(tracks, 0);
    expect(recordPlay).toHaveBeenCalledWith('a');

    for (let time = 1; time <= 40; time += 1) tick(time);
    // Paused time and a seek ahead aren't listening.
    audio.pause();
    tick(41);
    audio.currentTime = 150;
    audio.dispatchEvent(new Event('seeked'));
    void audio.play();
    for (let time = 151; time <= 155; time += 1) tick(time);
    expect(recordPlay).toHaveBeenCalledTimes(1);

    // Skipping ahead leaves "a" unfinished.
    audio.currentTime = 0;
    usePlayerStore.getState().next();
    await vi.waitFor(() => expect(finishPlay).toHaveBeenCalledWith(1, 45, false, false));
    expect(recordPlay).toHaveBeenLastCalledWith('b');

    // "b" plays to its end.
    for (let time = 1; time <= 30; time += 1) tick(time);
    audio.finish();
    await vi.waitFor(() => expect(finishPlay).toHaveBeenLastCalledWith(2, 30, true, false));
  });

  it('starts playback synchronously from the signed URL that came with the track', () => {
    usePlayerStore.getState().playTracks(tracks, 1);
    expect(current()).toBe('b');
    expect(audio.src).toBe('https://signed.test/b');
    expect(usePlayerStore.getState().isPlaying).toBe(true);
    expect(getStreamUrl).not.toHaveBeenCalled();
  });

  it('fetches a fresh URL when the one on the track has expired', async () => {
    usePlayerStore.getState().playTracks([track('old', { urlsExpireAt: new Date(Date.now() - 1000).toISOString() })]);
    await vi.waitFor(() => expect(audio.src).toBe('https://fresh.test/old'));
    expect(getStreamUrl).toHaveBeenCalledWith('old');
  });

  it('seeks the audio element from anywhere', () => {
    usePlayerStore.getState().playTracks(tracks, 0);
    usePlaybackProgress.setState({ duration: 200 });
    usePlayerStore.getState().seek(42);
    expect(audio.currentTime).toBe(42);
    expect(usePlaybackProgress.getState().currentTime).toBe(42);
  });

  it('restarts the track on "previous" after three seconds, otherwise goes back', () => {
    usePlayerStore.getState().playTracks(tracks, 1);
    usePlaybackProgress.setState({ currentTime: 30, duration: 200 });
    usePlayerStore.getState().previous();
    expect(current()).toBe('b');
    expect(audio.currentTime).toBe(0);

    usePlaybackProgress.setState({ currentTime: 1 });
    usePlayerStore.getState().previous();
    expect(current()).toBe('a');
  });

  it('stops cleanly at the end of the queue when repeat is off', () => {
    usePlayerStore.getState().playTracks(tracks, 2);
    audio.finish();
    expect(current()).toBe('c');
    expect(usePlayerStore.getState().isPlaying).toBe(false);
  });

  it('wraps with repeat all and replays with repeat one', () => {
    usePlayerStore.setState({ repeat: 'all' });
    usePlayerStore.getState().playTracks(tracks, 2);
    audio.finish();
    expect(current()).toBe('a');

    usePlayerStore.setState({ repeat: 'one' });
    audio.currentTime = 150;
    audio.finish();
    expect(current()).toBe('a');
    expect(audio.currentTime).toBe(0);
    expect(usePlayerStore.getState().isPlaying).toBe(true);
  });

  it('shuffles around the current track and restores the order', () => {
    const many = Array.from({ length: 8 }, (_, i) => track(String(i)));
    usePlayerStore.getState().playTracks(many, 3);
    usePlayerStore.getState().toggleShuffle();
    expect(usePlayerStore.getState().shuffle).toBe(true);
    expect(current()).toBe('3');
    expect(usePlayerStore.getState().position).toBe(0);

    usePlayerStore.getState().toggleShuffle();
    expect(usePlayerStore.getState().order).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(current()).toBe('3');
  });

  it('queues tracks next and last, and removes them', () => {
    usePlayerStore.getState().playTracks(tracks, 0);
    usePlayerStore.getState().addToQueue([track('z')]);
    usePlayerStore.getState().playNext([track('n')]);
    const upcoming = () => {
      const state = usePlayerStore.getState();
      return state.order.slice(state.position + 1).map((i) => state.queue[i].id);
    };
    expect(upcoming()).toEqual(['n', 'b', 'c', 'z']);

    usePlayerStore.getState().removeFromQueue(2);
    expect(upcoming()).toEqual(['n', 'c', 'z']);
    expect(current()).toBe('a');
  });

  it('drops a deleted track and stops if it was playing', () => {
    usePlayerStore.getState().playTracks(tracks, 1);
    usePlayerStore.getState().removeTrack('b');
    expect(usePlayerStore.getState().queue.map((t) => t.id)).toEqual(['a', 'c']);
    expect(current()).toBe('c');
    expect(audio.src).toBe('');

    usePlayerStore.getState().removeTrack('a');
    expect(current()).toBe('c');
  });
});
