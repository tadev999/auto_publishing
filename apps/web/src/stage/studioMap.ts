import { DESKS } from '../core/config';
import type { Desk } from '../core/types';

export const TILE = 42;
export const COLS = 29;
export const ROWS = 15;
export const WORLD_W = COLS * TILE;
export const WORLD_H = ROWS * TILE;

export interface Pt { x: number; y: number }
export type Facing = 'down' | 'up' | 'left' | 'right';

export const tileCenter = (x: number, y: number): Pt => ({
  x: (x + 0.5) * TILE, y: (y + 0.5) * TILE,
});
export const seatPixel = (desk: Desk): Pt => ({
  x: (desk.tx + 1) * TILE, y: desk.ty * TILE - 2,
});
export const seatTile = (desk: Desk): Pt => ({ x: desk.tx, y: desk.ty - 1 });
export const visitorTile = (desk: Desk): Pt => ({ x: desk.tx + 1, y: desk.ty + 2 });
export const COFFEE_SEATS: Pt[] = [{ x: 24, y: 9 }, { x: 27, y: 9 }];
export const COFFEE_TILE: Pt = { x: 25, y: 6 };

export function buildGrid(): boolean[][] {
  const grid = Array.from({ length: ROWS }, (_, y) =>
    Array.from({ length: COLS }, (_, x) => x === 0 || x === COLS - 1 || y < 3 || y === ROWS - 1));
  // Bàn rộng bốn ô; giữ hàng ghế và lối đi chung thông thoáng.
  for (const desk of DESKS) {
    for (let x = desk.tx - 1; x <= desk.tx + 2; x++) {
      grid[desk.ty][x] = true;
      grid[desk.ty + 1][x] = true;
    }
  }
  for (let x = 24; x <= 27; x++) grid[5][x] = true;
  for (let x = 25; x <= 26; x++) {
    grid[9][x] = true;
    grid[10][x] = true;
  }
  return grid;
}
