const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
  hide: () => ipcRenderer.send('hide'),
  saveColor: color => ipcRenderer.send('save-color', color),
  getColor: () => ipcRenderer.invoke('get-color'),
  onSetColor: cb => ipcRenderer.on('set-color', (_, c) => cb(c)),
  saveBackground: background => ipcRenderer.send('save-background', background),
  getBackground: () => ipcRenderer.invoke('get-background'),
  onSetBackground: cb => ipcRenderer.on('set-background', (_, b) => cb(b)),
  chooseBackgroundImage: () => ipcRenderer.invoke('choose-background-image'),
  setIcons: (trayUrl, dockUrl) => ipcRenderer.send('set-icons', trayUrl, dockUrl),
  setIdle: secs => ipcRenderer.send('set-idle', secs),
  getIdle: () => ipcRenderer.invoke('get-idle'),
  dismissIfAuto: () => ipcRenderer.send('dismiss-if-auto'),
})
