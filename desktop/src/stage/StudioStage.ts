import { Application, Container, Graphics, Text } from 'pixi.js';
import { DESKS } from '../core/config';
import { eventBus } from '../core/eventBus';
import { store } from '../core/store';
import type { StudioAgent } from '../core/types';
import { Character } from './Character';
import { findPath } from './pathfinding';
import {
  COFFEE_MACHINE,
  COLS,
  LOUNGE_SPOTS,
  ROWS,
  SOFA,
  TILE,
  WORLD_H,
  WORLD_W,
  ZONES,
  buildGrid,
  seatPixel,
  seatTile,
  tileCenter,
  type Pt,
} from './studioMap';

const FONT = 'Be Vietnam Pro, Inter, system-ui, sans-serif';

export class StudioStage {
  private app = new Application();
  private world = new Container();
  private floorLayer = new Container();
  private deskLayer = new Container();
  private charLayer = new Container();
  private fxLayer = new Container();

  private grid = buildGrid();
  private chars = new Map<string, Character>();
  private unsub: (() => void) | null = null;
  private resizeObs: ResizeObserver | null = null;
  private destroyed = false;

  async mount(host: HTMLElement) {
    await this.app.init({
      resizeTo: host,
      backgroundAlpha: 0,
      antialias: true,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
    });

    if (this.destroyed) {
      this.app.destroy(true);
      return;
    }

    host.appendChild(this.app.canvas);
    this.charLayer.sortableChildren = true;

    this.world.addChild(this.floorLayer, this.deskLayer, this.charLayer, this.fxLayer);
    this.app.stage.addChild(this.world);

    this.drawStudio();
    this.spawnAgents();

    this.fit();
    this.resizeObs = new ResizeObserver(() => this.fit());
    this.resizeObs.observe(host);

    // Lắng nghe store và event bus
    const unsubSpeak = eventBus.on('agent:speak', (id, text) => {
      const char = this.chars.get(id);
      if (char) char.say(text);
    });

    const unsubSkills = eventBus.on('agent:skills-updated', (payload: { id: string; speech?: string }) => {
      const char = this.chars.get(payload.id);
      if (char) {
        this.chars.forEach((c) => c.setSelected(false));
        char.setSelected(true);
        char.say(payload.speech || '⚡ Kỹ năng mới đã được nạp thành công!', 5000);
      }
    });

    this.unsub = () => {
      unsubSpeak();
      unsubSkills();
    };

    // Ticker loop
    this.app.ticker.add((tk) => this.tick(tk.deltaTime));
  }

  destroy() {
    this.destroyed = true;
    if (this.unsub) this.unsub();
    if (this.resizeObs) this.resizeObs.disconnect();
    this.app.destroy(true, { children: true });
  }

  private fit() {
    if (!this.app.renderer || !this.app.screen) return;
    const w = this.app.screen.width;
    const h = this.app.screen.height;
    if (w <= 0 || h <= 0) return;

    const scale = Math.min((w - 40) / WORLD_W, (h - 40) / WORLD_H, 1.25);
    this.world.scale.set(scale);
    this.world.position.set((w - WORLD_W * scale) / 2, (h - WORLD_H * scale) / 2);
  }

