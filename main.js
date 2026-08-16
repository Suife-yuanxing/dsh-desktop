// dsh-desktop 主进程 v0.3
// v0.1 Electron 壳 | v0.2 启动页+崩溃自愈 | v0.3 多窗口+dsh版本锁+dsh更新+壳自更新+全中文菜单
// dsh 运行时经 npx 调用(PATH→注册表),版本锁存于 ~/.dsh/desktop-config.json,插件化零破坏。
const { app, BrowserWindow, Tray, Menu, dialog, Notification, shell, ipcMain, net: electronNet } = require('electron')
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
let settingsWindow = null // 壳设置窗口(更新/日志管理)
let tray = null
let dshChild = null
let quitting = false
let restartAttempts = 0
let recoveryTimer = null
let availableVersions = [] // npm 上可选的 dsh 版本(异步拉取,供壳 HTTP API /state、/switch 使用;设置 UI 仅保留更新)
let switching = false // 版本切换互斥,防止并发触发
let restarting = false // 服务重启互斥(托盘/API 共用)

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
    await sleep(150) // 热重启 dsh 约 2s 起listen,细粒度轮询把检测延迟压到 150ms 内
  }
  return false
}

/** 等端口真正释放(kill 后旧 socket 可能短暂残留,防 EADDRINUSE 竞态)。 */
async function waitForPortFree(timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (!(await isPortUp())) return true
    await sleep(100)
  }
  return false
}

/** HTTP 就绪确认:TCP listen 后 dsh 几乎立即 200(实测 0.03s),但冷启动保险起见确认一次。 */
function isHttpOk() {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port: DSH_PORT, path: '/', timeout: 2000 }, (res) => {
      res.resume()
      resolve(res.statusCode === 200)
    })
    req.on('error', () => resolve(false))
    req.on('timeout', () => { req.destroy(); resolve(false) })
  })
}

async function waitForHttp(timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await isHttpOk()) return true
    await sleep(200)
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

// 端口占用者 PID(netstat -ano 解析;dsh 由外部拉起、壳无子进程句柄时的清理兜底)
function findPortOwnerPid() {
  return new Promise((resolve) => {
    const chunks = []
    const p = spawn('netstat', ['-ano', '-p', 'tcp'], { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] })
    p.stdout.on('data', (d) => chunks.push(d))
    p.on('close', () => {
      const pid = Buffer.concat(chunks).toString().split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => /^TCP\s+\S+:3080\s/.test(l))
        .map((l) => Number(l.split(/\s+/).pop()))[0]
      resolve(Number.isInteger(pid) && pid > 0 ? pid : null)
    })
    p.on('error', () => resolve(null))
  })
}

// Windows 上 npx 会派生 cmd→node 进程树,必须 taskkill /T 整树清理
function taskkillTree(pid) {
  return new Promise((resolve) => {
    const killer = spawn('taskkill', ['/pid', String(pid), '/T', '/F'], {
      windowsHide: true, stdio: 'ignore',
    })
    killer.on('exit', () => { log(`进程树 ${pid} 已清理`); resolve() })
    killer.on('error', () => resolve())
  })
}

async function killDshTree() {
  const pid = dshChild?.pid ?? (await findPortOwnerPid())
  dshChild = null
  if (pid) await taskkillTree(pid)
}

