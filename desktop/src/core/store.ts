import { INITIAL_AGENTS } from './config';
import { eventBus } from './eventBus';
import type { PipelineStats, StudioAgent, StudioEvent, VideoItem } from './types';

interface StoreState {
  agents: StudioAgent[];
  videos: VideoItem[];
  events: StudioEvent[];
  stats: PipelineStats;
  selectedVideoId: number | null;
  isRunningPipeline: boolean;
  activeVideoDetail: VideoItem | null;
}

type Subscriber = (state: StoreState) => void;

class StudioStore {
  private state: StoreState = {
    agents: [...INITIAL_AGENTS],
    videos: [],
    events: [],
    stats: {
      planned: 0,
      scripted: 0,
      approved: 0,
      voiced: 0,
      rendered: 0,
      qa_passed: 0,
      queued: 0,
      published: 0,
      failed: 0,
      ideasAvailable: 0,
      ideasUsed: 0,
    },
    selectedVideoId: null,
    isRunningPipeline: false,
    activeVideoDetail: null,
  };

  private subs = new Set<Subscriber>();

  get(): StoreState {
    return this.state;
  }

  subscribe(fn: Subscriber): () => void {
    this.subs.add(fn);
    return () => this.subs.delete(fn);
  }

  private notify() {
    this.subs.forEach((fn) => fn(this.state));
  }

  setAgents(agents: StudioAgent[]) {
    this.state.agents = agents;
    this.notify();
  }

  updateAgent(id: string, patch: Partial<StudioAgent>) {
    this.state.agents = this.state.agents.map((a) => (a.id === id ? { ...a, ...patch } : a));
    this.notify();
    eventBus.emit('agent:update', id, patch);
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
    this.state.events = [event, ...this.state.events.slice(0, 99)];
    this.notify();

    // Tự động kích hoạt hành động của Agent dựa theo event
    if (event.agent) {
      const agentId = event.agent.toLowerCase();
      const ag = this.state.agents.find((a) => a.id === agentId);
      if (ag) {
        this.setAgentSpeech(agentId, event.message.slice(0, 60), 4500);
        this.updateAgent(agentId, {
          status: event.level === 'error' ? 'rejected' : 'working',
          statusIcon: event.level === 'error' ? '⚠️' : '⚡',
        });
      }
    }
  }

  setStats(stats: PipelineStats) {
    this.state.stats = stats;
    this.notify();
  }

  setSelectedVideoId(id: number | null) {
    this.state.selectedVideoId = id;
    this.notify();
  }

  setActiveVideoDetail(video: VideoItem | null) {
    this.state.activeVideoDetail = video;
    this.notify();
  }

  setRunningPipeline(isRunning: boolean) {
    this.state.isRunningPipeline = isRunning;
    this.notify();
  }

  async refreshData() {
    if (!window.studioAPI) return;
    try {
      const [statusRes, videosRes, eventsRes] = await Promise.all([
        window.studioAPI.getStatus(),
        window.studioAPI.getVideos(),
        window.studioAPI.getEvents(30),
      ]);

      if (videosRes) this.state.videos = videosRes;
      if (eventsRes) this.state.events = eventsRes;

      if (statusRes) {
        const counts: Record<string, number> = {};
        statusRes.videos?.forEach((r: any) => {
          counts[r.status] = r.count;
        });
        const ideaCounts: Record<string, number> = {};
        statusRes.ideas?.forEach((r: any) => {
          ideaCounts[r.status] = r.count;
        });

        this.state.stats = {
          planned: counts.planned || 0,
          scripted: counts.scripted || 0,
          approved: counts.approved || 0,
          voiced: counts.voiced || 0,
          rendered: counts.rendered || 0,
          qa_passed: counts.qa_passed || 0,
          queued: counts.queued || 0,
          published: counts.published || 0,
          failed: counts.failed || 0,
          ideasAvailable: ideaCounts.available || 0,
          ideasUsed: ideaCounts.used || 0,
        };
      }
      this.notify();
    } catch (e) {
      console.warn('Failed to refresh data from SQLite:', e);
    }
  }
}

export const store = new StudioStore();
