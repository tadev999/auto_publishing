import { Application, Container, Graphics, Text } from 'pixi.js';
import { DESKS } from '../core/config';
import { eventBus } from '../core/eventBus';
import { store } from '../core/store';
import type { Desk, StudioAgent } from '../core/types';
import { agentIndicator } from '../core/agentIndicator';
import { Character } from './Character';
import { findPath } from './pathfinding';
import {
  COFFEE_SEATS, TILE, WORLD_H, WORLD_W, buildGrid, seatPixel, seatTile, tileCenter, type Pt,
} from './studioMap';

const FONT = 'Be Vietnam Pro, Inter, system-ui, sans-serif';

function label(text: string, size: number, color: number) {
  return new Text({
    text,
    style: { fontFamily: FONT, fontSize: size, fontWeight: '600', fill: color },
    resolution: Math.max(2, window.devicePixelRatio || 1),
  });
}

export class StudioStage {
  private app = new Application();
  private world = new Container();
  private furniture = new Container();
  private characters = new Container();
  private overlays = new Container();
  private grid = buildGrid();
  private chars = new Map<string, Character>();
  private timers = new Set<number>();
  private coffeeVisitors = new Map<string, number>();
  private returnTimers = new Map<string, number>();
  private coffeeCooldown = new Map<string, number>();
  private unsubscribe: (() => void) | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private destroyed = false;
  private initialized = false;

  async mount(host: HTMLElement) {
    await this.app.init({
      resizeTo: host, backgroundAlpha: 0, antialias: true,
      resolution: window.devicePixelRatio || 1, autoDensity: true,
    });
    this.initialized = true;
    if (this.destroyed) {
      this.app.destroy(true, { children: true });
      return;
    }
    host.appendChild(this.app.canvas);
    this.world.addChild(this.furniture, this.characters, this.overlays);
    this.characters.sortableChildren = true;
    this.app.stage.addChild(this.world);
    this.drawRoom();
    DESKS.forEach((desk) => this.drawDesk(desk));
    this.spawnAgents();
    this.updateCanvasLabel();
    this.fit();
    this.resizeObserver = new ResizeObserver(() => {
      this.app.resize();
      this.fit();
    });
    this.resizeObserver.observe(host);

    const update = eventBus.on('agent:update', (id: string, patch: Partial<StudioAgent>) => {
      const char = this.chars.get(id);
      if (!char) return;
      if (patch.status && patch.status !== 'idle') this.cancelCoffeeBreak(char);
      if (patch.status) char.status = patch.status;
      if ('statusIcon' in patch) char.setIcon(patch.statusIcon || '💭');
      if ('speech' in patch) char.say(patch.speech || '');
      this.updateCanvasLabel();
    });
    const speak = eventBus.on('agent:speak', (id: string, text: string) => this.chars.get(id)?.say(text));
    this.unsubscribe = () => { update(); speak(); };
    this.app.ticker.add((ticker) => this.chars.forEach((char) => char.tick(ticker.deltaTime)));
    this.scheduleCoffeeBreak();
  }

  destroy() {
    this.destroyed = true;
    this.timers.forEach((timer) => window.clearTimeout(timer));
    this.timers.clear();
    this.unsubscribe?.();
    this.resizeObserver?.disconnect();
    if (this.initialized) this.app.destroy(true, { children: true });
  }

  private fit() {
    const { width, height } = this.app.screen;
    if (width <= 0 || height <= 0) return;
    const scale = Math.max(0.1, Math.min((width - 24) / WORLD_W, (height - 76) / WORLD_H, 1.5));
    this.world.scale.set(scale);
    this.world.position.set(Math.round((width - WORLD_W * scale) / 2), Math.round((height - 56 - WORLD_H * scale) / 2));
  }

  private updateCanvasLabel() {
    const statuses = store.get().agents.map((agent) => {
      const char = this.chars.get(agent.id);
      return `${agent.name}: ${agentIndicator(char?.status || agent.status).label}`;
    });
    this.app.canvas.setAttribute('role', 'img');
    this.app.canvas.setAttribute('aria-label', `Văn phòng chung của team Endogenism. ${statuses.join('. ')}`);
  }

