// dsh-desktop 主进程 v0.3
// v0.1 Electron 壳 | v0.2 启动页+崩溃自愈 | v0.3 多窗口+dsh版本锁+dsh更新+壳自更新+全中文菜单
// dsh 运行时经 npx 调用(PATH→注册表),版本锁存于 ~/.dsh/desktop-config.json,插件化零破坏。
const { app, BrowserWindow, Tray, Menu, dialog, Notification, shell, ipcMain } = require('electron')
const { spawn, spawnSync } = require('node:child_process')
const net = require('node:net')
const http = require('node:http')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const DSH_PORT = 3080
const DSH_URL = `http://127.0.0.1:${DSH_PORT}`
const START_TIMEOUT_MS = 120_000 // 首次 npx 需下载包,给足时间
const SWITCH_TIMEOUT_MS = 60_000 // 版本切换的就绪预算,超时自动回滚
const DSH_HOME = path.join(os.homedir(), '.dsh')
const LOG_DIR = path.join(DSH_HOME, 'logs')
const LOG_FILE = path.join(LOG_DIR, 'desktop.log')
const CONFIG_FILE = path.join(DSH_HOME, 'desktop-config.json')
const DEFAULT_DSH_VERSION = '0.1.0-rc.6' // 锁定到当前验证过的版本
const MIN_PUBLIC_DSH_VERSION = '0.1.0-rc.6' // 此前版本发布时 @deepseek-ai/* 依赖族未公开,今日 npx 已装不完整,一律不展示
const RECOVERY_DELAYS = [1_000, 5_000, 15_000] // 崩溃自愈退避,3 次后停
const GITHUB_DSH = 'https://github.com/deepseek-ai/deepseek-harness'
const GITHUB_DSH_TAGS = `${GITHUB_DSH}/tags` // 官方仓库无 Releases,版本历史走 Tags
const GITHUB_SHELL = 'https://github.com/Suife-yuanxing/dsh-desktop'

// 壳自更新仅对 NSIS 安装版生效;便携版(process.env.PORTABLE_EXECUTABLE_DIR)不支持
const isPortable = !!process.env.PORTABLE_EXECUTABLE_DIR
const canShellSelfUpdate = app.isPackaged && !isPortable
const autoUpdater = canShellSelfUpdate ? require('electron-updater').autoUpdater : null

let splashWindow = null
const mainWindows = new Set() // 共享同一 dsh 服务的多窗口
let settingsWindow = null // 壳设置窗口(dsh 版本/更新管理)
let tray = null
let dshChild = null
let quitting = false
let restartAttempts = 0
let recoveryTimer = null
let availableVersions = [] // npm 上可选的 dsh 版本(异步拉取后填充设置页)
let switching = false // 版本切换互斥,防止并发触发

// ---------- 配置(dsh 版本锁) ----------

function loadConfig() {
  try {
    const raw = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'))
    if (typeof raw.dshVersion === 'string' && raw.dshVersion.length > 0) return raw
  } catch { /* 首次运行或损坏,走默认 */ }
  return { dshVersion: DEFAULT_DSH_VERSION }
}

function saveConfig(cfg) {
  try {
    fs.mkdirSync(DSH_HOME, { recursive: true })
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2) + '\n')
  } catch (e) { log(`保存配置失败: ${e.message}`) }
}

let cfg = loadConfig()

