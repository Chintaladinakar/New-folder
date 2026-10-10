import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { safeStorage } from '../lib/browser';
import type { TrackSort } from '../types';

export type ThemeName = 'system' | 'dark' | 'oled' | 'light';
export type AccentName = 'violet' | 'blue' | 'cyan' | 'emerald' | 'amber' | 'orange' | 'rose' | 'pink';
export type MotionPreference = 'system' | 'full' | 'reduced';
export type PlayingAnimation = 'bars' | 'pulse' | 'none';

/** The colours themselves live in index.css, one shade per theme. */
export const ACCENTS: { name: AccentName; label: string }[] = [
  { name: 'orange', label: 'Vermilion' },
  { name: 'amber', label: 'Ochre' },
  { name: 'emerald', label: 'Jade' },
  { name: 'cyan', label: 'Teal' },
  { name: 'blue', label: 'Cobalt' },
  { name: 'violet', label: 'Violet' },
  { name: 'rose', label: 'Rose' },
  { name: 'pink', label: 'Orchid' },
];

export type Settings = {
  theme: ThemeName;
  accent: AccentName;
  motion: MotionPreference;
  density: 'comfortable' | 'compact';
  rowArtwork: boolean;
  playingAnimation: PlayingAnimation;
  dynamicBackground: boolean;
  lyricsAutoShow: boolean;
  lyricsAutoFetch: boolean;
  resumePlayback: boolean;
  defaultSort: TrackSort;
  homeShowStats: boolean;
  /** Wide screens: keep the player in a side panel instead of the bottom dock. */
  nowPlayingPanel: boolean;
};

export const DEFAULT_SETTINGS: Settings = {
  theme: 'dark',
  accent: 'orange',
  motion: 'system',
  density: 'comfortable',
  rowArtwork: true,
  playingAnimation: 'bars',
  dynamicBackground: true,
  lyricsAutoShow: false,
  lyricsAutoFetch: true,
  resumePlayback: true,
  defaultSort: 'recent',
  homeShowStats: true,
  nowPlayingPanel: true,
};

type SettingsState = Settings & {
  update: (patch: Partial<Settings>) => void;
  reset: () => void;
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      ...DEFAULT_SETTINGS,
      update: (patch) => set(patch),
      reset: () => set(DEFAULT_SETTINGS),
    }),
    {
      name: 'mp3-player:settings',
      version: 2,
      storage: createJSONStorage(() => safeStorage),
      migrate: (persisted, version) => {
        const state = (persisted ?? {}) as Partial<Settings>;
        // v2 changed the default accent; settings still on the old default follow it.
        // index.html applies the same rule before React loads.
        if (version < 2 && state.accent === 'violet') state.accent = DEFAULT_SETTINGS.accent;
        return state as SettingsState;
      },
    },
  ),
);

const prefers = (query: string) => typeof window !== 'undefined' && window.matchMedia?.(query).matches;

export function resolveTheme(theme: ThemeName): Exclude<ThemeName, 'system'> {
  return theme === 'system' ? (prefers('(prefers-color-scheme: light)') ? 'light' : 'dark') : theme;
}

export function resolveReducedMotion(motion: MotionPreference): boolean {
  return motion === 'reduced' || (motion === 'system' && prefers('(prefers-reduced-motion: reduce)'));
}
