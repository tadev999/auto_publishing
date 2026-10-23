import { Container, Graphics, Text } from 'pixi.js';
import type { StudioAgent } from '../core/types';
import type { Pt } from './studioMap';

const FONT = 'Be Vietnam Pro, Inter, system-ui, sans-serif';

export class Character {
  readonly id: string;
  readonly root = new Container();
  private body = new Container();
  private legL = new Graphics();
  private legR = new Graphics();
  private torso = new Graphics();
  private head = new Graphics();
  private ring = new Graphics();
  private bubble = new Container();
  private bubbleBg = new Graphics();
  private bubbleText: Text;
  private icon: Text;
  private nameTag = new Text({
    text: '',
    style: {
      fontFamily: FONT,
      fontSize: 10,
      fontWeight: '600',
      fill: 0xffffff,
    },
  });

  x = 0;
  y = 0;
  path: Pt[] = [];
  onArrive: (() => void) | null = null;
  status = 'idle';
  color: number;
  private t = Math.random() * 10;
  private speechTimeout = 0;

  constructor(agent: StudioAgent, colorHex: number) {
    this.id = agent.id;
    this.color = colorHex;
    this.root.eventMode = 'static';
    this.root.cursor = 'pointer';

    // Highlight ring dưới chân
    this.ring.circle(0, 0, 15).fill({ color: this.color, alpha: 0.25 });
    this.ring.visible = false;
    this.root.addChild(this.ring);

    // Chân
    this.legL.roundRect(-7, -8, 5, 10, 2).fill(0x1e293b);
    this.legR.roundRect(2, -8, 5, 10, 2).fill(0x1e293b);
    this.body.addChild(this.legL, this.legR);

    // Thân
    this.torso.roundRect(-10, -26, 20, 20, 5).fill(this.color);
    this.torso.roundRect(-6, -22, 12, 12, 3).fill({ color: 0xffffff, alpha: 0.2 });
    this.body.addChild(this.torso);

    // Đầu & Mắt
    this.head.circle(0, -36, 11).fill(0xffdfba);
    // Tóc/Mũ
    this.head.arc(0, -36, 11, Math.PI, Math.PI * 2).fill(0x1e293b);
    // Mắt
    this.head.circle(-3, -36, 1.5).fill(0x0f172a);
    this.head.circle(3, -36, 1.5).fill(0x0f172a);
    this.body.addChild(this.head);

    this.root.addChild(this.body);

    // Name tag
    this.nameTag.text = agent.name;
    this.nameTag.anchor.set(0.5, 0);
    this.nameTag.position.set(0, 4);
    this.root.addChild(this.nameTag);

    // Icon trạng thái
    this.icon = new Text({
      text: agent.statusIcon || '💭',
      style: {
        fontSize: 14,
      },
    });
    this.icon.anchor.set(0.5, 1);
    this.icon.position.set(12, -40);
    this.root.addChild(this.icon);

    // Speech Bubble
    this.bubbleText = new Text({
      text: '',
      style: {
        fontFamily: FONT,
        fontSize: 11,
        fill: 0x0f172a,
        fontWeight: '500',
        wordWrap: true,
        wordWrapWidth: 150,
      },
    });
    this.bubbleText.position.set(8, 6);
    this.bubble.addChild(this.bubbleBg, this.bubbleText);
    this.bubble.position.set(-75, -95);
    this.bubble.visible = false;
    this.root.addChild(this.bubble);
  }

  say(text: string, durationMs = 4000) {
    if (!text) {
      this.bubble.visible = false;
      return;
    }
    this.bubbleText.text = text;
    const pad = 12;
    const w = Math.max(70, Math.min(180, this.bubbleText.width + pad * 2));
    const h = this.bubbleText.height + pad * 2;

    this.bubbleBg.clear();
    this.bubbleBg.roundRect(0, 0, w, h, 8).fill(0xffffff).stroke({ width: 1.5, color: this.color });
    // Đuôi bong bóng
    this.bubbleBg.poly([
      { x: w / 2 - 6, y: h },
      { x: w / 2 + 6, y: h },
      { x: w / 2, y: h + 7 },
    ]).fill(0xffffff);

    this.bubble.position.set(-w / 2, -h - 45);
    this.bubble.visible = true;
    this.speechTimeout = Date.now() + durationMs;
  }

  setIcon(icon: string) {
    this.icon.text = icon;
  }

  setSelected(selected: boolean) {
    this.ring.visible = selected;
  }

  tick(delta: number) {
    this.t += delta * 0.1;

    // Ẩn speech bubble khi hết hạn
    if (this.bubble.visible && Date.now() > this.speechTimeout) {
      this.bubble.visible = false;
    }

    // Di chuyển dọc theo path
    if (this.path.length > 0) {
      const target = this.path[0];
      const dx = target.x - this.x;
      const dy = target.y - this.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const speed = 2.8 * delta;

      if (dist <= speed) {
        this.x = target.x;
        this.y = target.y;
        this.path.shift();
        if (this.path.length === 0 && this.onArrive) {
          const fn = this.onArrive;
          this.onArrive = null;
          fn();
        }
      } else {
        this.x += (dx / dist) * speed;
        this.y += (dy / dist) * speed;
        // Animation bước chân
        this.legL.y = Math.sin(this.t * 3) * 3;
        this.legR.y = -Math.sin(this.t * 3) * 3;
        this.body.y = Math.abs(Math.sin(this.t * 3)) * -2;
      }
    } else {
      // Idle breathing
      this.body.y = Math.sin(this.t) * 1.2;
      this.legL.y = 0;
      this.legR.y = 0;
    }

    this.root.position.set(this.x, this.y);
  }
}