// ---------- 基础工具 ----------

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`
  console.log(line)
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true })
    fs.appendFileSync(LOG_FILE, line + '\n')
  } catch { /* 日志失败不阻塞主流程 */ }
}

function stage(name) {
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.webContents.send('dsh-stage', name)
  }
}

function notify(title, body) {
  try {
    if (Notification.isSupported()) new Notification({ title, body, icon: path.join(__dirname, 'icon.ico') }).show()
  } catch { /* 通知失败不影响主流程 */ }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function dialogParent() {
  return BrowserWindow.getFocusedWindow() || [...mainWindows][0] || null
}

// ---------- 端口探测 ----------

function isPortUp() {
  return new Promise((resolve) => {
    const sock = net.connect({ host: '127.0.0.1', port: DSH_PORT, timeout: 800 })
    sock.once('connect', () => { sock.destroy(); resolve(true) })
    sock.once('error', () => resolve(false))
    sock.once('timeout', () => { sock.destroy(); resolve(false) })
  })
}

async function waitForPort(timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await isPortUp()) return true
    await sleep(600)
  }
  return false
}

// ---------- dsh 进程管理 ----------

// 解析 npx 位置:PATH where → 注册表 Node.js InstallPath(HKLM/HKCU)
function resolveNpxCommand() {
  const where = spawnSync('where', ['npx.cmd'], { encoding: 'utf8', windowsHide: true })
  if (where.status === 0 && where.stdout && where.stdout.trim()) {
    return where.stdout.trim().split(/\r?\n/)[0]
  }
  for (const hive of ['HKLM', 'HKCU']) {
    const reg = spawnSync('reg', ['query', `${hive}\\SOFTWARE\\Node.js`, '/v', 'InstallPath'],
      { encoding: 'utf8', windowsHide: true })
    if (reg.status === 0 && reg.stdout) {
      const line = reg.stdout.split(/\r?\n/).find((l) => l.includes('InstallPath') && l.includes('REG_SZ'))
      if (line) {
        const installPath = line.split('REG_SZ')[1].trim()
        const npx = path.join(installPath, 'npx.cmd')
        if (fs.existsSync(npx)) return npx
      }
    }
  }
  return null
}

function startDsh() {
  const npx = resolveNpxCommand()
  if (!npx) {
    log('未找到可用的 npx(PATH 与注册表均失败)')
    return false
  }
  // 版本锁:npx -y @deepseek-ai/dsh@<version> web;-y 免交互安装缺失版本
  const spec = `@deepseek-ai/dsh@${cfg.dshVersion}`
  let cmd, args
  if (npx.toLowerCase().endsWith('.cmd')) {
    // Windows: .cmd 不能直接 spawn(Node 安全限制),须经 cmd /c
    cmd = 'cmd.exe'
    args = ['/c', npx, '-y', spec, 'web']
  } else {
    cmd = npx
    args = ['-y', spec, 'web']
  }
  log(`启动 dsh: ${cmd} ${args.join(' ')}`)
  dshChild = spawn(cmd, args, {
    cwd: os.homedir(),
    windowsHide: true, // 隐藏 npx 控制台窗口,日志走文件
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
  })
  log(`dsh 子进程 pid=${dshChild.pid}`)
  dshChild.stdout.on('data', (d) => log(`[dsh] ${String(d).trim()}`))
  dshChild.stderr.on('data', (d) => log(`[dsh-err] ${String(d).trim()}`))
  dshChild.on('exit', (code) => {
    log(`dsh 子进程退出 code=${code}`)
    dshChild = null
    if (!quitting) scheduleRecovery()
  })
  return true
}

// 崩溃自愈:意外退出→退避重启;连续 3 次失败→通知并停机等手动处理
async function scheduleRecovery() {
  if (recoveryTimer) return
  await sleep(1_500) // 等端口真正下线,避免误判
  if (quitting || dshChild) return
  if (await isPortUp()) {
    log('服务仍可用(外部实例接管),跳过自动恢复')
    return
  }
  if (restartAttempts >= RECOVERY_DELAYS.length) {
    log(`连续 ${RECOVERY_DELAYS.length} 次自动恢复失败,停止重试`)
    notify('DeepSeek Harness', 'dsh 服务多次崩溃,已停止自动恢复。请从托盘菜单手动重启。')
    loadErrorPageAll('crash')
    return
  }
  const delay = RECOVERY_DELAYS[restartAttempts]
  restartAttempts += 1
  log(`第 ${restartAttempts} 次自动恢复,${delay / 1000}s 后重启`)
  stage('crash')
  recoveryTimer = setTimeout(async () => {
    recoveryTimer = null
    if (quitting) return
    if (!startDsh()) return
    const ok = await waitForPort(START_TIMEOUT_MS)
    if (ok) {
      restartAttempts = 0
      log('自动恢复成功')
      stage('ready')
      loadUrlAll(DSH_URL)
    }
    // 失败则等子进程 exit 事件再次进入 scheduleRecovery
  }, delay)
}

// Windows 上 npx 会派生 cmd→node 进程树,必须 taskkill /T 整树清理
function killDshTree() {
  if (!dshChild || !dshChild.pid) return Promise.resolve()
  const pid = dshChild.pid
  dshChild = null
  return new Promise((resolve) => {
    const killer = spawn('taskkill', ['/pid', String(pid), '/T', '/F'], {
      windowsHide: true, stdio: 'ignore',
    })
    killer.on('exit', () => { log(`进程树 ${pid} 已清理`); resolve() })
    killer.on('error', () => resolve())
  })
}

async function restartDsh(timeoutMs = START_TIMEOUT_MS) {
  restartAttempts = 0
  if (recoveryTimer) { clearTimeout(recoveryTimer); recoveryTimer = null }
  await killDshTree()
  if (startDsh()) {
    const ok = await waitForPort(timeoutMs)
    if (ok) loadUrlAll(DSH_URL)
  }
}

// ---------- npm 查询(dsh 版本/更新) ----------

// 经与 npx 同源的 npm.cmd 执行查询;返回 stdout 字符串,失败返回 null
function npmView(args) {
  return new Promise((resolve) => {
    const npx = resolveNpxCommand()
    if (!npx) return resolve(null)
    const npmCmd = npx.replace(/npx\.cmd$/i, 'npm.cmd')
    if (!fs.existsSync(npmCmd)) return resolve(null)
    const child = spawn('cmd.exe', ['/c', npmCmd, 'view', '@deepseek-ai/dsh', ...args],
      { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] })
    let out = ''
    let done = false
    const finish = (v) => { if (!done) { done = true; resolve(v) } }
    const timer = setTimeout(() => { child.kill(); finish(null) }, 20_000)
    child.stdout.on('data', (d) => { out += d })
    child.on('exit', () => { clearTimeout(timer); finish(out.trim() || null) })
    child.on('error', () => { clearTimeout(timer); finish(null) })
  })
}

// 解析 'x.y.z-rc.N' 为可比较数组;无 rc 后缀视为正式版(高于一切 rc)
function parseDshVersion(v) {
  const m = /^(\d+)\.(\d+)\.(\d+)(?:-rc\.(\d+))?$/.exec(String(v || ''))
  return m ? [+m[1], +m[2], +m[3], m[4] === undefined ? Infinity : +m[4]] : null
}

function cmpDshVersion(a, b) {
  const pa = parseDshVersion(a)
  const pb = parseDshVersion(b)
  if (!pa || !pb) return 0
  for (let i = 0; i < 4; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i]
  return 0
}

async function fetchAvailableVersions() {
  const raw = await npmView(['versions', '--json'])
  if (!raw) return
  try {
    const list = JSON.parse(raw)
    if (Array.isArray(list) && list.length) {
      // 只保留 npm 公开发布起的可安装版本,旧 rc 装不完整,展示无意义
      availableVersions = list
        .filter((v) => cmpDshVersion(v, MIN_PUBLIC_DSH_VERSION) >= 0)
        .slice(-8)
        .reverse() // 最近 8 个,新→旧
      rebuildTray()
      log(`已拉取 dsh 版本列表(仅公开可用): ${availableVersions.join(', ')}`)
    }
  } catch { /* 解析失败保持原列表 */ }
}

// 版本预检:npx 拉包并执行 --version,验证该版本可运行(旧 rc 可能包损坏/不兼容)
function probeDshVersion(version) {
  return new Promise((resolve) => {
    const npx = resolveNpxCommand()
    if (!npx) return resolve({ ok: false, error: '未找到 npx' })
    const spec = `@deepseek-ai/dsh@${version}`
    const child = spawn('cmd.exe', ['/c', npx, '-y', spec, '--version'],
      { cwd: os.homedir(), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    let err = ''
    let done = false
    const finish = (v) => { if (!done) { done = true; resolve(v) } }
    const timer = setTimeout(() => { try { child.kill() } catch {}; finish({ ok: false, error: '预检超时(60s),版本可能无法下载' }) }, 60_000)
    child.stdout.on('data', (d) => { out += d })
    child.stderr.on('data', (d) => { err += d })
    child.on('exit', (code) => {
      clearTimeout(timer)
      if (code === 0) finish({ ok: true, version: out.trim().split(/\r?\n/).pop() })
      else finish({ ok: false, error: `退出码 ${code}: ${(err || out).trim().slice(0, 160)}` })
    })
    child.on('error', (e) => { clearTimeout(timer); finish({ ok: false, error: e.message }) })
  })
}

// 设置页进度推送
function settingsStatus(payload) {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.webContents.send('dsh-settings:status', payload)
  }
}

// 应用新版本:写锁→重启→60s 未就绪自动回滚旧版本(防止死版本进入崩溃循环)
async function applyDshVersion(newVersion) {
  const prevVersion = cfg.dshVersion
  settingsStatus({ phase: 'apply', message: `正在切换到 ${newVersion} 并重启服务…` })
  cfg.dshVersion = newVersion
  saveConfig(cfg)
  rebuildTray()
  log(`dsh 版本锁切换为 ${newVersion}`)
  // 用切换专属预算重启:60s 内未就绪视为坏版本,避免死等 120s
  await restartDsh(SWITCH_TIMEOUT_MS)
  if (await isPortUp()) {
    loadUrlAll(DSH_URL) // 显式刷新所有主窗口(兜底,不依赖 restartDsh 副作用)
    return true
  }
  log(`版本 ${newVersion} ${SWITCH_TIMEOUT_MS / 1000}s 未就绪,自动回滚到 ${prevVersion}`)
  notify('dsh 版本切换失败', `${newVersion} 启动超时,已自动回滚到 ${prevVersion}。`)
  settingsStatus({ phase: 'rollback', message: `${newVersion} 启动超时,已自动回滚到 ${prevVersion}。` })
  cfg.dshVersion = prevVersion
  saveConfig(cfg)
  rebuildTray()
  await restartDsh() // 回滚走完整启动预算
  return false
}

// dsh 运行时更新:npm 最新版 vs 版本锁;发现新版→确认→写锁→重启 dsh
async function checkDshUpdate(manual) {
  if (cfg.dshVersion === 'latest') {
    if (manual) notify('dsh 更新', '当前跟踪 latest,每次启动自动使用最新版。')
    return // 跟踪 latest 时 npx 每次拉最新,无需比对
  }
  const latest = await npmView(['version'])
  if (!latest) {
    if (manual) notify('dsh 更新', '查询 npm 失败,请检查网络。')
    return
  }
  if (latest === cfg.dshVersion) {
    if (manual) notify('dsh 更新', `已是最新版 ${latest}。`)
    return
  }
  const { response } = await dialog.showMessageBox(dialogParent() ?? new BrowserWindow({ show: false }), {
    type: 'info',
    title: 'dsh 有新版本',
    message: `发现 dsh 新版本 ${latest}(当前 ${cfg.dshVersion})`,
    detail: '更新前会验证新版可运行,失败自动回滚;也可随时在托盘「dsh 版本」切回旧版。',
    buttons: ['更新并重启服务', '查看版本历史', '忽略'],
    defaultId: 0,
    cancelId: 2,
  })
  if (response === 1) {
    shell.openExternal(GITHUB_DSH_TAGS)
    return
  }
  if (response !== 0) return
  const probe = await probeDshVersion(latest)
  if (!probe.ok) {
    notify('dsh 更新', `新版本 ${latest} 验证失败(${probe.error}),已保持 ${cfg.dshVersion}。`)
    log(`新版 ${latest} 预检失败: ${probe.error}`)
    return
  }
  await applyDshVersion(latest)
}

// ---------- 壳自更新(electron-updater,仅 NSIS 安装版) ----------

function setupShellUpdater() {
  if (!autoUpdater) return
  autoUpdater.autoDownload = true
  autoUpdater.on('update-available', (i) => log(`壳有新版本: ${i.version}`))
  autoUpdater.on('update-not-available', () => log('壳已是最新版'))
  autoUpdater.on('download-progress', (p) => log(`壳更新下载 ${p.percent.toFixed(0)}%`))
  autoUpdater.on('update-downloaded', async (i) => {
    const { response } = await dialog.showMessageBox(dialogParent(), {
      type: 'info',
      title: '更新就绪',
      message: `新版本 ${i.version} 已下载,重启后生效。`,
      buttons: ['立即重启', '稍后'],
      defaultId: 0,
    })
    if (response === 0) {
      quitting = true
      await killDshTree()
      autoUpdater.quitAndInstall()
    }
  })
  autoUpdater.on('error', (e) => log(`壳更新出错: ${e.message}`))
}

async function checkShellUpdate() {
  if (!autoUpdater) {
    notify('检查更新', '便携版不支持自动更新,请到 GitHub Releases 手动下载新版。')
    shell.openExternal(`${GITHUB_SHELL}/releases/latest`)
    return
  }
  try {
    const result = await autoUpdater.checkForUpdates()
    if (result && !result.updateInfo || result.updateInfo.version === app.getVersion()) {
      notify('检查更新', `壳已是最新版 ${app.getVersion()}。`)
    }
  } catch (e) {
    log(`壳更新检查失败: ${e.message}`)
    notify('检查更新', `检查失败: ${e.message}`)
  }
}

// ---------- 窗口(共享服务多开) ----------

function closeSplash() {
  if (splashWindow && !splashWindow.isDestroyed()) splashWindow.close()
  splashWindow = null
}

function createSplash() {
  splashWindow = new BrowserWindow({
    width: 380,
    height: 480,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true, // 任务栏只保留主窗口
    frame: false,
    icon: path.join(__dirname, 'icon.ico'),
    title: 'DeepSeek Harness',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  splashWindow.once('ready-to-show', () => splashWindow.show())
  splashWindow.loadFile('splash.html')
}

// 无边框主窗拖拽区注入样式:dsh Web UI 的 CSS Modules 哈希类名保留原名后缀
// (如 pI_x6G_logoRow),用 [class*="_xxx"] 匹配。侧栏顶行(60px)可拖拽,
// 按钮排除;窗口顶部 6px 细条兜底,保证任意位置都有拖拽手柄。
const TITLEBAR_DRAG_CSS = `
  [class*="_logoRow"] { -webkit-app-region: drag; }
  [class*="_logoRow"] button,
  [class*="_logoRow"] a,
  [class*="_logoRow"] [role="button"] { -webkit-app-region: no-drag; }
  [class*="_frame"]::after {
    content: ''; position: absolute; top: 0; left: 0; right: 0; height: 6px;
    -webkit-app-region: drag; z-index: 40;
  }
