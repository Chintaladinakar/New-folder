import { ArrowsClockwise, PencilSimple } from '@phosphor-icons/react';
import { animate, motion, motionValue } from 'motion/react';
import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useLyrics, useRefreshLyrics, useSetLyrics } from '../../hooks/useLibrary';
import { getAudioElement } from '../../lib/browser';
import { activeLineIndex, buildLyricItems, parseLrc, type LyricLine } from '../../lib/lrc';
import { prefersReducedMotion, settle } from '../../lib/motion';
import { useIsAdmin } from '../../stores/authStore';
import { usePlaybackProgress, usePlayerStore } from '../../stores/playerStore';
import { useSettingsStore } from '../../stores/settingsStore';
import type { Track } from '../../types';
import { Spinner } from '../ui/Controls';
import { Dialog } from '../ui/Dialog';

const SOURCE_LABEL = { embedded: 'From the file', lrclib: 'From LRCLIB', manual: 'Added by you', none: '' };

type LyricsSize = 'compact' | 'large';

/** Lyrics set in the display serif: `compact` for the side panel, `large` for the full player. */
export function LyricsPanel({ track, size = 'compact', className = '' }: { track: Track; size?: LyricsSize; className?: string }) {
  const autoFetch = useSettingsStore((state) => state.lyricsAutoFetch);
  const query = useLyrics(track.id, autoFetch || track.hasLyrics);
  const refresh = useRefreshLyrics();
  const isAdmin = useIsAdmin();
  const [editing, setEditing] = useState(false);
  const data = query.data;
  const synced = useMemo(() => (data?.syncedLyrics ? parseLrc(data.syncedLyrics) : []), [data?.syncedLyrics]);

  return (
    <section aria-label="Lyrics" className={`flex min-h-0 flex-col ${className}`}>
      <div className="mb-1 flex shrink-0 items-center justify-between gap-2">
        <p className="truncate text-xs text-faint">{data?.source && data.source !== 'none' ? SOURCE_LABEL[data.source] : ''}</p>
        <div className="-mr-2 flex items-center">
          <button
            type="button"
            onClick={() => refresh.mutate(track.id)}
            disabled={refresh.isPending || data?.source === 'manual'}
            aria-label="Search for lyrics again"
            title={data?.source === 'manual' ? 'Your own lyrics are kept; edit them instead' : 'Search again'}
            className="icon-btn"
          >
            {refresh.isPending ? <Spinner /> : <ArrowsClockwise className="h-4 w-4" />}
          </button>
          {isAdmin && (
            <button type="button" onClick={() => setEditing(true)} aria-label="Edit lyrics" title="Edit lyrics" className="icon-btn">
              <PencilSimple className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      <div className="relative min-h-0 flex-1">
        {query.isLoading ? (
          <div className="flex items-center gap-2 py-4 text-sm text-muted">
            <Spinner /> Looking for lyrics…
          </div>
        ) : query.error ? (
          <p className="py-4 text-sm text-danger">{query.error.message}</p>
        ) : synced.length > 0 ? (
          <SyncedLyrics key={track.id} lines={synced} size={size} />
        ) : data?.lyrics ? (
          <div className="h-full overflow-y-auto pb-6">
            <p className={`whitespace-pre-wrap font-display leading-snug text-fg/90 ${size === 'large' ? 'text-[1.75rem] md:text-[2rem]' : 'text-xl'}`}>
              {data.lyrics}
            </p>
          </div>
        ) : (
          <div className="py-4">
            <p className={`font-display text-muted ${size === 'large' ? 'text-3xl' : 'text-2xl'}`}>No lyrics for this track.</p>
            {!autoFetch && !query.data && (
              <button type="button" onClick={() => refresh.mutate(track.id)} className="mt-3 text-sm font-medium text-accent">
                Search LRCLIB
              </button>
            )}
          </div>
        )}
      </div>

      {editing && (
        <EditLyricsDialog trackId={track.id} initial={data?.syncedLyrics ?? data?.lyrics ?? ''} onClose={() => setEditing(false)} />
      )}
    </section>
  );
}

/** Where the current line rests, as a fraction of the panel's height from the top. */
const ANCHOR = 0.4;
/** Reading ahead pauses the follow-along until this long after the last scroll. */
const BROWSE_MS = 3500;

const STATE_CLASS = {
  active: 'lyric-active scale-100 opacity-100',
  past: 'scale-[0.97] opacity-30',
  future: 'scale-[0.97] opacity-45',
};

/**
 * Apple Music-style synced lyrics: the current line fills in word by word, lines further from it
 * blur, and when the song moves on the lines ripple up one after another instead of scrolling as a block.
 */
function SyncedLyrics({ lines, size }: { lines: LyricLine[]; size: LyricsSize }) {
  const items = useMemo(() => buildLyricItems(lines), [lines]);
  const currentTime = usePlaybackProgress((state) => state.currentTime);
  const isPlaying = usePlayerStore((state) => state.isPlaying);
  const seek = usePlayerStore((state) => state.seek);
  const containerRef = useRef<HTMLDivElement>(null);
  const active = activeLineIndex(items, currentTime + 0.2);
  // One offset per line, so each can trail the one above it.
  const offsets = useMemo(() => items.map(() => motionValue(0)), [items]);
  const followed = useRef(false);
  const [browsing, setBrowsing] = useState(false);
  const browseTimer = useRef(0);

  const browse = () => {
    setBrowsing(true);
    window.clearTimeout(browseTimer.current);
    browseTimer.current = window.setTimeout(() => setBrowsing(false), BROWSE_MS);
  };
  const jumpTo = (time: number) => {
    window.clearTimeout(browseTimer.current);
    setBrowsing(false);
    seek(time);
  };
  useEffect(() => () => window.clearTimeout(browseTimer.current), []);

  // The scroll position moves in one step; each line is then offset back to where it was on screen
  // and springs home after a delay that grows with its distance, so the lines ripple into place.
  // Using the real scroll position keeps reading ahead and keyboard focus working natively.
  useLayoutEffect(() => {
    const container = containerRef.current;
    const line = container?.children[active] as HTMLElement | undefined;
    if (!container || !line || browsing) return;
    const max = container.scrollHeight - container.clientHeight;
    const target = Math.min(max, Math.max(0, line.offsetTop + line.offsetHeight / 2 - container.clientHeight * ANCHOR));
    const delta = target - container.scrollTop;
    const first = !followed.current;
    followed.current = true;
    if (Math.abs(delta) < 1) return;

    if (first || prefersReducedMotion() || Math.abs(delta) > container.clientHeight * 0.6) {
      // Opening mid-song, a seek, or coming back from reading ahead: too far to ripple.
      offsets.forEach((offset) => offset.jump(0));
      container.scrollTo({ top: target, behavior: first || prefersReducedMotion() ? 'instant' : 'smooth' });
      return;
    }
    container.scrollTop = target;
    offsets.forEach((offset, index) => {
      // The lines ahead of the motion lead, the rest follow.
      const order = delta > 0 ? index - active : active - index;
      offset.jump(offset.get() + delta);
      animate(offset, 0, { ...settle, delay: Math.min(Math.max(order, 0), 10) * 0.05 });
    });
  }, [active, browsing, offsets]);

  // timeupdate fires about four times a second, which would make the fill step; the current line
  // reads the audio clock on every frame instead, into --t, and CSS works out each word's progress.
  useEffect(() => {
    const line = containerRef.current?.children[active] as HTMLElement | undefined;
    if (!line) return;
    const audio = getAudioElement();
    const write = () => line.style.setProperty('--t', audio.currentTime.toFixed(3));
    write();
    if (!isPlaying) return usePlaybackProgress.subscribe(write);
    let frame = requestAnimationFrame(function tick() {
      write();
      frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [active, isPlaying, items]);

  const blurStep = size === 'large' ? 0.8 : 0.5;

  return (
    <div
      ref={containerRef}
      onWheel={browse}
      onTouchMove={browse}
      // Tabbing through the lines scrolls them into view; don't drag the view back while that happens.
      onFocusCapture={(event) => event.target.matches(':focus-visible') && browse()}
      // The spacers let the first and last lines reach the anchor. They're pseudo-elements sized to the
      // box's height (padding percentages follow its width, and would overflow a short panel), and they
      // stay out of `children`, which the scroll code indexes by line. The negative margin gives the
      // hover highlight room while the words stay aligned with the header.
      className="relative -mx-3 h-full overflow-y-auto [mask-image:linear-gradient(to_bottom,transparent,black_14%,black_80%,transparent)] before:block before:h-[40%] after:block after:h-[60%]"
    >
      {items.map((item, index) => {
        const state = index === active ? 'active' : index < active ? 'past' : 'future';
        // Lines further from the current one sit further out of focus, until the reader takes over.
        const blur = browsing || state === 'active' ? 0 : Math.min(Math.abs(index - Math.max(active, 0)), 4) * blurStep;
        const className = `block w-full origin-left rounded-xl px-3 text-left font-display leading-[1.12] text-fg transition-[opacity,transform,filter] duration-500 ease-out [filter:blur(var(--blur))] row-hover hover:opacity-100 hover:[filter:none] ${
          size === 'large' ? 'text-[2rem] md:text-[2.5rem]' : 'text-2xl'
        } ${STATE_CLASS[state]}`;
        const style = { '--blur': `${blur}px` } as CSSProperties;

        return (
          <motion.div key={`${item.time}-${index}`} style={{ y: offsets[index] }}>
            {item.kind === 'break' ? (
              <button
                type="button"
                onClick={() => jumpTo(item.time)}
                aria-label="Instrumental break"
                style={{ ...style, '--gs': item.time.toFixed(3), '--gd': (item.end - item.time).toFixed(3) } as CSSProperties}
                className={`${className} py-3 ${state === 'active' ? 'lyric-break-active' : ''}`}
              >
                <span className={`lyric-dots inline-flex gap-[0.22em] ${isPlaying ? '' : '[animation-play-state:paused]'}`}>
                  {[0, 1, 2].map((dot) => (
                    <span key={dot} style={{ '--i': dot } as CSSProperties} className="lyric-dot h-[0.24em] w-[0.24em] rounded-full bg-fg" />
                  ))}
                </span>
              </button>
            ) : (
              <button type="button" onClick={() => jumpTo(item.time)} style={style} className={`${className} py-2`}>
                {item.words.map((word, at) => (
                  <Fragment key={at}>
                    {at > 0 && ' '}
                    <span
                      className="lyric-word"
                      style={{ '--ws': word.start.toFixed(3), '--wd': (word.end - word.start).toFixed(3) } as CSSProperties}
                    >
                      {word.text}
                    </span>
                  </Fragment>
                ))}
              </button>
            )}
          </motion.div>
        );
      })}
    </div>
  );
}

function EditLyricsDialog({ trackId, initial, onClose }: { trackId: string; initial: string; onClose: () => void }) {
  const setLyrics = useSetLyrics();
  const [text, setText] = useState(initial);

  return (
    <Dialog
      open
      onClose={onClose}
      title="Edit lyrics"
      description="Plain text, or LRC with [mm:ss.xx] timestamps for lyrics that follow the song."
      size="lg"
    >
      <textarea
        className="input min-h-[40vh] font-mono text-xs leading-relaxed"
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder={'[00:12.00]First line\n[00:17.50]Second line'}
        spellCheck={false}
        aria-label="Lyrics"
      />
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="btn-secondary">
          Cancel
        </button>
        <button
          type="button"
          disabled={setLyrics.isPending}
          onClick={() => setLyrics.mutate({ trackId, lyrics: text.trim() || null }, { onSuccess: onClose })}
          className="btn-primary"
        >
          {setLyrics.isPending ? 'Saving…' : 'Save'}
        </button>
      </div>
    </Dialog>
  );
}
