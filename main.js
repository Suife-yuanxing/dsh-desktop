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
const { replayAll: replayLocalPatches } = require('./patches.cjs')

const DSH_PORT = 3080
const DSH_URL = `http://127.0.0.1:${DSH_PORT}`
const START_TIMEOUT_MS = 120_000 // 首次 npx 需下载包,给足时间
const SWITCH_TIMEOUT_MS = 60_000 // 版本切换的就绪预算,超时自动回滚
const DSH_HOME = path.join(os.homedir(), '.dsh')
const LOG_DIR = path.join(DSH_HOME, 'logs')
const LOG_FILE = path.join(LOG_DIR, 'desktop.log')
const CONFIG_FILE = path.join(DSH_HOME, 'desktop-config.json')
const SUMMARY_FILE = path.join(DSH_HOME, 'session-summaries.json')
const DEFAULT_DSH_VERSION = '0.1.0-rc.6' // 锁定到当前验证过的版本
const MIN_PUBLIC_DSH_VERSION = '0.1.0-rc.6' // 此前版本发布时 @deepseek-ai/* 依赖族未公开,今日 npx 已装不完整,一律不展示
// [问题78] dsh 更新链固定官方发布源:@deepseek-ai/dsh 由 DeepSeek 社区 Harness 官方
// 发布到 npm 公共注册表(官方 README 安装方式即 npx @deepseek-ai/dsh web)。用户级
// npm 配置常指向第三方镜像——镜像曾致 npm idealTree 解析预发布范围卡死、元数据
// 逐包再验证奇慢,属不可靠拉取源。查询/下载/安装各环节显式 --registry 固定官方源,
// 不随用户 npm 配置漂移;官方源不可达时明确报错,不静默换源。
const DSH_REGISTRY = 'https://registry.npmjs.org'
const REGISTRY_ARGS = ['--registry', DSH_REGISTRY]
const RECOVERY_DELAYS = [1_000, 5_000, 15_000] // 崩溃自愈退避,3 次后停
const RECOVERY_STABILIZE_MS = 5_000 // 恢复稳定期:dsh 先 listen 再加载插件树,boot 崩溃发生在 listen 之后;
                                    // 窗口内同一进程存活且端口持续监听才算真恢复,否则退避计数不得清零(防无限重启)
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

// [问题55] 解析 node.exe:优先 npx 同目录,否则注册表 InstallPath。供绕过 npx 直启用。
function resolveNodeExe() {
  const npx = resolveNpxCommand()
  if (npx) {
    const cand = path.join(path.dirname(npx), 'node.exe')
    if (fs.existsSync(cand)) return cand
  }
  for (const hive of ['HKLM', 'HKCU']) {
    const reg = spawnSync('reg', ['query', `${hive}\\SOFTWARE\\Node.js`, '/v', 'InstallPath'],
      { encoding: 'utf8', windowsHide: true })
    if (reg.status === 0 && reg.stdout) {
      const line = reg.stdout.split(/\r?\n/).find((l) => l.includes('InstallPath') && l.includes('REG_SZ'))
      if (line) {
        const cand = path.join(line.split('REG_SZ')[1].trim(), 'node.exe')
        if (fs.existsSync(cand)) return cand
      }
    }
  }
  return null
}

// [问题55] 快速启动:在 npx 缓存内找与锁定版本一致的 dsh,返回其 bin.js 绝对路径。
// 命中则壳直接 `node bin.js web`,省去 npx 包装层的解析/校验开销(实测约 1s)。
// 未命中(未缓存/版本不符)返 null,回退 npx(带 -y 自动安装)。
function resolveCachedDshBin(version) {
  const v = version || cfg.dshVersion
  try {
    const npxRoot = path.join(process.env.LOCALAPPDATA || '', 'npm-cache', '_npx')
    if (!fs.existsSync(npxRoot)) return null
    for (const h of fs.readdirSync(npxRoot)) {
      const pkgDir = path.join(npxRoot, h, 'node_modules', '@deepseek-ai', 'dsh')
      const pj = path.join(pkgDir, 'package.json')
      if (!fs.existsSync(pj)) continue
      let pkg
      try { pkg = JSON.parse(fs.readFileSync(pj, 'utf8')) } catch { continue }
      if (pkg.version !== v) continue
      const binRel = typeof pkg.bin === 'string' ? pkg.bin : (pkg.bin && pkg.bin.dsh)
      if (!binRel) continue
      const binAbs = path.join(pkgDir, binRel)
      if (fs.existsSync(binAbs)) return binAbs
    }
  } catch { /* 回退 npx */ }
  return null
}

