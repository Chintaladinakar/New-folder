import type { ReactNode } from 'react';

type PageHeaderProps = {
  /** A short label above the title, e.g. "Album". */
  eyebrow?: ReactNode;
  title: string;
  /** Facts under the title: counts, durations, filter chips. */
  meta?: ReactNode;
  actions?: ReactNode;
  /** Artwork beside the title, for albums, artists and playlists. */
  cover?: ReactNode;
};

/** The masthead every page opens with: a large serif title over a line of facts. */
export function PageHeader({ eyebrow, title, meta, actions, cover }: PageHeaderProps) {
  const text = (
    <>
      {eyebrow && <p className="mb-3 text-sm font-medium text-muted">{eyebrow}</p>}
      <h1
        className={`font-display leading-[0.95] tracking-[-0.01em] [overflow-wrap:anywhere] ${
          cover ? 'text-[length:clamp(2.5rem,5vw,4.5rem)]' : 'text-[length:clamp(2.75rem,6vw,5.25rem)]'
        }`}
      >
        {title}
      </h1>
      {meta && <div className="mt-4 text-sm text-muted">{meta}</div>}
    </>
  );

  if (cover) {
    return (
      <header className="mb-8 flex flex-col gap-6 sm:flex-row sm:items-end sm:gap-8 md:mb-10">
        <div className="shrink-0">{cover}</div>
        <div className="min-w-0 flex-1">
          {text}
          {actions && <div className="mt-6 flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      </header>
    );
  }

  return (
    <header className="mb-8 flex flex-col gap-6 md:mb-10 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">{text}</div>
      {actions && <div className="flex flex-wrap items-center gap-2 md:pb-1">{actions}</div>}
    </header>
  );
}
