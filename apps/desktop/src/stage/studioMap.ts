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

export type Facing = 'down' | 'up' | 'left' | 'right';

export const tileCenter = (tx: number, ty: number): Pt => ({
  x: tx * TILE + TILE / 2,
  y: ty * TILE + TILE / 2,
});

// Vị trí (chân) của người khi ngồi trên ghế phía sau bàn — giữa 2 ô của bàn.
export const seatPixel = (d: Desk): Pt => ({
  x: (d.tx + 1) * TILE,
  y: d.ty * TILE - 2,
});

// Ô lưới dùng để tìm đường tới ghế.
export const seatTile = (d: Desk): Pt => ({
  x: d.tx,
  y: d.ty - 1,
});

// Ô đứng trước bàn (dành cho đồng nghiệp ghé qua trao đổi).
export const visitorTile = (d: Desk): Pt => ({
  x: d.tx + 1,
  y: d.ty + 1,
});

export type FloorStyle = 'wood' | 'carpet' | 'studio' | 'lounge';

export interface Zone {
  id: string;
  code: string;
  label: string;
  sub: string;
  // Biên sàn tính theo ô (có thể lẻ nửa ô vì vách ngăn nằm giữa ô)
  x: number;
  y: number;
  w: number;
  h: number;
  color: number;
  floor: FloorStyle;
  floorColor: number;
  // Phòng hàng trên tựa vào tường sau; phòng hàng dưới có vách kính phía trên
  top: boolean;
  doorX: number;
  doorY: number;
}

export const HALL_Y1 = 6.5;
export const HALL_Y2 = 9.5;

export const ZONES: Zone[] = [
  {
    id: 'content',
    code: 'ROOM-101',
    label: 'CHIẾN LƯỢC NỘI DUNG',
    sub: 'Content Strategy & Planning',
    x: 1,
    y: 1,
    w: 7.5,
    h: 5.5,
    color: 0x06b6d4,
    floor: 'carpet',
    floorColor: 0x1e293b,
    top: true,
    doorX: 4,
    doorY: 6,
  },
  {
    id: 'creative',
    code: 'ROOM-102',
    label: 'SÁNG TÁC KỊCH BẢN',
    sub: 'Creative Script & Hook Lab',
    x: 8.5,
    y: 1,
    w: 9,
    h: 5.5,
    color: 0x10b981,
    floor: 'wood',
    floorColor: 0x6e4a2e,
    top: true,
    doorX: 13,
    doorY: 6,
  },
  {
    id: 'critic',
    code: 'ROOM-103',
    label: 'KIỂM ĐỊNH CHẤT LƯỢNG',
    sub: 'Editorial & Quality QC',
    x: 17.5,
    y: 1,
    w: 9.5,
    h: 5.5,
    color: 0xa855f7,
    floor: 'carpet',
    floorColor: 0x241a33,
    top: true,
    doorX: 22,
    doorY: 6,
  },
  {
    id: 'production',
    code: 'STUDIO-A',
    label: 'STUDIO SẢN XUẤT 9:16',
    sub: 'Voiceover & Remotion Video',
    x: 1,
    y: 9.5,
    w: 8.5,
    h: 5.5,
    color: 0xeab308,
    floor: 'studio',
    floorColor: 0x141824,
    top: false,
    doorX: 5,
    doorY: 9,
  },
  {
    id: 'distribution',
    code: 'HUB-201',
    label: 'ĐIỀU PHỐI PHÁT HÀNH',
    sub: 'Golden Hour & Growth Analytics',
    x: 9.5,
    y: 9.5,
    w: 8,
    h: 5.5,
    color: 0x22c55e,
    floor: 'carpet',
    floorColor: 0x142823,
    top: false,
    doorX: 13,
    doorY: 9,
  },
  {
    id: 'lounge',
    code: 'LOUNGE',
    label: 'CREATIVE LOUNGE',
    sub: 'Espresso Bar & Brainstorm',
    x: 17.5,
    y: 9.5,
    w: 9.5,
    h: 5.5,
    color: 0xf59e0b,
    floor: 'lounge',
    floorColor: 0x523620,
    top: false,
    doorX: 20,
    doorY: 9,
  },
];

// Vách ngăn dọc giữa các phòng (x tính theo ô, nằm giữa cột)
export const V_WALLS: Array<{ x: number; y1: number; y2: number }> = [
  { x: 8.5, y1: 1, y2: HALL_Y1 },
  { x: 17.5, y1: 1, y2: HALL_Y1 },
  { x: 9.5, y1: HALL_Y2, y2: 15 },
  { x: 17.5, y1: HALL_Y2, y2: 15 },
];

export type DecorKind =
  | 'plant'
  | 'tallPlant'
  | 'cabinet'
  | 'bookshelf'
  | 'softbox'
  | 'serverRack'
  | 'dashboard'
  | 'printer'
  | 'counter'
  | 'coffeeMachine'
  | 'fridge'
  | 'waterCooler'
  | 'arcade'
  | 'foosball'
  | 'sofa'
  | 'coffeeTable'
  | 'armchair'
  | 'cameraRig';

export interface Decor {
  kind: DecorKind;
  x: number;
  y: number;
  w?: number;
  h?: number;
  solid?: boolean;
}

