const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  openInExplorer: (filePath) => ipcRenderer.invoke('open-in-explorer', filePath),
  openPath: (path) => ipcRenderer.invoke('open-path', path),
  copyToClipboard: (text) => ipcRenderer.invoke('copy-to-clipboard', text),
  isDesktop: true,
});
