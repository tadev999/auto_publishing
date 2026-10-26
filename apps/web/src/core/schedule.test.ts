import { describe, expect, it } from 'vitest';
import type { ScheduleStatus } from '../../shared/api';
import { countdown, scheduleSummary } from './schedule';

const now = Date.parse('2026-10-26T00:00:00Z');
const schedule: ScheduleStatus = {
  enabled: true, paused: false, serverTime: new Date(now).toISOString(),
  nextCheckAt: new Date(now + 60000).toISOString(), nextPublication: null,
  dueCount: 0, pendingProduction: 0, activeCommand: null, lastError: null,
};
describe('next agent activity', () => {
  it('does not invent an automatic production time for idle agents', () => {
    expect(scheduleSummary(schedule, now, false)).toMatchObject({ kind: 'manual', title: 'Chưa có tác vụ tiếp theo' });
    expect(scheduleSummary({ ...schedule, pendingProduction: 3 }, now, false))
      .toMatchObject({ kind: 'manual', title: '3 video chờ sản xuất / QA' });
  });
  it('prioritizes a running job, disabled scheduler, pause, and scheduler errors', () => {
    expect(scheduleSummary({ ...schedule, paused: true }, now, true).kind).toBe('running');
    expect(scheduleSummary({ ...schedule, enabled: false, paused: true }, now, false).title).toContain('đang tắt');
    expect(scheduleSummary({ ...schedule, paused: true }, now, false).title).toContain('tạm dừng');
    expect(scheduleSummary({ ...schedule, lastError: 'Cannot start job' }, now, false).detail).toBe('Cannot start job');
  });
  it('distinguishes scheduled publication from overdue work waiting for a check', () => {
    const upcoming = { ...schedule, nextPublication: { id: 9, slotAt: new Date(now + 60000).toISOString() } };
    expect(scheduleSummary(upcoming, now, false).title).toBe('Chờ phát hành video #9');
    expect(scheduleSummary({ ...upcoming, dueCount: 1 }, now + 60000, false).title).toContain('đã đến giờ');
  });
  it('counts down and never promises a run after the check time has passed', () => {
    expect(countdown(new Date(now + 45000).toISOString(), now)).toBe('còn 45s');
    expect(countdown(new Date(now + 90000).toISOString(), now)).toBe('còn 1p 30s');
    expect(countdown(new Date(now).toISOString(), now)).toBe('đang chờ cập nhật');
  });
  it('explains enabled automatic production and blocks without suggesting a manual production command', () => {
    const automatic: ScheduleStatus = { ...schedule, automation: {
      enabled: true, dailyLimit: 4, blocked: false, lastCycleAt: null, lastError: null,
      message: 'Chờ bài nguồn mới.', horizonHours: 24, checkIntervalSeconds: 60, dryRun: true, platforms: ['youtube'], timezone: 'Asia/Ho_Chi_Minh',
    } };
    expect(scheduleSummary(automatic, now, false)).toMatchObject({
      kind: 'waiting', title: 'Tự động vận hành · tối đa 4 video/ngày', detail: 'Chờ bài nguồn mới.',
    });
    expect(scheduleSummary({ ...automatic, automation: { ...automatic.automation!, blocked: true, lastError: 'Kiểm tra lỗi render' } }, now, false))
      .toMatchObject({ kind: 'warning', title: 'Tự động vận hành cần kiểm tra', detail: 'Kiểm tra lỗi render' });
    expect(scheduleSummary({ ...automatic, lastError: 'Worker not available' }, now, false).detail).toBe('Worker not available');
  });
});
