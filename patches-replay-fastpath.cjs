// dsh-desktop 补丁重放内容哨兵快速通道 [批次191 2026-10-07]
// 问题: 全量重放(replayAll)每次启动/重启都要重读 ~616 个目标文件(53MB)并跑锚点正则,
// 实测冷 2.8-4.6s / 热 1.15s —— 而目标树绝大多数时间自上次成功重放后逐字节未变。
// 机制: 每次成功重放后,记录「本轮重放读过的每个 node_modules/lib 目标文件」的
// sha256+mtimeMs+size(经 fs.readFileSync 钩子捕获路径,不触碰 patches.cjs 正本);
// 下一轮重放前先比对 —— 结构指纹未变 且 全部记录文件 mtime+size 未变(mtime 变化时
// 哈希兜底) ⇒ 判定「树与上次成功重放结束时一致」,跳过整轮重放(语义等价:没有文件
// 处于需要修复的状态)。任何失配 ⇒ 返回 false 走全量,结束后重建清单。
// 指纹输入: patches.cjs 正本字节(重放逻辑变化→全量)、desktop-config.json(版本切换)、
// profile package.json/pnpm-lock(插件装卸)、两层 cordis.patch.yml(守护行/禁用行)、
// _npx 树清单 + profile node_modules 顶层清单(新树/新插件)。
// 失败模式 = 维持旧行为(多跑一次全量重放);状态文件纯缓存,删除即强制全量。
// 信任边界: 本文件不接收外部传入路径;状态文件固定 ~/.dsh/patch-replay-state.json
// (测试可用 DSH_PATCH_FASTPATH_STATE 覆盖)。
const os = require('node:os')
const path = require('node:path')
const fs = require('node:fs')
const crypto = require('node:crypto')

const HOME = os.homedir()
const STATE_PATH = process.env.DSH_PATCH_FASTPATH_STATE
  || path.join(HOME, '.dsh', 'patch-replay-state.json')
// 防御性下限:正常全量重放读数百个目标文件;清单异常小视为损坏,强制全量。
const MIN_FILES = 100
const MAX_RECORD_BYTES = 32 * 1024 * 1024

function sha256Buf(b) { return crypto.createHash('sha256').update(b).digest('hex') }
function sha256File(p) { return sha256Buf(fs.readFileSync(p)) }

// 只记录补丁目标所在面(node_modules 树 / 构建产物 lib 目录);配置/日志/状态文件不记。
function relevantPath(p) {
  if (typeof p !== 'string' || !p) return false
  const norm = p.replace(/\//g, '\\')
  return /node_modules/i.test(norm) || /[\\/]lib[\\/]/i.test(norm)
}

function shaFileOrEmpty(p) { try { return sha256File(p) } catch { return '' } }
function fingerprint() {
  const parts = [
    shaFileOrEmpty(patchesCjsPath()),
    shaFileOrEmpty(path.join(HOME, '.dsh', 'desktop-config.json')),
    shaFileOrEmpty(path.join(HOME, '.dsh', 'profiles', 'web', 'package.json')),
    shaFileOrEmpty(path.join(HOME, '.dsh', 'profiles', 'web', 'pnpm-lock.yaml')),
    shaFileOrEmpty(path.join(HOME, '.dsh', 'cordis.patch.yml')),
    shaFileOrEmpty(path.join(HOME, '.dsh', 'profiles', 'web', 'cordis.patch.yml')),
    npxTreeNames(),
    profileNmNames(),
  ]
  return sha256Buf(Buffer.from(parts.join('|')))
}
function patchesCjsPath() { return path.join(HOME, '.dsh', 'patches.cjs') }
function npxTreeNames() {
  try { return fs.readdirSync(path.join(process.env.LOCALAPPDATA || '', 'npm-cache', '_npx')).sort().join(',') } catch { return '' }
}
function profileNmNames() {
  try { return fs.readdirSync(path.join(HOME, '.dsh', 'profiles', 'web', 'node_modules')).sort().join(',') } catch { return '' }
}

// 重放前判定:目标树是否与上次成功重放结束时逐字节一致(快速通道)。
function shouldSkip(log = () => {}) {
  const t0 = Date.now()
  let state
  try { state = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8')) } catch { return false }
  if (!state || !state.files || state.fingerprint !== fingerprint()) return false
  const names = Object.keys(state.files)
  if (names.length < MIN_FILES) return false
  for (const p of names) {
    const rec = state.files[p]
    if (!rec || typeof rec.size !== 'number') return false
    let st
    try { st = fs.statSync(p) } catch { return false }
    if (st.size !== rec.size) return false
    if (st.mtimeMs !== rec.mtimeMs) {
      // mtime 变了:哈希兜底(纯 touch / 元数据重写的场景仍然可跳过)
      try { if (sha256File(p) !== rec.hash) return false } catch { return false }
    }
  }
  log(`[patches-fastpath] ${names.length} 个目标文件比对未变,跳过全量重放(比对耗时 ${Date.now() - t0}ms)`)
  return true
}

// 包裹一次全量重放:捕获重放读取的目标文件路径;成功(r.ok)后按「重放后状态」记录清单。
// 修复类写入会改动文件内容 → 记录的是修复后的态,下一轮直接命中快速通道。
function runWithRecording(fn, log = () => {}) {
  const t0 = Date.now()
  const captured = new Set()
  const origRead = fs.readFileSync
  fs.readFileSync = function (p, ...rest) {
    try {
      if (typeof p === 'string' && relevantPath(p)) captured.add(path.resolve(p))
    } catch { /* 记录失败不影响重放 */ }
    return origRead.call(fs, p, ...rest)
  }
  try {
    const r = fn()
    if (r && r.ok) {
      const files = {}
      for (const p of captured) {
        try {
          const st = fs.statSync(p)
          if (st.size > MAX_RECORD_BYTES) continue
          files[p] = { hash: sha256File(p), mtimeMs: st.mtimeMs, size: st.size }
        } catch { /* 记录期已消失的文件不入清单 */ }
      }
      const state = { fingerprint: fingerprint(), recordedAt: new Date().toISOString(), files }
      try {
        const tmp = STATE_PATH + '.tmp'
        fs.writeFileSync(tmp, JSON.stringify(state))
        fs.renameSync(tmp, STATE_PATH)
        log(`[patches-fastpath] 已记录重放清单: ${Object.keys(files).length} 个文件(下次启动可比对跳过)`)
      } catch { /* 状态写不出 → 下次全量,无害 */ }
      log(`[patches-fastpath] 全量重放+记录耗时 ${Date.now() - t0}ms`)
    }
    return r
  } finally {
    fs.readFileSync = origRead
  }
}

module.exports = { shouldSkip, runWithRecording, fingerprint, STATE_PATH }
