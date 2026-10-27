import { Container, Graphics, Rectangle, Text } from 'pixi.js';
import type { AgentStatus, StudioAgent } from '../core/types';
import { agentIndicator } from '../core/agentIndicator';
import type { Facing, Pt } from './studioMap';

const FONT = 'Be Vietnam Pro';

type HairStyle = 'short' | 'long' | 'bun' | 'spiky' | 'curly' | 'bob' | 'side';
type Accessory = 'none' | 'glasses' | 'headphones' | 'cap' | 'beard' | 'tie';

interface Look {
  skin: number;
  hair: number;
  style: HairStyle;
  pants: number;
  acc: Accessory[];
}

// Ngoại hình riêng cho từng vai trò để mỗi nhân vật dễ nhận ra
const LOOKS: Record<string, Look> = {
  ingest: { skin: 0xf6d3b3, hair: 0x4a2f1b, style: 'long', pants: 0x334155, acc: [] },
  planner: { skin: 0xe8b98f, hair: 0x1a1a1a, style: 'side', pants: 0x34363b, acc: ['glasses'] },
  writer: { skin: 0xffe0c2, hair: 0x6b3e23, style: 'bun', pants: 0x35373b, acc: ['headphones'] },
  critic: { skin: 0xdca67c, hair: 0x9ca3af, style: 'short', pants: 0x1e293b, acc: ['glasses', 'beard'] },
  qa: { skin: 0xf3c9a5, hair: 0x111111, style: 'bob', pants: 0x1e3a5f, acc: [] },
  voice: { skin: 0xc68b5e, hair: 0x1f140d, style: 'spiky', pants: 0x111827, acc: ['headphones'] },
  visual: { skin: 0xf0c49c, hair: 0x2b1d14, style: 'curly', pants: 0x374151, acc: [] },
  render: { skin: 0xe0ac80, hair: 0x2b1d14, style: 'short', pants: 0x1f2937, acc: ['cap'] },
  producer: { skin: 0xc68b5e, hair: 0x1f140d, style: 'spiky', pants: 0x111827, acc: ['headphones'] },
  publisher: { skin: 0xffdcbc, hair: 0xc8933f, style: 'long', pants: 0x34363b, acc: ['glasses'] },
  analytics: { skin: 0xb97a50, hair: 0x111111, style: 'short', pants: 0x3f3f46, acc: ['glasses'] },
};

const shade = (c: number, f: number) => {
  const r = Math.min(255, Math.max(0, Math.round(((c >> 16) & 0xff) * f)));
  const g = Math.min(255, Math.max(0, Math.round(((c >> 8) & 0xff) * f)));
  const b = Math.min(255, Math.max(0, Math.round((c & 0xff) * f)));
  return (r << 16) | (g << 8) | b;
};

export type SitStyle = 'desk' | 'sofa';

export class Character {
  readonly id: string;
  readonly root = new Container();
  readonly overlay = new Container({ eventMode: 'none' });
  private body = new Container();
  private shadow = new Graphics();
  private legL = new Graphics();
  private legR = new Graphics();
  private legs = new Container();
  private armL = new Graphics();
  private armR = new Graphics();
  private torso = new Graphics();
  private collar = new Graphics();
  private head = new Container();
  private headFront = new Container();
  private headBack = new Graphics();
  private face = new Graphics();
  private marker = new Graphics();
  private bubble = new Container();
  private bubbleBg = new Graphics();
  private bubbleText: Text;
  private iconBadge = new Container();
  private icon: Text;
  private activityBadge = new Container();
  private activityBackground = new Graphics();
  private activityDot = new Graphics();
  private activityText: Text;

  x = 0;
  y = 0;
  path: Pt[] = [];
  onArrive: (() => void) | null = null;
  private currentStatus: AgentStatus = 'idle';
  color: number;
  activityStage?: string;
  private role: StudioAgent['role'];
  facing: Facing = 'down';
  seated: SitStyle | null = null;
  busy = false; // đang đi dạo / làm việc ngoài bàn
  private selected = false;
  private hovered = false;
  private t = Math.random() * 10;
  private speechTimeout = 0;
  private blinkAt = Date.now() + 2000 + Math.random() * 3000;
  private blinking = false;
  private glasses: boolean;

