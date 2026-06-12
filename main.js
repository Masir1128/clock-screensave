const { app, BrowserWindow, powerMonitor, ipcMain, Tray, Menu, nativeImage, screen } = require('electron')
const path = require('path')
const fs = require('fs')

let win = null
let tray = null
let winReady = false
let visible = false
let autoShown = false  // 是否由空闲/锁屏自动触发，手动显示不受 idle 影响
let idleTimer = null

const cfgFile = path.join(app.getPath('userData'), 'config.json')
const cfg = { idleSeconds: 120, color: '#ffffff' }

function loadCfg() {
  try { Object.assign(cfg, JSON.parse(fs.readFileSync(cfgFile, 'utf8'))) } catch {}
}

function saveCfg() {
  try { fs.writeFileSync(cfgFile, JSON.stringify(cfg, null, 2)) } catch {}
}

function buildWin() {
  if (win) return
  const d = screen.getPrimaryDisplay()
  win = new BrowserWindow({
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
  win.loadFile('index.html')
  win.webContents.once('did-finish-load', () => {
    winReady = true
    win.webContents.send('set-color', cfg.color)
  })
  win.on('closed', () => { win = null; winReady = false; visible = false })
}

function showClock(auto = false) {
  autoShown = auto
  if (!win) buildWin()
  if (!winReady) {
    win.webContents.once('did-finish-load', () => {
      win.setAlwaysOnTop(true, 'screen-saver')
      win.show()
      visible = true
    })
    return
  }
  win.setAlwaysOnTop(true, 'screen-saver')
  win.show()
  visible = true
}

function hideClock() {
  if (win && visible) {
    win.hide()
    visible = false
    autoShown = false
  }
}

function buildTray() {
  // 1×1 透明 PNG 作为占位图，用 emoji 文字展示在菜单栏
  const img = nativeImage.createFromDataURL(
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='
  )
  tray = new Tray(img)
  tray.setTitle('⏰')
  tray.setToolTip('时钟屏保')
  tray.on('click', () => visible ? hideClock() : showClock(false))
  refreshMenu()
}

function refreshMenu() {
  if (!tray) return
  const s = cfg.idleSeconds
  const opts = [
    [30, '30 秒'], [60, '1 分钟'], [120, '2 分钟'], [300, '5 分钟'], [0, '不自动显示'],
  ]
  tray.setContextMenu(Menu.buildFromTemplate([
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
  ]))
}

app.whenReady().then(() => {
  loadCfg()
  buildWin()
  buildTray()

  // 启动后自动显示一次，方便确认运行正常
  showClock()

  powerMonitor.on('lock-screen', () => showClock(true))
  powerMonitor.on('unlock-screen', hideClock)
  powerMonitor.on('resume', () => { if (visible) hideClock() })

  idleTimer = setInterval(() => {
    if (cfg.idleSeconds <= 0) return
    const idle = powerMonitor.getSystemIdleTime()
    if (!visible && idle >= cfg.idleSeconds) showClock(true)
    // 只有自动触发的才在用户有动作时自动关闭
    else if (visible && autoShown && idle < 2) hideClock()
  }, 1000)
})

ipcMain.on('hide', hideClock)
ipcMain.on('save-color', (_, color) => { cfg.color = color; saveCfg() })
ipcMain.handle('get-color', () => cfg.color)

ipcMain.on('set-icons', (_, trayUrl, dockUrl) => {
  if (tray) tray.setImage(nativeImage.createFromDataURL(trayUrl))
  try { app.dock?.setIcon(nativeImage.createFromDataURL(dockUrl)) } catch {}
})

app.on('window-all-closed', e => e.preventDefault())
app.on('before-quit', () => { if (idleTimer) clearInterval(idleTimer) })
