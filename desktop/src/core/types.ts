export type AgentRole =
  | 'ingest'
  | 'planner'
  | 'writer'
  | 'critic'
  | 'voice'
  | 'visual'
  | 'render'
  | 'qa'
  | 'publisher'
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
  deskId: string;
  color: string;
  status: AgentStatus;
  statusIcon?: string;
  thought?: string;
  speech?: string;
  speechTimer?: number;
  progress?: number;
}

export interface SkillMeta {
  id: string;
  name: string;
  title: string;
  description: string;
  category: 'core' | 'writing' | 'formats' | 'retention' | 'quality' | 'production';
  icon: string;
  badge: string;
}

export interface AgentSkillProfile {
  id: string;
  name: string;
  title: string;
  role: string;
  avatarIcon: string;
  color: string;
  model: string;
  temperature: number;
  tone: 'philosophy' | 'viral' | 'satire' | 'practical' | 'strict';
  systemPromptExtra?: string;
  equippedSkills: string[];
  stats: {
    creativity: number;
    precision: number;
    empathy: number;
    velocity: number;
  };
}

export interface Desk {
  id: string;
  label: string;
  role: AgentRole;
  tx: number;
  ty: number;
  color: number;
}

export interface VideoItem {
  id: number;
  slot_at: string;
  format: string;
  episode: number;
  status: string;
  article_id: string;
  script?: string;
  critic?: string;
  media?: string;
  error?: string;
}

export interface StudioEvent {
  id?: number;
  ts: string;
  video_id?: number | null;
  agent: string;
  level: string;
  message: string;
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
