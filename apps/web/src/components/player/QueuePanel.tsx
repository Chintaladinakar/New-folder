import { X } from '@phosphor-icons/react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef } from 'react';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { fade, sheetRight, slideUp } from '../../lib/motion';
import { usePlayerStore } from '../../stores/playerStore';
import { UpNextList } from './UpNext';

/** The queue as a sheet: from the bottom on phones, floating at the right edge on larger screens. */
export function QueuePanel() {
  const open = usePlayerStore((state) => state.queueOpen);
  const setQueueOpen = usePlayerStore((state) => state.setQueueOpen);
  const desktop = useMediaQuery('(min-width: 768px)');
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => event.key === 'Escape' && setQueueOpen(false);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      previouslyFocused?.focus?.();
    };
  }, [open, setQueueOpen]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div key="queue-backdrop" variants={fade} initial="hidden" animate="visible" exit="exit" className="fixed inset-0 z-panel bg-shade/40" onClick={() => setQueueOpen(false)} />
      )}
      {open && (
        <motion.aside
          key="queue"
          variants={desktop ? sheetRight : slideUp}
          initial="hidden"
          animate="visible"
          exit="exit"
          aria-label="Queue"
          className="fixed inset-x-0 bottom-0 z-panel flex max-h-[85dvh] flex-col rounded-t-2xl border-t border-edge bg-surface shadow-float md:inset-y-3 md:left-auto md:right-3 md:max-h-none md:w-[23rem] md:rounded-2xl md:border"
        >
          <div className="flex items-center justify-between pb-2 pl-5 pr-3 pt-4">
            <h2 className="font-display text-[1.75rem] leading-none">Queue</h2>
            <button ref={closeRef} type="button" onClick={() => setQueueOpen(false)} aria-label="Close queue" className="icon-btn">
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-2">
            <UpNextList showCurrent />
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