  constructor(agent: StudioAgent, colorHex: number, shadow = { color: 0x1f2328, alpha: 0.14 }) {
    this.id = agent.id;
    this.color = colorHex;
    this.role = agent.role;
    this.activityStage = agent.activityStage;
    const look = LOOKS[agent.role] ?? LOOKS.ingest;
    this.glasses = look.acc.includes('glasses');

    this.root.eventMode = 'static';
    this.root.cursor = 'pointer';
    this.root.hitArea = new Rectangle(-74, -108, 148, 116);
    this.root.on('pointerover', () => {
      this.hovered = true;
      this.updateSpeechVisibility();
    });
    this.root.on('pointerout', () => {
      this.hovered = false;
      this.updateSpeechVisibility();
    });

    // Bóng đổ
    this.shadow.ellipse(0, 0, 12, 4).fill(shadow);
    this.root.addChild(this.shadow);

    // Chân + giày
    const drawLeg = (g: Graphics, x: number) => {
      g.roundRect(x, -13, 5.5, 12, 2).fill(look.pants);
      g.roundRect(x - 0.5, -3, 6.5, 3.5, 1.5).fill(0x1c1917);
    };
    drawLeg(this.legL, -6.5);
    drawLeg(this.legR, 1);
    this.legs.addChild(this.legL, this.legR);
    this.body.addChild(this.legs);

    // Thân áo
    const shirt = shade(this.color, 0.62);
    this.torso.roundRect(-10, -29, 20, 18, 6).fill(shirt);
    this.torso.roundRect(-10, -15, 20, 4, 2).fill(shade(shirt, 0.75)); // vạt áo/thắt lưng
    this.torso.roundRect(-10, -29, 20, 5, 4).fill({ color: 0xffffff, alpha: 0.12 }); // vai sáng
    this.body.addChild(this.torso);

    // Cổ áo (chỉ thấy khi quay mặt ra)
    this.collar.poly([-5, -29, 0, -25, 5, -29, 3, -21, -3, -21]).fill(shade(shirt, 0.7));
    this.collar.moveTo(-2, -26).lineTo(-2, -20).moveTo(2, -26).lineTo(2, -20)
      .stroke({ width: 0.8, color: 0xe0e4e8 });
    if (look.acc.includes('tie')) {
      this.collar.poly([-1.5, -25, 1.5, -25, 2.2, -17, 0, -15, -2.2, -17]).fill(0xb91c1c);
    } else {
      this.collar.roundRect(-5, -18, 10, 4, 1).fill(shade(shirt, 0.8));
      this.collar.rect(5, -24, 3, 2).fill(this.color);
    }
    this.body.addChild(this.collar);

    // Tay
    const drawArm = (g: Graphics, x: number) => {
      g.roundRect(x, -28, 5, 14, 2.5).fill(shade(shirt, 0.85));
      g.circle(x + 2.5, -13, 2.6).fill(look.skin);
    };
    drawArm(this.armL, -14);
    drawArm(this.armR, 9);
    this.body.addChild(this.armL, this.armR);

    // Đầu
    this.buildHead(look);
    this.head.position.set(0, -38);
    this.body.addChild(this.head);

    this.body.scale.set(1.5);
    this.root.addChild(this.body);

    // Mũi tên chọn nhân vật
    this.marker
      .poly([-6, 0, 6, 0, 0, 8])
      .fill(this.color)
      .stroke({ width: 1.5, color: 0xffffff });
    this.marker.visible = false;
    this.overlay.addChild(this.marker);

    const dpr = Math.max(2, typeof window !== 'undefined' ? (window.devicePixelRatio || 2) : 2);
    const statusFont = typeof document === 'undefined' ? ''
      : getComputedStyle(document.documentElement).getPropertyValue('--font-mono').trim();

    this.activityText = new Text({
      text: '',
      style: { fontFamily: statusFont || 'JetBrains Mono', fontSize: 11, fontWeight: '500', fill: 0x6ee7b7 },
      resolution: dpr,
    });
    this.activityText.anchor.set(0.5, 0.5);
    this.activityText.position.set(5, 0);
    this.activityBadge.addChild(this.activityBackground, this.activityDot, this.activityText);
    this.activityBadge.position.set(0, -90);
    this.overlay.addChild(this.activityBadge);
    this.status = agent.status;

    // Huy hiệu trạng thái
    const badgeBg = new Graphics()
      .circle(0, 0, 9)
      .fill({ color: 0xffffff, alpha: 0.95 })
      .stroke({ width: 1.5, color: this.color });
    this.icon = new Text({
      text: agent.statusIcon || '💭',
      style: { fontSize: Math.round(11 * dpr) },
    });
    this.icon.scale.set(1 / dpr);
    this.icon.anchor.set(0.5, 0.5);
    this.iconBadge.addChild(badgeBg, this.icon);
    this.iconBadge.position.set(27, -62);
    this.overlay.addChild(this.iconBadge);

    // Bong bóng thoại
    this.bubbleText = new Text({
      text: '',
      style: {
        fontFamily: FONT,
        fontSize: Math.round(13 * dpr),
        fill: 0x0f172a,
        fontWeight: '600',
        wordWrap: true,
        wordWrapWidth: 160 * dpr,
      },
    });
    this.bubbleText.scale.set(1 / dpr);
    this.bubbleText.position.set(10, 7);
    this.bubble.addChild(this.bubbleBg, this.bubbleText);
    this.bubble.visible = false;
    this.overlay.addChild(this.bubble);
  }