`

function createMainWindow({ show = false } = {}) {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    icon: path.join(__dirname, 'icon.ico'),
    title: 'DeepSeek Harness',
    show,
    // Claude 式融合:去原生标题栏,窗口控制按钮以透明叠加层浮于 Web UI 之上;
    // Web UI 为浅色主题,符号用深灰。快捷键仍由应用菜单承载(菜单不显示)。
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#00000000', symbolColor: '#3d444d', height: 36 },
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  mainWindows.add(win)
  win.on('closed', () => mainWindows.delete(win))
  // 每次主导航后注入拖拽区(insertCSS 不跨导航保留)
  const injectDrag = () => win.webContents.insertCSS(TITLEBAR_DRAG_CSS).catch(() => {})
  win.webContents.on('did-navigate', injectDrag)
  win.webContents.on('did-navigate-in-page', injectDrag)
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url) // 外部链接走系统浏览器
    return { action: 'deny' }
  })
  return win
}

// 首窗就绪:显示并关闭启动页
function showMain(url) {
  const win = [...mainWindows][0]
  if (!win) return
  const reveal = () => {
    win.show()
    win.focus()
    closeSplash()
  }
  if (win.webContents.isLoadingMainFrame()) win.once('ready-to-show', reveal)
  else reveal()
  win.loadURL(url)
}

// 所有存活主窗口统一跳转
function loadUrlAll(url) {
  for (const win of mainWindows) if (!win.isDestroyed()) win.loadURL(url)
}

function loadErrorPageAll(reason) {
  let shown = false
  for (const win of mainWindows) {
    if (!win.isDestroyed()) { win.loadFile('error.html', { query: { reason } }); win.show(); shown = true }
  }
  return shown
}

// 托盘/菜单「新建窗口」:服务就绪时开新窗口共享同一 dsh
async function newWindow() {
  if (!(await isPortUp())) {
    notify('新建窗口', 'dsh 服务未就绪,请稍候再试。')
    return
  }
  const win = createMainWindow({ show: false })
  win.once('ready-to-show', () => win.show())
  win.loadURL(DSH_URL)
}

// ---------- 壳 HTTP API(Web UI 版本 tab 经此与壳通信,仅本机) ----------

const SHELL_API_PORT = 30801
const SHELL_API_ALLOWED_ORIGINS = new Set([
  `http://127.0.0.1:${DSH_PORT}`, `http://localhost:${DSH_PORT}`,
])

