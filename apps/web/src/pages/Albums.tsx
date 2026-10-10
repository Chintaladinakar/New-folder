import { MagnifyingGlass, MicrophoneStage, VinylRecord } from '@phosphor-icons/react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Artwork } from '../components/ui/Artwork';
import { Segmented } from '../components/ui/Controls';
import { EmptyState, ErrorState } from '../components/ui/EmptyState';
import { PageHeader } from '../components/ui/PageHeader';
import { useAlbums, useArtists } from '../hooks/useLibrary';
import { formatLongDuration, pluralize } from '../lib/format';
import type { Artist } from '../types';
import { usePageTitle } from '../hooks/usePageTitle';

const gridClass = 'stagger grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-[repeat(auto-fill,minmax(168px,1fr))] sm:gap-x-6 sm:gap-y-10';

function GridSkeleton() {
  return (
    <div className={gridClass} role="status" aria-label="Loading">
      {Array.from({ length: 10 }, (_, i) => (
        <div key={i} className="space-y-3">
          <div className="aspect-square animate-pulse rounded-md bg-surface-2" style={{ animationDelay: `${i * 50}ms` }} />
          <div className="h-3 w-3/4 animate-pulse rounded bg-surface-2" />
          <div className="h-2.5 w-1/2 animate-pulse rounded bg-surface-2/70" />
        </div>
      ))}
    </div>
  );
}

export function CollectionToolbar<T extends string>({
  query,
  onQuery,
  sort,
  sorts,
  onSort,
  placeholder,
}: {
  query: string;
  onQuery: (value: string) => void;
  sort?: T;
  sorts?: { value: T; label: string }[];
  onSort?: (value: T) => void;
  placeholder: string;
}) {
  return (
    <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="relative sm:w-72">
        <MagnifyingGlass className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
        <input type="search" value={query} onChange={(event) => onQuery(event.target.value)} placeholder={placeholder} aria-label={placeholder} className="input h-9 py-0 pl-9" />
      </div>
      {sort && sorts && onSort && (
        <div className="flex items-center gap-3">
          <span className="text-xs text-faint">Sort</span>
          <Segmented value={sort} options={sorts} onChange={onSort} label="Sort" />
        </div>
      )}
    </div>
  );
}

type AlbumSort = 'name' | 'artist' | 'year' | 'tracks';

