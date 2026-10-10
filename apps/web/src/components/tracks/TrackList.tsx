import {
  ArrowElbowDownRight,
  Clock,
  DotsThree,
  Heart,
  ListPlus,
  MicrophoneStage,
  Pause,
  PencilSimple,
  Play,
  Queue,
  Radio,
  Subtitles,
  Trash,
  VinylRecord,
} from '@phosphor-icons/react';
import { memo, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { startRadio, useDeleteTrack, useUpdateTrack } from '../../hooks/useLibrary';
import { formatDuration } from '../../lib/format';
import { useIsAdmin } from '../../stores/authStore';
import { currentTrackOf, usePlayerStore } from '../../stores/playerStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { toast } from '../../stores/toastStore';
import type { Track } from '../../types';
import { PlayingIndicator } from '../player/PlayingIndicator';
import { Artwork } from '../ui/Artwork';
import { Spinner } from '../ui/Controls';
import { ConfirmDialog } from '../ui/Dialog';
import { Menu, type MenuItem } from '../ui/Menu';
import { AddToPlaylistDialog, EditTrackDialog } from './TrackDialogs';

// Columns appear as space allows: # | title | artist (md) | album (lg) | time (sm) | ♥ | ⋯
// An album's own page leaves out the album column, which would repeat on every row.
const GRID =
  'grid grid-cols-[1.75rem_minmax(0,1fr)_2rem_2rem] sm:grid-cols-[2.25rem_minmax(0,1fr)_3.25rem_2rem_2rem] md:grid-cols-[2.25rem_minmax(0,3fr)_minmax(0,2fr)_3.25rem_2rem_2rem] items-center gap-x-3 md:gap-x-4';
const WITH_ALBUM = 'lg:grid-cols-[2.25rem_minmax(0,3fr)_minmax(0,2fr)_minmax(0,2fr)_3.25rem_2rem_2rem]';

// Rows bleed a little past the text column so the hover wash has room.
const BLEED = '-mx-2 px-2 sm:-mx-3 sm:px-3';

type TrackListProps = {
  tracks: Track[];
  /** Start playback at this index; the caller decides what the queue is. */
  onPlay: (index: number) => void;
  numbering?: 'index' | 'trackNumber';
  /** Extra actions for a row, e.g. playlist reordering. */
  extraMenuItems?: (track: Track, index: number) => MenuItem[];
  hasMore?: boolean;
  isLoadingMore?: boolean;
  onLoadMore?: () => void;
  /** Off on an album's page, where every row would show the same album. */
  showAlbum?: boolean;
};

type DialogState = { kind: 'edit' | 'delete' | 'playlist'; track: Track } | null;

export function TrackList({
  tracks,
  onPlay,
  numbering = 'index',
  extraMenuItems,
  hasMore,
  isLoadingMore,
  onLoadMore,
  showAlbum = true,
}: TrackListProps) {
  const grid = showAlbum ? `${GRID} ${WITH_ALBUM}` : GRID;
  const [dialog, setDialog] = useState<DialogState>(null);
  const deleteTrack = useDeleteTrack();
  const sentinelRef = useRef<HTMLDivElement>(null);
  const currentId = usePlayerStore((state) => currentTrackOf(state)?.id ?? null);
  const isPlaying = usePlayerStore((state) => state.isPlaying);
  const compact = useSettingsStore((state) => state.density === 'compact');
  const rowArtwork = useSettingsStore((state) => state.rowArtwork);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore || !onLoadMore || isLoadingMore) return;
    const observer = new IntersectionObserver((entries) => entries[0]?.isIntersecting && onLoadMore(), { rootMargin: '600px' });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, onLoadMore, isLoadingMore, tracks.length]);

  return (
    <div className="text-sm">
      {/* Column labels stay in view while the list scrolls. */}
      <div className={`${grid} ${BLEED} sticky top-0 z-10 border-b border-edge bg-base/95 py-2.5 text-xs text-faint backdrop-blur`}>
        <div className="text-right font-mono">#</div>
        <div>Title</div>
        <div className="hidden md:block">Artist</div>
        {showAlbum && <div className="hidden lg:block">Album</div>}
        <div className="hidden justify-end sm:flex">
          <Clock className="h-3.5 w-3.5" aria-label="Duration" />
        </div>
        <div />
        <div />
      </div>

      <ul className="stagger">
        {tracks.map((track, index) => (
          <TrackRow
            key={`${track.id}-${index}`}
            track={track}
            index={index}
            number={numbering === 'trackNumber' ? (track.trackNumber ?? index + 1) : index + 1}
            isCurrent={track.id === currentId}
            isPlaying={track.id === currentId && isPlaying}
            compact={compact}
            showArtwork={rowArtwork}
            grid={grid}
            showAlbum={showAlbum}
            onPlay={onPlay}
            onDialog={setDialog}
            extraMenuItems={extraMenuItems}
            style={{ animationDelay: `${Math.min(index, 12) * 25}ms` }}
          />
        ))}
      </ul>

      {hasMore && (
        <div ref={sentinelRef} className="flex justify-center py-8">
          <button type="button" onClick={onLoadMore} disabled={isLoadingMore} className="btn-secondary">
            {isLoadingMore && <Spinner />}
            {isLoadingMore ? 'Loading…' : 'Load more'}
          </button>
        </div>
      )}

      {dialog?.kind === 'edit' && <EditTrackDialog track={dialog.track} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'playlist' && <AddToPlaylistDialog tracks={[dialog.track]} onClose={() => setDialog(null)} />}
      <ConfirmDialog
        open={dialog?.kind === 'delete'}
        onClose={() => setDialog(null)}
        title="Delete from library?"
        message={
          <>
            <strong className="font-medium text-fg">{dialog?.track.title}</strong> will be removed from your library, every playlist,
            and storage. This can't be undone.
          </>
        }
        confirmLabel="Delete"
        onConfirm={() => (dialog ? deleteTrack.mutateAsync(dialog.track) : undefined)}
      />
    </div>
  );
}

