import { ArrowsDownUp, CaretDown, Funnel, Heart, SortAscending, SortDescending, Subtitles, X } from '@phosphor-icons/react';
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { useFacets } from '../../hooks/useLibrary';
import { fadeUp } from '../../lib/motion';
import type { LibraryFacets, TrackFilters, TrackSort } from '../../types';
import { Menu } from '../ui/Menu';

export const SORT_OPTIONS: [TrackSort, string][] = [
  ['recent', 'Recently added'],
  ['title', 'Title'],
  ['artist', 'Artist'],
  ['album', 'Album'],
  ['year', 'Year'],
  ['duration', 'Duration'],
  ['plays', 'Most played'],
  ['played', 'Recently played'],
  ['album-order', 'Track number'],
];

const FORMAT_LABELS: Record<string, string> = {
  'audio/mpeg': 'MP3',
  'audio/flac': 'FLAC',
  'audio/mp4': 'M4A / AAC',
  'audio/aac': 'AAC',
  'audio/ogg': 'OGG / Opus',
  'audio/wav': 'WAV',
  'audio/webm': 'WebM',
};

export const formatLabel = (mimeType: string) => FORMAT_LABELS[mimeType] ?? mimeType.replace('audio/', '').toUpperCase();

/** Decade buckets covering the library's year range, newest first. */
export function decadesFor(facets: LibraryFacets | undefined): [number, number][] {
  if (!facets?.yearMin || !facets.yearMax) return [];
  const decades: [number, number][] = [];
  for (let start = Math.floor(facets.yearMax / 10) * 10; start >= Math.floor(facets.yearMin / 10) * 10; start -= 10) {
    decades.push([start, start + 9]);
  }
  return decades;
}

type FilterBarProps = {
  filters: TrackFilters;
  defaultSort: TrackSort;
  onChange: (changes: Partial<Record<keyof TrackFilters, string | undefined>>) => void;
};

/** Counts inside chips: quieter than the label, and readable on the inverted (selected) chip too. */
const Count = ({ value }: { value: number }) => <span className="font-mono text-[10px] opacity-60">{value}</span>;

export function FilterBar({ filters, defaultSort, onChange }: FilterBarProps) {
  const facets = useFacets();
  const [open, setOpen] = useState(Boolean(filters.genre || filters.yearFrom || filters.format || filters.hasLyrics));
  const sort = filters.sort ?? defaultSort;
  const decades = decadesFor(facets.data);
  const activeDecade = decades.find(([from, to]) => filters.yearFrom === from && filters.yearTo === to);
  const advancedCount = [filters.genre, filters.yearFrom, filters.format, filters.hasLyrics].filter(Boolean).length;

  const toggle = (key: keyof TrackFilters, value: string | undefined, active: boolean) => onChange({ [key]: active ? undefined : value });

  return (
    <div className="mb-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Menu
          align="left"
          label="Sort"
          className="chip"
          items={SORT_OPTIONS.map(([value, label]) => ({
            label,
            checked: value === sort,
            onSelect: () => onChange({ sort: value === defaultSort ? undefined : value, reverse: undefined }),
          }))}
        >
          <ArrowsDownUp className="h-3.5 w-3.5" />
          {SORT_OPTIONS.find(([value]) => value === sort)?.[1]}
          <CaretDown className="h-3 w-3 opacity-60" />
        </Menu>
        <button
          type="button"
          className="chip w-8 justify-center px-0"
          aria-label={filters.reverse ? 'Sorted in reverse; click for natural order' : 'Natural order; click to reverse'}
          aria-pressed={Boolean(filters.reverse)}
          onClick={() => onChange({ reverse: filters.reverse ? undefined : 'true' })}
        >
          {filters.reverse ? <SortDescending className="h-3.5 w-3.5" /> : <SortAscending className="h-3.5 w-3.5" />}
        </button>

        <span className="mx-1 hidden h-4 w-px bg-edge sm:block" />

        <button type="button" className="chip" aria-pressed={filters.favorite === true} onClick={() => toggle('favorite', 'true', filters.favorite === true)}>
          <Heart weight={filters.favorite ? 'fill' : 'regular'} className="h-3.5 w-3.5" />
          Favorites
        </button>
        <button type="button" className="chip" aria-pressed={open} aria-expanded={open} aria-controls="filter-panel" onClick={() => setOpen(!open)}>
          <Funnel weight={advancedCount ? 'fill' : 'regular'} className="h-3.5 w-3.5" />
          Filters
          {advancedCount > 0 && <span className="rounded bg-accent px-1 font-mono text-[10px] leading-4 text-accent-fg">{advancedCount}</span>}
        </button>
        {advancedCount > 0 && (
          <button
            type="button"
            className="chip border-transparent"
            onClick={() => onChange({ genre: undefined, yearFrom: undefined, yearTo: undefined, format: undefined, hasLyrics: undefined })}
          >
            <X className="h-3.5 w-3.5" />
            Clear
          </button>
        )}
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div id="filter-panel" variants={fadeUp} initial="hidden" animate="visible" exit="exit" className="space-y-4 border-y border-edge py-5">
            <FilterGroup label="Genre">
              {facets.data?.genres.length ? (
                facets.data.genres.slice(0, 24).map((genre) => (
                  <button
                    key={genre.name}
                    type="button"
                    className="chip"
                    aria-pressed={filters.genre === genre.name}
                    onClick={() => toggle('genre', genre.name, filters.genre === genre.name)}
                  >
                    {genre.name}
                    <Count value={genre.count} />
                  </button>
                ))
              ) : (
                <span className="py-1.5 text-xs text-faint">No genre tags in your library yet.</span>
              )}
            </FilterGroup>

            <FilterGroup label="Decade">
              {decades.length ? (
                decades.map(([from, to]) => (
                  <button
                    key={from}
                    type="button"
                    className="chip font-mono"
                    aria-pressed={activeDecade?.[0] === from}
                    onClick={() =>
                      activeDecade?.[0] === from ? onChange({ yearFrom: undefined, yearTo: undefined }) : onChange({ yearFrom: String(from), yearTo: String(to) })
                    }
                  >
                    {from}s
                  </button>
                ))
              ) : (
                <span className="py-1.5 text-xs text-faint">No year tags in your library yet.</span>
              )}
            </FilterGroup>

            <FilterGroup label="Format">
              {facets.data?.formats.map((format) => (
                <button
                  key={format.mimeType}
                  type="button"
                  className="chip"
                  aria-pressed={filters.format === format.mimeType}
                  onClick={() => toggle('format', format.mimeType, filters.format === format.mimeType)}
                >
                  {formatLabel(format.mimeType)}
                  <Count value={format.count} />
                </button>
              ))}
            </FilterGroup>

            <FilterGroup label="More">
              <button type="button" className="chip" aria-pressed={filters.hasLyrics === true} onClick={() => toggle('hasLyrics', 'true', filters.hasLyrics === true)}>
                <Subtitles className="h-3.5 w-3.5" />
                With lyrics
              </button>
            </FilterGroup>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-2 sm:grid-cols-[5rem_minmax(0,1fr)] sm:items-start">
      <span className="pt-1.5 text-xs font-medium text-faint">{label}</span>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}
