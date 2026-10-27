import { studioAPI } from './core/api';
import { useEffect, useState } from 'react';
import AgentSkillModal from './components/AgentSkillModal';
import DoctorModal from './components/DoctorModal';
import EventTerminal from './components/EventTerminal';
import KanbanPipeline from './components/KanbanPipeline';
import SettingsModal from './components/SettingsModal';
import ResetConfirmModal from './components/ResetConfirmModal';
import StageView from './components/StageView';
import ScheduleNotice from './components/ScheduleNotice';
import { nextRunLabel } from './core/schedule';
import AutomationModal from './components/AutomationModal';
import TopBar from './components/TopBar';
import VideoDetailModal from './components/VideoDetailModal';
import { store } from './core/store';
import { eventAgentMeta } from './core/config';
import type { StudioAgent, VideoItem } from './core/types';

export default function App() {
  const [state, setState] = useState(store.get());
  const [selectedVideo, setSelectedVideo] = useState<VideoItem | null>(null);
  const [skillModalAgent, setSkillModalAgent] = useState<StudioAgent | null>(null);
  const [doctorOpen, setDoctorOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [liveLogs, setLiveLogs] = useState<string[]>([]);
  const [queueDrawerOpen, setQueueDrawerOpen] = useState(false);
  const [terminalOpen, setTerminalOpen] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);
  const [actionPending, setActionPending] = useState(false);
  const [automationOpen, setAutomationOpen] = useState(false);

  const runAction = (action: () => Promise<void>) => async () => {
    try {
      setActionPending(true);
      setApiError(null);
      await action();
    } catch (error) {
      setApiError(error instanceof Error ? error.message : String(error));
      await store.refreshData();
    } finally {
      setActionPending(false);
    }
  };

  useEffect(() => {
    const onError = (event: Event) => setApiError((event as CustomEvent<string>).detail);
    const onReset = () => { store.clearAll(); void store.refreshData(); };
    window.addEventListener('studio:error', onError);
    window.addEventListener('studio:reset', onReset);
    const unsub = store.subscribe((s) => setState({ ...s }));
    store.refreshData();
    const refresh = window.setInterval(() => { void store.refreshData(); }, 5000);
    const removeActivity = studioAPI.onActivity((snapshot) => store.applyActivity(snapshot));

    // Log và sự kiện từ server qua SSE.
    const removePoll = studioAPI.onEventPoll((rows) => {
      rows.forEach((r) => store.addEvent(r));
      store.refreshData();
    });

    const removeLog = studioAPI.onLog((data) => {
      setLiveLogs((prev) => [...prev.slice(-40), data.text.trim()]);
    });

    return () => {
      unsub();
      window.clearInterval(refresh);
      removeActivity();
      window.removeEventListener('studio:error', onError);
      window.removeEventListener('studio:reset', onReset);
      removePoll();
      removeLog();
    };
  }, []);

  const handleRunWalkthrough = async () => {
    setLiveLogs((prev) => [...prev, '>>> Bắt đầu chạy kịch bản Walkthrough Demo Offline...']);
    await studioAPI.runWalkthrough();
    await store.refreshData();
    setLiveLogs((prev) => [...prev, '>>> Hoàn thành chạy Demo Offline!']);
  };

  const handleRunProduce = async () => {
    setLiveLogs((prev) => [...prev, '>>> Bắt đầu quy trình sản xuất video...']);

    // 1. Kiểm tra nếu chưa có ý tưởng nào -> Tự động nạp bài viết (ingest)
    const statusRes = await studioAPI.getStatus();
    const availableIdeas = statusRes?.ideas?.find((i: any) => i.status === 'available')?.count || 0;
    const plannedVideos = statusRes?.videos?.find((v: any) => v.status === 'planned')?.count || 0;

    if (availableIdeas === 0 && plannedVideos === 0) {
      setLiveLogs((prev) => [...prev, '>>> [Bước 1/3] Kho ý tưởng trống. Đang nạp bài viết (endo ingest)...']);
      await studioAPI.runCommand('ingest', ['--limit', '2']);
      await store.refreshData();
    }

    // 2. Kiểm tra nếu chưa có video nào được lên lịch -> Tự động lên lịch (plan)
    const statusRes2 = await studioAPI.getStatus();
    const plannedVideosNow = statusRes2?.videos?.find((v: any) => v.status === 'planned')?.count || 0;

    if (plannedVideosNow === 0) {
      setLiveLogs((prev) => [...prev, '>>> [Bước 2/3] Đang lên lịch phát sóng khung giờ vàng (endo plan)...']);
      await studioAPI.runCommand('plan');
      await store.refreshData();
    }

    // 3. Tiến hành sản xuất video (Writer -> Critic -> Voice -> Render -> QA -> Upload)
    setLiveLogs((prev) => [...prev, '>>> [Bước 3/3] Đang khởi động chu trình Multi-Agent sản xuất (endo produce --limit 1)...']);
    const produceRes = await studioAPI.runCommand('produce', ['--limit', '1']);
    await store.refreshData();

    if (produceRes.success) {
      setLiveLogs((prev) => [...prev, '>>> ✓ Sản xuất video hoàn tất! Bạn có thể xem video hoặc xuất bản ngay.']);
    } else {
      setLiveLogs((prev) => [...prev, `>>> ⚠️ Kết thúc sản xuất: ${produceRes.error || produceRes.output || ''}`]);
    }
  };

  const handleRunPublish = async (videoId?: number) => {
    setLiveLogs((prev) => [...prev, `>>> Đang tiến hành xuất bản video ${videoId ? `#${videoId}` : 'đã tới lịch'}...`]);
    const args = videoId ? ['--video-id', String(videoId)] : [];
    await studioAPI.runCommand('publish', args);
    await store.refreshData();
    setLiveLogs((prev) => [...prev, '>>> ✓ Tiến trình xuất bản hoàn tất!']);
  };

  const handleRunPlan = async () => {
    setLiveLogs((prev) => [...prev, '>>> Đang chạy lệnh: endo plan...']);
    await studioAPI.runCommand('plan');
    await store.refreshData();
  };

  const handleStopAll = async () => {
    setLiveLogs((prev) => [...prev, '>>> Đang gửi lệnh dừng tất cả Agent...']);
    await studioAPI.stopAllAgents();
    await store.refreshData();
    setLiveLogs((prev) => [...prev, '>>> Đã dừng các Agent thành công!']);
  };

  const latestLog = liveLogs.length > 0 ? liveLogs[liveLogs.length - 1] : null;
  const latestEvent = state.events.length > 0 ? state.events[state.events.length - 1] : null;
  const tickerText = latestLog || (latestEvent
    ? `[${eventAgentMeta(latestEvent.agent).name}] ${eventAgentMeta(latestEvent.agent).task} · ${latestEvent.message}`
    : 'Studio đang trong trạng thái sẵn sàng trực chiến.');
  const readyVideos = state.videos.filter((v) => v.status === 'rendered' || v.status === 'qa_passed' || v.status === 'published');
  const nextRun = nextRunLabel(state.schedule, Date.now(), state.isRunningPipeline);

  return (
    <div className="studio-app">
      <TopBar
        automationStatus={<ScheduleNotice schedule={state.schedule} fetchedAt={state.scheduleFetchedAt}
          error={state.refreshError} running={state.isRunningPipeline} onOpenAutomation={() => setAutomationOpen(true)} />}
        onOpenDoctor={() => setDoctorOpen(true)}
        onOpenAutomation={() => setAutomationOpen(true)}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenSkills={() => setSkillModalAgent(state.agents.find((a) => a.role === 'writer') || state.agents[0])}
        onRunWalkthrough={runAction(handleRunWalkthrough)}
        onRunProduce={runAction(handleRunProduce)}
        onRunPlan={runAction(handleRunPlan)}
        onRunPublish={runAction(() => handleRunPublish())}
        busy={actionPending || state.isRunningPipeline}
        onOpenReset={() => setResetModalOpen(true)}
        onStopAll={runAction(handleStopAll)}
        terminalOpen={terminalOpen}
        onToggleTerminal={() => setTerminalOpen((prev) => !prev)}
      />
      {apiError && (
        <div role="alert" style={{ position: 'fixed', top: 76, left: '10%', right: '10%', zIndex: 10000,
          padding: 16, background: '#451a1a', color: '#fecaca', border: '1px solid #ef4444', borderRadius: 8 }}>
          {apiError}
          <button className="btn-close" onClick={() => setApiError(null)} aria-label="Đóng thông báo">×</button>
        </div>
      )}

      <main className={`studio-main full-hero ${terminalOpen ? 'with-live-panel' : ''}`}>
        {/* Khu vực Sân khấu chính */}
        <div className="stage-area">
          <ScheduleNotice variant="alert" schedule={state.schedule} fetchedAt={state.scheduleFetchedAt}
            error={state.refreshError} running={state.isRunningPipeline} onOpenAutomation={() => setAutomationOpen(true)} />
          <StageView>
            {nextRun && <p className="office-next-run" role="status">{nextRun}</p>}
          </StageView>

          {/* Ambient Floating Dock (Thanh dock nổi ở đáy sân khấu) */}
          <div className="ambient-floating-dock">
            {/* Nút Dock Trái: Mở Hàng Đợi Video */}
            <button
              className={`dock-chip-btn ${queueDrawerOpen ? 'active' : ''}`}
              onClick={() => setQueueDrawerOpen(!queueDrawerOpen)}
              title="Bấm để mở hoặc thu gọn hàng đợi video 9:16"
            >
              <span className="dock-icon" aria-hidden="true">≡</span>
              <span className="dock-text">
                Hàng Đợi: <b>{state.videos.length}</b> video {readyVideos.length > 0 ? `(${readyVideos.length} sẵn sàng)` : ''}
              </span>
              <span className="dock-chevron">{queueDrawerOpen ? '▾' : '▴'}</span>
            </button>

            {/* Nút Dock Phải: Live Event Stream Ticker (hiện khi side panel đang đóng) */}
            {!terminalOpen && (
              <button
                type="button"
                className="dock-ticker-capsule"
                onClick={() => setTerminalOpen(true)}
                title="Bấm để mở bảng Live Event song song với Sân Khấu"
              >
                <span className="live-dot-pulse"></span>
                <span className="ticker-label">LIVE EVENT:</span>
                <span className="ticker-content">{tickerText}</span>
                <span className="ticker-badge">{state.events.length}</span>
                <span className="dock-chevron">◂ Mở Panel</span>
              </button>
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
          <aside className="live-side-panel" aria-label="Nhật ký hoạt động agent">
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
          onPublish={(id) => { void runAction(() => handleRunPublish(id))(); }}
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
      {automationOpen && <AutomationModal schedule={state.schedule} running={state.isRunningPipeline || actionPending}
        onSaved={() => store.refreshData()} onClose={() => setAutomationOpen(false)} />}
    </div>
  );
}