  private drawRoom() {
    const room = new Graphics();
    room.roundRect(12, 96, WORLD_W - 24, WORLD_H - 108, 24).fill({ color: 0x000000, alpha: 0.25 });
    room.roundRect(12, 20, WORLD_W - 24, WORLD_H - 42, 24).fill(0x17212f)
      .stroke({ color: 0x334155, width: 2 });
    room.roundRect(24, 110, WORLD_W - 48, WORLD_H - 144, 16).fill(0x253140);
    for (let y = 148; y < WORLD_H - 34; y += 42) {
      room.moveTo(26, y).lineTo(WORLD_W - 26, y).stroke({ color: 0x94a3b8, alpha: 0.055, width: 1 });
    }
    room.roundRect(114, 132, 788, 422, 20).fill({ color: 0x111c29, alpha: 0.48 });
    room.roundRect(23 * TILE, 132, 5 * TILE, 422, 20).fill(0x324137);
    room.moveTo(24, 110).lineTo(WORLD_W - 24, 110).stroke({ color: 0x475569, width: 2 });
    this.furniture.addChild(room);

    const heading = label('ENDOGENISM / TEAM STUDIO', 21, 0xe2e8f0);
    heading.anchor.set(0.5, 0);
    heading.position.set(WORLD_W / 2, 43);
    const subtitle = label('Một team · Một không gian làm việc', 12, 0x94a3b8);
    subtitle.anchor.set(0.5, 0);
    subtitle.position.set(WORLD_W / 2, 77);
    this.furniture.addChild(heading, subtitle);

    for (const x of [54, WORLD_W - 214]) {
      const window = new Graphics();
      window.roundRect(x, 40, 160, 51, 8).fill(0x15364a).stroke({ color: 0x36718c, width: 2 });
      window.moveTo(x + 80, 42).lineTo(x + 80, 89).stroke({ color: 0x36718c, width: 2 });
      window.moveTo(x + 12, 78).lineTo(x + 65, 49).stroke({ color: 0x7dd3fc, alpha: 0.15, width: 3 });
      this.furniture.addChild(window);
    }
    this.drawPlant(66, 180);
    this.drawPlant(WORLD_W - 66, 180);
    this.drawPlant(68, WORLD_H - 80);

    const coffee = new Graphics();
    coffee.roundRect(24 * TILE, 5 * TILE, 4 * TILE, 34, 7).fill(0x9c8060);
    coffee.roundRect(25 * TILE, 5 * TILE - 34, 38, 38, 6).fill(0x0f172a)
      .stroke({ color: 0x64748b, width: 1 });
    coffee.roundRect(25 * TILE + 8, 5 * TILE - 25, 22, 9, 2).fill(0x38bdf8);
    coffee.roundRect(25 * TILE + 12, 5 * TILE - 10, 12, 10, 2).fill(0xf8fafc);
    coffee.circle(27 * TILE, 5 * TILE + 8, 6).fill(0xf8fafc);
    coffee.roundRect(25 * TILE, 9 * TILE, 2 * TILE, 2 * TILE, 18).fill(0x9c8060)
      .stroke({ color: 0xc1a57e, width: 2 });
    coffee.circle(25 * TILE + 23, 9 * TILE + 24, 6).fill(0xf8fafc);
    coffee.circle(27 * TILE - 23, 9 * TILE + 50, 6).fill(0xf8fafc);
    for (const seat of COFFEE_SEATS) {
      const point = tileCenter(seat.x, seat.y);
      coffee.roundRect(point.x - 20, point.y - 28, 40, 38, 10).fill(0x52766b)
        .stroke({ color: 0x84a69a, width: 1.5 });
    }
    this.furniture.addChild(coffee);
    const coffeeLabel = label('TEAM CAFÉ', 15, 0xd1e7d8);
    coffeeLabel.anchor.set(0.5, 0);
    coffeeLabel.position.set(25.5 * TILE, 149);
    const coffeeHint = label('Góc nghỉ chung', 11, 0xa3bdb0);
    coffeeHint.anchor.set(0.5, 0);
    coffeeHint.position.set(25.5 * TILE, 12 * TILE);
    this.furniture.addChild(coffeeLabel, coffeeHint);

  }

  private drawPlant(x: number, y: number) {
    const plant = new Graphics();
    plant.ellipse(x, y + 4, 18, 6).fill({ color: 0x000000, alpha: 0.16 });
    plant.roundRect(x - 12, y - 17, 24, 22, 5).fill(0x64748b);
    plant.ellipse(x - 7, y - 31, 8, 19).fill(0x227568);
    plant.ellipse(x + 8, y - 29, 8, 17).fill(0x32967d);
    plant.ellipse(x, y - 39, 7, 19).fill(0x4bb69b);
    this.furniture.addChild(plant);
  }

