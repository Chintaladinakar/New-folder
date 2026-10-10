import type { CSSProperties } from 'react';
import { hueFor } from './Artwork';

/** An account's initial on a muted tone picked from its name, like a cover without artwork. */
export function Avatar({ name, className = 'h-10 w-10 text-xl' }: { name: string; className?: string }) {
  return (
    <span
      aria-hidden="true"
      style={{ '--art-h': hueFor(name) } as CSSProperties}
      className={`art-fallback flex shrink-0 select-none items-center justify-center rounded-full font-display leading-none ${className}`}
    >
      {/* The first character, not the first UTF-16 unit, so an emoji or a rare script survives. */}
      {Array.from(name.trim())[0]?.toUpperCase() ?? '?'}
    </span>
  );
}
