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
    if (
      this.state.events.some(
        (e) => (e.id && e.id === event.id) || (e.ts === event.ts && e.message === event.message)
      )
    ) {
      return;
    }

    // Lưu trữ theo thứ tự thời gian tuần tự (cũ trước, mới sau) để stream cuộn mượt mà
    this.state.events = [...this.state.events.slice(-99), event];
    this.notify();

    // 1. Ánh xạ vai trò chính xác từ Backend Agent sang 5 Phòng Ban của Studio
    const AGENT_MAPPING: Record<string, string> = {
      ingest: 'planner',
      planner: 'planner',
      writer: 'writer',
      critic: 'critic',
      qa: 'critic',
      voice: 'producer',
      visual: 'producer',
      render: 'producer',
      producer: 'producer',
      upload: 'producer',
      publisher: 'publisher',
      analytics: 'publisher',
    };

    const AGENT_STAGE_INFO: Record<string, { icon: string; title: string }> = {
      ingest: { icon: '📚', title: 'Đang đọc bài viết triết học & chắt lọc các góc nhìn' },
      planner: { icon: '🗓️', title: 'Đang xếp lịch phát sóng vào khung giờ vàng 9:16' },
      writer: { icon: '✍️', title: 'Đang sáng tác 3 phương án hook & kịch bản 2.4 từ/giây' },
      critic: { icon: '⚖️', title: 'Đang phản biện triết lý gốc & chấm điểm rubric' },
      qa: { icon: '🔍', title: 'Đang kiểm định chất lượng xuất xưởng Safe-zone 9:16' },
      voice: { icon: '🎙️', title: 'Đang tổng hợp giọng đọc AI ElevenLabs & căn nhịp phụ đề' },
      visual: { icon: '🎬', title: 'Đang tìm kiếm B-roll Pixabay điện ảnh & phối nhạc nền' },
      render: { icon: '⚡', title: 'Đang kết xuất video qua Remotion Engine Full HD 9:16...' },
      upload: { icon: '📦', title: 'Đang đóng gói video và đưa vào hàng chờ phát hành' },
      publisher: { icon: '🚀', title: 'Đang đăng tải video lên kênh YouTube Shorts' },
      analytics: { icon: '📊', title: 'Đang thu thập số liệu đo lường retention' },
    };

    if (event.agent) {
      const rawAgent = event.agent.toLowerCase();
      const targetId = AGENT_MAPPING[rawAgent] || rawAgent;
      const targetAgent = this.state.agents.find((a) => a.id === targetId);

      if (targetAgent) {
        const stageInfo = AGENT_STAGE_INFO[rawAgent] || { icon: '⚡', title: event.message };

        // 2. Chuyển TẤT CẢ các agent KHÁC về 'idle' (vì tại mỗi thời điểm chỉ có 1 agent phụ trách công đoạn)
        this.state.agents.forEach((ag) => {
          if (ag.id !== targetId) {
            if (ag.status === 'working') {
              ag.status = 'idle';
              ag.statusIcon = undefined;
              if (ag.id === 'planner') ag.thought = 'Đã hoàn thành lên lịch. Sẵn sàng cho đợt tiếp theo.';
              else if (ag.id === 'writer') ag.thought = 'Kịch bản đã hoàn thành, đã bàn giao thẩm định.';
              else if (ag.id === 'critic') ag.thought = 'Đã duyệt đạt chuẩn, đã bàn giao sản xuất.';
              else if (ag.id === 'producer') ag.thought = 'Đã kết xuất xong video thành phẩm.';
              else if (ag.id === 'publisher') ag.thought = 'Đã hoàn tất xuất bản.';
            }
          }
        });

        // 3. Cập nhật agent hiện tại sang 'working'
        const isError = event.level === 'error';
        targetAgent.status = isError ? 'rejected' : 'working';
        targetAgent.statusIcon = isError ? '⚠️' : stageInfo.icon;
        targetAgent.thought = stageInfo.title;

        this.setAgentSpeech(targetId, event.message.slice(0, 70), 5000);

        // 4. Nếu là sự kiện kết thúc chu trình
        const isFinishedTask =
          (rawAgent === 'upload' && event.message.includes('Vào hàng đợi')) ||
          (rawAgent === 'publisher' && (event.message.includes('đã đăng') || event.message.includes('sẽ đăng'))) ||
          (rawAgent === 'render' && event.message.includes('Dựng xong'));

        if (isFinishedTask) {
          setTimeout(() => {
            if (targetAgent.status === 'working') {
              targetAgent.status = 'idle';
              targetAgent.statusIcon = undefined;
              targetAgent.thought = 'Hoàn tất xuất sắc nhiệm vụ. Sẵn sàng cho video tiếp theo.';
              this.notify();
              eventBus.emit('agent:update', targetId, {
                status: 'idle',
                statusIcon: undefined,
                thought: targetAgent.thought,
              });
            }
          }, 6000);
        }

        this.notify();
        eventBus.emit('agent:update', targetId, {
          status: targetAgent.status,
          statusIcon: targetAgent.statusIcon,
          thought: targetAgent.thought,
        });
      }

      // 5. Kích hoạt hoạt họa phối hợp nhân vật chạy qua nhau trên sân khấu
      if (rawAgent === 'planner' || rawAgent === 'ingest') {
        eventBus.emit(
          'stage:collaborate',
          'planner',
          'writer',
          'Tôi đã lên lịch và chắt lọc góc nhìn, chuyển giao kịch bản!',
          'Ok anh, em sẽ viết 3 hook đảo ngược tư duy ngay!'
        );
      } else if (rawAgent === 'writer') {
        eventBus.emit(
          'stage:collaborate',
          'writer',
          'critic',
          'Em vừa hoàn thành kịch bản 3-hook, gửi anh thẩm định nhé!',
          'Để tôi thẩm định triết lý... Đạt chuẩn, duyệt cho sản xuất!'
        );
      } else if (rawAgent === 'critic') {
        eventBus.emit(
          'stage:collaborate',
          'critic',
          'producer',
          'Kịch bản đã thông qua, tiến hành thu âm & dựng phim Remotion!',
          'Nhận lệnh, đang tổng hợp giọng đọc và dựng phim 9:16...'
        );
      } else if (rawAgent === 'voice' || rawAgent === 'visual' || rawAgent === 'render') {
        if (event.message.includes('Dựng xong')) {
          eventBus.emit(
            'stage:collaborate',
            'producer',
            'publisher',
            'Video MP4 đã dựng xong chuẩn tỉ lệ 9:16 và âm thanh LUFS!',
            'Tuyệt vời! Tiếp nhận video, chuẩn bị phân phối đa nền tảng!'
          );
        }
      } else if (rawAgent === 'publisher') {
        eventBus.emit(
          'stage:collaborate',
          'publisher',
          'planner',
          'Báo cáo Trưởng ban: Video đã lên sóng YouTube Shorts đúng lịch!',
          'Tuyệt vời! Tôi đã lên sẵn đề tài tinh hoa cho slot tiếp theo!'
        );
      }
    }
  }

  setAllAgentsIdle(summaryMessage?: string) {
    this.state.agents.forEach((ag) => {
      ag.status = 'idle';
      ag.statusIcon = undefined;
      if (summaryMessage) ag.thought = summaryMessage;
    });
    this.notify();
    this.state.agents.forEach((ag) => {
      eventBus.emit('agent:update', ag.id, {
        status: 'idle',
        statusIcon: undefined,
        thought: ag.thought,
      });
    });
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
      if (this.state.events.length === 0 && eventsRes && eventsRes.length > 0) {
        // Khởi tạo danh sách ban đầu theo thứ tự thời gian tăng dần
        this.state.events = [...eventsRes].reverse();
      }

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

  clearAll() {
    this.state.videos = [];
    this.state.events = [];
    this.state.stats = {
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
    };
    this.state.selectedVideoId = null;
    this.state.activeVideoDetail = null;
    this.state.isRunningPipeline = false;
    this.state.agents.forEach((ag) => {
      ag.speech = undefined;
      ag.speechTimer = undefined;
      ag.status = 'idle';
      ag.statusIcon = undefined;
    });
    this.notify();
  }
}

export const store = new StudioStore();
