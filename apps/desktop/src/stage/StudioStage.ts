import { Application, Container, Graphics, Text } from 'pixi.js';
import { DESKS } from '../core/config';
import { eventBus } from '../core/eventBus';
import { store } from '../core/store';
import type { Desk, StudioAgent } from '../core/types';
import { Character } from './Character';
import { findPath } from './pathfinding';
import {
  COLS,
  DECOR,
  HALL_Y1,
  HALL_Y2,
  HANGOUTS,
  TILE,
  V_WALLS,
  WORLD_H,
  WORLD_W,
  ZONES,
  buildGrid,
  seatPixel,
  seatTile,
  tileCenter,
  visitorTile,
  type Decor,
  type Hangout,
  type Pt,
  type Zone,
} from './studioMap';

const FONT = 'Be Vietnam Pro, Inter, system-ui, sans-serif';
const T = TILE;

const shade = (c: number, f: number) => {
  const r = Math.min(255, Math.max(0, Math.round(((c >> 16) & 0xff) * f)));
  const g = Math.min(255, Math.max(0, Math.round(((c >> 8) & 0xff) * f)));
  const b = Math.min(255, Math.max(0, Math.round((c & 0xff) * f)));
  return (r << 16) | (g << 8) | b;
};

// PRNG cố định để sàn gỗ / sách luôn vẽ giống nhau giữa các lần mở app
function seeded(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = <V>(arr: V[]) => arr[Math.floor(Math.random() * arr.length)];

const label = (text: string, size: number, fill: number, weight: '500' | '600' | '700' | '800' = '700') => {
  const dpr = Math.max(2, typeof window !== 'undefined' ? (window.devicePixelRatio || 2) : 2);
  const t = new Text({
    text,
    style: {
      fontFamily: FONT,
      fontSize: Math.round(size * dpr),
      fontWeight: weight,
      fill,
    },
  });
  t.scale.set(1 / dpr);
  return t;
};

// Phong cách bàn theo phòng studio chuyên nghiệp
const DESK_STYLE: Record<string, { top: number; panel: number; leg: number }> = {
  content: { top: 0x334155, panel: 0x1e293b, leg: 0x0f172a }, // Slate gray executive
  creative: { top: 0xc8975f, panel: 0x8a5f37, leg: 0x5b3c22 }, // Warm Walnut & brass
  critic: { top: 0x2e273f, panel: 0x1e192c, leg: 0x110d1c }, // Deep obsidian & violet
  production: { top: 0x1e2230, panel: 0x141824, leg: 0x0b0e17 }, // Matte black acoustic studio
  distribution: { top: 0x1e332c, panel: 0x12221c, leg: 0x0a1612 }, // Deep emerald slate
};

const VISIT_LINES: Array<[string, string]> = [
  ['Anh xem giúp em bản nháp này nhé?', 'Ổn đấy, chỉnh lại câu mở đầu là được!'],
  ['Deadline video tối nay kịp không?', 'Kịp, đang render đoạn cuối rồi 💪'],
  ['Có số liệu tuần này chưa?', 'Có rồi, lượt lưu tăng 18%! 📈'],
  ['Cần thêm B-roll cho cảnh 3', 'Để tôi tìm trên Pexels ngay'],
  ['Đi ăn trưa không? 🍜', 'Đợi tôi 5 phút nhé!'],
  ['Hook này có đủ "giật" chưa?', 'Thêm một câu hỏi tu từ sẽ hay hơn'],
];

const WORKING = new Set(['working', 'thinking', 'reviewing', 'assigned']);

export class StudioStage {
  private app = new Application();
  private world = new Container();
  private floorLayer = new Container();
  private objectLayer = new Container();
  private fxLayer = new Container();

  private grid = buildGrid();
  private chars = new Map<string, Character>();
  private hangoutTaken = new Map<string, string>();
  private timers = new Set<number>();
  private clockHands = new Graphics();
  private clockCenter: Pt = { x: 0, y: 0 };
  private leds: Array<{ g: Graphics; phase: number }> = [];
  private elapsed = 0;
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
    this.objectLayer.sortableChildren = true;

    this.world.addChild(this.floorLayer, this.objectLayer, this.fxLayer);
    this.app.stage.addChild(this.world);

    this.drawStudio();
    this.spawnAgents();

    this.fit();
    this.resizeObs = new ResizeObserver(() => this.fit());
    this.resizeObs.observe(host);

    const unsubSpeak = eventBus.on('agent:speak', (id, text) => {
      const char = this.chars.get(id);
      if (char) char.say(text);
    });

    const unsubUpdate = eventBus.on('agent:update', (id: string, patch: Partial<StudioAgent>) => {
      const char = this.chars.get(id);
      if (!char) return;
      if (patch.statusIcon) char.setIcon(patch.statusIcon);
      if (patch.status) {
        char.status = patch.status;
        // Có việc thì quay về bàn ngay
        if (WORKING.has(patch.status) && char.seated !== 'desk') this.goHome(char);
      }
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
      unsubUpdate();
      unsubSkills();
    };

    this.app.ticker.add((tk) => this.tick(tk.deltaTime));
    this.scheduleCoffeeBreak();
  }

  destroy() {
    this.destroyed = true;
    this.timers.forEach((t) => window.clearTimeout(t));
    this.timers.clear();
    if (this.unsub) {
      this.unsub();
      this.unsub = null;
    }
    if (this.resizeObs) {
      this.resizeObs.disconnect();
      this.resizeObs = null;
    }
    try {
      this.app.destroy(true, { children: true });
    } catch {
      // ignore
    }
  }

  private later(fn: () => void, ms: number) {
    const id = window.setTimeout(() => {
      this.timers.delete(id);
      if (!this.destroyed) fn();
    }, ms);
    this.timers.add(id);
  }

  private fit() {
    if (!this.app.renderer || !this.app.screen) return;
    const w = this.app.screen.width;
    const h = this.app.screen.height;
    if (w <= 0 || h <= 0) return;

    const scale = Math.min((w - 24) / WORLD_W, (h - 56) / WORLD_H, 1.4);
    this.world.scale.set(scale);
    // Làm tròn pixel để triệt tiêu hiện tượng sub-pixel bilinear blur trên màn hình Retina
    this.world.position.set(
      Math.round((w - WORLD_W * scale) / 2),
      Math.round((h - 36 - WORLD_H * scale) / 2)
    );
  }

  // ───────────────────────────── VẼ VĂN PHÒNG ─────────────────────────────

  private drawStudio() {
    const g = new Graphics();
    this.floorLayer.addChild(g);

    // Khối tường bao (nhìn từ trên xuống)
    g.roundRect(-6, -6, WORLD_W + 12, WORLD_H + 12, 14).fill(0x14161d);
    g.roundRect(0, 0, WORLD_W, WORLD_H, 10).fill(0x262a35);

    // Sàn hành lang: Bê tông mài cao cấp cho Studio (Polished Concrete Concourse)
    const hy = HALL_Y1 * T;
    const hh = (HALL_Y2 - HALL_Y1) * T;
    g.rect(T, hy, (COLS - 2) * T, hh).fill(0x111622);

    // Gạch lát khổ lớn 84x84 (2 tiles) với rãnh kỹ thuật tinh tế
    for (let x = 1; x < COLS - 1; x += 2) {
      for (let y = 0; y < 3; y++) {
        const tw = Math.min(2, COLS - 1 - x) * T;
        const th = hh / 3;
        g.rect(x * T, hy + y * th, tw, th).stroke({ width: 0.8, color: 0x1e2738, alpha: 0.7 });
      }
    }

    // Đường line dẫn hướng LED thông minh phát sáng chạy dọc hành lang trung tâm
    g.roundRect(2.0 * T, 7.6 * T, (COLS - 4) * T, 0.8 * T, 4).fill({ color: 0x161e2e, alpha: 0.9 });
    g.rect(2.0 * T, 7.6 * T, (COLS - 4) * T, 1.2).fill({ color: 0x06b6d4, alpha: 0.6 }); // Cyan top LED guide
    g.rect(2.0 * T, 8.4 * T - 1.2, (COLS - 4) * T, 1.2).fill({ color: 0x8b5cf6, alpha: 0.5 }); // Violet bottom LED guide

    ZONES.forEach((z, i) => this.drawZoneFloor(g, z, i));
    this.drawRugs(g);
    this.drawBackWall(g);
    this.drawPartitions(g);

    // Đèn trần hắt sáng nhẹ xuống sàn
    const lights = new Graphics();
    ZONES.forEach((z) => {
      const cx = (z.x + z.w / 2) * T;
      const cy = (z.y + z.h / 2) * T;
      lights.ellipse(cx, cy, z.w * T * 0.42, z.h * T * 0.42).fill({ color: 0xfff7e0, alpha: 0.045 });
      lights.ellipse(cx, cy, z.w * T * 0.25, z.h * T * 0.25).fill({ color: 0xfff7e0, alpha: 0.04 });
    });
    this.floorLayer.addChild(lights);

    // Hộp đèn LED "• ON AIR" phía trên cửa Studio Sản Xuất (STUDIO-A)
    const onAirX = 4.8 * T;
    const onAirY = HALL_Y2 * T - 18;
    g.roundRect(onAirX, onAirY, 44, 15, 3).fill(0x380909).stroke({ width: 1.2, color: 0xef4444 });
    const recLed = new Graphics().circle(onAirX + 7, onAirY + 7.5, 2.5).fill(0xef4444);
    recLed.zIndex = 100;
    this.leds.push({ g: recLed, phase: 0 });
    this.floorLayer.addChild(recLed);
    const onAirTxt = label('ON AIR', 6.5, 0xfca5a5, '800');
    onAirTxt.position.set(onAirX + 13, onAirY + 3);
    this.floorLayer.addChild(onAirTxt);

    ZONES.filter((z) => !z.top).forEach((z) => this.drawRoomSign(z, (z.doorX + 1.25) * T, HALL_Y2 * T - 13));

    DESKS.forEach((d) => this.drawWorkstation(d));
    DECOR.forEach((d) => this.drawDecor(d));
  }

  private drawZoneFloor(g: Graphics, z: Zone, idx: number) {
    const x = z.x * T;
    const y = z.y * T;
    const w = z.w * T;
    const h = z.h * T;
    const rnd = seeded(100 + idx);
    g.rect(x, y, w, h).fill(z.floorColor);

    if (z.floor === 'wood' || z.floor === 'lounge') {
      const ph = 10;
      for (let py = y; py < y + h; py += ph) {
        let px = x - rnd() * 60;
        while (px < x + w) {
          const len = 55 + rnd() * 60;
          const x0 = Math.max(x, px);
          const x1 = Math.min(x + w, px + len);
          const f = 0.92 + rnd() * 0.14;
          g.rect(x0, py, x1 - x0, Math.min(ph, y + h - py)).fill(shade(z.floorColor, f));
          g.rect(x1 - 1, py, 1, Math.min(ph, y + h - py)).fill({ color: 0x000000, alpha: 0.18 });
          px += len;
        }
        g.rect(x, py + ph - 1, w, 1).fill({ color: 0x000000, alpha: 0.15 });
      }
    } else if (z.floor === 'carpet') {
      // Thảm tấm văn phòng 50x50
      const s = T / 2;
      for (let py = y; py < y + h; py += s) {
        for (let px = x; px < x + w; px += s) {
          const alt = (Math.round((px - x) / s) + Math.round((py - y) / s)) % 2 === 0;
          g.rect(px, py, Math.min(s, x + w - px), Math.min(s, y + h - py)).fill(shade(z.floorColor, alt ? 1.06 : 0.96));
        }
      }
    } else if (z.floor === 'studio') {
      // Sàn tiêu âm tối, viền ô nhẹ
      for (let py = y; py < y + h; py += T) {
        for (let px = x; px < x + w; px += T) {
          g.rect(px + 1, py + 1, Math.min(T, x + w - px) - 2, Math.min(T, y + h - py) - 2).fill(shade(z.floorColor, 0.94 + rnd() * 0.1));
        }
      }
    }

    // Bóng tối nhẹ sát chân tường
    g.rect(x, y, w, 6).fill({ color: 0x000000, alpha: 0.18 });
  }

  private drawRugs(g: Graphics) {
    // 1. ROOM-101 (Chiến Lược Nội Dung) - Thảm màu xanh navy hiện đại
    const r1x = 1.8 * T;
    const r1y = 3.6 * T;
    g.roundRect(r1x, r1y, 5.8 * T, 2.4 * T, 8).fill({ color: 0x0f172a, alpha: 0.65 });
    g.roundRect(r1x + 4, r1y + 4, 5.8 * T - 8, 2.4 * T - 8, 6).stroke({ width: 1.5, color: 0x38bdf8, alpha: 0.35 });

    // 2. ROOM-102 (Sáng Tác Kịch Bản) - Thảm dệt Bohemian ấm cúng
    const r2x = 9.5 * T;
    const r2y = 3.6 * T;
    g.roundRect(r2x, r2y, 7.0 * T, 2.4 * T, 8).fill({ color: 0x3b1d11, alpha: 0.65 });
    g.roundRect(r2x + 4, r2y + 4, 7.0 * T - 8, 2.4 * T - 8, 6).stroke({ width: 1.5, color: 0xf59e0b, alpha: 0.4 });

    // 3. ROOM-103 (Kiểm Định Chất Lượng) - Thảm nhung tím thanh lịch
    const r3x = 18.5 * T;
    const r3y = 3.6 * T;
    g.roundRect(r3x, r3y, 7.4 * T, 2.4 * T, 8).fill({ color: 0x271438, alpha: 0.7 });
    g.roundRect(r3x + 4, r3y + 4, 7.4 * T - 8, 2.4 * T - 8, 6).stroke({ width: 1.5, color: 0xc084fc, alpha: 0.35 });

    // 4. STUDIO-A (Sản Xuất 9:16) - Thảm cao su tiêu âm công nghiệp & viền cảnh báo Studio
    const r4x = 1.8 * T;
    const r4y = 12.0 * T;
    g.roundRect(r4x, r4y, 6.8 * T, 2.6 * T, 6).fill({ color: 0x090d16, alpha: 0.8 });
    g.roundRect(r4x + 3, r4y + 3, 6.8 * T - 6, 2.6 * T - 6, 4).stroke({ width: 1.5, color: 0xeab308, alpha: 0.45 });

    // 5. HUB-201 (Điều Phối Phát Hành) - Thảm công nghệ xanh ngọc
    const r5x = 10.2 * T;
    const r5y = 12.0 * T;
    g.roundRect(r5x, r5y, 6.5 * T, 2.6 * T, 8).fill({ color: 0x063a2f, alpha: 0.65 });
    g.roundRect(r5x + 4, r5y + 4, 6.5 * T - 8, 2.6 * T - 8, 6).stroke({ width: 1.5, color: 0x34d399, alpha: 0.35 });

    // 6. CREATIVE LOUNGE - Thảm lounge cao cấp dưới sofa & bàn trà
    const r6x = 18.2 * T;
    const r6y = 10.5 * T;
    g.roundRect(r6x, r6y, 8.0 * T, 4.0 * T, 10).fill({ color: 0x382110, alpha: 0.75 });
    g.roundRect(r6x + 6, r6y + 6, 8.0 * T - 12, 4.0 * T - 12, 8).stroke({ width: 2, color: 0xfbbf24, alpha: 0.5 });
    for (let i = 0; i < 8; i++) {
      g.circle(r6x + 4.0 * T + Math.cos((i / 8) * Math.PI * 2) * 55, r6y + 2.0 * T + Math.sin((i / 8) * Math.PI * 2) * 35, 3.5).fill({ color: 0xfbbf24, alpha: 0.3 });
    }
  }

  private drawBackWall(g: Graphics) {
    const wallTop = 4;
    const wallH = T - wallTop;
    ZONES.filter((z) => z.top).forEach((z) => {
      const x = z.x * T;
      const w = z.w * T;
      const studio = z.id === 'production';
      const wallCol = studio ? 0x4b4562 : z.id === 'content' ? 0xdfe7ee : z.id === 'critic' ? 0xe5e0ed : 0xece4d4;

      g.rect(x, wallTop, w, wallH).fill(wallCol);
      if (studio) {
        // Mút tiêu âm dạng tam giác
        for (let px = x + 4; px < x + w - 8; px += 14) {
          g.poly([px, T - 6, px + 7, wallTop + 8, px + 14, T - 6]).fill({ color: 0x000000, alpha: 0.12 });
        }
      }
      g.rect(x, T - 4, w, 4).fill(shade(wallCol, 0.7)); // chân tường

      const sign = this.drawRoomSign(z, x + 8, wallTop + 6);
      let cursor = x + 16 + sign;
      const wallItems: Record<string, Array<'window' | 'clock' | string>> = {
        content: ['window', 'board:ROADMAP'],
        creative: ['board:HOOK MATRIX', 'clock', 'window'],
        critic: ['window', 'board:QC AUDIT'],
        production: ['onair', 'window', 'board:A/V LOG'],
      };
      (wallItems[z.id] ?? []).forEach((item) => {
        const remain = x + w - 8 - cursor;
        if (item === 'window' && remain >= 62) {
          this.drawWindow(g, cursor, wallTop + 5, 62, wallH - 12);
          cursor += 72;
        } else if (item === 'clock' && remain >= 30) {
          this.clockCenter = { x: cursor + 13, y: wallTop + wallH / 2 - 1 };
          g.circle(this.clockCenter.x, this.clockCenter.y, 12).fill(0xffffff).stroke({ width: 2, color: 0x334155 });
          for (let i = 0; i < 12; i++) {
            const a = (i / 12) * Math.PI * 2;
            g.circle(this.clockCenter.x + Math.cos(a) * 9, this.clockCenter.y + Math.sin(a) * 9, 0.8).fill(0x334155);
          }
          cursor += 36;
        } else if (item === 'onair' && remain >= 46) {
          g.roundRect(cursor, wallTop + 10, 42, 16, 4).fill(0x450a0a).stroke({ width: 1, color: 0xef4444 });
          const t = label('ON AIR', 7.5, 0xfca5a5, '800');
          t.anchor.set(0.5);
          t.position.set(cursor + 21, wallTop + 18);
          this.floorLayer.addChild(t);
          cursor += 52;
        } else if (item.startsWith('board:') && remain >= 80) {
          const bw = Math.min(110, remain);
          this.drawWhiteboard(g, cursor, wallTop + 4, bw, wallH - 10, item.slice(6));
          cursor += bw + 10;
        }
      });
    });

    this.floorLayer.addChild(this.clockHands);
  }

  private drawWindow(g: Graphics, x: number, y: number, w: number, h: number) {
    g.roundRect(x - 2, y - 2, w + 4, h + 4, 3).fill(0xf8fafc);
    g.rect(x, y, w, h).fill(0x7dd3fc);
    g.rect(x, y + h * 0.55, w, h * 0.45).fill(0xbae6fd);
    // Toà nhà phía xa
    g.rect(x + 6, y + h * 0.45, 10, h * 0.55).fill({ color: 0x64748b, alpha: 0.5 });
    g.rect(x + 20, y + h * 0.3, 8, h * 0.7).fill({ color: 0x64748b, alpha: 0.4 });
    g.rect(x + 40, y + h * 0.5, 14, h * 0.5).fill({ color: 0x64748b, alpha: 0.45 });
    g.poly([x + 8, y + h, x + 18, y, x + 24, y, x + 14, y + h]).fill({ color: 0xffffff, alpha: 0.25 });
    g.rect(x + w / 2 - 1, y, 2, h).fill(0xf8fafc);
    g.rect(x, y + h - 3, w, 3).fill(0xe2e8f0);
    // Ánh nắng chiếu xuống sàn
    g.poly([x, T, x + w, T, x + w + 26, T + 62, x + 18, T + 62]).fill({ color: 0xfffbeb, alpha: 0.07 });
  }

  private drawWhiteboard(g: Graphics, x: number, y: number, w: number, h: number, title: string) {
    g.roundRect(x, y, w, h, 2).fill(0xffffff).stroke({ width: 2, color: 0x94a3b8 });
    const colors = [0xfef08a, 0xa7f3d0, 0xfbcfe8, 0xbfdbfe, 0xfed7aa];
    for (let i = 0; i < Math.floor((w - 10) / 13); i++) {
      g.rect(x + 6 + i * 13, y + 14 + (i % 2) * 3, 9, 9).fill(colors[i % colors.length]);
    }
    g.moveTo(x + 6, y + h - 4).lineTo(x + w * 0.4, y + h - 8).lineTo(x + w * 0.7, y + h - 6).stroke({ width: 1, color: 0x2563eb, alpha: 0.6 });
    g.rect(x + w - 18, y + h, 14, 2).fill(0x64748b); // khay bút
    const t = label(title, 6.5, 0x334155, '800');
    t.position.set(x + 5, y + 3);
    this.floorLayer.addChild(t);
  }

  // Trả về chiều rộng biển tên
  private drawRoomSign(z: Zone, x: number, y: number): number {
    const box = new Container();
    const code = label(z.code, 8.5, 0xffffff, '800');
    const title = label(z.label, 10, 0xffffff, '700');
    const sub = label(z.sub, 7.5, 0x94a3b8, '500');
    const codeW = code.width + 12;
    const w = codeW + Math.max(title.width, sub.width) + 16;
    const bg = new Graphics()
      .roundRect(0, 0, w, 28, 5)
      .fill({ color: 0x0b1020, alpha: 0.94 })
      .stroke({ width: 1.2, color: z.color, alpha: 0.85 });
    bg.roundRect(4, 5, codeW, 18, 3).fill(z.color);
    code.position.set(10, 9);
    title.position.set(codeW + 10, 2);
    sub.position.set(codeW + 10, 15);
    box.addChild(bg, code, title, sub);
    box.position.set(x, y);
    this.floorLayer.addChild(box);
    return w;
  }

  private drawPartitions(g: Graphics) {
    const doorsAt = (row: number) => ZONES.filter((z) => z.doorY === Math.floor(row)).map((z) => z.doorX);

    const hWall = (row: number) => {
      const y = row * T;
      const doors = doorsAt(row);
      for (let x = 1; x < COLS - 1; x++) {
        if (doors.includes(x)) {
          // Khung cửa + thảm chùi chân
          g.rect(x * T - 2, y - 6, 5, 22).fill(0x64748b);
          g.rect((x + 1) * T - 3, y - 6, 5, 22).fill(0x64748b);
          g.roundRect(x * T + 6, y + 2, T - 12, 12, 3).fill(0x3f3f46);
          continue;
        }
        g.rect(x * T, y + 1, T, 14).fill({ color: 0xbae6fd, alpha: 0.22 }); // mặt kính
        g.rect(x * T, y + 1, T, 14).stroke({ width: 0.5, color: 0xe0f2fe, alpha: 0.35 });
        g.poly([x * T + 8, y + 15, x * T + 14, y + 1, x * T + 18, y + 1, x * T + 12, y + 15]).fill({ color: 0xffffff, alpha: 0.18 });
        g.rect(x * T, y - 4, T, 5).fill(0xd1d5db); // nẹp nhôm trên
        g.rect(x * T, y + 14, T, 2).fill(0x94a3b8);
      }
    };
    hWall(HALL_Y1);
    hWall(HALL_Y2);

    V_WALLS.forEach((w) => {
      const x = w.x * T;
      g.rect(x - 3, w.y1 * T, 6, (w.y2 - w.y1) * T).fill(0xd1d5db);
      g.rect(x + 3, w.y1 * T, 3, (w.y2 - w.y1) * T).fill({ color: 0x000000, alpha: 0.2 });
    });
  }

  private zoneOf(px: number, py: number): Zone | undefined {
    return ZONES.find((z) => px >= z.x * T && px < (z.x + z.w) * T && py >= z.y * T && py < (z.y + z.h) * T);
  }

  private drawWorkstation(d: Desk) {
    const px = d.tx * T;
    const py = d.ty * T;
    const cx = px + T;
    const zone = this.zoneOf(cx, py + 4);
    const style = DESK_STYLE[zone?.id ?? 'creative'] ?? DESK_STYLE.creative;

    // ── Ghế văn phòng (sau bàn, mỗi bàn đúng 1 ghế) ──
    const chair = new Graphics();
    const chairCol = shade(d.color, 0.55);
    chair.ellipse(cx, py - 2, 15, 5).fill({ color: 0x000000, alpha: 0.25 });
    chair.rect(cx - 1.5, py - 10, 3, 8).fill(0x3f3f46);
    chair.roundRect(cx - 14, py - 46, 28, 28, 8).fill(chairCol).stroke({ width: 1.5, color: shade(d.color, 0.35) });
    chair.roundRect(cx - 10, py - 42, 20, 20, 6).fill(shade(d.color, 0.68));
    chair.roundRect(cx - 14, py - 20, 28, 11, 4).fill(shade(d.color, 0.45));
    chair.roundRect(cx - 17, py - 26, 4, 12, 2).fill(0x27272a);
    chair.roundRect(cx + 13, py - 26, 4, 12, 2).fill(0x27272a);
    chair.zIndex = py - 30;
    this.objectLayer.addChild(chair);

    // ── Bàn làm việc ──
    const desk = new Graphics();
    const w = 2 * T - 6;
    const x = px + 3;
    desk.roundRect(x + 4, py + 28, w - 8, 8, 4).fill({ color: 0x000000, alpha: 0.28 });
    desk.rect(x + 4, py + 16, 4, 18).fill(style.leg);
    desk.rect(x + w - 8, py + 16, 4, 18).fill(style.leg);
    desk.roundRect(x + 2, py + 14, w - 4, 16, 2).fill(style.panel);
    desk.rect(x + 2, py + 14, w - 4, 3).fill({ color: 0x000000, alpha: 0.18 });
    desk.roundRect(x, py - 6, w, 22, 4).fill(style.top);
    desk.rect(x + 3, py - 5, w - 6, 2).fill({ color: 0xffffff, alpha: 0.25 });
    desk.rect(x, py + 13, w, 3).fill(shade(style.top, 0.82));

    // Màn hình (nhìn từ phía sau, viền phát sáng màu của agent)
    const monitor = (mx: number, mw: number) => {
      desk.ellipse(mx + mw / 2, py + 6, 8, 2.5).fill(0x27272a);
      desk.rect(mx + mw / 2 - 2, py - 6, 4, 12).fill(0x3f3f46);
      desk.roundRect(mx - 2, py - 30, mw + 4, 24, 3).fill({ color: d.color, alpha: 0.35 });
      desk.roundRect(mx, py - 28, mw, 20, 2).fill(0x1f2937).stroke({ width: 1, color: 0x111827 });
      desk.circle(mx + mw / 2, py - 18, 2).fill({ color: 0xffffff, alpha: 0.18 });
    };
    const dual = d.role === 'producer' || d.role === 'writer' || d.role === 'publisher';
    monitor(px + 8, 24);
    if (d.role === 'publisher') {
      // Màn hình preview đứng 9:16 (mô phỏng TikTok/Instagram Reels)
      const mx = px + 2 * T - 26;
      desk.ellipse(mx + 8, py + 6, 6, 2).fill(0x27272a);
      desk.rect(mx + 6, py - 4, 4, 10).fill(0x3f3f46);
      desk.roundRect(mx - 1, py - 36, 18, 32, 2.5).fill({ color: d.color, alpha: 0.4 });
      desk.roundRect(mx, py - 35, 16, 30, 2).fill(0x0f172a).stroke({ width: 0.8, color: 0x111827 });
      desk.circle(mx + 8, py - 20, 2).fill({ color: 0x22c55e, alpha: 0.8 });
    } else if (dual) {
      monitor(px + 2 * T - 32, 24);
    }

    if (d.role === 'critic') {
      // Hood che sáng chống lóa cho màn hình chuẩn màu (Reference Grading Monitor Hood)
      desk.moveTo(px + 6, py - 30).lineTo(px + 3, py - 34).lineTo(px + 35, py - 34).lineTo(px + 32, py - 30).fill(0x18181b);
      desk.rect(px + 5, py - 30, 2, 24).fill(0x18181b);
      desk.rect(px + 33, py - 30, 2, 24).fill(0x18181b);
    }

    // Bàn phím + chuột
    desk.roundRect(cx - 12, py + 1, 24, 7, 1.5).fill(0x1f2937);
    for (let k = 0; k < 3; k++) desk.rect(cx - 10, py + 2.3 + k * 1.8, 20, 0.8).fill({ color: 0x9ca3af, alpha: 0.6 });
    desk.ellipse(cx + 18, py + 5, 2.5, 3.2).fill(0x374151);

    // Đồ dùng trên bàn — thiết kế chuyên dụng cho từng vai trò trong Video Studio
    const rx = dual ? px + 12 : px + 2 * T - 18;
    switch (d.role) {
      case 'producer':
        // Loa kiểm âm phòng thu (Studio Monitors) 2 bên bàn
        desk.roundRect(px + 4, py - 18, 10, 14, 2).fill(0x18181b).stroke({ width: 1, color: 0x3f3f46 });
        desk.circle(px + 9, py - 13, 2.5).fill(0xf59e0b); // tweeter
        desk.circle(px + 9, py - 7, 3.8).fill(0x27272a); // woofer

        desk.roundRect(px + 2 * T - 14, py - 18, 10, 14, 2).fill(0x18181b).stroke({ width: 1, color: 0x3f3f46 });
        desk.circle(px + 2 * T - 9, py - 13, 2.5).fill(0xf59e0b);
        desk.circle(px + 2 * T - 9, py - 7, 3.8).fill(0x27272a);

        // Micro thu âm cần boom (Boom-arm mic + pop filter)
        desk.moveTo(px + 2 * T - 22, py + 8).lineTo(px + 2 * T - 16, py - 10).lineTo(px + 2 * T - 26, py - 18).stroke({ width: 1.8, color: 0x52525b });
        desk.circle(px + 2 * T - 26, py - 18, 4).fill(0x18181b).stroke({ width: 1, color: d.color });
        break;

      case 'publisher':
        // Bàn điều khiển Stream Deck với phím macro đa sắc
        desk.roundRect(px + 8, py + 2, 14, 9, 2).fill(0x18181b).stroke({ width: 1, color: 0x3f3f46 });
        for (let r = 0; r < 2; r++) {
          for (let c = 0; c < 3; c++) {
            desk.rect(px + 10 + c * 4, py + 3.5 + r * 3.5, 2.5, 2).fill(r === 0 ? 0x22c55e : 0x06b6d4);
          }
        }
        break;

      case 'critic':
        // Đèn rọi kiểm duyệt + Kẹp hồ sơ QC
        desk.ellipse(px + 2 * T - 12, py + 8, 5, 2).fill(0x27272a);
        desk.moveTo(px + 2 * T - 12, py + 8).lineTo(px + 2 * T - 16, py - 8).lineTo(px + 2 * T - 8, py - 16).stroke({ width: 1.8, color: 0x64748b });
        desk.ellipse(px + 2 * T - 8, py - 16, 5, 2).fill({ color: 0xfde68a, alpha: 0.9 });
        // Bảng kẹp tài liệu QC checklist
        desk.roundRect(px + 8, py, 11, 14, 1.5).fill(0x78350f);
        desk.rect(px + 9, py + 1.5, 9, 11).fill(0xf8fafc);
        for (let l = 0; l < 3; l++) desk.rect(px + 11, py + 3 + l * 2.5, 5, 0.8).fill(0x64748b);
        break;

      case 'writer':
        // Sổ tay kịch bản + bút ký
        desk.roundRect(px + 2 * T - 20, py, 12, 13, 2).fill(0x292524);
        desk.rect(px + 2 * T - 19, py + 1, 10, 11).fill(0xfafaf9);
        for (let l = 0; l < 4; l++) desk.rect(px + 2 * T - 17, py + 2.5 + l * 2.2, 6, 0.7).fill(0x78716c);
        desk.rect(px + 2 * T - 7, py + 2, 1.2, 9).fill(0xf59e0b);
        break;

      case 'planner':
        // Lịch xuất bản & bảng màu đề tài
        desk.roundRect(px + 8, py + 1, 13, 11, 1.5).fill(0x0f172a).stroke({ width: 0.8, color: 0x38bdf8 });
        const swatches = [0x38bdf8, 0x10b981, 0xa855f7, 0xf59e0b];
        swatches.forEach((sc, idx) => {
          desk.rect(px + 10 + (idx % 2) * 5, py + 2.5 + Math.floor(idx / 2) * 4, 3.5, 2.5).fill(sc);
        });
        // Cây cảnh mini phong thủy
        desk.roundRect(px + 2 * T - 15, py + 1, 7, 6, 1.5).fill(0xf5f5f4);
        desk.circle(px + 2 * T - 11.5, py - 1, 3.5).fill(0x16a34a);
        desk.circle(px + 2 * T - 11.5, py - 4, 2.5).fill(0x4ade80);
        break;
    }
    // Ly cà phê
    const mugX = dual ? cx - 22 : px + 2 * T - 30;
    desk.roundRect(mugX, py + 3, 6, 7, 1.5).fill(0xffffff);
    desk.rect(mugX + 1, py + 3.5, 4, 1.5).fill(0x78350f);
    desk.moveTo(mugX + 7, py + 4.5).arc(mugX + 7, py + 6.5, 2, -Math.PI / 2, Math.PI / 2).stroke({ width: 1, color: 0xffffff });

    desk.zIndex = py + 34;
    this.objectLayer.addChild(desk);

    // Bảng tên chức danh đặt dưới chân bàn
    const plate = new Container();
    const t = label(d.label, 8.5, 0xffffff, '800');
    t.anchor.set(0.5);
    const pw = t.width + 16;
    const bg = new Graphics()
      .roundRect(-pw / 2, -8, pw, 16, 4)
      .fill({ color: 0x0b1020, alpha: 0.92 })
      .stroke({ width: 1.2, color: d.color, alpha: 0.9 });
    bg.circle(-pw / 2 + 7, 0, 2.5).fill(d.color);
    t.x = 4;
    plate.addChild(bg, t);
    plate.position.set(cx, py + 44);
    plate.zIndex = py + 35;
    this.objectLayer.addChild(plate);
  }

  private drawDecor(d: Decor) {
    const g = new Graphics();
    const x = d.x * T;
    const y = d.y * T;
    const w = (d.w ?? 1) * T;
    const bottom = y + (d.h ?? 1) * T;
    const cx = x + w / 2;
    const shadow = (sw: number) => g.ellipse(cx, bottom - 6, sw, 5).fill({ color: 0x000000, alpha: 0.25 });

    switch (d.kind) {
      case 'plant':
        shadow(12);
        g.poly([cx - 9, bottom - 20, cx + 9, bottom - 20, cx + 7, bottom - 6, cx - 7, bottom - 6]).fill(0xe7e5e4);
        g.rect(cx - 9, bottom - 21, 18, 3).fill(0xd6d3d1);
        g.circle(cx - 6, bottom - 26, 7).fill(0x15803d);
        g.circle(cx + 6, bottom - 26, 7).fill(0x16a34a);
        g.circle(cx, bottom - 32, 8).fill(0x22c55e);
        g.circle(cx - 2, bottom - 35, 3).fill({ color: 0xffffff, alpha: 0.15 });
        break;
      case 'tallPlant':
        shadow(13);
        g.roundRect(cx - 10, bottom - 22, 20, 17, 4).fill(0x78716c);
        g.rect(cx - 10, bottom - 22, 20, 3).fill(0x57534e);
        g.rect(cx - 1, bottom - 40, 2, 20).fill(0x65a30d);
        for (let i = 0; i < 7; i++) {
          const a = -Math.PI / 2 + (i - 3) * 0.45;
          g.ellipse(cx + Math.cos(a) * 12, bottom - 40 + Math.sin(a) * 14, 7, 4).fill(i % 2 ? 0x16a34a : 0x15803d);
        }
        g.circle(cx, bottom - 52, 7).fill(0x22c55e);
        break;
      case 'cabinet':
        shadow(16);
        g.roundRect(x + 6, bottom - 52, w - 12, 46, 3).fill(0x9ca3af).stroke({ width: 1, color: 0x6b7280 });
        for (let i = 0; i < 3; i++) {
          g.rect(x + 9, bottom - 49 + i * 14, w - 18, 12).fill(0xb4bac4);
          g.roundRect(cx - 5, bottom - 44 + i * 14, 10, 2.5, 1).fill(0x4b5563);
        }
        break;
      case 'bookshelf': {
        shadow(18);
        const rnd = seeded(d.x * 31 + d.y);
        g.roundRect(x + 3, bottom - 62, w - 6, 56, 3).fill(0x7c4a26);
        const books = [0xef4444, 0x3b82f6, 0x22c55e, 0xeab308, 0xa855f7, 0xf97316, 0x14b8a6, 0xf8fafc];
        for (let s = 0; s < 3; s++) {
          const sy = bottom - 58 + s * 17;
          g.rect(x + 6, sy, w - 12, 15).fill(0x4a2c17);
          let bx = x + 7;
          while (bx < x + w - 10) {
            const bw = 3 + rnd() * 3;
            const bh = 9 + rnd() * 5;
            g.rect(bx, sy + 15 - bh, bw, bh).fill(books[Math.floor(rnd() * books.length)]);
            bx += bw + 0.6;
          }
        }
        break;
      }
      case 'softbox':
        shadow(14);
        g.moveTo(cx, bottom - 30).lineTo(cx - 10, bottom - 6).stroke({ width: 1.5, color: 0x3f3f46 });
        g.moveTo(cx, bottom - 30).lineTo(cx + 10, bottom - 6).stroke({ width: 1.5, color: 0x3f3f46 });
        g.rect(cx - 1, bottom - 50, 2, 22).fill(0x52525b);
        g.circle(cx, bottom - 58, 22).fill({ color: 0xfef9c3, alpha: 0.08 });
        g.roundRect(cx - 14, bottom - 72, 28, 22, 3).fill(0x18181b);
        g.roundRect(cx - 11, bottom - 69, 22, 16, 2).fill(0xfefce8);
        break;
      case 'serverRack': {
        shadow(16);
        g.roundRect(x + 6, bottom - 64, w - 12, 58, 3).fill(0x18181b).stroke({ width: 1, color: 0x3f3f46 });
        for (let i = 0; i < 6; i++) {
          g.rect(x + 9, bottom - 60 + i * 9, w - 18, 7).fill(0x27272a);
          const led = new Graphics().circle(x + w - 13, bottom - 56.5 + i * 9, 1.4).fill(i % 3 === 0 ? 0xf59e0b : 0x22c55e);
          led.zIndex = bottom + 1;
          this.leds.push({ g: led, phase: i * 1.7 + Math.random() * 3 });
          this.objectLayer.addChild(led);
        }
        break;
      }
      case 'dashboard': {
        shadow(30);
        g.rect(cx - 2, bottom - 26, 4, 20).fill(0x3f3f46);
        g.roundRect(cx - 16, bottom - 9, 32, 5, 2).fill(0x27272a);
        g.roundRect(x + 4, bottom - 64, w - 8, 40, 3).fill(0x0f172a).stroke({ width: 2, color: 0x334155 });
        const bars = [0.4, 0.55, 0.5, 0.7, 0.65, 0.85, 0.95];
        bars.forEach((b, i) => g.rect(x + 12 + i * 8, bottom - 30 - b * 22, 5, b * 22).fill(i === bars.length - 1 ? 0x22c55e : 0x38bdf8));
        g.moveTo(x + 46 + 30, bottom - 36)
          .lineTo(x + 46 + 40, bottom - 42)
          .lineTo(x + 46 + 48, bottom - 38)
          .lineTo(x + 46 + 60, bottom - 52)
          .lineTo(x + 46 + 70, bottom - 50)
          .stroke({ width: 1.5, color: 0xf59e0b });
        const t = label('RETENTION METRICS', 5.5, 0x94a3b8, '800');
        t.position.set(x + 9, bottom - 62);
        t.zIndex = bottom;
        g.zIndex = bottom - 1;
        this.objectLayer.addChild(t);
        break;
      }
      case 'printer':
        shadow(16);
        g.rect(x + 8, bottom - 22, 4, 16).fill(0x52525b);
        g.rect(x + w - 12, bottom - 22, 4, 16).fill(0x52525b);
        g.roundRect(x + 4, bottom - 26, w - 8, 6, 2).fill(0xa8a29e);
        g.roundRect(x + 7, bottom - 42, w - 14, 17, 3).fill(0xe5e7eb).stroke({ width: 1, color: 0x9ca3af });
        g.rect(x + 12, bottom - 46, w - 24, 5).fill(0xffffff);
        g.circle(x + w - 12, bottom - 36, 1.5).fill(0x22c55e);
        break;
      case 'counter':
        shadow(w / 2 - 4);
        g.roundRect(x + 1, bottom - 30, w - 2, 24, 2).fill(0x7c4a26);
        for (let i = 0; i < (d.w ?? 1); i++) g.rect(x + i * T + 6, bottom - 26, T - 12, 16).stroke({ width: 1, color: 0x5b3418 });
        g.roundRect(x - 1, bottom - 40, w + 2, 12, 3).fill(0x292524);
        g.rect(x + 1, bottom - 38, w - 2, 2).fill({ color: 0xffffff, alpha: 0.15 });
        // Cốc trên quầy
        for (let i = 0; i < 3; i++) g.roundRect(x + T + 10 + i * 8, bottom - 46, 5, 7, 1).fill(i === 1 ? 0xfbbf24 : 0xf5f5f4);
        break;
      case 'coffeeMachine':
        g.roundRect(x + 8, bottom - 62, 26, 26, 3).fill(0x3f3f46).stroke({ width: 1, color: 0x18181b });
        g.rect(x + 12, bottom - 58, 18, 6).fill(0x18181b);
        g.circle(x + 14, bottom - 55, 1.2).fill(0xef4444);
        g.circle(x + 18, bottom - 55, 1.2).fill(0x22c55e);
        g.rect(x + 18, bottom - 50, 6, 4).fill(0x71717a);
        g.roundRect(x + 17, bottom - 44, 8, 6, 1).fill(0xffffff);
        g.zIndex = bottom + 1;
        break;
      case 'fridge':
        shadow(16);
        g.roundRect(x + 6, bottom - 74, w - 12, 68, 4).fill(0xe2e8f0).stroke({ width: 1, color: 0x94a3b8 });
        g.rect(x + 6, bottom - 50, w - 12, 1.5).fill(0x94a3b8);
        g.roundRect(x + w - 13, bottom - 68, 2.5, 12, 1).fill(0x64748b);
        g.roundRect(x + w - 13, bottom - 44, 2.5, 16, 1).fill(0x64748b);
        g.rect(x + 11, bottom - 66, 7, 7).fill(0xfde047);
        break;
      case 'waterCooler':
        shadow(12);
        g.roundRect(x + 10, bottom - 34, w - 20, 28, 3).fill(0xf8fafc).stroke({ width: 1, color: 0xcbd5e1 });
        g.rect(x + 15, bottom - 28, 4, 3).fill(0xef4444);
        g.rect(x + w - 19, bottom - 28, 4, 3).fill(0x3b82f6);
        g.roundRect(x + 12, bottom - 56, w - 24, 22, 8).fill({ color: 0x38bdf8, alpha: 0.75 });
        g.roundRect(x + 15, bottom - 53, 4, 14, 2).fill({ color: 0xffffff, alpha: 0.4 });
        break;
      case 'arcade':
        shadow(16);
        g.roundRect(x + 5, bottom - 72, w - 10, 66, 4).fill(0x581c87).stroke({ width: 1, color: 0x3b0764 });
        g.rect(x + 5, bottom - 72, w - 10, 10).fill(0xf472b6);
        g.roundRect(x + 9, bottom - 58, w - 18, 20, 2).fill(0x0f172a);
        g.rect(x + 13, bottom - 52, 4, 4).fill(0x22d3ee);
        g.rect(x + 21, bottom - 48, 4, 4).fill(0xfacc15);
        g.rect(x + 25, bottom - 54, 3, 3).fill(0xf472b6);
        g.roundRect(x + 7, bottom - 36, w - 14, 9, 2).fill(0x3b0764);
        g.circle(x + 14, bottom - 32, 2.2).fill(0xef4444);
        g.circle(x + 24, bottom - 32, 2).fill(0x22c55e);
        g.circle(x + 30, bottom - 32, 2).fill(0x3b82f6);
        break;
      case 'foosball':
        shadow(w / 2 - 6);
        g.rect(x + 6, bottom - 18, 4, 12).fill(0x3f3f46);
        g.rect(x + w - 10, bottom - 18, 4, 12).fill(0x3f3f46);
        g.roundRect(x + 2, bottom - 40, w - 4, 26, 4).fill(0x78350f);
        g.roundRect(x + 6, bottom - 37, w - 12, 20, 2).fill(0x16a34a);
        g.rect(cx - 0.5, bottom - 37, 1, 20).fill({ color: 0xffffff, alpha: 0.6 });
        g.circle(cx, bottom - 27, 3).stroke({ width: 0.8, color: 0xffffff, alpha: 0.6 });
        for (let i = 0; i < 4; i++) {
          const rx = x + 16 + i * ((w - 32) / 3);
          g.rect(rx - 0.8, bottom - 44, 1.6, 34).fill(0xd4d4d8);
          g.circle(rx, bottom - 31, 2.2).fill(i % 2 ? 0x2563eb : 0xdc2626);
          g.circle(rx, bottom - 23, 2.2).fill(i % 2 ? 0x2563eb : 0xdc2626);
        }
        g.circle(cx + 5, bottom - 26, 1.6).fill(0xffffff);
        break;
      case 'sofa': {
        // Phần lưng + đệm (sau người ngồi) và tay vịn/mép trước (trước người ngồi)
        const sofaCol = 0x2f6f8f;
        g.ellipse(cx, bottom - 2, w / 2, 6).fill({ color: 0x000000, alpha: 0.25 });
        g.roundRect(x + 2, y - 8, w - 4, 26, 8).fill(shade(sofaCol, 0.85));
        for (let c = 0; c < (d.w ?? 1); c++) {
          g.roundRect(x + c * T + 6, y - 4, T - 10, 18, 6).fill(sofaCol);
          g.roundRect(x + c * T + 6, y + 14, T - 10, 16, 5).fill(shade(sofaCol, 1.12));
        }
        g.zIndex = y + 5;
        const front = new Graphics();
        front.roundRect(x + 2, y + 28, w - 4, 10, 4).fill(shade(sofaCol, 0.7));
        front.roundRect(x - 2, y - 2, 12, 40, 6).fill(shade(sofaCol, 0.8));
        front.roundRect(x + w - 10, y - 2, 12, 40, 6).fill(shade(sofaCol, 0.8));
        front.circle(x + T * 0.5, y + 10, 5).fill(0xfbbf24); // gối tựa
        front.zIndex = y + 40;
        this.objectLayer.addChild(front);
        break;
      }
      case 'coffeeTable':
        g.ellipse(cx, bottom - 6, w / 2 - 6, 6).fill({ color: 0x000000, alpha: 0.22 });
        g.rect(x + 10, bottom - 22, 3, 16).fill(0x292524);
        g.rect(x + w - 13, bottom - 22, 3, 16).fill(0x292524);
        g.roundRect(x + 4, bottom - 32, w - 8, 14, 6).fill({ color: 0xbae6fd, alpha: 0.55 }).stroke({ width: 1.5, color: 0xe0f2fe });
        g.rect(x + 20, bottom - 30, 18, 10).fill(0xfca5a5);
        g.rect(x + 24, bottom - 29, 18, 10).fill(0xfde68a);
        g.roundRect(x + w - 40, bottom - 30, 6, 7, 1.5).fill(0xffffff);
        g.circle(x + w - 24, bottom - 26, 4).fill(0xf97316);
        break;
      case 'armchair':
        g.ellipse(cx, bottom - 6, 15, 5).fill({ color: 0x000000, alpha: 0.25 });
        g.roundRect(x + 6, bottom - 40, w - 12, 20, 7).fill(0xb45309);
        g.roundRect(x + 8, bottom - 24, w - 16, 14, 5).fill(0xd97706);
        g.roundRect(x + 3, bottom - 32, 8, 22, 4).fill(0x92400e);
        g.roundRect(x + w - 11, bottom - 32, 8, 22, 4).fill(0x92400e);
        break;
      case 'cameraRig': {
        shadow(16);
        // Chân máy studio tripod nặng 3 chạc
        g.moveTo(cx, bottom - 30).lineTo(cx - 14, bottom - 4).stroke({ width: 2, color: 0x27272a });
        g.moveTo(cx, bottom - 30).lineTo(cx, bottom - 2).stroke({ width: 2, color: 0x3f3f46 });
        g.moveTo(cx, bottom - 30).lineTo(cx + 14, bottom - 4).stroke({ width: 2, color: 0x27272a });
        // Khóa chân và cọc nâng thủy lực
        g.circle(cx - 7, bottom - 17, 1.5).fill(0x71717a);
        g.circle(cx + 7, bottom - 17, 1.5).fill(0x71717a);
        g.rect(cx - 2, bottom - 40, 4, 12).fill(0x3f3f46);
        g.roundRect(cx - 6, bottom - 42, 12, 4, 1).fill(0x18181b); // fluid head

        // Thân máy quay Cinema 4K
        g.roundRect(cx - 10, bottom - 54, 20, 13, 2).fill(0x18181b).stroke({ width: 1, color: 0x3f3f46 });
        // Pin V-Mount gắn sau
        g.roundRect(cx - 13, bottom - 52, 4, 9, 1).fill(0x27272a);
        // Ống kính điện ảnh Cine Lens & Matte box phía trước
        g.roundRect(cx + 9, bottom - 56, 10, 16, 2).fill(0x09090b).stroke({ width: 1, color: 0x18181b });
        g.ellipse(cx + 14, bottom - 48, 2, 5).fill({ color: 0x38bdf8, alpha: 0.6 });

        // Màn hình đạo diễn / Teleprompter phía trên
        g.roundRect(cx - 8, bottom - 66, 16, 11, 2).fill(0x0f172a).stroke({ width: 1, color: 0x38bdf8 });
        g.rect(cx - 6, bottom - 64, 12, 7).fill({ color: 0x38bdf8, alpha: 0.3 });

        // Đèn Tally đỏ báo đang ghi hình (blinking REC LED)
        const tally = new Graphics().circle(cx - 6, bottom - 62, 1.8).fill(0xef4444);
        tally.zIndex = bottom + 2;
        this.leds.push({ g: tally, phase: Math.random() * 3 });
        this.objectLayer.addChild(tally);
        break;
      }
    }

    if (g.zIndex === 0) g.zIndex = bottom - 4;
    this.objectLayer.addChild(g);
  }

  // ───────────────────────────── NHÂN VẬT ─────────────────────────────

  private spawnAgents() {
    const agents = store.get().agents;
    agents.forEach((ag) => {
      const desk = DESKS.find((d) => d.role === ag.role);
      const colorHex = parseInt(ag.color.slice(1), 16);
      const char = new Character(ag, colorHex);
      char.status = ag.status;

      if (desk) {
        char.sit('desk', seatPixel(desk));
      } else {
        const c = tileCenter(14, 8);
        char.x = c.x;
        char.y = c.y;
      }

      char.root.on('pointerdown', () => {
        this.chars.forEach((c) => c.setSelected(false));
        char.setSelected(true);
        char.say(ag.thought || `Tôi là ${ag.name} (${ag.title})`);
        eventBus.emit('agent:select', ag);
      });

      this.chars.set(ag.id, char);
      this.objectLayer.addChild(char.root);
      char.tick(0);
    });
  }

  walkAgentTo(id: string, goalTile: Pt, onArrive?: () => void) {
    const char = this.chars.get(id);
    if (!char) return;

    const startTile: Pt = {
      x: Math.floor(char.x / TILE),
      y: Math.floor(char.y / TILE),
    };

    const pathTiles = findPath(this.grid, startTile, goalTile);
    char.path = pathTiles.map((t) => tileCenter(t.x, t.y));
    char.onArrive = onArrive || null;
    if (char.path.length === 0) {
      char.onArrive = null;
      onArrive?.();
    }
  }

  private deskOf(id: string) {
    return DESKS.find((d) => d.role === id);
  }

  private releaseHangout(id: string) {
    this.hangoutTaken.forEach((who, h) => {
      if (who === id) this.hangoutTaken.delete(h);
    });
  }

  private goHome(char: Character, then?: () => void) {
    const desk = this.deskOf(char.id);
    this.releaseHangout(char.id);
    if (!desk) return;
    char.busy = true;
    this.walkAgentTo(char.id, seatTile(desk), () => {
      char.path = [seatPixel(desk)];
      char.onArrive = () => {
        char.sit('desk');
        char.busy = false;
        then?.();
      };
    });
  }

  private goHangout(char: Character, h: Hangout) {
    char.busy = true;
    this.hangoutTaken.set(h.id, char.id);
    this.walkAgentTo(char.id, h.tile, () => {
      const settle = () => {
        char.say(pick(h.lines), 3800);
        this.later(() => this.goHome(char), 5500 + Math.random() * 5000);
      };
      if (h.sit) {
        const sitAt = h.sit;
        char.path = [{ x: sitAt.x, y: sitAt.y }];
        char.onArrive = () => {
          char.sit('sofa');
          settle();
        };
      } else {
        char.setFacing(h.face);
        settle();
      }
    });
  }

  private visit(from: Character, to: Character, lines: [string, string], onDone?: () => void) {
    const desk = this.deskOf(to.id);
    if (!desk) {
      onDone?.();
      return;
    }
    from.busy = true;
    this.releaseHangout(from.id);
    this.walkAgentTo(from.id, visitorTile(desk), () => {
      from.setFacing('up');
      from.say(lines[0], 3200);
      this.later(() => to.say(lines[1], 3800), 1400);
      this.later(() => this.goHome(from, onDone), 5200);
    });
  }

  // Khoảng thời gian giải lao uống cà phê: khoảng 1 - 2 tiếng một lần (60 - 120 phút)
  private readonly COFFEE_INTERVAL_MIN = 60 * 60 * 1000;
  private readonly COFFEE_INTERVAL_MAX = 120 * 60 * 1000;

  private scheduleCoffeeBreak() {
    const delay =
      this.COFFEE_INTERVAL_MIN +
      Math.random() * (this.COFFEE_INTERVAL_MAX - this.COFFEE_INTERVAL_MIN);
    this.later(() => {
      this.takeCoffeeBreak();
      this.scheduleCoffeeBreak();
    }, delay);
  }

  // Cho 1 nhân sự rảnh rỗi đi lấy cà phê thư giãn tại Lounge rồi quay về bàn
  takeCoffeeBreak(agentId?: string) {
    const all = [...this.chars.values()];
    // Nếu đang có nhân sự di chuyển hoặc bận việc thì không cho thêm người rời bàn
    if (all.some((c) => c.busy)) return;

    let char: Character | undefined;
    if (agentId) {
      char = this.chars.get(agentId);
    } else {
      const free = all.filter((c) => !c.busy && c.seated === 'desk' && !WORKING.has(c.status));
      if (free.length === 0) return;
      char = pick(free);
    }

    if (!char || char.busy || char.seated !== 'desk') return;

    // Vị trí trước máy pha cà phê tại Creative Lounge: { x: 24, y: 11 }
    const coffeeTile = { x: 24, y: 11 };
    const coffeeLines = [
      '☕ Lấy một ly cà phê nạp năng lượng tiếp tục công việc...',
      '☕ Espresso nóng giúp đầu óc tỉnh táo và sáng tạo hơn.',
      '☕ Nhâm nhi chút cà phê rồi quay lại bàn làm việc.',
      '☕ Tách cà phê thơm quá, tiếp tục chiến dịch xuất bản video!',
    ];

    char.busy = true;
    this.walkAgentTo(char.id, coffeeTile, () => {
      char.setFacing('up');
      char.say(pick(coffeeLines), 4200);
      // Đứng lấy cà phê 6-8 giây rồi tự động đi thẳng về bàn làm việc của mình
      this.later(() => {
        this.goHome(char);
      }, 7000);
    });
  }

  private collabQueue: Array<{
    fromId: string;
    toId: string;
    dialog1: string;
    dialog2: string;
  }> = [];
  private isCollaborating = false;

  // Mô phỏng nhân sự mang tài liệu sang bàn nhân sự khác để trao đổi tuần tự
  collaborate(fromId: string, toId: string, dialog1: string, dialog2: string) {
    this.collabQueue.push({ fromId, toId, dialog1, dialog2 });
    this.processNextCollab();
  }

  private processNextCollab() {
    if (this.isCollaborating || this.collabQueue.length === 0) return;
    const nextItem = this.collabQueue.shift()!;
    const fromChar = this.chars.get(nextItem.fromId);
    const toChar = this.chars.get(nextItem.toId);

    if (!fromChar || !toChar) {
      this.processNextCollab();
      return;
    }

    this.isCollaborating = true;
    this.visit(fromChar, toChar, [nextItem.dialog1, nextItem.dialog2], () => {
      this.isCollaborating = false;
      this.later(() => this.processNextCollab(), 600);
    });
  }

  private tick(delta: number) {
    this.elapsed += delta;
    this.chars.forEach((char) => char.tick(delta));

    this.leds.forEach((l) => {
      l.g.alpha = 0.35 + 0.65 * Math.max(0, Math.sin(this.elapsed * 0.08 + l.phase));
    });

    // Đồng hồ treo tường chạy theo giờ thật
    if (this.clockCenter.x > 0 && Math.floor(this.elapsed) % 30 === 0) {
      const now = new Date();
      const { x, y } = this.clockCenter;
      const hA = ((now.getHours() % 12) + now.getMinutes() / 60) * (Math.PI / 6) - Math.PI / 2;
      const mA = now.getMinutes() * (Math.PI / 30) - Math.PI / 2;
      this.clockHands.clear();
      this.clockHands.moveTo(x, y).lineTo(x + Math.cos(hA) * 5.5, y + Math.sin(hA) * 5.5).stroke({ width: 1.8, color: 0x0f172a });
      this.clockHands.moveTo(x, y).lineTo(x + Math.cos(mA) * 8.5, y + Math.sin(mA) * 8.5).stroke({ width: 1.2, color: 0x334155 });
      this.clockHands.circle(x, y, 1.4).fill(0xef4444);
    }
  }
}
