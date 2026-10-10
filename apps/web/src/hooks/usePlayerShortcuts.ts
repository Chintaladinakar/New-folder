import { useEffect } from 'react';
import { usePlayerStore } from '../stores/playerStore';

const MOD_KEY = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent) ? '⌘' : 'Ctrl';

export const PLAYER_SHORTCUTS: [string, string][] = [
  ['Space', 'Play / pause'],
  ['← / →', 'Back / forward 5 seconds'],
  ['Shift + ← / →', 'Previous / next track'],
  ['M', 'Mute'],
  ['S', 'Shuffle'],
  ['R', 'Repeat'],
  [`/ or ${MOD_KEY} K`, 'Search'],
];

function isTyping(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  if (!element) return false;
  const tag = element.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || element.isContentEditable;
}

function focusSearch() {
  const input = document.getElementById('global-search') as HTMLInputElement | null;
  input?.focus();
  input?.select();
}

export function usePlayerShortcuts() {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      // Ctrl/⌘ K reaches search from anywhere, even from another text field.
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        focusSearch();
        return;
      }
      if (event.ctrlKey || event.metaKey || event.altKey || isTyping(event.target)) return;
      // Let focused buttons and links handle Space/Enter themselves.
      const onControl = (event.target as HTMLElement | null)?.closest('button, a, [role="menuitem"]');
      const player = usePlayerStore.getState();

      switch (event.key) {
        case ' ':
          if (onControl) return;
          player.togglePlay();
          break;
        case 'ArrowLeft':
          if (event.shiftKey) player.previous();
          else player.seekBy(-5);
          break;
        case 'ArrowRight':
          if (event.shiftKey) player.next();
          else player.seekBy(5);
          break;
        case 'm':
        case 'M':
          player.toggleMute();
          break;
        case 's':
        case 'S':
          player.toggleShuffle();
          break;
        case 'r':
        case 'R':
          player.cycleRepeat();
          break;
        case '/':
          focusSearch();
          break;
        default:
          return;
      }
      event.preventDefault();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