  private drawStudio() {
    const bg = new Graphics();

    // Sàn nhà Studio (Dark tech theme)
    bg.roundRect(0, 0, WORLD_W, WORLD_H, 16)
      .fill(0x0c0f17)
      .stroke({ width: 2, color: 0x1e293b });

    // Grid lines nhẹ
    for (let x = 0; x <= COLS; x++) {
      bg.moveTo(x * TILE, 0)
        .lineTo(x * TILE, WORLD_H)
        .stroke({ width: 0.5, color: 0x161f30, alpha: 0.4 });
    }
    for (let y = 0; y <= ROWS; y++) {
      bg.moveTo(0, y * TILE)
        .lineTo(WORLD_W, y * TILE)
        .stroke({ width: 0.5, color: 0x161f30, alpha: 0.4 });
    }

    // Các khu vực (Zones)
    ZONES.forEach((z) => {
      const zx = z.x * TILE;
      const zy = z.y * TILE;
      const zw = z.w * TILE;
      const zh = z.h * TILE;

      bg.roundRect(zx, zy, zw, zh, 10)
        .fill({ color: z.color, alpha: 0.04 })
        .stroke({ width: 1, color: z.color, alpha: 0.25 });

      const label = new Text({
        text: z.label,
        style: {
          fontFamily: FONT,
          fontSize: 10,
          fontWeight: '700',
          fill: z.color,
          letterSpacing: 1,
        },
      });
      label.position.set(zx + 10, zy + 8);
      this.floorLayer.addChild(label);
    });

    this.floorLayer.addChild(bg);

    // Vẽ bàn làm việc & nội thất
    DESKS.forEach((d) => {
      const dg = new Graphics();
      const px = d.tx * TILE;
      const py = d.ty * TILE;

      // Mặt bàn
      dg.roundRect(px + 4, py + 4, TILE * 2 - 8, TILE - 8, 6)
        .fill(0x1a2234)
        .stroke({ width: 1.5, color: d.color, alpha: 0.6 });

      // Màn hình máy tính
      dg.roundRect(px + TILE - 14, py + 8, 28, 6, 2).fill(0x38bdf8);
      // Bàn phím
      dg.roundRect(px + TILE - 10, py + 18, 20, 8, 2).fill(0x0f172a);

      // Ghế xoay
      dg.circle(px + TILE, py + TILE + 8, 9)
        .fill(0x273549)
        .stroke({ width: 1, color: d.color, alpha: 0.4 });

      // Nhãn bàn
      const deskLabel = new Text({
        text: d.label,
        style: {
          fontFamily: FONT,
          fontSize: 8,
          fontWeight: '700',
          fill: d.color,
        },
      });
      deskLabel.anchor.set(0.5, 0);
      deskLabel.position.set(px + TILE, py + TILE + 20);

      this.deskLayer.addChild(dg, deskLabel);
    });

    // Khu Lounge: Máy pha cà phê & Sofa
    const loungeG = new Graphics();
    const cx = COFFEE_MACHINE.x * TILE;
    const cy = COFFEE_MACHINE.y * TILE;
    // Máy cà phê
    loungeG.roundRect(cx + 6, cy + 6, TILE - 12, TILE - 12, 4)
      .fill(0xb45309)
      .stroke({ width: 1, color: 0xf59e0b });
    const cfLabel = new Text({
      text: '☕ BAR',
      style: { fontFamily: FONT, fontSize: 8, fill: 0xf59e0b, fontWeight: '700' },
    });
    cfLabel.position.set(cx + 8, cy + TILE - 12);

    // Sofa
    const sx = SOFA.x * TILE;
    const sy = SOFA.y * TILE;
    loungeG.roundRect(sx, sy + 4, TILE * 3, TILE - 8, 8)
      .fill(0x334155)
      .stroke({ width: 1, color: 0x64748b });

    this.deskLayer.addChild(loungeG, cfLabel);
  }

  private spawnAgents() {
    const agents = store.get().agents;
    agents.forEach((ag) => {
      const desk = DESKS.find((d) => d.role === ag.role);
      const colorHex = parseInt(ag.color.slice(1), 16);
      const char = new Character(ag, colorHex);

      if (desk) {
        const pt = seatPixel(desk);
        char.x = pt.x;
        char.y = pt.y;
      } else {
        const center = tileCenter(14, 8);
        char.x = center.x;
        char.y = center.y;
      }

      char.root.on('pointerdown', () => {
        this.chars.forEach((c) => c.setSelected(false));
        char.setSelected(true);
        char.say(ag.thought || `Tôi là ${ag.name} (${ag.title})`);
        eventBus.emit('agent:select', ag);
      });

      this.chars.set(ag.id, char);
      this.charLayer.addChild(char.root);
    });
  }

  walkAgentTo(id: string, goalTile: Pt, onArrive?: () => void) {
    const char = this.chars.get(id);
    if (!char) return;

    const startTile: Pt = {
      x: Math.round(char.x / TILE),
      y: Math.round(char.y / TILE),
    };

    const pathTiles = findPath(this.grid, startTile, goalTile);
    char.path = pathTiles.map((t) => tileCenter(t.x, t.y));
    char.onArrive = onArrive || null;
  }

  // Hành vi mô phỏng tương tác Writer sang bàn Critic
  collaborate(fromId: string, toId: string, dialog1: string, dialog2: string) {
    const fromChar = this.chars.get(fromId);
    const toChar = this.chars.get(toId);
    if (!fromChar || !toChar) return;

    const toDesk = DESKS.find((d) => d.role === toId);
    if (!toDesk) return;

    fromChar.say(dialog1, 3000);
    this.walkAgentTo(fromId, { x: toDesk.tx + 1, y: toDesk.ty + 1 }, () => {
      toChar.say(dialog2, 4000);
      setTimeout(() => {
        const homeDesk = DESKS.find((d) => d.role === fromId);
        if (homeDesk) {
          this.walkAgentTo(fromId, seatTile(homeDesk));
        }
      }, 3500);
    });
  }

  private tick(delta: number) {
    this.chars.forEach((char) => char.tick(delta));
  }
}
