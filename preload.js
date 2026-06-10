/* Kanban Office — preload bridge. Safe API for the office floor renderer:
   file requests / change requests (spawn Claude Code), free-form terminal prompts,
   agent roster CRUD, and live plan + terminal streams. */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('munder', {
  fileRequest: (payload) => ipcRenderer.invoke('file-request', payload),
  runPrompt: (payload) => ipcRenderer.invoke('run-prompt', payload),
  getState: () => ipcRenderer.invoke('get-state'),
  getAgents: () => ipcRenderer.invoke('get-agents'),
  saveAgents: (payload) => ipcRenderer.invoke('save-agents', payload),
  getLinks: () => ipcRenderer.invoke('get-links'),
  saveLinks: (payload) => ipcRenderer.invoke('save-links', payload),
  pickFolder: () => ipcRenderer.invoke('pick-folder'),
  saveState: (payload) => ipcRenderer.invoke('save-state', payload),
  runAgent: (payload) => ipcRenderer.invoke('run-agent', payload),
  buildAgentMd: (payload) => ipcRenderer.invoke('build-agent-md', payload),
  getAgentMemory: (payload) => ipcRenderer.invoke('get-agent-memory', payload),
  appendAgentMemory: (payload) => ipcRenderer.invoke('append-agent-memory', payload),
  getProjects: () => ipcRenderer.invoke('get-projects'),
  saveProjects: (payload) => ipcRenderer.invoke('save-projects', payload),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  checkUpdate: () => ipcRenderer.invoke('check-update'),
  downloadUpdate: (url) => ipcRenderer.invoke('download-update', url),
  onState: (cb) => ipcRenderer.on('state-update', (_e, s) => cb(s)),
  onEvent: (cb) => ipcRenderer.on('claude-event', (_e, ev) => cb(ev))
});
