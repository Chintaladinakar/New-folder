import { ListDashes, Sparkle } from '@phosphor-icons/react';
import { useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import { TrackList } from '../components/tracks/TrackList';
import { ListSkeleton, PlayButtons } from '../components/tracks/TrackListPage';
import { EmptyState, ErrorState } from '../components/ui/EmptyState';
import { MixCover } from '../components/ui/MixCover';
import { PageHeader } from '../components/ui/PageHeader';
import { useMix } from '../hooks/useLibrary';
import { usePageTitle } from '../hooks/usePageTitle';
import { ApiError } from '../lib/api';
import { formatLongDuration, pluralize } from '../lib/format';
import { usePlayerStore } from '../stores/playerStore';

const coverClass = 'h-36 w-36 rounded-md shadow-cover sm:h-48 sm:w-48 lg:h-56 lg:w-56';

/** One of the account's mixes. The server rebuilds them from its listening each day (Discover Weekly each Monday). */
export function Mix() {
  const { id = '' } = useParams();
  const mix = useMix(id);
  const playTracks = usePlayerStore((state) => state.playTracks);
  usePageTitle(mix.data?.mix.title ?? 'Mix');

  const tracks = mix.data?.tracks;
  const onPlay = useCallback(
    (index: number) => {
      if (tracks) playTracks(tracks, index);
    },
    [playTracks, tracks],
  );

  if (mix.isLoading) {
    return (
      <div className="page">
        <div className="mb-10 flex items-end gap-8">
          <div className={`${coverClass} animate-pulse bg-surface-2`} />
          <div className="flex-1 space-y-4">
            <div className="h-3 w-20 animate-pulse rounded bg-surface-2" />
            <div className="h-12 w-2/3 animate-pulse rounded bg-surface-2" />
          </div>
        </div>
        <ListSkeleton />
      </div>
    );
  }

  if (mix.error || !mix.data) {
    // Mixes come and go with the listening behind them; an old link can outlive its mix.
    const gone = mix.error instanceof ApiError && mix.error.status === 404;
    return (
      <div className="page">
        {gone ? (
          <EmptyState
            icon={<Sparkle weight="light" />}
            title="This mix isn't around today"
            description="Mixes are rebuilt from your listening, and this one has moved on. Today's mixes are on Home."
            action={
              <Link to="/" className="btn-primary">
                Go home
              </Link>
            }
          />
        ) : (
          <ErrorState error={mix.error ?? new Error('Mix not found')} onRetry={() => void mix.refetch()} />
        )}
      </div>
    );
  }

  const info = mix.data.mix;

  return (
    <div className="page">
      <PageHeader
        eyebrow={
          <Link to="/" className="transition-colors hover:text-fg">
            Made for you
          </Link>
        }
        title={info.title}
        cover={<MixCover mix={info} className={coverClass} />}
        meta={
          <>
            <p className="mb-2 max-w-xl text-[15px] text-fg/80">{info.description}</p>
            <p className="font-mono text-xs">
              {pluralize(info.trackCount, 'track')}
              {info.duration > 0 && ` · ${formatLongDuration(info.duration)}`}
            </p>
          </>
        }
        actions={<PlayButtons tracks={mix.data.tracks} />}
      />

      {mix.data.tracks.length === 0 ? (
        <EmptyState icon={<ListDashes weight="light" />} title="Nothing in this mix today" description="Keep listening and it fills back up." />
      ) : (
        <TrackList tracks={mix.data.tracks} onPlay={onPlay} />
      )}
    </div>
  );
}