function startDsh() {
  // [问题88] 每次启动 dsh 前重放本地补丁守护:市场更新/外部整写可能在壳运行期改掉
  // profile patch 禁用行(如 web-ui-better-sidebar 去重守护,问题53/70),服务级重启
  // (托盘重启、自动恢复)不经过 boot() 的重放,会带着坏 patch 直接 crash loop。
  // 此处重放幂等(.bak 链自愈),自动恢复迭代时还能当场修复被改写的守护行。
  try {
    const r = replayLocalPatches((l) => log(l))
    if (!r.ok) log('补丁重放存在 FAIL(不阻断启动,详见上方日志)')
  } catch (e) { log(`补丁重放异常: ${e.message}`) }
  // [问题55] 快速路径:npx 缓存命中锁定版本 → 直接 node bin.js web,省去 npx 包装层
  const binJs = resolveCachedDshBin()
  const nodeExe = binJs ? resolveNodeExe() : null
  let cmd, args
  if (binJs && nodeExe) {
    cmd = nodeExe
    // [问题69] --no-open:rc.8 起 dsh web 默认自动开默认浏览器(壳场景多余——壳自加载
    // Web UI)。官方 CLI 开关 --no-open;rc.7 及以下不认此 flag(unknown option 即崩),
    // 故仅在版本 ≥0.1.0-rc.8 时追加(配置层已由 profile patch web-runtime 行兜底)。
    const noOpen = semverGt(cfg.dshVersion, '0.1.0-rc.7') ? ['--no-open'] : []
    args = [binJs, 'web', ...noOpen]
    log(`启动 dsh(快速路径,绕过 npx): ${cmd} ${args.join(' ')}`)
  } else {
    const npx = resolveNpxCommand()
    if (!npx) {
      log('未找到可用的 npx(PATH 与注册表均失败)')
      return false
    }
    // 版本锁:npx -y @deepseek-ai/dsh@<version> web;-y 免交互安装缺失版本
    // --prefer-offline: 已缓存版本跳过注册表元数据往返,重启提速 1-2s(缺缓存时行为不变)
    // [问题78] 缓存缺失时的补装也固定官方源,与更新链同源,杜绝镜像漂移
    const spec = `@deepseek-ai/dsh@${cfg.dshVersion}`
    // [问题69] 同快速路径:--no-open 仅 rc.8+ 支持(rc.7- 传了即 unknown option 崩)
    const noOpen = semverGt(cfg.dshVersion, '0.1.0-rc.7') ? ['--no-open'] : []
    if (npx.toLowerCase().endsWith('.cmd')) {
      // Windows: .cmd 不能直接 spawn(Node 安全限制),须经 cmd /c
      cmd = 'cmd.exe'
      args = ['/c', npx, ...REGISTRY_ARGS, '--prefer-offline', '-y', spec, 'web', ...noOpen]
    } else {
      cmd = npx
      args = [...REGISTRY_ARGS, '--prefer-offline', '-y', spec, 'web', ...noOpen]
    }
    log(`启动 dsh(npx): ${cmd} ${args.join(' ')}`)
  }
  dshChild = spawn(cmd, args, {
    cwd: os.homedir(),
    windowsHide: true, // 隐藏 npx 控制台窗口,日志走文件
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
  })
  const childRef = dshChild
  log(`dsh 子进程 pid=${dshChild.pid}`)
  dshChild.stdout.on('data', (d) => log(`[dsh] ${String(d).trim()}`))
  dshChild.stderr.on('data', (d) => log(`[dsh-err] ${String(d).trim()}`))
  dshChild.on('exit', (code) => {
    // [问题75] 身份守卫:被 killDshTree 杀掉的旧实例 exit 事件会延迟到达,
    // 若无条件置空 dshChild 并拉起 recovery,会把切换/重启刚拉起的新进程
    // 引用抹掉并二次拉起 → 双实例撞端口(EADDRINUSE 崩溃循环)。
    if (dshChild !== childRef) return
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
    const child = dshChild // 锁定本次恢复拉起的进程,防止后续恢复周期替换后误清零计数
    const ok = await waitForPort(START_TIMEOUT_MS)
    if (ok) {
      // 端口监听不代表 boot 完成:插件树加载失败会让进程在 listen 后 1-2s 退出。
      // 先刷页面保住 UX,退避计数留待稳定期确认后再清零——否则每次崩溃循环都把
      // 计数重置为 0,3 次熔断永远不触发,表现为无限重启。
      stage('ready')
      loadUrlAll(DSH_URL)
      await sleep(RECOVERY_STABILIZE_MS)
      if (!quitting && dshChild === child && (await isPortUp())) {
        restartAttempts = 0
        log('自动恢复成功')
      } else {
        log('恢复后未通过稳定期(进程退出或端口丢失),保留退避计数')
      }
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

// ---------- 重启进度遮罩(注入 Web 页面,Claude 风格圆形进度条) ----------
// 重启期间旧页面仍存活,经 executeJavaScript 注入全屏遮罩;导航到新页面后自然消失。
const RESTART_OVERLAY_JS = `(function(pct, label){
  var id = '__dsh_restart_overlay__';
  var el = document.getElementById(id);
  if (!el) {
    el = document.createElement('div');
    el.id = id;
    el.style.cssText = 'position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;background:rgba(9,9,11,.38);backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px);';
    el.innerHTML = '<div style="display:flex;flex-direction:column;align-items:center;gap:14px;padding:28px 44px;border-radius:16px;background:var(--dsw-alias-bg-layer-2,#fff);box-shadow:0 12px 32px rgba(0,0,0,.18),0 2px 8px rgba(0,0,0,.08);">'
      + '<svg width="72" height="72" viewBox="0 0 72 72" aria-hidden="true">'
      + '<circle cx="36" cy="36" r="26" fill="none" stroke="rgba(127,127,127,.18)" stroke-width="6"/>'
      + '<circle class="__dsh_ring" cx="36" cy="36" r="26" fill="none" stroke="#d97757" stroke-width="6" stroke-linecap="round" transform="rotate(-90 36 36)" style="transition:stroke-dashoffset .3s ease"/>'
      + '</svg>'
      + '<div class="__dsh_pct" style="font:600 15px/1 system-ui,-apple-system,sans-serif;color:#d97757">0%</div>'
      + '<div class="__dsh_lbl" style="font:12px/1.4 system-ui,-apple-system,sans-serif;color:rgba(127,127,127,.95);white-space:nowrap"></div>'
      + '</div>';
    document.documentElement.appendChild(el);
  }
  var C = 2 * Math.PI * 26;
  var ring = el.querySelector('.__dsh_ring');
  ring.style.strokeDasharray = C;
  ring.style.strokeDashoffset = C * (1 - Math.max(0, Math.min(100, pct)) / 100);
  el.querySelector('.__dsh_pct').textContent = Math.round(pct) + '%';
  el.querySelector('.__dsh_lbl').textContent = label;
  el.style.display = 'flex';
})`

function execJsAll(js) {
  for (const win of mainWindows) {
    if (!win.isDestroyed() && !win.webContents.isLoadingMainFrame()) {
      win.webContents.executeJavaScript(js, true).catch(() => {})
    }
  }
}

function restartProgress(pct, label) {
  execJsAll(RESTART_OVERLAY_JS + '(' + Math.round(pct) + ',' + JSON.stringify(label) + ')')
}

function restartOverlayRemove() {
  execJsAll(`(function(){var el=document.getElementById('__dsh_restart_overlay__');if(el)el.remove();})()`)
}

async function restartDsh(timeoutMs = START_TIMEOUT_MS) {
  restartAttempts = 0
  if (recoveryTimer) { clearTimeout(recoveryTimer); recoveryTimer = null }
  restartProgress(6, '正在停止旧服务…')
  await killDshTree()
  restartProgress(24, '等待端口释放…')
  await waitForPortFree(8000) // 旧 socket 残留会让新实例 EADDRINUSE 直接崩;Windows 释放可慢,给足 8s
  restartProgress(46, '正在启动 dsh 服务…')
  if (startDsh()) {
    // 等待期进度自走(46→92 缓爬),真就绪由轮询确认;单次 HTTP 探测 = 端口+服务双确认,省去串行等待
    const t0 = Date.now()
    const creep = setInterval(() => {
      restartProgress(Math.min(92, 50 + (Date.now() - t0) / 1000 * 6), '正在启动 dsh 服务…')
    }, 350)
    let ok = false
    try {
      const deadline = Date.now() + timeoutMs
      while (Date.now() < deadline) {
        if (await isHttpOk()) { ok = true; break } // 连接拒绝即时返回,不拖 2s 超时
        await sleep(120)
      }
    } finally { clearInterval(creep) }
    if (ok) {
      restartProgress(100, '已就绪')
      loadUrlAll(DSH_URL)
      setTimeout(restartOverlayRemove, 600) // 导航后兜底清除
    } else {
      // 超时兜底:子进程可能因 EADDRINUSE 竞态退出,但外部实例已接管服务(实测场景)。
      // 此时页面 SSE 已断,必须重载才能恢复对话内容——不能让用户盯着空白页。
      if (await isHttpOk()) {
        log('重启超时但服务可用(外部实例接管),重载页面恢复连接')
        restartProgress(100, '已就绪')
        loadUrlAll(DSH_URL)
        setTimeout(restartOverlayRemove, 600)
      } else {
        restartProgress(96, '重启超时,请查看日志')
        setTimeout(restartOverlayRemove, 2500)
      }
    }
  } else {
    restartOverlayRemove()
  }
}

// ---------- npm 查询(dsh 版本/更新) ----------

// 经与 npx 同源的 npm.cmd 执行查询;返回 stdout 字符串,失败返回 null。
// [问题78] --registry 固定官方 npm 源(版本列表/最新版判定的唯一权威来源),
// 不受用户 npm 配置里的镜像影响。
function npmView(args) {
  return new Promise((resolve) => {
    const npx = resolveNpxCommand()
    if (!npx) return resolve(null)
    const npmCmd = npx.replace(/npx\.cmd$/i, 'npm.cmd')
    if (!fs.existsSync(npmCmd)) return resolve(null)
    const child = spawn('cmd.exe', ['/c', npmCmd, ...REGISTRY_ARGS, 'view', '@deepseek-ai/dsh', ...args],
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

// 版本预检:验证目标版本可运行(旧 rc 可能包损坏/不兼容)。
// [问题75] 双路径:① 目标版本已在 npx 缓存 → node 直跑 --version,秒级离线验证;
// ② 否则 npx 拉包——dsh 依赖树 250+ 包,慢源逐个再验证+解包实测可达数分钟,
// 原 60s 超时必被误判"版本不可用"而取消切换,预算提到 300s 并加 --prefer-offline。
// [问题78] 下载/安装固定官方 npm 源:此前默认走用户配置的镜像,曾致 npm idealTree
// 解析 dsh 预发布依赖范围纯 CPU 卡死十几分钟、逐包再验证奇慢——更新"卡住/静默失败"
// 的直接根源。官方源实测连通且元数据权威,拉取行为可预期。
async function probeDshVersion(version) {
  // 快速路径:缓存命中直接 node 验证,不走网络
  const binJs = resolveCachedDshBin(version)
  const nodeExe = binJs ? resolveNodeExe() : null
  if (binJs && nodeExe) {
    return new Promise((resolve) => {
      const child = spawn(nodeExe, [binJs, '--version'],
        { cwd: os.homedir(), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
      let out = ''
      let done = false
      const finish = (v) => { if (!done) { done = true; resolve(v) } }
      const timer = setTimeout(() => { try { child.kill() } catch {}; finish({ ok: false, error: '缓存版本运行超时(30s)' }) }, 30_000)
      child.stdout.on('data', (d) => { out += d })
      child.on('exit', (code) => {
        clearTimeout(timer)
        if (code === 0) finish({ ok: true, version: out.trim().split(/\r?\n/).pop() })
        else finish({ ok: false, error: `缓存版本退出码 ${code}` })
      })
      child.on('error', (e) => { clearTimeout(timer); finish({ ok: false, error: e.message }) })
    })
  }
  // 慢速路径①:npx 从官方源拉包验证([问题78])
  const r = await npxProbeDsh(version)
  if (r.ok) return r
  // 慢速路径②:[问题78] npx(npm) 解析 dsh 预发布依赖树本机实测可达十分钟级,
  // 失败/超时且 pnpm 可用时改 pnpm 播种官方源(同树实测数十秒装完),
  // 播种目录兼容 npx 缓存结构,启动快速路径可直接命中。
  log(`预检 ${version}:npx 拉取失败(${r.error}),改 pnpm 从官方源播种`)
  settingsStatus({ phase: 'apply', message: `正在用备用安装器从官方源下载 ${version}…` })
  return pnpmSeedDsh(version)
}

// 慢速路径①实体:npx 官方源拉包跑 --version(300s 预算)。
function npxProbeDsh(version) {
  return new Promise((resolve) => {
    const npx = resolveNpxCommand()
    if (!npx) return resolve({ ok: false, error: '未找到 npx' })
    const spec = `@deepseek-ai/dsh@${version}`
    log(`预检 ${version}:从官方源 ${DSH_REGISTRY} 拉取验证(缓存未命中)`)
    const child = spawn('cmd.exe', ['/c', npx, ...REGISTRY_ARGS, '--prefer-offline', '-y', spec, '--version'],
      { cwd: os.homedir(), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    let err = ''
    let done = false
    const finish = (v) => { if (!done) { done = true; resolve(v) } }
    const timer = setTimeout(() => { try { child.kill() } catch {}; finish({ ok: false, error: '预检超时(300s),依赖树下载过慢' }) }, 300_000)
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

// 解析 pnpm:优先 npx 同目录的 pnpm.cmd,否则 PATH where。
function resolvePnpmCommand() {
  const npx = resolveNpxCommand()
  if (npx) {
    const candidate = path.join(path.dirname(npx), 'pnpm.cmd')
    if (fs.existsSync(candidate)) return candidate
  }
  try {
    const r = spawnSync('where.exe', ['pnpm.cmd'], { windowsHide: true, encoding: 'utf8' })
    const first = (r.stdout || '').split(/\r?\n/).find((l) => l.trim())
    if (first) return first.trim()
  } catch { /* 忽略 */ }
  return null
}

// 慢速路径②实体:[问题78] pnpm 从官方源播种目标版本到 npx 缓存目录结构
// (npm-cache/_npx/<dir>/node_modules),resolveCachedDshBin 快速路径可直接命中。
// 原生依赖构建脚本需显式放行;pnpm 11 已不读 package.json 的 pnpm 字段(会致
// install 退出码 1),只认 pnpm-workspace.yaml 的 onlyBuiltDependencies;装完
// 补跑 rebuild 确保原生模块构建,最后 node 直跑验证。
function pnpmSeedDsh(version) {
  return new Promise((resolve) => {
    const pnpm = resolvePnpmCommand()
    if (!pnpm) return resolve({ ok: false, error: 'npx 拉取失败且未找到 pnpm,请手动 npx 预热' })
    const seedDir = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'),
      'npm-cache', '_npx', `dsh-${version}-pnpm-seed`)
    try {
      fs.mkdirSync(seedDir, { recursive: true })
      const allowBuilds = ['@deepseek-ai/dsh-subprocess-local', '@google/genai', 'koffi', 'node-pty', 'protobufjs']
      fs.writeFileSync(path.join(seedDir, 'package.json'), JSON.stringify({
        name: `dsh-${version.replace(/[^0-9a-z.-]/gi, '_')}-seed`,
        private: true,
        dependencies: { '@deepseek-ai/dsh': version },
      }))
      fs.writeFileSync(path.join(seedDir, 'pnpm-workspace.yaml'),
        'onlyBuiltDependencies:\n' + allowBuilds.map((n) => `  - '${n}'`).join('\n') + '\n')
    } catch (e) { return resolve({ ok: false, error: `播种目录准备失败: ${e.message}` }) }
    log(`预检 ${version}:pnpm 播种 ${seedDir}(官方源 ${DSH_REGISTRY})`)
    const child = spawn('cmd.exe', ['/c', pnpm, 'install', `--registry=${DSH_REGISTRY}`],
      { cwd: seedDir, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    let err = ''
    let done = false
    const finish = (v) => { if (!done) { done = true; resolve(v) } }
    const timer = setTimeout(() => { try { child.kill() } catch {}; finish({ ok: false, error: 'pnpm 播种超时(300s)' }) }, 300_000)
    child.stderr.on('data', (d) => { err += d })
    child.on('error', (e) => { clearTimeout(timer); finish({ ok: false, error: e.message }) })
    child.on('exit', (code) => {
      clearTimeout(timer)
      // pnpm 11 遇未放行的构建脚本会以退出码 1 结束但依赖树已装好,
      // 放行清单在 pnpm-workspace.yaml,后续 rebuild 会补执行构建。
      if (code !== 0 && code !== 1) return finish({ ok: false, error: `pnpm install 退出码 ${code}: ${err.trim().slice(0, 160)}` })
      // 补跑构建脚本(pnpm 11 install 阶段拦截未放行脚本),随后 node 验证
      const rb = spawn('cmd.exe', ['/c', pnpm, 'rebuild'],
        { cwd: seedDir, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
      const rbTimer = setTimeout(() => { try { rb.kill() } catch {} }, 120_000)
      rb.on('error', () => { clearTimeout(rbTimer); finish({ ok: false, error: 'pnpm rebuild 失败' }) })
      rb.on('exit', () => {
        clearTimeout(rbTimer)
        const binJs = resolveCachedDshBin(version)
        const nodeExe = binJs ? resolveNodeExe() : null
        if (!binJs || !nodeExe) return finish({ ok: false, error: 'pnpm 播种后仍未在缓存发现目标版本' })
        const v = spawn(nodeExe, [binJs, '--version'],
          { cwd: os.homedir(), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
        let out = ''
        const vTimer = setTimeout(() => { try { v.kill() } catch {}; finish({ ok: false, error: '播种版本运行超时(30s)' }) }, 30_000)
        v.stdout.on('data', (d) => { out += d })
        v.on('exit', (c2) => {
          clearTimeout(vTimer)
          if (c2 === 0) finish({ ok: true, version: out.trim().split(/\r?\n/).pop() })
          else finish({ ok: false, error: `播种版本退出码 ${c2}` })
        })
        v.on('error', (e2) => { clearTimeout(vTimer); finish({ ok: false, error: e2.message }) })
      })
    })
  })
}

// [问题75] 解析 dsh 最新可用版本:npm latest dist-tag 不收录预发布版(rc.x),
// 仅查 latest 会把 rc.8 等新版本永远判为"已是最新"。改为全量 versions 清单内
// 取 ≥ MIN_PUBLIC_DSH_VERSION 的最高版本;清单获取失败时回退 latest 标签。
async function resolveNewestPublicDsh() {
  const raw = await npmView(['versions', '--json'])
  if (raw) {
    try {
      const list = JSON.parse(raw)
      if (Array.isArray(list) && list.length) {
        const eligible = list.filter((v) => parseDshVersion(v) && cmpDshVersion(v, MIN_PUBLIC_DSH_VERSION) >= 0)
        if (eligible.length) {
          return eligible.reduce((a, b) => (cmpDshVersion(b, a) > 0 ? b : a))
        }
      }
    } catch { /* 解析失败走回退 */ }
  }
  return npmView(['version'])
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
  // [问题78] resolveNewestPublicDsh 内部 npmView 已固定官方源;失败时提示指向官方源
  const latest = await resolveNewestPublicDsh()
  if (!latest) {
    if (manual) notify('dsh 更新', `查询官方源 ${DSH_REGISTRY} 失败,请检查网络。`)
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
    const remote = result && result.updateInfo && result.updateInfo.version
    // [问题50] semver 判定:远端不高于本地即视为最新(electron-updater 自身不会降级安装,但提示文案须诚实)
    if (!remote || !semverGt(remote, app.getVersion())) {
      notify('检查更新', `壳已是最新版 ${app.getVersion()}。`)
    }
  } catch (e) {
    log(`壳更新检查失败: ${e.message}`)
    notify('检查更新', `检查失败: ${e.message}`)
  }
}

// ---------- 更新 tab(Web UI 经壳 API 驱动,无弹窗版检查/应用) ----------

/** 语义化版本比较:a > b 返 true(逐段数字比,前缀相同短者小;非数字段退化为字符串比)。 */
function semverGt(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false
  const pa = a.replace(/^v/i, '').split(/[.-]/)
  const pb = b.replace(/^v/i, '').split(/[.-]/)
  const n = Math.max(pa.length, pb.length)
  for (let i = 0; i < n; i++) {
    const xa = pa[i], xb = pb[i]
    if (xa === undefined) return false // a 短且前缀相同 → a < b
    if (xb === undefined) return true
    const na = Number(xa), nb = Number(xb)
    if (!Number.isNaN(na) && !Number.isNaN(nb)) {
      if (na !== nb) return na > nb
    } else {
      if (xa !== xb) return xa > xb
    }
  }
  return false
}

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
  // [问题50] 版本判定从「不相等即更新」改为 semver 大于——否则 GitHub latest.yml
  // 滞后于本地版本(如 0.4.0 vs 本地 0.4.3)会误报可更新,诱导降级安装。
  if (out.shellLatest) out.shellUpdateAvailable = semverGt(out.shellLatest, app.getVersion())
  if (cfg.dshVersion === 'latest') {
    out.dshTracksLatest = true
  } else {
    // [问题75] 取全量清单最高公开版而非 latest 标签(rc 版不进 latest)
    const latest = await resolveNewestPublicDsh()
    if (latest) {
      out.dshLatest = latest
      out.dshUpdateAvailable = semverGt(latest, cfg.dshVersion)
    } else {
      out.dshError = '查询 npm 失败,请检查网络'
    }
  }
  return out
}

/** 应用 dsh 最新版(异步,前端轮询 /state 的 switching/restarting)。 */
async function applyDshLatest() {
  if (switching || restarting) return { ok: false, error: '已有切换或重启在进行' }
  // [问题75] 目标版本取全量清单最高公开版(latest 标签不含 rc 新版)
  const latest = await resolveNewestPublicDsh()
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
// (如 pI_x6G_logoRow),用 [class*="_xxx"] 匹配。
// [问题77] 拖拽区扩展为整个顶栏:侧栏 logoRow + 中列 header(标题行/
// 空白区/tab 行空隙)均可拖拽;交互控件(按钮/链接/输入/tab/下拉)毯式
// 排除 no-drag,点击与拖拽互不干扰;窗口顶部 6px 细条兜底。
const TITLEBAR_DRAG_CSS = `
  [class*="_logoRow"] { -webkit-app-region: drag; }
  [class*="_logoRow"] button,
  [class*="_logoRow"] a,
  [class*="_logoRow"] [role="button"] { -webkit-app-region: no-drag; }
  header[class*="_header"] { -webkit-app-region: drag; }
  header[class*="_header"] button,
  header[class*="_header"] a,
  header[class*="_header"] input,
  header[class*="_header"] select,
  header[class*="_header"] textarea,
  header[class*="_header"] [role="button"],
  header[class*="_header"] [role="tab"],
  header[class*="_header"] [role="combobox"],
  header[class*="_header"] [role="menuitem"],
  header[class*="_header"] [contenteditable] { -webkit-app-region: no-drag; }
  [class*="_frame"]::after {
    content: ''; position: absolute; top: 0; left: 0; right: 0; height: 6px;
    -webkit-app-region: drag; z-index: 40;
  }
`

// [问题77] macOS(Codex Mac 版)风格窗口控件:圆形红黄绿小点,静息态中性灰
// 融入亮/暗主题与壁纸,悬停点亮交通灯色并显形符号;无边框无分隔线,
// 与内容区自然融合。点击热区 24px(::before 画 12px 圆点)。
// [问题68永久修复] 顶部安全区单一事实来源:控件几何(高度/右侧占位)只有
// 壳自己知道,在此以 CSS 变量发布(随 insertCSS 每次导航重放,永与控件同版)。
// 页面层(dshvt 覆盖层)消费该令牌给顶到窗口上沿的视图留安全区,并以硬底线
// 兜底旧壳无变量的场景。控件改高度/边距时只改此处,消费侧自动同步。
// --dsh-titlebar-safe:控件高度 40 + 4px 视觉间隙 = 44px;
// --dsh-titlebar-safe-right:right 10 + 宽度 76 = 86px 占位 + 14px 间隙 = 100px。
const TITLEBAR_CONTROLS_CSS = `
  html {
    --dsh-titlebar-safe: 44px;
    --dsh-titlebar-safe-right: 100px;
  }
  #dsh-desktop-win-controls {
    position: fixed; top: 0; right: 10px; z-index: 2147483647;
    display: flex; align-items: center; gap: 2px; height: 40px; direction: ltr;
    -webkit-app-region: no-drag;
    font-family: system-ui, sans-serif;
  }
  #dsh-desktop-win-controls .wcBtn {
    position: relative; width: 24px; height: 24px;
    display: flex; align-items: center; justify-content: center;
    color: #3d444d; cursor: default; user-select: none;
  }
  #dsh-desktop-win-controls .wcBtn::before {
    content: ''; width: 12px; height: 12px; border-radius: 50%;
    background: rgba(127,127,127,.38);
    transition: background .12s ease;
  }
  #dsh-desktop-win-controls .wcBtn svg {
    position: absolute; width: 8px; height: 8px;
    opacity: 0; transition: opacity .12s ease;
    color: rgba(20,22,26,.72);
  }
  #dsh-desktop-win-controls:hover .wcBtn svg { opacity: 1; }
  #dsh-desktop-win-controls .wcBtn[data-act="min"]:hover::before { background: #febc2e; }
  #dsh-desktop-win-controls .wcBtn[data-act="min"]:active::before { background: #d9a017; }
  #dsh-desktop-win-controls .wcBtn[data-act="max"]:hover::before { background: #28c840; }
  #dsh-desktop-win-controls .wcBtn[data-act="max"]:active::before { background: #1f9a3b; }
  #dsh-desktop-win-controls .wcBtn.wcClose:hover::before { background: #ff5f57; }
  #dsh-desktop-win-controls .wcBtn.wcClose:active::before { background: #d94a41; }
`

// 自定义窗口控制按钮注入脚本:原生 titleBarOverlay 悬停反馈过弱且不可定制,弃用;
// 改为 HTML 按钮浮层(最小化/最大化-还原/关闭),经 preload windowControls 桥操作窗口。
// 幂等(did-navigate / did-navigate-in-page 均会重放),SPA 重渲染不触碰 body 末尾元素。
const TITLEBAR_CONTROLS_JS = `
(() => {
  const boot = () => {
    const ID = 'dsh-desktop-win-controls'
    if (document.getElementById(ID)) return
    const d = window.dshDesktop && window.dshDesktop.windowControls
    if (!d) return
    const box = document.createElement('div')
    box.id = ID
    const svg = (inner) => '<svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true">' + inner + '</svg>'
    const ICON_MIN = svg('<rect x="0" y="4.25" width="10" height="1.5" fill="currentColor"/>')
    const ICON_MAX = svg('<rect x="0.75" y="0.75" width="8.5" height="8.5" fill="none" stroke="currentColor" stroke-width="1.2"/>')
    const ICON_RESTORE = svg('<rect x="0.75" y="2.75" width="6.5" height="6.5" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M3 2.25V0.75h6.25V7H7.75" fill="none" stroke="currentColor" stroke-width="1.2"/>')
    const ICON_CLOSE = svg('<path d="M0.9 0.9l8.2 8.2M9.1 0.9l-8.2 8.2" stroke="currentColor" stroke-width="1.2"/>')
    box.innerHTML =
      '<div class="wcBtn" data-act="min" title="最小化">' + ICON_MIN + '</div>' +
      '<div class="wcBtn" data-act="max" title="最大化">' + ICON_MAX + '</div>' +
      '<div class="wcBtn wcClose" data-act="close" title="关闭">' + ICON_CLOSE + '</div>'
    document.body.appendChild(box)
    const maxBtn = box.querySelector('[data-act="max"]')
    box.addEventListener('click', (ev) => {
      const t = ev.target.closest('[data-act]')
      if (!t) return
      if (t.dataset.act === 'min') d.minimize()
      else if (t.dataset.act === 'max') d.toggleMaximize()
      else if (t.dataset.act === 'close') d.close()
    })
    const paint = (max) => {
      maxBtn.innerHTML = max ? ICON_RESTORE : ICON_MAX
      maxBtn.title = max ? '向下还原' : '最大化'
    }
    d.onMaximized(paint)
    d.getMaximized().then(paint).catch(() => {})
  }
  if (document.body) boot()
  else document.addEventListener('DOMContentLoaded', boot, { once: true })
})()
`

// 自定义窗口控制按钮 IPC(注入的按钮经 preload 桥调用;按 sender 定位窗口,多窗安全)
ipcMain.handle('dsh-win:is-maximized', (e) => BrowserWindow.fromWebContents(e.sender)?.isMaximized() ?? false)
ipcMain.on('dsh-win:minimize', (e) => BrowserWindow.fromWebContents(e.sender)?.minimize())
ipcMain.on('dsh-win:toggle-maximize', (e) => {
  const w = BrowserWindow.fromWebContents(e.sender)
  if (!w) return
  if (w.isMaximized()) w.unmaximize()
  else w.maximize()
})
ipcMain.on('dsh-win:close', (e) => BrowserWindow.fromWebContents(e.sender)?.close())

function createMainWindow({ show = false } = {}) {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    icon: path.join(__dirname, 'icon.ico'),
    title: 'DeepSeek Harness',
    show,
    // Claude 式融合:去原生标题栏;窗口控制按钮弃用原生 overlay(悬停反馈过弱且
    // 不可定制),改为注入 HTML 浮层(见 TITLEBAR_CONTROLS_JS),悬停高亮明确。
    titleBarStyle: 'hidden',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // 壁纸视频带声播放:Chromium 默认要求用户手势才允许非静音自动播放,
      // 桌面壳内放开(本地内容,等价原生应用行为)。
      autoplayPolicy: 'no-user-gesture-required',
    },
  })
  mainWindows.add(win)
  win.on('closed', () => mainWindows.delete(win))
  // 每次主导航后注入拖拽区+控制按钮(insertCSS/executeJavaScript 不跨导航保留)
  const injectTitleChrome = () => {
    win.webContents.insertCSS(TITLEBAR_DRAG_CSS + TITLEBAR_CONTROLS_CSS).catch(() => {})
    win.webContents.executeJavaScript(TITLEBAR_CONTROLS_JS, false).catch(() => {})
  }
  win.webContents.on('did-navigate', injectTitleChrome)
  win.webContents.on('did-navigate-in-page', injectTitleChrome)
  // 最大化状态推送:按钮图标在最大化/还原间切换
  const pushMax = () => {
    if (!win.isDestroyed()) win.webContents.send('dsh-win:maximized', win.isMaximized())
  }
  win.on('maximize', pushMax)
  win.on('unmaximize', pushMax)
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

// WE 目录发现结果缓存:视频播放会发大量 Range 请求,每次都 spawnSync reg
// 会阻塞壳主进程(视频卡顿);命中后永续缓存,未命中 60s 后允许重探(装 WE 后免重启)。
let weDirCache = { dir: null, missAt: 0 }

/** 解析 steamapps/libraryfolders.vdf 的所有库路径(WE 可能装在第二库)。 */
function steamLibraryDirs(mainSteam) {
  const libs = [mainSteam]
  try {
    const vdf = fs.readFileSync(path.join(mainSteam, 'steamapps', 'libraryfolders.vdf'), 'utf8')
    for (const m of vdf.matchAll(/"path"\s+"([^"]+)"/g)) {
      const p = m[1].replace(/\\\\/g, '\\')
      if (!libs.includes(p)) libs.push(p)
    }
  } catch { /* 无 vdf 或主库缺失 */ }
  return libs.filter(Boolean)
}

/** 定位 Wallpaper Engine 创意工坊目录(Steam 注册表 → 全部库 steamapps/workshop/content/431960)。 */
function findWallpaperEngineDir() {
  if (weDirCache.dir) return weDirCache.dir
  if (weDirCache.missAt && Date.now() - weDirCache.missAt < 60000) return null
  const candidates = []
  try {
    const r = spawnSync('reg', ['query', 'HKCU\\Software\\Valve\\Steam', '/v', 'SteamPath'], { encoding: 'utf8', timeout: 4000 })
    if (r.status === 0) {
      // 正则吃到行尾:SteamPath 含空格(如 C:\Program Files (x86)\Steam)时 \S+ 会截断
      const m = String(r.stdout).match(/SteamPath\s+REG_SZ\s+(.+?)\s*$/m)
      if (m) candidates.push(...steamLibraryDirs(m[1].trim()))
    }
  } catch { /* reg 不可用 */ }
  candidates.push('C:\\Program Files (x86)\\Steam', 'C:\\Program Files\\Steam', 'D:\\Steam', 'E:\\Steam')
  for (const steam of candidates) {
    const dir = path.join(steam, 'steamapps', 'workshop', 'content', WE_APP_ID)
    try { if (fs.statSync(dir).isDirectory()) { weDirCache = { dir, missAt: 0 }; return dir } } catch { /* 继续找 */ }
  }
  weDirCache = { dir: null, missAt: Date.now() }
  return null
}

/** WE 壁纸声明的入口文件(project.json 的 file / general.file)。 */
function weDeclaredFile(meta) {
  const f = meta && (meta.file || (meta.general && meta.general.file))
  return typeof f === 'string' && f ? f : null
}

/** 目录内最大的视频文件(声明文件缺失时的兜底,兼容历史下载)。 */
function largestVideoIn(dir) {
  let best = null
  try {
    for (const f of fs.readdirSync(dir)) {
      if (skinKindOf(f) === 'video') {
        const s = fs.statSync(path.join(dir, f)).size
        if (!best || s > best.size) best = { file: f, size: s }
      }
    }
  } catch { /* 忽略 */ }
  return best
}

/** 扫描 WE 创意工坊壁纸:解析 project.json,video 类型给出可直接应用的视频文件。
 *  分类:supported(可应用)/ scene(打包格式)/ web(HTML 页面)/ incomplete(创意工坊
 *  条目存在但声明文件缺失,常见于下载被清理——在 Steam 中重新下载即可恢复)。 */
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
      incomplete: false,
      videoUrl: null,
    }
    if (type === 'video' || type === 'web') {
      // 优先用 project.json 声明的入口文件(精确),声明缺失时兜底扫描最大视频文件
      const declared = weDeclaredFile(meta)
      let file = null
      if (declared && skinKindOf(declared) === 'video' && fs.existsSync(path.join(dir, declared))) {
        file = declared
      } else {
        const best = largestVideoIn(dir)
        if (best) file = best.file
      }
      if (file) { entry.supported = true; entry.videoUrl = `/skin/we/${d.name}/video`; entry.videoFile = file }
      else if (type === 'video') entry.incomplete = true
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
      // 与 listWallpapers 同序:声明文件优先,兜底最大视频
      let meta = null
      try { meta = JSON.parse(fs.readFileSync(path.join(dir, 'project.json'), 'utf8')) } catch { /* 无元数据 */ }
      const declared = weDeclaredFile(meta)
      if (declared && skinKindOf(declared) === 'video' && fs.existsSync(path.join(dir, declared))) {
        return { file: path.join(dir, declared), mime: SKIN_MIME[path.extname(declared).toLowerCase()] }
      }
      const best = largestVideoIn(dir)
      return best ? { file: path.join(dir, best.file), mime: SKIN_MIME[path.extname(best.file).toLowerCase()] } : null
    }
  } catch { return null }
  return null
}

/** 读/写皮肤应用状态(持久化在 desktop-config.json 的 skin 字段)。 */
function getSkinState() {
  const s = cfg.skin || { bg: null, audio: null, dim: 0.45, volume: 0.35 }
  // [R48→问题71] glass 默认关:仅用户显式开启才生效,避免启动/设置页切模块时玻璃自启
  return { glass: false, ...s }
}

function setSkinState(patch) {
  const cur = getSkinState()
  const next = {
    bg: 'bg' in patch ? patch.bg : cur.bg,
    audio: 'audio' in patch ? patch.audio : cur.audio,
    dim: typeof patch.dim === 'number' ? Math.min(0.9, Math.max(0, patch.dim)) : cur.dim,
    volume: typeof patch.volume === 'number' ? Math.min(1, Math.max(0, patch.volume)) : cur.volume,
    glass: typeof patch.glass === 'boolean' ? patch.glass : cur.glass,
  }
  cfg.skin = next
  saveConfig(cfg)
  return next
}

// [问题4] 解析提示词增强用的 provider:读 ~/.dsh/settings.yaml(浅正则) + ~/.dsh/.credentials.yaml + 环境变量。
// key 只在壳进程内使用,不暴露给 renderer。
// [增强修复 2026-08] agent-default-model.provider 可能指向上游内置 provider(如 deepseek-official),
// settings.yaml 中并不存在同名段 → 旧逻辑恒 null → 409。改为候选链解析:
// 收集所有 llm-* 顶层段与其嵌套 providers 子段,按 (名字命中默认 provider > 模型目录含默认模型 > 官方缺省端点 > 文件序)
// 打分排序,/enhance 逐个候选尝试,端点 401/403/模型不存在时自动切换下一候选。
function parseEnhanceCredentialsKey(apiKeyEnv) {
  if (!apiKeyEnv) return undefined
  if (process.env[apiKeyEnv]) return process.env[apiKeyEnv]
  try {
    const creds = fs.readFileSync(path.join(DSH_HOME, '.credentials.yaml'), 'utf8')
    // 支持顶层与 refs: 缩进条目;值可带引号
    const m = new RegExp(`^\\s*${apiKeyEnv}:\\s*["']?([^"'\\s]+)["']?\\s*$`, 'm').exec(creds)
    if (m) return m[1]
  } catch { /* 无凭据文件 */ }
  return undefined
}

// 浅解析 settings.yaml 的全部 provider 块。返回 [{name, nested, apiKeyEnv, baseURL, ids[]}]
function collectEnhanceBlocks() {
  const settings = fs.readFileSync(path.join(DSH_HOME, 'settings.yaml'), 'utf8')
  const lines = settings.split(/\r?\n/)
  const blocks = []
  // 顶层段切分:行首非缩进的 llm-<name>:
  const tops = []
  for (let i = 0; i < lines.length; i++) {
    const m = /^llm-([\w-]+):\s*$/.exec(lines[i])
    if (m) tops.push({ name: m[1], start: i })
  }
  tops.forEach((top, ti) => {
    const end = ti + 1 < tops.length ? tops[ti + 1].start : lines.length
    const body = lines.slice(top.start + 1, end)
    // 段体直接字段(顶层段自带 apiKeyEnv/models 的形态,如 llm-deepseek)
    const directKeyEnv = /^\s+apiKeyEnv:\s*(\S+)/m.exec(body.join('\n'))?.[1]
    const directBase = /^\s+baseURL:\s*(\S+)/m.exec(body.join('\n'))?.[1]
    // 嵌套 providers: 行
    const provIdx = body.findIndex((l) => /^(\s+)providers:\s*$/.test(l))
    const ownBody = provIdx < 0 ? body : body.slice(0, provIdx)
    const ownIds = [...ownBody.join('\n').matchAll(/-\s*id:\s*(\S+)/g)].map((x) => x[1])
    if (directKeyEnv || ownIds.length) {
      blocks.push({ name: top.name, nested: false, apiKeyEnv: directKeyEnv, baseURL: directBase, ids: ownIds })
    }
    if (provIdx >= 0) {
      const provIndent = /^(\s+)providers:\s*$/.exec(body[provIdx])[1].length
      // 子段头:缩进深于 providers: 的 <name>: 行
      const subStarts = []
      for (let k = provIdx + 1; k < body.length; k++) {
        const sm = /^(\s+)([\w-]+):\s*$/.exec(body[k])
        if (sm && sm[1].length > provIndent) subStarts.push({ name: sm[2], indent: sm[1].length, start: k })
      }
      subStarts.forEach((sub, si) => {
        const subEnd = si + 1 < subStarts.length ? subStarts[si + 1].start : body.length
        const subLines = []
        for (let k = sub.start + 1; k < subEnd; k++) {
          const ln = body[k]
          if (ln.trim() !== '' && /^\s*/.exec(ln)[0].length <= sub.indent) break
          subLines.push(ln)
        }
        const subText = subLines.join('\n')
        blocks.push({
          name: sub.name,
          nested: true,
          apiKeyEnv: /apiKeyEnv:\s*(\S+)/.exec(subText)?.[1],
          baseURL: /baseURL:\s*(\S+)/.exec(subText)?.[1],
          ids: [...subText.matchAll(/-\s*id:\s*(\S+)/g)].map((x) => x[1]),
        })
      })
    }
  })
  return blocks
}

// 候选链:打分排序后的可用 provider 列表(有 key 有模型才入列,上限 3 个)。
// 返回 { candidates: [{name, baseURL, apiKey, model}], reason? }
// reason 仅在无候选时给出(缺默认 provider 指向 / 无任何 llm 段 / 全部缺 key 或缺模型)。
function resolveEnhanceCandidates() {
  try {
    const settings = fs.readFileSync(path.join(DSH_HOME, 'settings.yaml'), 'utf8')
    const defProv = /agent-default-model:\s*\n\s*provider:\s*(\S+)/.exec(settings)?.[1]
    const defModel = /agent-default-model:\s*\n\s*provider:[^\n]*\n\s*model:\s*(\S+)/.exec(settings)?.[1]
    const blocks = collectEnhanceBlocks()
    if (!defProv) return { candidates: [], reason: 'settings.yaml 未配置 agent-default-model.provider' }
    if (!blocks.length) return { candidates: [], reason: 'settings.yaml 无任何 llm-* provider 段' }
    const cands = []
    for (const b of blocks) {
      const apiKey = parseEnhanceCredentialsKey(b.apiKeyEnv)
      if (!apiKey) continue // 缺 key 的段跳过(可能换下一候选就能用)
      // 模型:默认模型在目录内则沿用,否则取目录第一个(避免拿目录外的模型 id 打错端点)
      const model = (defModel && b.ids.includes(defModel)) ? defModel : b.ids[0]
      if (!model) continue
      const baseURL = (b.baseURL || 'https://api.deepseek.com/v1').replace(/\/$/, '') // DeepSeek 官方缺省
      let score = 0
      if (b.name === defProv) score += 8 // 名字命中默认 provider(精确段)
      if (defModel && b.ids.includes(defModel)) score += 2 // 目录含默认模型(比"目录第一个"更贴用户意图)
      if (!b.baseURL) score += 1 // 官方缺省端点优先(第三方端点模型目录常与官方 id 不一致)
      cands.push({ name: b.name, baseURL, apiKey, model, score })
    }
    if (!cands.length) return { candidates: [], reason: `llm-* 段均缺可用 key(检查 .credentials.yaml 的 ${[...new Set(blocks.map((b) => b.apiKeyEnv).filter(Boolean))].join('/') || 'apiKeyEnv'} 条目)` }
    cands.sort((a, b2) => b2.score - a.score)
    return { candidates: cands.slice(0, 3).map(({ name, baseURL, apiKey, model }) => ({ name, baseURL, apiKey, model })) }
  } catch (e) {
    return { candidates: [], reason: `配置解析失败: ${e.message}` }
  }
}

// 兼容旧调用点(/session-summary):取打分最高的第一候选。
function resolveEnhanceProvider() {
  return resolveEnhanceCandidates().candidates[0] || null
}

// 净化增强输出:去代码块包裹/常见前导语,保证可直接回填输入框。
function sanitizeEnhanceOutput(out) {
  let t = String(out).trim()
  const fence = /^```[\w-]*\s*\n([\s\S]*?)\n?```\s*$/m.exec(t)
  if (fence) t = fence[1].trim()
  t = t.replace(/^(?:优化后的?提示词|改写后的?提示词|Enhanced\s+prompt|Rewritten\s+prompt|Improved\s+prompt)\s*[:：]\s*/i, '')
  return t.trim()
}

// 模型不存在的错误指纹(不同端点措辞):命中则切换下一候选而非直接报错。
function isModelMissingError(status, text) {
  if (status !== 404 && status !== 400) return false
  return /model[_ ]?not[_ ]?(found|exist)|does not exist|invalid model|unknown model|模型不存在|无效模型/i.test(text)
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
      // ---------- [问题4] 提示词增强:读 dsh provider 配置代理 LLM 调用(key 不进 renderer) ----------
      // [增强修复 2026-08] 候选链:默认 provider 指向上游内置段(无同名 llm-* 段)时不再恒 409,
      // 按打分候选逐个尝试;端点模型不存在/鉴权失败自动切下一候选。
      if (req.method === 'POST' && url.pathname === '/enhance') {
        let body = ''
        for await (const chunk of req) body += chunk
        const { text, context } = JSON.parse(body || '{}')
        if (typeof text !== 'string' || !text.trim()) return send(400, { ok: false, error: '输入为空' })
        if (text.length > 16000) return send(400, { ok: false, error: '文本过长(上限 16000 字符)' })
        const { candidates, reason } = resolveEnhanceCandidates()
        if (!candidates.length) {
          log(`[enhance] 无可用 provider: ${reason}`)
          return send(409, { ok: false, error: `未找到可用的模型 provider: ${reason}` })
        }
        // 结构化改写模板:保原意保语言,不虚构;可选会话/工作区上下文并入背景。
        const ctxLine = (typeof context === 'string' && context.trim())
          ? `\n当前会话/工作区上下文(仅作背景参考,不得据此虚构用户未提及的需求):${context.trim().slice(0, 300)}`
          : ''
        const sys = `你是提示词优化助手。将用户给出的提示词改写为清晰、具体、结构化的版本。
改写规则:
1. 完整保留用户原意与原语言(中文输入输出中文,英文输入输出英文);不得虚构用户未提及的事实或需求。
2. 按以下结构组织(无相关内容的部分可省略):
## 目标
## 背景与上下文
## 要求与约束
## 输出格式
3. 把模糊指代改明确,补全可执行的验收标准;控制篇幅,避免无信息量的套话。${ctxLine}
4. 只输出优化后的提示词正文:不要解释、前言、总结,不要用代码块包裹。`
        let lastErr = null
        for (const prov of candidates) {
          const ac = new AbortController()
          const timer = setTimeout(() => ac.abort(), 60000) // 思考模型输出慢,45s 偶发截断 → 60s
          try {
            const r = await fetch(`${prov.baseURL}/chat/completions`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${prov.apiKey}` },
              body: JSON.stringify({
                model: prov.model,
                messages: [{ role: 'system', content: sys }, { role: 'user', content: text }],
                temperature: 0.3,
                max_tokens: 4096, // 思考模型先耗推理 token,预算不足会空输出(实测 80 必空)
                stream: false,
              }),
              signal: ac.signal,
            })
            if (!r.ok) {
              const errText = (await r.text()).slice(0, 300)
              log(`[enhance] ${prov.name}/${prov.model} HTTP ${r.status}: ${errText.slice(0, 120)}`)
              // 模型不存在/鉴权失败 → 换下一候选;其余(限流/服务端)直接报错避免叠加延迟。
              if (isModelMissingError(r.status, errText) || r.status === 401 || r.status === 403) {
                lastErr = `provider HTTP ${r.status}: ${errText}`
                continue
              }
              return send(502, { ok: false, error: `provider HTTP ${r.status}: ${errText}` })
            }
            const data = await r.json()
            const out = sanitizeEnhanceOutput(data?.choices?.[0]?.message?.content ?? '')
            if (!out) {
              // 空输出多为思考模型 token 预算耗尽;换候选重试一次而非直接失败。
              log(`[enhance] ${prov.name}/${prov.model} 返回空内容`)
              lastErr = 'provider 返回空内容'
              continue
            }
            return send(200, { ok: true, text: out, provider: prov.name })
          } catch (e) {
            const msg = e.name === 'AbortError' ? '增强超时(60s)' : `请求失败: ${e.message}`
            log(`[enhance] ${prov.name}/${prov.model} ${msg}`)
            // 超时/网络故障直接报错(下一候选大概率同样慢);其余异常换候选。
            if (e.name !== 'AbortError') { lastErr = msg; continue }
            return send(502, { ok: false, error: msg })
          } finally { clearTimeout(timer) }
        }
        return send(502, { ok: false, error: `全部候选 provider 失败: ${lastErr || '未知错误'}` })
      }
      // ---------- [需求] 目录选择器盘符列表:Windows 逐字母探测存在性(24H2 已移 wmic,不依赖外部命令) ----------
      // 非 Windows 返空数组(POSIX 无盘符概念,前端不渲染盘符行)。
      if (req.method === 'GET' && url.pathname === '/drives') {
        if (process.platform !== 'win32') return send(200, { ok: true, drives: [] })
        const drives = []
        for (let i = 65; i <= 90; i++) { // A-Z
          const root = String.fromCharCode(i) + ':\\'
          try { if (fs.existsSync(root)) drives.push(String.fromCharCode(i) + ':') } catch { /* 不可读卡(A:软驱等)跳过 */ }
        }
        return send(200, { ok: true, drives })
      }
      // ---------- [R44] 侧边栏浏览器代理:剥离 X-Frame-Options/CSP frame-ancestors 使页面可嵌 iframe ----------
      // electronNet 走 Chromium 网络栈(遵循系统代理,代理环境下直连 node:http 常失败)。
      // 只过 HTML/文本类内容;二进制(图片/视频)透传。不做 URL 白名单——本地工具自负责。
      if (req.method === 'GET' && url.pathname === '/browse') {
        const target = url.searchParams.get('url')
        if (!target || !/^https?:\/\//i.test(target)) return send(400, { ok: false, error: '需要 http(s) url 参数' })
        try {
          const upstream = await electronNet.fetch(target, { redirect: 'follow', signal: AbortSignal.timeout(25_000) })
          const body = Buffer.from(await upstream.arrayBuffer())
          res.writeHead(upstream.status >= 400 ? 502 : 200, {
            ...base,
            'Content-Type': upstream.headers.get('content-type') || 'application/octet-stream',
            'Cache-Control': 'no-store',
            // 不转发 X-Frame-Options / CSP,使内容可被壳内 iframe 嵌入
          })
          res.end(body)
        } catch (e) {
          return send(502, { ok: false, error: `拉取失败: ${e.message}` })
        }
        return
      }
      // ---------- [问题 48] 会话智能摘要:首轮对话完成后生成 ≤20 字摘要,侧栏会话行副标题显示 ----------
      // 缓存于 ~/.dsh/session-summaries.json(sessionId → 摘要),每会话只生成一次。
      if (req.method === 'GET' && url.pathname === '/session-summaries') {
        let summaries = {}
        try { summaries = JSON.parse(fs.readFileSync(SUMMARY_FILE, 'utf8')) } catch { /* 首次无缓存 */ }
        return send(200, { ok: true, summaries })
      }
      if (req.method === 'POST' && url.pathname === '/session-summary') {
        let body = ''
        for await (const chunk of req) body += chunk
        const { sessionId, text } = JSON.parse(body || '{}')
        if (typeof sessionId !== 'string' || !sessionId) return send(400, { ok: false, error: '缺 sessionId' })
        if (typeof text !== 'string' || !text.trim()) return send(400, { ok: false, error: '内容为空' })
        let cache = {}
        try { cache = JSON.parse(fs.readFileSync(SUMMARY_FILE, 'utf8')) } catch { /* 首次 */ }
        if (cache[sessionId]) return send(200, { ok: true, summary: cache[sessionId], cached: true })
        const prov = resolveEnhanceProvider()
        if (!prov) {
          log('[summary] 未找到可用 provider')
          return send(409, { ok: false, error: '未找到可用的模型 provider' })
        }
        const sys = '你是会话摘要助手。根据会话首轮内容生成不超过 20 字的摘要,点明核心主题;内容中文则输出中文,英文则输出英文;只输出摘要正文,不要引号、标点结尾、前缀或解释。'
        const ac = new AbortController()
        const timer = setTimeout(() => ac.abort(), 30000)
        try {
          const r = await fetch(`${prov.baseURL}/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${prov.apiKey}` },
            body: JSON.stringify({
              model: prov.model,
              messages: [{ role: 'system', content: sys }, { role: 'user', content: text.slice(0, 3000) }],
              temperature: 0.2,
              max_tokens: 2048, // 推理模型先消耗推理 token,过小会致 content 空(实测 80 必空;与 /enhance 一致)
              stream: false,
            }),
            signal: ac.signal,
          })
          if (!r.ok) {
            const errText = (await r.text()).slice(0, 200)
            log(`[summary] provider HTTP ${r.status}: ${errText.slice(0, 120)}`)
            return send(502, { ok: false, error: `provider HTTP ${r.status}` })
          }
          const data = await r.json()
          const out = data?.choices?.[0]?.message?.content
          if (typeof out !== 'string' || !out.trim()) {
            log('[summary] provider 返回空内容')
            return send(502, { ok: false, error: 'provider 返回空内容' })
          }
          const summary = out.trim().replace(/^["'“”\s]+/, '').replace(/["'“”。.!！\s]+$/, '').slice(0, 30)
          cache[sessionId] = summary
          try { fs.writeFileSync(SUMMARY_FILE, JSON.stringify(cache, null, 1)) } catch (e) { log(`[summary] 缓存写入失败: ${e.message}`) }
          log(`[summary] ${sessionId.slice(0, 8)}… → ${summary}`)
          return send(200, { ok: true, summary })
        } catch (e) {
          const msg = e.name === 'AbortError' ? '摘要超时(30s)' : `请求失败: ${e.message}`
          log(`[summary] ${msg}`)
          return send(502, { ok: false, error: msg })
        } finally { clearTimeout(timer) }
      }
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
  // 本地补丁自动重放:插件经 pnpm 更新覆盖 node_modules 后,壳启动即恢复全部本地定制
  // (better-sidebar 浮动卡片/底部面板剔除 + node-nav 左侧圆点导航),失败仅告警不阻断启动。
  try {
    const r = replayLocalPatches((l) => log(l))
    if (!r.ok) notify('DeepSeek Harness', '本地插件补丁重放失败,详见日志(桌面日志目录)。')
  } catch (e) { log(`补丁重放异常: ${e.message}`) }
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

// CDP 调试端口(仅 127.0.0.1):壳内页面与浏览器渲染路径不同(UA+dshDesktop 桥),
// 壁纸/布局类问题需直接检查壳内 DOM。CDP 端口被占用时静默跳过(不影响启动)。
app.commandLine.appendSwitch('remote-debugging-port', '9333')

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
