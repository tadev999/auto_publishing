import { describe, expect, it } from 'vitest';
import {
  markEmphasis,
  paginate,
  spokenText,
  wordsFromAlignment,
} from '../src/captions.js';
import { Beat } from '../src/schemas.js';

const BEATS: Beat[] = [
  { role: 'hook', text: 'Bạn ngủ đủ', emphasis: [] },
  { role: 'step', text: 'Thở chậm ba lần.', emphasis: ['thở chậm'] },
  { role: 'step', text: 'Gọi tên nó, không cần sửa.', emphasis: [] },
];

function uniformAlignment(text: string, perChar = 0.05): [number[], number[]] {
  const starts = Array.from({ length: text.length }, (_, i) => i * perChar);
  const ends = starts.map((s) => s + perChar);
  return [starts, ends];
}

describe('captions', () => {
  it('spokenText adds terminal punctuation and spans', () => {
    const [text, spans] = spokenText(BEATS);
    expect(text.startsWith('Bạn ngủ đủ. Thở')).toBe(true);
    for (let i = 0; i < BEATS.length; i++) {
      const [s, e] = spans[i];
      const beat = BEATS[i];
      expect(text.slice(s, e).replace(/\.+$/, '')).toBe(beat.text.replace(/\.+$/, ''));
    }
  });

  it('words carry beat index and timing', () => {
    const [text, spans] = spokenText(BEATS);
    const [starts, ends] = uniformAlignment(text);
    const words = wordsFromAlignment(text, starts, ends, spans);
    expect(words.slice(0, 3).map((w) => w.text)).toEqual(['Bạn', 'ngủ', 'đủ.']);
    expect(new Set(words.map((w) => w.beat))).toEqual(new Set([0, 1, 2]));
    expect(words.every((w) => w.end > w.start)).toBe(true);
  });

  it('emphasis is marked within its beat only', () => {
    const [text, spans] = spokenText(BEATS);
    const [starts, ends] = uniformAlignment(text);
    const words = wordsFromAlignment(text, starts, ends, spans);
    markEmphasis(words, BEATS);
    expect(words.filter((w) => w.emphasis).map((w) => w.text)).toEqual(['Thở', 'chậm']);
  });

  it('pages never cross beats and number steps', () => {
    const [text, spans] = spokenText(BEATS);
    const [starts, ends] = uniformAlignment(text);
    const words = wordsFromAlignment(text, starts, ends, spans);
    const pages = paginate(words, BEATS, 10.0);

    for (const p of pages) {
      expect(new Set(p.words.map((w) => w.beat)).size).toBe(1);
    }
    const stepPages = pages.filter((p) => p.role === 'step');
    expect(stepPages[0].step).toBe(1);
    expect(Math.max(...stepPages.map((p) => p.step || 0))).toBe(2);

    for (let i = 0; i < pages.length - 1; i++) {
      expect(pages[i].end).toBe(pages[i + 1].start);
    }
    expect(pages[pages.length - 1].end).toBe(10.0);
  });

  it('long beat is split into short pages', () => {
    const beats: Beat[] = [
      {
        role: 'line',
        text: Array.from({ length: 20 }, (_, i) => `từ${i}`).join(' '),
        emphasis: [],
      },
    ];
    const [text, spans] = spokenText(beats);
    const [starts, ends] = uniformAlignment(text);
    const words = wordsFromAlignment(text, starts, ends, spans);
    const pages = paginate(words, beats, 5.0, 7);

    expect(pages.every((p) => p.words.length <= 7)).toBe(true);
    expect(pages.reduce((acc, p) => acc + p.words.length, 0)).toBe(20);
  });
});