function startShellApi() {
  const server = http.createServer(async (req, res) => {
    const origin = req.headers.origin || ''
    // 无 Origin(本机 curl/诊断)放行;带 Origin(浏览器)必须匹配 dsh Web UI 源
    const corsOk = !origin || SHELL_API_ALLOWED_ORIGINS.has(origin)
    const base = {
      'Access-Control-Allow-Origin': origin || `http://127.0.0.1:${DSH_PORT}`,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    }
    if (req.method === 'OPTIONS') { res.writeHead(204, base); res.end(); return }
    const send = (code, data) => {
      res.writeHead(code, { 'Content-Type': 'application/json', ...base })
      res.end(JSON.stringify(data))
    }
    const url = new URL(req.url, `http://127.0.0.1:${SHELL_API_PORT}`)
    if (!corsOk) return send(403, { error: 'origin not allowed' })
    try {
      if (req.method === 'GET' && url.pathname === '/state') {
        return send(200, {
          shellVersion: app.getVersion(),
          dshVersion: cfg.dshVersion,
          availableVersions,
          switching,
        })
      }
      if (req.method === 'POST' && url.pathname === '/switch') {
        let body = ''
        for await (const chunk of req) body += chunk
        const { version } = JSON.parse(body || '{}')
        if (typeof version !== 'string' || !version) return send(400, { accepted: false, error: '缺少 version' })
        if (!availableVersions.includes(version)) return send(400, { accepted: false, error: '版本不在可用列表' })
        if (version === cfg.dshVersion || switching) return send(409, { accepted: false, error: '已有切换在进行或版本未变' })
        switchDshVersion(version) // 异步执行,预检+回滚由壳编排
        return send(202, { accepted: true })
      }
      if (req.method === 'POST' && url.pathname === '/refresh') {
        await fetchAvailableVersions()
        return send(200, { availableVersions })
      }
      send(404, { error: 'not found' })
    } catch (e) {
      send(500, { error: e.message })
    }
  })
  server.on('error', (e) => log(`壳 API 启动失败: ${e.message}`))
  server.listen(SHELL_API_PORT, '127.0.0.1', () => log(`壳 API 就绪: 127.0.0.1:${SHELL_API_PORT}`))
}

