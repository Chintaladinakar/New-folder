import { ArrowClockwise, CaretDown, CaretUp, CheckCircle, Copy, UploadSimple, X, XCircle } from '@phosphor-icons/react';
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { AUDIO_ACCEPT, AUDIO_EXTENSIONS } from '../../lib/constants';
import { formatBytes } from '../../lib/format';
import { fade, rise } from '../../lib/motion';
import { useIsAdmin } from '../../stores/authStore';
import { ACTIVE_STATUSES, useUploadStore, type UploadItem } from '../../stores/uploadStore';
import { Spinner } from '../ui/Controls';

export function UploadButton({
  label = 'Upload music',
  className = 'btn-primary',
  labelClassName = '',
}: {
  label?: string;
  className?: string;
  /** e.g. "sr-only" for an icon-only button that still has a name. */
  labelClassName?: string;
}) {
  const addFiles = useUploadStore((state) => state.addFiles);
  // Only the admin adds music; for everyone else the button isn't there at all.
  const isAdmin = useIsAdmin();
  if (!isAdmin) return null;

  return (
    <label className={`${className} cursor-pointer focus-within:ring-2 focus-within:ring-accent`} title={labelClassName ? label : undefined}>
      <UploadSimple weight="bold" className="h-4 w-4 shrink-0" />
      <span className={labelClassName}>{label}</span>
      <input
        type="file"
        multiple
        accept={AUDIO_ACCEPT}
        className="sr-only"
        onChange={(event) => {
          addFiles(Array.from(event.target.files ?? []));
          // Reset so choosing the same file again still fires onChange.
          event.target.value = '';
        }}
      />
    </label>
  );
}

/** Where the player sits, so floating cards can stay clear of it. */
export type FloatingLayout = { dock: boolean; rail: boolean };

/** Bottom-right placement for floating cards: above the dock, and beside the side panel. */
export function floatingPosition({ dock, rail }: FloatingLayout): string {
  return [
    'inset-x-2 bottom-[calc(8.5rem+env(safe-area-inset-bottom))] md:inset-x-auto',
    dock ? 'md:bottom-28' : 'md:bottom-5',
    rail ? 'md:right-[23rem] 2xl:right-[26rem]' : 'md:right-5',
  ].join(' ');
}

const STATUS_TEXT: Record<UploadItem['status'], string> = {
  queued: 'Waiting…',
  hashing: 'Checking for duplicates…',
  uploading: 'Uploading',
  processing: 'Reading tags…',
  done: 'Added',
  duplicate: 'Already in library',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

export function UploadPanel({ layout }: { layout: FloatingLayout }) {
  const items = useUploadStore((state) => state.items);
  const { cancel, retry, clearFinished } = useUploadStore.getState();
  const [collapsed, setCollapsed] = useState(false);

  const active = items.filter((item) => ACTIVE_STATUSES.includes(item.status)).length;
  const done = items.filter((item) => item.status === 'done').length;
  const title = active > 0 ? `Uploading ${items.length - active + 1} of ${items.length}` : `${done} of ${items.length} uploaded`;

  return (
    <AnimatePresence>
      {items.length > 0 && (
        <motion.section
          key="uploads"
          variants={rise}
          initial="hidden"
          animate="visible"
          exit="exit"
          aria-label="Uploads"
          className={`fixed z-panel overflow-hidden rounded-xl border border-edge bg-surface shadow-float md:w-96 ${floatingPosition(layout)}`}
        >
          <div className="flex items-center gap-2 border-b border-edge py-2.5 pl-4 pr-2">
            {active > 0 && <Spinner className="h-3.5 w-3.5 text-accent" />}
            <h2 className="flex-1 text-sm font-medium" aria-live="polite">
              {title}
            </h2>
            {active === 0 && (
              <button type="button" onClick={clearFinished} className="btn-ghost btn-sm">
                Clear
              </button>
            )}
            <button
              type="button"
              onClick={() => setCollapsed(!collapsed)}
              aria-label={collapsed ? 'Expand uploads' : 'Collapse uploads'}
              aria-expanded={!collapsed}
              className="icon-btn"
            >
              {collapsed ? <CaretUp className="h-4 w-4" /> : <CaretDown className="h-4 w-4" />}
            </button>
          </div>

          {!collapsed && (
            <ul className="max-h-72 divide-y divide-edge/70 overflow-y-auto">
              {items.map((item) => (
                <li key={item.id} className="px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <StatusIcon status={item.status} />
                    <span className="min-w-0 flex-1 truncate text-sm" title={item.name}>
                      {item.name}
                    </span>
                    {ACTIVE_STATUSES.includes(item.status) && (
                      <button type="button" onClick={() => cancel(item.id)} aria-label={`Cancel ${item.name}`} className="icon-btn p-1.5">
                        <X className="h-4 w-4" />
                      </button>
                    )}
                    {item.status === 'failed' && item.message !== 'Not a supported audio file' && (
                      <button type="button" onClick={() => retry(item.id)} aria-label={`Retry ${item.name}`} className="icon-btn p-1.5">
                        <ArrowClockwise className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  <div className="mt-1 flex justify-between gap-2 pl-[26px] text-xs text-muted">
                    <span className={`truncate ${item.status === 'failed' ? 'text-danger' : ''}`}>
                      {item.status === 'uploading' ? `${STATUS_TEXT.uploading} ${item.progress}%` : (item.message ?? STATUS_TEXT[item.status])}
                    </span>
                    <span className="shrink-0 font-mono text-[11px] text-faint">{formatBytes(item.size)}</span>
                  </div>
                  {(item.status === 'uploading' || item.status === 'processing') && (
                    <div className="ml-[26px] mt-2 h-0.5 overflow-hidden rounded-full bg-fg/10">
                      <div
                        className="h-full origin-left rounded-full bg-accent transition-transform duration-300 ease-out"
                        style={{ transform: `scaleX(${item.progress / 100})` }}
                      />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </motion.section>
      )}
    </AnimatePresence>
  );
}

function StatusIcon({ status }: { status: UploadItem['status'] }) {
  if (status === 'done') return <CheckCircle weight="fill" className="h-4 w-4 shrink-0 text-success" />;
  if (status === 'duplicate') return <Copy weight="fill" className="h-4 w-4 shrink-0 text-warning" />;
  if (status === 'failed' || status === 'cancelled') return <XCircle weight="fill" className="h-4 w-4 shrink-0 text-faint" />;
  return <Spinner className="h-4 w-4 shrink-0 text-accent" />;
}

export function DropOverlay({ visible }: { visible: boolean }) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="drop"
          variants={fade}
          initial="hidden"
          animate="visible"
          exit="exit"
          className="pointer-events-none fixed inset-0 z-overlay flex items-center justify-center bg-base/85 p-6 backdrop-blur-sm"
        >
          <div className="flex w-full max-w-xl flex-col items-center rounded-3xl border border-dashed border-fg/30 px-8 py-14 text-center">
            <UploadSimple weight="light" className="mb-5 h-12 w-12 text-accent" />
            <p className="font-display text-4xl leading-tight sm:text-5xl">Drop to add to your library</p>
            <p className="mt-3 font-mono text-xs uppercase tracking-[0.14em] text-faint">{AUDIO_EXTENSIONS.join(' · ')}</p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
