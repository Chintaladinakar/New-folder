import { ArrowsOutSimple, SidebarSimple } from '@phosphor-icons/react';
import { motion } from 'motion/react';
import { panelIn } from '../../lib/motion';
import { currentTrackOf, usePlayerStore } from '../../stores/playerStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { NowPlayingLink } from '../player/NowPlayingLink';
import { FavoriteButton, SeekBar, TrackCredits, TransportControls, VolumeControl } from '../player/PlayerControls';
import { PlayerTabs } from '../player/PlayerTabs';
import { Artwork } from '../ui/Artwork';

/** Wide screens: the player lives in a column beside the page, with the queue and lyrics below it. */
export function NowPlayingRail() {
  const track = usePlayerStore(currentTrackOf);
  const error = usePlayerStore((state) => state.error);
  const lyricsAutoShow = useSettingsStore((state) => state.lyricsAutoShow);

  return (
    <motion.aside
      variants={panelIn}
      initial="hidden"
      animate="visible"
      exit="exit"
      aria-label="Now playing"
      className="flex w-[22rem] shrink-0 flex-col border-l border-edge bg-surface/40 2xl:w-[25rem]"
    >
      {track && (
        <>
          <div className="flex shrink-0 items-center justify-between py-2.5 pl-6 pr-3">
            <h2 className="text-xs font-medium text-muted">Now playing</h2>
            <div className="flex items-center">
              <NowPlayingLink aria-label="Open the full player" title="Full player" className="icon-btn">
                <ArrowsOutSimple className="h-4 w-4" />
              </NowPlayingLink>
              <button
                type="button"
                onClick={() => useSettingsStore.getState().update({ nowPlayingPanel: false })}
                aria-label="Hide the side panel"
                title="Hide the side panel"
                className="icon-btn"
              >
                <SidebarSimple className="h-4 w-4 -scale-x-100" />
              </button>
            </div>
          </div>

          <div className="shrink-0 px-6 pb-5">
            <NowPlayingLink tabIndex={-1} aria-hidden="true" className="mx-auto block w-full max-w-[min(100%,34vh)]">
              <Artwork src={track.artworkUrl} title={track.title} className="player-art-source aspect-square w-full rounded-lg shadow-cover" textClassName="text-8xl" />
            </NowPlayingLink>
            <div className="mt-5 flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <h3 className="line-clamp-2 font-display text-[1.75rem] leading-[1.05] [overflow-wrap:anywhere]">{track.title}</h3>
                <TrackCredits track={track} className="mt-1.5 text-sm" />
              </div>
              <FavoriteButton className="-mr-2 [&>svg]:h-5 [&>svg]:w-5" />
            </div>
            {error && (
              <p role="alert" className="mt-2 text-xs text-danger">
                {error}
              </p>
            )}
            <div className="mt-4">
              <SeekBar stacked />
            </div>
            <div className="mt-1">
              <TransportControls size="md" />
            </div>
            <VolumeControl wide className="-ml-2 mt-3" />
          </div>

          <PlayerTabs initialTab={lyricsAutoShow ? 'lyrics' : 'queue'} className="min-h-0 flex-1 border-t border-edge" />
        </>
      )}
    </motion.aside>
  );
}
