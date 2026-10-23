import { COLS, ROWS, type Pt } from './studioMap';

interface Node {
  x: number;
  y: number;
  g: number;
  h: number;
  f: number;
  parent: Node | null;
}

export function findPath(grid: boolean[][], start: Pt, goal: Pt): Pt[] {
  const sx = Math.max(0, Math.min(COLS - 1, Math.round(start.x)));
  const sy = Math.max(0, Math.min(ROWS - 1, Math.round(start.y)));
  const gx = Math.max(0, Math.min(COLS - 1, Math.round(goal.x)));
  const gy = Math.max(0, Math.min(ROWS - 1, Math.round(goal.y)));

  if (sx === gx && sy === gy) return [];

  const openList: Node[] = [];
  const closedSet = new Set<string>();
  const key = (x: number, y: number) => `${x},${y}`;

  const startNode: Node = {
    x: sx,
    y: sy,
    g: 0,
    h: Math.abs(gx - sx) + Math.abs(gy - sy),
    f: 0,
    parent: null,
  };
  startNode.f = startNode.g + startNode.h;
  openList.push(startNode);

  const DIRS = [
    { x: 1, y: 0 },
    { x: -1, y: 0 },
    { x: 0, y: 1 },
    { x: 0, y: -1 },
  ];

  let iterations = 0;
  while (openList.length > 0 && iterations++ < 1000) {
    openList.sort((a, b) => a.f - b.f);
    const curr = openList.shift()!;

    if (curr.x === gx && curr.y === gy) {
      const path: Pt[] = [];
      let step: Node | null = curr;
      while (step) {
        path.unshift({ x: step.x, y: step.y });
        step = step.parent;
      }
      return path.slice(1);
    }

    closedSet.add(key(curr.x, curr.y));

    for (const dir of DIRS) {
      const nx = curr.x + dir.x;
      const ny = curr.y + dir.y;

      if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) continue;
      // Trừ ô đích, các ô có vật cản thì bỏ qua
      if (grid[ny][nx] && !(nx === gx && ny === gy)) continue;
      if (closedSet.has(key(nx, ny))) continue;

      const g = curr.g + 1;
      const h = Math.abs(gx - nx) + Math.abs(gy - ny);
      const f = g + h;

      const existing = openList.find((n) => n.x === nx && n.y === ny);
      if (existing) {
        if (g < existing.g) {
          existing.g = g;
          existing.f = f;
          existing.parent = curr;
        }
      } else {
        openList.push({ x: nx, y: ny, g, h, f, parent: curr });
      }
    }
  }

  // Nếu không tìm được đường, đi thẳng ô đích
  return [{ x: gx, y: gy }];
}
