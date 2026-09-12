// dsh-desktop 主进程 v0.5.15
// v0.1 Electron 壳 | v0.2 启动页+崩溃自愈 | v0.3 多窗口+dsh版本锁+dsh更新+壳自更新+全中文菜单
// v0.5.14 [q195] 启动/重启提速:主题闸门硬超时兜底(探针延迟架空 deadline 实测揭窗 +5-6.5s→≤2s)/
//        boot 复用路径先探测后重放(补丁重放移出复用关键路径)/重启分段计时日志/预热补 node.exe 本体
// v0.5.15 [q196 2026-09-05] 启动白屏治理:揭窗闸门改「应用内容真实挂载」探测——旧 2s 硬兜底在
//        服务就绪即揭窗,而页面还要走 401 信任页→白底加载页→应用挂载→主题落位(实测 10s+),
//        用户直面长白屏。改为 #root 挂载+主题在位才揭窗,主题迟到宽限 4s,硬兜底 20s;
//        等待期关渲染节流;splash 增「正在加载界面…」阶段,'ready' 移至揭窗节拍触发
// v0.5.18 [q197 2026-09-12 启动提速] ①信任 URL 捕获重载改条件触发:printUrl 行要等 dsh
//        插件树加载完才打印(实测晚于端口就绪 6-10s),而信任签名密钥持久、cookie 按
//        authority 长期有效——裸 URL 首载通常已认证并在挂载,原无条件整页重载把在途挂载
//        作废(实测揭窗 13-16.6s,重载占 ~8s)。改探针甄别:仅 401 文本页才重载种 cookie。
//        ②spawn 路径补丁重放去重:boot 与 startDsh 原各全量重放一次,startDsh 增 skipReplay。
//        ③启动分段计时日志(whenReady/重放耗时)。
// v0.5.18 [启动页拖动] splash 全窗 -webkit-app-region: drag(无边框窗此前不可移动),
//        鲸鱼画布/字标 no-drag 保住 T10/T11 粒子与流光交互。
// v0.5.17 [插件兼容预检] dsh 更新前评估已启用插件的 peerDependencies/engines.dsh 声明与新版将
//        携带的 @deepseek-ai/dsh* 子包版本(引擎 dsh-plugin-compat.cjs;npx 缓存树(三层并集,
//        兼容 npm 扁平与 pnpm 虚拟仓库)/packument 双源),范围无交集列清单交用户确认后才放行
//        (Web UI 内联确认块 + 壳设置窗二次对话框);检查失败/声明缺失一律放行,绝不挡更新
// v0.5.0 联合工作区里程碑:dsh 运行时双轨切换(official npx/缓存路径 ↔ local 本地构建 bin.js)
// v0.5.1 双轨切换进设置(壳设置窗口 Ctrl+, + Web UI 更新区;切换失败自动回滚)+ 联合工作区灰度开关(仅本地轨可写)
// v0.5.2 便携版 local 轨修复:默认探测补 PORTABLE_EXECUTABLE_DIR 锚点(0.5.1 打包态探测恒 null
//        ⇒ local 恒回退官方、联邦开关置灰)+ DSH_LOCAL_DIR 环境变量覆盖
// dsh 运行时经 npx 调用(PATH→注册表),版本锁与 dshRuntime 存于 ~/.dsh/desktop-config.json,插件化零破坏。
const { app, BrowserWindow, Tray, Menu, dialog, Notification, shell, ipcMain, net: electronNet, session } = require('electron')
const SHELL_T0 = Date.now() // [q197] 启动分段计时锚点:模块加载→whenReady→spawn→就绪→揭窗
const { spawn, spawnSync } = require('node:child_process')
const net = require('node:net')
const http = require('node:http')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
// [问题99 2026-08-23] 补丁重放器单一事实来源:优先加载 ~/.dsh/patches.cjs(壳外部署面,
// 升级重放器无需重建/重新部署 asar),不存在或损坏时回退 asar 内嵌副本。
// 背景:运行中壳曾从 Temp 目录的旧 asar 启动(8-21 02:55 构建,内嵌 0.13 时代锚点),
// 壳每次启动旧重放器对 0.15.1 全 FAIL 后按「还原 base」设计把新补丁整体抹掉——
// 侧边栏显示/入口随机回退原生形态且修复后复发的直接元凶。哨兵机制(见 patches.cjs)
// 已让新旧副本互不误伤,本通道再把「更新重放器必须重建 asar」这一结构根因消除。
let replayLocalPatches
try {
  replayLocalPatches = require(path.join(os.homedir(), '.dsh', 'patches.cjs')).replayAll
} catch {
  replayLocalPatches = require('./patches.cjs').replayAll
}
// [q194 2026-09-04] 每次调用重读 ~/.dsh/patches.cjs:壳是长驻进程,require 缓存会把
// 启动时的旧重放器留在内存,patches.cjs 的后续编辑(新补丁段/新适配)会被守护线程与
// 重启流程按旧链覆盖回去(v2→v1 实证)。重读失败回退启动时缓存。
function loadFreshReplayer() {
  try {
    const patchesPath = path.join(os.homedir(), '.dsh', 'patches.cjs')
    delete require.cache[require.resolve(patchesPath)]
    return require(patchesPath).replayAll
  } catch {
    return replayLocalPatches
  }
}

// [问题99] 补丁守护:周期性幂等重放,覆盖「壳运行期间外部覆盖产物」的窗口
// (市场安装/更新/卸载、CLI pnpm 对账、手工操作)。哨兵快速通道保证已补丁态零写盘;
// 日志只在 ok 状态翻转与 FAIL 明细时输出,避免刷屏。unref 不阻碍进程退出。
// [P1/E1 2026-09-10] mtime 预检:每轮先比对指示文件(patches.cjs + profile 包账本/
// 锁文件/守护行)的 mtime+size 快照,全部未变 → 跳过本轮重放——省 ~200 个目标文件
// 的 readFileSync(含数 MB 级 bundle 副本)与 282KB 重放器重解析。市场装卸/pnpm
// 对账/补丁链更新都会先触碰指示文件,检测能力不受损;每 10 轮(~7.5 分钟)强制
// 全量重放兜底,覆盖「同版本重装/手工改 lib 产物」等不触碰指示文件的罕见路径;
// 重放失败不更新快照,下一轮立即全量重试。stat 失败(X)视同变化走全量。
function startPatchGuardian(intervalMs = 45_000) {
  let lastOk = null
  let lastSig = null
  let tickCount = 0
  const indicator = (p) => { try { const s = fs.statSync(p); return `${s.mtimeMs}:${s.size}` } catch { return 'X' } }
  const guardianSignature = () => [
    indicator(path.join(os.homedir(), '.dsh', 'patches.cjs')),
    indicator(path.join(DSH_HOME, 'profiles', 'web', 'package.json')),
    indicator(path.join(DSH_HOME, 'profiles', 'web', 'pnpm-lock.yaml')),
    indicator(path.join(DSH_HOME, 'profiles', 'web', 'cordis.patch.yml')),
  ].join('|')
  const timer = setInterval(() => {
    try {
      tickCount += 1
      const sig = guardianSignature()
      if (lastOk === true && lastSig === sig && tickCount % 10 !== 0) return
      // [q194 2026-09-04] 守护每次重读最新重放器(否则 require 缓存旧链会把新补丁覆盖回去)
      const r = loadFreshReplayer()(() => {})
      if (r.ok) lastSig = sig
      if (r.ok !== lastOk) {
        log(`[patch-guardian] 状态翻转 ok=${r.ok}(外部覆盖后自动重放恢复或存在失配)`)
        lastOk = r.ok
      }
      if (!r.ok) for (const it of r.items) if (!it.ok) log(`[patch-guardian] FAIL ${it.file}: ${(it.failures || []).join('; ')}`)
    } catch (e) { log(`[patch-guardian] 异常: ${e.message}`) }
  }, intervalMs)
  if (timer.unref) timer.unref()
  return timer
}

const DSH_PORT = 3080
const DSH_URL = `http://127.0.0.1:${DSH_PORT}`
// [问题126] 0.1.2-alpha.5 起 Web 面板启用浏览器信任栅栏:无 token 的 GET / 返回 401
// (带 ?token= 返回 303 并种信任 cookie,token 跨启动稳定)。启动行 printUrl 携带
// 带 token 的规范 URL,在此捕获,所有窗口加载经 dshUrl() 走它;rc.7- 无此行,回退裸 URL。
let dshWebUrl = null
let dshUrlReloadTimer = null
function dshUrl() { return dshWebUrl || DSH_URL }
const START_TIMEOUT_MS = 120_000 // 首次 npx 需下载包,给足时间
const SWITCH_TIMEOUT_MS = 60_000 // 版本切换的就绪预算,超时自动回滚
const DSH_HOME = path.join(os.homedir(), '.dsh')
const LOG_DIR = path.join(DSH_HOME, 'logs')
const LOG_FILE = path.join(LOG_DIR, 'desktop.log')
const CONFIG_FILE = path.join(DSH_HOME, 'desktop-config.json')
const SUMMARY_FILE = path.join(DSH_HOME, 'session-summaries.json')
const DEFAULT_DSH_VERSION = '0.1.0-rc.6' // 锁定到当前验证过的版本
const MIN_PUBLIC_DSH_VERSION = '0.1.0-rc.6' // 此前版本发布时 @deepseek-ai/* 依赖族未公开,今日 npx 已装不完整,一律不展示
// [问题78] dsh 下载/安装固定官方发布源:@deepseek-ai/dsh 由 DeepSeek 社区 Harness 官方
// 发布到 npm 公共注册表(官方 README 安装方式即 npx @deepseek-ai/dsh web)。用户级
// npm 配置常指向第三方镜像——镜像曾致 npm idealTree 解析预发布范围卡死、元数据
// 逐包再验证奇慢,属不可靠拉取源。下载/安装各环节显式 --registry 固定官方源,
// 不随用户 npm 配置漂移。
// [问题125] 版本清单「查询」改走 HTTP 三级降级(官方 → 镜像 → 镜像直连),不再依赖
// npm.cmd 子进程:npm 不认 Windows 系统代理(只认 HTTP(S)_PROXY/.npmrc proxy),
// 代理环境下直连官方源时通时断,曾致设置页「npm 查询失败」。electronNet.fetch 走
// Chromium 网络栈、遵循系统代理,与壳 GitHub 检查同源。镜像仅用于读取版本元数据,
// 下载/安装仍固定官方源。
const DSH_REGISTRY = 'https://registry.npmjs.org'
const DSH_REGISTRY_MIRROR = 'https://registry.npmmirror.com'
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
// [问题121] 重启冷却:restartDsh 落定时刻由包装层维护。08-30 实测连跑双重启——
// 第 1 次就绪后 0.46s 第 2 次触发把刚拉起的服务又杀掉重跑,进度表现为
// 92%→100%→回退重爬→100%。服务刚重启过的窗口期内重复触发没有增量价值,直接吸收。
let lastRestartSettledAt = 0
const RESTART_COOLDOWN_MS = 3000

// ---------- 配置(dsh 版本锁) ----------

