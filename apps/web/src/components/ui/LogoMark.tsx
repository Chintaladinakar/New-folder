/** The app's mark: a record label, drawn in the current accent colour. */
export function LogoMark({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={className}>
      <circle cx="16" cy="16" r="16" className="fill-current" />
      <circle cx="16" cy="16" r="11" className="fill-none stroke-base/30" />
      <circle cx="16" cy="16" r="7.5" className="fill-none stroke-base/30" />
      <circle cx="16" cy="16" r="2.5" className="fill-base" />
    </svg>
  );
}
