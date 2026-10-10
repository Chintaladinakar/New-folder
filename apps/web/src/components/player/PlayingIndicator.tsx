import { useSettingsStore } from '../../stores/settingsStore';

/** "This one is playing" marker for track rows. The style is a user setting. */
export function PlayingIndicator({ paused = false, className = '' }: { paused?: boolean; className?: string }) {
  const style = useSettingsStore((state) => state.playingAnimation);

  if (style === 'none' || paused) {
    return (
      <span role="img" aria-label={paused ? 'Paused' : 'Playing'} className={`inline-flex items-center justify-center ${className}`}>
        <span className="h-2 w-2 rounded-full bg-accent" />
      </span>
    );
  }

  if (style === 'pulse') {
    return (
      <span role="img" aria-label="Playing" className={`inline-flex items-center justify-center ${className}`}>
        <span className="h-2.5 w-2.5 animate-pulse2 rounded-full bg-accent" />
      </span>
    );
  }

  return (
    <span role="img" aria-label="Playing" className={`inline-flex h-3.5 items-end gap-[2px] ${className}`}>
      {[0, 180, 90, 270].map((delay) => (
        <span
          key={delay}
          className="h-full w-[3px] origin-bottom animate-equalizer rounded-sm bg-accent"
          style={{ animationDelay: `-${delay}ms` }}
        />
      ))}
    </span>
  );
}