export const DECOR: Decor[] = [
  // ROOM-101 (Phòng Kế Hoạch & Đề Tài)
  { kind: 'cabinet', x: 1, y: 1 },
  { kind: 'tallPlant', x: 7, y: 1 },

  // ROOM-102 (Phòng Sáng Tác Kịch Bản)
  { kind: 'bookshelf', x: 9, y: 1 },
  { kind: 'tallPlant', x: 16, y: 1 },

  // ROOM-103 (Ban Kiểm Duyệt Chất Lượng)
  { kind: 'softbox', x: 18, y: 1 },
  { kind: 'tallPlant', x: 26, y: 1 },

  // Hành lang trung tâm (2 chậu cây cọ đặt gọn ở 2 đầu)
  { kind: 'tallPlant', x: 1, y: 7, solid: true },
  { kind: 'tallPlant', x: 26, y: 7, solid: true },

  // STUDIO-A (Khu Sản Xuất Video & Thu Âm)
  { kind: 'serverRack', x: 1, y: 10 },
  { kind: 'cameraRig', x: 8, y: 10 },
  { kind: 'softbox', x: 1, y: 14 },

  // HUB-201 (Trung Tâm Phát Hành & Tăng Trưởng)
  { kind: 'dashboard', x: 10, y: 10, w: 2 },
  { kind: 'plant', x: 16, y: 14 },

  // LOUNGE (Creative Cafe)
  { kind: 'sofa', x: 19, y: 10, w: 3 },
  { kind: 'coffeeTable', x: 19, y: 12, w: 3 },
  { kind: 'counter', x: 24, y: 12, w: 2 },
  { kind: 'coffeeMachine', x: 24, y: 12, solid: false },
  { kind: 'fridge', x: 26, y: 10 },
  { kind: 'waterCooler', x: 26, y: 14 },
  { kind: 'plant', x: 18, y: 14 },
];

export interface Hangout {
  id: string;
  tile: Pt;
  face: Facing;
  sit?: Pt; // pixel ngồi (sofa)
  lines: string[];
}

export const HANGOUTS: Hangout[] = [
  { id: 'coffee', tile: { x: 24, y: 11 }, face: 'down', lines: ['☕ Thêm một ly espresso cho tỉnh táo!', '☕ Cà phê sữa đá, chuẩn vị Sài Gòn', '☕ Pha cappuccino thôi nào'] },
  { id: 'water', tile: { x: 25, y: 14 }, face: 'right', lines: ['💧 Uống nước đã, viết tiếp sau', '💧 Nhớ uống đủ 2 lít nước mỗi ngày'] },
  { id: 'camera', tile: { x: 7, y: 11 }, face: 'right', lines: ['🎬 Cân chỉnh góc máy 9:16 cinematic', '🎥 Kiểm tra sensor và ánh sáng key light', '✨ Set up phông nền studio sẵn sàng'] },
  { id: 'sofa-1', tile: { x: 19, y: 11 }, face: 'down', sit: { x: 19 * TILE + TILE / 2, y: 10 * TILE + 34 }, lines: ['🛋️ Nghỉ lưng một chút', '💡 Vừa nảy ra ý tưởng hook rất cuốn!'] },
  { id: 'sofa-2', tile: { x: 21, y: 11 }, face: 'down', sit: { x: 21 * TILE + TILE / 2, y: 10 * TILE + 34 }, lines: ['🛋️ Ghế êm, không gian sáng tạo tuyệt vời', '💭 Brainstorm concept video mới...'] },
  { id: 'dashboard', tile: { x: 11, y: 11 }, face: 'up', lines: ['📈 Retention 3 giây đầu đang tăng vọt!', '📊 Lượt xem TikTok & Reels rất tích cực', '🚀 Thuật toán đang đẩy video mới lên xu hướng'] },
];

export const DOOR_TILES: Pt[] = ZONES.map((z) => ({ x: z.doorX, y: z.doorY }));

export function buildGrid(): boolean[][] {
  const g: boolean[][] = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
  const block = (x: number, y: number) => {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    if (ix >= 0 && iy >= 0 && ix < COLS && iy < ROWS && g[iy]) {
      g[iy][ix] = true;
    }
  };

  // Tường bao
  for (let x = 0; x < COLS; x++) {
    block(x, 0);
    block(x, ROWS - 1);
  }
  for (let y = 0; y < ROWS; y++) {
    block(0, y);
    block(COLS - 1, y);
  }

  // Vách kính ngang giữa phòng & hành lang (chừa cửa)
  for (let x = 0; x < COLS; x++) {
    block(x, Math.floor(HALL_Y1));
    block(x, Math.floor(HALL_Y2));
  }
  // Vách dọc
  V_WALLS.forEach((w) => {
    for (let y = Math.floor(w.y1); y < Math.ceil(w.y2); y++) block(Math.floor(w.x), y);
  });
  DOOR_TILES.forEach((d) => {
    const ix = Math.floor(d.x);
    const iy = Math.floor(d.y);
    if (g[iy]) g[iy][ix] = false;
  });

  // Bàn làm việc (2 ô)
  DESKS.forEach((d) => {
    block(d.tx, d.ty);
    block(d.tx + 1, d.ty);
  });

  // Nội thất
  DECOR.forEach((d) => {
    if (d.solid === false) return;
    const w = d.w ?? 1;
    const h = d.h ?? 1;
    for (let dx = 0; dx < w; dx++) for (let dy = 0; dy < h; dy++) block(d.x + dx, d.y + dy);
  });

  return g;
}
