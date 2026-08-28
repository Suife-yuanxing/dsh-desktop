// v0.5.0 双轨解析校验(npm run verify:runtime):
// 以 Module._load stub 替换 electron 后加载 main.js,抓取 resolveDshRuntime
// 断言双轨分支与 desktop.log breadcrumb 留痕——壳 UI 层零依赖的启动来源判定逻辑。
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import Module, { createRequire } from 'node:module'

const here = dirname(fileURLToPath(import.meta.url))
const mainFile = join(here, '..', 'main.js')
const homeRoot = process.env.USERPROFILE || process.env.HOME || tmpdir()
const logFile = join(homeRoot, '.dsh', 'logs', 'desktop.log')

const failures = []
function check(name, cond, detail = '') {
  if (cond) console.log(`  ok ${name}`)
  else failures.push(`${name}${detail ? ` — ${detail}` : ''}`)
}

function readTail(file, lines) {
  try { return readFileSync(file, 'utf8').split(/\r?\n/).slice(-lines) } catch { return [] }
}

// ---- stub electron so main.js's top level can load under plain node ----
// Pending whenReady keeps main.js's boot callback (window/tray/API creation) unrun.
const electronStub = {
  app: {
    isPackaged: false,
    getVersion: () => '0.0.0-harness',
    getPath: () => tmpdir(),
    setPath: () => {},
    quit: () => {},
    on: () => {},
    whenReady: () => new Promise(() => {}),
    requestSingleInstanceLock: () => true,
    commandLine: { appendSwitch: () => {} },
  },
  BrowserWindow: class {},
  Tray: class {},
  Menu: { buildFromTemplate: () => ({ setContextMenu() {} }), setApplicationMenu: () => {} },
  dialog: {},
  Notification: { isSupported: () => false },
  shell: {},
  ipcMain: { handle: () => {}, on: () => {} },
  net: {},
}
const originalLoad = Module._load
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'electron') return electronStub
  if (request === 'electron-updater') return { autoUpdater: {} }
  return originalLoad.call(this, request, parent, isMain)
}

console.log('check-dsh-runtime: loading main.js under stubbed electron…')
let harness
try {
  const requireFromMain = createRequire(mainFile)
  harness = requireFromMain(mainFile)
} finally {
  Module._load = originalLoad
}

if (!harness?.resolveDshRuntime || !harness.resolveDefaultLocalDir) {
  console.error('FAIL: main.js did not export { resolveDshRuntime, resolveDefaultLocalDir } under plain node')
  process.exit(1)
}

// ---- branch assertions ----
const logBefore = readTail(logFile, 40)
const r1 = harness.resolveDshRuntime({})
check('official by default', r1.mode === 'official' && r1.fallback === undefined)
const r2 = harness.resolveDshRuntime({ dshRuntime: 'official' })
check("explicit 'official'", r2.mode === 'official' && !r2.fallback)
const r3 = harness.resolveDshRuntime({ dshRuntime: 'bogus' })
check('unknown value tolerates to official', r3.mode === 'official' && !r3.fallback)

const scratch = mkdtempSync(join(tmpdir(), 'dsh-runtime-check-'))
const missingDir = join(scratch, 'absent-local')
const r4 = harness.resolveDshRuntime({ dshRuntime: 'local', dshLocalDir: missingDir })
check('missing local dir falls back', r4.mode === 'official' && r4.fallback === true, JSON.stringify(r4))

const ghostHome = join(scratch, 'empty-home')
mkdirSync(ghostHome, { recursive: true })
const r5 = harness.resolveDshRuntime({ dshRuntime: 'local', dshLocalDir: ghostHome })
check('empty local dir falls back', r5.mode === 'official' && r5.fallback === true, JSON.stringify(r5))

const goodHome = join(scratch, 'good-home')
mkdirSync(goodHome, { recursive: true })
writeFileSync(join(goodHome, 'bin.js'), '// harness probe\n')
const r6 = harness.resolveDshRuntime({ dshRuntime: 'local', dshLocalDir: goodHome })
check('valid local dir resolves to local track',
  r6.mode === 'local' && typeof r6.node === 'string' && r6.node.toLowerCase().endsWith('node.exe'),
  JSON.stringify(r6))
