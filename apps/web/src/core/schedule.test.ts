import { describe, expect, it } from 'vitest';
import type { AutomationStatus, ScheduleStatus } from '../../shared/api';
import { blockedAgent, countdown, nextRunLabel, scheduleSummary } from './schedule';

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
  it('assigns a block to the agent of the failed stage, falling back to the coordinator', () => {
    const automation: AutomationStatus = { enabled: true, dailyLimit: 3, blocked: true, lastCycleAt: null, lastError: 'Missing secret',
      message: 'Cần kiểm tra', horizonHours: 24, checkIntervalSeconds: 60, dryRun: true, platforms: ['youtube'], timezone: null };
    expect(blockedAgent({ ...schedule, automation: { ...automation, stage: 'render' } }))
      .toEqual({ role: 'producer', stage: 'render', message: 'Missing secret' });
    expect(blockedAgent({ ...schedule, automation: { ...automation, stage: 'ingest' } })?.role).toBe('planner');
    expect(blockedAgent({ ...schedule, automation })).toMatchObject({ role: 'planner', stage: null });
    expect(blockedAgent({ ...schedule, lastError: 'Scheduler down' })).toMatchObject({ role: 'planner', message: 'Scheduler down' });
    expect(blockedAgent({ ...schedule, paused: true, automation })).toBeNull();
    expect(blockedAgent({ ...schedule, automation: { ...automation, enabled: false } })).toBeNull();
    expect(blockedAgent({ ...schedule, automation: { ...automation, blocked: false } })).toBeNull();
  });
  it('tells idle users when the team will act next, but stays quiet while working or blocked', () => {
    const at = (minutes: number) => new Date(now + minutes * 60000).toISOString();
    const time = (iso: string) => {
      const date = new Date(iso);
      return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
    };
    expect(nextRunLabel(schedule, now, false)).toBe(`Kiểm tra tiếp theo lúc ${time(at(1))}`);
    expect(nextRunLabel({ ...schedule, nextPublication: { id: 4, slotAt: at(30) } }, now, false))
      .toBe(`Đăng video #4 lúc ${time(at(30))}`);
    expect(nextRunLabel({ ...schedule, nextPublication: { id: 4, slotAt: at(-1) } }, now, false)).toBe('Video #4 đã đến giờ đăng');
    expect(nextRunLabel({ ...schedule, nextPublication: { id: 4, slotAt: at(48 * 60) } }, now, false)).toMatch(/\d{2}:\d{2} · \d{2}\/\d{2}$/);
    expect(nextRunLabel({ ...schedule, paused: true }, now, false)).toBe('Đã tạm dừng · chờ lệnh chạy');
    expect(nextRunLabel({ ...schedule, enabled: false }, now, false)).toBe('Tự động đang tắt');
    expect(nextRunLabel(schedule, now, true)).toBeNull();
    expect(nextRunLabel({ ...schedule, lastError: 'boom' }, now, false)).toBeNull();
    expect(nextRunLabel({ ...schedule, nextCheckAt: null }, now, false)).toBeNull();
    expect(nextRunLabel(null, now, false)).toBeNull();
  });
});
