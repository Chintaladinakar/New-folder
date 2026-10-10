import { CaretDown, Queue, Subtitles, VinylRecord } from '@phosphor-icons/react';
import { motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArtworkBackdrop } from '../components/player/ArtworkBackdrop';
import { LyricsPanel } from '../components/player/Lyrics';
import { FavoriteButton, SeekBar, TrackCredits, TransportControls, VolumeControl } from '../components/player/PlayerControls';
import { PlayerTabs } from '../components/player/PlayerTabs';
import { Artwork } from '../components/ui/Artwork';
import { EmptyState } from '../components/ui/EmptyState';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { usePageTitle } from '../hooks/usePageTitle';
import { dominantColor } from '../lib/color';
import { spring } from '../lib/motion';
import { navigateWithTransition } from '../lib/viewTransition';
import { currentTrackOf, usePlayerStore } from '../stores/playerStore';
import { useSettingsStore } from '../stores/settingsStore';
import type { Track } from '../types';

/** Tints the page with the cover's colour; falls back to the accent when the image can't be read. */
function useTint(artworkUrl: string | null) {
  const enabled = useSettingsStore((state) => state.dynamicBackground);
  const [tint, setTint] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || !artworkUrl) {
      setTint(null);
      return;
    }
    let cancelled = false;
    dominantColor(artworkUrl).then((color) => !cancelled && setTint(color));
    return () => {
      cancelled = true;
    };
  }, [artworkUrl, enabled]);

  return enabled ? (tint ?? 'var(--c-accent)') : null;
}

/**
 * The cover itself, blurred and moving, behind the whole player. Under it, a soft wash of the
 * cover's colour from the top corner: what shows for tracks without artwork, or while it loads.
 */
function Backdrop({ track, isPlaying }: { track: Track; isPlaying: boolean }) {
  const color = useTint(track.artworkUrl);
  if (!color) return null;
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <div
        key={color}
        className="absolute inset-0 animate-fade-in"
        style={{
          background: `radial-gradient(110% 70% at 12% 0%, rgb(${color} / 0.3), transparent 65%), radial-gradient(80% 60% at 100% 100%, rgb(${color} / 0.12), transparent 70%)`,
        }}
      />
      <ArtworkBackdrop src={track.artworkUrl} playing={isPlaying} />
    </div>
  );
}

/**
 * Pausing shrinks the cover slightly, so the state is visible without reading the button.
 * It shares a view-transition-name with the mini player's artwork, so it grows out of it.
 */
function Cover({ track, isPlaying, className = '' }: { track: Track; isPlaying: boolean; className?: string }) {
  return (
    <motion.div animate={{ transform: isPlaying ? 'scale(1)' : 'scale(0.94)' }} transition={spring} className={`player-art ${className}`}>
      <Artwork src={track.artworkUrl} title={track.title} className="aspect-square w-full rounded-lg shadow-cover" textClassName="text-[9rem]" />
    </motion.div>
  );
}

function Heading({ track }: { track: Track }) {
  return (
    <div className="flex items-start gap-3">
      <div className="min-w-0 flex-1">
        {/* Scales with the window's height as well as its width, so short windows keep room for the cover. */}
        <h1 className="line-clamp-3 font-display text-[length:clamp(2.25rem,min(4.2vw,6.5vh),3.75rem)] leading-[0.98] tracking-[-0.01em] [overflow-wrap:anywhere]">
          {track.title}
        </h1>
        <TrackCredits track={track} className="mt-3 text-base" />
      </div>
      <FavoriteButton className="-mr-2 mt-1 [&>svg]:h-6 [&>svg]:w-6" />
    </div>
  );
}

