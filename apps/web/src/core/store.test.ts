import { afterEach, describe, expect, it, vi } from 'vitest';
import { StudioStore } from './store';
import { eventBus } from './eventBus';
import { AGENT_ROLES, reduceActivity, type ActivitySnapshot } from '../../shared/activity';
import type { StudioEvent } from './types';

const event = (id: number, agent: string, phase?: StudioEvent['phase'], message = agent): StudioEvent =>
  ({ id, agent, phase, message, ts: `2026-10-26T00:00:${String(id).padStart(2, '0')}Z`, level: 'info', video_id: 7 });
const snapshot = (revision: number, events: StudioEvent[], jobId: string | null = 'job'): ActivitySnapshot =>
  ({ generation: 1, revision, jobId, current: reduceActivity(events) });
afterEach(() => vi.restoreAllMocks());

describe('authoritative agent activity', () => {
  it('uses the same role for upload in audit labels and character activity', () => {
    expect(AGENT_ROLES.upload).toBe('producer');
    expect(reduceActivity([event(1, 'upload', 'started')])?.role).toBe('producer');
  });
  it('does not animate or change status when replaying audit history', () => {
    const store = new StudioStore();
    const emit = vi.spyOn(eventBus, 'emit');
    store.addEvent(event(1, 'writer', 'started'));
    store.addEvent(event(2, 'critic', 'started'));
    expect(store.get().agents.every((agent) => agent.status === 'idle')).toBe(true);
    expect(emit).not.toHaveBeenCalled();
  });
  it('deduplicates and sorts replayed events without dropping different agents', () => {
    const store = new StudioStore();
    store.addEvent(event(2, 'critic'));
    store.addEvent(event(1, 'writer'));
    store.addEvent(event(1, 'writer'));
    store.addEvent({ ...event(3, 'qa'), ts: event(2, 'critic').ts, message: 'critic' });
    expect(store.get().events.map((row) => row.id)).toEqual([1, 2, 3]);
  });
  it('tracks stage starts, nested visual/render, QA, and terminal completion', () => {
    const store = new StudioStore();
    const events: StudioEvent[] = [];
    for (const [i, agent] of ['writer', 'critic', 'voice', 'visual', 'render', 'qa', 'upload', 'publisher'].entries()) {
      events.push(event(i + 1, agent, 'started'));
      store.applyActivity(snapshot(i + 1, events));
      const working = store.get().agents.filter((item) => item.status === 'working');
      expect(working.map((item) => item.id)).toEqual([AGENT_ROLES[agent]]);
      expect(working[0].thought).toContain('#7');
    }
    store.applyActivity(snapshot(9, events, null));
    expect(store.get().agents.every((agent) => agent.status === 'idle' && !agent.speech && !agent.statusIcon)).toBe(true);
  });
  it('does not mark an agent working just because its result was logged', () => {
    const events = [event(1, 'writer', 'started'), event(2, 'writer', 'finished'), event(3, 'writer')];
    expect(reduceActivity(events)?.status).toBe('idle');
  });
  it('shows failures, then clears the previous error on the next stage', () => {
    const store = new StudioStore();
    const events = [event(1, 'writer', 'started'), { ...event(2, 'writer', 'failed'), level: 'error' }];
    store.applyActivity(snapshot(1, events));
    expect(store.get().agents.find((agent) => agent.id === 'writer')?.status).toBe('rejected');
    store.applyActivity(snapshot(2, [...events, event(3, 'critic', 'started')]));
    expect(store.get().agents.find((agent) => agent.id === 'writer')?.status).toBe('idle');
    expect(store.get().agents.find((agent) => agent.id === 'critic')?.status).toBe('working');
  });
  it('ignores stale snapshots and resets revision tracking after a server restart', () => {
    const store = new StudioStore();
    store.applyActivity(snapshot(20, [event(1, 'writer', 'started')]));
    store.applyActivity(snapshot(19, [event(2, 'publisher', 'started')]));
    expect(store.get().agents.find((agent) => agent.status === 'working')?.id).toBe('writer');
    store.applyActivity({ ...snapshot(1, []), generation: 2 });
    store.applyActivity(snapshot(21, [event(3, 'publisher', 'started')]));
    expect(store.get().agents.every((agent) => agent.status === 'idle')).toBe(true);
  });
  it('clears speech/icons and updates the canvas immediately on reset', () => {
    const store = new StudioStore();
    store.applyActivity(snapshot(1, [event(1, 'render', 'started')]));
    const emit = vi.spyOn(eventBus, 'emit');
    store.clearAll();
    expect(emit).toHaveBeenCalledWith('agent:update', 'producer',
      expect.objectContaining({ status: 'idle', statusIcon: undefined, speech: undefined }));
  });
});