export function Albums() {
  usePageTitle('Albums');
  const albums = useAlbums();
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<AlbumSort>('name');

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const list = (albums.data ?? []).filter(
      (album) => !needle || album.name.toLowerCase().includes(needle) || album.artist?.toLowerCase().includes(needle),
    );
    const by: Record<AlbumSort, (a: (typeof list)[number], b: (typeof list)[number]) => number> = {
      name: (a, b) => a.name.localeCompare(b.name),
      artist: (a, b) => (a.artist ?? '').localeCompare(b.artist ?? '') || a.name.localeCompare(b.name),
      year: (a, b) => (b.year ?? 0) - (a.year ?? 0) || a.name.localeCompare(b.name),
      tracks: (a, b) => b.trackCount - a.trackCount || a.name.localeCompare(b.name),
    };
    return [...list].sort(by[sort]);
  }, [albums.data, query, sort]);

  return (
    <div className="page">
      <PageHeader title="Albums" meta={albums.data && <span className="font-mono text-xs">{pluralize(albums.data.length, 'album')}</span>} />
      <CollectionToolbar
        query={query}
        onQuery={setQuery}
        sort={sort}
        onSort={setSort}
        placeholder="Filter albums"
        sorts={[
          { value: 'name', label: 'Name' },
          { value: 'artist', label: 'Artist' },
          { value: 'year', label: 'Year' },
          { value: 'tracks', label: 'Tracks' },
        ]}
      />
      {albums.isLoading ? (
        <GridSkeleton />
      ) : albums.error ? (
        <ErrorState error={albums.error} onRetry={() => void albums.refetch()} />
      ) : !albums.data?.length ? (
        <EmptyState icon={<VinylRecord weight="light" />} title="No albums yet" description="Albums appear once the library has tracks with album tags." />
      ) : visible.length === 0 ? (
        <EmptyState icon={<MagnifyingGlass weight="light" />} title="No matches" description="No album matches that search." />
      ) : (
        <ul className={gridClass}>
          {visible.map((album, index) => {
            const params = new URLSearchParams({ album: album.name });
            if (album.artist) params.set('albumArtist', album.artist);
            const facts = [album.year, pluralize(album.trackCount, 'track'), album.duration > 0 && formatLongDuration(album.duration)].filter(Boolean);
            return (
              <li key={`${album.name}\u0000${album.artist ?? ''}`} style={{ animationDelay: `${Math.min(index, 12) * 25}ms` }}>
                <Link to={`/library?${params}`} className="group block focus-visible:outline-none">
                  <div className="mb-3 overflow-hidden rounded-md shadow-cover transition-transform duration-300 ease-out group-hover:-translate-y-1 group-focus-visible:ring-2 group-focus-visible:ring-accent">
                    <Artwork src={album.artworkUrl} title={album.name} className="aspect-square w-full" textClassName="text-7xl" />
                  </div>
                  <div className="line-clamp-2 text-[15px] font-medium leading-snug [overflow-wrap:anywhere]">{album.name}</div>
                  <div className="mt-1 truncate text-sm text-muted">{album.artist ?? 'Unknown artist'}</div>
                  <div className="mt-1 truncate font-mono text-[11px] text-faint">{facts.join(' · ')}</div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

type ArtistSort = 'name' | 'tracks' | 'albums';

/** The letter an artist files under: accents folded (É → E), anything that isn't a letter under "#". */
function initialOf(name: string): string {
  const first = name.trim().normalize('NFD')[0]?.toUpperCase() ?? '#';
  return /\p{L}/u.test(first) ? first : '#';
}

function ArtistRow({ artist, rank }: { artist: Artist; rank?: number }) {
  return (
    <Link to={`/library?artist=${encodeURIComponent(artist.name)}`} className="row-hover group -mx-2 flex items-center gap-4 rounded-lg px-2 py-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
      {rank !== undefined && <span className="w-6 shrink-0 text-right font-mono text-[11px] text-faint">{String(rank).padStart(2, '0')}</span>}
      <Artwork src={artist.artworkUrl} title={artist.name} shape="circle" className="h-12 w-12 shrink-0 shadow-lift" textClassName="text-2xl" />
      <span className="min-w-0">
        <span className="block truncate font-medium">{artist.name}</span>
        <span className="block truncate font-mono text-[11px] text-faint">
          {pluralize(artist.albumCount, 'album')} · {pluralize(artist.trackCount, 'track')}
        </span>
      </span>
    </Link>
  );
}

const directoryGrid = 'grid gap-x-8 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4';

export function Artists() {
  usePageTitle('Artists');
  const artists = useArtists();
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<ArtistSort>('name');

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const list = (artists.data ?? []).filter((artist) => !needle || artist.name.toLowerCase().includes(needle));
    const by: Record<ArtistSort, (a: Artist, b: Artist) => number> = {
      name: (a, b) => a.name.localeCompare(b.name),
      tracks: (a, b) => b.trackCount - a.trackCount || a.name.localeCompare(b.name),
      albums: (a, b) => b.albumCount - a.albumCount || a.name.localeCompare(b.name),
    };
    return [...list].sort(by[sort]);
  }, [artists.data, query, sort]);

  // By name, the list reads like an index: one group per letter.
  const groups = useMemo(() => {
    if (sort !== 'name') return [];
    const byLetter = new Map<string, Artist[]>();
    for (const artist of visible) {
      const letter = initialOf(artist.name);
      const group = byLetter.get(letter);
      if (group) group.push(artist);
      else byLetter.set(letter, [artist]);
    }
    return [...byLetter];
  }, [visible, sort]);

  return (
    <div className="page">
      <PageHeader title="Artists" meta={artists.data && <span className="font-mono text-xs">{pluralize(artists.data.length, 'artist')}</span>} />
      <CollectionToolbar
        query={query}
        onQuery={setQuery}
        sort={sort}
        onSort={setSort}
        placeholder="Filter artists"
        sorts={[
          { value: 'name', label: 'A–Z' },
          { value: 'tracks', label: 'Tracks' },
          { value: 'albums', label: 'Albums' },
        ]}
      />
      {artists.isLoading ? (
        <div className={directoryGrid} role="status" aria-label="Loading">
          {Array.from({ length: 9 }, (_, i) => (
            <div key={i} className="flex items-center gap-4 py-2.5">
              <div className="h-12 w-12 animate-pulse rounded-full bg-surface-2" />
              <div className="h-3 w-1/2 animate-pulse rounded bg-surface-2" />
            </div>
          ))}
        </div>
      ) : artists.error ? (
        <ErrorState error={artists.error} onRetry={() => void artists.refetch()} />
      ) : !artists.data?.length ? (
        <EmptyState icon={<MicrophoneStage weight="light" />} title="No artists yet" description="Artists appear once the library has tracks with artist tags." />
      ) : visible.length === 0 ? (
        <EmptyState icon={<MagnifyingGlass weight="light" />} title="No matches" description="No artist matches that search." />
      ) : sort === 'name' ? (
        // Like the index of a book: the letter in the margin, its names beside it, one rule per letter.
        <div className="border-b border-edge">
          {groups.map(([letter, members]) => (
            <section
              key={letter}
              aria-label={letter === '#' ? 'Other' : letter}
              className="animate-fade-up grid grid-cols-[2.5rem_minmax(0,1fr)] gap-x-4 border-t border-edge py-2 sm:grid-cols-[4.5rem_minmax(0,1fr)]"
            >
              <h2 className="pt-3.5 font-display text-3xl leading-none sm:text-4xl">{letter}</h2>
              <ul className={directoryGrid}>
                {members.map((artist) => (
                  <li key={artist.name}>
                    <ArtistRow artist={artist} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      ) : (
        <ol className={`stagger ${directoryGrid}`}>
          {visible.map((artist, index) => (
            <li key={artist.name} style={{ animationDelay: `${Math.min(index, 12) * 25}ms` }}>
              <ArtistRow artist={artist} rank={index + 1} />
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
