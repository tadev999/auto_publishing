export type { AgentSkillProfile, SkillMeta, StudioEvent, VideoItem } from '../../shared/types';

export type AgentRole =
  | 'planner'    // 1. Trưởng Ban Nội Dung & Chiến Lược (ingest + planner)
  | 'writer'     // 2. Biên Kịch Trưởng
  | 'critic'     // 3. Tổng Biên Tập & Kiểm Soát QA (critic + qa)
  | 'producer'   // 4. Kỹ Sư Sản Xuất Video (voice + visual + render)
  | 'publisher'  // 5. Điều Phối Phát Hành & Tăng Trưởng (publisher + analytics)
  | 'ingest'
  | 'voice'
  | 'visual'
  | 'render'
  | 'qa'
  | 'analytics';

export type AgentStatus =
  | 'idle'
  | 'assigned'
  | 'walking'
  | 'thinking'
  | 'working'
  | 'reviewing'
  | 'completed'
  | 'rejected';

export interface StudioAgent {
  id: string;
  name: string;
  role: AgentRole;
  title: string;
  department: string;
  deskId: string;
  color: string;
  status: AgentStatus;
  activityStage?: string;
  statusIcon?: string;
  thought?: string;
  speech?: string;
  speechTimer?: number;
  progress?: number;
}

export interface Desk {
  id: string;
  label: string;
  role: AgentRole;
  tx: number;
  ty: number;
  color: number;
}

export interface PipelineStats {
  planned: number;
  scripted: number;
  approved: number;
  voiced: number;
  rendered: number;
  qa_passed: number;
  queued: number;
  published: number;
  failed: number;
  ideasAvailable: number;
  ideasUsed: number;
}
