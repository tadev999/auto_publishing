import type { StudioEvent } from './types.js';

export const AGENT_ROLES: Record<string, string> = {
  ingest: 'planner', planner: 'planner', writer: 'writer', critic: 'critic', qa: 'critic',
  producer: 'producer', voice: 'producer', visual: 'producer', render: 'producer', upload: 'producer',
  publisher: 'publisher', analytics: 'publisher',
};

export const AGENT_ICONS: Record<string, string> = {
  ingest: '📚', planner: '🗓️', writer: '✍️', critic: '⚖️', qa: '🔍',
  producer: '🎬', voice: '🎙️', visual: '🎬', render: '⚡', upload: '📦',
  publisher: '🚀', analytics: '📊',
};

export interface AgentActivity {
  agent: string;
  role: string;
  status: 'working' | 'idle' | 'rejected';
  message: string;
  eventId?: number;
  videoId?: number | null;
}

export interface ActivitySnapshot {
  generation: number;
  revision: number;
  jobId: string | null;
  current: AgentActivity | null;
}

export function reduceActivity(events: StudioEvent[]): AgentActivity | null {
  return events.reduce<AgentActivity | null>((current, event) => {
    const role = AGENT_ROLES[event.agent];
    if (!role) return current;
    if (event.phase === 'started') {
      return { agent: event.agent, role, status: 'working', message: event.message,
        eventId: event.id, videoId: event.video_id };
    } else if (current && current.role === role) {
      return { ...current, message: event.message, eventId: event.id, videoId: event.video_id,
        status: event.phase === 'failed' || event.level === 'error' ? 'rejected'
          : event.phase === 'finished' ? 'idle' : current.status };
    }
    return current;
  }, null);
}
