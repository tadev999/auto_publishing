import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AGENT_ROLES } from '../../shared/activity';
import { DESKS, INITIAL_AGENTS, eventAgentMeta } from './config';
import EventTerminal from '../components/EventTerminal';

describe('team titles across the office and logs', () => {
  it('uses the same short labels in the office and logs while preserving full profile titles', () => {
    const labels = ['Điều phối nội dung', 'Biên kịch', 'Biên tập', 'Sản xuất', 'Phát hành'];
    expect(DESKS.map((desk) => desk.label)).toEqual(labels);
    for (const desk of DESKS) {
      const member = INITIAL_AGENTS.find((agent) => agent.role === desk.role)!;
      expect(member.title).toBe(member.name);
      expect(desk.color).toBe(parseInt(member.color.slice(1), 16));
      for (const [stage, role] of Object.entries(AGENT_ROLES)) {
        if (role !== desk.role) continue;
        expect(eventAgentMeta(stage).name).toBe(desk.label);
        expect(eventAgentMeta(stage.toUpperCase()).name).toBe(desk.label);
        expect(eventAgentMeta(stage).task).not.toBe(stage);
      }
    }
    expect(new Set(INITIAL_AGENTS.map((member) => member.color)).size).toBe(INITIAL_AGENTS.length);
  });
  it('distinguishes stages of the same member and attributes unmapped events to the system', () => {
    expect(eventAgentMeta('ingest').name).toBe(eventAgentMeta('planner').name);
    expect(eventAgentMeta('ingest').task).not.toBe(eventAgentMeta('planner').task);
    expect(eventAgentMeta('automation')).toMatchObject({ name: 'Hệ thống', task: 'Tự động vận hành' });
    expect(eventAgentMeta('future-stage')).toMatchObject({ name: 'Hệ thống', task: 'future-stage' });
  });
  it('renders titles and task names, keeping technical IDs only in tooltips', () => {
    const html = renderToStaticMarkup(createElement(EventTerminal, {
      events: [
        { ts: '2026-10-26T08:30:00Z', agent: 'ingest', message: 'Nạp xong', level: 'info', video_id: 7 },
        { ts: '2026-10-26T08:31:00Z', agent: 'publisher', message: 'Đã đăng', level: 'info' },
      ],
      liveLogs: ['Server ready'],
    }));
    expect(html).toContain('[Điều phối nội dung]');
    expect(html).toContain('[Phát hành]');
    expect(html).not.toContain('[Trưởng Ban Nội Dung]');
    expect(html).not.toContain('[Điều Phối Phát Hành]');
    expect(html).toContain('Nạp ý tưởng');
    expect(html).toContain('Mã công đoạn: ingest');
    expect(html).toContain('[Hệ thống]');
    expect(html).not.toContain('[ingest]');
    expect(html).not.toContain('[publisher]');
  });
});
