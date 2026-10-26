import type { AgentSkillProfile, SkillMeta, StudioEvent, VideoItem } from './types.js';
import type { ActivitySnapshot } from './activity.js';
import type { AutomationConfig, AutomationState } from '@endo/core/automation';
import type { ModelProvider } from '@endo/core/modelProvider';

export interface AutomationStatus extends AutomationConfig, AutomationState {
  dryRun: boolean | null;
  timezone: string | null;
}

export interface Job {
  id: string;
  command: string;
  args: string[];
  status: 'running' | 'succeeded' | 'failed' | 'stopped' | 'interrupted';
  startedAt: string;
  finishedAt?: string;
  output: string;
  error?: string;
  eventCursor?: number;
}

export interface StudioStatus {
  videos: { status: string; count: number }[];
  ideas: { status: string; count: number }[];
  eventsCount: number;
  activeJob: Job | null;
  activity: ActivitySnapshot;
  schedule: ScheduleStatus;
}

export interface ScheduleStatus {
  enabled: boolean;
  paused: boolean;
  serverTime: string;
  nextCheckAt: string | null;
  nextPublication: { id: number; slotAt: string } | null;
  dueCount: number;
  pendingProduction: number;
  activeCommand: string | null;
  lastError: string | null;
  automation?: AutomationStatus;
}

export interface CommandResult {
  success: boolean;
  output: string;
  error?: string;
}

export interface LogMessage {
  level: string;
  text: string;
}

export interface StudioAPI {
  getModels(provider: ModelProvider): Promise<{ models: string[] }>;
  getStatus(): Promise<StudioStatus>;
  saveAutomation(config: AutomationConfig & { action?: 'apply' | 'save' }): Promise<boolean>;
  getVideos(): Promise<VideoItem[]>;
  getVideoDetail(id: number): Promise<VideoItem>;
  getEvents(limit?: number): Promise<StudioEvent[]>;
  runWalkthrough(): Promise<CommandResult>;
  runCommand(command: string, args?: string[]): Promise<CommandResult>;
  stopAllAgents(): Promise<{ success: boolean }>;
  resetDatabase(options?: { keepMedia?: boolean }): Promise<CommandResult>;
  getDoctor(): Promise<{ output: string }>;
  getTokensStatus(): Promise<Record<string, { configured: boolean; status: string; preview: string }>>;
  getSettings(): Promise<{ exists: boolean; content: string }>;
  saveSettings(content: string): Promise<boolean>;
  getAgentSkills(): Promise<{ availableSkills: SkillMeta[]; savedProfiles: Record<string, AgentSkillProfile> }>;
  saveAgentSkills(profiles: Record<string, AgentSkillProfile>): Promise<boolean>;
  onLog(callback: (data: LogMessage) => void): () => void;
  onEventPoll(callback: (rows: StudioEvent[]) => void): () => void;
  onActivity(callback: (snapshot: ActivitySnapshot) => void): () => void;
}