  private buildHead(look: Look) {
    const { skin, hair, style, acc } = look;
    const front = new Graphics();

    // Phần tóc phía sau (tóc dài / bob)
    if (style === 'long') front.roundRect(-11.5, -4, 23, 21, 7).fill(shade(hair, 0.85));
    if (style === 'bob') front.roundRect(-12, -4, 24, 14, 6).fill(shade(hair, 0.85));

    // Cổ + tai + mặt
    front.rect(-3, 7, 6, 4).fill(shade(skin, 0.88));
    front.circle(-9.5, 1.5, 2.6).fill(shade(skin, 0.92));
    front.circle(9.5, 1.5, 2.6).fill(shade(skin, 0.92));
    front.circle(0, 0, 9.8).fill(skin);

    // Tóc phía trước
    const cap = (r: number, col: number) =>
      front.moveTo(-r, 0).arc(0, 0, r, Math.PI, Math.PI * 2).closePath().fill(col);
    switch (style) {
      case 'short':
        cap(10.6, hair);
        front.ellipse(-4, -5, 6.5, 3.5).fill(hair);
        break;
      case 'side':
        cap(10.6, hair);
        front.ellipse(3, -5.5, 8, 3.8).fill(hair);
        front.ellipse(-8, -1, 2.5, 4).fill(hair);
        break;
      case 'long':
        cap(10.8, hair);
        front.ellipse(-8.5, 2, 3, 7).fill(hair);
        front.ellipse(8.5, 2, 3, 7).fill(hair);
        front.ellipse(2, -5, 7, 3.5).fill(hair);
        break;
      case 'bob':
        cap(11, hair);
        front.rect(-11, -2, 22, 2.5).fill(hair);
        front.ellipse(-9, 3, 3, 5.5).fill(hair);
        front.ellipse(9, 3, 3, 5.5).fill(hair);
        break;
      case 'bun':
        front.circle(0, -11, 5).fill(hair);
        cap(10.6, hair);
        front.ellipse(-3, -4.5, 6, 3).fill(hair);
        break;
      case 'spiky':
        cap(10.4, hair);
        for (let i = -2; i <= 2; i++) {
          front.poly([i * 4 - 3, -7, i * 4 + 3, -7, i * 4 + 1, -14 + Math.abs(i)]).fill(hair);
        }
        break;
      case 'curly':
        for (let i = 0; i < 9; i++) {
          const a = Math.PI + (i / 8) * Math.PI;
          front.circle(Math.cos(a) * 9.5, Math.sin(a) * 9.5 - 1, 4).fill(hair);
        }
        front.circle(0, -6, 6).fill(hair);
        break;
    }

    if (acc.includes('cap')) {
      cap(11, 0x1e293b);
      front.ellipse(0, -1, 12, 2.6).fill(0x0f172a);
      front.circle(0, -10, 1.5).fill(this.color);
    }
    if (acc.includes('beard')) {
      front.ellipse(0, 6.5, 6.5, 3.8).fill(hair);
    }
    if (acc.includes('headphones')) {
      front.moveTo(Math.cos(Math.PI * 1.08) * 12, Math.sin(Math.PI * 1.08) * 12).arc(0, 0, 12, Math.PI * 1.08, Math.PI * 1.92).stroke({ width: 2.5, color: 0x111827 });
      front.roundRect(-14, -2, 5, 8, 2).fill(0x111827);
      front.roundRect(9, -2, 5, 8, 2).fill(0x111827);
      front.roundRect(-13, -1, 3, 6, 1).fill(this.color);
      front.roundRect(10, -1, 3, 6, 1).fill(this.color);
    }

    // Mắt, miệng, má hồng — tách riêng để dịch khi quay ngang
    this.drawFace(false);

    this.headFront.addChild(front, this.face);

    // Mặt sau đầu
    const back = this.headBack;
    if (style === 'long') back.roundRect(-11.5, -4, 23, 21, 7).fill(shade(hair, 0.9));
    back.rect(-3, 7, 6, 4).fill(shade(skin, 0.85));
    back.circle(-9.5, 1.5, 2.6).fill(shade(skin, 0.9));
    back.circle(9.5, 1.5, 2.6).fill(shade(skin, 0.9));
    if (style === 'curly') {
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        back.circle(Math.cos(a) * 7, Math.sin(a) * 7, 4.5).fill(hair);
      }
    }
    back.circle(0, 0, style === 'bob' || style === 'long' ? 11 : 10.4).fill(hair);
    if (style === 'bun') back.circle(0, -9, 5).fill(shade(hair, 0.9));
    if (acc.includes('cap')) {
      back.moveTo(-11, 0).arc(0, 0, 11, Math.PI, Math.PI * 2).closePath().fill(0x1e293b);
    }
    if (acc.includes('headphones')) {
      back.moveTo(Math.cos(Math.PI * 1.08) * 12, Math.sin(Math.PI * 1.08) * 12).arc(0, 0, 12, Math.PI * 1.08, Math.PI * 1.92).stroke({ width: 2.5, color: 0x111827 });
      back.roundRect(-14, -2, 5, 8, 2).fill(0x111827);
      back.roundRect(9, -2, 5, 8, 2).fill(0x111827);
    }
    back.visible = false;

