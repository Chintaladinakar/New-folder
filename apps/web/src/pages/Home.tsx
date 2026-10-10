import { ArrowRight, CaretLeft, CaretRight, Heart, MusicNotes, Pause, Play, Shuffle } from '@phosphor-icons/react';
import { useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { PlayingIndicator } from '../components/player/PlayingIndicator';
import { Artwork } from '../components/ui/Artwork';
import { Spinner } from '../components/ui/Controls';
import { EmptyState, ErrorState } from '../components/ui/EmptyState';
import { MixCover } from '../components/ui/MixCover';
import { UploadButton } from '../components/upload/Upload';
import { playMix, useRecommendations, useStats, useTrackPreview } from '../hooks/useLibrary';
import { formatDuration, formatLongDuration, greeting, pluralize } from '../lib/format';
import { useIsAdmin } from '../stores/authStore';
import { currentTrackOf, usePlayerStore } from '../stores/playerStore';
import { useSettingsStore } from '../stores/settingsStore';
import type { MixSummary, Track } from '../types';
import { usePageTitle } from '../hooks/usePageTitle';

function usePlayFrom(tracks: Track[]) {
  const playTracks = usePlayerStore((state) => state.playTracks);
  const currentId = usePlayerStore((state) => currentTrackOf(state)?.id);
  return (index: number) => (tracks[index].id === currentId ? usePlayerStore.getState().togglePlay() : playTracks(tracks, index));
}

function useNowPlaying() {
  const currentId = usePlayerStore((state) => currentTrackOf(state)?.id ?? null);
  const isPlaying = usePlayerStore((state) => state.isPlaying);
  return { currentId, isPlaying };
}

/** A section title set on a rule, with an optional "See all" link and controls. */
function SectionHeading({ title, to, children }: { title: string; to?: string; children?: ReactNode }) {
  return (
    <div className="mb-5 flex items-end justify-between gap-4 border-b border-edge pb-3">
      <h2 className="font-display text-3xl leading-none md:text-[2.5rem]">{title}</h2>
      <div className="flex shrink-0 items-center gap-3">
        {children}
        {to && (
          <Link to={to} className="group inline-flex items-center gap-1 text-sm text-muted transition-colors hover:text-fg">
            See all
            <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 ease-out group-hover:translate-x-0.5" />
          </Link>
        )}
      </div>
    </div>
  );
}

/** A titled horizontal row. Scrolls by swipe, trackpad, or the arrow buttons. */
function ShelfRow({ title, to, note, children }: { title: string; to?: string; note?: ReactNode; children: ReactNode }) {
  const scroller = useRef<HTMLUListElement>(null);
  const page = (direction: number) => {
    const element = scroller.current;
    if (element) element.scrollBy({ left: direction * element.clientWidth * 0.8, behavior: 'smooth' });
  };

  return (
    <section>
      <SectionHeading title={title} to={to}>
        <div className="hidden items-center md:flex">
          <button type="button" onClick={() => page(-1)} aria-label={`Scroll ${title} back`} className="icon-btn">
            <CaretLeft weight="bold" className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => page(1)} aria-label={`Scroll ${title} forward`} className="icon-btn">
            <CaretRight weight="bold" className="h-4 w-4" />
          </button>
        </div>
      </SectionHeading>
      {note}
      <ul
        ref={scroller}
        className="stagger no-scrollbar -mx-5 flex snap-x snap-mandatory scroll-px-5 gap-4 overflow-x-auto px-5 pb-3 pt-1 sm:-mx-8 sm:scroll-px-8 sm:px-8 md:gap-6 lg:-mx-12 lg:scroll-px-12 lg:px-12"
      >
        {children}
      </ul>
    </section>
  );
}

const stagger = (index: number): CSSProperties => ({ animationDelay: `${Math.min(index, 12) * 30}ms` });

