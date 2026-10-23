const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('studioAPI', {
  getStatus: () => ipcRenderer.invoke('db:get-status'),
  getVideos: () => ipcRenderer.invoke('db:get-videos'),
  getVideoDetail: (id) => ipcRenderer.invoke('db:get-video-detail', id),
  getEvents: (limit) => ipcRenderer.invoke('db:get-events', limit),
  runWalkthrough: () => ipcRenderer.invoke('pipeline:run-walkthrough'),
  runCommand: (cmd, args) => ipcRenderer.invoke('pipeline:run-command', cmd, args),
  openVideo: (filePath) => ipcRenderer.invoke('media:open-video', filePath),
  openRemotionStudio: () => ipcRenderer.invoke('remotion:open-studio'),
  getDoctor: () => ipcRenderer.invoke('system:get-doctor'),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (settings) => ipcRenderer.invoke('settings:save', settings),
  getAgentSkills: () => ipcRenderer.invoke('agent:get-skills'),
  saveAgentSkills: (profiles) => ipcRenderer.invoke('agent:save-skills', profiles),
  onLog: (callback) => {
    const sub = (_e, data) => callback(data);
    ipcRenderer.on('log:event', sub);
    return () => ipcRenderer.removeListener('log:event', sub);
  },
  onEventPoll: (callback) => {
    const sub = (_e, data) => callback(data);
    ipcRenderer.on('poll:events', sub);
    return () => ipcRenderer.removeListener('poll:events', sub);
  },
});
