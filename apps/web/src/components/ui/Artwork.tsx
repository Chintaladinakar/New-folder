import { MusicNoteSimple } from '@phosphor-icons/react';
import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';

type ArtworkProps = {
  src: string | null | undefined;
  /** Used for the fallback initial; the image itself is decorative next to the visible title. */
  title: string;
  className?: string;
  textClassName?: string;
  /** Rounded square by default; artists use a circle. */
  shape?: 'square' | 'circle';
};

// Muted paper tones for covers without artwork. The title picks one, so a cover keeps its colour.
const HUES = [18, 32, 48, 95, 150, 190, 215, 265, 330];

export function hueFor(title: string): number {
  let hash = 0;
  for (let i = 0; i < title.length; i += 1) hash = (hash * 31 + title.charCodeAt(i)) | 0;
  return HUES[Math.abs(hash) % HUES.length];
}

function ArtworkImage({ src, title, className = '', textClassName = 'text-2xl', shape = 'square' }: ArtworkProps) {
  // Signed URLs expire; an old one in a restored queue fails, and the fallback shows instead.
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const image = useRef<HTMLImageElement>(null);
  const radius = shape === 'circle' ? 'rounded-full' : '';

  // A cover already in the browser's cache shows at once rather than fading in again on every page,
  // which also lets it land in place when it moves into the full player.
  useLayoutEffect(() => {
    if (image.current?.complete && image.current.naturalWidth > 0) setLoaded(true);
  }, []);

  if (src && !failed) {
    return (
      <img
        ref={image}
        src={src}
        alt=""
        loading="lazy"
        decoding="async"
        onLoad={() => setLoaded(true)}
        onError={() => setFailed(true)}
        className={`bg-surface-2 object-cover transition-opacity duration-300 ease-out ${loaded ? 'opacity-100' : 'opacity-0'} ${radius} ${className}`}
      />
    );
  }
  const initial = title.trim()[0];
  return (
    <div
      aria-hidden="true"
      style={{ '--art-h': hueFor(title) } as CSSProperties}
      className={`art-fallback flex select-none items-center justify-center font-display leading-none ${radius} ${className} ${textClassName}`}
    >
      {initial ? initial.toUpperCase() : <MusicNoteSimple weight="light" className="h-[40%] w-[40%]" />}
    </div>
  );
}

export function Artwork(props: ArtworkProps) {
  return <ArtworkImage key={props.src ?? 'none'} {...props} />;
}