type TrackRowProps = {
  track: Track;
  index: number;
  number: number;
  isCurrent: boolean;
  isPlaying: boolean;
  compact: boolean;
  showArtwork: boolean;
  grid: string;
  showAlbum: boolean;
  onPlay: (index: number) => void;
  onDialog: (dialog: DialogState) => void;
  extraMenuItems?: (track: Track, index: number) => MenuItem[];
  style?: React.CSSProperties;
};

const TrackRow = memo(function TrackRow({
  track,
  index,
  number,
  isCurrent,
  isPlaying,
  compact,
  showArtwork,
  grid,
  showAlbum,
  onPlay,
  onDialog,
  extraMenuItems,
  style,
}: TrackRowProps) {
  const navigate = useNavigate();
  const updateTrack = useUpdateTrack();
  const isAdmin = useIsAdmin();
  const [popped, setPopped] = useState(false);

  const activate = () => (isCurrent ? usePlayerStore.getState().togglePlay() : onPlay(index));

  const menuItems: MenuItem[] = [
    {
      label: 'Play next',
      icon: ArrowElbowDownRight,
      onSelect: () => {
        usePlayerStore.getState().playNext([track]);
        toast(`"${track.title}" will play next`);
      },
    },
    {
      label: 'Add to queue',
      icon: Queue,
      onSelect: () => {
        usePlayerStore.getState().addToQueue([track]);
        toast(`Added "${track.title}" to the queue`);
      },
    },
    { label: 'Add to playlist…', icon: ListPlus, onSelect: () => onDialog({ kind: 'playlist', track }) },
    { label: 'Start radio', icon: Radio, onSelect: () => void startRadio({ track: track.id }) },
    { separator: true },
    {
      label: 'Go to artist',
      icon: MicrophoneStage,
      disabled: !track.artist,
      onSelect: () => navigate(`/library?artist=${encodeURIComponent(track.artist ?? '')}`),
    },
    {
      label: 'Go to album',
      icon: VinylRecord,
      disabled: !track.album,
      onSelect: () => {
        const params = new URLSearchParams({ album: track.album ?? '' });
        const albumArtist = track.albumArtist ?? track.artist;
        if (albumArtist) params.set('albumArtist', albumArtist);
        navigate(`/library?${params}`);
      },
    },
    ...(extraMenuItems ? [{ separator: true } as const, ...extraMenuItems(track, index)] : []),
    // Changing the library itself is the admin's job.
    ...(isAdmin
      ? [
          { separator: true } as const,
          { label: 'Edit details', icon: PencilSimple, onSelect: () => onDialog({ kind: 'edit', track }) },
          { label: 'Delete from library', icon: Trash, danger: true, onSelect: () => onDialog({ kind: 'delete', track }) },
        ]
      : []),
  ];

  const rowPadding = compact ? 'py-1' : 'py-2';
  const art = compact ? 'h-8 w-8' : 'h-10 w-10';

  return (
    <li
      onClick={activate}
      style={style}
      className={`${grid} ${BLEED} row-hover group cursor-pointer border-b border-edge/60 ${rowPadding} transition-colors duration-150 ${
        isCurrent ? 'bg-accent/[0.06]' : ''
      }`}
    >
      <div className="relative flex h-8 items-center justify-end font-mono text-xs text-faint">
        <span className={`tabular-nums group-focus-within:invisible group-hover:invisible ${isCurrent ? 'text-accent' : ''}`}>
          {isCurrent ? <PlayingIndicator paused={!isPlaying} /> : String(number).padStart(2, '0')}
        </span>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            activate();
          }}
          aria-label={isPlaying ? `Pause ${track.title}` : `Play ${track.title}`}
          className="absolute inset-0 flex items-center justify-end text-fg opacity-0 focus:opacity-100 group-hover:opacity-100"
        >
          {isPlaying ? <Pause weight="fill" className="h-4 w-4" /> : <Play weight="fill" className="h-4 w-4" />}
        </button>
      </div>

      <div className="flex min-w-0 items-center gap-3">
        {showArtwork && <Artwork src={track.artworkUrl} title={track.title} className={`${art} shrink-0 rounded`} textClassName="text-lg" />}
        <div className="min-w-0">
          <div className={`flex items-center gap-1.5 font-medium ${isCurrent ? 'text-accent' : 'text-fg'}`}>
            <span className="truncate">{track.title}</span>
            {track.hasLyrics && <Subtitles className="h-3.5 w-3.5 shrink-0 text-faint" aria-label="Has lyrics" />}
          </div>
          <div className={`truncate text-xs text-muted md:hidden ${compact ? 'hidden' : ''}`}>{track.artist ?? 'Unknown artist'}</div>
        </div>
      </div>
      <div className="hidden truncate text-muted md:block">{track.artist ?? 'Unknown artist'}</div>
      {showAlbum && <div className="hidden truncate text-muted lg:block">{track.album ?? '—'}</div>}
      <div className="hidden text-right font-mono text-xs tabular-nums text-faint sm:block">{formatDuration(track.duration)}</div>

      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          setPopped(!track.isFavorite);
          updateTrack.mutate({ id: track.id, patch: { isFavorite: !track.isFavorite } });
        }}
        onAnimationEnd={() => setPopped(false)}
        aria-label={track.isFavorite ? `Remove ${track.title} from favorites` : `Add ${track.title} to favorites`}
        aria-pressed={track.isFavorite}
        className={`icon-btn h-8 w-8 p-0 ${popped ? 'animate-pop' : ''} ${
          track.isFavorite ? 'text-accent' : 'sm:opacity-0 sm:focus:opacity-100 sm:group-hover:opacity-100'
        }`}
      >
        <Heart weight={track.isFavorite ? 'fill' : 'regular'} className="h-4 w-4" />
      </button>
      <Menu
        items={menuItems}
        label={`More options for ${track.title}`}
        className="icon-btn h-8 w-8 p-0 sm:opacity-0 sm:focus:opacity-100 sm:group-hover:opacity-100 sm:aria-expanded:opacity-100"
      >
        <DotsThree weight="bold" className="h-5 w-5" />
      </Menu>
    </li>
  );
});
