import { describe, expect, it } from 'vitest';
import { isSupportedAudioFile } from './constants';
import { formatBytes, formatDuration, formatLongDuration, greeting } from './format';
import { identityOrder, nextPosition, previousPosition, shuffleOrder } from './queue';

describe('queue helpers', () => {
  it('keeps the chosen track first when shuffling and includes every track once', () => {
    for (let run = 0; run < 20; run += 1) {
      const order = shuffleOrder(10, 4);
      expect(order[0]).toBe(4);
      expect([...order].sort((a, b) => a - b)).toEqual(identityOrder(10));
    }
    expect(shuffleOrder(0, null)).toEqual([]);
  });

  it('stops at the ends unless repeat is on', () => {
    expect(nextPosition(1, 3, 'off')).toBe(2);
    expect(nextPosition(2, 3, 'off')).toBeNull();
    expect(nextPosition(2, 3, 'all')).toBe(0);
    expect(previousPosition(0, 3, 'off')).toBeNull();
    expect(previousPosition(0, 3, 'all')).toBe(2);
    expect(nextPosition(0, 0, 'all')).toBeNull();
  });
});

describe('formatting', () => {
  it('formats durations', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(187.9)).toBe('3:07');
    expect(formatDuration(3725)).toBe('1:02:05');
    expect(formatDuration(null)).toBe('--:--');
    expect(formatDuration(Number.NaN)).toBe('--:--');
    expect(formatLongDuration(8040)).toBe('2 hr 14 min');
    expect(formatLongDuration(45)).toBe('45 sec');
  });

  it('formats sizes and greetings', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(250 * 1024 * 1024)).toBe('250 MB');
    expect(greeting(new Date(2026, 0, 1, 9))).toBe('Good morning');
    expect(greeting(new Date(2026, 0, 1, 21))).toBe('Good evening');
  });

  it('recognises supported audio files', () => {
    expect(isSupportedAudioFile('song.MP3')).toBe(true);
    expect(isSupportedAudioFile('song.flac')).toBe(true);
    expect(isSupportedAudioFile('notes.txt')).toBe(false);
    expect(isSupportedAudioFile('mp3')).toBe(false);
  });
});
