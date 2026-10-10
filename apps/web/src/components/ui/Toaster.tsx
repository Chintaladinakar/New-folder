import { CheckCircle, WarningCircle, X } from '@phosphor-icons/react';
import { AnimatePresence, motion } from 'motion/react';
import { toast as toastVariants } from '../../lib/motion';
import { useToastStore } from '../../stores/toastStore';

export function Toaster() {
  const toasts = useToastStore((state) => state.toasts);
  const dismiss = useToastStore((state) => state.dismiss);

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-3 top-[calc(env(safe-area-inset-top)+0.75rem)] z-toast flex flex-col items-center gap-2 sm:inset-x-auto sm:right-5 sm:top-20 sm:items-end"
    >
      <AnimatePresence initial={false}>
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            layout="position"
            variants={toastVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            role={toast.tone === 'error' ? 'alert' : 'status'}
            className={`pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border bg-surface px-4 py-3 text-sm text-fg shadow-float ${
              toast.tone === 'error' ? 'border-danger/40' : 'border-edge'
            }`}
          >
            {toast.tone === 'error' ? (
              <WarningCircle weight="fill" className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
            ) : (
              <CheckCircle weight="fill" className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
            )}
            <span className="min-w-0 flex-1 break-words">{toast.message}</span>
            <button type="button" onClick={() => dismiss(toast.id)} aria-label="Dismiss" className="icon-btn -m-1.5 p-1.5">
              <X className="h-4 w-4" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
