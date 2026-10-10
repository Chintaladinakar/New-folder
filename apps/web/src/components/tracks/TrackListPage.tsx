import { Play, Shuffle } from '@phosphor-icons/react';
import { useCallback, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTrackPages } from '../../hooks/useLibrary';
import { formatLongDuration, pluralize } from '../../lib/format';
import { usePlayerStore } from '../../stores/playerStore';
import type { Track, TrackFilters } from '../../types';
import { Artwork } from '../ui/Artwork';
import { EmptyState, ErrorState } from '../ui/EmptyState';
import { PageHeader } from '../ui/PageHeader';
import { SongsTabs } from './SongsTabs';
import { TrackList } from './TrackList';
import { usePageTitle } from '../../hooks/usePageTitle';

export function PlayButtons({ tracks, disabled }: { tracks: Track[]; disabled?: boolean }) {
  const playTracks = usePlayerStore((state) => state.playTracks);
  return (
    <>
      <button type="button" onClick={() => playTracks(tracks, 0, { shuffle: false })} disabled={disabled || !tracks.length} className="btn-primary">
        <Play weight="fill" className="h-4 w-4" />
        Play
      </button>
      <button type="button" onClick={() => playTracks(tracks, 0, { shuffle: true })} disabled={disabled || !tracks.length} className="btn-secondary">
        <Shuffle weight="bold" className="h-4 w-4" />
        Shuffle
      </button>
    </>
  );
}

/** Placeholder rows shaped like the track table. */
export function ListSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div aria-label="Loading" role="status">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-4 border-b border-edge/60 py-2.5" style={{ opacity: 1 - i * 0.09 }}>
          <div className="h-3 w-5 animate-pulse rounded bg-surface-2" />
          <div className="h-10 w-10 shrink-0 animate-pulse rounded bg-surface-2" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-2/5 animate-pulse rounded bg-surface-2" />
            <div className="h-2.5 w-1/4 animate-pulse rounded bg-surface-2/70" />
          </div>
        </div>
      ))}
    </div>
  );
}

type TrackListPageProps = {
  title: string;
  eyebrow?: string;
  filters: TrackFilters;
  empty: { icon: ReactNode; title: string; description: string; action?: ReactNode };
  /** Shown under the title, e.g. filter chips. */
  subtitle?: ReactNode;
  /** Extra controls next to the play buttons, e.g. upload. */
  actions?: ReactNode;
  /** Rendered between the heading and the list, e.g. the filter bar. */
  toolbar?: ReactNode;
  numbering?: 'index' | 'trackNumber';
  /** Show the All / Favorites / Recently… tabs. */
  tabs?: boolean;
  /** Put the first track's artwork beside the title, as an album sleeve or an artist portrait. */
  cover?: 'album' | 'artist';
};

export function TrackListPage({ title, eyebrow, filters, empty, subtitle, actions, toolbar, numbering, tabs, cover }: TrackListPageProps) {
  usePageTitle(title);
  const pages = useTrackPages(filters);
  const { tracks, total, hasNextPage, isFetchingNextPage, fetchNextPage } = pages;
  const playTracks = usePlayerStore((state) => state.playTracks);

  const onPlay = useCallback((index: number) => playTracks(tracks, index), [playTracks, tracks]);
  const loadMore = useCallback(() => {
    if (!isFetchingNextPage) void fetchNextPage();
  }, [fetchNextPage, isFetchingNextPage]);

  // The running time is only known once every page has loaded.
  const seconds = !pages.isLoading && !hasNextPage ? tracks.reduce((sum, track) => sum + (track.duration ?? 0), 0) : 0;
  const first = tracks[0];
  const albumArtist = cover === 'album' ? (filters.albumArtist ?? first?.albumArtist ?? first?.artist) : undefined;

  const facts = [
    albumArtist && (
      <Link key="artist" to={`/library?artist=${encodeURIComponent(albumArtist)}`} className="text-fg underline decoration-fg/30 underline-offset-4 transition-colors hover:decoration-fg">
        {albumArtist}
      </Link>
    ),
    cover === 'album' && first?.year,
    pages.isLoading ? 'Loading…' : pluralize(total, 'track'),
    seconds > 0 && formatLongDuration(seconds),
  ].filter(Boolean);

  return (
    <div className="page">
      <PageHeader
        eyebrow={eyebrow}
        title={title}
        cover={
          cover && (
            <Artwork
              src={first?.artworkUrl}
              title={title}
              shape={cover === 'artist' ? 'circle' : 'square'}
              className={`h-36 w-36 shadow-cover sm:h-48 sm:w-48 lg:h-56 lg:w-56 ${cover === 'album' ? 'rounded-md' : ''}`}
              textClassName="text-7xl lg:text-8xl"
            />
          )
        }
        meta={
          <>
            <p>
              {facts.map((fact, index) => (
                <span key={index}>
                  {index > 0 && <span className="mx-2 text-faint">·</span>}
                  {fact}
                </span>
              ))}
            </p>
            {subtitle}
          </>
        }
        actions={
          <>
            <PlayButtons tracks={tracks} disabled={pages.isLoading} />
            {actions}
          </>
        }
      />

      {tabs && <SongsTabs />}
      {toolbar}

      {pages.isLoading ? (
        <ListSkeleton />
      ) : pages.error ? (
        <ErrorState error={pages.error} onRetry={() => void pages.refetch()} />
      ) : tracks.length === 0 ? (
        <EmptyState {...empty} />
      ) : (
        <TrackList
          tracks={tracks}
          onPlay={onPlay}
          numbering={numbering}
          hasMore={hasNextPage}
          isLoadingMore={isFetchingNextPage}
          onLoadMore={loadMore}
          showAlbum={cover !== 'album'}
        />
      )}
    </div>
  );
}
