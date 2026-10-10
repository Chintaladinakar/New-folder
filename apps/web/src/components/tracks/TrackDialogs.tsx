import { Plus } from '@phosphor-icons/react';
import { useState, type FormEvent } from 'react';
import { useAddToPlaylist, useCreatePlaylist, usePlaylists, useUpdatePlaylist, useUpdateTrack } from '../../hooks/useLibrary';
import { pluralize } from '../../lib/format';
import type { Playlist, Track, TrackPatch } from '../../types';
import { Dialog } from '../ui/Dialog';

type TextField = 'title' | 'artist' | 'album' | 'albumArtist' | 'genre';
type NumberField = 'year' | 'trackNumber' | 'discNumber';

const TEXT_FIELDS: [TextField, string][] = [
  ['title', 'Title'],
  ['artist', 'Artist'],
  ['album', 'Album'],
  ['albumArtist', 'Album artist'],
  ['genre', 'Genre'],
];
const NUMBER_FIELDS: [NumberField, string, number][] = [
  ['year', 'Year', 9999],
  ['trackNumber', 'Track #', 99999],
  ['discNumber', 'Disc #', 999],
];

export function EditTrackDialog({ track, onClose }: { track: Track; onClose: () => void }) {
  const updateTrack = useUpdateTrack();
  const [values, setValues] = useState<Record<TextField | NumberField, string>>({
    title: track.title,
    artist: track.artist ?? '',
    album: track.album ?? '',
    albumArtist: track.albumArtist ?? '',
    genre: track.genre ?? '',
    year: track.year?.toString() ?? '',
    trackNumber: track.trackNumber?.toString() ?? '',
    discNumber: track.discNumber?.toString() ?? '',
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const patch: TrackPatch = {};
    for (const [field] of TEXT_FIELDS) {
      const value = values[field].trim();
      const original = track[field] ?? '';
      if (value !== original) (patch as Record<string, string | null>)[field] = value === '' && field !== 'title' ? null : value;
    }
    for (const [field] of NUMBER_FIELDS) {
      const value = values[field].trim() === '' ? null : Number(values[field]);
      if (value !== track[field]) patch[field] = value;
    }
    if (Object.keys(patch).length === 0) {
      onClose();
      return;
    }
    updateTrack.mutate({ id: track.id, patch }, { onSuccess: onClose });
  };

  return (
    <Dialog open onClose={onClose} title="Edit details" description={`${track.fileName} · ${pluralize(track.playCount, 'play')}`}>
      <form onSubmit={submit} className="space-y-3">
        {TEXT_FIELDS.map(([field, label]) => (
          <label key={field} className="block text-sm">
            <span className="label">{label}</span>
            <input
              className="input"
              value={values[field]}
              required={field === 'title'}
              maxLength={500}
              onChange={(event) => setValues({ ...values, [field]: event.target.value })}
            />
          </label>
        ))}
        <div className="grid grid-cols-3 gap-3">
          {NUMBER_FIELDS.map(([field, label, max]) => (
            <label key={field} className="block text-sm">
              <span className="label">{label}</span>
              <input
                className="input"
                type="number"
                inputMode="numeric"
                min={1}
                max={max}
                value={values[field]}
                onChange={(event) => setValues({ ...values, [field]: event.target.value })}
              />
            </label>
          ))}
        </div>
        <div className="flex justify-end gap-2 pt-3">
          <button type="button" onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          {/* "required" lets a field of spaces through, so the title is checked after trimming. */}
          <button type="submit" disabled={updateTrack.isPending || !values.title.trim()} className="btn-primary">
            {updateTrack.isPending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

export function AddToPlaylistDialog({ tracks, onClose }: { tracks: Track[]; onClose: () => void }) {
  const playlists = usePlaylists();
  const addToPlaylist = useAddToPlaylist();
  const createPlaylist = useCreatePlaylist();
  const [newName, setNewName] = useState('');
  const trackIds = tracks.map((track) => track.id);

  const add = (playlist: Pick<Playlist, 'id' | 'name'>) =>
    addToPlaylist.mutate({ id: playlist.id, name: playlist.name, trackIds }, { onSuccess: onClose });

  const createAndAdd = (event: FormEvent) => {
    event.preventDefault();
    const name = newName.trim();
    if (!name) return;
    createPlaylist.mutate({ name }, { onSuccess: (playlist) => add(playlist) });
  };

  const busy = addToPlaylist.isPending || createPlaylist.isPending;
  const subject = tracks.length === 1 ? `"${tracks[0].title}"` : pluralize(tracks.length, 'track');

  return (
    <Dialog open onClose={onClose} title="Add to playlist" description={subject}>
      <form onSubmit={createAndAdd} className="mb-4 flex gap-2">
        <input
          className="input"
          placeholder="New playlist name"
          value={newName}
          maxLength={200}
          onChange={(event) => setNewName(event.target.value)}
          aria-label="New playlist name"
        />
        <button type="submit" disabled={busy || !newName.trim()} className="btn-primary shrink-0">
          <Plus weight="bold" className="h-4 w-4" />
          Create
        </button>
      </form>
      {playlists.isLoading ? (
        <p className="text-sm text-muted">Loading playlists…</p>
      ) : playlists.data?.length ? (
        <ul className="max-h-72 space-y-1 overflow-y-auto">
          {playlists.data.map((playlist) => (
            <li key={playlist.id}>
              <button
                type="button"
                disabled={busy}
                onClick={() => add(playlist)}
                className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors hover:bg-surface-2 disabled:opacity-50"
              >
                <span className="truncate font-medium">{playlist.name}</span>
                <span className="shrink-0 font-mono text-[11px] text-faint">{pluralize(playlist.trackCount, 'track')}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">No playlists yet. Create one above.</p>
      )}
    </Dialog>
  );
}

export function PlaylistFormDialog({
  playlist,
  onClose,
  onCreated,
}: {
  playlist?: Playlist;
  onClose: () => void;
  onCreated?: (playlist: Playlist) => void;
}) {
  const createPlaylist = useCreatePlaylist();
  const updatePlaylist = useUpdatePlaylist();
  const [name, setName] = useState(playlist?.name ?? '');
  const [description, setDescription] = useState(playlist?.description ?? '');
  const pending = createPlaylist.isPending || updatePlaylist.isPending;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const input = { name: name.trim(), description: description.trim() || null };
    if (!input.name) return;
    if (playlist) {
      updatePlaylist.mutate({ id: playlist.id, patch: input }, { onSuccess: onClose });
    } else {
      createPlaylist.mutate(input, {
        onSuccess: (created) => {
          onClose();
          onCreated?.(created);
        },
      });
    }
  };

  return (
    <Dialog open onClose={onClose} title={playlist ? 'Edit playlist' : 'New playlist'}>
      <form onSubmit={submit} className="space-y-3">
        <label className="block text-sm">
          <span className="label">Name</span>
          <input className="input" value={name} required maxLength={200} onChange={(event) => setName(event.target.value)} />
        </label>
        <label className="block text-sm">
          <span className="label">Description (optional)</span>
          <textarea
            className="input min-h-[80px]"
            value={description}
            maxLength={2000}
            onChange={(event) => setDescription(event.target.value)}
          />
        </label>
        <div className="flex justify-end gap-2 pt-3">
          <button type="button" onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button type="submit" disabled={pending || !name.trim()} className="btn-primary">
            {pending ? 'Saving…' : playlist ? 'Save' : 'Create'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
