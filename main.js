const { app, BrowserWindow, powerMonitor, ipcMain, Tray, Menu, nativeImage, screen, globalShortcut, dialog } = require('electron')
const path = require('path')
const fs = require('fs')
const { pathToFileURL } = require('url')

let wins = []        // 每个显示器对应一个窗口
let tray = null
let trayMenu = null
let visible = false
let autoShown = false
let showTime = 0       // 记录上次弹出时刻，用于宽限期
let needsIdleReset = false  // 用户关闭后，等 idle 先降下来再允许重弹
let idleTimer = null

const cfgFile = path.join(app.getPath('userData'), 'config.json')
const cfg = {
  idleSeconds: 120,
  color: '#ffffff',
  background: 'stars',
  backgroundImage: '',
  timeZone: 'local',
}

function loadCfg() {
  try { Object.assign(cfg, JSON.parse(fs.readFileSync(cfgFile, 'utf8'))) } catch {}
}

function saveCfg() {
  try { fs.writeFileSync(cfgFile, JSON.stringify(cfg, null, 2)) } catch {}
}

function getBackgroundState() {
  return {
    id: cfg.background,
    imageUrl: cfg.backgroundImage ? pathToFileURL(cfg.backgroundImage).href : '',
  }
}

// 给所有已加载的窗口发消息
function broadcast(channel, ...args) {
  wins.forEach(w => { if (!w.isDestroyed()) w.webContents.send(channel, ...args) })
}

function createWindowForDisplay(d) {
  const w = new BrowserWindow({
    x: d.bounds.x,
    y: d.bounds.y,
    width: d.bounds.width,
    height: d.bounds.height,
    backgroundColor: '#000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
    },
    frame: false,
    alwaysOnTop: false,
    show: false,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    hasShadow: false,
  })
  w.loadFile('index.html')
  w.webContents.once('did-finish-load', () => {
    w.webContents.send('set-color', cfg.color)
    w.webContents.send('set-background', getBackgroundState())
    w.webContents.send('set-timezone', cfg.timeZone)
    // 如果此时应该显示（比如启动时 showClock 先于加载完成），补显示
    if (visible) {
      w.setAlwaysOnTop(true, 'screen-saver')
      w.show()
    }
  })
  w.on('closed', () => { wins = wins.filter(x => x !== w) })
  return w
}

function buildWins() {
  if (wins.length > 0) return
  screen.getAllDisplays().forEach(d => wins.push(createWindowForDisplay(d)))
}

// 显示器增减时重建窗口列表
function rebuildWins() {
  const wasVisible = visible
  if (wasVisible) hideClock()
  wins.forEach(w => { if (!w.isDestroyed()) w.destroy() })
  wins = []
  screen.getAllDisplays().forEach(d => wins.push(createWindowForDisplay(d)))
  if (wasVisible) showClock(autoShown)
}

function showClock(auto = false) {
  autoShown = auto
  showTime = Date.now()
  if (wins.length === 0) buildWins()
  visible = true
  wins.forEach(w => {
    if (w.isDestroyed()) return
    w.setAlwaysOnTop(true, 'screen-saver')
    w.show()
  })
}

function hideClock() {
  if (!visible) return
  visible = false
  autoShown = false
  wins.forEach(w => { if (!w.isDestroyed()) w.hide() })
}

function buildTray() {
  const img = nativeImage.createFromDataURL(
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='
  )
  tray = new Tray(img)
  tray.setTitle('⏰')
  tray.setToolTip('时钟屏保  (⌘⇧C 切换)')
  tray.on('click', () => visible ? hideClock() : showClock(false))
  tray.on('right-click', () => {
    hideClock()
    tray.popUpContextMenu(trayMenu)
  })
  refreshMenu()
}

function refreshMenu() {
  if (!tray) return
  const s = cfg.idleSeconds
  const opts = [
    [5, '5 秒（测试）'], [60, '1 分钟'], [300, '5 分钟'], [600, '10 分钟'],
    [1800, '30 分钟'], [3600, '1 小时'], [7200, '2 小时'], [0, '不自动显示'],
  ]
  trayMenu = Menu.buildFromTemplate([
    { label: '显示时钟', click: () => showClock(false) },
    { label: '隐藏时钟', click: hideClock },
    { type: 'separator' },
    {
      label: '无操作后自动显示',
      submenu: opts.map(([secs, label]) => ({
        label, type: 'radio', checked: s === secs,
        click: () => { cfg.idleSeconds = secs; saveCfg(); refreshMenu() },
      })),
    },
    { type: 'separator' },
    { label: '退出', click: () => app.quit() },
  ])
}

app.whenReady().then(() => {
  loadCfg()
  app.dock?.hide()
  buildWins()
  buildTray()

  globalShortcut.register('CommandOrControl+Shift+C', () => {
    visible ? hideClock() : showClock(false)
  })

  // 显示器增减时自动重建
  screen.on('display-added', rebuildWins)
  screen.on('display-removed', rebuildWins)

  // 启动后显示 3 秒，让用户确认运行
  showClock()
  setTimeout(() => { if (visible && !autoShown) hideClock() }, 3000)

  powerMonitor.on('lock-screen', () => showClock(true))
  powerMonitor.on('unlock-screen', hideClock)
  powerMonitor.on('resume', () => { if (visible) hideClock() })

  idleTimer = setInterval(() => {
    if (cfg.idleSeconds <= 0) return
    const idle = powerMonitor.getSystemIdleTime()
    if (needsIdleReset && idle < cfg.idleSeconds) needsIdleReset = false
    if (!visible && !needsIdleReset && idle >= cfg.idleSeconds) showClock(true)
  }, 1000)
})

ipcMain.on('hide', hideClock)
ipcMain.on('dismiss-if-auto', () => {
  if (visible && autoShown && Date.now() - showTime > 1500) {
    needsIdleReset = true
    hideClock()
  }
})
ipcMain.on('save-color', (_, color) => {
  cfg.color = color
  saveCfg()
  broadcast('set-color', color)   // 同步到其他屏幕
})
ipcMain.handle('get-color', () => cfg.color)
ipcMain.on('save-background', (_, background) => {
  cfg.background = background?.id || background
  saveCfg()
  broadcast('set-background', getBackgroundState())
})
ipcMain.handle('get-background', () => getBackgroundState())
ipcMain.handle('choose-background-image', async event => {
  const parent = BrowserWindow.fromWebContents(event.sender)
  const result = await dialog.showOpenDialog(parent, {
    properties: ['openFile'],
    filters: [
      { name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'] },
    ],
  })
  if (result.canceled || !result.filePaths[0]) return null
  cfg.background = 'image'
  cfg.backgroundImage = result.filePaths[0]
  saveCfg()
  const state = getBackgroundState()
  broadcast('set-background', state)
  return state
})
ipcMain.on('set-idle', (_, secs) => { cfg.idleSeconds = secs; saveCfg(); refreshMenu() })
ipcMain.handle('get-idle', () => cfg.idleSeconds)
ipcMain.on('set-timezone', (_, timeZone) => {
  cfg.timeZone = timeZone || 'local'
  saveCfg()
  broadcast('set-timezone', cfg.timeZone)
})
ipcMain.handle('get-timezone', () => cfg.timeZone)

ipcMain.on('set-icons', (_, trayUrl, dockUrl) => {
  try { app.dock?.setIcon(nativeImage.createFromDataURL(dockUrl)) } catch {}
})

app.on('window-all-closed', e => e.preventDefault())
app.on('will-quit', () => { globalShortcut.unregisterAll() })
app.on('before-quit', () => { if (idleTimer) clearInterval(idleTimer) })