async function restartDsh(timeoutMs = START_TIMEOUT_MS) {
  restartAttempts = 0
  if (recoveryTimer) { clearTimeout(recoveryTimer); recoveryTimer = null }
  await killDshTree()
  await waitForPortFree() // 旧 socket 残留会让新实例 EADDRINUSE 直接崩
  if (startDsh()) {
    const ok = await waitForPort(timeoutMs) && await waitForHttp()
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
  if (await isHttpOk()) {
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
    detail: '更新前会验证新版可运行,失败自动回滚。',
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

// 便携版更新检查:拉 Release 的 latest.yml 比对版本(便携版无法应用内更新,仅提示下载)
async function checkPortableUpdate() {
  const url = `${GITHUB_SHELL}/releases/latest/download/latest.yml`
  try {
    // electronNet 走 Chromium 网络栈,遵循系统代理(直连 node:https 在代理环境下常失败)
    const res = await electronNet.fetch(url, { signal: AbortSignal.timeout(15_000) })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const m = /^version:\s*(\S+)/m.exec(await res.text())
    if (!m) throw new Error('latest.yml 缺少 version 字段')
    const latest = m[1]
    if (latest === app.getVersion()) {
      notify('检查更新', `便携版已是最新版 ${app.getVersion()}。`)
      return
    }
    const { response } = await dialog.showMessageBox(dialogParent(), {
      type: 'info',
      title: '发现新版本',
      message: `新版本 ${latest}(当前 ${app.getVersion()})`,
      detail: '便携版不支持应用内更新,请到 GitHub Releases 下载新版。',
      buttons: ['前往下载', '忽略'],
      defaultId: 0,
      cancelId: 1,
    })
    if (response === 0) shell.openExternal(`${GITHUB_SHELL}/releases/latest`)
  } catch (e) {
    log(`便携版更新检查失败: ${e.message}`)
    notify('检查更新', `检查失败: ${e.message}`)
  }
}

async function checkShellUpdate() {
  if (!autoUpdater) {
    await checkPortableUpdate()
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

// ---------- 更新 tab(Web UI 经壳 API 驱动,无弹窗版检查/应用) ----------

/** 无副作用的即时状态(不发网络请求)。 */
function updatesStatePayload() {
  return {
    shellVersion: app.getVersion(),
    dshVersion: cfg.dshVersion,
    portable: isPortable,
    canSelfUpdate: canShellSelfUpdate,
    devShell: !app.isPackaged,
    switching,
    restarting,
  }
}

/** 网络检查:壳(NSIS electron-updater / 便携版 latest.yml)+ dsh(npm latest)。 */
async function updatesCheckPayload() {
  const out = updatesStatePayload()
  try {
    if (canShellSelfUpdate && autoUpdater) {
      const r = await autoUpdater.checkForUpdates()
      out.shellLatest = r?.updateInfo?.version ?? null
      // autoDownload=true:发现新版会自动开始下载,完成后走既有弹窗确认重启
    } else if (isPortable) {
      const res = await electronNet.fetch(`${GITHUB_SHELL}/releases/latest/download/latest.yml`, { signal: AbortSignal.timeout(15_000) })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const m = /^version:\s*(\S+)/m.exec(await res.text())
      out.shellLatest = m ? m[1] : null
    } else {
      out.shellLatest = null
      out.shellNote = '开发模式(源码运行),跳过壳更新检查'
    }
  } catch (e) { out.shellError = e.message }
  if (out.shellLatest) out.shellUpdateAvailable = out.shellLatest !== app.getVersion()
  if (cfg.dshVersion === 'latest') {
    out.dshTracksLatest = true
  } else {
    const latest = await npmView(['version'])
    if (latest) {
      out.dshLatest = latest
      out.dshUpdateAvailable = latest !== cfg.dshVersion
    } else {
      out.dshError = '查询 npm 失败,请检查网络'
    }
  }
  return out
}

/** 应用 dsh 最新版(异步,前端轮询 /state 的 switching/restarting)。 */
async function applyDshLatest() {
  if (switching || restarting) return { ok: false, error: '已有切换或重启在进行' }
  const latest = await npmView(['version'])
  if (!latest) return { ok: false, error: '查询 npm 失败,请检查网络' }
  if (latest === cfg.dshVersion) return { ok: true, note: '已是最新版' }
  switchDshVersion(latest) // 内部自带预检+回滚+switching 互斥
  return { ok: true, accepted: true }
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

// ---------- 壳 HTTP API(Web UI 版本 tab / 插件管理 tab 经此与壳通信,仅本机) ----------

const SHELL_API_PORT = 30801
const SHELL_API_ALLOWED_ORIGINS = new Set([
  `http://127.0.0.1:${DSH_PORT}`, `http://localhost:${DSH_PORT}`,
])

// 插件启停:写 $DSH_HOME/cordis.patch.yml(home 层 patch,dsh 自带 watcher 热应用,
// 无需重启服务)。patch 语义为字段级覆盖,`- id: X` + `disabled: true` 行只覆盖目标行
// 的 disabled 字段,不触碰 bundle 层的 name/config。启用 = 删除覆盖行(恢复组合默认)。
const HOME_PATCH_FILE = path.join(DSH_HOME, 'cordis.patch.yml')

// 核心行保护名单:禁用会破坏 Web UI 骨架/传输/会话存储,拒绝 toggle。
// 只要不在这里的行(业务/工具/遥测等)都可自由启停;名单宁多勿少,实测再调。
const PROTECTED_ENTRY_IDS = new Set([
  // 传输与运行时骨架
  'webserver', 'web-startup', 'web-runtime', 'client-hmr', 'modules', 'connection',
  'api-remotes', 'client-runtime', 'cordis-client-runner', 'api-gateway', 'cordis-host-runner',
  'plugin-inventory', 'hmr', 'timer', 'code-runtime', 'directory-picker',
  // 设置页/UI 骨架(插件管理 tab 自身的依赖,保住自恢复入口)。
  // 注意:ui-settings-plugin-inventory(上游只读"插件列表"tab)已解除保护并默认禁用
  // —— 其信息并入"插件管理"tab(展开详情);需要时可在插件管理里重新启用恢复。
  'ui-theme', 'locale', 'ui-layout', 'ui-sidebar', 'ui-settings', 'ui-settings-general',
  'ui-settings-models', 'ui-settings-plugins', 'ui-conversation',
  // host 核心服务
  'settings-file', 'credentials', 'llm', 'llm-pi-ai', 'session', 'session-persistence-jsonl',
  'session-projection-cache', 'session-stats', 'session-query-sqlite', 'storage', 'storage-json',
  'storage-domain', 'workspace', 'system-prompt', 'tools', 'agent-presets',
  'dsh-version-tab',
])

/**
 * 解析 home patch 的顶层数组条目。只识别"管理行"(顶层字段仅 id+disabled,
 * disabled 为 true/false 字面量);其余条目(用户手写的 insert/config 等)原样保留。
 * @returns {{ entries: Array<{ start: number, end: number, id: string|null, disabled: boolean|null, managed: boolean }>, lines: string[], valid: boolean }}
 */
function parseHomePatch() {
  let text = ''
  try { text = fs.readFileSync(HOME_PATCH_FILE, 'utf8') } catch { /* 不存在视作空 */ }
  // CRLF 免疫:剥离行尾 \r,写回时统一 LF(下游 indexOf/正则均按精确行匹配)
  const lines = text.split('\n').map((l) => (l.endsWith('\r') ? l.slice(0, -1) : l))
  const entries = []
  let valid = true
  let cur = null
  const finish = () => { if (cur) { cur.managed = cur.id !== null && cur.disabled !== null && cur.extraFields === 0 && cur.nested === false; entries.push(cur); cur = null } }
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (/^-\s/.test(line)) {
      finish()
      cur = { start: i, end: i + 1, id: null, disabled: null, extraFields: 0, nested: false }
      const m = line.match(/^-\s*id:\s*(?:'([^']*)'|"([^"]*)"|(\S+))\s*(?:#.*)?$/)
      if (m) cur.id = m[1] ?? m[2] ?? m[3]
      else cur.extraFields += 1 // `- disabled: true` 这类首行非 id 的形态,不按管理行处理
    } else if (cur && /^\s+\S/.test(line)) {
      cur.end = i + 1
      const m = line.match(/^\s+disabled:\s*(true|false)\s*(?:#.*)?$/)
      const idm = line.match(/^\s+id:\s*(?:'([^']*)'|"([^"]*)"|(\S+))\s*(?:#.*)?$/)
      if (m && cur.disabled === null) cur.disabled = m[1] === 'true'
      else if (idm && cur.id === null) cur.id = idm[1] ?? idm[2] ?? idm[3]
      else if (!/^\s*#/.test(line)) {
        // 其余缩进内容:顶层其他字段(缩进 2)或嵌套块(更深/任意非注释) → 非管理行
        if (/^ {2}\S/.test(line) && !/^\s{4,}/.test(line)) cur.extraFields += 1
        else cur.nested = true
      }
    } else if (/^[^\s#-]/.test(line)) {
      // 顶层非数组形态行:允许空数组字面量 `[]`(删空后的合法落盘),其余视为非纯数组
      if (!/^\[\s*\]\s*(?:#.*)?$/.test(line)) valid = false
    }
    // 列 0 注释行与空行:条目间独立内容,原样保留
  }
  finish()
  return { entries, lines, valid }
}

/** 读当前用户禁用集(home patch 中 disabled: true 的管理行 id)。 */
function readDisabledPlugins() {
  const { entries } = parseHomePatch()
  return entries.filter((e) => e.managed && e.disabled === true).map((e) => e.id)
}

/**
 * 原子写 home patch(tmp+rename,dsh watcher 只会看到完整文件)。
 * 删行后若正文为空,必须落 `[]` 而不是只剩注释 —— 纯注释文件会让 dsh 启动即崩。
 * 反向同样致命:还剩条目时绝不能留 `[]` 字面量行 —— `[]` 是完整 YAML 文档,
 * 其后追加块序列项是非法文档,下次启动解析即崩。二者互斥,这里统一归一。
 */
function writeHomePatch(lines) {
  const isEmptyRow = (l) => /^\[\s*\]\s*(?:#.*)?$/.test(l)
  const hasEntries = lines.some((l) => l.trim() !== '' && !/^\s*#/.test(l) && !isEmptyRow(l))
  const normalized = hasEntries ? lines.filter((l) => !isEmptyRow(l)) : lines
  const bodyLeft = normalized.some((l) => l.trim() !== '' && !/^\s*#/.test(l))
  const out = bodyLeft ? normalized.join('\n') : '[]\n'
  const tmp = HOME_PATCH_FILE + '.tmp'
  fs.writeFileSync(tmp, out)
  fs.renameSync(tmp, HOME_PATCH_FILE)
}

/**
 * 切换一个插件的持久启用状态。
 * @returns {{ ok: boolean, error?: string }}
 */
function togglePluginEntry(entryId, disable) {
  const { entries, lines, valid } = parseHomePatch()
  if (!valid) return { ok: false, error: 'cordis.patch.yml 含顶层数组以外的内容,为安全起见请手动编辑该文件' }
  const hit = entries.find((e) => e.id === entryId)
  if (disable) {
    if (hit && !hit.managed) return { ok: false, error: `条目 ${entryId} 在 cordis.patch.yml 中有手写内容,请手动编辑` }
    if (hit) {
      // 已有管理行:改 disabled 值(或补一行)
      const block = lines.slice(hit.start, hit.end)
      const dline = block.findIndex((l) => /^\s+disabled:/.test(l))
      if (dline >= 0) lines[hit.start + dline] = '  disabled: true'
      else lines.splice(hit.end, 0, '  disabled: true')
    } else {
      lines.push(`- id: ${entryId}`, '  disabled: true', '')
    }
  } else {
    if (!hit) return { ok: true } // 无覆盖行 = 已是默认启用,幂等
    if (!hit.managed) return { ok: false, error: `条目 ${entryId} 在 cordis.patch.yml 中有手写内容,请手动编辑` }
    lines.splice(hit.start, hit.end)
    // 清掉删除后可能紧邻的重复空行
    while (lines[hit.start] !== undefined && lines[hit.start].trim() === '' && lines[hit.start + 1] !== undefined && lines[hit.start + 1].trim() === '') lines.splice(hit.start, 1)
  }
  try { writeHomePatch(lines) } catch (e) { return { ok: false, error: `写入失败: ${e.message}` } }
  return { ok: true }
}

// ---------- 人设(persona)读写:home patch 的 system-prompt 行 ----------
// 行格式由本壳独占管理(toggle 的管理行判定不含 config,互不干扰):
//   - id: system-prompt
//     config:
//       persona: |-
//         <6 空格缩进的正文行>
// 恢复默认 = 删除该行。默认值与 web-app bundle 层一致。

const PERSONA_ENTRY_ID = 'system-prompt'
const DEFAULT_PERSONA = 'You are a coding agent powered by the {{model}} model. Your working directory is {{cwd}}.'

/** home patch 中 system-prompt 行是否为壳管理的标准格式。 */
function isCanonicalPersonaRow(hit, lines) {
  const block = lines.slice(hit.start, hit.end)
  return block[0] === `- id: ${PERSONA_ENTRY_ID}`
    && block[1] === '  config:'
    && /^ {4}persona: \|-$/.test(block[2] ?? '')
    && block.slice(3).every((l) => l === '' || l.startsWith('      '))
}

/** 读 persona 覆盖;persona 为 null 表示无覆盖(用默认)。 */
function readPersonaOverride() {
  const { entries, lines } = parseHomePatch()
  const hit = entries.find((e) => e.id === PERSONA_ENTRY_ID)
  if (!hit) return { persona: null }
  if (!isCanonicalPersonaRow(hit, lines)) {
    return { error: `cordis.patch.yml 中 ${PERSONA_ENTRY_ID} 行不是本工具的标准格式,请手动编辑该文件` }
  }
  const text = lines.slice(hit.start + 3, hit.end)
    .map((l) => (l === '' ? '' : l.slice(6)))
    .join('\n')
  return { persona: text }
}

/** 写/删 persona 覆盖。text 为 null/空/等于默认时删除行(恢复默认)。 */
function writePersonaOverride(text) {
  const restore = text === null || text.trim() === '' || text === DEFAULT_PERSONA
  const { entries, lines, valid } = parseHomePatch()
  if (!valid) return { ok: false, error: 'cordis.patch.yml 含顶层数组以外的内容,为安全起见请手动编辑该文件' }
  const hit = entries.find((e) => e.id === PERSONA_ENTRY_ID)
  if (restore) {
    if (!hit) return { ok: true }
    if (!isCanonicalPersonaRow(hit, lines)) return { ok: false, error: `条目 ${PERSONA_ENTRY_ID} 有手写内容,请手动编辑` }
    lines.splice(hit.start, hit.end)
    while (lines[hit.start] !== undefined && lines[hit.start].trim() === '' && lines[hit.start + 1] !== undefined && lines[hit.start + 1].trim() === '') lines.splice(hit.start, 1)
  } else {
    const block = [`- id: ${PERSONA_ENTRY_ID}`, '  config:', '    persona: |-',
      ...text.split('\n').map((l) => (l.trim() === '' ? '' : '      ' + l))]
    if (hit) {
      if (!isCanonicalPersonaRow(hit, lines)) return { ok: false, error: `条目 ${PERSONA_ENTRY_ID} 有手写内容,请手动编辑` }
      lines.splice(hit.start, hit.end - hit.start, ...block)
    } else {
      if (lines.length && lines[lines.length - 1].trim() !== '') lines.push('')
      lines.push(...block, '')
    }
  }
  try { writeHomePatch(lines) } catch (e) { return { ok: false, error: `写入失败: ${e.message}` } }
  return { ok: true }
}

// ---------- 技能管理:user 级技能的启停与删除 ----------
// dsh 的 skill-filesystem 只扫描固定根(~/.dsh/skills、~/.agents/skills 及工作区根),
// 且以 chokidar 监听根目录(depth 1)——条目的增删移触发 invalidate 热刷新。
// 因此"禁用"= 把技能条目移动到不在任何扫描根中的 <root>-disabled 姊妹目录。

const SKILL_DISABLED_SUFFIX = '-disabled'
const SKILL_USER_ROOTS = [
  { source: 'user-dsh', label: '~/.dsh/skills', root: path.join(DSH_HOME, 'skills') },
  { source: 'user-agents', label: '~/.agents/skills', root: path.join(os.homedir(), '.agents', 'skills') },
]

/** 技能条目名安全校验:单段、无路径分隔、不涉保留名。 */
function isSafeSkillEntryName(name) {
  return typeof name === 'string' && name.length > 0 && name.length <= 160
    && !/[\\/:*?"<>|]/.test(name) && name !== '.' && name !== '..' && name !== '.system'
}

/** 轻量解析 SKILL.md / 平铺 .md 的 YAML frontmatter(name/description/when-to-use)。 */
function parseSkillFrontmatter(file) {
  let raw = ''
  try { raw = fs.readFileSync(file, 'utf8') } catch { return null }
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!m) return null
  const fmLines = m[1].split(/\r?\n/)
  const fm = {}
  for (let i = 0; i < fmLines.length; i++) {
    const kv = fmLines[i].match(/^([A-Za-z0-9_-]+):\s?(.*)$/)
    if (!kv || fm[kv[1]] !== undefined) continue
    const val = kv[2].trim()
    if (/^(>|[-+|][->+]?)$/.test(val)) {
      // 块标量(>- 等):收集后续缩进行,折叠为单行
      const block = []
      for (let j = i + 1; j < fmLines.length; j++) {
        if (fmLines[j].trim() === '') { block.push(''); continue }
        if (/^ {2,}\S/.test(fmLines[j])) block.push(fmLines[j].trim())
        else break
      }
      while (block.length && block[block.length - 1] === '') block.pop()
      fm[kv[1]] = block.join(' ')
    } else {
      fm[kv[1]] = val.replace(/^['"]|['"]$/g, '')
    }
  }
  if (!fm.name) return null
  return {
    name: fm.name,
    description: fm.description || '',
    whenToUse: fm['when-to-use'] || '',
    modelInvocable: fm['disable-model-invocation'] !== 'true',
  }
}

/** 扫描一个目录(启用根或禁用根),产出技能条目(目录含 SKILL.md 或平铺 .md)。 */
function scanSkillDir(dir, source, label, disabled) {
  const out = []
  let entries = []
  try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return out }
  for (const ent of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    let kind, file
    if (ent.isDirectory()) { kind = 'dir'; file = path.join(dir, ent.name, 'SKILL.md') }
    else if (ent.isFile() && ent.name.endsWith('.md')) { kind = 'file'; file = path.join(dir, ent.name) }
    else continue
    const fm = parseSkillFrontmatter(file)
    out.push({
      key: source + '|' + ent.name,
      entryName: ent.name,
      kind,
      source,
      sourceLabel: label,
      disabled,
      name: fm ? fm.name : ent.name.replace(/\.md$/, ''),
      description: fm ? fm.description : '(frontmatter 缺失,dsh 已忽略此技能)',
      whenToUse: fm ? fm.whenToUse : '',
      modelInvocable: fm ? fm.modelInvocable : false,
      valid: !!fm,
    })
  }
  return out
}

/** GET /skills:用户级技能(启用 + 已禁用)全集。 */
function listSkills() {
  const entries = []
  for (const r of SKILL_USER_ROOTS) {
    entries.push(...scanSkillDir(r.root, r.source, r.label, false))
    entries.push(...scanSkillDir(r.root + SKILL_DISABLED_SUFFIX, r.source, r.label, true))
  }
  return entries
}

/** 定位技能条目当前所在路径(启用根优先,其次禁用根)。 */
function locateSkillEntry(source, name) {
  const r = SKILL_USER_ROOTS.find((x) => x.source === source)
  if (!r || !isSafeSkillEntryName(name)) return null
  const enabled = path.join(r.root, name)
  const off = path.join(r.root + SKILL_DISABLED_SUFFIX, name)
  let at = null
  try { fs.statSync(enabled); at = enabled } catch { /* 不在启用位置 */ }
  if (!at) { try { fs.statSync(off); at = off } catch { /* 两处皆无 */ } }
  return { def: r, enabled, off, at }
}

/** POST /skills/toggle:条目在 root 与 root-disabled 间移动,watcher 热刷新。 */
function toggleSkillEntry(source, name, disable) {
  const loc = locateSkillEntry(source, name)
  if (!loc) return { ok: false, error: '无效的技能条目' }
  const from = disable ? loc.enabled : loc.off
  const to = disable ? loc.off : loc.enabled
  if (!fs.existsSync(from)) return { ok: false, error: disable ? '技能不在启用目录中(可能已禁用,请刷新)' : '技能不在禁用目录中(可能已启用,请刷新)' }
  try {
    fs.mkdirSync(path.dirname(to), { recursive: true })
    fs.renameSync(from, to)
  } catch (e) { return { ok: false, error: `移动失败: ${e.message}` } }
  return { ok: true }
}

/** POST /skills/delete:删除技能条目(启用或禁用位置均可,递归)。 */
function deleteSkillEntry(source, name) {
  const loc = locateSkillEntry(source, name)
  if (!loc || !loc.at) return { ok: false, error: '找不到该技能条目' }
  try { fs.rmSync(loc.at, { recursive: true, force: true }) } catch (e) { return { ok: false, error: `删除失败: ${e.message}` } }
  return { ok: true }
}

// ---------- MCP 管理:home patch 中壳写入的 insert 块(带 marker 注释) ----------
// 启停复用插件 toggle 机制(insert 子条目 id 即组合顶层行 id,patch 管理行可覆盖
// disabled 字段);删除仅对壳管理的 marker 块生效,preset 内置/手写行只提供启停。

function mcpManagedMarkers(id) {
  return [
    `# --- dsh-desktop mcp: ${id} (auto-generated; do not edit) ---`,
    `# --- end dsh-desktop mcp: ${id} ---`,
  ]
}

/** GET /mcp:解析壳管理的 MCP insert 块,返回 [{ id, config }]。 */
function listManagedMcp() {
  const { lines } = parseHomePatch()
  const out = []
  const re = /^# --- dsh-desktop mcp: (\S+) \(auto-generated; do not edit\) ---$/
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(re)
    if (!m) continue
    const endMark = `# --- end dsh-desktop mcp: ${m[1]} ---`
    const j = lines.indexOf(endMark, i + 1)
    if (j < 0) continue
    out.push({ id: m[1], config: parseMcpBlockConfig(lines.slice(i + 1, j)) })
  }
  return out
}

/** 从 insert 块行中提取 config 字段(serverName/transport/url/command/args)。 */
function parseMcpBlockConfig(block) {
  const cfg = {}
  let cur = null
  for (const l of block) {
    let m
    if ((m = l.match(/^\s+serverName:\s*(.+)$/))) { cfg.serverName = m[1].trim().replace(/^['"]|['"]$/g, ''); cur = null }
    else if ((m = l.match(/^\s+transport:\s*(.+)$/))) { cfg.transport = m[1].trim(); cur = null }
    else if ((m = l.match(/^\s+url:\s*(.+)$/))) { cfg.url = m[1].trim(); cur = null }
    else if ((m = l.match(/^\s+command:\s*(.+)$/))) { cfg.command = m[1].trim(); cur = null }
    else if ((m = l.match(/^\s+args:\s*(.*)$/))) { cfg.args = m[1].trim() ? [m[1].trim()] : []; cur = 'args' }
    else if (cur === 'args' && (m = l.match(/^\s+-\s+(.+)$/))) cfg.args.push(m[1].trim())
  }
  return cfg
}

/** POST /mcp/delete:删除壳管理的 insert 块 + 同 id 的禁用管理行(若有)。 */
function deleteManagedMcp(id) {
  if (typeof id !== 'string' || !/^[\w.-]+$/.test(id)) return { ok: false, error: '非法 id' }
  const { lines, valid } = parseHomePatch()
  if (!valid) return { ok: false, error: 'cordis.patch.yml 含顶层数组以外的内容,为安全起见请手动编辑该文件' }
  const [start, end] = mcpManagedMarkers(id)
  const i = lines.indexOf(start)
  if (i < 0) return { ok: false, error: '该 MCP 条目不是本工具写入的格式,请在 cordis.patch.yml 手动删除' }
  const j = lines.indexOf(end, i + 1)
  if (j < 0) return { ok: false, error: 'marker 不完整,请手动编辑 cordis.patch.yml' }
  lines.splice(i, j - i + 1)
  while (lines[i] !== undefined && lines[i].trim() === '' && lines[i + 1] !== undefined && lines[i + 1].trim() === '') lines.splice(i, 1)
  try { writeHomePatch(lines) } catch (e) { return { ok: false, error: `写入失败: ${e.message}` } }
  // 顺手清掉同 id 的禁用管理行(幂等,无行时为空操作)
  togglePluginEntry(id, false)
  return { ok: true }
}

// ---------- 皮肤资产 + Wallpaper Engine 接入 ----------
// 自定义皮肤:用户导入的图片/视频/音频存 ~/.dsh/desktop-assets/,
// 经壳静态服务(30801)供 WebUI 引用(跨源 CORS 已放行 3080)。
// Wallpaper Engine:扫描 Steam 创意工坊内容目录(app 431960)的 project.json,
// video 类型壁纸(mp4 + preview)可直接应用;scene 类型是打包格式,仅展示不可用。

const SKIN_ASSETS_DIR = path.join(DSH_HOME, 'desktop-assets')
const WE_APP_ID = '431960'

const SKIN_MIME = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp', '.bmp': 'image/bmp',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime', '.mkv': 'video/x-matroska',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.flac': 'audio/flac', '.m4a': 'audio/mp4',
}

function skinKindOf(name) {
  const ext = path.extname(name || '').toLowerCase()
  if (!SKIN_MIME[ext]) return null
  if (SKIN_MIME[ext].startsWith('image/')) return 'image'
  if (SKIN_MIME[ext].startsWith('video/')) return 'video'
  return 'audio'
}

/** 资产文件名安全校验(防路径穿越)。 */
function isSafeAssetName(name) {
  return typeof name === 'string' && /^[\w][\w .()-]{0,120}(\.[A-Za-z0-9]{1,8})$/.test(name) && !name.includes('..')
}

/** 扫描自定义资产目录。 */
function listSkinAssets() {
  let entries = []
  try { entries = fs.readdirSync(SKIN_ASSETS_DIR, { withFileTypes: true }) } catch { /* 尚无目录 */ }
  const out = []
  for (const ent of entries) {
    if (!ent.isFile()) continue
    const kind = skinKindOf(ent.name)
    if (!kind) continue
    let size = 0
    try { size = fs.statSync(path.join(SKIN_ASSETS_DIR, ent.name)).size } catch { /* 忽略 */ }
    out.push({ name: ent.name, kind, size, url: `/skin/asset/${encodeURIComponent(ent.name)}` })
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}

/** 定位 Wallpaper Engine 创意工坊目录(Steam 注册表 → steamapps/workshop/content/431960)。 */
function findWallpaperEngineDir() {
  const candidates = []
  try {
    const r = spawnSync('reg', ['query', 'HKCU\\Software\\Valve\\Steam', '/v', 'SteamPath'], { encoding: 'utf8', timeout: 4000 })
    if (r.status === 0) {
      const m = String(r.stdout).match(/SteamPath\s+REG_SZ\s+(\S+)/)
      if (m) candidates.push(m[1])
    }
  } catch { /* reg 不可用 */ }
  candidates.push('C:\\Program Files (x86)\\Steam', 'C:\\Program Files\\Steam', 'D:\\Steam', 'E:\\Steam')
  for (const steam of candidates) {
    const dir = path.join(steam, 'steamapps', 'workshop', 'content', WE_APP_ID)
    try { if (fs.statSync(dir).isDirectory()) return dir } catch { /* 继续找 */ }
  }
  return null
}

/** 扫描 WE 创意工坊壁纸:解析 project.json,video 类型给出可直接应用的视频文件。 */
function listWallpapers() {
  const root = findWallpaperEngineDir()
  if (!root) return { installed: false, wallpapers: [] }
  let dirs = []
  try { dirs = fs.readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory()) } catch { return { installed: true, wallpapers: [] } }
  const out = []
  for (const d of dirs) {
    const dir = path.join(root, d.name)
    let meta = null
    try { meta = JSON.parse(fs.readFileSync(path.join(dir, 'project.json'), 'utf8')) } catch { continue }
    const type = String(meta.type || '').toLowerCase()
    const preview = ['preview.jpg', 'preview.gif', 'preview.png'].find((p) => fs.existsSync(path.join(dir, p)))
    const entry = {
      id: d.name,
      title: String(meta.title || d.name),
      type,
      previewUrl: preview ? `/skin/we/${d.name}/preview` : null,
      supported: false,
      videoUrl: null,
    }
    if (type === 'video' || type === 'web') {
      // video:找最大的视频文件;web:找入口 html(前端 iframe 嵌入)
      let best = null
      try {
        for (const f of fs.readdirSync(dir)) {
          const kind = skinKindOf(f)
          if (kind === 'video') {
            const s = fs.statSync(path.join(dir, f)).size
            if (!best || s > best.size) best = { file: f, size: s }
          }
        }
      } catch { /* 忽略 */ }
      if (best) { entry.supported = true; entry.videoUrl = `/skin/we/${d.name}/video`; entry.videoFile = best.file }
    }
    out.push(entry)
  }
  out.sort((a, b) => a.title.localeCompare(b.title))
  return { installed: true, root, wallpapers: out }
}

/** WE 壁纸目录内文件定位(preview/video)。 */
function wallpaperFileOf(id, kind) {
  if (!/^\d+$/.test(String(id))) return null
  const root = findWallpaperEngineDir()
  if (!root) return null
  const dir = path.join(root, String(id))
  try { if (!fs.statSync(dir).isDirectory()) return null } catch { return null }
  try {
    if (kind === 'preview') {
      const p = ['preview.jpg', 'preview.gif', 'preview.png'].find((x) => fs.existsSync(path.join(dir, x)))
      return p ? { file: path.join(dir, p), mime: skinKindOf(p) ? SKIN_MIME[path.extname(p).toLowerCase()] : 'image/jpeg' } : null
    }
    if (kind === 'video') {
      let best = null
      for (const f of fs.readdirSync(dir)) {
        if (skinKindOf(f) === 'video') {
          const s = fs.statSync(path.join(dir, f)).size
          if (!best || s > best.size) best = { file: path.join(dir, f), mime: SKIN_MIME[path.extname(f).toLowerCase()] }
        }
      }
      return best
    }
  } catch { return null }
  return null
}

/** 读/写皮肤应用状态(持久化在 desktop-config.json 的 skin 字段)。 */
function getSkinState() {
  return cfg.skin || { bg: null, audio: null, dim: 0.45, volume: 0.35 }
}

function setSkinState(patch) {
  const cur = getSkinState()
  const next = {
    bg: 'bg' in patch ? patch.bg : cur.bg,
    audio: 'audio' in patch ? patch.audio : cur.audio,
    dim: typeof patch.dim === 'number' ? Math.min(0.9, Math.max(0, patch.dim)) : cur.dim,
    volume: typeof patch.volume === 'number' ? Math.min(1, Math.max(0, patch.volume)) : cur.volume,
  }
  cfg.skin = next
  saveConfig(cfg)
  return next
}

function startShellApi() {
  const server = http.createServer(async (req, res) => {
    const origin = req.headers.origin || ''
    // 无 Origin(本机 curl/诊断)放行;带 Origin(浏览器)必须匹配 dsh Web UI 源
    const corsOk = !origin || SHELL_API_ALLOWED_ORIGINS.has(origin)
    const base = {
      'Access-Control-Allow-Origin': origin || `http://127.0.0.1:${DSH_PORT}`,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, x-filename',
    }
    if (req.method === 'OPTIONS') { res.writeHead(204, base); res.end(); return }
    const send = (code, data) => {
      res.writeHead(code, { 'Content-Type': 'application/json', ...base })
      res.end(JSON.stringify(data))
    }
    const url = new URL(req.url, `http://127.0.0.1:${SHELL_API_PORT}`)
    if (!corsOk) return send(403, { error: 'origin not allowed' })
    try {
      // ---------- 皮肤:静态文件服务(自定义资产 + WE 预览/视频,视频支持 Range) ----------
      const sendFile = (file, mime) => {
        let stat
        try { stat = fs.statSync(file) } catch { return send(404, { error: 'not found' }) }
        const headers = { 'Content-Type': mime, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-cache', ...base }
        const range = req.headers.range
        if (range) {
          const m = range.match(/bytes=(\d*)-(\d*)/)
          if (m) {
            let start = m[1] === '' ? 0 : parseInt(m[1], 10)
            let end = m[2] === '' ? stat.size - 1 : parseInt(m[2], 10)
            if (start > end || start >= stat.size) { res.writeHead(416, { 'Content-Range': `bytes */${stat.size}`, ...base }); return res.end() }
            end = Math.min(end, stat.size - 1)
            res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${stat.size}`, 'Content-Length': end - start + 1 })
            return fs.createReadStream(file, { start, end }).pipe(res)
          }
        }
        res.writeHead(200, { ...headers, 'Content-Length': stat.size })
        fs.createReadStream(file).pipe(res)
      }
      if (req.method === 'GET' && url.pathname.startsWith('/skin/asset/')) {
        const name = decodeURIComponent(url.pathname.slice('/skin/asset/'.length))
        if (!isSafeAssetName(name)) return send(400, { error: '非法文件名' })
        const kind = skinKindOf(name)
        if (!kind) return send(400, { error: '不支持的文件类型' })
        return sendFile(path.join(SKIN_ASSETS_DIR, name), SKIN_MIME[path.extname(name).toLowerCase()])
      }
      let mWe = null
      if (req.method === 'GET' && (mWe = url.pathname.match(/^\/skin\/we\/(\d+)\/(preview|video)$/))) {
        const hit = wallpaperFileOf(mWe[1], mWe[2])
        if (!hit) return send(404, { error: 'not found' })
        return sendFile(hit.file, hit.mime)
      }
      if (req.method === 'GET' && url.pathname === '/skin/assets') {
        return send(200, { assets: listSkinAssets(), state: getSkinState() })
      }
      if (req.method === 'POST' && url.pathname === '/skin/upload') {
        const rawName = req.headers['x-filename'] ? decodeURIComponent(String(req.headers['x-filename'])) : ''
        if (!isSafeAssetName(rawName)) return send(400, { ok: false, error: '非法文件名(仅支持字母数字、空格、点、括号、连字符)' })
        const kind = skinKindOf(rawName)
        if (!kind) return send(400, { ok: false, error: '不支持的类型(支持 jpg/png/gif/webp/bmp、mp4/webm/mov/mkv、mp3/wav/ogg/flac/m4a)' })
        const chunks = []
        for await (const chunk of req) chunks.push(chunk)
        const buf = Buffer.concat(chunks)
        if (!buf.length) return send(400, { ok: false, error: '空文件' })
        if (buf.length > 512 * 1024 * 1024) return send(400, { ok: false, error: '文件超过 512MB 上限' })
        try {
          fs.mkdirSync(SKIN_ASSETS_DIR, { recursive: true })
          fs.writeFileSync(path.join(SKIN_ASSETS_DIR, rawName), buf)
        } catch (e) { return send(500, { ok: false, error: `保存失败: ${e.message}` }) }
        return send(200, { ok: true, assets: listSkinAssets() })
      }
      if (req.method === 'POST' && url.pathname === '/skin/delete') {
        let body = ''
        for await (const chunk of req) body += chunk
        const { name } = JSON.parse(body || '{}')
        if (!isSafeAssetName(name)) return send(400, { ok: false, error: '非法文件名' })
        try { fs.rmSync(path.join(SKIN_ASSETS_DIR, name), { force: true }) } catch (e) { return send(500, { ok: false, error: `删除失败: ${e.message}` }) }
        return send(200, { ok: true, assets: listSkinAssets() })
      }
      if (req.method === 'GET' && url.pathname === '/skin/wallpapers') {
        return send(200, listWallpapers())
      }
      if (req.method === 'POST' && url.pathname === '/skin/state') {
        let body = ''
        for await (const chunk of req) body += chunk
        const patch = JSON.parse(body || '{}')
        if (typeof patch !== 'object' || patch === null || Array.isArray(patch)) return send(400, { ok: false, error: 'patch 必须是对象' })
        return send(200, { ok: true, state: setSkinState(patch) })
      }
      if (req.method === 'GET' && url.pathname === '/state') {
        return send(200, {
          shellVersion: app.getVersion(),
          dshVersion: cfg.dshVersion,
          availableVersions,
          switching,
          restarting,
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
      if (req.method === 'POST' && url.pathname === '/restart') {
        if (switching || restarting) return send(409, { accepted: false, error: '已有切换或重启在进行' })
        restarting = true
        restartDsh().finally(() => { restarting = false })
        return send(202, { accepted: true })
      }
      if (req.method === 'GET' && url.pathname === '/persona') {
        const r = readPersonaOverride()
        if (r.error) return send(400, { error: r.error })
        return send(200, {
          persona: r.persona ?? DEFAULT_PERSONA,
          isDefault: r.persona === null,
          defaultPersona: DEFAULT_PERSONA,
        })
      }
      if (req.method === 'GET' && url.pathname === '/updates/state') {
        return send(200, updatesStatePayload())
      }
      if (req.method === 'POST' && url.pathname === '/updates/check') {
        return send(200, await updatesCheckPayload())
      }
      if (req.method === 'POST' && url.pathname === '/updates/apply-dsh') {
        return send(200, await applyDshLatest())
      }
      if (req.method === 'POST' && url.pathname === '/updates/apply-shell') {
        if (canShellSelfUpdate && autoUpdater) {
          try { autoUpdater.checkForUpdates() } catch (e) { return send(400, { ok: false, error: e.message }) }
          return send(202, { ok: true, started: true, note: '下载完成后将弹窗确认重启' })
        }
        if (isPortable) {
          shell.openExternal(`${GITHUB_SHELL}/releases/latest`)
          return send(200, { ok: true, opened: true, note: '便携版请从 GitHub Releases 下载新版' })
        }
        return send(400, { ok: false, error: '开发模式(源码运行)不支持壳自更新' })
      }
      if (req.method === 'POST' && url.pathname === '/updates/open-releases') {
        shell.openExternal(`${GITHUB_SHELL}/releases/latest`)
        return send(200, { ok: true })
      }
      if (req.method === 'POST' && url.pathname === '/persona') {
        let body = ''
        for await (const chunk of req) body += chunk
        const { persona } = JSON.parse(body || '{}')
        if (typeof persona !== 'string') return send(400, { ok: false, error: 'persona 必须为字符串' })
        const r = writePersonaOverride(persona)
        if (!r.ok) return send(400, r)
        const after = readPersonaOverride()
        return send(200, { ok: true, isDefault: after.persona === null, persona: after.persona ?? DEFAULT_PERSONA })
      }
      if (req.method === 'GET' && url.pathname === '/plugins') {
        return send(200, {
          disabled: readDisabledPlugins(),
          protected: [...PROTECTED_ENTRY_IDS],
        })
      }
      if (req.method === 'POST' && url.pathname === '/plugins/toggle') {
        let body = ''
        for await (const chunk of req) body += chunk
        const { entryId, disabled } = JSON.parse(body || '{}')
        if (typeof entryId !== 'string' || !entryId) return send(400, { ok: false, error: '缺少 entryId' })
        if (typeof disabled !== 'boolean') return send(400, { ok: false, error: 'disabled 必须为布尔值' })
        if (disabled && PROTECTED_ENTRY_IDS.has(entryId)) {
          return send(400, { ok: false, error: `${entryId} 是核心插件,不允许禁用` })
        }
        const result = togglePluginEntry(entryId, disabled)
        if (!result.ok) return send(400, { ok: false, error: result.error })
        return send(200, { ok: true, disabled: readDisabledPlugins() })
      }
      if (req.method === 'GET' && url.pathname === '/skills') {
        return send(200, { entries: listSkills() })
      }
      if (req.method === 'POST' && url.pathname === '/skills/toggle') {
        let body = ''
        for await (const chunk of req) body += chunk
        const { source, name, disabled } = JSON.parse(body || '{}')
        if (typeof source !== 'string' || typeof name !== 'string' || typeof disabled !== 'boolean') {
          return send(400, { ok: false, error: '参数必须是 { source: string, name: string, disabled: boolean }' })
        }
        const result = toggleSkillEntry(source, name, disabled)
        if (!result.ok) return send(400, result)
        return send(200, { ok: true, entries: listSkills() })
      }
      if (req.method === 'POST' && url.pathname === '/skills/delete') {
        let body = ''
        for await (const chunk of req) body += chunk
        const { source, name } = JSON.parse(body || '{}')
        if (typeof source !== 'string' || typeof name !== 'string') {
          return send(400, { ok: false, error: '参数必须是 { source: string, name: string }' })
        }
        const result = deleteSkillEntry(source, name)
        if (!result.ok) return send(400, result)
        return send(200, { ok: true, entries: listSkills() })
      }
      if (req.method === 'GET' && url.pathname === '/mcp') {
        return send(200, { managed: listManagedMcp() })
      }
      if (req.method === 'POST' && url.pathname === '/mcp/delete') {
        let body = ''
        for await (const chunk of req) body += chunk
        const { id } = JSON.parse(body || '{}')
        if (typeof id !== 'string' || !id) return send(400, { ok: false, error: '缺少 id' })
        const result = deleteManagedMcp(id)
        if (!result.ok) return send(400, result)
        return send(200, { ok: true, managed: listManagedMcp() })
      }
      send(404, { error: 'not found' })
    } catch (e) {
      send(500, { error: e.message })
    }
  })
  server.on('error', (e) => log(`壳 API 启动失败: ${e.message}`))
  server.listen(SHELL_API_PORT, '127.0.0.1', () => log(`壳 API 就绪: 127.0.0.1:${SHELL_API_PORT}`))
}

// ---------- 设置窗口(更新/日志管理;版本切换仅经壳 HTTP API /switch) ----------

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
    channel: canShellSelfUpdate ? 'NSIS 安装版(支持自更新)' : isPortable ? '便携版(手动更新)' : '开发模式',
    switching,
  }))
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
    { label: '重启 dsh 服务', click: () => {
      if (restarting || switching) return
      restarting = true
      restartDsh().finally(() => { restarting = false })
    } },
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