// ---------- 设置窗口(dsh 版本/更新管理) ----------

function openSettings() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.show()
    settingsWindow.focus()
    return
  }
  settingsWindow = new BrowserWindow({
    width: 560,
    height: 660,
    minWidth: 480,
    minHeight: 520,
    maximizable: false,
    fullscreenable: false,
    icon: path.join(__dirname, 'icon.ico'),
    title: '设置 - DeepSeek Harness',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  settingsWindow.on('closed', () => { settingsWindow = null })
  settingsWindow.loadFile('settings.html')
}

function setupSettingsIpc() {
  ipcMain.handle('dsh-settings:get', () => ({
    shellVersion: app.getVersion(),
    dshVersion: cfg.dshVersion,
    availableVersions,
    channel: canShellSelfUpdate ? 'NSIS 安装版(支持自更新)' : isPortable ? '便携版(手动更新)' : '开发模式',
    switching,
  }))
  ipcMain.on('dsh-settings:switch', (_e, v) => { switchDshVersion(v) })
  ipcMain.on('dsh-settings:refresh-versions', () => { fetchAvailableVersions() })
  ipcMain.on('dsh-settings:check-dsh-update', () => { checkDshUpdate(true) })
  ipcMain.on('dsh-settings:check-shell-update', () => { checkShellUpdate() })
  // 日志查看:返回 desktop.log 最近 N 行(默认 300,上限 2000)
  ipcMain.handle('dsh-logs:tail', (_e, lines = 300) => {
    const n = Math.max(1, Math.min(Number(lines) || 300, 2000))
    try {
      const arr = fs.readFileSync(LOG_FILE, 'utf8').split(/\r?\n/).filter(Boolean)
      return { ok: true, file: LOG_FILE, lines: arr.slice(-n) }
    } catch (e) {
      return { ok: false, file: LOG_FILE, error: e.code === 'ENOENT' ? '日志文件尚未生成' : e.message }
    }
  })
  ipcMain.on('dsh-logs:open-dir', () => { shell.openPath(LOG_DIR) })
}

// ---------- 菜单(全中文) ----------

// 版本切换(设置页驱动):预检→应用(带回滚),进度实时推送设置页
async function switchDshVersion(v) {
  if (v === cfg.dshVersion || switching) return
  switching = true
  try {
    settingsStatus({ phase: 'probe', message: `正在验证 ${v} 可运行性(首次需下载依赖,请稍候)…` })
    log(`版本 ${v} 预检开始`)
    const probe = await probeDshVersion(v)
    if (!probe.ok) {
      settingsStatus({ phase: 'fail', message: `版本 ${v} 不可用,已取消切换(${probe.error})。` })
      notify('dsh 版本切换', `版本 ${v} 不可用(${probe.error}),已取消切换。`)
      log(`版本 ${v} 预检失败: ${probe.error}`)
      return
    }
    const ok = await applyDshVersion(v)
    if (ok) {
      settingsStatus({ phase: 'ok', message: `已切换到 ${v}。` })
      notify('dsh 版本切换', `已切换到 ${v}。`)
    }
  } finally {
    switching = false
  }
}

function buildTrayMenu() {
  return Menu.buildFromTemplate([
    { label: '显示主界面', click: () => { const w = [...mainWindows][0]; if (w) { w.show(); w.focus() } } },
    { label: '新建窗口', accelerator: 'CmdOrCtrl+Shift+N', click: () => newWindow() },
    { type: 'separator' },
    { label: '重载界面', click: () => { for (const w of mainWindows) if (!w.isDestroyed()) w.reload() } },
    { label: '重启 dsh 服务', click: () => restartDsh() },
    { label: '打开日志目录', click: () => shell.openPath(LOG_DIR) },
    { type: 'separator' },
    { label: '退出', click: () => { quitting = true; app.quit() } },
  ])
}

function rebuildTray() {
  const menu = buildTrayMenu()
  if (tray) tray.setContextMenu(menu)
  else tray = menu // 由 createTray 首次装配
}

function createTray() {
  tray = new Tray(path.join(__dirname, 'icon.ico'))
  tray.setToolTip('DeepSeek Harness')
  tray.setContextMenu(buildTrayMenu())
}

function setupAppMenu() {
  const template = [
    {
      label: '文件',
      submenu: [
        { label: '新建窗口', accelerator: 'CmdOrCtrl+N', click: () => newWindow() },
        { label: '设置', accelerator: 'CmdOrCtrl+,', click: () => openSettings() },
        { type: 'separator' },
        { label: '退出', accelerator: 'CmdOrCtrl+Q', role: 'quit' },
      ],
    },
    {
      label: '编辑',
      submenu: [
        { label: '撤销', role: 'undo' },
        { label: '重做', role: 'redo' },
        { type: 'separator' },
        { label: '剪切', role: 'cut' },
        { label: '复制', role: 'copy' },
        { label: '粘贴', role: 'paste' },
        { label: '全选', role: 'selectAll' },
      ],
    },
    {
      label: '查看',
      submenu: [
        { label: '重载', role: 'reload' },
        { label: '强制重载', role: 'forceReload' },
        { label: '开发者工具', role: 'toggleDevTools' },
        { type: 'separator' },
        { label: '放大', role: 'zoomIn' },
        { label: '缩小', role: 'zoomOut' },
        { label: '重置缩放', role: 'resetZoom' },
      ],
    },
    {
      label: '窗口',
      submenu: [
        { label: '最小化', role: 'minimize' },
        { label: '关闭', role: 'close' },
      ],
    },
    {
      label: '帮助',
      submenu: [
        { label: 'dsh 版本历史(官方仓库)', click: () => shell.openExternal(GITHUB_DSH_TAGS) },
        { label: '本项目主页与版本下载', click: () => shell.openExternal(GITHUB_SHELL) },
        { type: 'separator' },
        {
          label: '关于',
          click: () => dialog.showMessageBox(dialogParent(), {
            type: 'info',
            title: '关于',
            message: 'DeepSeek Harness 桌面版',
            detail: [
              `壳版本:${app.getVersion()}`,
              `dsh 版本锁:${cfg.dshVersion}`,
              `更新通道:${canShellSelfUpdate ? 'NSIS 安装版(支持自更新)' : isPortable ? '便携版(手动更新)' : '开发模式'}`,
            ].join('\n'),
          }),
        },
      ],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

// ---------- 启动编排 ----------

async function boot() {
  stage('probe')
  if (await isPortUp()) {
    log('检测到 dsh 服务已在运行,直接复用')
    stage('ready')
    showMain(DSH_URL)
    return
  }
  stage('spawn')
  if (!startDsh()) {
    closeSplash()
    const win = [...mainWindows][0]
    if (win) { win.loadFile('error.html', { query: { reason: 'no-npx' } }); win.show() }
    return
  }
  stage('wait')
  log('等待 dsh 服务就绪...')
  const ok = await waitForPort(START_TIMEOUT_MS)
  if (ok) {
    log('dsh 服务就绪,加载 Web UI')
    restartAttempts = 0
    stage('ready')
    showMain(DSH_URL)
  } else {
    log(`等待超时(${START_TIMEOUT_MS / 1000}s),显示错误页`)
    closeSplash()
    const win = [...mainWindows][0]
    if (win) { win.loadFile('error.html', { query: { reason: 'timeout' } }); win.show() }
  }
}

// ---------- 应用生命周期 ----------

// 开发逃生门:DSH_DESKTOP_USER_DATA 指定独立 userData,可与正式版并行运行(单实例锁按 userData 区分)
if (process.env.DSH_DESKTOP_USER_DATA) app.setPath('userData', process.env.DSH_DESKTOP_USER_DATA)

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    // 二次启动:聚焦已有窗口(无窗口时新开一个,服务就绪的前提下)
    const win = [...mainWindows][0]
    if (win) { win.show(); win.focus() }
    else newWindow()
  })

  app.whenReady().then(() => {
    createSplash()
    createMainWindow()
    setupAppMenu()
    createTray()
    setupShellUpdater()
    setupSettingsIpc()
    startShellApi()
    boot().then(() => {
      // 就绪后异步拉版本列表 + 启动时静默检查双更新
      fetchAvailableVersions()
      setTimeout(() => checkDshUpdate(false), 5_000)
      if (autoUpdater) autoUpdater.checkForUpdates().catch((e) => log(`壳更新检查失败: ${e.message}`))
    })
  })

  app.on('before-quit', async (e) => {
    if (quitting && dshChild) {
      e.preventDefault() // 先清理进程树,再真正退出
      await killDshTree()
      app.exit(0)
    }
  })

  // 主窗口全部关闭才退出(设置窗口等辅助窗口不拦截退出)
  app.on('window-all-closed', () => {
    if (mainWindows.size === 0) {
      quitting = true
      app.quit()
    }
  })
}
