import type { CSSProperties } from 'react';
import type { MixSummary } from '../../types';
import { Artwork, hueFor } from './Artwork';

/**
 * A mix's cover: four of its sleeves as a collage (or one, when that is all it has), darkened at
 * the foot, with the mix's name set over it and a thin band of the accent along the top. The text
 * is sized to the cover (cqw), so the same cover works on a shelf and as a page's sleeve.
 * Decorative: the title is always shown or announced next to it.
 */
export function MixCover({ mix, className = '' }: { mix: Pick<MixSummary, 'title' | 'covers'>; className?: string }) {
  const { title, covers } = mix;
  return (
    <div aria-hidden="true" className={`relative isolate overflow-hidden bg-surface-2 [container-type:inline-size] ${className}`}>
      {covers.length >= 4 ? (
        <div className="absolute inset-0 grid grid-cols-2 grid-rows-2">
          {covers.slice(0, 4).map((url) => (
            <Artwork key={url} src={url} title={title} className="h-full w-full" textClassName="text-[length:20cqw]" />
          ))}
        </div>
      ) : covers.length > 0 ? (
        <Artwork src={covers[0]} title={title} className="absolute inset-0 h-full w-full" textClassName="text-[length:40cqw]" />
      ) : (
        <div className="art-fallback absolute inset-0" style={{ '--art-h': hueFor(title) } as CSSProperties} />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 via-45% to-transparent" />
      <span className="absolute inset-x-0 top-0 h-[max(3px,2.5cqw)] bg-accent" />
      <p className="absolute inset-x-0 bottom-0 p-[7cqw] font-display text-[length:14cqw] leading-[0.92] text-white [text-wrap:balance]">{title}</p>
    </div>
  );
}
