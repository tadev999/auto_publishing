import type { CommandResult, Job, LogMessage, StudioAPI } from '../../shared/api';
import type { StudioEvent } from './types';
import type { ActivitySnapshot } from '../../shared/activity';

export function reportError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  window.dispatchEvent(new CustomEvent<string>('studio:error', { detail: message }));
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  try {
    const response = await fetch(`/api${url}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...options?.headers },
    });
    if (!response.ok) {
      const contentType = response.headers.get('content-type') || '';
      const body = contentType.includes('application/json') ? await response.json() : null;
      throw new Error(body?.error || `HTTP ${response.status}: ${response.statusText}`);
    }
    return await response.json();
  } catch (error) {
    reportError(error);
    throw error;
  }
}

const post = <T>(url: string, body: unknown = {}) =>
  request<T>(url, { method: 'POST', body: JSON.stringify(body) });
const put = <T>(url: string, body: unknown) =>
  request<T>(url, { method: 'PUT', body: JSON.stringify(body) });

async function runCommand(command: string, args: string[] = []): Promise<CommandResult> {
  let job = await post<Job>('/jobs', { command, args });
  while (job.status === 'running') {
    await new Promise((resolve) => setTimeout(resolve, 750));
    job = await request<Job>(`/jobs/${job.id}`);
  }
  if (job.status !== 'succeeded') {
    const error = new Error(job.error || job.output || `Job ${job.status}`);
    reportError(error);
    throw error;
  }
  return { success: true, output: job.output };
}

const logSubscribers = new Set<(message: LogMessage) => void>();
const eventSubscribers = new Set<(events: StudioEvent[]) => void>();
const activitySubscribers = new Set<(snapshot: ActivitySnapshot) => void>();
let stream: EventSource | null = null;
let disconnected = false;
function connect() {
  if (stream) return;
  stream = new EventSource('/api/stream');
  stream.addEventListener('log', (event: MessageEvent<string>) => {
    const message: LogMessage = JSON.parse(event.data);
    logSubscribers.forEach((callback) => callback(message));
  });
  stream.addEventListener('events', (event: MessageEvent<string>) => {
    const events: StudioEvent[] = JSON.parse(event.data);
    eventSubscribers.forEach((callback) => callback(events));
  });
  stream.addEventListener('activity', (event: MessageEvent<string>) => {
    const snapshot: ActivitySnapshot = JSON.parse(event.data);
    activitySubscribers.forEach((callback) => callback(snapshot));
  });
  stream.addEventListener('reset', () => window.dispatchEvent(new Event('studio:reset')));
  stream.onopen = () => {
    if (disconnected) {
      logSubscribers.forEach((callback) => callback({ level: 'info', text: 'Đã kết nối lại server.' }));
      eventSubscribers.forEach((callback) => callback([]));
    }
    disconnected = false;
  };
  stream.onerror = () => {
    if (!disconnected) {
      logSubscribers.forEach((callback) => callback({ level: 'error', text: 'Mất kết nối realtime. Đang thử kết nối lại…' }));
    }
    disconnected = true;
  };
}
function disconnectIfUnused() {
  if (logSubscribers.size || eventSubscribers.size || activitySubscribers.size) return;
  stream?.close();
  stream = null;
}

export const studioAPI: StudioAPI = {
  getModels: (provider) => request(`/models/${provider}`),
  getStatus: () => request('/status'),
  saveAutomation: (config) => put('/automation', config),
  getVideos: () => request('/videos'),
  getVideoDetail: (id) => request(`/videos/${id}`),
  getEvents: (limit = 40) => request(`/events?limit=${limit}`),
  runCommand,
  runWalkthrough: () => runCommand('demo'),
  stopAllAgents: () => post('/stop'),
  resetDatabase: (options = {}) => post('/reset', options),
  getDoctor: () => request('/doctor'),
  getTokensStatus: () => request('/tokens'),
  getSettings: () => request('/settings'),
  saveSettings: (content) => put('/settings', { content }),
  getAgentSkills: () => request('/skills'),
  saveAgentSkills: (profiles) => put('/skills', profiles),
  onLog(callback) {
    logSubscribers.add(callback);
    connect();
    return () => { logSubscribers.delete(callback); disconnectIfUnused(); };
  },
  onEventPoll(callback) {
    eventSubscribers.add(callback);
    connect();
    return () => { eventSubscribers.delete(callback); disconnectIfUnused(); };
  },
  onActivity(callback) {
    activitySubscribers.add(callback);
    connect();
    return () => { activitySubscribers.delete(callback); disconnectIfUnused(); };
  },
};
