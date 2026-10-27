import { describe, expect, it, vi } from 'vitest';
import { Container, Text } from 'pixi.js';
import { StudioStage } from '../stage/StudioStage';
import { Character } from '../stage/Character';
import { DESKS, INITIAL_AGENTS } from './config';
import { agentIndicator } from './agentIndicator';
import {
  COFFEE_SEATS, COFFEE_TILE, COLS, ROWS, TILE, VIEW_TOP, buildGrid, seatPixel, seatTile, visitorTile,
} from '../stage/studioMap';
import { findPath } from '../stage/pathfinding';

describe('shared team office', () => {
  it('keeps status labels compact and reserves the background for active or blocked work', () => {
    const width = vi.spyOn(Text.prototype, 'width', 'get').mockReturnValue(58);
    const character = new Character(INITIAL_AGENTS[1], 0x10b981);
    try {
      const text = Reflect.get(character, 'activityText') as Text;
      const background = Reflect.get(character, 'activityBackground');
      expect(text.style.fontSize).toBe(11);
      expect(text.style.fontWeight).toBe('500');
      expect(background.visible).toBe(false);
      expect(background.context.instructions).toHaveLength(0);
      character.status = 'working';
      expect(text.text).toBe('Đang viết');
      expect(background.visible).toBe(true);
      expect(background.getLocalBounds().width).toBeLessThan(90);
      expect(background.getLocalBounds().height).toBeLessThanOrEqual(23);
      character.status = 'rejected';
      expect(background.visible).toBe(true);
      character.status = 'idle';
      expect(text.text).toBe('Sẵn sàng');
      expect(background.visible).toBe(false);
      expect(background.context.instructions).toHaveLength(0);
    } finally {
      character.root.destroy({ children: true });
      character.overlay.destroy({ children: true });
      width.mockRestore();
    }
  });
  it('sorts a walking character in front of a desk only after its front edge, keeping labels above both', () => {
    vi.stubGlobal('window', { devicePixelRatio: 1 });
    const stage = new StudioStage();
    try {
      const desk = DESKS[0];
      const seat = seatPixel(desk);
      Reflect.get(stage, 'drawDesk').call(stage, desk);
      const scene = Reflect.get(stage, 'scene') as Container;
      const overlays = Reflect.get(stage, 'overlays') as Container;
      expect(scene.sortableChildren).toBe(true);
      expect(overlays.eventMode).toBe('none');
      expect(overlays.children).toHaveLength(0);
      const table = scene.children[1];
      const nameplate = table.children[1];
      const title = nameplate.children[1] as Text;
      expect(nameplate.label).toBe(`${desk.id}-nameplate`);
      expect(nameplate.eventMode).toBe('none');
      expect(nameplate.position).toMatchObject({ x: seat.x, y: seat.y + 62 });
      expect(title.text).toBe(desk.label);
      expect(title.anchor.x).toBe(0.5);
      expect(title.anchor.y).toBe(0.5);
      expect(title.style.fontFamily).toBe('Be Vietnam Pro');
      expect(title.style.fontSize).toBe(13);
      expect(title.style.fontWeight).toBe('500');
      const walker = new Container();
      scene.addChild(walker);
      walker.zIndex = seat.y;
      scene.sortChildren();
      expect(scene.getChildIndex(walker)).toBeLessThan(scene.getChildIndex(table));
      walker.zIndex = (desk.ty + 2.5) * TILE;
      scene.sortChildren();
      expect(scene.getChildIndex(walker)).toBeGreaterThan(scene.getChildIndex(table));
      expect(nameplate.parent).toBe(table);
      expect(nameplate.position).toMatchObject({ x: seat.x, y: seat.y + 62 });
    } finally {
      Reflect.get(stage, 'scene').destroy({ children: true });
      Reflect.get(stage, 'overlays').destroy({ children: true });
      vi.unstubAllGlobals();
    }
  });
  it('centers the lower desk row under the upper row and keeps overhead labels inside the view', () => {
    const centre = (row: number) => {
      const xs = DESKS.filter((desk) => desk.ty === row).map((desk) => seatPixel(desk).x);
      return xs.reduce((sum, x) => sum + x, 0) / xs.length;
    };
    expect(centre(12)).toBe(centre(6));
    for (const desk of DESKS) expect(seatPixel(desk).y - 124).toBeGreaterThanOrEqual(VIEW_TOP);
  });
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
    expect(agentIndicator('working')).toMatchObject({ label: 'Đang làm', working: true });
    expect(agentIndicator('idle')).toMatchObject({ label: 'Sẵn sàng', working: false });
    expect(agentIndicator('rejected')).toMatchObject({ label: 'Cần xử lý', working: false });
    const statuses = ['working', 'idle', 'rejected'] as const;
    expect(new Set(statuses.map((status) => agentIndicator(status).color)).size).toBe(3);
  });
  it('describes the actual stage and keeps idle or failed stages from looking active', () => {
    expect(agentIndicator('working', 'writer').label).toBe('Đang viết');
    expect(agentIndicator('working', 'critic').label).toBe('Đang duyệt');
    expect(agentIndicator('working', 'qa').label).toBe('Đang kiểm định');
    expect(agentIndicator('working', 'voice').label).toBe('Đang tạo giọng');
    expect(agentIndicator('working', 'render').label).toBe('Đang dựng');
    expect(agentIndicator('working', 'publisher').label).toBe('Đang phát hành');
    expect(agentIndicator('working', 'unknown').label).toBe('Đang làm');
    expect(agentIndicator('idle', 'render').label).toBe('Sẵn sàng');
    expect(agentIndicator('rejected', 'render').label).toBe('Cần xử lý');
  });
});