    this.head.addChild(this.headFront, this.headBack);
  }

  private drawFace(closed: boolean) {
    const f = this.face;
    f.clear();
    if (closed) {
      f.rect(-5, 1, 3, 1).fill(0x1e1b18);
      f.rect(2, 1, 3, 1).fill(0x1e1b18);
    } else {
      f.ellipse(-3.6, 1, 1.4, 1.8).fill(0x1e1b18);
      f.ellipse(3.6, 1, 1.4, 1.8).fill(0x1e1b18);
      f.circle(-3.2, 0.4, 0.5).fill(0xffffff);
      f.circle(4, 0.4, 0.5).fill(0xffffff);
    }
    f.circle(-6.2, 4, 1.8).fill({ color: 0xf87171, alpha: 0.3 });
    f.circle(6.2, 4, 1.8).fill({ color: 0xf87171, alpha: 0.3 });
    f.moveTo(-2, 5).quadraticCurveTo(0, 6.8, 2, 5).stroke({ width: 1, color: 0x7c2d12 });
    if (this.glasses) {
      f.circle(-3.6, 1, 3).stroke({ width: 1, color: 0x111827 });
      f.circle(3.6, 1, 3).stroke({ width: 1, color: 0x111827 });
      f.moveTo(-0.6, 1).lineTo(0.6, 1).stroke({ width: 1, color: 0x111827 });
    }
  }

  say(text: string, durationMs = 4000) {
    if (!text) {
      this.bubble.visible = false;
      return;
    }
    this.bubbleText.text = text;
    const pad = 10;
    const w = Math.max(70, Math.min(184, this.bubbleText.width + pad * 2));
    const h = this.bubbleText.height + 14;

    this.bubbleBg.clear();
    this.bubbleBg.roundRect(2, 3, w, h, 9).fill({ color: 0x000000, alpha: 0.18 });
    this.bubbleBg
      .roundRect(0, 0, w, h, 9)
      .fill(0xffffff)
      .stroke({ width: 1.5, color: this.color });
    this.bubbleBg.poly([w / 2 - 6, h - 1, w / 2 + 6, h - 1, w / 2, h + 7]).fill(0xffffff);
    this.bubbleBg
      .moveTo(w / 2 - 6, h)
      .lineTo(w / 2, h + 7)
      .lineTo(w / 2 + 6, h)
      .stroke({ width: 1.5, color: this.color });

    this.bubble.position.set(-w / 2, -h - 116);
    this.speechTimeout = Date.now() + durationMs;
    this.bubble.visible = this.selected || this.hovered;
  }

  get status(): AgentStatus { return this.currentStatus; }

  set status(status: AgentStatus) {
    this.currentStatus = status;
    const indicator = agentIndicator(status, this.activityStage || this.role);
    this.activityText.text = indicator.label;
    this.activityText.style.fill = indicator.color;
    const width = this.activityText.width + 28;
    const emphasis = indicator.working || status === 'rejected';
    this.activityBackground.clear();
    this.activityBackground.visible = emphasis;
    if (emphasis) {
      this.activityBackground.roundRect(-width / 2, -11, width, 22, 4)
        .fill({ color: indicator.background, alpha: 0.75 })
        .stroke({ color: indicator.color, width: 1, alpha: 0.35 });
    }
    this.activityDot.clear().circle(-width / 2 + 9, 0, 2.5).fill(indicator.color);
    this.activityDot.alpha = 1;
    this.iconBadge.visible = indicator.working || status === 'rejected';
  }

  setIcon(icon: string) {
    this.icon.text = icon;
  }

  setLabelScale(scale: number) {
    this.activityBadge.scale.set(scale);
    // Grow upward so the larger badge never covers the head.
    this.activityBadge.y = -79 - 11 * scale;
  }

  setSelected(selected: boolean) {
    this.selected = selected;
    this.marker.visible = selected;
    this.updateSpeechVisibility();
  }

  setFacing(f: Facing) {
    if (this.facing === f) return;
    this.facing = f;
    const back = f === 'up';
    this.headFront.visible = !back;
    this.headBack.visible = back;
    this.collar.visible = !back;
    this.face.x = f === 'left' ? -2.5 : f === 'right' ? 2.5 : 0;
  }

  sit(style: SitStyle, at?: Pt) {
    if (at) {
      this.x = at.x;
      this.y = at.y;
    }
    this.seated = style;
    this.setFacing('down');
    this.legs.visible = style === 'sofa';
    this.legs.scale.y = style === 'sofa' ? 0.55 : 1;
    this.shadow.visible = style !== 'desk';
    this.updateSpeechVisibility();
  }

  stand() {
    this.seated = null;
    this.legs.visible = true;
    this.legs.scale.y = 1;
    this.legs.y = 0;
    this.shadow.visible = true;
    this.updateSpeechVisibility();
  }

  private updateSpeechVisibility() {
    this.bubble.visible = (this.hovered || this.selected) && Date.now() < this.speechTimeout;
  }

  tick(delta: number) {
    this.t += delta * 0.1;
    const now = Date.now();

    if (this.bubble.visible && now > this.speechTimeout) {
      this.bubble.visible = false;
    }

    // Chớp mắt
    if (!this.blinking && now > this.blinkAt) {
      this.blinking = true;
      this.drawFace(true);
    } else if (this.blinking && now > this.blinkAt + 140) {
      this.blinking = false;
      this.drawFace(false);
      this.blinkAt = now + 2500 + Math.random() * 3500;
    }

    if (this.selected) this.marker.y = -124 + Math.sin(this.t * 2) * 3;
    this.activityDot.alpha = agentIndicator(this.status).working ? 0.6 + Math.sin(this.t * 2) * 0.4 : 0.6;

    if (this.path.length > 0) {
      if (this.seated) this.stand();
      const target = this.path[0];
      const dx = target.x - this.x;
      const dy = target.y - this.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const speed = 2.2 * delta;

      if (Math.abs(dx) > Math.abs(dy) + 0.5) this.setFacing(dx > 0 ? 'right' : 'left');
      else if (Math.abs(dy) > 0.5) this.setFacing(dy > 0 ? 'down' : 'up');

      if (dist <= speed) {
        this.x = target.x;
        this.y = target.y;
        this.path.shift();
        if (this.path.length === 0) {
          this.resetPose();
          if (this.onArrive) {
            const fn = this.onArrive;
            this.onArrive = null;
            fn();
          }
        }
      } else {
        this.x += (dx / dist) * speed;
        this.y += (dy / dist) * speed;
        const s = Math.sin(this.t * 3.2);
        this.legL.y = s * 2.5;
        this.legR.y = -s * 2.5;
        this.armL.y = -s * 2;
        this.armR.y = s * 2;
        this.body.y = -Math.abs(s) * 1.6;
      }
    } else if (this.seated === 'desk') {
      // Ngồi gõ phím: tay nhấp nhô, đầu hơi gật
      const working = agentIndicator(this.status).working;
      this.body.y = 5;
      this.armL.y = working ? Math.max(0, Math.sin(this.t * 9)) * -1.6 : 0;
      this.armR.y = working ? Math.max(0, Math.sin(this.t * 9 + 1.7)) * -1.6 : 0;
      this.head.y = -38 + Math.sin(this.t * 0.8) * 0.6;
    } else if (this.seated === 'sofa') {
      this.body.y = 6 + Math.sin(this.t * 0.7) * 0.6;
    } else {
      this.body.y = Math.sin(this.t) * 0.8;
    }

    this.root.position.set(this.x, this.y);
    this.root.zIndex = this.y;
    this.overlay.position.copyFrom(this.root.position);
    this.overlay.zIndex = this.y;
  }

  private resetPose() {
    this.legL.y = 0;
    this.legR.y = 0;
    this.armL.y = 0;
    this.armR.y = 0;
    this.body.y = 0;
    this.head.y = -38;
  }
}
