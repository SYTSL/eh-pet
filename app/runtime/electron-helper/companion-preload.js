const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('companion', {
  request: (action, input) => ipcRenderer.invoke('companion:request', action, input),
  onPage: (callback) => ipcRenderer.on('companion:page', (_event, page) => callback(page)),
});
