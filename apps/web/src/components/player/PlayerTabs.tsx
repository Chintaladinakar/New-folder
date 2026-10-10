import { motion } from 'motion/react';
import { useId, useState, type KeyboardEvent } from 'react';
import { spring } from '../../lib/motion';
import { currentTrackOf, usePlayerStore } from '../../stores/playerStore';
import { LyricsPanel } from './Lyrics';
import { UpNextList } from './UpNext';

type Tab = 'queue' | 'lyrics';

const TABS: [Tab, string][] = [
  ['queue', 'Up next'],
  ['lyrics', 'Lyrics'],
];

/** Up next and Lyrics, side by side as tabs: the side panel and the wide Now Playing page. */
export function PlayerTabs({
  initialTab = 'queue',
  lyricsSize = 'compact',
  className = '',
}: {
  initialTab?: Tab;
  lyricsSize?: 'compact' | 'large';
  className?: string;
}) {
  const track = usePlayerStore(currentTrackOf);
  const upNext = usePlayerStore((state) => Math.max(0, state.order.length - state.position - 1));
  const [tab, setTab] = useState<Tab>(initialTab);
  const id = useId();
  if (!track) return null;

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    // Handled here, so the global shortcut doesn't also seek.
    event.preventDefault();
    const next = tab === 'queue' ? 'lyrics' : 'queue';
    setTab(next);
    document.getElementById(`${id}-${next}`)?.focus();
  };

  return (
    <section className={`flex min-h-0 flex-col ${className}`}>
      <div role="tablist" aria-label="Player" onKeyDown={onKeyDown} className="flex shrink-0 gap-6 border-b border-edge px-6">
        {TABS.map(([value, label]) => (
          <button
            key={value}
            id={`${id}-${value}`}
            type="button"
            role="tab"
            aria-selected={tab === value}
            aria-controls={`${id}-panel`}
            tabIndex={tab === value ? 0 : -1}
            onClick={() => setTab(value)}
            className="tab"
          >
            {label}
            {value === 'queue' && upNext > 0 && <span className="ml-1.5 font-mono text-[11px] text-faint">{upNext}</span>}
            {tab === value && <motion.span layoutId={`${id}-underline`} transition={spring} className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-fg" />}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id={`${id}-panel`}
        aria-labelledby={`${id}-${tab}`}
        className={`min-h-0 flex-1 ${tab === 'queue' ? 'overflow-y-auto px-4 py-3' : 'flex flex-col px-6 pb-4 pt-3'}`}
      >
        {tab === 'queue' ? <UpNextList /> : <LyricsPanel track={track} size={lyricsSize} className="min-h-0 flex-1" />}
      </div>
    </section>
  );
}
