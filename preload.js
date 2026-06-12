const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
  hide: () => ipcRenderer.send('hide'),
  saveColor: color => ipcRenderer.send('save-color', color),
  getColor: () => ipcRenderer.invoke('get-color'),
  onSetColor: cb => ipcRenderer.on('set-color', (_, c) => cb(c)),
  setIcons: (trayUrl, dockUrl) => ipcRenderer.send('set-icons', trayUrl, dockUrl),
})
