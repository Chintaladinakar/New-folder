import { MagnifyingGlassMinus, MusicNotes, Radio, X } from '@phosphor-icons/react';
import { useSearchParams } from 'react-router-dom';
import { FilterBar, SORT_OPTIONS, formatLabel } from '../components/tracks/FilterBar';
import { TrackListPage } from '../components/tracks/TrackListPage';
import { UploadButton } from '../components/upload/Upload';
import { startRadio } from '../hooks/useLibrary';
import { useIsAdmin } from '../stores/authStore';
import { useSettingsStore } from '../stores/settingsStore';
import type { TrackFilters, TrackSort } from '../types';

export function Library() {
  const [params, setParams] = useSearchParams();
  const isAdmin = useIsAdmin();
  const defaultSortSetting = useSettingsStore((state) => state.defaultSort);
  const get = (key: string) => params.get(key)?.trim() || undefined;
  const number = (key: string) => {
    const value = Number(get(key));
    return Number.isInteger(value) && value > 0 ? value : undefined;
  };
  const sortParam = get('sort');
  const filters: TrackFilters = {
    q: get('q'),
    artist: get('artist'),
    album: get('album'),
    albumArtist: get('albumArtist'),
    genre: get('genre'),
    yearFrom: number('yearFrom'),
    yearTo: number('yearTo'),
    format: get('format'),
    favorite: get('favorite') === 'true' ? true : undefined,
    hasLyrics: get('hasLyrics') === 'true' ? true : undefined,
    sort: SORT_OPTIONS.some(([value]) => value === sortParam) ? (sortParam as TrackSort) : undefined,
    reverse: get('reverse') === 'true' ? true : undefined,
  };
  const scoped = Boolean(filters.q || filters.artist || filters.album);
  const defaultSort: TrackSort = filters.album ? 'album-order' : defaultSortSetting;
  // An artist's own page (not an album or a search within it) gets a radio station.
  const artistOnly = filters.artist && !filters.album && !filters.q ? filters.artist : undefined;

  const update = (changes: Record<string, string | undefined>) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    setParams(next, { replace: true });
  };

  // The title already names the album, artist or search, so only the other filters become chips.
  const chips: [string, string, string[]][] = [];
  if (filters.q && (filters.album || filters.artist)) chips.push(['Search', `“${filters.q}”`, ['q']]);
  if (filters.artist && filters.album) chips.push(['Artist', filters.artist, ['artist']]);
  if (filters.genre) chips.push(['Genre', filters.genre, ['genre']]);
  if (filters.yearFrom) chips.push(['Years', `${filters.yearFrom}–${filters.yearTo ?? ''}`, ['yearFrom', 'yearTo']]);
  if (filters.format) chips.push(['Format', formatLabel(filters.format), ['format']]);

  const title = filters.album ?? filters.artist ?? (filters.q ? `“${filters.q}”` : 'Songs');
  const eyebrow = filters.album ? 'Album' : filters.artist ? 'Artist' : filters.q ? 'Search results' : undefined;

  return (
    <TrackListPage
      title={title}
      eyebrow={eyebrow}
      filters={{ ...filters, sort: filters.sort ?? defaultSort }}
      tabs={!scoped}
      cover={filters.album ? 'album' : filters.artist ? 'artist' : undefined}
      numbering={filters.album && (filters.sort ?? defaultSort) === 'album-order' ? 'trackNumber' : 'index'}
      subtitle={
        chips.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-2">
            {chips.map(([label, value, keys]) => (
              <li key={label} className="max-w-full">
                <button
                  type="button"
                  onClick={() => update(Object.fromEntries(keys.map((key) => [key, undefined])))}
                  className="chip max-w-full pr-2"
                  aria-label={`Remove ${label.toLowerCase()} filter`}
                >
                  <span className="text-faint">{label}</span>
                  <span className="truncate text-fg">{value}</span>
                  <X className="h-3.5 w-3.5 shrink-0" />
                </button>
              </li>
            ))}
          </ul>
        )
      }
      actions={
        artistOnly ? (
          <button type="button" onClick={() => void startRadio({ artist: artistOnly })} className="btn-ghost">
            <Radio weight="bold" className="h-4 w-4" />
            Radio
          </button>
        ) : (
          !scoped && <UploadButton className="btn-ghost" label="Upload" />
        )
      }
      toolbar={<FilterBar filters={filters} defaultSort={defaultSort} onChange={update} />}
      empty={
        scoped || chips.length > 0 || filters.favorite || filters.hasLyrics
          ? { icon: <MagnifyingGlassMinus weight="light" />, title: 'No matches', description: 'Nothing in the library matches these filters.' }
          : isAdmin
            ? {
                icon: <MusicNotes weight="light" />,
                title: 'Your library is empty',
                description: 'Upload music, or drop audio files anywhere on this page.',
                action: <UploadButton />,
              }
            : { icon: <MusicNotes weight="light" />, title: 'Nothing to play yet', description: 'Music shows up here as soon as the admin adds some.' }
      }
    />
  );
}