/** A row of covers; each plays from its track onwards. */
function Shelf({ title, to, tracks }: { title: string; to?: string; tracks: Track[] }) {
  const play = usePlayFrom(tracks);
  const { currentId, isPlaying } = useNowPlaying();

  return (
    <ShelfRow title={title} to={to}>
      {tracks.map((track, index) => {
        const current = track.id === currentId;
        return (
          <li key={track.id} className="w-[9.5rem] shrink-0 snap-start md:w-44" style={stagger(index)}>
            <button
              type="button"
              onClick={() => play(index)}
              aria-label={current && isPlaying ? `Pause ${track.title}` : `Play ${track.title}`}
              className="group w-full rounded-md text-left focus-visible:outline-none"
            >
              <div className="relative mb-3 overflow-hidden rounded-md shadow-cover transition-transform duration-300 ease-out group-hover:-translate-y-1 group-focus-visible:ring-2 group-focus-visible:ring-accent">
                <Artwork src={track.artworkUrl} title={track.title} className="aspect-square w-full" textClassName="text-7xl" />
                <span
                  className={`absolute bottom-2.5 right-2.5 flex h-10 w-10 items-center justify-center rounded-full bg-accent text-accent-fg shadow-lift transition-[transform,opacity] duration-200 ease-out group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:opacity-100 ${
                    current ? 'translate-y-0 opacity-100' : 'translate-y-1.5 opacity-0'
                  }`}
                >
                  {current && isPlaying ? <Pause weight="fill" className="h-[18px] w-[18px]" /> : <Play weight="fill" className="ml-0.5 h-[18px] w-[18px]" />}
                </span>
              </div>
              <div className={`truncate text-sm font-medium ${current ? 'text-accent' : ''}`}>{track.title}</div>
              <div className="mt-0.5 truncate text-[13px] text-muted">{track.artist ?? 'Unknown artist'}</div>
            </button>
          </li>
        );
      })}
    </ShelfRow>
  );
}

function ShelfSkeleton({ title }: { title: string }) {
  return (
    <section>
      <SectionHeading title={title} />
      <div className="flex gap-4 overflow-hidden md:gap-6" role="status" aria-label="Loading">
        {Array.from({ length: 7 }, (_, i) => (
          <div key={i} className="w-[9.5rem] shrink-0 space-y-3 md:w-44">
            <div className="aspect-square animate-pulse rounded-md bg-surface-2" />
            <div className="h-3 w-3/4 animate-pulse rounded bg-surface-2" />
            <div className="h-2.5 w-1/2 animate-pulse rounded bg-surface-2/70" />
          </div>
        ))}
      </div>
    </section>
  );
}

