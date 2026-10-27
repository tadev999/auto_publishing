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

const notice = (value: ScheduleStatus, error: string | null = null, variant: 'status' | 'alert' = 'status', running = false) =>
  renderToStaticMarkup(createElement(ScheduleNotice, {
    schedule: value, fetchedAt: Date.now(), error, running, variant, onOpenAutomation: () => {},
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
  it('shows only current status by default and keeps quota and settings inside the disclosure', () => {
    const html = notice(schedule());
    expect(html.split('</summary>')[0]).toContain('Tự động bật');
    expect(html.split('</summary>')[0]).not.toContain('video/ngày');
    expect(html).toContain('3 video/ngày');
    expect(html).toContain('DRY RUN');
    expect(html).toContain('Cấu hình tự động vận hành');
    expect(html).toContain('aria-label="Tự động vận hành: Tự động bật"');
    expect(html).toContain('aria-controls=');
    expect(html).not.toContain('<details open');
    expect(html).not.toContain('scheduler /');
  });
  it('shows a separate alert only for blocked or stale states and does not promise a next run', () => {
    const blocked = schedule();
    blocked.automation = { ...blocked.automation!, blocked: true, lastError: 'Cần đối soát kết quả đăng.' };
    const html = notice(blocked);
    expect(html.split('</summary>')[0]).toContain('Cần cấu hình');
    expect(notice(blocked, null, 'alert')).toContain('Cần đối soát kết quả đăng.');
    expect(html).not.toContain('schedule-countdown');
    const stale = notice(schedule(), 'Không kết nối được server');
    expect(stale.split('</summary>')[0]).toContain('Mất kết nối');
    expect(notice(schedule(), 'Không kết nối được server', 'alert')).toContain('Không kết nối được server');
    expect(stale).not.toContain('schedule-countdown');
    expect(notice(schedule(), null, 'alert')).toBe('');
  });
  it('keeps intentionally paused and disabled automation neutral without an alert banner', () => {
    const paused = { ...schedule(), paused: true };
    expect(notice(paused).split('</summary>')[0]).toContain('Đã tạm dừng');
    expect(notice(paused)).toContain('schedule-neutral');
    expect(notice(paused, null, 'alert')).toBe('');
    const disabled = { ...schedule(), enabled: false };
    expect(notice(disabled).split('</summary>')[0]).toContain('Tự động tắt');
    expect(notice(disabled, null, 'alert')).toBe('');
  });
  it('reports the active command without hiding blocking errors during a run', () => {
    const busy = { ...schedule(), activeCommand: 'produce' };
    expect(notice(busy, null, 'status', true).split('</summary>')[0]).toContain('Đang sản xuất');
    busy.lastError = 'Scheduler không thể tiếp tục.';
    expect(notice(busy, null, 'alert', true)).toContain('Scheduler không thể tiếp tục.');
    expect(notice(busy, null, 'status', true)).not.toContain('schedule-countdown');
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
