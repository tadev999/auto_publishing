/// <reference types="vite/client" />

interface Window {
  studioAPI?: {
    getStatus: () => Promise<any>;
    getVideos: () => Promise<any[]>;
    getVideoDetail: (id: number) => Promise<any>;
    getEvents: (limit?: number) => Promise<any[]>;
    runWalkthrough: () => Promise<any>;
    runCommand: (cmd: string, args?: string[]) => Promise<any>;
    stopAllAgents?: () => Promise<{ success: boolean }>;
    resetDatabase?: (options?: { keepMedia?: boolean }) => Promise<{ success: boolean; output?: string; error?: string }>;
    openVideo: (filePath: string) => Promise<boolean>;
    openRemotionStudio: () => Promise<boolean>;
    getDoctor: () => Promise<{ output: string }>;
    getTokensStatus?: () => Promise<Record<string, any>>;
    getSettings: () => Promise<{ exists: boolean; content: string }>;
    saveSettings: (content: string) => Promise<boolean>;
    getAgentSkills: () => Promise<{ availableSkills: any[]; savedProfiles: Record<string, any> }>;
    saveAgentSkills: (profiles: Record<string, any>) => Promise<boolean>;
    onLog: (callback: (data: { level: string; text: string }) => void) => () => void;
    onEventPoll: (callback: (rows: any[]) => void) => () => void;
  };
}
