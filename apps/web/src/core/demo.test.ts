import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import { runDemoWalkthrough } from '../../../cli/src/demo_walkthrough.js';
import { AGENT_ROLES, reduceActivity } from '../../shared/activity';
import { StudioStore } from './store';
import type { StudioEvent } from './types';

const fixture = vi.hoisted(() => ({
  event: vi.fn(),
  render: vi.fn(),
  ffmpeg: vi.fn(),
}));

vi.mock('node:child_process', async (importOriginal) => ({
  ...await importOriginal<typeof import('node:child_process')>(),
  execFileSync: fixture.render,
}));
vi.mock('@endo/core', async (importOriginal) => {
  const core = await importOriginal<typeof import('@endo/core')>();
  return {
    ...core,
    makeCtx: () => ({
      settings: { path: () => '/demo-fixture', dataDir: '/demo-fixture' },
      db: {
        tx: (fn: () => void) => fn(),
        one: () => ({ n: 1, id: 1, article_id: 'bai-001' }),
        all: () => [],
        run: () => 1,
        updateVideo: vi.fn(),
      },
      event: fixture.event,
    }),
    loadArticles: () => [],
    videoDir: () => '/demo-fixture/video',
    runFfmpeg: fixture.ffmpeg,
    probe: () => ({ width: 1080, height: 1920, duration: 15.5, hasAudio: true }),
  };
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  fixture.event.mockReset();
});

describe('demo activity timing', () => {
  it('shows every demo stage as working across 500ms polls, then clears all five characters', async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(fs, 'existsSync').mockReturnValue(false);
    vi.spyOn(fs, 'mkdirSync').mockReturnValue(undefined);
    vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {});
    const events: StudioEvent[] = [];
    const lifecycle: { agent: string; phase: string; at: number }[] = [];
    fixture.event.mockImplementation((agent: string, message: string,
      options?: { phase?: StudioEvent['phase']; videoId?: number }) => {
      events.push({ id: events.length + 1, agent, message, level: 'info',
        ts: new Date().toISOString(), phase: options?.phase, video_id: options?.videoId });
      if (options?.phase) lifecycle.push({ agent, phase: options.phase, at: Date.now() });
    });
    const store = new StudioStore();
    const observed = new Map<string, number>();
    let revision = 0;
    const poller = setInterval(() => {
      const current = reduceActivity(events);
      store.applyActivity({ generation: 1, revision: ++revision, jobId: 'demo', current });
      if (current?.status === 'working') {
        observed.set(current.agent, (observed.get(current.agent) || 0) + 1);
        expect(store.get().agents.filter((agent) => agent.status === 'working').map((agent) => agent.id))
          .toEqual([AGENT_ROLES[current.agent]]);
      }
    }, 500);
    try {
      const demo = runDemoWalkthrough();
      await vi.advanceTimersByTimeAsync(25000);
      expect(await demo).toBe(true);
      const stages = ['ingest', 'planner', 'writer', 'critic', 'voice', 'render', 'qa', 'upload', 'publisher', 'analytics'];
      expect([...observed.keys()]).toEqual(stages);
      for (const agent of stages) {
        expect(observed.get(agent)).toBeGreaterThanOrEqual(4);
        const start = lifecycle.find((event) => event.agent === agent && event.phase === 'started')!;
        const finish = lifecycle.find((event) => event.agent === agent && event.phase === 'finished')!;
        expect(finish.at - start.at).toBeGreaterThanOrEqual(2200);
      }
      expect(reduceActivity(events)?.status).toBe('idle');
      expect(store.get().agents.every((agent) => agent.status === 'idle')).toBe(true);
      store.applyActivity({ generation: 1, revision: ++revision, jobId: null, current: null });
      expect(store.get().agents.every((agent) => agent.status === 'idle' && !agent.statusIcon)).toBe(true);
    } finally {
      clearInterval(poller);
    }
  });
});
