import { create } from 'zustand';
import type { Track } from '../types';

interface PlayerState {
  currentTrack: Track | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  isMuted: boolean;
  shuffle: boolean;
  repeat: 'off' | 'all' | 'one';
  queue: Track[];
  
  // Actions
  setCurrentTrack: (track: Track | null) => void;
  setIsPlaying: (isPlaying: boolean) => void;
  setCurrentTime: (time: number) => void;
  setDuration: (duration: number) => void;
  setVolume: (volume: number) => void;
  setIsMuted: (isMuted: boolean) => void;
  toggleShuffle: () => void;
  toggleRepeat: () => void;
  setQueue: (queue: Track[]) => void;
  addToQueue: (track: Track) => void;
  playNext: () => void;
  playPrevious: () => void;
}

export const usePlayerStore = create<PlayerState>((set) => ({
  currentTrack: null,
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  volume: 1,
  isMuted: false,
  shuffle: false,
  repeat: 'off',
  queue: [],

  setCurrentTrack: (track) => set({ currentTrack: track, isPlaying: true }),
  setIsPlaying: (isPlaying) => set({ isPlaying }),
  setCurrentTime: (time) => set({ currentTime: time }),
  setDuration: (duration) => set({ duration }),
  setVolume: (volume) => set({ volume }),
  setIsMuted: (isMuted) => set({ isMuted }),
  toggleShuffle: () => set((state) => ({ shuffle: !state.shuffle })),
  toggleRepeat: () => set((state) => {
    const next = state.repeat === 'off' ? 'all' : state.repeat === 'all' ? 'one' : 'off';
    return { repeat: next };
  }),
  setQueue: (queue) => set({ queue }),
  addToQueue: (track) => set((state) => ({ queue: [...state.queue, track] })),
  playNext: () => set((state) => {
    if (!state.currentTrack || state.queue.length === 0) return state;
    const currentIndex = state.queue.findIndex(t => t.id === state.currentTrack?.id);
    if (currentIndex === -1 || currentIndex === state.queue.length - 1) {
      if (state.repeat === 'all') return { currentTrack: state.queue[0], isPlaying: true };
      return state; 
    }
    return { currentTrack: state.queue[currentIndex + 1], isPlaying: true };
  }),
  playPrevious: () => set((state) => {
    if (!state.currentTrack || state.queue.length === 0) return state;
    if (state.currentTime > 3) {
      return { currentTime: 0 };
    }
    const currentIndex = state.queue.findIndex(t => t.id === state.currentTrack?.id);
    if (currentIndex <= 0) {
      if (state.repeat === 'all') return { currentTrack: state.queue[state.queue.length - 1], isPlaying: true };
      return state;
    }
    return { currentTrack: state.queue[currentIndex - 1], isPlaying: true };
  }),
}));
