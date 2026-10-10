import { describe, expect, it } from 'vitest';
import { activeLineIndex, buildLyricItems, parseLrc } from './lrc';

describe('LRC parsing', () => {
  it('parses timestamps, metadata-free lines and repeated stamps', () => {
    const lines = parseLrc('[ar:Someone]\n[00:12.00]First\n[00:17.5]Second\n[01:02.123][00:30.00]Chorus\n\nplain text ignored');
    expect(lines).toEqual([
      { time: 12, text: 'First' },
      { time: 17.5, text: 'Second' },
      { time: 30, text: 'Chorus' },
      { time: 62.123, text: 'Chorus' },
    ]);
  });

  it('finds the line for a time', () => {
    const lines = parseLrc('[00:10.00]A\n[00:20.00]B\n[00:30.00]C');
    expect(activeLineIndex(lines, 5)).toBe(-1);
    expect(activeLineIndex(lines, 10)).toBe(0);
    expect(activeLineIndex(lines, 25)).toBe(1);
    expect(activeLineIndex(lines, 99)).toBe(2);
    expect(activeLineIndex([], 5)).toBe(-1);
  });
});

describe('enhanced LRC and lyric items', () => {
  it('reads word stamps, and keeps the plain text for display', () => {
    const [line] = parseLrc('[00:10.00]<00:10.00>Hello <00:10.60>there <00:11.40>friend<00:12.20>');
    expect(line.text).toBe('Hello there friend');
    expect(line.words).toEqual([
      { time: 10, text: 'Hello' },
      { time: 10.6, text: 'there' },
      { time: 11.4, text: 'friend' },
    ]);
    expect(line.end).toBe(12.2);
  });

  it('uses real word times when the file has them', () => {
    const items = buildLyricItems(parseLrc('[00:10.00]<00:10.00>Hello <00:10.60>there<00:11.00>\n[00:14.00]Next'));
    expect(items[1]).toMatchObject({
      kind: 'line',
      end: 11,
      words: [
        { text: 'Hello', start: 10, end: 10.6 },
        { text: 'there', start: 10.6, end: 11 },
      ],
    });
  });

  it('spreads plain lines over an estimated singing span, inside the gap to the next line', () => {
    const items = buildLyricItems(parseLrc('[00:01.00]one two three four\n[00:02.00]next'));
    const first = items[0];
    expect(first.kind).toBe('line');
    if (first.kind !== 'line') return;
    expect(first.words.map((word) => word.text)).toEqual(['one', 'two', 'three', 'four']);
    expect(first.words[0].start).toBe(1);
    // Words follow each other without gaps, and stay inside the second until the next line.
    first.words.slice(1).forEach((word, index) => expect(word.start).toBeCloseTo(first.words[index].end));
    expect(first.end).toBeLessThanOrEqual(2);
  });

  it('turns a long intro and empty lines into breaks, and drops short ones', () => {
    const items = buildLyricItems(parseLrc('[00:05.00]Start\n[00:07.00]\n[00:15.00]After the solo\n[00:16.00]\n[00:17.00]Close'));
    expect(items.map((item) => [item.kind, item.time, item.end])).toEqual([
      ['break', 0, 5],
      ['line', 5, items[1].end],
      ['break', 7, 15],
      ['line', 15, items[3].end],
      ['line', 17, items[4].end],
    ]);
  });

  it('keeps no word times for a line sung several times', () => {
    const lines = parseLrc('[00:10.00][00:30.00]<00:10.00>Chorus <00:10.50>again');
    expect(lines.map((line) => line.words)).toEqual([undefined, undefined]);
    expect(lines[1].text).toBe('Chorus again');
  });
});
