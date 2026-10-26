export interface Word {
  text: string;
  start: number;
  end: number;
  beat: number;
  emphasis?: boolean;
}

export interface Page {
  beat: number;
  role: string;
  start: number;
  end: number;
  words: Word[];
  step: number | null;
}

const WORD_STRIP = /^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu;
const SENTENCE_END = /[.!?…:;,—]$/;

export function spokenText(beats: Array<{ text: string }>): [string, Array<[number, number]>] {
  const parts: string[] = [];
  const spans: Array<[number, number]> = [];
  let cursor = 0;

  for (const beat of beats) {
    let text = beat.text.trim();
    if (text && !/[.!?…]$/.test(text)) {
      text += '.';
    }
    if (parts.length > 0) {
      parts.push(' ');
      cursor += 1;
    }
    spans.push([cursor, cursor + text.length]);
    parts.push(text);
    cursor += text.length;
  }

  return [parts.join(''), spans];
}

export function wordsFromAlignment(
  text: string,
  starts: number[],
  ends: number[],
  spans: Array<[number, number]>
): Word[] {
  if (text.length !== starts.length || starts.length !== ends.length) {
    throw new Error('Alignment length does not match text length');
  }

  function beatOf(idx: number): number {
    for (let b = 0; b < spans.length; b++) {
      const [s, e] = spans[b];
      if (idx >= s && idx < e) {
        return b;
      }
    }
    return spans.length - 1;
  }

  const words: Word[] = [];
  let i = 0;
  while (i < text.length) {
    if (/\s/.test(text[i])) {
      i++;
      continue;
    }
    let j = i;
    while (j < text.length && !/\s/.test(text[j])) {
      j++;
    }
    words.push({
      text: text.slice(i, j),
      start: starts[i],
      end: ends[j - 1],
      beat: beatOf(i),
      emphasis: false,
    });
    i = j;
  }

  return words;
}

function norm(token: string): string {
  return token.replace(WORD_STRIP, '').toLowerCase();
}

export function markEmphasis(words: Word[], beats: Array<{ emphasis?: string[] }>): void {
  for (let b = 0; b < beats.length; b++) {
    const targets = new Set<string>();
    const emphList = beats[b].emphasis || [];
    for (const phrase of emphList) {
      for (const t of phrase.split(/\s+/)) {
        const clean = norm(t);
        if (clean) targets.add(clean);
      }
    }

    for (const w of words) {
      if (w.beat === b && targets.has(norm(w.text))) {
        w.emphasis = true;
      }
    }
  }
}

export function paginate(
  words: Word[],
  beats: Array<{ role: string }>,
  totalDuration: number,
  maxWords = 7
): Page[] {
  const pages: Page[] = [];
  let stepCounter = 0;
  let current: Word[] = [];

  function flush() {
    if (current.length === 0) return;
    const b = current[0].beat;
    const role = beats[b].role;
    let step: number | null = null;
    if (role === 'step') {
      if (pages.length === 0 || pages[pages.length - 1].beat !== b) {
        stepCounter += 1;
      }
      step = stepCounter;
    }
    pages.push({
      beat: b,
      role,
      start: current[0].start,
      end: current[current.length - 1].end,
      words: current.slice(),
      step,
    });
    current = [];
  }

  for (const w of words) {
    if (current.length > 0 && (w.beat !== current[0].beat || current.length >= maxWords)) {
      flush();
    }
    current.push(w);
    if (current.length >= 3 && SENTENCE_END.test(w.text)) {
      flush();
    }
  }
  flush();

  for (let idx = 0; idx < pages.length - 1; idx++) {
    pages[idx].end = pages[idx + 1].start;
  }
  if (pages.length > 0) {
    pages[pages.length - 1].end = totalDuration;
  }

  return pages;
}