export function NowPlaying() {
  const track = usePlayerStore(currentTrackOf);
  usePageTitle(track ? `${track.title}${track.artist ? ` — ${track.artist}` : ''}` : 'Now playing');
  const isPlaying = usePlayerStore((state) => state.isPlaying);
  const error = usePlayerStore((state) => state.error);
  const upNext = usePlayerStore((state) => Math.max(0, state.order.length - state.position - 1));
  const setQueueOpen = usePlayerStore((state) => state.setQueueOpen);
  const lyricsAutoShow = useSettingsStore((state) => state.lyricsAutoShow);
  const [showLyrics, setShowLyrics] = useState(lyricsAutoShow);
  const wide = useMediaQuery('(min-width: 1024px)');
  const navigate = useNavigate();

  if (!track) {
    return (
      <div className="page">
        <EmptyState
          icon={<VinylRecord weight="light" />}
          title="Nothing is playing"
          description="Pick something from your library and it will show up here."
          action={
            <Link to="/library" className="btn-primary">
              Browse songs
            </Link>
          }
        />
      </div>
    );
  }

  // Opened directly (no history to go back to): close to Home instead of leaving the app.
  // The cover shrinks back into the mini player on the way out.
  const close = () => navigateWithTransition(() => ((window.history.state as { idx?: number } | null)?.idx ? navigate(-1) : navigate('/')));
  const alert = error && (
    <p role="alert" className="mt-4 text-sm text-danger">
      {error}
    </p>
  );

  if (wide) {
    return (
      <div className="relative isolate h-full">
        <Backdrop track={track} isPlaying={isPlaying} />
        <div className="mx-auto grid h-full max-w-[1400px] grid-cols-2 gap-14 px-12 py-8 xl:gap-20">
          {/* Only the cover flexes: it takes the height the text and controls leave (cqw/cqh of its
              area), so the player always fits the window instead of scrolling. */}
          <div className="mx-auto flex w-full max-w-[36rem] flex-col">
            <div className="flex min-h-[8rem] flex-1 items-center justify-center [container-type:size]">
              <Cover track={track} isPlaying={isPlaying} className="w-[min(100cqw,100cqh)]" />
            </div>
            <div className="mt-6">
              <Heading track={track} />
            </div>
            {alert}
            <div className="mt-5">
              <SeekBar size="lg" stacked />
            </div>
            <div className="mx-auto mt-1 w-full max-w-sm">
              <TransportControls size="lg" />
            </div>
            <VolumeControl wide className="mx-auto mt-3 w-full max-w-[16rem]" />
          </div>
          <PlayerTabs
            initialTab={lyricsAutoShow ? 'lyrics' : 'queue'}
            lyricsSize="large"
            className="min-h-0 overflow-hidden rounded-2xl border border-edge bg-surface/50 backdrop-blur-sm"
          />
        </div>
      </div>
    );
  }

  // A flex column of the screen's exact height: the cover (or lyrics) area takes whatever the
  // controls leave, so everything fits and the controls sit at the bottom, within thumb reach.
  return (
    <div className="relative isolate flex h-full flex-col">
      <Backdrop track={track} isPlaying={isPlaying} />
      <div className="mx-auto flex min-h-0 w-full max-w-lg flex-1 flex-col px-6 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] pt-[calc(env(safe-area-inset-top)+0.5rem)] md:pt-6">
        <div className="flex items-center justify-between">
          <button type="button" onClick={close} className="icon-btn -ml-2" aria-label="Close player">
            <CaretDown weight="bold" className="h-6 w-6" />
          </button>
          <p className="truncate px-3 text-xs font-medium text-muted">{track.album ?? 'Now playing'}</p>
          <span className="w-10" aria-hidden="true" />
        </div>

        <div className="my-6 flex min-h-[10rem] flex-1 flex-col items-center justify-center [container-type:size]">
          {showLyrics ? (
            <LyricsPanel track={track} size="large" className="w-full flex-1" />
          ) : (
            <Cover track={track} isPlaying={isPlaying} className="w-[min(100cqw,100cqh)]" />
          )}
        </div>

        <Heading track={track} />
        {alert}
        <div className="mt-6">
          <SeekBar size="lg" stacked />
        </div>
        <div className="mt-2">
          <TransportControls size="lg" />
        </div>
        <div className="mt-6 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setShowLyrics(!showLyrics)}
            aria-pressed={showLyrics}
            className={`btn-ghost btn-sm -ml-3 ${showLyrics ? 'text-fg' : ''}`}
          >
            <Subtitles weight={showLyrics ? 'fill' : 'regular'} className="h-4 w-4" />
            Lyrics
          </button>
          {/* Phones have volume buttons; a slider is for larger screens. */}
          <VolumeControl className="hidden md:flex" />
          <button type="button" onClick={() => setQueueOpen(true)} className="btn-ghost btn-sm -mr-3">
            <Queue className="h-4 w-4" />
            Up next
            {upNext > 0 && <span className="font-mono text-[11px] text-faint">{upNext}</span>}
          </button>
        </div>
      </div>
    </div>
  );
}
