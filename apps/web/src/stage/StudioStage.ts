import { Application, Container, Graphics, Text } from 'pixi.js';
import { DESKS } from '../core/config';
import { eventBus } from '../core/eventBus';
import { store } from '../core/store';
import type { Desk, StudioAgent } from '../core/types';
import { agentIndicator } from '../core/agentIndicator';
import { Character } from './Character';
import { findPath } from './pathfinding';
import { officePalette, type OfficePalette } from './officeTheme';
import type { Theme } from '../core/theme';
import {
  COFFEE_SEATS, COFFEE_X, ROOM_TOP, TILE, VIEW_TOP, WORLD_H, WORLD_W, buildGrid, seatPixel, seatTile, tileCenter,
  type Pt,
} from './studioMap';

const FONT = 'Be Vietnam Pro';

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
  private scene = new Container({ sortableChildren: true });
  private overlays = new Container({ sortableChildren: true, eventMode: 'none' });
  private grid = buildGrid();
  private chars = new Map<string, Character>();
  private nameplates: Container[] = [];
  private timers = new Set<number>();
  private coffeeVisitors = new Map<string, number>();
  private returnTimers = new Map<string, number>();
  private coffeeCooldown = new Map<string, number>();
  private unsubscribe: (() => void) | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private destroyed = false;
  private initialized = false;
  private host: HTMLElement | null = null;
  private palette: OfficePalette;
  private steam: Graphics[] = [];
  private clockHands = new Graphics();
  private clockMinute = -1;
  private readonly reduceMotion = typeof window !== 'undefined'
    && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

  constructor(theme: Theme = 'light') {
    this.palette = officePalette(theme);
  }

  async mount(host: HTMLElement) {
    await Promise.all([
      document.fonts.load('600 14px "Be Vietnam Pro"', 'Văn phòng'),
      document.fonts.load('500 14px "Be Vietnam Pro"', DESKS.map((desk) => desk.label).join(' ')),
      document.fonts.load('500 14px "JetBrains Mono"', 'Đang làm · Rảnh rỗi · Gặp lỗi'),
    ]);
    if (this.destroyed) return;
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
    this.host = host;
    this.world.addChild(this.furniture, this.scene, this.overlays);
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
      if ('activityStage' in patch) char.activityStage = patch.activityStage;
      if (patch.status || 'activityStage' in patch) char.status = patch.status || char.status;
      if ('statusIcon' in patch) char.setIcon(patch.statusIcon || '💭');
      if ('speech' in patch) char.say(patch.speech || '');
      this.updateCanvasLabel();
    });
    const speak = eventBus.on('agent:speak', (id: string, text: string) => this.chars.get(id)?.say(text));
    this.unsubscribe = () => { update(); speak(); };
    this.app.ticker.add((ticker) => {
      this.chars.forEach((char) => char.tick(ticker.deltaTime));
      this.animateDecor(ticker.lastTime);
    });
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
    const viewH = WORLD_H - VIEW_TOP;
    const padX = Math.min(32, width * 0.03);
    const padY = Math.min(48, height * 0.06);
    const scale = Math.max(0.1, Math.min((width - padX) / WORLD_W, (height - padY) / viewH, 1.5));
    this.world.scale.set(scale);
    this.world.position.set(Math.round((width - WORLD_W * scale) / 2),
      Math.round((height - padY / 2 - viewH * scale) / 2 - VIEW_TOP * scale));
    // Keep 11px status and 13px nameplates readable when the office is scaled down.
    const labelScale = Math.min(2.5, Math.max(1, 10 / (11 * scale)));
    this.chars.forEach((char) => char.setLabelScale(labelScale));
    // Lower desks are 252px apart; a 150px plate can grow 1.6x without touching.
    const plateScale = Math.min(1.6, Math.max(1, 9 / (13 * scale)));
    this.nameplates.forEach((plate) => plate.scale.set(plateScale));
    // Lets HTML overlays in the wrapper align with the drawn room.
    const wrapper = this.host?.parentElement;
    wrapper?.style.setProperty('--room-bottom', `${Math.round(this.world.y + (WORLD_H - 22) * scale)}px`);
    wrapper?.style.setProperty('--room-right', `${Math.round(width - this.world.x - (WORLD_W - 12) * scale)}px`);
  }

  private updateCanvasLabel() {
    const statuses = store.get().agents.map((agent) => {
      const char = this.chars.get(agent.id);
      return `${agent.name}: ${agentIndicator(char?.status || agent.status, char?.activityStage || agent.activityStage || agent.role).label}`;
    });
    this.app.canvas.setAttribute('role', 'img');
    this.app.canvas.setAttribute('aria-label', `Văn phòng chung của team Endogenism. ${statuses.join('. ')}`);
  }

  private drawRoom() {
    const p = this.palette;
    const room = new Graphics();
    room.roundRect(12, ROOM_TOP, WORLD_W - 24, WORLD_H - ROOM_TOP - 22, 8).fill(p.floor)
      .stroke({ color: p.floorStroke, width: 1 });
    for (let y = ROOM_TOP + 38; y < WORLD_H - 34; y += TILE) {
      room.moveTo(14, y).lineTo(WORLD_W - 14, y).stroke({ color: p.grid, alpha: p.gridAlphaH, width: 1 });
    }
    for (let x = 54; x < WORLD_W - 14; x += TILE) {
      room.moveTo(x, ROOM_TOP + 2).lineTo(x, WORLD_H - 24).stroke({ color: p.grid, alpha: p.gridAlphaV, width: 1 });
    }
    room.roundRect(64, 132, 788, WORLD_H - 178, 6).fill(p.work).stroke({ color: p.workStroke, width: 1 });
    const cx = COFFEE_X * TILE;
    room.roundRect(cx - 18, 132, 4.5 * TILE, WORLD_H - 178, 6).fill(p.lounge).stroke({ color: p.loungeStroke, width: 1 });
    room.roundRect(cx + TILE - 22, 9 * TILE - 18, 2 * TILE + 44, 2 * TILE + 36, 14).fill(p.rug);
    this.furniture.addChild(room);

    this.drawPlant(44, WORLD_H - 46);
    this.drawWallDecor();
    this.drawWorkDecor();
    this.drawLoungeDecor(cx);

    const coffee = new Graphics();
    coffee.roundRect(cx, 5 * TILE, 4 * TILE, 34, 5).fill(p.counter).stroke({ color: p.counterStroke, width: 1 });
    coffee.roundRect(cx + TILE, 5 * TILE - 34, 38, 38, 6).fill(p.machine)
      .stroke({ color: p.machineStroke, width: 1 });
    coffee.roundRect(cx + TILE + 8, 5 * TILE - 25, 22, 9, 2).fill(p.machineScreen);
    coffee.roundRect(cx + TILE + 12, 5 * TILE - 10, 12, 10, 2).fill(p.cup);
    coffee.circle(cx + 3 * TILE, 5 * TILE + 8, 6).fill(p.cup).stroke({ color: p.cupStroke, width: 1 });
    coffee.zIndex = 5 * TILE + 34;
    this.scene.addChild(coffee);
    const coffeeTable = new Graphics();
    coffeeTable.roundRect(cx + TILE, 9 * TILE, 2 * TILE, 2 * TILE, 8).fill(p.coffeeTable)
      .stroke({ color: p.coffeeTableStroke, width: 1 });
    coffeeTable.circle(cx + TILE + 23, 9 * TILE + 24, 6).fill(p.cup).stroke({ color: p.cupStroke, width: 1 });
    coffeeTable.circle(cx + 3 * TILE - 23, 9 * TILE + 50, 6).fill(p.cup).stroke({ color: p.cupStroke, width: 1 });
    coffeeTable.zIndex = 11 * TILE;
    this.scene.addChild(coffeeTable);
    for (const seat of COFFEE_SEATS) {
      const point = tileCenter(seat.x, seat.y);
      const chair = new Graphics();
      chair.roundRect(point.x - 20, point.y - 28, 40, 38, 10).fill(p.chair)
        .stroke({ color: p.chairStroke, width: 1 });
      chair.zIndex = point.y - 20;
      this.scene.addChild(chair);
    }
    const coffeeLabel = label('Góc nghỉ', 13, p.loungeLabel);
    coffeeLabel.style.fontWeight = '500';
    coffeeLabel.anchor.set(0.5, 0);
    coffeeLabel.position.set(cx + 2 * TILE, 146);
    this.furniture.addChild(coffeeLabel);

    for (const [x, y] of [[cx + TILE + 18, 5 * TILE - 14], [cx + TILE + 23, 9 * TILE + 16]]) {
      const puff = new Graphics();
      puff.ellipse(0, 0, 2.5, 4).fill(p.steam).ellipse(3, -7, 2, 3.5).fill(p.steam);
      puff.position.set(x, y);
      puff.alpha = 0;
      puff.zIndex = 11 * TILE + 1;
      this.scene.addChild(puff);
      this.steam.push(puff);
    }
  }

  private drawWallDecor() {
    const p = this.palette;
    const board = new Graphics();
    board.roundRect(267, 104, 96, 24, 3).fill(p.board).stroke({ color: p.boardStroke, width: 1 });
    p.notes.forEach((note, i) => {
      board.rect(273 + i * 22, 108, 14, 7).fill(note);
      board.rect(273 + i * 22, 117, 14, 7).fill(p.notes[(i + 2) % p.notes.length]);
    });
    this.furniture.addChild(board);

    const clock = new Graphics();
    clock.circle(609, 116, 11).fill(p.clockFace).stroke({ color: p.clockStroke, width: 1.5 });
    for (let h = 0; h < 12; h += 3) {
      const a = (h / 12) * Math.PI * 2;
      clock.circle(609 + Math.sin(a) * 8.5, 116 - Math.cos(a) * 8.5, 0.8).fill(p.clockStroke);
    }
    this.furniture.addChild(clock, this.clockHands);
    this.drawClockHands();
  }

  private drawClockHands() {
    const now = new Date();
    this.clockMinute = now.getMinutes();
    const minute = (now.getMinutes() / 60) * Math.PI * 2;
    const hour = (((now.getHours() % 12) + now.getMinutes() / 60) / 12) * Math.PI * 2;
    const color = this.palette.clockHand;
    this.clockHands.clear()
      .moveTo(609, 116).lineTo(609 + Math.sin(hour) * 5, 116 - Math.cos(hour) * 5).stroke({ color, width: 1.6 })
      .moveTo(609, 116).lineTo(609 + Math.sin(minute) * 8, 116 - Math.cos(minute) * 8).stroke({ color, width: 1 });
  }

  private drawWorkDecor() {
    const p = this.palette;
    const shelf = new Graphics();
    shelf.roundRect(88, 522, 76, 94, 3).fill(p.shelf).stroke({ color: p.shelfStroke, width: 1 });
    for (let row = 0; row < 3; row++) {
      const base = 548 + row * 30;
      shelf.rect(91, base, 70, 2).fill(p.shelfStroke);
      let x = 94;
      for (let i = 0; i < 6 && x < 152; i++) {
        const w = 6 + ((row * 3 + i) % 3) * 2;
        const h = 16 + ((row + i) % 3) * 3;
        shelf.rect(x, base - h, w, h).fill(p.books[(row * 2 + i) % p.books.length]);
        x += w + 2;
      }
    }
    shelf.zIndex = 616;
    this.scene.addChild(shelf);

    const printer = new Graphics();
    printer.roundRect(764, 574, 68, 42, 3).fill(p.shelf).stroke({ color: p.shelfStroke, width: 1 });
    printer.rect(797, 580, 1, 30).fill(p.shelfStroke);
    printer.roundRect(770, 552, 56, 24, 4).fill(p.printer).stroke({ color: p.printerStroke, width: 1 });
    printer.rect(780, 546, 36, 7).fill(p.paper).stroke({ color: p.printerStroke, width: 1 });
    printer.rect(778, 566, 40, 3).fill(p.printerStroke);
    printer.circle(819, 558, 1.6).fill(p.led);
    printer.zIndex = 616;
    this.scene.addChild(printer);
  }

  private drawLoungeDecor(cx: number) {
    const p = this.palette;
    const cooler = new Graphics();
    cooler.ellipse(cx + 21, 542, 14, 4).fill({ color: p.shadow, alpha: p.shadowAlpha });
    cooler.roundRect(cx + 10, 500, 22, 42, 3).fill(p.cooler).stroke({ color: p.printerStroke, width: 1 });
    cooler.roundRect(cx + 12, 470, 18, 30, 6).fill({ color: p.coolerWater, alpha: 0.75 })
      .stroke({ color: p.printerStroke, width: 1 });
    cooler.rect(cx + 18, 512, 6, 3).fill(p.printerStroke);
    cooler.zIndex = 542;
    this.scene.addChild(cooler);

    const lamp = new Graphics();
    const lx = cx + 3 * TILE + 26;
    lamp.ellipse(lx, 540, 10, 3).fill({ color: p.shadow, alpha: p.shadowAlpha });
    lamp.rect(lx - 1, 446, 2, 94).fill(p.lampPole);
    lamp.poly([lx - 12, 448, lx + 12, 448, lx + 8, 430, lx - 8, 430]).fill(p.lampShade)
      .stroke({ color: p.lampPole, width: 1 });
    lamp.zIndex = 540;
    this.scene.addChild(lamp);

    const sofa = new Graphics();
    const sx = cx + TILE + 6;
    sofa.ellipse(sx + 57, 628, 62, 5).fill({ color: p.shadow, alpha: p.shadowAlpha });
    sofa.roundRect(sx, 588, 114, 22, 8).fill(p.sofa).stroke({ color: p.sofaStroke, width: 1 });
    sofa.roundRect(sx - 4, 600, 122, 26, 8).fill(p.sofa).stroke({ color: p.sofaStroke, width: 1 });
    sofa.roundRect(sx + 8, 602, 46, 14, 5).fill(p.cushion);
    sofa.roundRect(sx + 60, 602, 46, 14, 5).fill(p.cushion);
    sofa.zIndex = 626;
    this.scene.addChild(sofa);
  }

  private animateDecor(time: number) {
    if (this.clockMinute !== new Date().getMinutes()) this.drawClockHands();
    if (this.reduceMotion) return;
    this.steam.forEach((puff, i) => {
      const phase = ((time / 2600) + i * 0.5) % 1;
      puff.alpha = Math.sin(phase * Math.PI) * 0.35;
      puff.pivot.y = phase * 12;
    });
  }

  private drawPlant(x: number, y: number) {
    const p = this.palette;
    const plant = new Graphics();
    plant.ellipse(x, y + 4, 18, 6).fill({ color: p.shadow, alpha: p.shadowAlpha });
    plant.roundRect(x - 12, y - 17, 24, 22, 5).fill(p.pot);
    plant.ellipse(x - 7, y - 31, 8, 19).fill(p.leaves[0]);
    plant.ellipse(x + 8, y - 29, 8, 17).fill(p.leaves[1]);
    plant.ellipse(x, y - 39, 7, 19).fill(p.leaves[2]);
    plant.zIndex = y + 5;
    this.scene.addChild(plant);
  }

  private drawDesk(desk: Desk) {
    const p = this.palette;
    const { x, y } = seatPixel(desk);
    const back = new Graphics();
    back.roundRect(x - 24, y - 28, 48, 42, 8).fill(p.seatBack).stroke({ color: p.seatBackStroke, width: 1 });
    back.roundRect(x - 17, y - 24, 34, 18, 4).fill(p.seatInner);
    back.ellipse(x, y + 24, 30, 7).fill({ color: p.shadow, alpha: p.shadowAlpha });
    back.zIndex = y - 15;
    this.scene.addChild(back);

    const table = new Graphics();
    table.roundRect(x - 86, y + 23, 172, 76, 10).fill({ color: p.shadow, alpha: p.shadowAlpha });
    table.roundRect(x - 80, y + 15, 160, 45, 5).fill(p.desk).stroke({ color: p.deskStroke, width: 1 });
    table.roundRect(x - 80, y + 58, 160, 30, 3).fill(p.apron).stroke({ color: p.apronStroke, width: 1 });
    table.rect(x - 74, y + 88, 5, 9).fill(p.legs);
    table.rect(x + 69, y + 88, 5, 9).fill(p.legs);
    table.roundRect(x - 28, y + 23, 56, 23, 4).fill(p.monitor).stroke({ color: p.monitorStroke, width: 1 });
    table.roundRect(x - 23, y + 27, 46, 14, 2).fill(p.screen);
    table.rect(x - 19, y + 30, 25, 2).fill({ color: desk.color, alpha: 0.8 });
    table.rect(x - 19, y + 35, 36, 2).fill({ color: 0xcbd5e1, alpha: 0.3 });
    table.rect(x - 19, y + 39, 18, 1).fill(0x7ee787);
    table.roundRect(x - 21, y + 49, 42, 7, 2).fill(p.keyboard).stroke({ color: p.keyboardStroke, width: 1 });
    for (let key = 0; key < 7; key++) {
      table.rect(x - 18 + key * 5, y + 51, 3, 2).fill(p.keys);
    }
    table.circle(x + 41, y + 47, 4).fill(p.mouse).stroke({ color: p.keyboardStroke, width: 1 });
    table.roundRect(x - 61, y + 28, 17, 22, 2).fill(p.notebook);
    table.circle(x + 60, y + 29, 6).fill(p.mug).stroke({ color: p.keyboardStroke, width: 1 });
    const workstation = new Container({ label: desk.id });
    workstation.zIndex = y + 78;
    workstation.addChild(table);
    this.scene.addChild(workstation);

    const nameplate = new Container({ label: `${desk.id}-nameplate`, eventMode: 'none' });
    const frame = new Graphics().roundRect(-75, 0, 150, 22, 3).fill(p.plate)
      .stroke({ color: p.plateStroke, width: 1 });
    frame.roundRect(-75, 0, 3, 22, 1.5).fill(desk.color);
    const title = label(desk.label, 13, p.plateText);
    title.style.fontWeight = '500';
    title.anchor.set(0.5);
    title.position.set(1, 11);
    nameplate.position.set(x, y + 62);
    nameplate.addChild(frame, title);
    workstation.addChild(nameplate);
    this.nameplates.push(nameplate);
  }

  private spawnAgents() {
    for (const agent of store.get().agents) {
      const desk = DESKS.find((item) => item.role === agent.role);
      if (!desk) continue;
      const char = new Character(agent, parseInt(agent.color.slice(1), 16),
        { color: this.palette.shadow, alpha: this.palette.charShadowAlpha });
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
      this.scene.addChild(char.root);
      this.overlays.addChild(char.overlay);
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
