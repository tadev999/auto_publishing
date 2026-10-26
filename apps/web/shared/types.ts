export type { AgentSkillProfile, SkillMeta } from '@endo/core/skills';

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
  phase?: 'started' | 'finished' | 'failed' | null;
}
