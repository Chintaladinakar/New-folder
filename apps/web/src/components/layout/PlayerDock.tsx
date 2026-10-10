import { ArrowsOutSimple, Queue, SidebarSimple } from '@phosphor-icons/react';
import { AnimatePresence, motion } from 'motion/react';
import { Link } from 'react-router-dom';
import { rise } from '../../lib/motion';
import { currentTrackOf, usePlaybackProgress, usePlayerStore } from '../../stores/playerStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { NowPlayingLink } from '../player/NowPlayingLink';
import { FavoriteButton, PlayPauseGlyph, SeekBar, TransportControls, VolumeControl } from '../player/PlayerControls';
import { Artwork } from '../ui/Artwork';

function TrackSubtitle() {
  const track = usePlayerStore(currentTrackOf);
  const error = usePlayerStore((state) => state.error);
  if (error) return <span className="truncate text-xs text-danger">{error}</span>;
  if (!track?.artist) return <span className="truncate text-xs text-muted">Unknown artist</span>;
  return (
    <Link
      to={`/library?artist=${encodeURIComponent(track.artist)}`}
      className="truncate text-xs text-muted transition-colors hover:text-fg hover:underline hover:underline-offset-4"
    >
      {track.artist}
    </Link>
  );
}

function MobileProgress() {
  const currentTime = usePlaybackProgress((state) => state.currentTime);
  const duration = usePlaybackProgress((state) => state.duration);
  return (
    <div className="absolute inset-x-3 bottom-0 h-0.5 overflow-hidden rounded-full bg-fg/10" aria-hidden="true">
      <div className="h-full origin-left bg-accent" style={{ transform: `scaleX(${duration ? currentTime / duration : 0})` }} />
    </div>
  );
}

/** The player whenever it isn't in the side panel: a floating dock on larger screens, a compact card on phones. */
export function PlayerDock({ visible }: { visible: boolean }) {
  const track = usePlayerStore(currentTrackOf);
  const isPlaying = usePlayerStore((state) => state.isPlaying);
  const queueOpen = usePlayerStore((state) => state.queueOpen);
  const error = usePlayerStore((state) => state.error);
  const buffering = usePlaybackProgress((state) => state.buffering);
  const { togglePlay, setQueueOpen } = usePlayerStore.getState();

  return (
    <AnimatePresence>
      {visible && track && (
        <motion.section
          key="dock"
          aria-label="Player"
          variants={rise}
          initial="hidden"
          animate="visible"
          exit="exit"
          className="pointer-events-none fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-player px-2 pb-2 md:bottom-0 md:px-4 md:pb-4"
        >
          {/* Phones: a compact card above the tab bar; tap it for the full player. */}
          <div className="pointer-events-auto relative overflow-hidden rounded-xl border border-edge bg-surface-2/90 shadow-float backdrop-blur-xl md:hidden">
            <div className="flex h-14 items-center gap-1 pl-2 pr-1">
              <NowPlayingLink className="flex min-w-0 flex-1 items-center gap-3">
                <Artwork src={track.artworkUrl} title={track.title} className="player-art-source h-10 w-10 shrink-0 rounded" textClassName="text-xl" />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{track.title}</span>
                  {/* A track that cannot be played says so here too, not only on the wider layouts. */}
                  {error ? (
                    <span className="block truncate text-xs text-danger">{error}</span>
                  ) : (
                    <span className="block truncate text-xs text-muted">{track.artist ?? 'Unknown artist'}</span>
                  )}
                </span>
              </NowPlayingLink>
              <FavoriteButton className="p-2.5" />
              <button
                type="button"
                onClick={togglePlay}
                aria-label={isPlaying ? 'Pause' : 'Play'}
                className="pressable press-halo flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-fg"
              >
                <PlayPauseGlyph isPlaying={isPlaying} buffering={buffering} className="h-6 w-6" />
              </button>
            </div>
            <MobileProgress />
          </div>

          {/* Tablets and desktops: a floating dock. */}
          <div className="pointer-events-auto mx-auto hidden h-[76px] max-w-[1180px] grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-4 rounded-2xl border border-edge bg-surface/85 pl-2.5 pr-3 shadow-float backdrop-blur-xl md:grid">
            <div className="flex min-w-0 items-center gap-3">
              <NowPlayingLink
                tabIndex={-1}
                aria-hidden="true"
                className="shrink-0 transition-transform duration-200 ease-out hover:scale-[1.04]"
              >
                <Artwork src={track.artworkUrl} title={track.title} className="player-art-source h-14 w-14 rounded-lg" textClassName="text-2xl" />
              </NowPlayingLink>
              <div className="flex min-w-0 flex-col">
                <NowPlayingLink className="truncate text-sm font-medium hover:underline hover:underline-offset-4">
                  {track.title}
                </NowPlayingLink>
                <TrackSubtitle />
              </div>
              <FavoriteButton />
            </div>

            <div className="flex w-[17rem] flex-col items-center gap-0.5 lg:w-[26rem]">
              <TransportControls />
              <SeekBar />
            </div>

            <div className="flex items-center justify-end gap-0.5">
              <button
                type="button"
                onClick={() => setQueueOpen(!queueOpen)}
                aria-label="Queue"
                aria-pressed={queueOpen}
                className={`icon-btn ${queueOpen ? 'text-accent' : ''}`}
              >
                <Queue weight={queueOpen ? 'fill' : 'regular'} className="h-4 w-4" />
              </button>
              <VolumeControl className="hidden lg:flex" />
              <button
                type="button"
                onClick={() => useSettingsStore.getState().update({ nowPlayingPanel: true })}
                aria-label="Show the side panel"
                title="Show the side panel"
                className="icon-btn hidden xl:inline-flex"
              >
                <SidebarSimple className="h-4 w-4 -scale-x-100" />
              </button>
              <NowPlayingLink aria-label="Open the full player" title="Full player" className="icon-btn">
                <ArrowsOutSimple className="h-4 w-4" />
              </NowPlayingLink>
            </div>
          </div>
        </motion.section>
      )}
    </AnimatePresence>
  );
}