  private drawDesk(desk: Desk) {
    const { x, y } = seatPixel(desk);
    const back = new Graphics();
    back.roundRect(x - 24, y - 32, 48, 46, 12).fill(0x111827).stroke({ color: 0x475569, width: 2 });
    back.ellipse(x, y + 24, 30, 7).fill({ color: 0x000000, alpha: 0.2 });
    this.furniture.addChild(back);

    // Bàn phía trước chỉ che chân, không che nhân vật hoặc indicator.
    const table = new Graphics();
    table.roundRect(x - 86, y + 23, 172, 58, 10).fill({ color: 0x000000, alpha: 0.22 });
    table.roundRect(x - 80, y + 15, 160, 49, 8).fill(0x886d53).stroke({ color: 0xb59875, width: 1.5 });
    table.roundRect(x - 76, y + 61, 152, 5, 2).fill(0x584937);
    table.rect(x - 66, y + 66, 6, 12).fill(0x475569);
    table.rect(x + 60, y + 66, 6, 12).fill(0x475569);
    table.roundRect(x - 28, y + 23, 56, 23, 4).fill(0x0f172a).stroke({ color: 0x64748b, width: 1 });
    table.roundRect(x - 23, y + 27, 46, 14, 2).fill(0x1e3a50);
    table.rect(x - 19, y + 30, 25, 2).fill({ color: desk.color, alpha: 0.8 });
    table.rect(x - 19, y + 35, 36, 2).fill({ color: 0xcbd5e1, alpha: 0.3 });
    table.roundRect(x - 21, y + 49, 42, 7, 2).fill(0xced5dd);
    table.circle(x + 41, y + 47, 4).fill(0xe2e8f0);
    table.roundRect(x - 61, y + 28, 17, 22, 2).fill(0xe2d5bf);
    table.circle(x + 60, y + 29, 6).fill(0xdde7ef);
    table.roundRect(x - 27, y + 68, 54, 3, 1).fill(desk.color);
    this.overlays.addChild(table);

    const role = label(desk.label, 10, 0xbac7d5);
    role.anchor.set(0.5, 0);
    role.position.set(x, y + 85);
    this.overlays.addChild(role);
  }

  private spawnAgents() {
    for (const agent of store.get().agents) {
      const desk = DESKS.find((item) => item.role === agent.role);
      if (!desk) continue;
      const char = new Character(agent, parseInt(agent.color.slice(1), 16));
      char.status = agent.status;
      char.sit('desk', seatPixel(desk));
      if (agent.speech) char.say(agent.speech);
      char.root.on('pointerdown', () => {
        this.chars.forEach((item) => item.setSelected(item.id === char.id));
        const current = store.get().agents.find((item) => item.id === char.id);
        if (!current) return;
        char.say(current.thought || 'Sẵn sàng nhận công việc.');
      });
      this.chars.set(agent.id, char);
      this.characters.addChild(char.root);
      char.tick(0);
    }
  }

  private later(fn: () => void, delay: number): number {
    const timer = window.setTimeout(() => {
      this.timers.delete(timer);
      if (!this.destroyed) fn();
    }, delay);
    this.timers.add(timer);
    return timer;
  }

  private cancelCoffeeBreak(char: Character) {
    if (!this.coffeeVisitors.has(char.id)) return;
    const timer = this.returnTimers.get(char.id);
    if (timer !== undefined) {
      window.clearTimeout(timer);
      this.timers.delete(timer);
    }
    this.returnTimers.delete(char.id);
    this.coffeeVisitors.delete(char.id);
    this.coffeeCooldown.set(char.id, Date.now() + 45000);
    char.path = [];
    char.onArrive = null;
    char.busy = false;
    char.say('');
    const desk = DESKS.find((item) => item.role === char.id);
    if (desk) char.sit('desk', seatPixel(desk));
  }

  private scheduleCoffeeBreak() {
    this.later(() => {
      this.takeCoffeeBreak();
      this.scheduleCoffeeBreak();
    }, 20000 + Math.random() * 15000);
  }

  walkAgentTo(id: string, goal: Pt, onArrive?: () => void) {
    const char = this.chars.get(id);
    if (!char) return;
    const start = { x: Math.floor(char.x / TILE), y: Math.floor(char.y / TILE) };
    char.path = findPath(this.grid, start, goal).map((point) => tileCenter(point.x, point.y));
    char.onArrive = onArrive || null;
    if (!char.path.length) { char.onArrive = null; onArrive?.(); }
  }

  private goHome(char: Character) {
    const desk = DESKS.find((item) => item.role === char.id);
    if (!desk) return;
    this.walkAgentTo(char.id, seatTile(desk), () => {
      char.path = [seatPixel(desk)];
      char.onArrive = () => {
        char.sit('desk');
        char.busy = false;
        this.coffeeVisitors.delete(char.id);
        this.returnTimers.delete(char.id);
        this.coffeeCooldown.set(char.id, Date.now() + 45000);
      };
    });
  }

  takeCoffeeBreak(agentId?: string) {
    const seatIndex = COFFEE_SEATS.findIndex((_seat, index) => ![...this.coffeeVisitors.values()].includes(index));
    if (seatIndex < 0) return;
    const available = [...this.chars.values()].filter((char) =>
      char.status === 'idle' && !char.busy && char.seated === 'desk' &&
      (this.coffeeCooldown.get(char.id) || 0) <= Date.now());
    const char = agentId ? available.find((item) => item.id === agentId)
      : available[Math.floor(Math.random() * available.length)];
    if (!char) return;
    this.coffeeVisitors.set(char.id, seatIndex);
    char.busy = true;
    this.walkAgentTo(char.id, COFFEE_SEATS[seatIndex], () => {
      char.sit('sofa');
      char.say('Nghỉ uống cà phê — đang rảnh.');
      this.returnTimers.set(char.id, this.later(() => this.goHome(char), 18000 + Math.random() * 12000));
    });
  }
}
