import { ArrowsClockwise } from '@phosphor-icons/react';
import { AnimatePresence, motion } from 'motion/react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { rise } from '../../lib/motion';
import { floatingPosition, type FloatingLayout } from '../upload/Upload';

/** Shown when a new version of the app has been downloaded in the background. */
export function UpdatePrompt({ layout }: { layout: FloatingLayout }) {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      // Check for a new version every hour while the app stays open.
      if (registration) setInterval(() => void registration.update(), 60 * 60 * 1000);
    },
  });

  return (
    <AnimatePresence>
      {needRefresh && (
        <motion.div
          key="update"
          variants={rise}
          initial="hidden"
          animate="visible"
          exit="exit"
          role="status"
          className={`fixed z-[65] flex items-center gap-3 rounded-xl border border-edge bg-surface px-4 py-3 text-sm shadow-float md:w-80 ${floatingPosition(layout)}`}
        >
          <ArrowsClockwise className="h-4 w-4 shrink-0 text-accent" />
          <span className="flex-1">A new version is ready.</span>
          <button type="button" onClick={() => setNeedRefresh(false)} className="btn-ghost btn-sm">
            Later
          </button>
          <button type="button" onClick={() => void updateServiceWorker(true)} className="btn-primary btn-sm">
            Update
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
