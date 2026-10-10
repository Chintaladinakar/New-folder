import { X } from '@phosphor-icons/react';
import { formatDuration, formatLongDuration, pluralize } from '../../lib/format';
import { currentTrackOf, usePlayerStore } from '../../stores/playerStore';
import { Artwork } from '../ui/Artwork';
import { PlayingIndicator } from './PlayingIndicator';

/** The queue from the current track on. Used by the queue sheet and the side panel's tab. */
export function UpNextList({ showCurrent = false }: { showCurrent?: boolean }) {
  const queue = usePlayerStore((state) => state.queue);
  const order = usePlayerStore((state) => state.order);
  const position = usePlayerStore((state) => state.position);
  const isPlaying = usePlayerStore((state) => state.isPlaying);
  const current = usePlayerStore(currentTrackOf);
  const { jumpTo, removeFromQueue, clearUpcoming } = usePlayerStore.getState();

  const upcoming = order.slice(position + 1).map((queueIndex, offset) => ({
    track: queue[queueIndex],
    orderPosition: position + 1 + offset,
  }));
  const seconds = upcoming.reduce((sum, { track }) => sum + (track.duration ?? 0), 0);

  return (
    <div>
      {showCurrent && current && (
        <>
          <h3 className="px-2 pb-2 text-xs font-medium text-faint">Now playing</h3>
          <div className="flex items-center gap-3 rounded-lg bg-accent/[0.08] px-2 py-2">
            <Artwork src={current.artworkUrl} title={current.title} className="h-10 w-10 shrink-0 rounded" textClassName="text-lg" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-accent">{current.title}</div>
              <div className="truncate text-xs text-muted">{current.artist ?? 'Unknown artist'}</div>
            </div>
            <PlayingIndicator paused={!isPlaying} className="mr-2" />
          </div>
        </>
      )}

      {/* In the side panel the tab already says "Up next", so the row only carries the facts. */}
      {(showCurrent || upcoming.length > 0) && (
        <div className={`flex h-8 items-center justify-between gap-3 px-2 ${showCurrent ? 'mt-5' : ''}`}>
          <h3 className="truncate text-xs font-medium text-faint">
            {showCurrent && <span className="mr-2">Up next</span>}
            <span className="font-mono">
              {pluralize(upcoming.length, 'track')}
              {seconds > 0 && ` · ${formatLongDuration(seconds)}`}
            </span>
          </h3>
          {upcoming.length > 0 && (
            <button type="button" onClick={clearUpcoming} className="shrink-0 text-xs font-medium text-muted transition-colors hover:text-fg">
              Clear
            </button>
          )}
        </div>
      )}

      {upcoming.length === 0 ? (
        <p className="px-2 py-6 text-sm text-faint">Nothing queued. Use “Add to queue” on any track.</p>
      ) : (
        <ol className="stagger">
          {upcoming.map(({ track, orderPosition }, index) => (
            <li
              key={`${track.id}-${orderPosition}`}
              style={{ animationDelay: `${Math.min(index, 12) * 25}ms` }}
              className="row-hover group flex items-center gap-1 rounded-lg transition-colors"
            >
              <button type="button" onClick={() => jumpTo(orderPosition)} className="flex min-w-0 flex-1 items-center gap-3 py-2 pl-2 text-left">
                <span className="w-5 shrink-0 text-right font-mono text-[11px] tabular-nums text-faint">{index + 1}</span>
                <Artwork src={track.artworkUrl} title={track.title} className="h-9 w-9 shrink-0 rounded" textClassName="text-base" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{track.title}</span>
                  <span className="block truncate text-xs text-muted">{track.artist ?? 'Unknown artist'}</span>
                </span>
                <span className="font-mono text-[11px] tabular-nums text-faint">{formatDuration(track.duration)}</span>
              </button>
              <button
                type="button"
                onClick={() => removeFromQueue(orderPosition)}
                aria-label={`Remove ${track.title} from queue`}
                className="icon-btn mr-1 p-1.5 sm:opacity-0 sm:focus:opacity-100 sm:group-hover:opacity-100"
              >
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
