import { describe, expect, it } from 'vitest';
import { DESKS, INITIAL_AGENTS } from './config';
import { agentIndicator } from './agentIndicator';
import { COFFEE_SEATS, COFFEE_TILE, COLS, ROWS, TILE, buildGrid, seatPixel, seatTile, visitorTile } from '../stage/studioMap';
import { findPath } from '../stage/pathfinding';

describe('shared team office', () => {
  it('provides one clear workstation per character with room for overhead labels', () => {
    expect(DESKS).toHaveLength(INITIAL_AGENTS.length);
    const grid = buildGrid();
    for (const desk of DESKS) {
      const seat = seatTile(desk);
      const pixel = seatPixel(desk);
      expect(grid[seat.y][seat.x]).toBe(false);
      expect(pixel.y - 108).toBeGreaterThan(110);
      expect(pixel.x - 90).toBeGreaterThan(TILE);
      expect(pixel.x + 90).toBeLessThan((COLS - 1) * TILE);
      expect(pixel.y + 100).toBeLessThan((ROWS - 1) * TILE);
      for (const other of DESKS.filter((item) => item !== desk)) {
        const otherPixel = seatPixel(other);
        expect(Math.abs(pixel.x - otherPixel.x) >= 180 || Math.abs(pixel.y - otherPixel.y) >= 200).toBe(true);
      }
    }
  });
  it('keeps walkable routes between all seats, colleagues, and the shared coffee corner', () => {
    const grid = buildGrid();
    for (const desk of DESKS) {
      for (const target of [COFFEE_TILE, ...COFFEE_SEATS, ...DESKS.flatMap((item) => [seatTile(item), visitorTile(item)])]) {
        const path = findPath(grid, seatTile(desk), target);
        expect(grid[target.y][target.x]).toBe(false);
        for (const point of path) expect(grid[point.y][point.x]).toBe(false);
        let previous = seatTile(desk);
        for (const point of path) {
          expect(Math.abs(point.x - previous.x) + Math.abs(point.y - previous.y)).toBe(1);
          previous = point;
        }
        expect(previous).toEqual(target);
      }
    }
  });
  it('has two separate cafe seats clear of the team workstations', () => {
    expect(COFFEE_SEATS).toHaveLength(2);
    expect(Math.abs(COFFEE_SEATS[0].x - COFFEE_SEATS[1].x) * TILE).toBeGreaterThan(114);
    for (const seat of COFFEE_SEATS) {
      expect(seat.x).toBeGreaterThan(Math.max(...DESKS.map((desk) => desk.tx + 2)));
    }
  });
  it('distinguishes working, idle, and errors by text as well as color', () => {
    expect(agentIndicator('working')).toMatchObject({ label: 'ĐANG LÀM', working: true });
    expect(agentIndicator('idle')).toMatchObject({ label: 'RẢNH RỖI', working: false });
    expect(agentIndicator('rejected')).toMatchObject({ label: 'GẶP LỖI', working: false });
    const statuses = ['working', 'idle', 'rejected'] as const;
    expect(new Set(statuses.map((status) => agentIndicator(status).color)).size).toBe(3);
  });
});