function loadConfig() {
  try {
    const raw = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'))
    // [v0.5.0] 放宽到「含合法 dshVersion 或声明 dshRuntime」即整文件生效,
    // 并始终补齐 dshVersion 默认值——否则仅切换运行时而未带版本锁的用户配置
    // 会被整体丢弃,dshRuntime 也随之失效。
    if (raw && typeof raw === 'object' && !Array.isArray(raw)
      && ((typeof raw.dshVersion === 'string' && raw.dshVersion.length > 0) || typeof raw.dshRuntime === 'string')) {
      return { dshVersion: DEFAULT_DSH_VERSION, ...raw }
    }
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

// [P3/T4-1 2026-09-12] [dsh] 子进程 stdout/stderr 日志合批:async 追加保序。
// 原 log() 每次调用 appendFileSync 同步落盘;会话进行时核心服务若频繁打印,
// 主进程同步 IO 尖峰会拖慢全部窗口的输入响应(主进程负责 OS 级与输入分发,
// P3 方案 §三.R1/§四.A5)。合批 500ms 单次异步追加,行内容与行序不变;
// 关键行(启动 URL 捕获等)仍走同步 log() 立即落盘,两类行之间时序可能交错(可接受)。
let dshLogBuf = []
let dshLogTimer = null
let dshLogDirReady = false
let dshLogChain = Promise.resolve()
function dshLog(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`
  console.log(line)
  dshLogBuf.push(line)
  if (dshLogTimer) return
  dshLogTimer = setTimeout(() => {
    dshLogTimer = null
    const text = dshLogBuf.join('\n') + '\n'
    dshLogBuf = []
    try {
      if (!dshLogDirReady) { fs.mkdirSync(LOG_DIR, { recursive: true }); dshLogDirReady = true }
    } catch { return }
    dshLogChain = dshLogChain.then(() => fs.appendFile(LOG_FILE, text)).catch(() => {})
  }, 500)
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
    await sleep(100) // [R74] dsh 编译缓存后 spawn→listen ~2s;细粒度轮询把检测延迟压进 100ms
  }
  return false
}

/** 等端口真正释放(kill 后旧 socket 可能短暂残留,防 EADDRINUSE 竞态)。 */
async function waitForPortFree(timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (!(await isPortUp())) return true
    await sleep(60)
  }
  return false
}

/** HTTP 就绪确认:TCP listen 后 dsh 几乎立即 200(实测 0.03s),但冷启动保险起见确认一次。 */
function isHttpOk() {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port: DSH_PORT, path: '/', timeout: 2000 }, (res) => {
      res.resume()
      // [问题126] alpha.5 信任栅栏:无 token GET / 返回 401(带 token 303)。
      // 收到任何 HTTP 响应即证明 Web 服务在位,不再强求 200。
      resolve(res.statusCode === 200 || res.statusCode === 401 || (res.statusCode >= 300 && res.statusCode < 400))
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

// [R74] npx/node 解析记忆化:spawnSync('where')/reg query 单次 50-150ms,而启动链
// (startDsh→resolveDshRuntime→resolveNodeExe→resolveNpxCommand、快速路径二连、
// npmView/probe)每次都重复解析;解析结果在进程生命周期内不变,模块级缓存即可。
let npxCmdMemo // undefined=未解析,否则为 string|null
function resolveNpxCommand() {
  if (npxCmdMemo !== undefined) return npxCmdMemo
  const where = spawnSync('where', ['npx.cmd'], { encoding: 'utf8', windowsHide: true })
  if (where.status === 0 && where.stdout && where.stdout.trim()) {
    npxCmdMemo = where.stdout.trim().split(/\r?\n/)[0]
    return npxCmdMemo
  }
  for (const hive of ['HKLM', 'HKCU']) {
    const reg = spawnSync('reg', ['query', `${hive}\\SOFTWARE\\Node.js`, '/v', 'InstallPath'],
      { encoding: 'utf8', windowsHide: true })
    if (reg.status === 0 && reg.stdout) {
      const line = reg.stdout.split(/\r?\n/).find((l) => l.includes('InstallPath') && l.includes('REG_SZ'))
      if (line) {
        const installPath = line.split('REG_SZ')[1].trim()
        const npx = path.join(installPath, 'npx.cmd')
        if (fs.existsSync(npx)) { npxCmdMemo = npx; return npx }
      }
    }
  }
  npxCmdMemo = null
  return npxCmdMemo
}

// [问题55] 解析 node.exe:优先 npx 同目录,否则注册表 InstallPath。供绕过 npx 直启用。
let nodeExeMemo // undefined=未解析,否则为 string|null
function resolveNodeExe() {
  if (nodeExeMemo !== undefined) return nodeExeMemo
  const npx = resolveNpxCommand()
  if (npx) {
    const cand = path.join(path.dirname(npx), 'node.exe')
    if (fs.existsSync(cand)) { nodeExeMemo = cand; return cand }
  }
  for (const hive of ['HKLM', 'HKCU']) {
    const reg = spawnSync('reg', ['query', `${hive}\\SOFTWARE\\Node.js`, '/v', 'InstallPath'],
      { encoding: 'utf8', windowsHide: true })
    if (reg.status === 0 && reg.stdout) {
      const line = reg.stdout.split(/\r?\n/).find((l) => l.includes('InstallPath') && l.includes('REG_SZ'))
      if (line) {
        const cand = path.join(line.split('REG_SZ')[1].trim(), 'node.exe')
        if (fs.existsSync(cand)) { nodeExeMemo = cand; return cand }
      }
    }
  }
  nodeExeMemo = null
  return nodeExeMemo
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

// [v0.5.0] 双轨:本地构建运行时目录的默认探测。
// 源码仓交付路线 = 本地构建 + 壳双轨切换;兄弟仓布局为
// <工作区>/dsh-desktop 与 <工作区>/deepseek-harness 并列,安装版/便携版被
// 移动后向上最多三层仍找不到 bin.js 时返回 null(随后由 resolveDshRuntime
// 记日志回退官方路径)。显式 dshLocalDir 配置优先于本默认值。
// [v0.5.2] 便携版打包态 process.execPath 指向 Temp 解压目录、__dirname 在
// asar 内,两者向上都够不着工作区 ⇒ 默认探测恒 null、local 轨永远回退官方
// (0.5.1 实测,联邦开关因此置灰)。补两类锚点:electron-builder 便携版的
// PORTABLE_EXECUTABLE_DIR(真实 exe 所在目录,随启动注入)与 DSH_LOCAL_DIR
// 环境变量(安装版/非常规布局的显式覆盖,优先级最高)。
function resolveDefaultLocalDir() {
  if (process.env.DSH_LOCAL_DIR) return process.env.DSH_LOCAL_DIR
  const anchors = app.isPackaged
    ? [process.env.PORTABLE_EXECUTABLE_DIR, path.dirname(process.execPath), __dirname]
    : [__dirname]
  try {
    for (const anchor of [...new Set(anchors)]) {
      let dir = anchor
      for (let i = 0; i < 3; i++) {
        const candidates = [
          path.join(dir, 'deepseek-harness', 'apps', 'cli', 'lib'),
          path.join(dir, 'apps', 'cli', 'lib'),
        ]
        for (const cand of candidates) {
          if (fs.existsSync(path.join(cand, 'bin.js'))) return cand
        }
        dir = path.dirname(dir)
      }
    }
  } catch { /* 探测失败按缺失处理 */ }
  return null
}

const DEFAULT_LOCAL_DIR = resolveDefaultLocalDir()

/**
 * 解析本次启动使用的 dsh 运行时来源(v0.5.0 双轨)。
 * 'official'(缺省)沿用 npx/缓存快速路径,行为不变;'local' 直接执行本地构建
 * 目录(dshLocalDir 或探测到的兄弟仓 apps/cli/lib)下的 bin.js。任一能力探测
 * 失败(bin 缺失/node.exe 解析不到)都记 desktop.log breadcrumb 并折叠回
 * official——回滚仅需把配置改回 official。
 * @param {{ dshRuntime?: string, dshLocalDir?: string }} config - 壳配置(desktop-config.json 载入态)。
 * @param {{ quiet?: boolean }} [opts] - quiet=true 静默模式:状态轮询等只读调用
 *   不写 breadcrumb 日志(否则每次轮询刷屏);启动路径不传,失败必留痕。
 * @returns {{ mode: 'official'|'local', fallback?: boolean, node?: string, bin?: string }}
 */
function resolveDshRuntime(config = cfg, opts = {}) {
  const quiet = !!opts.quiet
  if ((config.dshRuntime ?? 'official') !== 'local') return { mode: 'official' }
  const dir = (typeof config.dshLocalDir === 'string' && config.dshLocalDir.trim()) ? config.dshLocalDir.trim() : DEFAULT_LOCAL_DIR
  const bin = dir ? path.join(dir, 'bin.js') : null
  if (!bin || !fs.existsSync(bin)) {
    if (!quiet) log(`[dshRuntime] local runtime missing at ${bin ?? String(dir)}; falling back to official`)
    return { mode: 'official', fallback: true }
  }
  const node = resolveNodeExe()
  if (!node) {
    if (!quiet) log('[dshRuntime] node.exe unresolvable(PATH 与注册表均失败); falling back to official')
    return { mode: 'official', fallback: true }
  }
  return { mode: 'local', node, bin }
}

// [R74] dsh 子进程 Node 编译缓存:node≥22.1 磁盘级 V8 compile cache。实测对本机
// dsh 的 ESM 模块树覆盖有限(整个 boot 只落 1 个引导文件),属机会性收益(node
// 升级扩大 ESM 覆盖后自动受益);真正的启动波动治理见下方文件预热。
// 三种拉起形态(快速路径 node 直跑/local 轨/npx 经 cmd)统一经 env 注入。
const NODE_COMPILE_CACHE_DIR = path.join(DSH_HOME, 'cache', 'node-compile')
function dshSpawnEnv() {
  try { fs.mkdirSync(NODE_COMPILE_CACHE_DIR, { recursive: true }) } catch { /* 目录建不出时 node 侧静默禁用 */ }
  return { ...process.env, NODE_COMPILE_CACHE: NODE_COMPILE_CACHE_DIR }
}

// ---------- [R74] 文件缓存预热:治 dsh 启动波动的根 ----------
// dsh boot(spawn→listen 稳态 ~1.8s)的波动(实测可到 3.8s+)来自 250+ 包 js
// 文件的磁盘冷读与 Defender 实时扫描;托盘重启常发生在壳空闲数小时后,文件
// 已被系统缓存逐出。就绪后后台把运行时树顺序读一遍(限量),内容顶进系统
// 文件缓存,下次 spawn 的模块加载全程热读。纯 IO 异步低优先,不阻塞主流程。
let preheating = false
const PREHEAT_MAX_BYTES = 96 * 1024 * 1024
function preheatDshFiles() {
  if (preheating || quitting) return
  const roots = new Set()
  const binJs = resolveCachedDshBin() // official 快速路径:<npx哈希>/node_modules/@deepseek-ai/dsh/lib/bin.js
  if (binJs) {
    const pkgRoot = path.dirname(path.dirname(binJs)) // .../@deepseek-ai/dsh
    roots.add(path.dirname(path.dirname(pkgRoot))) // .../node_modules 的宿主哈希目录
  }
  const runtime = resolveDshRuntime(cfg, { quiet: true }) // local 轨:构建产物 lib/
  if (runtime.mode === 'local' && runtime.bin) roots.add(path.dirname(runtime.bin))
  if (!roots.size) return
  preheating = true
  ;(async () => {
    const t0 = Date.now()
    let files = 0, bytes = 0
    let budget = PREHEAT_MAX_BYTES
    const walk = async (dir) => {
      if (budget <= 0 || quitting) return
      let items
      try { items = await fs.promises.readdir(dir, { withFileTypes: true }) } catch { return }
      for (const it of items) {
        if (budget <= 0 || quitting) return
        const p = path.join(dir, it.name)
        if (it.isDirectory()) {
          if (it.name === '.bin' || it.name === '.git' || it.name === 'test' || it.name === 'tests' || it.name === 'docs' || it.name === 'examples') continue
          await walk(p)
        } else if (it.isFile() && /\.(js|mjs|cjs|json|node)$/i.test(it.name) && !/\.d\.ts$/i.test(it.name)) {
          try {
            const st = await fs.promises.stat(p)
            if (st.size > 8 * 1024 * 1024 || st.size > budget) continue
            budget -= st.size
            await fs.promises.readFile(p) // 内容进系统缓存;fs 线程池执行,不占主线程
            files += 1
            bytes += st.size
          } catch { /* 文件消失/占用,跳过 */ }
        }
      }
    }
    for (const root of roots) await walk(root)
    // [q195 2026-09-05] node.exe 本体也预热:walk 白名单只收 js/mjs/cjs/json/node,
    // 而 spawn 冷读 ~80MB 的 node.exe 二进制是壳空闲数小时后重启变慢的隐形项
    // (缓存逐出后 node 启动+Defender 扫描都卡在冷读上)。单独读取,不计文件预算。
    try {
      const nodeExe = resolveNodeExe()
      if (nodeExe) {
        const st = await fs.promises.stat(nodeExe)
        await fs.promises.readFile(nodeExe)
        files += 1
        bytes += st.size
      }
    } catch { /* 读取失败不影响预热主流程 */ }
    preheating = false
    log(`[预热] dsh 运行时文件已读入系统缓存: ${files} 个文件 ${(bytes / 1048576).toFixed(1)}MB,耗时 ${((Date.now() - t0) / 1000).toFixed(1)}s`)
  })().catch(() => { preheating = false })
}
// 触发点:启动/重启/自动恢复就绪后 5s 起跑;之后每 10 分钟补一次(文件已被
// 缓存时只是 RAM 读,开销可忽略),对冲长时间空闲后的缓存逐出。
function schedulePreheat() { setTimeout(preheatDshFiles, 5_000) }
function startPreheatLoop() { schedulePreheat(); const t = setInterval(preheatDshFiles, 600_000); if (t.unref) t.unref() }

function startDsh({ skipReplay = false } = {}) {
  // [问题88] 每次启动 dsh 前重放本地补丁守护:市场更新/外部整写可能在壳运行期改掉
  // profile patch 禁用行(如 web-ui-better-sidebar 去重守护,问题53/70),服务级重启
  // (托盘重启、自动恢复)不经过 boot() 的重放,会带着坏 patch 直接 crash loop。
  // 此处重放幂等(.bak 链自愈),自动恢复迭代时还能当场修复被改写的守护行。
  // [q197] boot 的 spawn 路径刚在数行之前全量重放过,传 skipReplay 跳过这份重复
  // (2×372KB 重放器重解析+全量目标扫描);托盘重启/自动恢复/版本切换仍走默认重放。
  if (!skipReplay) {
    try {
      const r = loadFreshReplayer()((l) => log(l))
      if (!r.ok) log('补丁重放存在 FAIL(不阻断启动,详见上方日志)')
    } catch (e) { log(`补丁重放异常: ${e.message}`) }
  }
  // [v0.5.0] 双轨解析:'local' 直跑本地构建 bin.js;'official'(含能力探测失败折返)
  // 保持 npx 快速路径既有语义原样——环境注入/版本锁旁路/补丁重放均不变。
  const runtime = resolveDshRuntime(cfg)
  if (runtime.fallback) log('[dshRuntime] 本次按 official 启动(上方 breadcrumb 已留痕)')
  let cmd, args
  if (runtime.mode === 'local') {
    // 本仓 CLI 无 --no-open(该 flag 官方 rc.8 才引入),web 不自动开浏览器。
    // --expose-internals:本仓 web 组合含 cordis-plugin-hmr,vendor/hmr 构造期硬性
    // 要求该 node flag(v0.5.0 部署批实测:缺它 boot 必崩);仅 local 轨附加,
    // official 轨的 npx 树由其自身装配处理,不受影响。
    cmd = runtime.node
    args = ['--expose-internals', runtime.bin, 'web']
    log(`启动 dsh(本地构建): ${cmd} ${args.join(' ')}`)
  } else {
    // [问题55] 快速路径:npx 缓存命中锁定版本 → 直接 node bin.js web,省去 npx 包装层
    const binJs = resolveCachedDshBin()
    const nodeExe = binJs ? resolveNodeExe() : null
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
  }
  dshChild = spawn(cmd, args, {
    cwd: os.homedir(),
    windowsHide: true, // 隐藏 npx 控制台窗口,日志走文件
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
    env: dshSpawnEnv(), // [R74] 编译缓存:模块编译提速(托盘重启+冷启动共同大头)
  })
  const childRef = dshChild
  let stdoutTail = ''
  log(`dsh 子进程 pid=${dshChild.pid}`)
  dshChild.stdout.on('data', (d) => {
    // [问题126] 捕获启动行里的带 token URL(跨 data 分块,用尾部缓冲保证行完整)
    stdoutTail = ((stdoutTail || '') + String(d)).slice(-2000)
    const m = stdoutTail.match(/dsh web: (http:\/\/[^\s"'`]+[?&]token=[^\s"'`]+)/)
    if (m && dshWebUrl !== m[1]) {
      dshWebUrl = m[1]
      log('已捕获 dsh Web 信任 URL(浏览器信任栅栏)')
      // [q197] printUrl 行要等 dsh 插件树加载完才打印(web-app 的 announceReady 挂在
      // loader.await 之后,实测晚于端口就绪 6-10s;旧注释「bind 后 ~0.5s」与实测不符),
      // 就绪路径的窗口早已先装载裸 URL。信任签名密钥持久落盘、cookie 按 authority 长期
      // 有效——裸 URL 首载通常已通过 cookie 认证并开始挂载;此时无条件整页重载会把在途
      // 挂载作废,白吃一轮完整导航(实测揭窗 13-16.6s,其中 ~8s 是重载重启)。改为探针
      // 甄别:窗口仍停在 401 纯文本页(cookie 失效/首装)才统一重载种 cookie;已在装载
      // 应用的窗口跳过,token URL 留作后续新窗口与失效自愈。800ms 防抖保持不变。
      clearTimeout(dshUrlReloadTimer)
      dshUrlReloadTimer = setTimeout(() => reloadWindowsNeedingTrustUrl(), 800)
    }
    dshLog(`[dsh] ${String(d).trim()}`)
  })
  dshChild.stderr.on('data', (d) => dshLog(`[dsh-err] ${String(d).trim()}`))
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
// [问题121] 全程挂进度遮罩:此前恢复零反馈,用户盯着旧页/白屏不知道发生了什么。
async function scheduleRecovery() {
  if (recoveryTimer) return
  restartProgress(15, '服务异常,正在自动恢复…')
  await sleep(1_500) // 等端口真正下线,避免误判
  if (quitting || dshChild) {
    // 手动重启/启动流程已接管(自带遮罩)时勿动;无主遮罩(boot 期竞态)才撤
    if (!restarting && !switching) restartOverlayRemove()
    return
  }
  if (await isPortUp()) {
    log('服务仍可用(外部实例接管),跳过自动恢复')
    restartOverlayRemove()
    return
  }
  if (restartAttempts >= RECOVERY_DELAYS.length) {
    log(`连续 ${RECOVERY_DELAYS.length} 次自动恢复失败,停止重试`)
    notify('DeepSeek Harness', 'dsh 服务多次崩溃,已停止自动恢复。请从托盘菜单手动重启。')
    restartOverlayRemove() // error.html 换页本身会带走遮罩,这里兜底
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
    restartProgress(40, '正在启动 dsh 服务…')
    if (!startDsh()) {
      restartOverlayRemove()
      return
    }
    const child = dshChild // 锁定本次恢复拉起的进程,防止后续恢复周期替换后误清零计数
    const ok = await waitForPort(START_TIMEOUT_MS)
    if (ok) {
      // 端口监听不代表 boot 完成:插件树加载失败会让进程在 listen 后 1-2s 退出。
      // 先刷页面保住 UX,退避计数留待稳定期确认后再清零——否则每次崩溃循环都把
      // 计数重置为 0,3 次熔断永远不触发,表现为无限重启。
      stage('ready')
      restartProgress(100, '服务已就绪,正在加载界面…')
      loadUrlAll(dshUrl())
      schedulePreheat() // [R74] 恢复就绪同样补热
      scheduleOverlayRemoveAfterNav() // [问题124] 导航感知撤遮罩
      await sleep(RECOVERY_STABILIZE_MS)
      if (!quitting && dshChild === child && (await isPortUp())) {
        restartAttempts = 0
        log('自动恢复成功')
      } else {
        log('恢复后未通过稳定期(进程退出或端口丢失),保留退避计数')
      }
    } else {
      // [问题121] 预算内未就绪:进程没退就还在挣扎。遮罩转入等待态不撤——进程退出
      // 会再次进入 scheduleRecovery 重画进度;原先此处静默,用户只能看死页。
      restartProgress(96, '恢复超时,等待服务进程退出…')
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

// [问题124] 导航感知撤遮罩:固定 600ms 定时在冷系统(重启后首跑)下可能早于导航提交,
// 旧文档还活着时遮罩被移除 → 旧会话画面裸露一瞬(用户所见「跳到另一个页面再跳回」,
// rep5 f398 与重启前会话画面逐格一致的铁证)。改为每窗口等 did-navigate(旧文档已走)
// 后再撤自己的遮罩;8s 兜底防导航卡死时遮罩永留。
function scheduleOverlayRemoveAfterNav(extraMs = 400) {
  for (const win of mainWindows) {
    if (win.isDestroyed()) continue
    let done = false
    const remove = () => {
      if (done || win.isDestroyed()) return
      done = true
      setTimeout(() => {
        if (win.isDestroyed() || win.webContents.isDestroyed()) return
        win.webContents.executeJavaScript(`(function(){var el=document.getElementById('__dsh_restart_overlay__');if(el)el.remove();})()`, true).catch(() => {})
      }, extraMs)
    }
    win.webContents.once('did-navigate', remove)
    setTimeout(remove, 8000)
  }
}

// [问题121] 统一重启入口(托盘/API):互斥只保护「进行中」,保护不了「刚完成」——
// 冷却期内的重复触发在这里吸收;切换编排(applyDshVersion/runTrackSwitch)自带
// switching 互斥,仍直接调 restartDsh,不经此入口。
function requestRestart(source) {
  if (restarting || switching) return { ok: false, reason: 'busy' }
  const since = lastRestartSettledAt ? Date.now() - lastRestartSettledAt : Infinity
  if (since < RESTART_COOLDOWN_MS) {
    log(`重启请求吸收(${source}):距上次重启落定 ${(since / 1000).toFixed(1)}s,冷却期 ${RESTART_COOLDOWN_MS / 1000}s 内不重复重启`)
    return { ok: false, reason: 'cooldown' }
  }
  restarting = true
  restartDsh().finally(() => { restarting = false })
  return { ok: true }
}

// [问题121] 落定时刻记录:无论哪条调用链(托盘/API/切换/回滚),restartDsh 一落定
// 就武装冷却期,防止紧随其后的重复触发把刚拉起的服务再杀一遍。
async function restartDsh(timeoutMs = START_TIMEOUT_MS) {
  try {
    await restartDshInner(timeoutMs)
  } finally {
    lastRestartSettledAt = Date.now()
  }
}

async function restartDshInner(timeoutMs) {
  restartAttempts = 0
  if (recoveryTimer) { clearTimeout(recoveryTimer); recoveryTimer = null }
  // [q195 2026-09-05] 分段计时:重启总时长 = 停止旧服务 + 端口释放 + spawn→HTTP 就绪,
  // 此前三段混在「重启用时」一个数里,归因无从下手(实测热重启 8.6s 中 dsh 自身
  // spawn→就绪占 ~7s、停止+端口释放占 ~2s)。逐段落日志,后续调优有数可依。
  const killT0 = Date.now()
  restartProgress(6, '正在停止旧服务…')
  await killDshTree()
  log(`重启分段:停止旧服务 ${((Date.now() - killT0) / 1000).toFixed(1)}s`)
  restartProgress(24, '等待端口释放…')
  // [问题121] 释放失败不再无视:端口仍被占就 spawn,新实例必然 EADDRINUSE 崩溃循环。
  // 旧服务仍健康(taskkill 失败但服务活着)→ 保持原服务,刷新页面恢复 SSE 连接;
  // 端口被僵尸监听占死 → 提示后放弃,交由用户排查,不往枪口上撞。
  const freeT0 = Date.now()
  if (!(await waitForPortFree(8000))) { // 旧 socket 残留会让新实例 EADDRINUSE 直接崩;Windows 释放可慢,给足 8s
    if (await isHttpOk()) {
      log('重启中止:旧服务未停止但端口仍健康,保持原服务运行并刷新页面')
      restartProgress(100, '旧服务未停止,已保持运行')
      loadUrlAll(dshUrl())
      scheduleOverlayRemoveAfterNav() // [问题124] 导航感知撤遮罩
    } else {
      log(`重启中止:端口 ${DSH_PORT} 未释放且不可用,放弃本次重启(避免 EADDRINUSE 崩溃循环)`)
      notify('DeepSeek Harness', `重启中止:端口 ${DSH_PORT} 未释放。请稍后从托盘重试,或排查占用端口的进程。`)
      restartProgress(96, '端口未释放,重启中止')
      setTimeout(restartOverlayRemove, 2500)
    }
    return
  }
  log(`重启分段:端口释放 ${((Date.now() - freeT0) / 1000).toFixed(1)}s`)
  restartProgress(46, '正在启动 dsh 服务…')
  if (startDsh()) {
    // 等待期进度自走(46→92 缓爬),真就绪由轮询确认;单次 HTTP 探测 = 端口+服务双确认,省去串行等待
    const t0 = Date.now()
    const creep = setInterval(() => {
      // [问题121] 渐近爬升替代「线性 6%/s + 92 封顶」:旧公式 7s 即顶格僵死,慢启动
      // (实测 10-31s)会在 92% 停 3-24s 像卡死。渐近曲线全程蠕动,上限 97 把 100
      // 留给真实就绪,也消除「恰好停在 92」的确定性观感。
      restartProgress(Math.min(97, 50 + 47 * (1 - Math.exp(-(Date.now() - t0) / 12000))), '正在启动 dsh 服务…')
    }, 350)
    let ok = false
    try {
      const deadline = Date.now() + timeoutMs
      while (Date.now() < deadline) {
        if (await isHttpOk()) { ok = true; break } // 连接拒绝即时返回,不拖 2s 超时
        await sleep(80)
      }
    } finally { clearInterval(creep) }
    if (ok) {
      log(`dsh 服务就绪(重启用时 ${((Date.now() - t0) / 1000).toFixed(1)}s)`)
      restartProgress(100, '服务已就绪,正在加载界面…')
      await sleep(120) // 100% 进度帧上屏后再截屏盖幕,盖板定格 100% 而非爬升中的旧百分比
      loadUrlAll(dshUrl())
      schedulePreheat() // [R74] 就绪后补热运行时文件,稳住下次重启
      scheduleOverlayRemoveAfterNav() // [问题124] 导航感知撤遮罩(旧 600ms 定时在冷系统早于导航提交,旧文档遮罩被移除→会话画面裸露一瞬)
    } else {
      // 超时兜底:子进程可能因 EADDRINUSE 竞态退出,但外部实例已接管服务(实测场景)。
      // 此时页面 SSE 已断,必须重载才能恢复对话内容——不能让用户盯着空白页。
      if (await isHttpOk()) {
        log('重启超时但服务可用(外部实例接管),重载页面恢复连接')
        restartProgress(100, '服务已就绪,正在加载界面…')
        await sleep(120) // 同上:先让 100% 帧上屏,再截屏盖幕
        loadUrlAll(dshUrl())
        scheduleOverlayRemoveAfterNav() // [问题124] 导航感知撤遮罩
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
// [问题78] --registry 固定官方 npm 源,不受用户 npm 配置里的镜像影响。
// [问题125] 已降级为兜底路径(正常走 fetchDshVersionsViaHttp);失败带 stderr 记日志。
function npmView(args) {
  return new Promise((resolve) => {
    const npx = resolveNpxCommand()
    if (!npx) return resolve(null)
    const npmCmd = npx.replace(/npx\.cmd$/i, 'npm.cmd')
    if (!fs.existsSync(npmCmd)) return resolve(null)
    const child = spawn('cmd.exe', ['/c', npmCmd, ...REGISTRY_ARGS, 'view', '@deepseek-ai/dsh', ...args],
      { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    let errText = ''
    let done = false
    const finish = (v) => { if (!done) { done = true; resolve(v) } }
    const timer = setTimeout(() => { child.kill(); finish(null) }, 20_000)
    child.stdout.on('data', (d) => { out += d })
    child.stderr.on('data', (d) => { errText += d })
    child.on('exit', () => {
      clearTimeout(timer)
      // [问题125] 失败不再静默:此前 stderr 被丢弃、返回 null 无日志,排查无从下手
      if (!out.trim()) log(`npm view 查询失败: ${errText.trim().slice(0, 200) || '(无输出)'}`)
      finish(out.trim() || null)
    })
    child.on('error', (e) => { clearTimeout(timer); log(`npm view 启动失败: ${e.message}`); finish(null) })
  })
}

// [问题125] HTTP 直读 packument 版本清单,三级降级:
// ① 官方源(electronNet,走系统代理)② 镜像(走系统代理)③ 镜像(直连会话,绕过
// 系统代理)——npm.cmd 子进程不认 Windows 系统代理(只认 HTTP(S)_PROXY/.npmrc
// proxy),代理环境下直连官方源时通时断,曾致设置页「npm 查询失败」;而代理客户端
// 未运行时(注册表 ProxyEnable=1 但端口已死)前两级也会失败,③ 保证镜像直连兜底。
// 镜像仅用于读取版本元数据,下载/安装仍固定官方源。三级均失败后由 listDshVersions
// 再回退 npm view 子进程(直连官方源)。
let directSessionPromise = null
function resolveDirectSession() {
  if (!directSessionPromise) {
    const s = session.fromPartition('dsh-direct-fetch') // 内存会话,不落盘
    directSessionPromise = s.setProxy({ mode: 'direct' }).then(() => s)
  }
  return directSessionPromise
}

let dshPackumentMemo = { at: 0, value: null }
// [v0.5.17] 拉取 @deepseek-ai/dsh 完整 packument(HTTP 三级降级,5 分钟记忆):
// 版本清单与「目标版本依赖元数据」(插件兼容性预检)共用,一次更新流程不重复拉全量。
async function fetchDshPackument() {
  if (dshPackumentMemo.value && Date.now() - dshPackumentMemo.at < 300_000) return dshPackumentMemo.value
  const sources = [
    { name: '官方源', url: `${DSH_REGISTRY}/@deepseek-ai%2Fdsh` },
    { name: '镜像', url: `${DSH_REGISTRY_MIRROR}/@deepseek-ai%2Fdsh` },
    { name: '镜像(直连)', url: `${DSH_REGISTRY_MIRROR}/@deepseek-ai%2Fdsh`, direct: true },
  ]
  for (const s of sources) {
    try {
      const init = { signal: AbortSignal.timeout(15_000) }
      if (s.direct) {
        try { init.session = await resolveDirectSession() } catch { continue }
      }
      const res = await electronNet.fetch(s.url, init)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      if (!data || !data.versions || !Object.keys(data.versions).length) throw new Error('versions 清单为空')
      if (s.name !== '官方源') log(`dsh 版本查询:官方源不可达,已改从${s.name}获取(请检查官方源连通性/系统代理)`)
      dshPackumentMemo = { at: Date.now(), value: data }
      return data
    } catch (e) {
      log(`dsh 版本查询失败(${s.name}): ${e.message}`)
    }
  }
  return null
}

async function fetchDshVersionsViaHttp() {
  const data = await fetchDshPackument()
  return data ? Object.keys(data.versions) : null
}

// 版本清单统一入口:HTTP 双源优先,npm view 子进程兜底(前两级都不可达时仍可查)。
async function listDshVersions() {
  const viaHttp = await fetchDshVersionsViaHttp()
  if (viaHttp) return viaHttp
  log('dsh 版本查询:HTTP 双源均失败,回退 npm view 子进程')
  const raw = await npmView(['versions', '--json'])
  if (raw) {
    try {
      const list = JSON.parse(raw)
      if (Array.isArray(list) && list.length) return list
    } catch { /* 解析失败视为查询失败 */ }
  }
  return null
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

// [问题125] 展示列表排序的全序比较:parseDshVersion 只认 x.y.z[-rc.N](alpha 等
// 不参与「最新版」判定),但托盘切换列表此前包含 alpha 版;npm view 的 versions
// 自带升序,packument 键序不保证(镜像实测乱序),需显式全序。规则:同 x.y.z 内
// 正式版 > rc(N 越大越新) > 其他 prerelease(按 tag 字典序、N 越大越新)。
function dshVersionRank(v) {
  const p = parseDshVersion(v)
  if (p) return [p[0], p[1], p[2], 1, p[3], '']
  const m = /^(\d+)\.(\d+)\.(\d+)-([a-zA-Z]+)\.(\d+)$/.exec(String(v || ''))
  if (m) return [+m[1], +m[2], +m[3], 0, +m[5], m[4]]
  return null
}

function cmpDshRank(a, b) {
  const ra = dshVersionRank(a)
  const rb = dshVersionRank(b)
  if (!ra || !rb) return 0
  for (let i = 0; i < ra.length; i++) {
    if (ra[i] === rb[i]) continue
    return ra[i] < rb[i] ? -1 : 1
  }
  return 0
}

async function fetchAvailableVersions() {
  const list = await listDshVersions()
  if (!list) return
  // 只保留 npm 公开发布起的可安装版本,旧 rc 装不完整,展示无意义;
  // 来源键序不保证(packument 镜像实测乱序),显式全序排序后再截取
  availableVersions = list
    .filter((v) => dshVersionRank(v) && cmpDshVersion(v, MIN_PUBLIC_DSH_VERSION) >= 0)
    .sort(cmpDshRank)
    .slice(-8)
    .reverse() // 最近 8 个,新→旧
  rebuildTray()
  log(`已拉取 dsh 版本列表(仅公开可用): ${availableVersions.join(', ')}`)
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
// [问题125] 清单来源升级为 listDshVersions(HTTP 双源优先,npm view 兜底)。
async function resolveNewestPublicDsh() {
  const list = await listDshVersions()
  if (list) {
    const eligible = list.filter((v) => parseDshVersion(v) && cmpDshVersion(v, MIN_PUBLIC_DSH_VERSION) >= 0)
    if (eligible.length) {
      return eligible.reduce((a, b) => (cmpDshVersion(b, a) > 0 ? b : a))
    }
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
    loadUrlAll(dshUrl()) // 显式刷新所有主窗口(兜底,不依赖 restartDsh 副作用)
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

// dsh 运行时更新:npm 最新版 vs 版本锁;发现新版→确认→插件兼容性预检(不兼容二次确认)→写锁→重启 dsh
async function checkDshUpdate(manual) {
  if (cfg.dshVersion === 'latest') {
    if (manual) notify('dsh 更新', '当前跟踪 latest,每次启动自动使用最新版。')
    return // 跟踪 latest 时 npx 每次拉最新,无需比对
  }
  // [问题78] resolveNewestPublicDsh 内部 npmView 已固定官方源;失败时提示指向官方源
  const latest = await resolveNewestPublicDsh()
  if (!latest) {
    if (manual) notify('dsh 更新', 'npm 版本查询失败(官方源与镜像均不可达),请检查网络。')
    return
  }
  if (latest === cfg.dshVersion) {
    if (manual) notify('dsh 更新', `已是最新版 ${latest}。`)
    return
  }
  // [问题126] 公开版清单不含 alpha:当前为 alpha 预发布时最高公开版可能反而更低
  // (0.1.2-alpha.5 > 0.1.1-rc.2)。按全序比较,当前 ≥ 公开版最新即视为已最新,
  // 防止「更新到更低版本」的降级确认框(每次启动都会出现,默认按钮回车即降级)。
  if (cmpDshRank(cfg.dshVersion, latest) >= 0) {
    if (manual) notify('dsh 更新', `已是最新版 ${cfg.dshVersion}。`)
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
  // [v0.5.17] 插件兼容性门控:有不兼容声明时二次确认,等待用户放行(取消即终止)
  const compat = await dshCompat.assessPluginsForDshUpdate(latest)
  if (compat.error) {
    log(`插件兼容性检查跳过: ${compat.error}`)
  } else if (compat.incompatible.length) {
    const listText = compat.incompatible.slice(0, 8).map((i) => `• ${i.name}${i.version ? '@' + i.version : ''} — ${i.reason}`).join('\n')
      + (compat.incompatible.length > 8 ? `\n• …等共 ${compat.incompatible.length} 个` : '')
    const { response: confirmCompat } = await dialog.showMessageBox(dialogParent() ?? new BrowserWindow({ show: false }), {
      type: 'warning',
      title: '插件兼容性提醒',
      message: `新版 dsh ${latest} 与 ${compat.incompatible.length} 个已启用插件的依赖声明不兼容`,
      detail: `${listText}\n\n更新后这些插件可能无法工作,可先在插件管理中禁用它们或等待插件更新。仍要继续更新吗?`,
      buttons: ['仍要更新并重启服务', '取消'],
      defaultId: 1,
      cancelId: 1,
    })
    if (confirmCompat !== 0) {
      log(`用户取消与新版 ${latest} 不兼容状态下的 dsh 更新`)
      return
    }
  }
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

// ---------- [v0.5.17] dsh 更新前插件兼容性预检(引擎在 dsh-plugin-compat.cjs) ----------
// 更新 dsh 前评估已启用第三方插件的 peerDependencies / engines.dsh 声明,对照目标
// 版本将携带的 @deepseek-ai/dsh* 子包版本;范围无交集者列清单交用户确认后才继续
// (警告后放行,非硬阻断;检查失败一律放行不挡更新)。禁用集 = home 层 + profile
// 层 patch 的管理行;判定口径与数据源见模块头注释。
const { createCompatChecker } = require('./dsh-plugin-compat.cjs')
const dshCompat = createCompatChecker({
  dshHome: DSH_HOME,
  fetchPackument: fetchDshPackument,
  readDisabledAllIds: () => {
    const ids = new Set(readDisabledPlugins())
    for (const e of parsePatchFile(path.join(DSH_HOME, 'profiles', 'web', 'cordis.patch.yml')).entries) {
      if (e.managed && e.disabled === true && e.id) ids.add(e.id)
    }
    return ids
  },
  log,
})

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
      out.dshError = 'npm 版本查询失败(官方源与镜像均不可达),请检查网络'
    }
  }
  return out
}

/** 应用 dsh 最新版(异步,前端轮询 /state 的 switching/restarting)。
 *  [v0.5.17] 插件兼容性门控:首发请求不带 confirmCompat 时,若检测到已启用插件
 *  与目标版本声明不兼容,返 needsCompatConfirm + 不兼容清单,前端确认后回带
 *  { confirmCompat:true, target } 再继续(target 回带防两次点击间最新版漂移)。 */
async function applyDshLatest(body = {}) {
  if (switching || restarting) return { ok: false, error: '已有切换或重启在进行' }
  // [问题75] 目标版本取全量清单最高公开版(latest 标签不含 rc 新版)
  const latest = await resolveNewestPublicDsh()
  if (!latest) return { ok: false, error: 'npm 版本查询失败(官方源与镜像均不可达),请检查网络' }
  if (latest === cfg.dshVersion) return { ok: true, note: '已是最新版' }
  // [问题126] 全序防降级:当前为 alpha 预发布时,公开版最新可能反而更低
  if (cmpDshRank(cfg.dshVersion, latest) >= 0) return { ok: true, note: '已是最新版' }
  if (!(body && body.confirmCompat && body.target === latest)) {
    const compat = await dshCompat.assessPluginsForDshUpdate(latest)
    if (compat.error) {
      log(`插件兼容性检查跳过: ${compat.error}`)
    } else if (compat.incompatible.length) {
      log(`dsh 更新 ${latest}:${compat.incompatible.length} 个已启用插件声明不兼容,等待用户确认`)
      return {
        ok: true,
        needsCompatConfirm: true,
        target: latest,
        checked: compat.checked,
        unknown: compat.unknown,
        incompatible: compat.incompatible.map((i) => ({ name: i.name, version: i.version, reason: i.reason })),
      }
    }
  }
  switchDshVersion(latest) // 内部自带预检+回滚+switching 互斥
  return { ok: true, accepted: true }
}

// ---------- v0.5.1 运行时轨道状态/切换 + 联合工作区灰度开关 ----------

/** 轨道中文名(日志与 UI 文案共用)。 */
const TRACK_ZH = { official: '官方(npm)', local: '本地构建' }

/**
 * 运行时轨道状态快照(轨道意愿 vs 实际生效 + 本地轨可用性 + 联邦灰度态)。
 * 供 GET /runtime/state 与壳设置窗口 IPC 共用;quiet 解析避免轮询刷日志。
 */
function runtimeStatePayload() {
  const runtime = resolveDshRuntime(cfg, { quiet: true })
  const track = cfg.dshRuntime === 'local' ? 'local' : 'official'
  const localDir = (typeof cfg.dshLocalDir === 'string' && cfg.dshLocalDir.trim()) ? cfg.dshLocalDir.trim() : DEFAULT_LOCAL_DIR
  const localBinExists = !!(localDir && fs.existsSync(path.join(localDir, 'bin.js')))
  const fed = readFederatedSwitch()
  return {
    track,
    effective: runtime.mode,
    fallback: !!runtime.fallback,
    localDir,
    localBinExists,
    federated: {
      enabled: fed.enabled === true,
      // 功能代码只存在于本地构建(官方 0.1.1-rc.2 实测无 federatedWorkspaces);
      // 开关可写前提 = 本地轨且本地 bin 在位,官方轨写入会被官方 schema 拒载。
      supported: track === 'local' && localBinExists,
      ...(fed.error ? { error: fed.error } : {}),
    },
    switching: switching || restarting,
    dshVersion: cfg.dshVersion,
    shellVersion: app.getVersion(),
  }
}

// ---------- 联合工作区灰度开关:home patch 的 api-gateway 配置行 ----------
// 行格式由本壳独占管理(persona 同款 canonical 守卫)。patch 的 config 为整体替换
// 语义(R30 教训:少带字段会让 schema 校验失败/丢默认),故四字段全显式写入——
// 前三个与本地构建 apiproxy Config schema 的默认值一致(nativeOpen 在 Windows
// 桌面本就为真),第四个是灰度位本体。官方包无 federated 字段,写入路径由
// /federation/toggle 与 IPC 双闸限制在 local 轨道。删除整块 = 恢复默认(灰度关)。
// [v0.5.2 勘正] patch 条目按组合树"行 id"寻址:apiproxy 模块在 web profile
// (dsh-web-app/cordis.patch.yml)里的行 id 是 api-gateway;'host-apiproxy' 只是
// 模块名 @deepseek-ai/dsh-host-apiproxy 的短名,拿它当行 id 会挂空、灰度位被
// 静默忽略(0.5.2 活体验证实测)。
const FEDERATION_ENTRY_ID = 'api-gateway'

/** api-gateway 管理块的标准形态(enabled 决定灰度位取值)。 */
function federationCanonicalLines(enabled) {
  return [
    `- id: ${FEDERATION_ENTRY_ID}`,
    '  config:',
    '    nativeOpen: true',
    '    sessionExportCompressionLevel: 6',
    '    coldBlankProbeMaxBytes: 1024',
    `    federatedWorkspacesEnabled: ${enabled ? 'true' : 'false'}`,
  ]
}

/** home patch 中 api-gateway 行是否为壳管理的标准格式(两种灰度位取值均可)。 */
function isCanonicalFederationRow(hit, lines) {
  const body = lines.slice(hit.start, hit.end).join('\n')
  return body === federationCanonicalLines(true).join('\n') || body === federationCanonicalLines(false).join('\n')
}

/** 读联合工作区灰度态;error 非空 = 条目存在但非本工具标准格式(引导手动编辑)。 */
function readFederatedSwitch() {
  const { entries, lines } = parseHomePatch()
  const hit = entries.find((e) => e.id === FEDERATION_ENTRY_ID)
  if (!hit) return { enabled: false }
  if (!isCanonicalFederationRow(hit, lines)) {
    return { enabled: null, error: `cordis.patch.yml 中 ${FEDERATION_ENTRY_ID} 行不是本工具的标准格式,请手动编辑该文件` }
  }
  const m = lines.slice(hit.start, hit.end).join('\n').match(/federatedWorkspacesEnabled:\s*(true|false)/)
  return { enabled: m ? m[1] === 'true' : false }
}

/** 写/删联合工作区灰度行。enable=false 删整块恢复默认(灰度关)。 */
function writeFederatedSwitch(enable) {
  const { entries, lines, valid } = parseHomePatch()
  if (!valid) return { ok: false, error: 'cordis.patch.yml 含顶层数组以外的内容,为安全起见请手动编辑该文件' }
  const hit = entries.find((e) => e.id === FEDERATION_ENTRY_ID)
  if (!enable) {
    if (!hit) return { ok: true }
    if (!isCanonicalFederationRow(hit, lines)) return { ok: false, error: `条目 ${FEDERATION_ENTRY_ID} 有手写内容,请手动编辑` }
    lines.splice(hit.start, hit.end)
    while (lines[hit.start] !== undefined && lines[hit.start].trim() === '' && lines[hit.start + 1] !== undefined && lines[hit.start + 1].trim() === '') lines.splice(hit.start, 1)
  } else {
    if (hit) {
      if (!isCanonicalFederationRow(hit, lines)) return { ok: false, error: `条目 ${FEDERATION_ENTRY_ID} 有手写内容,请手动编辑` }
      // 已是标准块:仅翻转灰度位行,不重复追加
      for (let i = hit.start; i < hit.end; i++) {
        if (/^\s+federatedWorkspacesEnabled:/.test(lines[i])) { lines[i] = '    federatedWorkspacesEnabled: true'; break }
      }
    } else {
      if (lines.length && lines[lines.length - 1].trim() !== '') lines.push('')
      lines.push(...federationCanonicalLines(true), '')
    }
  }
  try { writeHomePatch(lines) } catch (e) { return { ok: false, error: `写入失败: ${e.message}` } }
  return { ok: true }
}

/**
 * 运行时轨道切换编排:写轨 → 重启服务(切换预算) → 就绪确认;失败自动回滚
 * 原轨道(镜像 applyDshVersion 的回滚语义,防坏轨道进入崩溃循环)。调用方
 * 已持有 switching 互斥并完成合法性与幂等检查。
 * @returns {{ ok: boolean, warn?: string, error?: string }}
 */
async function runTrackSwitch(mode) {
  const prev = cfg.dshRuntime === 'local' ? 'local' : 'official'
  settingsStatus({ phase: 'apply', message: `正在切换运行时轨道为 ${TRACK_ZH[mode]} 并重启服务…` })
  cfg.dshRuntime = mode
  saveConfig(cfg)
  rebuildTray()
  log(`[dshRuntime] 轨道切换 ${prev} → ${mode}`)
  await restartDsh(SWITCH_TIMEOUT_MS)
  if (await isHttpOk()) {
    loadUrlAll(dshUrl())
    const resolved = resolveDshRuntime(cfg, { quiet: true })
    if (resolved.fallback) {
      // 服务活着,但实际是折叠回 official 在跑——诚实告知,不谎报"切换成功"
      const warn = `${TRACK_ZH[mode]}轨道未真正生效(本地 bin 缺失或 node.exe 不可解析),本次实际按${TRACK_ZH[resolved.mode]}运行。请检查本地构建目录后重试。`
      log(`[dshRuntime] ${warn}`)
      settingsStatus({ phase: 'warn', message: warn })
      return { ok: true, warn }
    }
    settingsStatus({ phase: 'ok', message: `已切换到 ${TRACK_ZH[mode]}轨道。` })
    notify('运行时轨道', `已切换到${TRACK_ZH[mode]}。`)
    return { ok: true }
  }
  log(`[dshRuntime] ${mode} 轨道 ${SWITCH_TIMEOUT_MS / 1000}s 未就绪,自动回滚到 ${prev}`)
  notify('运行时轨道切换失败', `${TRACK_ZH[mode]}启动超时,已自动回滚到${TRACK_ZH[prev]}。`)
  settingsStatus({ phase: 'rollback', message: `${TRACK_ZH[mode]}启动超时,已自动回滚到${TRACK_ZH[prev]}。` })
  cfg.dshRuntime = prev
  saveConfig(cfg)
  rebuildTray()
  await restartDsh()
  return { ok: false, error: `${TRACK_ZH[mode]}启动超时,已自动回滚到${TRACK_ZH[prev]}。` }
}

// ---------- 窗口(共享服务多开) ----------

// [主题闪变治理] 最近一次揭窗时记录的主题底色。窗口可见期间的重载/重启导航会
// 重新经历「原生白底 → 主题令牌迟到落色」的闪变,幕帘用此色覆盖过渡期,
// 幕→主题内容零色差。透明(壁纸态)不挂幕。
let lastThemeBg = null

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
      // 沙箱化 preload 加载器会把脚本路径嵌入生成代码一起编译,路径含引号
      // (如用户名带撇号 ⇒ %TEMP% 解压目录)即炸 SyntaxError,preload 整体不
      // 运行 ⇒ 桥丢失 ⇒ 注入的窗口控制按钮消失。本壳只加载本地回环内容,
      // 关渲染器沙箱换回直载 loader(contextIsolation 仍开,nodeIntegration 仍关)。
      sandbox: false,
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

// [问题77] macOS(Codex Mac 版)风格窗口控件:圆形红黄绿小点,交通灯色常驻
// 显示,悬停不显形符号(仅圆点微亮反馈,按下加深);无边框无分隔线,
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
    transition: background .12s ease;
  }
  #dsh-desktop-win-controls .wcBtn svg { display: none; }
  #dsh-desktop-win-controls .wcBtn[data-act="min"]::before { background: #febc2e; }
  #dsh-desktop-win-controls .wcBtn[data-act="min"]:hover::before { background: #ffd25e; }
  #dsh-desktop-win-controls .wcBtn[data-act="min"]:active::before { background: #d9a017; }
  #dsh-desktop-win-controls .wcBtn[data-act="max"]::before { background: #28c840; }
  #dsh-desktop-win-controls .wcBtn[data-act="max"]:hover::before { background: #4edb62; }
  #dsh-desktop-win-controls .wcBtn[data-act="max"]:active::before { background: #1f9a3b; }
  #dsh-desktop-win-controls .wcBtn.wcClose::before { background: #ff5f57; }
  #dsh-desktop-win-controls .wcBtn.wcClose:hover::before { background: #ff8078; }
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
    // 不可定制),改为注入 HTML 浮层(见 TITLEBAR_CONTROLS_JS),交通灯色常驻。
    titleBarStyle: 'hidden',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // 同 splash 窗:沙箱化 preload 加载器在含引号路径(便携版 %TEMP% 解压
      // 目录,随用户名)下必炸,preload 不运行则窗口控制按钮无处依托。
      sandbox: false,
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
  // [主题闪变治理] 主帧导航先挂主题幕帘(仅 dsh Web UI 地址;错误页/外部页不挂)
  hookThemeVeil(win)
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

// [q196 2026-09-05 启动揭窗闸门] 主窗隐藏加载 Web UI 期间,页面依次经历「无 token 401 信任页 →
// 白底 Loading plugins 加载页 → 应用挂载 → 主题令牌落位」。旧 themeGate 固定 2s 硬兜底
// 揭窗,而实测(2026-09-05 desktop.log)dsh 冷启动服务就绪后客户端仍要 10s+ 才挂载,日志
// 中主题闸门恒为「超时兜底」揭窗——揭窗后用户直面长白屏。改为以「应用内容真实挂载」为
// 主条件(复用幕帘/盖板的 #root 判定):应用就绪且主题层在位 → 立即揭窗;应用就绪但主题
// 迟到 → 宽限后揭窗(无主题插件的用户不被阻塞);总硬超时兜底(页面挂不出来时放弃等待,
// 行为退回旧版白屏)。探针回包依赖渲染主线程空闲(q195 实测可延迟 5s+),揭窗只由独立
// setTimeout 保证,探针仅负责提前;等待期关闭渲染节流防隐藏窗口拖慢客户端挂载
// (同 snapshotCover 盖板期处理),揭窗时恢复。
const BOOT_READY_JS = "(function(){var t=!!(document.getElementById('joi-theme')||(document.body&&document.body.getAttribute('style')));var r=document.querySelector('#root');var a=!!(r&&r.childElementCount>0&&r.innerHTML.length>5000&&!/Loading plugins|加载插件/i.test(r.innerText||''));return {a:a,t:t}})()"
const BOOT_GATE_HARD_MS = 20_000       // 总兜底:页面一直挂不出来时揭窗(退回旧版行为)
const BOOT_GATE_THEME_GRACE_MS = 4_000 // 应用已挂载但主题未落位的额外宽限
const BOOT_GATE_REVEAL_BEAT_MS = 700   // 揭窗前留 100% 进度/鲸鱼谢幕上屏的节拍

function bootGate(win, reveal, opts = {}) {
  const hardMs = opts.hardMs ?? BOOT_GATE_HARD_MS
  const graceMs = opts.graceMs ?? BOOT_GATE_THEME_GRACE_MS
  const beatMs = opts.beatMs ?? BOOT_GATE_REVEAL_BEAT_MS
  const t0 = Date.now()
  let revealed = false
  let appReadyAt = 0
  let hardTimer, graceTimer, probeTimer
  const clearTimers = () => { clearTimeout(hardTimer); clearTimeout(graceTimer); clearTimeout(probeTimer) }
  const doReveal = (why) => {
    if (revealed) return
    revealed = true
    clearTimers()
    try { win.webContents.setBackgroundThrottling(true) } catch {}
    stage('ready') // 100% 进度 + 鲸鱼谢幕先上屏,节拍后再揭主窗
    setTimeout(() => {
      if (win.isDestroyed()) return
      log(`揭窗于 showMain 后 +${Date.now() - t0}ms(${why})`)
      reveal()
      // [问题121] 揭窗后实采底色供后续导航幕帘用。主题令牌可能晚于揭窗落位,
      // 重试采样(400ms×12≈5s)防采到透明底整场 disarm。
      const sample = (n) => {
        if (win.isDestroyed() || lastThemeBg) return
        win.webContents.executeJavaScript(SAMPLE_BG_JS, false)
          .then((bg) => {
            if (typeof bg === 'string' && bg && bg.indexOf('rgba(0, 0, 0, 0)') < 0) { lastThemeBg = bg; return }
            if (n > 0) setTimeout(() => sample(n - 1), 400)
          })
          .catch(() => {})
      }
      sample(12)
    }, beatMs)
  }
  try { win.webContents.setBackgroundThrottling(false) } catch {}
  // 硬超时独立于探针回包(q195 教训):探针延迟不能架空 deadline 语义
  hardTimer = setTimeout(() => doReveal('超时兜底'), hardMs)
  const probe = () => {
    if (revealed || win.isDestroyed()) return
    win.webContents.executeJavaScript(BOOT_READY_JS, false).then((st) => {
      if (revealed || win.isDestroyed() || !st) return
      if (st.a && !appReadyAt) appReadyAt = Date.now()
      if (st.a && st.t) doReveal('应用与主题就绪')
      else if (st.a && !graceTimer) graceTimer = setTimeout(() => doReveal('应用就绪,主题宽限超时'), graceMs)
    }).catch(() => { /* 页面导航中/执行失败,继续轮询 */ }).finally(() => {
      if (!revealed && !win.isDestroyed()) probeTimer = setTimeout(probe, 250)
    })
  }
  setTimeout(probe, 120)
}

// [主题闪变治理] 窗口可见期间的主帧导航(重载界面/重启 dsh/轨道切换)重走一遍页面加载,
// 主题令牌迟到期间先挂一块与主题同色的幕帘,主题层落位后淡出移除——
// 幕色取自上次揭窗的实采底色,幕→内容零色差;探针超时兜底强撤防卡幕。
const THEME_VEIL_JS = `(function(){
  // [问题121] 重启遮罩在场时跳过:旧文档上的幕帘会在半透明遮罩背后把页面内容
  // 突变为纯色块(实测观感=100% 时闪一下),且旧文档随导航即毁,幕帘无意义。
  if (document.getElementById('__dsh_restart_overlay__')) return;
  var BG = ${JSON.stringify('__VEIL_BG__')};
  var waitBody = function(fn){
    if (document.body) return fn();
    document.addEventListener('DOMContentLoaded', fn, { once: true });
  };
  waitBody(function(){
    if (document.getElementById('__dsh_theme_veil__')) return;
    var v = document.createElement('div');
    v.id = '__dsh_theme_veil__';
    v.style.cssText = 'position:fixed;inset:0;z-index:2147483000;background:' + BG + ';transition:opacity .18s ease;pointer-events:none';
    document.body.appendChild(v);
    // [问题121] 撤幕判定=真实应用内容(#root 挂载且非加载页):加载页本身是纯白底
    // (实测 rgb(255,255,255)),只按主题信号或 #root 挂载撤幕会过早露出白屏。
    // 15s 兜底防页面挂不掉时永久卡幕。
    var deadline = Date.now() + 15000;
    var gone = false;
    var dismiss = function(){
      if (gone) return; gone = true;
      v.style.opacity = '0';
      setTimeout(function(){ if (v.isConnected) v.remove(); }, 240);
    };
    var ready = function(){
      var r = document.querySelector('#root');
      return !!(r && r.childElementCount > 0 && r.innerHTML.length > 5000 && !/Loading plugins|加载插件/i.test(r.innerText || ''));
    };
    var poll = function(){
      if (gone || !v.isConnected) return;
      if (ready() || Date.now() >= deadline) dismiss();
      else setTimeout(poll, 80);
    };
    setTimeout(poll, 120);
  });
})()`

// [问题121] 主题底色实采:body → documentElement 兜底,透明/不存在返回 null。
// 启动期揭窗时主题令牌可能尚未落位(body=透明),一次采样即弃会让盖板/幕帘
// 整场 disarm;调用方应带重试或在导航前现场实采。
const SAMPLE_BG_JS = "(function(){var els=[document.body,document.documentElement];for(var i=0;i<els.length;i++){var el=els[i];if(!el)continue;var v=getComputedStyle(el).backgroundColor;if(v&&v!=='transparent'&&v.indexOf('rgba(0, 0, 0, 0)')<0)return v;}return null})()"

// [问题121] 真实应用内容判定:#root 挂载且非加载页。加载页(Loading plugins…)
// 本身是纯白底且同样挂在 #root 下,只判 childElementCount 会在加载页就撤盖,
// 露出后续恢复阶段的白底。len>5000 = 应用外壳已渲染(加载页仅 ~300)。
const APP_READY_JS = "(function(){var r=document.querySelector('#root');return !!(r && r.childElementCount > 0 && r.innerHTML.length > 5000 && !/Loading plugins|加载插件/i.test(r.innerText || ''))})()"

function paintThemeVeil(win) {
  if (!lastThemeBg) return
  if (win.isDestroyed() || !win.isVisible()) return
  win.webContents.executeJavaScript(THEME_VEIL_JS.replace('__VEIL_BG__', lastThemeBg), false).catch(() => {})
}

// 主帧导航挂幕:did-navigate(提交后)为主道;did-start-navigation 抢在旧文档卸载前挂,
// loadURL/reload 后再追一次——三道覆盖「提交瞬间的空档白帧」(活体实测 reload 首 2 帧白)。
function hookThemeVeil(win) {
  win.webContents.on('did-navigate', (e, url) => {
    if (typeof url === 'string' && url.indexOf(':' + DSH_PORT) >= 0) paintThemeVeil(win)
  })
  win.webContents.on('did-start-navigation', (e, url) => {
    if (typeof url === 'string' && url.indexOf(':' + DSH_PORT) >= 0) paintThemeVeil(win)
  })
}

// [主题闪变治理] 窗口级快照遮罩:旧文档一卸载页面级幕随文档同灭,提交→首帧之间仍有白底空档。
// 导航前把当前画面截成 OS 级置顶无边框小窗盖住主窗,主题层落位后淡出销毁——
// 用户看到的是「原画面定格 → 同色新内容」,全程零色差零白帧。截图失败则静默放弃(不阻塞导航)。
function snapshotCover(win, andThen) {
  const go = (() => { let started = false; return () => { if (started) return; started = true; andThen() } })()
  // 全局兜底:遮罩链路任何异常都不得卡住导航本体(遮罩可缺席,导航不可缺席)
  // [问题124] 3s > ready-to-show(≤1.5s 外层兜底)+img 解码(≤900ms),防冷系统下抢跑放行
  setTimeout(go, 3000)
  // [问题124] 最小化窗口跳过盖板:capturePage 在最小化窗口上可能挂起(批次72 前科),
  // 且盖板本为可见窗过渡设计,最小化下无意义。
  if (win.isDestroyed() || !win.isVisible() || win.isMinimized()) { go(); return }
  // [问题124] 盖板期间临时关 backgroundThrottling:盖板(置顶 OS 窗)会完全遮挡主窗,
  // Chromium 判主窗 occluded → 渲染挂起,盖板下新页 boot 被节流拖慢;关闭节流双保险。
  let throttleRestored = false
  const restoreThrottle = () => { if (throttleRestored) return; throttleRestored = true; try { win.webContents.setBackgroundThrottling(true) } catch {} }
  try { win.webContents.setBackgroundThrottling(false) } catch {}
  // [问题121] 盖板武装改为现场实采:启动期 lastThemeBg 可能采到透明底而整场
  // disarm,重启导航裸奔(白闪+白屏)。重启时旧页面已稳定,必采到真实底色。
  const arm = lastThemeBg
    ? Promise.resolve(lastThemeBg)
    : win.webContents.executeJavaScript(SAMPLE_BG_JS, false).then((bg) => {
      if (typeof bg === 'string' && bg && bg.indexOf('rgba(0, 0, 0, 0)') < 0) { lastThemeBg = bg; return bg }
      return null
    }).catch(() => null)
  arm.then((bg) => {
    if (!bg || win.isDestroyed() || !win.isVisible()) { restoreThrottle(); go(); return }
    win.webContents.capturePage().then((img) => {
    if (win.isDestroyed()) { restoreThrottle(); return }
    const b = win.getBounds()
    // [问题124] 盖板右缘缩进 3px:全尺寸盖板会让 Chromium 窗口遮挡追踪把主窗判为
    // 完全遮挡(occluded)→ 主窗渲染管线挂起,最后一帧定格旧页(100% 遮罩),撤盖后
    // 遮挡判定最长滞后 ~1s 才恢复 → 淡出被架空、画面单帧硬切(用户所见"闪一下")。
    // 留 3px 让窗使主窗永不被完全遮挡,渲染持续,淡出落到实时新页上。boundsSync 同步保持缩进。
    const COVER_INSET = 3
    const cover = new BrowserWindow({
      x: b.x, y: b.y, width: Math.max(100, b.width - COVER_INSET), height: b.height,
      frame: false, show: false, alwaysOnTop: true, skipTaskbar: true,
      resizable: false, movable: false, minimizable: false, maximizable: false,
      closable: true, hasShadow: false, focusable: false,
      transparent: true, backgroundColor: '#00000000',
      webPreferences: { contextIsolation: true, nodeIntegration: false },
    })
    const url = 'data:text/html;charset=utf-8,' + encodeURIComponent(
      '<html><head><style>html,body{margin:0;padding:0;background:transparent;overflow:hidden}</style></head><body>'
      + '<img src="' + img.toDataURL() + '" style="width:100vw;height:100vh;display:block;transition:opacity .22s ease" id="cv"></body></html>')
    cover.loadURL(url).catch(() => {})
    let settled = false
    let disposed = false
    const boundsSync = () => {
      if (disposed || win.isDestroyed()) return
      const nb = win.getBounds()
      // [问题124] 同步保持右缘缩进,防 resize 后又变回完全遮挡
      cover.setBounds({ x: nb.x, y: nb.y, width: Math.max(100, nb.width - COVER_INSET), height: nb.height })
    }
    const dismiss = () => {
      if (disposed) return
      settled = true
      try {
        cover.webContents.executeJavaScript('(function(){var el=document.getElementById("cv");if(el)el.style.opacity="0";})()', false).catch(() => {})
      } catch {}
      setTimeout(() => {
        if (disposed) return
        disposed = true
        try { win.removeListener('resize', boundsSync); win.removeListener('move', boundsSync) } catch {}
        try { if (!cover.isDestroyed()) cover.destroy() } catch {}
        restoreThrottle() // [问题124] 盖板退场,恢复节流
      }, 280)
    }
    cover.once('ready-to-show', () => {
      if (win.isDestroyed()) { try { cover.destroy() } catch {}; restoreThrottle(); return }
      if (!win.isVisible() || win.isMinimized()) { try { cover.destroy() } catch {}; restoreThrottle(); go(); return }
      try { cover.showInactive(); cover.setAlwaysOnTop(true, 'screen-saver') } catch {}
      // 等遮罩窗截图真正解码上屏再放行导航:冷系统下大图(2100x1350 PNG dataURL)解码
      // 可落后窗口首绘数百 ms,只等双 rAF 会在「窗口可见但图片未绘制」的透明空窗期
      // 放行导航,主窗裸奔(问题124 rep5 实证:盖板 show 后 ~400ms 图片才逐块绘上)。
      // complete+naturalWidth 判解码完成,双 rAF 保证落屏;900ms 兜底不卡导航。
      cover.webContents.executeJavaScript('new Promise(function(r){var img=document.getElementById("cv");var done=function(){requestAnimationFrame(function(){requestAnimationFrame(function(){r(true)})})};if(!img||img.complete&&img.naturalWidth>0){done();return}img.onload=done;img.onerror=done;setTimeout(done,900)})', false)
        .then(() => { if (!disposed) go() }).catch(() => { if (!disposed) go() })
      setTimeout(() => { if (!disposed) go() }, 1500) // [问题124] 外层兜底须晚于内层 img 解码兜底(900ms),防抢跑放行
      win.on('resize', boundsSync)
      win.on('move', boundsSync)
      // [问题121] 撤盖判定=真实会话 UI 就绪(APP_READY_JS):盖板期间定格的是 100%
      // 「正在加载界面」画面,一直盖到恢复阶段完成,不再中途露出加载页白底。
      // 20s 兜底防页面挂不掉时永久遮挡。
      const deadline = Date.now() + 20000
      const poll = () => {
        if (disposed || win.isDestroyed()) { dismiss(); return }
        win.webContents.executeJavaScript(APP_READY_JS, false)
          .then((ok) => {
            if (disposed) return
            if (ok || Date.now() >= deadline) dismiss()
            else setTimeout(poll, 100)
          }).catch(() => { if (!disposed && Date.now() >= deadline) dismiss(); else setTimeout(poll, 120) })
      }
      setTimeout(poll, 120)
    })
    cover.once('closed', () => { disposed = true; restoreThrottle() }) // [问题124] 任何销毁路径都恢复节流
    // 遮罩窗自身加载失败/超时:不能卡住主流程,强制放行并收尾
    setTimeout(() => { if (!settled && !disposed) { try { if (!cover.isDestroyed()) cover.destroy() } catch {} } }, 4000)
  }).catch(() => { restoreThrottle(); go() })
  })
}

// 首窗就绪:显示并关闭启动页(先过揭窗闸门,见 bootGate)
function showMain(url) {
  const win = [...mainWindows][0]
  if (!win) return
  const reveal = () => {
    win.show()
    win.focus()
    closeSplash()
  }
  const gated = () => bootGate(win, reveal)
  if (win.webContents.isLoadingMainFrame()) win.once('ready-to-show', gated)
  else gated()
  // 首窗隐藏加载不挂幕;但可见窗重走 showMain(如恢复路径)时旧文档已卸载,
  // 先挂页面级幕盖住空档(页内幕随新文档重建,作双保险)
  if (win.isVisible()) paintThemeVeil(win)
  win.loadURL(url)
}

// 所有存活主窗口统一跳转(快照遮罩盖住导航空档,页内幕双保险,见 snapshotCover/hookThemeVeil)
function loadUrlAll(url) {
  for (const win of mainWindows) {
    if (win.isDestroyed()) continue
    if (typeof url === 'string' && url.indexOf(':' + DSH_PORT) >= 0) {
      snapshotCover(win, () => win.loadURL(url))
    } else {
      win.loadURL(url)
    }
  }
}

// [q197] 页面甄别探针:app=#root 在位(已在装载 dsh 应用,含「Loading plugins」加载页),
// unauth=当前文档是 401 纯文本响应(信任栅栏对未认证请求的落点)。仅 401 页才值得为
// 种信任 cookie 整页重载;#root 已在位的页面重载纯亏(在途挂载作废重来)。
const DSH_PAGE_STATE_JS = "(function(){try{return{app:!!document.querySelector('#root'),unauth:document.contentType==='text/plain'}}catch(e){return{app:false,unauth:false}}})()"

// 捕获信任 URL 后的条件重载:只重载仍停在 401/陈旧页的窗口;全部在途挂载则整体跳过。
async function reloadWindowsNeedingTrustUrl() {
  if (!dshWebUrl) return
  let needs = false
  for (const win of mainWindows) {
    if (win.isDestroyed()) continue
    try {
      const st = await win.webContents.executeJavaScript(DSH_PAGE_STATE_JS, false)
      if (st && st.app && !st.unauth) continue
    } catch { /* 导航中/执行失败:按需重载 */ }
    needs = true
  }
  if (needs) loadUrlAll(dshWebUrl)
  else log('信任 cookie 已生效,窗口在途挂载,跳过 token URL 重载')
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
  // 同首窗:过揭窗闸门再揭,防新窗口白底闪一拍/长白屏(见 bootGate)
  win.once('ready-to-show', () => bootGate(win, () => win.show()))
  win.loadURL(dshUrl())
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
function parsePatchText(text) {
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

/** [v0.5.17] 按路径解析 patch 文件(home 层之外还有 profile 层 cordis.patch.yml)。 */
function parsePatchFile(file) {
  let text = ''
  try { text = fs.readFileSync(file, 'utf8') } catch { /* 不存在视作空 */ }
  return parsePatchText(text)
}

function parseHomePatch() {
  return parsePatchFile(HOME_PATCH_FILE)
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

// ---- 其他来源技能(工作区根 + 插件包根;R71,2026-08-30) ----
// 其他来源技能此前仅靠「采样最近会话调 skill.list」枚举,而 skill.list 只对当前
// 附加(attached)的会话应答,未附加会话一律 session-not-found——采样命中全未附加
// 时「其他来源」就整体消失,这正是设置页技能列表偶发识别不到的根因。且 skill.list
// 的条目不含路径与来源,只能做只读展示。
// 现改为壳侧确定性枚举 + 两条真实启停杠杆:
//   1) 工作区根 <ws>/.dsh/skills、<ws>/.agents/skills:skill-filesystem 按 cwd 向上
//      找 .git 得 projectRoot 后扫描的同名根,且被 chokidar 监听——条目移入
//      <root>-disabled 姊妹目录即热失效,与用户级技能同一机制;
//   2) 插件包技能(如 @dhicoc/dsh-reverse-skill 的 skills/ 与
//      CTF-Sandbox-Orchestrator/ 树):provider 自递归收集且有模块级缓存(永不
//      失效)——启停 = 移入包内 skills-disabled/ 检疫目录(保持包根相对路径),
//      重启宿主后生效;插件包更新会还原。walker 只走声明的树,检疫目录不可见。

const SKILL_PROFILES_NM = path.join(DSH_HOME, 'profiles', 'web', 'node_modules')

/** 扫描一个工作区/成员路径的 4 个技能根(启用/禁用 × .dsh/.agents),条目带 dir。 */
function scanWorkspaceSkillRoots(wsPath) {
  const out = []
  let root = wsPath
  try { root = fs.realpathSync(wsPath) } catch { /* 路径不存在时按原样,扫描自然为空 */ }
  for (const [sub, label, source] of [
    ['.dsh', '工作区 .dsh/skills', 'project-dsh'],
    ['.agents', '工作区 .agents/skills', 'project-agents'],
  ]) {
    for (const [leaf, disabled] of [['skills', false], ['skills-disabled', true]]) {
      const dir = path.join(root, sub, leaf)
      for (const e of scanSkillDir(dir, source, label, disabled)) {
        e.dir = path.join(dir, e.entryName)
        e.dirDisabled = disabled
        out.push(e)
      }
    }
  }
  return out
}

/** 递归收集 profiles 下插件包内全部 SKILL.md,按 frontmatter name 索引位置。 */
function indexPackSkills() {
  const index = new Map()
  const visit = (dir, depth, packRoot) => {
    if (depth < 0) return
    let entries
    try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
    let root = packRoot
    if (!root && path.dirname(dir) !== dir && fs.existsSync(path.join(dir, 'package.json'))) root = dir
    for (const ent of entries) {
      if (ent.name === 'node_modules' || ent.name === '.git') continue
      const p = path.join(dir, ent.name)
      if (ent.isDirectory()) visit(p, depth - 1, root)
      else if (ent.name === 'SKILL.md' && root) {
        const fm = parseSkillFrontmatter(p)
        if (!fm || !index.has(fm.name)) {
          const dirOf = path.dirname(p)
          const loc = { dir: dirOf, packRoot: root, rel: path.relative(root, dirOf) }
          if (fm) index.set(fm.name, loc)
          else index.set(path.basename(dirOf), loc)
        }
      }
    }
  }
  visit(SKILL_PROFILES_NM, 8, null)
  return index
}

/** 读取包根的 package.json name(失败回落目录名)。 */
function packDisplayName(packRoot) {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(packRoot, 'package.json'), 'utf8'))
    if (pkg && typeof pkg.name === 'string' && pkg.name) return pkg.name
  } catch { /* 回落 */ }
  return path.basename(packRoot)
}

/** 把「其他来源」技能名解析到磁盘位置:工作区扫描结果优先,其次插件包索引。 */
function resolveOtherSkillDirs(names, wsEntries) {
  const byName = new Map()
  for (const e of wsEntries) {
    if (!byName.has(e.name)) byName.set(e.name, { dir: e.dir, zone: 'workspace', disabled: e.dirDisabled, label: e.sourceLabel })
  }
  const packIndex = indexPackSkills()
  for (const [name, loc] of packIndex) {
    if (byName.has(name)) continue
    byName.set(name, {
      dir: loc.dir, zone: 'pack',
      disabled: /^[\\/]skills-disabled/.test(loc.rel) || loc.rel.split(/[\\/]/)[0] === 'skills-disabled',
      label: '插件包 ' + packDisplayName(loc.packRoot),
      packRoot: loc.packRoot, rel: loc.rel,
    })
  }
  const out = {}
  for (const n of names) {
    const hit = byName.get(n)
    if (hit) out[n] = hit
  }
  return out
}

/** 分类技能条目绝对路径:watchable(受监听根,热生效)或 pack(包内检疫,重启生效)。 */
function classifySkillEntryDir(dir) {
  if (typeof dir !== 'string' || dir.length === 0 || dir.length > 500 || !path.isAbsolute(dir)) return null
  let abs
  try { abs = fs.realpathSync(dir) } catch { return null }
  const entryName = path.basename(abs)
  if (!isSafeSkillEntryName(entryName)) return null
  const parent = path.dirname(abs)
  const parentName = path.basename(parent)
  const gpName = path.basename(path.dirname(parent))
  if ((parentName === 'skills' || parentName === 'skills-disabled') && (gpName === '.dsh' || gpName === '.agents')) {
    return { abs, entryName, zone: 'watchable', parent, parentName, disabled: parentName === 'skills-disabled' }
  }
  const rel = path.relative(SKILL_PROFILES_NM, abs)
  if (rel && !rel.startsWith('..') && !path.isAbsolute(rel)) {
    // 只认真实技能条目:含 SKILL.md 的目录或平铺 .md 文件(包内其他路径一律拒绝)
    const stat = fs.statSync(abs)
    const looksSkill = stat.isDirectory()
      ? fs.existsSync(path.join(abs, 'SKILL.md'))
      : /\.(md|MD)$/.test(entryName)
    if (!looksSkill) return null
    let packRoot = null
    let cur = abs
    for (let i = 0; i < 12 && cur !== SKILL_PROFILES_NM; i++) {
      cur = path.dirname(cur)
      if (cur === path.dirname(cur)) break
      if (fs.existsSync(path.join(cur, 'package.json'))) { packRoot = cur; break }
    }
    if (!packRoot) return null
    const relToPack = path.relative(packRoot, abs)
    return {
      abs, entryName, zone: 'pack', packRoot, rel: relToPack,
      disabled: relToPack.split(/[\\/]/)[0] === 'skills-disabled',
    }
  }
  return null
}

/** dir 模式启停:watchable 根姊妹目录互移;pack 根内 skills-disabled/ 检疫互移。 */
function toggleSkillEntryDir(dir, disable) {
  const c = classifySkillEntryDir(dir)
  if (!c) return { ok: false, error: '无效的技能条目位置' }
  if (c.disabled === disable) return { ok: false, error: disable ? '技能已处于禁用状态(请刷新)' : '技能已处于启用状态(请刷新)' }
  let to
  if (c.zone === 'watchable') {
    const sibling = c.disabled ? c.parent.slice(0, -SKILL_DISABLED_SUFFIX.length) : c.parent + SKILL_DISABLED_SUFFIX
    to = path.join(sibling, c.entryName)
  } else {
    const stripped = c.rel.slice('skills-disabled'.length).replace(/^[\\/]/, '')
    to = disable ? path.join(c.packRoot, 'skills-disabled', c.rel) : path.join(c.packRoot, stripped)
  }
  try {
    fs.mkdirSync(path.dirname(to), { recursive: true })
    fs.renameSync(c.abs, to)
  } catch (e) { return { ok: false, error: `移动失败: ${e.message}` } }
  if (c.zone === 'pack' && !disable) {
    // 尽力清掉检疫路径上腾空的目录(从条目原位置向上到 skills-disabled 根)
    const quarantineRoot = path.join(c.packRoot, 'skills-disabled')
    let d = path.dirname(c.abs)
    while (d.length > quarantineRoot.length && d.startsWith(quarantineRoot)) {
      try { fs.rmdirSync(d) } catch { break }
      d = path.dirname(d)
    }
    try { fs.rmdirSync(quarantineRoot) } catch { /* 非空则保留 */ }
  }
  return { ok: true, zone: c.zone }
}

/** dir 模式删除:递归删除条目(启用/禁用/检疫位置均可)。 */
function deleteSkillEntryDir(dir) {
  const c = classifySkillEntryDir(dir)
  if (!c) return { ok: false, error: '无效的技能条目位置' }
  try { fs.rmSync(c.abs, { recursive: true, force: true }) } catch (e) { return { ok: false, error: `删除失败: ${e.message}` } }
  return { ok: true, zone: c.zone }
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
// 自定义皮肤:用户导入的图片/视频存 ~/.dsh/desktop-assets/,
// 经壳静态服务(30801)供 WebUI 引用(跨源 CORS 已放行 3080)。
// (氛围音频已随 2026-09-04 移除:音频类型不再接收/列出,遗留 audio/volume 状态字段不再透出)
// Wallpaper Engine:扫描 Steam 创意工坊内容目录(app 431960)的 project.json,
// video 类型壁纸(mp4 + preview)可直接应用;scene 类型是打包格式,仅展示不可用。

const SKIN_ASSETS_DIR = path.join(DSH_HOME, 'desktop-assets')
const WE_APP_ID = '431960'

const SKIN_MIME = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp', '.bmp': 'image/bmp',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime', '.mkv': 'video/x-matroska',
}

function skinKindOf(name) {
  const ext = path.extname(name || '').toLowerCase()
  if (!SKIN_MIME[ext]) return null
  return SKIN_MIME[ext].startsWith('image/') ? 'image' : 'video'
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
  const s = cfg.skin || { bg: null, dim: 0.45 }
  // [R48→问题71] glass 默认关:仅用户显式开启才生效,避免启动/设置页切模块时玻璃自启
  // [2026-09-04] 氛围音频移除:遗留 audio/volume 字段不再透出(首次写回配置即消失)
  const { audio, volume, ...rest } = s
  return { glass: false, ...rest }
}

function setSkinState(patch) {
  const cur = getSkinState()
  const next = {
    bg: 'bg' in patch ? patch.bg : cur.bg,
    dim: typeof patch.dim === 'number' ? Math.min(0.9, Math.max(0, patch.dim)) : cur.dim,
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

// 浅解析 settings.yaml 的全部 provider 块。返回 [{name, nested, apiKeyEnv, baseURL, ids[], names{id:name}}]
// [q99-增强] 同步收集模型显示名(name 字段):前端传来的是选择器显示名(如 DeepSeek-V4-Flash),
// 需要 id/name 双通道匹配才能定位到用户界面所选的模型。
function collectEnhanceBlocks() {
  const settings = fs.readFileSync(path.join(DSH_HOME, 'settings.yaml'), 'utf8')
  const lines = settings.split(/\r?\n/)
  const blocks = []
  const collectPairs = (text) => {
    const pairs = [...text.matchAll(/-\s*id:\s*(\S+)(?:\s*\r?\n\s*name:\s*(.+))?/g)]
      .map((x) => ({ id: x[1], name: x[2] ? x[2].trim().replace(/^["']|["']$/g, '') : x[1] }))
    return { ids: pairs.map((p) => p.id), pairs }
  }
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
    const own = collectPairs(ownBody.join('\n'))
    if (directKeyEnv || own.ids.length) {
      blocks.push({ name: top.name, nested: false, apiKeyEnv: directKeyEnv, baseURL: directBase, ids: own.ids, pairs: own.pairs })
    }
    if (provIdx >= 0) {
      const provIndent = /^(\s+)providers:\s*$/.exec(body[provIdx])[1].length
      // 子段头 = providers 的直接子键(缩进恰好为下一级)。[q101] 旧逻辑以「深于 providers:」判定,
      // 会把子段内部的 retryPolicy:/models:/input:/reasoningEfforts: 等更深键误当兄弟子段头,
      // 子段文本在 retryPolicy 处被截断 → models 全丢、Aliyun 段永远无候选(增强流量被迫回落官方端点)。
      // 修正:取所有候选头行的最小缩进为子段层级,仅该层级的行才算子段头。
      const rawHeads = []
      for (let k = provIdx + 1; k < body.length; k++) {
        const sm = /^(\s+)([\w-]+):\s*$/.exec(body[k])
        if (sm && sm[1].length > provIndent) rawHeads.push({ name: sm[2], indent: sm[1].length, start: k })
      }
      const minIndent = rawHeads.length ? Math.min(...rawHeads.map((h) => h.indent)) : 0
      const subStarts = rawHeads.filter((h) => h.indent === minIndent)
      subStarts.forEach((sub, si) => {
        const subEnd = si + 1 < subStarts.length ? subStarts[si + 1].start : body.length
        const subLines = []
        for (let k = sub.start + 1; k < subEnd; k++) {
          const ln = body[k]
          if (ln.trim() !== '' && /^\s*/.exec(ln)[0].length <= sub.indent) break
          subLines.push(ln)
        }
        const subText = subLines.join('\n')
        const subPairs = collectPairs(subText)
        blocks.push({
          name: sub.name,
          nested: true,
          apiKeyEnv: /apiKeyEnv:\s*(\S+)/.exec(subText)?.[1],
          baseURL: /baseURL:\s*(\S+)/.exec(subText)?.[1],
          ids: subPairs.ids,
          pairs: subPairs.pairs,
        })
      })
    }
  })
  return blocks
}

// 候选链:打分排序后的可用 provider 列表(有 key 有模型才入列,上限 3 个)。
// 返回 { candidates: [{name, baseURL, apiKey, model}], reason? }
// reason 仅在无候选时给出(缺默认 provider 指向 / 无任何 llm 段 / 全部缺 key 或缺模型)。
// [q99-增强] preferredModel:前端传来的界面当前所选模型(显示名或 id)。命中某 provider
// 目录(id 或 name 双通道)时该 provider 加分置顶,且直接用命中的模型 id 发请求——
// 保证增强所用模型 = 用户眼前所选,不再只看 settings 默认模型(状态同步根因修复)。
function resolveEnhanceCandidates(preferredModel) {
  try {
    const settings = fs.readFileSync(path.join(DSH_HOME, 'settings.yaml'), 'utf8')
    const defProv = /agent-default-model:\s*\n\s*provider:\s*(\S+)/.exec(settings)?.[1]
    const defModel = /agent-default-model:\s*\n\s*provider:[^\n]*\n\s*model:\s*(\S+)/.exec(settings)?.[1]
    const blocks = collectEnhanceBlocks()
    if (!defProv && !preferredModel) return { candidates: [], reason: 'settings.yaml 未配置 agent-default-model.provider' }
    if (!blocks.length) return { candidates: [], reason: 'settings.yaml 无任何 llm-* provider 段' }
    const pref = (preferredModel || '').trim().toLowerCase()
    const cands = []
    for (const b of blocks) {
      const apiKey = parseEnhanceCredentialsKey(b.apiKeyEnv)
      if (!apiKey) continue // 缺 key 的段跳过(可能换下一候选就能用)
      // 界面所选模型优先:name(显示名)精确命中最可信(用户眼前所见,+16);仅 id 命中次之(+12,
      // 撞名场景归属存疑——双 provider 托管同名模型 id 时,显示名后缀是唯一的消歧信息)。
      // [q101] Aliyun MaaS 托管 deepseek 系模型与官方段 id 全同,显示名加 (Aliyun) 后缀后,
      // 前端探针传来的名字天然携带归属,name 精确命中即正确路由,杜绝增强流量误入官方端点。
      const prefNameHit = pref ? (b.pairs || []).find((p) => (p.name || '').toLowerCase() === pref) : null
      const prefIdHit = prefNameHit ? null : (pref ? b.ids.find((x) => x.toLowerCase() === pref) : null)
      const model = prefNameHit ? prefNameHit.id : (prefIdHit || ((defModel && b.ids.includes(defModel)) ? defModel : b.ids[0]))
      if (!model) continue
      // [R69] pi-ai 内置目录 provider 的 OpenAI 兼容端点镜像。目录 provider(如 zai)在
      // settings.yaml 里不写 baseURL——端点在 pi-ai 包目录中,壳的 YAML 解析看不见;
      // 旧逻辑直接回落 DeepSeek 官方缺省 → zai 的 key/model 打到 DeepSeek 端点,
      // 401「api key invalid」,8-24 起会话摘要与 /enhance 全部停摆。minimax-cn 在
      // settings 里写的是 anthropic 端点(/anthropic),壳只发 OpenAI 风格
      // /chat/completions,故一并镜像其 OpenAI 兼容端点。
      const PI_AI_OPENAI_BASE = {
        zai: 'https://api.z.ai/api/coding/paas/v4',
        'zai-coding-cn': 'https://open.bigmodel.cn/api/coding/paas/v4',
        'minimax-cn': 'https://api.minimaxi.com/v1',
      }
      const baseURL = (PI_AI_OPENAI_BASE[b.name] || b.baseURL || 'https://api.deepseek.com/v1').replace(/\/$/, '') // DeepSeek 官方缺省
      let score = 0
      if (prefNameHit) score += 16 // 显示名精确命中(最高优先,用户意图压过一切默认)
      else if (prefIdHit) score += 12 // 仅 id 命中(撞名时归属存疑,低于 name 精确)
      if (b.name === defProv) score += 8 // 名字命中默认 provider(精确段)
      if (defModel && b.ids.includes(defModel)) score += 2 // 目录含默认模型(比"目录第一个"更贴用户意图)
      if (!b.baseURL) score += 1 // 官方缺省端点优先(第三方端点模型目录常与官方 id 不一致)
      cands.push({ name: b.name, baseURL, apiKey, model, score, prefHit: !!(prefNameHit || prefIdHit) })
    }
    if (!cands.length) return { candidates: [], reason: `llm-* 段均缺可用 key(检查 .credentials.yaml 的 ${[...new Set(blocks.map((b) => b.apiKeyEnv).filter(Boolean))].join('/') || 'apiKeyEnv'} 条目)` }
    cands.sort((a, b2) => b2.score - a.score)
    return { candidates: cands.slice(0, 3).map(({ name, baseURL, apiKey, model, prefHit }) => ({ name, baseURL, apiKey, model, prefHit })) }
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

// ---------- 会话删除:归档后的物理清除(会话菜单「删除会话」,2026-09-04) ----------
// wire 层没有任何 session 删除能力,归档仅把 id 挪进 workspace.json 的
// archivedSessionIds(客户端过滤隐藏),日志数据全留。这里做真正清除:会话日志目录 +
// 各注册表/缓存中的悬挂引用。host 运行中其内存态可能回写 workspace.json 恢复悬挂
// id —— 展示无害(列表以 session.list 扫盘为准、归档过滤对未知 id 兼容);彻底一致
// 需上游提供 session.delete,超出壳范围。

const SESSION_ID_RE = /^[A-Za-z0-9_-]{1,80}$/

/** JSON 原子写(tmp+rename,防读半截)。 */
function atomicWriteJson(file, value, indent = 2) {
  const tmp = `${file}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(value, null, indent))
  fs.renameSync(tmp, file)
}

/**
 * POST /sessions/delete 执行体:清会话日志目录 + 剔除持久化引用。
 * 日志目录在 ~/.dsh/sessions/<projectKey>/<id>/,两代命名(裸 id 与 session-<id>)都清;
 * 引用清理全部尽力而为(单处失败记入 warnings 不中断),调用方先归档成功才会走到这里。
 * @returns {{ ok: boolean, removedDirs: string[], warnings: string[] }}
 */
function deleteSessionData(sessionId) {
  if (typeof sessionId !== 'string' || !SESSION_ID_RE.test(sessionId)) {
    return { ok: false, error: '参数必须是 { sessionId: string }' }
  }
  const warnings = []
  const removedDirs = []
  const bare = sessionId.replace(/^session-/, '')
  const names = new Set([sessionId, bare])
  // 1. 会话日志目录
  const sessionsRoot = path.join(DSH_HOME, 'sessions')
  try {
    for (const pk of fs.readdirSync(sessionsRoot)) {
      const pkPath = path.join(sessionsRoot, pk)
      let pkStat = null
      try { pkStat = fs.statSync(pkPath) } catch { continue }
      if (!pkStat.isDirectory()) continue
      for (const name of fs.readdirSync(pkPath)) {
        if (!names.has(name)) continue
        try {
          fs.rmSync(path.join(pkPath, name), { recursive: true, force: true })
          removedDirs.push(`${pk}/${name}`)
        } catch (e) { warnings.push(`日志目录删除失败 ${pk}/${name}: ${e.message}`) }
      }
    }
  } catch (e) { warnings.push(`sessions 根扫描失败: ${e.message}`) }
  // 2. workspace 注册表:归档集 + 各工作区 sessionIds 记账槽
  const wsFile = path.join(DSH_HOME, 'storages', 'workspace.json')
  try {
    const ws = JSON.parse(fs.readFileSync(wsFile, 'utf8'))
    let touched = false
    if (ws && ws.global && Array.isArray(ws.global.archivedSessionIds)) {
      const next = ws.global.archivedSessionIds.filter((id) => id !== sessionId && id !== bare)
      if (next.length !== ws.global.archivedSessionIds.length) { ws.global.archivedSessionIds = next; touched = true }
    }
    const rows = ws && ws.tables && ws.tables.workspaces
    if (rows && typeof rows === 'object') {
      for (const key of Object.keys(rows)) {
        const row = rows[key]
        if (row && Array.isArray(row.sessionIds)) {
          const next = row.sessionIds.filter((id) => id !== sessionId && id !== bare)
          if (next.length !== row.sessionIds.length) { row.sessionIds = next; touched = true }
        }
      }
    }
    if (touched) atomicWriteJson(wsFile, ws)
  } catch (e) { warnings.push(`workspace.json 清理失败: ${e.message}`) }
  // 3. 会话投影缓存(list 元数据:title/blank/lastPromptAt,残留会成幽灵条目)
  const projFile = path.join(DSH_HOME, 'storages', 'session_projcache.json')
  try {
    const proj = JSON.parse(fs.readFileSync(projFile, 'utf8'))
    const rows = proj && proj.tables && proj.tables.sessions
    if (rows && typeof rows === 'object' && (rows[sessionId] || rows[bare])) {
      delete rows[sessionId]
      delete rows[bare]
      atomicWriteJson(projFile, proj)
    }
  } catch (e) { warnings.push(`session_projcache.json 清理失败: ${e.message}`) }
  for (const n of names) {
    try { fs.rmSync(path.join(DSH_HOME, 'storages', 'session_projcache', 'sessions', `${n}.json`), { force: true }) } catch { /* 无则跳过 */ }
  }
  // 4. 壳摘要缓存(R37/R40,保持其 1 空格缩进写法)
  try {
    const cache = JSON.parse(fs.readFileSync(SUMMARY_FILE, 'utf8'))
    if (cache && typeof cache === 'object' && (cache[sessionId] !== undefined || cache[bare] !== undefined)) {
      delete cache[sessionId]
      delete cache[bare]
      atomicWriteJson(SUMMARY_FILE, cache, 1)
    }
  } catch { /* 首次无缓存 */ }
  return { ok: true, removedDirs, warnings }
}

// ---------- [R80] 归档清单:归档集 + 投影元数据 + 磁盘占用/幽灵识别 ----------
// 归档= workspace.json archivedSessionIds(全界面隐藏、数据全留)。这里只读聚合:
// 顺序保持归档序;标题/最后活动取自投影缓存;磁盘占用扫 sessions/<projectKey>/<id>
// (两代命名都认);ghost= 磁盘已无会话目录(「删除会话」清理后的悬挂引用)。
function listArchivedSessions() {
  let ids = []
  try {
    const ws = JSON.parse(fs.readFileSync(path.join(DSH_HOME, 'storages', 'workspace.json'), 'utf8'))
    if (ws && ws.global && Array.isArray(ws.global.archivedSessionIds)) ids = ws.global.archivedSessionIds
  } catch { /* 注册表缺失/损坏:按空集处理 */ }
  let proj = {}
  try {
    const p = JSON.parse(fs.readFileSync(path.join(DSH_HOME, 'storages', 'session_projcache.json'), 'utf8'))
    proj = (p && p.tables && p.tables.sessions) || {}
  } catch { /* 无投影缓存:标题回退 id */ }
  // [批次155 2026-09-12] 0.1.5 起投影分片化(storages/session_projcache/sessions/<id>.json),
  // 旧版单文件不再增长 —— 只读旧表时新归档行的标题/时间全部退化成 id 前缀(活体实证:
  // 「识别」行显示为 496a7d87)。逐 id 先读分片(record.rows/record.identity 与旧表同构),
  // 分片缺席再回退旧表。
  const shardDir = path.join(DSH_HOME, 'storages', 'session_projcache', 'sessions')
  const shardRow = (sid, bare) => {
    for (const name of [sid, bare]) {
      try {
        const j = JSON.parse(fs.readFileSync(path.join(shardDir, `${name}.json`), 'utf8'))
        const rec = (j && j.record) || j
        if (rec && rec.rows) return rec
      } catch { /* 分片缺席:回退旧表 */ }
    }
    return null
  }
  const sessionsRoot = path.join(DSH_HOME, 'sessions')
  const sessions = []
  let totalBytes = 0
  for (const id of ids) {
    if (typeof id !== 'string' || !SESSION_ID_RE.test(id)) continue
    const bare = id.replace(/^session-/, '')
    const row = shardRow(id, bare) || proj[id] || proj[bare] || {}
    let bytes = 0
    let projectKey = ''
    try {
      for (const pk of fs.readdirSync(sessionsRoot)) {
        const pkPath = path.join(sessionsRoot, pk)
        let st = null
        try { st = fs.statSync(pkPath) } catch { continue }
        if (!st.isDirectory()) continue
        for (const name of [id, bare]) {
          const dir = path.join(pkPath, name)
          try {
            if (!fs.statSync(dir).isDirectory()) continue
          } catch { continue }
          let size = 0
          for (const f of fs.readdirSync(dir)) {
            try { size += fs.statSync(path.join(dir, f)).size } catch { /* 单文件探测失败忽略 */ }
          }
          if (projectKey === '' || size > bytes) { projectKey = pk; bytes = size }
        }
      }
    } catch { /* sessions 根不可读:按幽灵处理 */ }
    totalBytes += bytes
    // 投影行结构: rows.title.val(标题) / rows.sessionListMetadata.val.lastPromptAt(epoch ms)
    // / identity.cwd(会话工作目录,比 sessions 目录名的转义路径更可读)。
    const rows = row.rows || {}
    const listMeta = (rows.sessionListMetadata && rows.sessionListMetadata.val) || {}
    sessions.push({
      id,
      title: rows.title && typeof rows.title.val === 'string' ? rows.title.val : '',
      lastActivityAt: typeof listMeta.lastPromptAt === 'number' ? new Date(listMeta.lastPromptAt).toISOString() : '',
      cwd: row.identity && typeof row.identity.cwd === 'string' ? row.identity.cwd : '',
      projectKey,
      bytes,
      ghost: projectKey === '',
    })
  }
  return { ok: true, sessions, totalBytes }
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
        // [q99-增强] model:前端探测到的界面当前所选模型(显示名),候选链优先匹配其所属 provider
        const { text, context, model: preferredModel } = JSON.parse(body || '{}')
        if (typeof text !== 'string' || !text.trim()) return send(400, { ok: false, error: '输入为空' })
        if (text.length > 16000) return send(400, { ok: false, error: '文本过长(上限 16000 字符)' })
        const { candidates, reason } = resolveEnhanceCandidates(typeof preferredModel === 'string' ? preferredModel : '')
        if (!candidates.length) {
          log(`[enhance] 无可用 provider: ${reason}`)
          // 可操作引导(替代裸报错):指明配置路径与前置动作,用户可自助恢复
          return send(409, { ok: false, error: `未找到可用模型:${reason}。请先在「设置 → 模型」配置 provider 与凭据,或在会话中选择一个可用模型后重试` })
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
        // [q101] 跨平台 fallback 闸:请求方显式指定了模型(preferredModel)时,只允许在
        // 「命中该模型的候选」间切换(同一个 llm-* 段的同名命中不视为跨平台);
        // 绝不因首选失败(401/403/模型不存在)静默换到另一个平台——那会把 Aliyun 会话的
        // 增强流量漏到 DeepSeek 官方端点产生双计费(本问题核心病灶)。
        // 未指定模型(旧前端)才允许全候选链 fallback(历史行为保留)。
        const gatePool = (typeof preferredModel === 'string' && preferredModel.trim())
          ? candidates.filter((c) => c.prefHit)
          : candidates
        if (!gatePool.length) {
          log(`[enhance] 指定模型无可用候选: ${preferredModel}`)
          return send(409, { ok: false, error: `界面所选模型「${preferredModel}」在已配置 provider 中无可用凭据或端点,请在「设置 → 模型」检查该模型所属 provider 的配置,或改选其他模型` })
        }
        for (const prov of gatePool) {
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
          const rawOut = data?.choices?.[0]?.message?.content
          if (typeof rawOut !== 'string' || !rawOut.trim()) {
            log('[summary] provider 返回空内容')
            return send(502, { ok: false, error: 'provider 返回空内容' })
          }
          // [批次104] 思考泄漏防线:模型偶发把思考正文泄进 content(08-30 实测
          // 「<think>The user is asking to r」被下方 30 字截断切掉闭合标签,成为永久脏缓存,
          // 展示层剥不掉、回填泵见"有摘要"不重生成)。闭合段剥掉;未闭合 <think> 开头
          // (整段皆思考)剥完必空 → 按空内容拒收,不写缓存。
          const out = rawOut.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/<think>[\s\S]*$/i, '')
          if (!out.trim()) {
            log('[summary] provider 输出为思考泄漏,拒收')
            return send(502, { ok: false, error: 'provider 输出为思考泄漏' })
          }
          // [R69] 推理模型偶尔无视"只输出摘要正文"而输出多行解释/代码块:只取第一行,
          // 再去标签前缀(摘要:/主题:)与首尾引号、行尾标点,最后 30 字封顶。
          const summary = out.trim()
            .replace(/^["'“”\s]+/, '')
            .split(/\r?\n/)[0]
            .replace(/^(?:摘要|标题|主题)\s*[::]\s*/, '')
            .replace(/["'“”。.!！\s]+$/, '')
            .slice(0, 30)
            .trim()
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
        if (!kind) return send(400, { ok: false, error: '不支持的类型(支持 jpg/png/gif/webp/bmp、mp4/webm/mov/mkv)' })
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
        // [问题121] 统一入口:冷却期内的重复触发按「已完成」处理(服务刚重启过),
        // 外部调用方(市场 helper)拿到 accepted 即可,其 /state 轮询立即成立。
        const r = requestRestart('api')
        if (!r.ok && r.reason === 'busy') return send(409, { accepted: false, error: '已有切换或重启在进行' })
        if (!r.ok) return send(202, { accepted: true, note: '冷却期内吸收:服务刚重启过,本次请求视为已完成' })
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
        // [v0.5.17] 带体:插件兼容性确认往返(confirmCompat/target)随请求传入
        let applyBody = ''
        for await (const chunk of req) applyBody += chunk
        let payload = {}
        try { payload = JSON.parse(applyBody || '{}') } catch { payload = {} }
        return send(200, await applyDshLatest(payload))
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
      // ---------- [v0.5.1] 运行时轨道与联合工作区(Web UI 更新区经此驱动) ----------
      if (req.method === 'GET' && url.pathname === '/runtime/state') {
        return send(200, runtimeStatePayload())
      }
      if (req.method === 'POST' && url.pathname === '/runtime/track') {
        let body = ''
        for await (const chunk of req) body += chunk
        const { track } = JSON.parse(body || '{}')
        if (track !== 'official' && track !== 'local') return send(400, { ok: false, error: 'track 必须为 official 或 local' })
        if (switching || restarting) return send(409, { ok: false, error: '已有切换或重启在进行' })
        if (track === (cfg.dshRuntime === 'local' ? 'local' : 'official')) {
          return send(200, { ok: true, note: '已是该轨道', state: runtimeStatePayload() })
        }
        // 202 + 轮询惯用法:前端轮询 /runtime/state 至 !switching(同 /updates/apply-dsh)
        switching = true
        runTrackSwitch(track).finally(() => { switching = false })
        return send(202, { ok: true, accepted: true })
      }
      if (req.method === 'POST' && url.pathname === '/federation/toggle') {
        let body = ''
        for await (const chunk of req) body += chunk
        const { enabled } = JSON.parse(body || '{}')
        if (typeof enabled !== 'boolean') return send(400, { ok: false, error: 'enabled 必须为布尔值' })
        if (!runtimeStatePayload().federated.supported) {
          return send(400, { ok: false, error: '联合工作区仅本地构建轨道可用(官方包无此功能代码);请先切换运行时轨道为本地构建' })
        }
        const r = writeFederatedSwitch(enabled)
        if (!r.ok) return send(400, { ok: false, error: r.error })
        log(`[dshRuntime] 联合工作区灰度开关 → ${enabled ? '开' : '关'}`)
        return send(200, { ok: true, enabled, state: runtimeStatePayload() })
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
      if (req.method === 'POST' && url.pathname === '/skills/others') {
        let body = ''
        for await (const chunk of req) body += chunk
        const { paths, names } = JSON.parse(body || '{}')
        const wsPaths = Array.isArray(paths) ? paths.filter((p) => typeof p === 'string' && p.length > 1 && p.length < 500).slice(0, 64) : []
        const wanted = Array.isArray(names) ? names.filter((n) => typeof n === 'string' && n.length > 0 && n.length < 200).slice(0, 400) : []
        const entries = []
        for (const p of wsPaths) entries.push(...scanWorkspaceSkillRoots(p))
        return send(200, { ok: true, entries, resolved: resolveOtherSkillDirs(wanted, entries) })
      }
      if (req.method === 'POST' && url.pathname === '/skills/toggle') {
        let body = ''
        for await (const chunk of req) body += chunk
        const { source, name, disabled, dir } = JSON.parse(body || '{}')
        if (dir !== undefined) {
          if (typeof disabled !== 'boolean') return send(400, { ok: false, error: '参数必须是 { dir: string, disabled: boolean }' })
          const result = toggleSkillEntryDir(dir, disabled)
          if (!result.ok) return send(400, result)
          return send(200, { ok: true, zone: result.zone, entries: listSkills() })
        }
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
        const { source, name, dir } = JSON.parse(body || '{}')
        if (dir !== undefined) {
          if (typeof dir !== 'string') return send(400, { ok: false, error: '参数必须是 { dir: string }' })
          const result = deleteSkillEntryDir(dir)
          if (!result.ok) return send(400, result)
          return send(200, { ok: true, zone: result.zone, entries: listSkills() })
        }
        if (typeof source !== 'string' || typeof name !== 'string') {
          return send(400, { ok: false, error: '参数必须是 { source: string, name: string }' })
        }
        const result = deleteSkillEntry(source, name)
        if (!result.ok) return send(400, result)
        return send(200, { ok: true, entries: listSkills() })
      }
      // ---------- [R80] 归档会话清单(归档管理页数据源) ----------
      if (req.method === 'GET' && url.pathname === '/sessions/archived') {
        return send(200, listArchivedSessions())
      }
      // ---------- 会话删除:归档后的物理清除(会话菜单「删除会话」) ----------
      if (req.method === 'POST' && url.pathname === '/sessions/delete') {
        let body = ''
        for await (const chunk of req) body += chunk
        const { sessionId } = JSON.parse(body || '{}')
        const result = deleteSessionData(sessionId)
        if (!result.ok) return send(400, result)
        log(`[sessions] 已删除会话 ${sessionId}: 日志目录 ${result.removedDirs.length} 处${result.warnings.length ? `, 警告: ${result.warnings.join('; ')}` : ''}`)
        return send(200, result)
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
      // 同主窗:沙箱化 preload 加载器在含引号路径下必炸(设置页 IPC 全靠桥)。
      sandbox: false,
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
    runtime: runtimeStatePayload(),
  }))
  ipcMain.on('dsh-settings:check-dsh-update', () => { checkDshUpdate(true) })
  ipcMain.on('dsh-settings:check-shell-update', () => { checkShellUpdate() })
  // [v0.5.1] 运行时轨道切换:全程 await 编排(含回滚),进度经 dsh-settings:status 推送
  ipcMain.handle('dsh-runtime:set-track', async (_e, mode) => {
    if (mode !== 'official' && mode !== 'local') return { ok: false, error: 'track 必须为 official 或 local' }
    if (switching || restarting) return { ok: false, error: '已有切换或重启在进行' }
    if (mode === (cfg.dshRuntime === 'local' ? 'local' : 'official')) {
      return { ok: true, note: '已是该轨道', state: runtimeStatePayload() }
    }
    switching = true
    try {
      const r = await runTrackSwitch(mode)
      return { ...r, state: runtimeStatePayload() }
    } finally { switching = false }
  })
  // [v0.5.1] 联合工作区灰度开关:仅本地轨可写(官方包 schema 无此字段)
  ipcMain.handle('dsh-federation:set', (_e, enabled) => {
    if (typeof enabled !== 'boolean') return { ok: false, error: 'enabled 必须为布尔值' }
    if (!runtimeStatePayload().federated.supported) {
      return { ok: false, error: '联合工作区仅本地构建轨道可用(官方包无此功能代码);请先切换运行时轨道为本地构建' }
    }
    const r = writeFederatedSwitch(enabled)
    if (!r.ok) return { ok: false, error: r.error }
    log(`[dshRuntime] 联合工作区灰度开关 → ${enabled ? '开' : '关'}`)
    return { ok: true, enabled, state: runtimeStatePayload() }
  })
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
    { label: '重载界面', click: () => { for (const w of mainWindows) if (!w.isDestroyed()) snapshotCover(w, () => w.webContents.reloadIgnoringCache()) } }, // [问题108] 强刷绕缓存:插件文件热改后普通重载可能吃旧 ?rev 缓存跑旧码;[主题闪变] 快照遮罩盖住重载空档
    { label: '重启 dsh 服务', click: () => { requestRestart('tray') } },
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
  const bootT0 = Date.now() // [R74] 冷启动/复用全链路耗时观测
  // [q195 2026-09-05] 先探测后重放:补丁重放是同步 fs 扫描,原实现放在端口探测之前,
  // 复用路径(服务已在跑)也要白吃这段主进程阻塞,启动页跟着冻结。重排后复用路径
  // 立即揭窗,重放推迟 5s 后台执行(dsh cordis watcher 对补丁热应用,晚几秒无害);
  // spawn 路径维持「重放必须在 spawn 前」的原语义(防坏 patch 崩溃循环)。
  stage('probe')
  if (await isPortUp()) {
    setTimeout(() => {
      try {
        const r = loadFreshReplayer()((l) => log(l))
        if (!r.ok) notify('DeepSeek Harness', '本地插件补丁重放失败,详见日志(桌面日志目录)。')
      } catch (e) { log(`补丁重放异常: ${e.message}`) }
    }, 5_000)
    // [问题99] 常驻守护:市场/CLI/pnpm 对账可能在壳运行中覆盖 node_modules 里的补丁产物
    // (历史上市场批量更新、卸载流程都发生过),boot/startDsh 时点重放覆盖不到这些窗口。
    // 每 45s 幂等重放一次——已是补丁态时哨兵快速通道零写盘零开销;状态翻转才记日志。
    startPatchGuardian()
    log(`检测到 dsh 服务已在运行,直接复用(壳启动 ${((Date.now() - bootT0) / 1000).toFixed(1)}s)`)
    // [q196] 'ready'(100%/鲸鱼谢幕)由 bootGate 在揭窗节拍时触发;此阶段先报界面加载中
    stage('ui')
    showMain(dshUrl())
    startPreheatLoop()
    return
  }
  // 本地补丁自动重放:插件经 pnpm 更新覆盖 node_modules 后,壳启动即恢复全部本地定制
  // (better-sidebar 浮动卡片/底部面板剔除 + node-nav 左侧圆点导航),失败仅告警不阻断启动。
  // [q197] 这份是 spawn 路径的唯一次重放(原 boot 与 startDsh 各重放一次);耗时入日志,
  // 下一轮提速以此为准。startDsh 由调用方传 skipReplay,托盘重启/自动恢复语义不变。
  const replayT0 = Date.now()
  try {
    const r = loadFreshReplayer()((l) => log(l))
    if (!r.ok) notify('DeepSeek Harness', '本地插件补丁重放失败,详见日志(桌面日志目录)。')
  } catch (e) { log(`补丁重放异常: ${e.message}`) }
  log(`补丁重放耗时 ${Date.now() - replayT0}ms`)
  startPatchGuardian()
  stage('spawn')
  if (!startDsh({ skipReplay: true })) {
    closeSplash()
    const win = [...mainWindows][0]
    if (win) { win.loadFile('error.html', { query: { reason: 'no-npx' } }); win.show() }
    return
  }
  stage('wait')
  log('等待 dsh 服务就绪...')
  const ok = await waitForPort(START_TIMEOUT_MS)
  if (ok) {
    log(`dsh 服务就绪,加载 Web UI(壳启动至就绪 ${((Date.now() - bootT0) / 1000).toFixed(1)}s)`)
    restartAttempts = 0
    // [q196] 'ready'(100%/鲸鱼谢幕)由 bootGate 在揭窗节拍时触发;此阶段先报界面加载中
    stage('ui')
    showMain(dshUrl())
    startPreheatLoop()
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
    // [q197] 启动分段计时:此前 05:52 启动在「重放前」有 ~3.9s 无日志盲区,先量出
    // whenReady 相对模块加载的耗时,把 Electron ready + 窗口/托盘/菜单创建纳入观测。
    log(`壳 whenReady(自模块加载 ${((Date.now() - SHELL_T0) / 1000).toFixed(2)}s)`)
    // ---------- [R102 批次169 2026-09-12] 侧边卡片浏览器直连:剥离子帧防嵌入响应头 ----------
    // 主人需求:「优化侧边卡片在浏览某些网站时提示的拒绝了嵌入请求,改为直接访问」。
    // X-Frame-Options / CSP frame-ancestors 由 Chromium 网络层按响应头强制,iframe/JS 层无解,
    // better-sidebar 的「拒绝嵌入」面板与「仍然加载」都绕不过。壳层对**子帧**(resourceType =
    // subFrame,页面内 iframe 的文档响应)剥离这两类头后,iframe 直连任意站点真实源站——子资源、
    // 站内跳转、相对路径全部原生可用,优于 /browse 一次性代理(不重写相对 URL,仅能看单页)。
    // 仅动 subFrame:主帧(壳内 dsh Web UI 自己)的响应头原样保留;iframe 沙箱(better-sidebar
    // 不给 allow-same-origin)照旧隔离 GUI。配套 client 侧补丁 [R102](patches.cjs)不再采信
    // better-sidebar 探针的 blocked 判定——探针走 dsh 服务端 fetch 读上游原始头,对壳剥离不可见。
    // 生效条件:改 main.js 必须重新打包(§二)+ 重启壳;旧壳期间被拒站点显示 Chromium 空白拒绝框。
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      if (details.resourceType !== 'subFrame' || !details.responseHeaders) return callback({})
      const headers = details.responseHeaders
      for (const name of Object.keys(headers)) {
        const lower = name.toLowerCase()
        if (lower === 'x-frame-options') { delete headers[name]; continue }
        if (lower === 'content-security-policy') {
          const kept = headers[name]
            .map((value) => value
              .split(';')
              .map((directive) => directive.trim())
              .filter((directive) => directive && !/^frame-ancestors\b/i.test(directive))
              .join('; '))
            .filter((value) => value)
          if (kept.length) headers[name] = kept
          else delete headers[name]
        }
      }
      callback({ responseHeaders: headers })
    })
    createSplash()
    createMainWindow()
    setupAppMenu()
    createTray()
    setupShellUpdater()
    setupSettingsIpc()
    startShellApi()
    boot().then(() => {
      // 就绪后异步拉版本列表(设置页更新区展示,无弹窗)。
      // 取消启动时自动检查 dsh 更新:版本锁落后于 npm 最新版时每次启动都会弹
      // 「dsh 有新版本」确认框;改为仅设置页手动检查(dsh-settings:check-dsh-update)。
      fetchAvailableVersions()
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

// [v0.5.0] plain-node 校验钩子:scripts/check-dsh-runtime.mjs 以 Module._load
// stub 替换 electron 后加载本文件,抓取 resolveDshRuntime 断言双轨四分支;
// scripts/check-boot-gate.mjs 同法抓取 bootGate 断言揭窗闸门各分支。
// Electron 主进程里 process.versions.electron 存在 → 不导出,运行态零影响。
if (!process.versions.electron && typeof module !== 'undefined' && module.exports) {
  module.exports = { resolveDshRuntime, resolveDefaultLocalDir, bootGate }
}
