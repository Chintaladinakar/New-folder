export type RepeatMode = 'off' | 'all' | 'one';

export function identityOrder(length: number): number[] {
  return Array.from({ length }, (_, index) => index);
}

/** A random play order of `length` items; `first`, when given, stays at the front. */
export function shuffleOrder(length: number, first: number | null, random: () => number = Math.random): number[] {
  const rest = identityOrder(length).filter((index) => index !== first);
  for (let i = rest.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  return first === null || first < 0 || first >= length ? rest : [first, ...rest];
}

/** The next position in the play order, or null at the end of the queue. */
export function nextPosition(position: number, length: number, repeat: RepeatMode): number | null {
  if (length === 0) return null;
  if (position + 1 < length) return position + 1;
  return repeat === 'off' ? null : 0;
}

export function previousPosition(position: number, length: number, repeat: RepeatMode): number | null {
  if (length === 0) return null;
  if (position > 0) return position - 1;
  return repeat === 'off' ? null : length - 1;
}
