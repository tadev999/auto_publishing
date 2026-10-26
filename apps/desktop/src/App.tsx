import { useEffect, useState } from 'react';
import AgentSkillModal from './components/AgentSkillModal';
import DoctorModal from './components/DoctorModal';
import EventTerminal from './components/EventTerminal';
import KanbanPipeline from './components/KanbanPipeline';
import SettingsModal from './components/SettingsModal';
import ResetConfirmModal from './components/ResetConfirmModal';
import AgentStatusStrip from './components/AgentStatusStrip';
import StageView from './components/StageView';
import TopBar from './components/TopBar';
import VideoDetailModal from './components/VideoDetailModal';
import { eventBus } from './core/eventBus';
import { store } from './core/store';
import type { StudioAgent, VideoItem } from './core/types';

export default function App() {
  const [state, setState] = useState(store.get());
  const [selectedVideo, setSelectedVideo] = useState<VideoItem | null>(null);
  const [hudAgent, setHudAgent] = useState<StudioAgent | null>(null);
  const [skillModalAgent, setSkillModalAgent] = useState<StudioAgent | null>(null);
  const [doctorOpen, setDoctorOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [liveLogs, setLiveLogs] = useState<string[]>([]);
  const [queueDrawerOpen, setQueueDrawerOpen] = useState(false);
  const [terminalOpen, setTerminalOpen] = useState(true);

  useEffect(() => {
    const unsub = store.subscribe((s) => setState({ ...s }));
    store.refreshData();

    // Lắng nghe click chọn nhân vật trên sân khấu PixiJS -> mở HUD ngữ cảnh
    const unsubSelect = eventBus.on('agent:select', (agent: StudioAgent) => {
      setHudAgent(agent);
    });

    // Lắng nghe events stream từ Electron
    let removePoll: (() => void) | undefined;
    let removeLog: (() => void) | undefined;

    if (window.studioAPI) {
      removePoll = window.studioAPI.onEventPoll((rows: any[]) => {
        rows.forEach((r) => store.addEvent(r));
        store.refreshData();
      });

      removeLog = window.studioAPI.onLog((data: { level: string; text: string }) => {
        setLiveLogs((prev) => [...prev.slice(-40), data.text.trim()]);
      });
    }

    return () => {
      unsub();
      unsubSelect();
      if (removePoll) removePoll();
      if (removeLog) removeLog();
    };
  }, []);

  const handleRunWalkthrough = async () => {
    setLiveLogs((prev) => [...prev, '>>> Bắt đầu chạy kịch bản Walkthrough Demo Offline...']);
    store.setAgentSpeech('writer', 'Em bắt đầu lên ý tưởng và viết kịch bản!', 4000);
    if (window.studioAPI) {
      await window.studioAPI.runWalkthrough();
      await store.refreshData();
      setLiveLogs((prev) => [...prev, '>>> Hoàn thành chạy Demo Offline!']);
    }
  };

  const handleRunProduce = async () => {
    if (!window.studioAPI) return;
    setLiveLogs((prev) => [...prev, '>>> Bắt đầu quy trình sản xuất video...']);

    // 1. Kiểm tra nếu chưa có ý tưởng nào -> Tự động nạp bài viết (ingest)
    const statusRes = await window.studioAPI.getStatus();
    const availableIdeas = statusRes?.ideas?.find((i: any) => i.status === 'available')?.count || 0;
    const plannedVideos = statusRes?.videos?.find((v: any) => v.status === 'planned')?.count || 0;

    if (availableIdeas === 0 && plannedVideos === 0) {
      setLiveLogs((prev) => [...prev, '>>> [Bước 1/3] Kho ý tưởng trống. Đang nạp bài viết (endo ingest)...']);
      store.setAgentSpeech('planner', 'Tôi đang đọc các bài viết triết học và chắt lọc góc nhìn...', 4000);
      await window.studioAPI.runCommand('ingest', ['--limit', '2']);
      await store.refreshData();
    }

    // 2. Kiểm tra nếu chưa có video nào được lên lịch -> Tự động lên lịch (plan)
    const statusRes2 = await window.studioAPI.getStatus();
    const plannedVideosNow = statusRes2?.videos?.find((v: any) => v.status === 'planned')?.count || 0;

    if (plannedVideosNow === 0) {
      setLiveLogs((prev) => [...prev, '>>> [Bước 2/3] Đang lên lịch phát sóng khung giờ vàng (endo plan)...']);
      store.setAgentSpeech('planner', 'Đã xếp lịch phát sóng vào khung giờ vàng!', 4000);
      await window.studioAPI.runCommand('plan');
      await store.refreshData();
    }

    // 3. Tiến hành sản xuất video (Writer -> Critic -> Voice -> Render -> QA -> Upload)
    setLiveLogs((prev) => [...prev, '>>> [Bước 3/3] Đang khởi động chu trình Multi-Agent sản xuất (endo produce --limit 1)...']);
    store.setAgentSpeech('writer', 'Nhận đề tài! Tôi bắt đầu viết 3 hook giữ chân và kịch bản...', 4500);
    const produceRes = await window.studioAPI.runCommand('produce', ['--limit', '1']);
    await store.refreshData();

    if (produceRes.success) {
      setLiveLogs((prev) => [...prev, '>>> ✓ Sản xuất video hoàn tất! Bạn có thể xem video hoặc xuất bản ngay.']);
      store.setAllAgentsIdle('Sản xuất hoàn tất. Sẵn sàng tiếp nhận nhiệm vụ mới.');
    } else {
      setLiveLogs((prev) => [...prev, `>>> ⚠️ Kết thúc sản xuất: ${produceRes.error || produceRes.output || ''}`]);
      store.setAllAgentsIdle('Đã dừng tác vụ sản xuất.');
    }
  };

  const handleRunPublish = async (videoId?: number) => {
    setLiveLogs((prev) => [...prev, `>>> Đang tiến hành xuất bản video ${videoId ? `#${videoId}` : 'đã tới lịch'}...`]);
    store.setAgentSpeech('publisher', 'Tôi đang xuất bản video lên YouTube Shorts!', 4500);
    if (window.studioAPI) {
      const args = videoId ? ['--video-id', String(videoId)] : [];
      await window.studioAPI.runCommand('publish', args);
      await store.refreshData();
      store.setAllAgentsIdle('Xuất bản hoàn tất.');
      setLiveLogs((prev) => [...prev, '>>> ✓ Tiến trình xuất bản hoàn tất!']);
    }
  };

  const handleRunPlan = async () => {
    setLiveLogs((prev) => [...prev, '>>> Đang chạy lệnh: endo plan...']);
    if (window.studioAPI) {
      await window.studioAPI.runCommand('plan');
      await store.refreshData();
      store.setAllAgentsIdle('Lên lịch phát sóng hoàn tất.');
    }
  };

  const handleStopAll = async () => {
    setLiveLogs((prev) => [...prev, '>>> Đang gửi lệnh dừng tất cả Agent...']);
    if (window.studioAPI?.stopAllAgents) {
      await window.studioAPI.stopAllAgents();
      await store.refreshData();
      store.setAllAgentsIdle('Đã dừng tất cả tác vụ.');
      setLiveLogs((prev) => [...prev, '>>> Đã dừng các Agent thành công!']);
    }
  };

  const handleCoffeeBreak = () => {
    eventBus.emit('stage:coffee');
  };

  const latestLog = liveLogs.length > 0 ? liveLogs[liveLogs.length - 1] : null;
  const latestEvent = state.events.length > 0 ? state.events[state.events.length - 1] : null;
  const tickerText = latestLog || (latestEvent ? `[${latestEvent.agent}] ${latestEvent.message}` : 'Studio đang trong trạng thái sẵn sàng trực chiến.');
  const readyVideos = state.videos.filter((v) => v.status === 'rendered' || v.status === 'qa_passed' || v.status === 'published');

  return (
    <div className="studio-app">
      <TopBar
        onOpenDoctor={() => setDoctorOpen(true)}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenSkills={() => setSkillModalAgent(state.agents.find((a) => a.role === 'writer') || state.agents[0])}
        onRunWalkthrough={handleRunWalkthrough}
        onRunProduce={handleRunProduce}
        onRunPlan={handleRunPlan}
        onRunPublish={() => handleRunPublish()}
        onCoffeeBreak={handleCoffeeBreak}
        onOpenReset={() => setResetModalOpen(true)}
        onStopAll={handleStopAll}
        terminalOpen={terminalOpen}
        onToggleTerminal={() => setTerminalOpen((prev) => !prev)}
      />

      <main className={`studio-main full-hero ${terminalOpen ? 'with-live-panel' : ''}`}>
        {/* Khu vực Sân khấu chính */}
        <div className="stage-area">
          {/* Bảng Trạng Thái Trực Quan 5 Agent Ngay Trên Màn Hình */}
          <AgentStatusStrip
            agents={state.agents}
            onSelectAgent={(ag) => setSkillModalAgent(ag)}
          />

          <StageView
            selectedAgent={hudAgent}
            onCloseAgentHud={() => setHudAgent(null)}
            onOpenAgentSkills={(ag) => setSkillModalAgent(ag)}
          />

          {/* Ambient Floating Dock (Thanh dock nổi ở đáy sân khấu) */}
          <div className="ambient-floating-dock">
            {/* Nút Dock Trái: Mở Hàng Đợi Video */}
            <button
              className={`dock-chip-btn ${queueDrawerOpen ? 'active' : ''}`}
              onClick={() => setQueueDrawerOpen(!queueDrawerOpen)}
              title="Bấm để mở hoặc thu gọn hàng đợi video 9:16"
            >
              <span className="dock-icon">🎬</span>
              <span className="dock-text">
                Hàng Đợi: <b>{state.videos.length}</b> video {readyVideos.length > 0 ? `(${readyVideos.length} sẵn sàng)` : ''}
              </span>
              <span className="dock-chevron">{queueDrawerOpen ? '▾' : '▴'}</span>
            </button>

            {/* Nút Dock Phải: Live Event Stream Ticker (hiện khi side panel đang đóng) */}
            {!terminalOpen && (
              <div
                className="dock-ticker-capsule"
                onClick={() => setTerminalOpen(true)}
                title="Bấm để mở bảng Live Event song song với Sân Khấu"
              >
                <span className="live-dot-pulse"></span>
                <span className="ticker-label">LIVE EVENT:</span>
                <span className="ticker-content">{tickerText}</span>
                <span className="ticker-badge">{state.events.length}</span>
                <span className="dock-chevron">◂ Mở Panel</span>
              </div>
            )}
          </div>

          {/* Drawer Bảng Hàng Đợi Xuất Bản (Bottom Sheet) */}
          {queueDrawerOpen && (
            <div className="drawer-bottom-sheet">
              <KanbanPipeline
                videos={state.videos}
                onSelectVideo={(v) => setSelectedVideo(v)}
                onClose={() => setQueueDrawerOpen(false)}
              />
            </div>
          )}
        </div>

        {/* Live Event Stream Panel (Song song với sân khấu, không che mờ màn hình) */}
        {terminalOpen && (
          <aside className="live-side-panel">
            <EventTerminal
              events={state.events}
              liveLogs={liveLogs}
              onClose={() => setTerminalOpen(false)}
            />
          </aside>
        )}
      </main>

      {/* Các Modals Chi Tiết Khi Cần */}
      {selectedVideo && (
        <VideoDetailModal
          video={selectedVideo}
          onClose={() => setSelectedVideo(null)}
          onPublish={(id) => handleRunPublish(id)}
        />
      )}
      {doctorOpen && <DoctorModal onClose={() => setDoctorOpen(false)} />}
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
      {skillModalAgent && (
        <AgentSkillModal
          initialAgent={skillModalAgent}
          allAgents={state.agents}
          onClose={() => setSkillModalAgent(null)}
        />
      )}
      {resetModalOpen && (
        <ResetConfirmModal onClose={() => setResetModalOpen(false)} />
      )}
    </div>
  );
}
