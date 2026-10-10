export type LyricLine = {
  time: number;
  text: string;
  /** Word timings from enhanced LRC (`<mm:ss.xx>word`), when the file has them. */
  words?: { time: number; text: string }[];
  /** When the last word ends, from a trailing enhanced-LRC stamp. */
  end?: number;
};

const TIME_TAG = /\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g;
const WORD_TAG = /<(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?>/g;

const seconds = (minutes: string, secs: string, fraction = '0') =>
  Number(minutes) * 60 + Number(secs) + Number(fraction.padEnd(3, '0').slice(0, 3)) / 1000;

/** Splits enhanced-LRC content into timed words; null when the line has no word stamps. */
function parseWords(content: string): Pick<LyricLine, 'words' | 'end'> | null {
  const stamps = [...content.matchAll(WORD_TAG)];
  if (stamps.length === 0) return null;
  const words: { time: number; text: string }[] = [];
  let end: number | undefined;
  stamps.forEach((stamp, index) => {
    const from = stamp.index! + stamp[0].length;
    const to = index + 1 < stamps.length ? stamps[index + 1].index! : content.length;
    const text = content.slice(from, to).trim();
    const time = seconds(stamp[1], stamp[2], stamp[3]);
    // A stamp with nothing after it marks where the previous word ends.
    if (text) words.push({ time, text });
    else if (words.length > 0) end = time;
  });
  return words.length > 0 ? { words, end } : null;
}

/** Parses LRC text into lines sorted by time. Lines that share a timestamp are kept in order. */
export function parseLrc(text: string): LyricLine[] {
  const lines: LyricLine[] = [];
  for (const raw of text.split('\n')) {
    const stamps = [...raw.matchAll(TIME_TAG)];
    if (stamps.length === 0) continue;
    const content = raw.replace(TIME_TAG, '').trim();
    // Word stamps belong to one performance of the line, so a line repeated under several stamps keeps none.
    const timed = stamps.length === 1 ? parseWords(content) : null;
    const plain = content.replace(WORD_TAG, ' ').replace(/\s+/g, ' ').trim();
    for (const [, minutes, secs, fraction] of stamps) {
      const line: LyricLine = { time: seconds(minutes, secs, fraction), text: plain };
      if (timed) Object.assign(line, timed.end === undefined ? { words: timed.words } : timed);
      lines.push(line);
    }
  }
  return lines.sort((a, b) => a.time - b.time);
}

/** Index of the line that should be highlighted at `time`, or -1 before the first line. */
export function activeLineIndex(lines: { time: number }[], time: number): number {
  let low = 0;
  let high = lines.length - 1;
  let result = -1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (lines[mid].time <= time) {
      result = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return result;
}

export type LyricWord = { text: string; start: number; end: number };

/** What the lyrics view shows: sung lines, and the instrumental breaks between them. */
export type LyricItem = { kind: 'line'; time: number; end: number; text: string; words: LyricWord[] } | { kind: 'break'; time: number; end: number };

/** Breaks shorter than this aren't worth a row of dots. */
const MIN_BREAK = 3;
/** Roughly how long a sung character takes, when the file only times whole lines. */
const SECONDS_PER_CHAR = 0.075;

/**
 * Times every word, so the current line can fill in as it's sung. Enhanced LRC has real word
 * times; plain LRC only times lines, so each line's words share an estimated singing span by length.
 * Empty lines and a long intro become breaks.
 */
export function buildLyricItems(lines: LyricLine[]): LyricItem[] {
  const items: LyricItem[] = [];
  if (lines.length > 0 && lines[0].time >= MIN_BREAK) items.push({ kind: 'break', time: 0, end: lines[0].time });

  lines.forEach((line, index) => {
    const next = lines[index + 1]?.time;
    const room = next === undefined ? Infinity : Math.max(0, next - line.time);
    if (!line.text) {
      if (room >= MIN_BREAK && room !== Infinity) items.push({ kind: 'break', time: line.time, end: next! });
      return;
    }
    const words = line.words ? timedWords(line, room) : estimatedWords(line, room);
    items.push({ kind: 'line', time: line.time, end: words[words.length - 1].end, text: line.text, words });
  });
  return items;
}

function timedWords(line: LyricLine, room: number): LyricWord[] {
  const words = line.words!;
  const lineEnd = line.time + room;
  return words.map((word, index) => {
    const following = words[index + 1]?.time ?? line.end ?? Math.min(lineEnd, word.time + Math.max(0.4, word.text.length * SECONDS_PER_CHAR * 2));
    return { text: word.text, start: word.time, end: Math.max(word.time + 0.05, following) };
  });
}

function estimatedWords(line: LyricLine, room: number): LyricWord[] {
  const texts = line.text.split(/\s+/);
  // A word costs its letters plus a beat for the gap after it.
  const weights = texts.map((text) => text.length + 1);
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  const span = Math.min(room * 0.9, Math.max(1.2, total * SECONDS_PER_CHAR));
  let start = line.time;
  return texts.map((text, index) => {
    const length = (span * weights[index]) / total;
    const word = { text, start, end: start + Math.max(0.05, length) };
    start += length;
    return word;
  });
}
