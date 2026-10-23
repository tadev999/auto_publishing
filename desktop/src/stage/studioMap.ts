import { DESKS } from '../core/config';
import type { Desk } from '../core/types';

export const TILE = 42;
export const COLS = 28;
export const ROWS = 16;
export const WORLD_W = COLS * TILE;
export const WORLD_H = ROWS * TILE;

export interface Pt {
  x: number;
  y: number;
}

export const tileCenter = (tx: number, ty: number): Pt => ({
  x: tx * TILE + TILE / 2,
  y: ty * TILE + TILE / 2,
});

export const seatPixel = (d: Desk): Pt => ({
  x: d.tx * TILE + TILE / 2,
  y: d.ty * TILE + TILE * 1.3,
});

export const seatTile = (d: Desk): Pt => ({
  x: d.tx,
  y: d.ty + 1,
});

export const ZONES = [
  { id: 'editorial', label: '📖 EDITORIAL & INGEST', x: 1, y: 1, w: 8, h: 6, color: 0x06b6d4 },
  { id: 'script', label: '✍️ SCRIPT & CRITIC LAB', x: 10, y: 1, w: 8, h: 6, color: 0x10b981 },
  { id: 'production', label: '🎙️ SOUND & VISUAL SUITE', x: 19, y: 1, w: 8, h: 6, color: 0xeab308 },
  { id: 'render', label: '🎬 RENDER FARM & QA', x: 1, y: 8, w: 8, h: 7, color: 0x6366f1 },
  { id: 'broadcast', label: '🚀 BROADCAST & GROWTH', x: 10, y: 8, w: 8, h: 7, color: 0x22c55e },
  { id: 'lounge', label: '☕ CREATIVE LOUNGE', x: 19, y: 8, w: 8, h: 7, color: 0xf59e0b },
];

export const COFFEE_MACHINE: Pt = { x: 25, y: 9 };
export const SOFA: Pt = { x: 21, y: 13 };
export const LOUNGE_SPOTS: Pt[] = [
  { x: 21, y: 11 },
  { x: 23, y: 11 },
  { x: 25, y: 11 },
  { x: 22, y: 13 },
  { x: 24, y: 13 },
];

export function buildGrid(): boolean[][] {
  const g: boolean[][] = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
  const block = (x: number, y: number) => {
    if (x >= 0 && y >= 0 && x < COLS && y < ROWS) g[y][x] = true;
  };

  // Viền ngoài
  for (let x = 0; x < COLS; x++) {
    block(x, 0);
    block(x, ROWS - 1);
  }
  for (let y = 0; y < ROWS; y++) {
    block(0, y);
    block(COLS - 1, y);
  }

  // Bàn làm việc
  DESKS.forEach((d) => {
    block(d.tx, d.ty);
    block(d.tx + 1, d.ty);
  });

  // Coffee machine & sofa
  block(COFFEE_MACHINE.x, COFFEE_MACHINE.y);
  block(SOFA.x, SOFA.y);
  block(SOFA.x + 1, SOFA.y);
  block(SOFA.x + 2, SOFA.y);

  return g;
}