/** A mix on the shelf: the cover opens it, the round button plays it. */
function MixCard({ mix, style }: { mix: MixSummary; style?: CSSProperties }) {
  const [starting, setStarting] = useState(false);
  const start = () => {
    setStarting(true);
    void playMix(mix.id).finally(() => setStarting(false));
  };

  return (
    <li className="group relative w-40 shrink-0 snap-start md:w-52" style={style}>
      <Link to={`/mix/${mix.id}`} className="group/link block rounded-md focus-visible:outline-none">
        <MixCover
          mix={mix}
          className="mb-3 aspect-square w-full rounded-md shadow-cover transition-transform duration-300 ease-out group-hover:-translate-y-1 group-focus-visible/link:ring-2 group-focus-visible/link:ring-accent"
        />
        <span className="sr-only">{mix.title}: </span>
        <span className="line-clamp-2 text-[13px] leading-snug text-muted">{mix.description}</span>
      </Link>
      {/* Over the cover's corner but outside the link, which can't hold a button. Touch screens have no
          hover to reveal it, and it would sit on the title, so a tap opens the mix instead, where Play is. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 aspect-square transition-transform duration-300 ease-out group-hover:-translate-y-1">
        <button
          type="button"
          onClick={start}
          disabled={starting}
          aria-label={`Play ${mix.title}`}
          className="pointer-events-auto absolute bottom-2.5 right-2.5 flex h-10 w-10 translate-y-1.5 items-center justify-center rounded-full bg-accent text-accent-fg opacity-0 shadow-lift transition-[transform,opacity] duration-200 ease-out focus-visible:translate-y-0 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg group-hover:translate-y-0 group-hover:opacity-100 disabled:translate-y-0 disabled:opacity-100 [@media(hover:none)]:hidden"
        >
          {starting ? <Spinner /> : <Play weight="fill" className="ml-0.5 h-[18px] w-[18px]" />}
        </button>
      </div>
    </li>
  );
}

function MadeForYou({ mixes, coldStart }: { mixes: MixSummary[]; coldStart: boolean }) {
  if (mixes.length === 0) {
    return (
      <section>
        <SectionHeading title="Made for you" />
        <p className="max-w-xl py-1 text-[15px] leading-relaxed text-muted">
          Your mixes start here. Play a few songs and heart the ones you love, and they build from there: daily mixes of what you like, a
          weekly round of songs you haven't heard, and the ones you keep coming back to.
        </p>
      </section>
    );
  }
  return (
    <ShelfRow
      title="Made for you"
      note={coldStart ? <p className="-mt-1 mb-4 text-sm text-muted">These get more personal the more you listen.</p> : undefined}
    >
      {mixes.map((mix, index) => (
        <MixCard key={mix.id} mix={mix} style={stagger(index)} />
      ))}
    </ShelfRow>
  );
}

/** Mixes, then the picks the server made from this account's listening. */
function ForYou() {
  const recommendations = useRecommendations();

  if (recommendations.isLoading) return <ShelfSkeleton title="Made for you" />;
  if (recommendations.error) {
    return (
      <section>
        <SectionHeading title="Made for you" />
        <ErrorState error={recommendations.error} onRetry={() => void recommendations.refetch()} />
      </section>
    );
  }
  if (!recommendations.data) return null;

  const { mixes, shelves, coldStart } = recommendations.data;
  return (
    <>
      <MadeForYou mixes={mixes} coldStart={coldStart} />
      {shelves.map((shelf) => (
        <Shelf key={shelf.id} title={shelf.title} tracks={shelf.tracks} />
      ))}
    </>
  );
}

/** The last few tracks played, as a numbered list. */
function JumpBackIn({ tracks }: { tracks: Track[] }) {
  const play = usePlayFrom(tracks);
  const { currentId, isPlaying } = useNowPlaying();

  return (
    <ol className="stagger">
      {tracks.map((track, index) => {
        const current = track.id === currentId;
        return (
          <li key={track.id} className="border-b border-edge/70 last:border-0" style={{ animationDelay: `${index * 40}ms` }}>
            <button type="button" onClick={() => play(index)} className="row-hover group -mx-2 flex w-[calc(100%+1rem)] items-center gap-3 rounded-md px-2 py-2.5 text-left">
              <span className="w-5 shrink-0 font-mono text-[11px] text-faint">{String(index + 1).padStart(2, '0')}</span>
              <Artwork src={track.artworkUrl} title={track.title} className="h-11 w-11 shrink-0 rounded" textClassName="text-xl" />
              <span className="min-w-0 flex-1">
                <span className={`block truncate text-sm font-medium ${current ? 'text-accent' : ''}`}>{track.title}</span>
                <span className="block truncate text-xs text-muted">{track.artist ?? 'Unknown artist'}</span>
              </span>
              {current ? (
                <PlayingIndicator paused={!isPlaying} className="mr-1" />
              ) : (
                <>
                  <span className="font-mono text-[11px] tabular-nums text-faint group-hover:hidden">{formatDuration(track.duration)}</span>
                  <Play weight="fill" aria-hidden="true" className="hidden h-4 w-4 text-fg group-hover:block" />
                </>
              )}
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function Masthead({ trackCount, side }: { trackCount: number; side: ReactNode }) {
  const stats = useStats();
  const isAdmin = useIsAdmin();
  const showStats = useSettingsStore((state) => state.homeShowStats);
  const playTracks = usePlayerStore((state) => state.playTracks);
  const everything = useTrackPreview({ sort: 'recent' }, 500);
  const s = stats.data?.stats;
  const today = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    // grid-cols-1 keeps the single phone column at the screen's width; an implicit column would
    // grow to fit the longest unwrapped song title in "Jump back in".
    <section className="grid grid-cols-1 gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] lg:gap-14 2xl:grid-cols-[minmax(0,1fr)_minmax(0,28rem)]">
      {/* The dateline tops the column and the greeting sits at its foot, framing the list beside it.
          The greeting is sized to its column (cqw), not the window, so it fits beside the side panel. */}
      <div className="flex flex-col justify-between gap-4 [container-type:inline-size]">
        <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-faint">{today}</p>
        <div>
          <h1 className="font-display text-[length:clamp(3.25rem,17cqw,7.5rem)] leading-[0.9] tracking-[-0.015em]">
            {greeting()}
            <span className="text-accent">.</span>
          </h1>
          {showStats && s && s.trackCount > 0 && (
            <p className="mt-6 max-w-md text-[15px] leading-relaxed text-muted">
              {isAdmin ? 'Your' : 'The'} library holds <span className="text-fg">{pluralize(s.trackCount, 'track')}</span> by{' '}
              <span className="text-fg">{pluralize(s.artistCount, 'artist')}</span> across{' '}
              <span className="text-fg">{pluralize(s.albumCount, 'album')}</span>, about {formatLongDuration(s.totalDuration)} of music.
            </p>
          )}
          <div className="mt-8 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!trackCount || !everything.data}
              onClick={() => everything.data && playTracks(everything.data.tracks, 0, { shuffle: true })}
              className="btn-primary"
            >
              <Shuffle weight="bold" className="h-4 w-4" />
              Shuffle all
            </button>
            <UploadButton className="btn-secondary" />
          </div>
        </div>
      </div>
      {side}
    </section>
  );
}

export function Home() {
  usePageTitle('Home');
  const isAdmin = useIsAdmin();
  const played = useTrackPreview({ played: true, sort: 'played' }, 6);
  const added = useTrackPreview({ sort: 'recent' }, 16);
  const favorites = useTrackPreview({ favorite: true, sort: 'recent' }, 16);

  if (added.error) {
    return (
      <div className="page">
        <ErrorState error={added.error} onRetry={() => void added.refetch()} />
      </div>
    );
  }

  const libraryEmpty = added.data?.total === 0;
  const recent = played.data?.tracks ?? [];

  const side = libraryEmpty ? null : (
    <aside aria-label="Jump back in">
      <SectionHeading title="Jump back in" to={recent.length ? '/recently-played' : undefined} />
      {played.isLoading ? (
        <div className="space-y-2" role="status" aria-label="Loading">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="h-12 animate-pulse rounded-md bg-surface-2/60" />
          ))}
        </div>
      ) : recent.length ? (
        <JumpBackIn tracks={recent} />
      ) : (
        <p className="py-4 text-sm text-muted">Nothing played yet. The tracks you play show up here, so you can pick up where you left off.</p>
      )}
    </aside>
  );

  return (
    <div className="page space-y-14 md:space-y-16">
      <Masthead trackCount={added.data?.total ?? 0} side={side} />

      {libraryEmpty ? (
        isAdmin ? (
          <EmptyState
            icon={<MusicNotes weight="light" />}
            title="Your library is empty"
            description="Upload your music to start listening. You can also drop audio files anywhere on the page."
            action={<UploadButton />}
          />
        ) : (
          <EmptyState icon={<MusicNotes weight="light" />} title="Nothing to play yet" description="Music shows up here as soon as the admin adds some." />
        )
      ) : (
        <>
          <ForYou />

          {added.isLoading ? <ShelfSkeleton title="Recently added" /> : <Shelf title="Recently added" to="/recently-added" tracks={added.data?.tracks ?? []} />}

          {favorites.isLoading ? (
            <ShelfSkeleton title="Favorites" />
          ) : favorites.data?.tracks.length ? (
            <Shelf title="Favorites" to="/favorites" tracks={favorites.data.tracks} />
          ) : (
            <section>
              <SectionHeading title="Favorites" />
              <EmptyState compact icon={<Heart weight="light" />} title="No favorites yet" description="Tap the heart on any track to keep it here." />
            </section>
          )}
        </>
      )}
    </div>
  );
}
