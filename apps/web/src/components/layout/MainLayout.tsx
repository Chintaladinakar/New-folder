import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useLayoutEffect, useRef } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useFileDrop } from '../../hooks/useFileDrop';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { usePlayerShortcuts } from '../../hooks/usePlayerShortcuts';
import { fadeUp } from '../../lib/motion';
import { isTransitioning, routeRendered } from '../../lib/viewTransition';
import { useIsAdmin } from '../../stores/authStore';
import { currentTrackOf, usePlayerStore } from '../../stores/playerStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { toast } from '../../stores/toastStore';
import { useUploadStore } from '../../stores/uploadStore';
import { QueuePanel } from '../player/QueuePanel';
import { Toaster } from '../ui/Toaster';
import { UpdatePrompt } from '../ui/UpdatePrompt';
import { DropOverlay, UploadPanel } from '../upload/Upload';
import { MobileNav } from './Navigation';
import { NowPlayingRail } from './NowPlayingRail';
import { PlayerDock } from './PlayerDock';
import { TopBar } from './TopBar';

const refuseDrop = () => toast('Only the admin can add music to the library');

export function MainLayout() {
  usePlayerShortcuts();
  const isAdmin = useIsAdmin();
  const addFiles = useUploadStore((state) => state.addFiles);
  // Listeners keep the drop handler too, so a dropped file doesn't make the browser open it.
  const isDragging = useFileDrop(isAdmin ? addFiles : refuseDrop);
  const hasTrack = usePlayerStore((state) => currentTrackOf(state) !== null);
  const panelEnabled = useSettingsStore((state) => state.nowPlayingPanel);
  const wide = useMediaQuery('(min-width: 1280px)');
  const mainRef = useRef<HTMLElement>(null);
  const mounted = useRef(false);
  const { pathname } = useLocation();
  const onNowPlaying = pathname === '/now-playing';

  // Wide screens keep the player in a side panel; elsewhere it floats at the bottom.
  // The full player page replaces both.
  const showRail = hasTrack && wide && panelEnabled && !onNowPlaying;
  const showDock = hasTrack && !showRail && !onNowPlaying;
  const layout = { dock: showDock, rail: showRail };

  // A view transition into or out of the full player is waiting for this route to be on screen.
  useLayoutEffect(routeRendered, [pathname]);
  useEffect(() => {
    mounted.current = true;
  }, []);

  // <main> is the scroll container, so reset it on navigation like a normal page.
  useEffect(() => {
    mainRef.current?.scrollTo(0, 0);
  }, [pathname]);

  // The side panel has its own Up next tab, so the queue sheet isn't needed while it shows.
  useEffect(() => {
    if (showRail) usePlayerStore.getState().setQueueOpen(false);
  }, [showRail]);

  // Room at the bottom for whatever floats there: the tab bar and player card on phones, the dock above.
  const padding = onNowPlaying
    ? ''
    : `${hasTrack ? 'pb-[calc(7.5rem+env(safe-area-inset-bottom))]' : 'pb-[calc(3.5rem+env(safe-area-inset-bottom))]'} ${showDock ? 'md:pb-24' : 'md:pb-0'}`;

  return (
    <div data-now-playing={onNowPlaying || undefined} className="flex h-[100dvh] flex-col overflow-hidden bg-base text-fg">
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      {/* Phones get the whole screen for the full player. */}
      <TopBar className={onNowPlaying ? 'hidden md:flex' : ''} />
      <div className="flex min-h-0 flex-1">
        <main id="main" ref={mainRef} tabIndex={-1} className={`min-w-0 flex-1 overflow-y-auto outline-none ${padding}`}>
          {/* Navigation happens often, so the page change is a short, quiet fade. The full player is
              the exception: it swaps in at once, so the view transition can move the cover into it. */}
          {onNowPlaying ? (
            <div className="h-full">
              <Outlet />
            </div>
          ) : (
            // Leaving the full player remounts this: fade the page in, unless a view transition is
            // already cross-fading it (or the app has only just opened).
            <AnimatePresence mode="wait" initial={mounted.current && !isTransitioning()}>
              <motion.div key={pathname} variants={fadeUp} initial="hidden" animate="visible" exit="exit">
                <Outlet />
              </motion.div>
            </AnimatePresence>
          )}
        </main>
        <AnimatePresence initial={false}>{showRail && <NowPlayingRail key="rail" />}</AnimatePresence>
      </div>
      <PlayerDock visible={showDock} />
      {!onNowPlaying && <MobileNav />}
      <QueuePanel />
      <UploadPanel layout={layout} />
      <Toaster />
      <UpdatePrompt layout={layout} />
      <DropOverlay visible={isDragging && isAdmin} />
    </div>
  );
}
