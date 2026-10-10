import {
  Heart,
  Pause,
  Play,
  Repeat,
  RepeatOnce,
  Shuffle,
  SpeakerHigh,
  SpeakerLow,
  SpeakerX,
} from '@phosphor-icons/react';
import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useUpdateTrack } from '../../hooks/useLibrary';
import { formatDuration } from '../../lib/format';
import { nextPosition } from '../../lib/queue';
import { currentTrackOf, usePlaybackProgress, usePlayerStore } from '../../stores/playerStore';
import type { Track } from '../../types';
import { Spinner } from '../ui/Controls';

/** Paints a range input's track up to `fraction`: playback in the accent, settings in ink. */
const rangeFill = (fraction: number, tone: 'accent' | 'fg' = 'accent') => {
  const percent = `${Math.min(1, Math.max(0, fraction)) * 100}%`;
  return {
    backgroundImage: `linear-gradient(to right, rgb(var(--c-${tone})) ${percent}, rgb(var(--c-fg) / 0.14) ${percent})`,
  };
};

/** `stacked` puts the times under the bar, for wide layouts; otherwise they sit either side. */
export function SeekBar({ size = 'sm', stacked = false }: { size?: 'sm' | 'lg'; stacked?: boolean }) {
  const currentTime = usePlaybackProgress((state) => state.currentTime);
  const duration = usePlaybackProgress((state) => state.duration);
  // Until the audio loads (a queue restored at startup), show the track's own length, not 0:00.
  const trackLength = usePlayerStore((state) => currentTrackOf(state)?.duration ?? 0);
  const seek = usePlayerStore((state) => state.seek);
  const [dragValue, setDragValue] = useState<number | null>(null);
  const dragging = useRef(false);

  const value = Math.min(dragValue ?? currentTime, duration || 0);
  const total = duration || trackLength;
  const commit = () => {
    dragging.current = false;
    if (dragValue !== null) seek(dragValue);
    setDragValue(null);
  };

  const range = (
    <input
      type="range"
      min={0}
      max={duration || 0}
      step={0.1}
      value={value}
      disabled={!duration}
      aria-label="Seek"
      aria-valuetext={`${formatDuration(value)} of ${formatDuration(total)}`}
      onPointerDown={() => {
        dragging.current = true;
      }}
      onPointerUp={commit}
      onKeyUp={commit}
      onBlur={() => dragging.current && commit()}
      onChange={(event) => {
        const next = Number(event.target.value);
        // Keyboard changes seek right away; pointer drags seek once, on release.
        if (dragging.current) setDragValue(next);
        else seek(next);
      }}
      style={rangeFill(duration ? value / duration : 0)}
      className={`range range-reveal ${size === 'lg' ? 'range-lg' : ''} ${stacked ? 'block w-full' : 'min-w-0 flex-1'}`}
    />
  );

  if (stacked) {
    return (
      <div className="w-full">
        {range}
        <div className={`mt-1 flex justify-between font-mono tabular-nums text-faint ${size === 'lg' ? 'text-xs' : 'text-[11px]'}`}>
          <span>{formatDuration(value)}</span>
          <span>{formatDuration(total)}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex w-full items-center gap-2.5 font-mono text-[10px] tabular-nums text-faint">
      <span className="w-9 shrink-0 text-right">{formatDuration(value)}</span>
      {range}
      <span className="w-9 shrink-0">{formatDuration(total)}</span>
    </div>
  );
}

const TRANSPORT = {
  sm: { toggle: 'h-4 w-4', skip: 'h-[18px] w-[18px]', play: 'h-9 w-9', icon: 'h-4 w-4', layout: 'gap-1.5' },
  md: { toggle: 'h-[18px] w-[18px]', skip: 'h-6 w-6', play: 'h-12 w-12', icon: 'h-5 w-5', layout: 'justify-between' },
  lg: { toggle: 'h-5 w-5', skip: 'h-7 w-7', play: 'h-16 w-16', icon: 'h-7 w-7', layout: 'justify-between' },
};

/** Shuffle and repeat show their state with a dot as well as colour. */
const toggleClass = (active: boolean) =>
  `icon-btn press-halo ${
    active
      ? 'text-accent after:absolute after:bottom-0.5 after:left-1/2 after:h-1 after:w-1 after:-translate-x-1/2 after:rounded-full after:bg-current'
      : ''
  }`;

/** Play, pause and loading share one spot: the outgoing glyph shrinks and blurs away as the next one grows in. */
export function PlayPauseGlyph({ isPlaying, buffering, className }: { isPlaying: boolean; buffering: boolean; className: string }) {
  const shown = buffering && isPlaying ? 'loading' : isPlaying ? 'pause' : 'play';
  const swap = (name: typeof shown) =>
    `transition-[transform,opacity,filter] duration-200 ease-out [grid-area:1/1] ${name === shown ? 'scale-100 opacity-100 blur-0' : 'scale-[0.4] opacity-0 blur-[3px]'}`;
  return (
    <span className="grid place-items-center">
      <Pause weight="fill" className={`${className} ${swap('pause')}`} />
      <Play weight="fill" className={`${className} translate-x-px ${swap('play')}`} />
      {shown === 'loading' && <Spinner className={`${className} [grid-area:1/1]`} />}
    </span>
  );
}

/**
 * Apple's skip glyph, two triangles, which plays its own little animation when pressed (see
 * .skip-glyph in index.css). Remounting it on each press restarts the animation, even mid-way.
 */
function SkipGlyph({ direction, presses, className }: { direction: 'back' | 'forward'; presses: number; className: string }) {
  const triangle = 'M2 6.2v11.6a1.2 1.2 0 0 0 1.85 1L12 13a1.2 1.2 0 0 0 0-2L3.85 5.2A1.2 1.2 0 0 0 2 6.2Z';
  return (
    <svg
      key={presses}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={`skip-glyph overflow-visible ${presses > 0 ? 'skip-run' : ''} ${className}`}
    >
      {/* Mirrored inside the SVG: a CSS transform on the <svg> would be replaced by the press scale. */}
      <g transform={direction === 'back' ? 'matrix(-1 0 0 1 24 0)' : undefined}>
        <path className="skip-new" d={triangle} />
        <path className="skip-back" d={triangle} />
        <path className="skip-front" d={triangle} />
      </g>
    </svg>
  );
}

export function TransportControls({ size = 'sm' }: { size?: keyof typeof TRANSPORT }) {
  const isPlaying = usePlayerStore((state) => state.isPlaying);
  const shuffle = usePlayerStore((state) => state.shuffle);
  const repeat = usePlayerStore((state) => state.repeat);
  const hasNext = usePlayerStore((state) => nextPosition(state.position, state.order.length, state.repeat) !== null);
  const hasTrack = usePlayerStore((state) => state.position >= 0);
  const buffering = usePlaybackProgress((state) => state.buffering);
  const { togglePlay, previous, next, toggleShuffle, cycleRepeat } = usePlayerStore.getState();
  const s = TRANSPORT[size];
  const RepeatIcon = repeat === 'one' ? RepeatOnce : Repeat;
  const [presses, setPresses] = useState({ back: 0, forward: 0 });
  const press = (direction: 'back' | 'forward', action: () => void) => () => {
    setPresses((count) => ({ ...count, [direction]: count[direction] + 1 }));
    action();
  };

  return (
    <div className={`flex items-center ${s.layout}`}>
      <button type="button" onClick={toggleShuffle} aria-label="Shuffle" aria-pressed={shuffle} className={toggleClass(shuffle)}>
        <Shuffle weight="bold" className={s.toggle} />
      </button>
      <button type="button" onClick={press('back', previous)} disabled={!hasTrack} aria-label="Previous track" className="icon-btn press-halo text-fg">
        <SkipGlyph direction="back" presses={presses.back} className={s.skip} />
      </button>
      <button
        type="button"
        onClick={togglePlay}
        disabled={!hasTrack}
        aria-label={isPlaying ? 'Pause' : 'Play'}
        className={`flex ${s.play} shrink-0 items-center justify-center rounded-full bg-fg text-inverse transition-transform duration-150 ease-out hover:scale-[1.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-base active:scale-[0.92] disabled:opacity-50`}
      >
        <PlayPauseGlyph isPlaying={isPlaying} buffering={buffering} className={s.icon} />
      </button>
      <button type="button" onClick={press('forward', next)} disabled={!hasNext} aria-label="Next track" className="icon-btn press-halo text-fg">
        <SkipGlyph direction="forward" presses={presses.forward} className={s.skip} />
      </button>
      <button
        type="button"
        onClick={cycleRepeat}
        aria-label={repeat === 'off' ? 'Repeat: off' : repeat === 'all' ? 'Repeat: all' : 'Repeat: one'}
        aria-pressed={repeat !== 'off'}
        className={toggleClass(repeat !== 'off')}
      >
        <RepeatIcon weight="bold" className={s.toggle} />
      </button>
    </div>
  );
}

export function VolumeControl({ className = '', wide = false }: { className?: string; wide?: boolean }) {
  const volume = usePlayerStore((state) => state.volume);
  const isMuted = usePlayerStore((state) => state.isMuted);
  const { setVolume, toggleMute } = usePlayerStore.getState();
  const effective = isMuted ? 0 : volume;
  const Icon = effective === 0 ? SpeakerX : effective < 0.5 ? SpeakerLow : SpeakerHigh;

  return (
    <div className={`flex items-center gap-1 ${className}`}>
      <button type="button" onClick={toggleMute} aria-label={isMuted ? 'Unmute' : 'Mute'} aria-pressed={isMuted} className="icon-btn">
        <Icon weight="fill" className="h-4 w-4" />
      </button>
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={effective}
        aria-label="Volume"
        onChange={(event) => setVolume(Number(event.target.value))}
        style={rangeFill(effective, 'fg')}
        className={`range range-reveal ${wide ? 'min-w-0 flex-1' : 'w-24'}`}
      />
    </div>
  );
}

export function FavoriteButton({ className = '' }: { className?: string }) {
  const track = usePlayerStore(currentTrackOf);
  const updateTrack = useUpdateTrack();
  const [popped, setPopped] = useState(false);
  if (!track) return null;

  return (
    <button
      type="button"
      onClick={() => {
        setPopped(!track.isFavorite);
        updateTrack.mutate({ id: track.id, patch: { isFavorite: !track.isFavorite } });
      }}
      onAnimationEnd={() => setPopped(false)}
      aria-label={track.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
      aria-pressed={track.isFavorite}
      className={`icon-btn ${track.isFavorite ? 'text-accent' : ''} ${popped ? 'animate-pop' : ''} ${className}`}
    >
      <Heart weight={track.isFavorite ? 'fill' : 'regular'} className="h-4 w-4" />
    </button>
  );
}

/** "Artist · Album" under a track title, each linking to its page. */
export function TrackCredits({ track, className = '' }: { track: Track; className?: string }) {
  const albumParams = new URLSearchParams({ album: track.album ?? '' });
  const albumArtist = track.albumArtist ?? track.artist;
  if (albumArtist) albumParams.set('albumArtist', albumArtist);
  const link = 'transition-colors hover:text-fg hover:underline hover:underline-offset-4';

  return (
    <p className={`truncate text-muted ${className}`}>
      {track.artist ? (
        <Link to={`/library?artist=${encodeURIComponent(track.artist)}`} className={link}>
          {track.artist}
        </Link>
      ) : (
        'Unknown artist'
      )}
      {track.album && (
        <>
          <span className="mx-1.5 text-faint">·</span>
          <Link to={`/library?${albumParams}`} className={link}>
            {track.album}
          </Link>
        </>
      )}
    </p>
  );
}
