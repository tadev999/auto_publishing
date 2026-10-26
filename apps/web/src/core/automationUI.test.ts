import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import ScheduleNotice from '../components/ScheduleNotice';
import AutomationModal from '../components/AutomationModal';
import AgentSkillModal from '../components/AgentSkillModal';
import { INITIAL_AGENTS } from './config';
import type { ScheduleStatus } from '../../shared/api';

function schedule(): ScheduleStatus {
  return {
    enabled: true, paused: false, serverTime: new Date().toISOString(),
    nextCheckAt: new Date(Date.now() + 60000).toISOString(), nextPublication: null,
    dueCount: 0, pendingProduction: 0, activeCommand: null, lastError: null,
    automation: { enabled: true, dailyLimit: 3, blocked: false, message: 'Chờ công việc mới.',
      lastCycleAt: null, lastError: null, horizonHours: 24, checkIntervalSeconds: 60, dryRun: true,
      platforms: ['youtube'], timezone: 'Asia/Ho_Chi_Minh' },
  };
}

const notice = (value: ScheduleStatus, error: string | null = null) =>
  renderToStaticMarkup(createElement(ScheduleNotice, {
    schedule: value, fetchedAt: Date.now(), error, running: false, onOpenAutomation: () => {},
  }));

describe('compact automation controls', () => {
  it('keeps agent profile guidance concise and free of implementation details', () => {
    const html = renderToStaticMarkup(createElement(AgentSkillModal, {
      initialAgent: INITIAL_AGENTS[0], allAgents: INITIAL_AGENTS, onClose: () => {},
    }));
    expect(html).toContain('Thay đổi có hiệu lực sau khi lưu, từ tác vụ tiếp theo.');
    expect(html).not.toContain('Hồ sơ được đọc');
    expect(html).not.toContain('do code kiểm soát');
    expect(html).not.toContain('Demo không gọi AI');
  });
  it('keeps mode, quota, dry-run and configuration visible with details collapsed by default', () => {
    const html = notice(schedule());
    expect(html).toContain('Tự động vận hành');
    expect(html).toContain('3 video/ngày');
    expect(html).toContain('DRY RUN');
    expect(html).toContain('Cấu hình tự động vận hành');
    expect(html).toContain('<summary>Chi tiết hoạt động</summary>');
    expect(html).not.toContain('<details open');
    expect(html).not.toContain('scheduler /');
  });
  it('shows blocked and stale errors outside collapsed details and does not promise a next run', () => {
    const blocked = schedule();
    blocked.automation = { ...blocked.automation!, blocked: true, lastError: 'Cần đối soát kết quả đăng.' };
    const html = notice(blocked);
    expect(html.split('<details')[0]).toContain('Cần đối soát kết quả đăng.');
    expect(html).not.toContain('schedule-countdown');
    const stale = notice(schedule(), 'Không kết nối được server');
    expect(stale.split('<details')[0]).toContain('Không kết nối được server');
    expect(stale).not.toContain('schedule-countdown');
  });
  it('keeps costs and consent visible while moving long rules into a disclosure', () => {
    const value = schedule();
    value.automation = { ...value.automation!, enabled: false };
    const html = renderToStaticMarkup(createElement(AutomationModal, {
      schedule: value, running: false, onClose: () => {}, onSaved: async () => {},
    }));
    expect(html.split('<details')[0]).toContain('vẫn có thể phát sinh chi phí');
    expect(html).toContain('<summary>Giới hạn &amp; cơ chế an toàn</summary>');
    expect(html).toContain('Tôi đồng ý để server tự gọi API');
    expect(html).toContain('disabled=""');
    expect(html).not.toContain('<details open');
    expect(html).toContain('aria-label="Chuẩn bị trước"');
    expect(html).toContain('aria-label="Chu kỳ kiểm tra"');
    expect(html).toContain('Lưu cấu hình');
    expect(html).toContain('Instagram');
    expect(html).toContain('TikTok');
  });
});
