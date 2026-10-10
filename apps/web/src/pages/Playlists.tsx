import { ArrowDown, ArrowUp, DotsThree, ListDashes, MagnifyingGlass, PencilSimple, Playlist as PlaylistIcon, Plus, Trash, X } from '@phosphor-icons/react';
import { useCallback, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { PlaylistFormDialog } from '../components/tracks/TrackDialogs';
import { TrackList } from '../components/tracks/TrackList';
import { ListSkeleton, PlayButtons } from '../components/tracks/TrackListPage';
import { Artwork } from '../components/ui/Artwork';
import { ConfirmDialog } from '../components/ui/Dialog';
import { EmptyState, ErrorState } from '../components/ui/EmptyState';
import { Menu, type MenuItem } from '../components/ui/Menu';
import { PageHeader } from '../components/ui/PageHeader';
import { useDeletePlaylist, usePlaylist, usePlaylists, useRemoveFromPlaylist, useReorderPlaylist } from '../hooks/useLibrary';
import { formatLongDuration, pluralize } from '../lib/format';
import { usePlayerStore } from '../stores/playerStore';
import type { Track } from '../types';
import { usePageTitle } from '../hooks/usePageTitle';

const gridClass = 'stagger grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-[repeat(auto-fill,minmax(168px,1fr))] sm:gap-x-6 sm:gap-y-10';

export function Playlists() {
  usePageTitle('Playlists');
  const playlists = usePlaylists();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const [query, setQuery] = useState('');

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (playlists.data ?? []).filter((playlist) => !needle || playlist.name.toLowerCase().includes(needle));
  }, [playlists.data, query]);

  return (
    <div className="page">
      <PageHeader title="Playlists" meta={playlists.data && <span className="font-mono text-xs">{pluralize(playlists.data.length, 'playlist')}</span>} />

      {(playlists.data?.length ?? 0) > 6 && (
        <div className="relative mb-8 sm:w-72">
          <MagnifyingGlass className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter playlists" aria-label="Filter playlists" className="input h-9 py-0 pl-9" />
        </div>
      )}

      {playlists.isLoading ? (
        <ListSkeleton rows={4} />
      ) : playlists.error ? (
        <ErrorState error={playlists.error} onRetry={() => void playlists.refetch()} />
      ) : !playlists.data?.length ? (
        <EmptyState
          icon={<PlaylistIcon weight="light" />}
          title="No playlists yet"
          description="Create a playlist to start organizing your music."
          action={
            <button type="button" onClick={() => setCreating(true)} className="btn-primary">
              <Plus weight="bold" className="h-4 w-4" />
              New playlist
            </button>
          }
        />
      ) : (
        <>
          <ul className={gridClass}>
            {/* Creating sits at the start of the shelf, where a new sleeve would go. */}
            <li>
              <button type="button" onClick={() => setCreating(true)} className="group block w-full text-left focus-visible:outline-none">
                <div className="mb-3 flex aspect-square w-full items-center justify-center rounded-md border border-dashed border-edge text-faint transition-colors duration-150 group-hover:border-faint group-hover:text-fg group-focus-visible:ring-2 group-focus-visible:ring-accent">
                  <Plus weight="light" className="h-9 w-9 transition-transform duration-300 ease-out group-hover:rotate-90" />
                </div>
                <div className="text-[15px] font-medium leading-snug">New playlist</div>
                <div className="mt-1 text-sm text-muted">Any tracks, in any order</div>
              </button>
            </li>
            {visible.map((playlist, index) => (
              <li key={playlist.id} style={{ animationDelay: `${Math.min(index, 12) * 25}ms` }}>
                <Link to={`/playlists/${playlist.id}`} className="group block focus-visible:outline-none">
                  <div className="mb-3 overflow-hidden rounded-md shadow-cover transition-transform duration-300 ease-out group-hover:-translate-y-1 group-focus-visible:ring-2 group-focus-visible:ring-accent">
                    <Artwork src={playlist.artworkUrl} title={playlist.name} className="aspect-square w-full" textClassName="text-7xl" />
                  </div>
                  <div className="line-clamp-2 text-[15px] font-medium leading-snug [overflow-wrap:anywhere]">{playlist.name}</div>
                  <div className="mt-1 truncate font-mono text-[11px] text-faint">
                    {pluralize(playlist.trackCount, 'track')}
                    {playlist.duration > 0 && ` · ${formatLongDuration(playlist.duration)}`}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
          {visible.length === 0 && <EmptyState compact icon={<MagnifyingGlass weight="light" />} title="No matches" description="No playlist matches that search." />}
        </>
      )}

      {creating && <PlaylistFormDialog onClose={() => setCreating(false)} onCreated={(playlist) => navigate(`/playlists/${playlist.id}`)} />}
    </div>
  );
}

export function PlaylistDetail() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const playlist = usePlaylist(id);
  const deletePlaylist = useDeletePlaylist();
  const removeEntry = useRemoveFromPlaylist();
  const reorder = useReorderPlaylist();
  const playTracks = usePlayerStore((state) => state.playTracks);
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  usePageTitle(playlist.data?.playlist.name ?? 'Playlist');

  const entries = playlist.data?.entries ?? [];
  const tracks = entries.map((entry) => entry.track);

  const onPlay = useCallback((index: number) => playTracks(tracks, index), [playTracks, tracks]);

  if (playlist.isLoading) {
    return (
      <div className="page">
        <div className="mb-10 flex items-end gap-8">
          <div className="h-36 w-36 animate-pulse rounded-md bg-surface-2 sm:h-48 sm:w-48 lg:h-56 lg:w-56" />
          <div className="flex-1 space-y-4">
            <div className="h-3 w-16 animate-pulse rounded bg-surface-2" />
            <div className="h-12 w-2/3 animate-pulse rounded bg-surface-2" />
          </div>
        </div>
        <ListSkeleton />
      </div>
    );
  }
  if (playlist.error || !playlist.data) {
    return (
      <div className="page">
        <ErrorState error={playlist.error ?? new Error('Playlist not found')} />
        <Link to="/playlists" className="mt-4 inline-block text-sm text-muted underline underline-offset-4 hover:text-fg">
          Back to playlists
        </Link>
      </div>
    );
  }

  const info = playlist.data.playlist;

  const move = (index: number, offset: number) => {
    const next = [...entries];
    const [entry] = next.splice(index, 1);
    next.splice(index + offset, 0, entry);
    reorder.mutate({ id, entries: next });
  };

  const extraMenuItems = (_track: Track, index: number): MenuItem[] => [
    { label: 'Move up', icon: ArrowUp, disabled: index === 0, onSelect: () => move(index, -1) },
    { label: 'Move down', icon: ArrowDown, disabled: index === entries.length - 1, onSelect: () => move(index, 1) },
    { label: 'Remove from this playlist', icon: X, onSelect: () => removeEntry.mutate({ id, entryId: entries[index].entryId }) },
  ];

  return (
    <div className="page">
      <PageHeader
        eyebrow={
          <Link to="/playlists" className="transition-colors hover:text-fg">
            Playlist
          </Link>
        }
        title={info.name}
        cover={<Artwork src={info.artworkUrl} title={info.name} className="h-36 w-36 rounded-md shadow-cover sm:h-48 sm:w-48 lg:h-56 lg:w-56" textClassName="text-7xl lg:text-8xl" />}
        meta={
          <>
            {info.description && <p className="mb-2 max-w-xl text-[15px] text-fg/80">{info.description}</p>}
            <p className="font-mono text-xs">
              {pluralize(info.trackCount, 'track')}
              {info.duration > 0 && ` · ${formatLongDuration(info.duration)}`}
            </p>
          </>
        }
        actions={
          <>
            <PlayButtons tracks={tracks} />
            <Menu
              label="Playlist options"
              align="left"
              className="btn-ghost w-10 px-0 aria-expanded:bg-surface-2 aria-expanded:text-fg"
              items={[
                { label: 'Edit details', icon: PencilSimple, onSelect: () => setEditing(true) },
                { label: 'Delete playlist', icon: Trash, danger: true, onSelect: () => setConfirmingDelete(true) },
              ]}
            >
              <DotsThree weight="bold" className="h-5 w-5" />
            </Menu>
          </>
        }
      />

      {tracks.length === 0 ? (
        <EmptyState
          icon={<ListDashes weight="light" />}
          title="This playlist is empty"
          description="Use “Add to playlist…” from any track's ⋯ menu to add songs."
          action={
            <Link to="/library" className="btn-primary">
              Browse songs
            </Link>
          }
        />
      ) : (
        <TrackList tracks={tracks} onPlay={onPlay} extraMenuItems={extraMenuItems} />
      )}

      {editing && <PlaylistFormDialog playlist={info} onClose={() => setEditing(false)} />}
      <ConfirmDialog
        open={confirmingDelete}
        onClose={() => setConfirmingDelete(false)}
        title="Delete playlist?"
        message={
          <>
            <strong className="font-medium text-fg">{info.name}</strong> will be deleted. The tracks stay in your library.
          </>
        }
        confirmLabel="Delete playlist"
        onConfirm={() => deletePlaylist.mutateAsync(id).then(() => navigate('/playlists'))}
      />
    </div>
  );
}
