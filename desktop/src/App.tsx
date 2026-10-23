import { useEffect, useState } from 'react';
import AgentSkillModal from './components/AgentSkillModal';
import DoctorModal from './components/DoctorModal';
import EventTerminal from './components/EventTerminal';
import KanbanPipeline from './components/KanbanPipeline';
import SettingsModal from './components/SettingsModal';
import StageView from './components/StageView';
import TopBar from './components/TopBar';
import VideoDetailModal from './components/VideoDetailModal';
import { eventBus } from './core/eventBus';
import { store } from './core/store';
import type { StudioAgent, VideoItem } from './core/types';

export default function App() {
  const [state, setState] = useState(store.get());
  const [selectedVideo, setSelectedVideo] = useState<VideoItem | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<StudioAgent | null>(null);
  const [doctorOpen, setDoctorOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [liveLogs, setLiveLogs] = useState<string[]>([]);

  useEffect(() => {
    const unsub = store.subscribe((s) => setState({ ...s }));
    store.refreshData();

    // Lắng nghe click chọn nhân vật trên sân khấu PixiJS
    const unsubSelect = eventBus.on('agent:select', (agent: StudioAgent) => {
      setSelectedAgent(agent);
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
    setLiveLogs((prev) => [...prev, '>>> Đang chạy lệnh: endo produce --limit 1...']);
    if (window.studioAPI) {
      await window.studioAPI.runCommand('produce', ['--limit', '1']);
      await store.refreshData();
    }
  };

  const handleRunPlan = async () => {
    setLiveLogs((prev) => [...prev, '>>> Đang chạy lệnh: endo plan...']);
    if (window.studioAPI) {
      await window.studioAPI.runCommand('plan');
      await store.refreshData();
    }
  };

  return (
    <div className="studio-app">
      <TopBar
        onOpenDoctor={() => setDoctorOpen(true)}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenSkills={() => setSelectedAgent(state.agents.find((a) => a.role === 'writer') || state.agents[0])}
        onRunWalkthrough={handleRunWalkthrough}
        onRunProduce={handleRunProduce}
        onRunPlan={handleRunPlan}
      />

      <main className="studio-main">
        <section className="studio-center">
          <StageView onCollaborateTest={() => {}} />
          <KanbanPipeline videos={state.videos} onSelectVideo={(v) => setSelectedVideo(v)} />
        </section>

        <aside className="studio-sidebar">
          <EventTerminal events={state.events} liveLogs={liveLogs} />
        </aside>
      </main>

      {selectedVideo && (
        <VideoDetailModal video={selectedVideo} onClose={() => setSelectedVideo(null)} />
      )}
      {doctorOpen && <DoctorModal onClose={() => setDoctorOpen(false)} />}
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
      {selectedAgent && (
        <AgentSkillModal
          initialAgent={selectedAgent}
          allAgents={state.agents}
          onClose={() => setSelectedAgent(null)}
        />
      )}
    </div>
  );
}
