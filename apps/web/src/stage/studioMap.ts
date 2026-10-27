import { DESKS } from '../core/config';
import type { Desk } from '../core/types';

export const TILE = 42;
export const COLS = 26;
export const ROWS = 17;
export const WORLD_W = COLS * TILE;
export const WORLD_H = ROWS * TILE;
export const ROOM_TOP = 100;
// Rows above the room only hold overhead labels and speech bubbles.
export const VIEW_TOP = 84;
export const COFFEE_X = 21;

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
export const COFFEE_SEATS: Pt[] = [{ x: COFFEE_X, y: 9 }, { x: COFFEE_X + 3, y: 9 }];
export const COFFEE_TILE: Pt = { x: COFFEE_X + 1, y: 6 };
const block = (xs: number[], ys: number[]) => xs.flatMap((x) => ys.map((y) => ({ x, y })));
// Floor decorations that characters walk around.
export const DECOR_TILES: Pt[] = [
  ...block([2, 3], [13, 14]),
  ...block([18, 19], [13, 14]),
  { x: COFFEE_X, y: 12 },
  { x: COFFEE_X + 3, y: 12 },
  ...block([COFFEE_X + 1, COFFEE_X + 2, COFFEE_X + 3], [14]),
];

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
  for (let x = COFFEE_X; x <= COFFEE_X + 3; x++) grid[5][x] = true;
  for (let x = COFFEE_X + 1; x <= COFFEE_X + 2; x++) {
    grid[9][x] = true;
    grid[10][x] = true;
  }
  for (const tile of DECOR_TILES) grid[tile.y][tile.x] = true;
  return grid;
}