check('bin path joins configured dir', r6.mode === 'local' && r6.bin === join(goodHome, 'bin.js'))

const defaultDir = harness.resolveDefaultLocalDir()
check('default probe yields existing dir or null',
  defaultDir === null || existsSync(join(defaultDir, 'bin.js')),
  String(defaultDir))

const after = [...logBefore, ...readTail(logFile, 40)]
check('breadcrumb appended to desktop.log',
  after.some((l) => l.includes('[dshRuntime] local runtime missing')),
  'expected "[dshRuntime] local runtime missing" trail in ~/.dsh/logs/desktop.log')

// [v0.5.1] quiet 模式不写 breadcrumb:GET /runtime/state 等只读轮询通道不刷日志
const beforeQuiet = readTail(logFile, 5)
harness.resolveDshRuntime({ dshRuntime: 'local', dshLocalDir: missingDir }, { quiet: true })
const afterQuiet = readTail(logFile, 5)
check('quiet mode suppresses breadcrumb', JSON.stringify(afterQuiet) === JSON.stringify(beforeQuiet))

// ---- [v0.5.2] 打包态锚点回归 ----
// 0.5.1 便携版 exe 解压到 Temp 运行,execPath/__dirname 锚点向上都够不着工作区
// ⇒ 默认探测恒 null、local 轨静默回退官方(联邦开关置灰)。dev harness 里
// __dirname 必然命中真实兄弟仓,无法断言 null;回归锁两件可断言的事:
// ① electron-builder 便携版注入的 PORTABLE_EXECUTABLE_DIR 被采纳,且其命中
//    (scratch 夹具)先于 __dirname 命中(真实兄弟仓);
// ② DSH_LOCAL_DIR 环境变量覆盖一切锚点。
const repoLib = join(scratch, 'deepseek-harness', 'apps', 'cli', 'lib')
mkdirSync(repoLib, { recursive: true })
writeFileSync(join(repoLib, 'bin.js'), '// harness probe\n')
const prevExecPath = process.execPath
const prevIsPackaged = electronStub.app.isPackaged
const prevPortableEnv = process.env.PORTABLE_EXECUTABLE_DIR
const prevLocalEnv = process.env.DSH_LOCAL_DIR
try {
  electronStub.app.isPackaged = true
  delete process.env.DSH_LOCAL_DIR
  delete process.env.PORTABLE_EXECUTABLE_DIR
  process.execPath = join(scratch, 'x', 'y', 'z', 'DeepSeek Harness.exe')
  process.env.PORTABLE_EXECUTABLE_DIR = join(scratch, 'portable-dist')
  check('PORTABLE_EXECUTABLE_DIR anchor wins before dev __dirname',
    harness.resolveDefaultLocalDir() === repoLib, String(harness.resolveDefaultLocalDir()))
  process.env.DSH_LOCAL_DIR = goodHome
  check('DSH_LOCAL_DIR env overrides all anchors',
    harness.resolveDefaultLocalDir() === goodHome, String(harness.resolveDefaultLocalDir()))
} finally {
  process.execPath = prevExecPath
  electronStub.app.isPackaged = prevIsPackaged
  if (prevPortableEnv === undefined) delete process.env.PORTABLE_EXECUTABLE_DIR
  else process.env.PORTABLE_EXECUTABLE_DIR = prevPortableEnv
  if (prevLocalEnv === undefined) delete process.env.DSH_LOCAL_DIR
  else process.env.DSH_LOCAL_DIR = prevLocalEnv
}

try { rmSync(scratch, { recursive: true, force: true }) } catch { /* temp cleanup best-effort */ }

if (failures.length) {
  console.error(`\ncheck-dsh-runtime FAIL (${failures.length}):`)
  for (const f of failures) console.error(`  - ${f}`)
  process.exit(1)
}
console.log('\ncheck-dsh-runtime: all branches verified.')
