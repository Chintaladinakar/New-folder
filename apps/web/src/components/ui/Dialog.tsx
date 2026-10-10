import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { fade, modal } from '../../lib/motion';

type DialogProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  size?: 'md' | 'lg';
};

export function Dialog({ open, onClose, title, description, children, size = 'md' }: DialogProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const focusable = () =>
      Array.from(
        panel?.querySelectorAll<HTMLElement>('input, select, textarea, button, a[href], [tabindex]:not([tabindex="-1"])') ?? [],
      ).filter((element) => !element.hasAttribute('disabled'));
    (focusable()[0] ?? panel)?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onCloseRef.current();
      } else if (event.key === 'Tab') {
        // Keep focus inside the dialog.
        const items = focusable();
        if (items.length === 0) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      previouslyFocused?.focus?.();
    };
  }, [open]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          key="backdrop"
          variants={fade}
          initial="hidden"
          animate="visible"
          exit="exit"
          className="fixed inset-0 z-dialog flex items-end justify-center bg-shade/50 p-3 backdrop-blur-[2px] sm:items-center sm:p-4"
          onMouseDown={(event) => event.target === event.currentTarget && onClose()}
          onClick={(event) => event.stopPropagation()}
        >
          <motion.div
            ref={panelRef}
            variants={modal}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            className={`max-h-[85vh] w-full overflow-y-auto rounded-2xl border border-edge bg-surface p-6 shadow-float outline-none sm:p-7 ${
              size === 'lg' ? 'max-w-2xl' : 'max-w-md'
            }`}
          >
            <h2 id={titleId} className="font-display text-[1.75rem] leading-tight text-fg">
              {title}
            </h2>
            {description && <p className="mt-1.5 break-words text-sm text-muted">{description}</p>}
            <div className="mt-5">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

type ConfirmDialogProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  message: ReactNode;
  confirmLabel: string;
  onConfirm: () => Promise<unknown> | void;
};

export function ConfirmDialog({ open, onClose, title, message, confirmLabel, onConfirm }: ConfirmDialogProps) {
  const [pending, setPending] = useState(false);

  const confirm = async () => {
    setPending(true);
    try {
      await onConfirm();
      onClose();
    } catch {
      // The mutation already reported the error.
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title={title}>
      <div className="mb-7 text-sm text-muted">{message}</div>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} className="btn-secondary">
          Cancel
        </button>
        <button type="button" onClick={confirm} disabled={pending} className="btn-danger">
          {pending ? 'Working…' : confirmLabel}
        </button>
      </div>
    </Dialog>
  );
}
