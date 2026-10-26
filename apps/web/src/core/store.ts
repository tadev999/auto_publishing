import { studioAPI } from './api';
import { INITIAL_AGENTS } from './config';
import { eventBus } from './eventBus';
import { AGENT_ICONS, type ActivitySnapshot } from '../../shared/activity';
import type { PipelineStats, StudioAgent, StudioEvent, VideoItem } from './types';
import type { ScheduleStatus } from '../../shared/api';

interface StoreState {
  agents: StudioAgent[];
  videos: VideoItem[];
  events: StudioEvent[];
  stats: PipelineStats;
  selectedVideoId: number | null;
  isRunningPipeline: boolean;
  activeVideoDetail: VideoItem | null;
  schedule: ScheduleStatus | null;
  scheduleFetchedAt: number;
  refreshError: string | null;
}

const emptyStats = (): PipelineStats => ({
  planned: 0, scripted: 0, approved: 0, voiced: 0, rendered: 0, qa_passed: 0,
  queued: 0, published: 0, failed: 0, ideasAvailable: 0, ideasUsed: 0,
});
type Subscriber = (state: StoreState) => void;

export class StudioStore {
  private state: StoreState = {
    agents: INITIAL_AGENTS.map((agent) => ({ ...agent })),
    videos: [], events: [], stats: emptyStats(), selectedVideoId: null,
    isRunningPipeline: false, activeVideoDetail: null,
    schedule: null, scheduleFetchedAt: 0, refreshError: null,
  };
  private subs = new Set<Subscriber>();
  private activityRevision = -1;
  private activityGeneration = 0;
  private refreshSequence = 0;

  get(): StoreState { return this.state; }
  subscribe(fn: Subscriber): () => void {
    this.subs.add(fn);
    return () => this.subs.delete(fn);
  }
  private notify() { this.subs.forEach((fn) => fn(this.state)); }
  setAgents(agents: StudioAgent[]) {
    this.state.agents = agents;
    this.notify();
  }
  updateAgent(id: string, patch: Partial<StudioAgent>) {
    this.state.agents = this.state.agents.map((agent) => agent.id === id ? { ...agent, ...patch } : agent);
    eventBus.emit('agent:update', id, patch);
    this.notify();
  }
  setAgentSpeech(id: string, speech: string, duration = 4000) {
    this.updateAgent(id, { speech, speechTimer: Date.now() + duration });
    eventBus.emit('agent:speak', id, speech);
  }
  setVideos(videos: VideoItem[]) {
    this.state.videos = videos;
    this.notify();
  }
  addEvent(event: StudioEvent) {
    const duplicate = this.state.events.some((existing) => event.id != null && existing.id != null
      ? existing.id === event.id
      : existing.ts === event.ts && existing.agent === event.agent && existing.message === event.message);
    if (duplicate) return;
    // Audit history never drives current animation or replays past handoffs.
    this.state.events = [...this.state.events, event].sort((a, b) =>
      a.id != null && b.id != null ? a.id - b.id : a.ts.localeCompare(b.ts)).slice(-100);
    this.notify();
  }

  applyActivity(snapshot: ActivitySnapshot) {
    if (snapshot.generation < this.activityGeneration) return;
    if (snapshot.generation > this.activityGeneration) {
      this.activityGeneration = snapshot.generation;
      this.activityRevision = -1;
    }
    if (snapshot.revision <= this.activityRevision) return;
    this.activityRevision = snapshot.revision;
    this.state.isRunningPipeline = Boolean(snapshot.jobId);
    const current = snapshot.jobId ? snapshot.current : null;
    for (const agent of this.state.agents) {
      const activity = current?.role === agent.id ? current : null;
      const status = activity?.status || 'idle';
      const statusIcon = activity
        ? status === 'rejected' ? '⚠️' : status === 'working' ? AGENT_ICONS[activity.agent] : undefined
        : undefined;
      const thought = activity
        ? `${activity.videoId ? `#${activity.videoId} · ` : ''}${activity.message}`
        : snapshot.jobId ? 'Chờ công đoạn tiếp theo.' : 'Không có tác vụ đang chạy.';
      if (agent.status !== status || agent.statusIcon !== statusIcon || agent.thought !== thought) {
        this.updateAgent(agent.id, { status, statusIcon, thought,
          speech: status === 'working' || status === 'rejected' ? thought : undefined,
          speechTimer: status === 'working' || status === 'rejected' ? Date.now() + 5000 : undefined });
      }
    }
    this.notify();
  }

  setAllAgentsIdle(summaryMessage?: string) {
    for (const agent of this.state.agents) {
      this.updateAgent(agent.id, { status: 'idle', statusIcon: undefined, speech: undefined,
        speechTimer: undefined, thought: summaryMessage || 'Không có tác vụ đang chạy.' });
    }
  }
  setStats(stats: PipelineStats) { this.state.stats = stats; this.notify(); }
  setSelectedVideoId(id: number | null) { this.state.selectedVideoId = id; this.notify(); }
  setActiveVideoDetail(video: VideoItem | null) { this.state.activeVideoDetail = video; this.notify(); }
  setRunningPipeline(isRunning: boolean) { this.state.isRunningPipeline = isRunning; this.notify(); }

  async refreshData() {
    const sequence = ++this.refreshSequence;
    try {
      const [status, videos, events] = await Promise.all([
        studioAPI.getStatus(), studioAPI.getVideos(), studioAPI.getEvents(30),
      ]);
      if (sequence !== this.refreshSequence) return;
      if (!status.schedule) {
        throw new Error('Server chưa hỗ trợ lịch hoạt động. Vui lòng khởi động lại server sau khi cập nhật.');
      }
      this.state.schedule = status.schedule;
      this.state.scheduleFetchedAt = Date.now();
      this.state.refreshError = null;
      this.state.videos = videos;
      events.forEach((event) => this.addEvent(event));
      this.applyActivity(status.activity);
      const counts = Object.fromEntries(status.videos.map((row) => [row.status, row.count]));
      const ideas = Object.fromEntries(status.ideas.map((row) => [row.status, row.count]));
      this.state.stats = {
        planned: counts.planned || 0, scripted: counts.scripted || 0, approved: counts.approved || 0,
        voiced: counts.voiced || 0, rendered: counts.rendered || 0, qa_passed: counts.qa_passed || 0,
        queued: counts.queued || 0, published: counts.published || 0, failed: counts.failed || 0,
        ideasAvailable: ideas.available || 0, ideasUsed: ideas.used || 0,
      };
      this.notify();
    } catch (error) {
      if (sequence !== this.refreshSequence) return;
      this.state.refreshError = error instanceof Error ? error.message : String(error);
      this.notify();
      console.error('Failed to refresh studio data:', error);
    }
  }

  clearAll() {
    this.refreshSequence++;
    this.state.videos = [];
    this.state.events = [];
    this.state.stats = emptyStats();
    this.state.selectedVideoId = null;
    this.state.activeVideoDetail = null;
    this.state.isRunningPipeline = false;
    this.state.schedule = null;
    this.state.scheduleFetchedAt = 0;
    this.setAllAgentsIdle();
  }
}

export const store = new StudioStore();
