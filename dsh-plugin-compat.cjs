// dsh-plugin-compat.cjs — dsh 更新前插件兼容性预检(壳 main.js 配套模块,零依赖)
//
// 背景:dsh 0.1.x rc 线高频发版,@deepseek-ai/dsh-* 子包随主包锁步升版;插件以
// peerDependencies / engines.dsh 声明兼容范围,exact 钉死声明(实测 dsh-xiaomi-tts
// 钉 0.1.5-rc.1、dsh-plugin-long-term-memory 钉 0.1.0-rc.6)在 rc 推进后必然失配。
// 本模块在更新 dsh 前对照「目标版本将携带的子包版本」评估每个已启用第三方插件,
// 声明范围与新版不相交者判不兼容,由调用方列清单交用户确认后再继续(与 VS Code
// engines.vscode 预检、WordPress「未经测试」确认、JetBrains 更新前插件警告同型:
// 元数据判定 + 警告后放行,非硬阻断)。
//
// 原则:声明缺失、写法不认识或数据不可得一律放行(fail-open),绝不因检查本身
// 失败阻断更新。本模块不触网、不执行命令:网络(packument)与宿主状态(禁用集)
// 经 createCompatChecker 注入。
'use strict'

const fs = require('fs')
const os = require('os')
const path = require('path')

/** 宽松 semver 解析:'1.2.3' / '1.2.3-rc.4' / '1.2.3-alpha.2' → 可比较秩
 *  [maj,min,pat,stage,n,tag],stage 正式版 3 > rc 2 > 其他预发布 1(同级 tag 按
 *  ASCII 比);解析失败返 null。 */
function parseVerLoose(v) {
  const m = /^(\d+)\.(\d+)\.(\d+)(?:-([a-zA-Z]+)(?:\.(\d+))?)?$/.exec(String(v || '').trim())
  if (!m) return null
  const tag = m[4] || null
  return [+m[1], +m[2], +m[3], !tag ? 3 : tag === 'rc' ? 2 : 1, tag ? (+m[5] || 0) : 0, tag || '']
}

function cmpVerRank(a, b) {
  for (let i = 0; i < 6; i++) {
    if (a[i] === b[i]) continue
    return (i < 5 ? a[i] < b[i] : String(a[i]) < String(b[i])) ? -1 : 1
  }
  return 0
}

/** 单比较器 → 区间(caret/tilde 展开上界)。支持 ^ ~ >= > <= < = 与裸精确版;
 *  不认识的写法返 null(调用方按「无法判定」放行)。 */
function comparatorToBounds(comp) {
  const m = /^(\^|~|>=|>|<=|<|=)?\s*(\d+)\.(\d+)\.(\d+)(?:-([a-zA-Z]+)(?:\.(\d+))?)?$/.exec(String(comp || '').trim())
  if (!m) return null
  const op = m[1] || ''
  const rank = [+m[2], +m[3], +m[4], m[5] ? (m[5] === 'rc' ? 2 : 1) : 3, m[5] ? (+m[6] || 0) : 0, m[5] || '']
  if (op === '^') {
    const hi = m[2] !== '0' ? [+m[2] + 1, 0, 0, 3, 0, '']
      : m[3] !== '0' ? [+m[2], +m[3] + 1, 0, 3, 0, '']
      : [+m[2], +m[3], +m[4] + 1, 3, 0, '']
    return { lo: rank, loInc: true, hi, hiInc: false }
  }
  if (op === '~') return { lo: rank, loInc: true, hi: [+m[2], +m[3] + 1, 0, 3, 0, ''], hiInc: false }
  if (op === '>=') return { lo: rank, loInc: true, hi: null, hiInc: false }
  if (op === '>') return { lo: rank, loInc: false, hi: null, hiInc: false }
  if (op === '<=') return { lo: null, loInc: false, hi: rank, hiInc: true }
  if (op === '<') return { lo: null, loInc: false, hi: rank, hiInc: false }
  return { lo: rank, loInc: true, hi: rank, hiInc: true } // = 或裸版本:精确点
}

/** 两区间求交;空交返 null。 */
function intersectBounds(a, b) {
  let lo, loInc
  if (!a.lo) { lo = b.lo; loInc = b.loInc }
  else if (!b.lo) { lo = a.lo; loInc = a.loInc }
  else {
    const c = cmpVerRank(a.lo, b.lo)
    if (c > 0) { lo = a.lo; loInc = a.loInc }
    else if (c < 0) { lo = b.lo; loInc = b.loInc }
    else { lo = a.lo; loInc = a.loInc && b.loInc }
  }
  let hi, hiInc
  if (!a.hi) { hi = b.hi; hiInc = b.hiInc }
  else if (!b.hi) { hi = a.hi; hiInc = a.hiInc }
  else {
    const c = cmpVerRank(a.hi, b.hi)
    if (c < 0) { hi = a.hi; hiInc = a.hiInc }
    else if (c > 0) { hi = b.hi; hiInc = b.hiInc }
    else { hi = a.hi; hiInc = a.hiInc && b.hiInc }
  }
  if (lo && hi) {
    const c = cmpVerRank(lo, hi)
    if (c > 0) return null
    if (c === 0 && !(loInc && hiInc)) return null
  }
  return { lo, loInc, hi, hiInc }
}

/** semver 范围 → OR 分支区间集。支持 || 分支、空格 AND、^ ~ 比较符。
 *  预发布一律按全序参与匹配(不做 semver 的「同元组预发布才匹配」限制):
 *  dsh 0.1.x 全线预发布,插件 ^0.1.0-rc.6 的本意即覆盖后续 rc,与 dshmarket
 *  的简化判定口径一致。含不可解析比较器的分支记 null;workspace:^ 等非版本
 *  声明整体返 null(视为无信号)。 */
function parseRangeIntervals(range) {
  const text = String(range || '').trim()
  if (!text || text === '*' || text === 'x' || /^workspace:/.test(text)) return null
  const out = []
  for (const branch of text.split('||')) {
    const comps = branch.trim().split(/\s+/).filter(Boolean)
    if (!comps.length) { out.push({ lo: null, loInc: false, hi: null, hiInc: false }); continue }
    let cur = null
    let bad = false
    for (const c of comps) {
      const b = comparatorToBounds(c)
      if (!b) { bad = true; break }
      cur = cur ? intersectBounds(cur, b) : b
      if (!cur) break // 恒假分支(如 >=2 <1),无需再看
    }
    out.push(bad ? null : cur)
  }
  return out.length ? out : null
}

function rankInIntervals(rank, intervals) {
  for (const it of intervals) {
    if (!it) return true // 含不可解析分支:无法证伪,按可能满足放行(fail-open)
    if (it.lo) {
      const c = cmpVerRank(rank, it.lo)
      if (c < 0 || (c === 0 && !it.loInc)) continue
    }
    if (it.hi) {
      const c = cmpVerRank(rank, it.hi)
      if (c > 0 || (c === 0 && !it.hiInc)) continue
    }
    return true
  }
  return false
}

function rangeOverlapsBranch(a, b) {
  const lc = !a.lo || !b.hi ? -1 : cmpVerRank(a.lo, b.hi)
  const rc = !b.lo || !a.hi ? -1 : cmpVerRank(b.lo, a.hi)
  const leftOk = lc < 0 || (lc === 0 && a.loInc && b.hiInc)
  const rightOk = rc < 0 || (rc === 0 && b.loInc && a.hiInc)
  return leftOk && rightOk
}

function rangesIntersect(ra, rb) {
  for (const a of ra) {
    for (const b of rb) {
      if (!a || !b) return true // 不可解析分支按可能相交放行(fail-open)
      if (rangeOverlapsBranch(a, b)) return true
    }
  }
  return false
}

/** 版本是否落在范围内;版本或范围解析失败按满足放行。 */
function rangeSatisfies(version, range) {
  const rank = parseVerLoose(version)
  const iv = parseRangeIntervals(range)
  if (!rank || !iv) return true
  return rankInIntervals(rank, iv)
}

/** 包名白名单校验:只允许 scope/name 常规形态,杜绝账本脏数据拼路径。 */
function isSafePkgName(name) {
  return typeof name === 'string'
    && !name.includes('..')
    && /^(@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/i.test(name)
}

/** 插件兼容性信号:engines.dsh + peerDependencies 中 @deepseek-ai/dsh 前缀声明。
 *  cordis/schemastery 等不在 dsh 锁步版本线的 peer 忽略(同 dshmarket
 *  deriveHostCompatibility 口径);workspace:^ 等不可解析范围视为无信号。 */
function compatSignalsOf(pkg) {
  if (!pkg) return []
  const sig = []
  const enginesDsh = pkg.engines && typeof pkg.engines.dsh === 'string' ? pkg.engines.dsh.trim() : null
  if (enginesDsh && parseRangeIntervals(enginesDsh)) sig.push({ kind: 'engines', key: 'engines.dsh', range: enginesDsh })
  const peers = pkg.peerDependencies || {}
  for (const [key, range] of Object.entries(peers)) {
    if (typeof range !== 'string' || !key.startsWith('@deepseek-ai/dsh')) continue
    if (!parseRangeIntervals(range)) continue
    sig.push({ kind: key === '@deepseek-ai/dsh' ? 'dsh' : 'sub', key, range: range.trim() })
  }
  return sig
}

/** 单信号对目标版本的判定。返 null = 兼容或无法判定(放行);非 null = 不兼容。 */
function signalIncompatibility(sig, target, tree) {
  if (sig.kind === 'engines' || sig.kind === 'dsh') {
    if (rangeSatisfies(target, sig.range)) return null
    return { reason: `${sig.key} 声明 ${sig.range},新版 ${target} 不满足`, brings: target }
  }
  const sub = tree.map.get(sig.key)
  if (!sub) return null // 新版树未见该子包(深层嵌套/依赖重构):无法判定,放行
  if (sub.exact) {
    if (rangeSatisfies(sub.spec, sig.range)) return null
    return { reason: `声明 ${sig.key}@${sig.range},新版实际携带 ${sub.spec}`, brings: sub.spec }
  }
  const a = parseRangeIntervals(sig.range)
  const b = parseRangeIntervals(sub.spec)
  if (!a || !b || rangesIntersect(a, b)) return null
  return { reason: `声明 ${sig.key}@${sig.range},与新版依赖 ${sub.spec} 无交集`, brings: sub.spec }
}

/**
 * 创建兼容性预检器。注入项:
 * @param {string}   opts.dshHome            $DSH_HOME(plugins 目录锚点)
 * @param {Function} opts.readDisabledAllIds 返 Set:双层 patch 的禁用行 id 全集
 * @param {Function} opts.fetchPackument     () => Promise<packument|null>,由壳提供(HTTP 三级降级)
 * @param {Function} [opts.log]
 */
function createCompatChecker(opts) {
  const dshHome = opts.dshHome
  const fetchPackument = opts.fetchPackument
  const log = opts.log || (() => {})
  const profileDir = path.join(dshHome, 'profiles', 'web')

  // 已启用插件清单 = profile 账本 bundles − 双层 patch 禁用行 − dsh 锁步内建包。
  // 禁用行 id 与包名大多同名(patch 行 id 即模块名);个别行 id 不同的包按
  // 「已启用」处理,宁多勿漏(多提醒可取消,漏提醒破坏数据)。
  function listEnabledThirdPartyPlugins() {
    let ledger
    try { ledger = JSON.parse(fs.readFileSync(path.join(profileDir, 'package.json'), 'utf8')) } catch { return [] }
    const cfgBundles = ledger && ledger.dsh && ledger.dsh.profile && ledger.dsh.profile.bundles
    const bundles = Array.isArray(cfgBundles) ? cfgBundles.filter(isSafePkgName) : []
    if (!bundles.length) return []
    const disabledSet = opts.readDisabledAllIds()
    const disabled = disabledSet instanceof Set ? disabledSet : new Set()
    const out = []
    for (const name of bundles) {
      if (disabled.has(name)) continue
      let pkg = null
      try {
        pkg = JSON.parse(fs.readFileSync(path.join(profileDir, 'node_modules', ...name.split('/'), 'package.json'), 'utf8'))
      } catch { pkg = null }
      if (!pkg) {
        if (name.startsWith('@deepseek-ai/')) continue // 从 dsh 自身树解析的内建包,随主包锁步升版
        out.push({ name, version: null, pkg: null }) // 清单解析不到(如壳注入插件):按无声明放行
        continue
      }
      out.push({ name: pkg.name || name, version: pkg.version || null, pkg })
    }
    return out
  }

  let targetTreeMemo = { target: null, at: 0, value: null }
  /** 目标版本将携带的 @deepseek-ai/dsh* 子包版本。双源:
   *  ① npx 缓存树(壳预检播种后即有,精确安装版本,离线);包名/哈希段先过白名单再拼路径。
   *  ② packument dependencies(范围声明;只收录 dsh 锁步前缀)。
   *  双源皆缺返 null,调用方跳过检查(fail-open)。按 target 记忆 10 分钟,
   *  「提醒 → 确认仍要更新」往返不重复取数。 */
  async function resolveDshTargetTree(target) {
    if (targetTreeMemo.target === target && Date.now() - targetTreeMemo.at < 600_000) {
      return targetTreeMemo.value
    }
    const value = await buildDshTargetTree(target)
    targetTreeMemo = { target, at: Date.now(), value }
    return value
  }

  async function buildDshTargetTree(target) {
    const scanScopeAt = (nm) => {
      // 扫 <nm>/@deepseek-ai/* 的 dsh 锁步子包(npm 扁平布局直接可得)
      const map = new Map()
      try {
        for (const entry of fs.readdirSync(path.join(nm, '@deepseek-ai'))) {
          const scoped = `@deepseek-ai/${entry}`
          if (!isSafePkgName(scoped)) continue
          try {
            const sub = JSON.parse(fs.readFileSync(path.join(nm, '@deepseek-ai', entry, 'package.json'), 'utf8'))
            if (sub.name && sub.version && sub.name.startsWith('@deepseek-ai/dsh')) {
              map.set(sub.name, { spec: sub.version, exact: true })
            }
          } catch { /* 单包读取失败按缺失(深层嵌套等),对判定只少不误 */ }
        }
      } catch { /* scope 目录读不动 */ }
      return map
    }
    const mergeKeepMax = (map, add) => {
      for (const [k, v] of add) {
        const cur = map.get(k)
        const rv = parseVerLoose(v.spec) || [0]
        const rc = cur ? (parseVerLoose(cur.spec) || [0]) : null
        if (!rc || cmpVerRank(rv, rc) > 0) map.set(k, v) // 同名多版本(段间差异)取最高
      }
    }
    try {
      const npxRoot = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'npm-cache', '_npx')
      if (fs.existsSync(npxRoot)) {
        for (const h of fs.readdirSync(npxRoot)) {
          if (!/^[a-z0-9][a-z0-9._-]*$/i.test(h) || h.includes('..')) continue
          const nm = path.join(npxRoot, h, 'node_modules')
          const dshDir = path.join(nm, '@deepseek-ai', 'dsh')
          const pj = path.join(dshDir, 'package.json')
          if (!fs.existsSync(pj)) continue
          let pkg
          try { pkg = JSON.parse(fs.readFileSync(pj, 'utf8')) } catch { continue }
          if (pkg.version !== target) continue
          // 三层并集:npm 扁平布局顶层即全量;pnpm 播种目录顶层只有 dsh 本体,
          // 沿 realpath 解析到虚拟仓库段扫其直接依赖,再遍历 @deepseek-ai+dsh* 各段
          // 覆盖 dsh-client-* 等深层传递依赖(深包是 dsh-web-app 的依赖,不在
          // dsh 本体的仓库段里)。同名多版本取最高。
          const map = scanScopeAt(nm)
          try {
            const realNm = path.dirname(path.dirname(fs.realpathSync(dshDir)))
            if (realNm !== nm) mergeKeepMax(map, scanScopeAt(realNm))
          } catch { /* realpath 失败保留首轮 */ }
          try {
            const pnpmRoot = path.join(nm, '.pnpm')
            if (fs.existsSync(pnpmRoot)) {
              for (const virt of fs.readdirSync(pnpmRoot)) {
                if (!virt.startsWith('@deepseek-ai+dsh') || virt.includes('..') || !/^[a-z0-9@+._()-]*$/i.test(virt)) continue
                mergeKeepMax(map, scanScopeAt(path.join(pnpmRoot, virt, 'node_modules')))
              }
            }
          } catch { /* 虚拟仓库遍历失败保留已扫部分 */ }
          if (map.size) return { source: 'cache', map }
        }
      }
    } catch { /* 缓存布局异常,降级 packument */ }
    try {
      const data = await fetchPackument()
      const meta = data && data.versions ? data.versions[target] : null
      const deps = meta && meta.dependencies ? meta.dependencies : null
      if (deps) {
        const map = new Map()
        for (const [name, spec] of Object.entries(deps)) {
          if (!name.startsWith('@deepseek-ai/dsh')) continue
          if (typeof spec === 'string' && parseRangeIntervals(spec)) map.set(name, { spec, exact: false })
        }
        if (map.size) return { source: 'packument', map }
      }
    } catch { /* 双源皆缺 */ }
    return null
  }

  /** 汇总评估:目标版本 vs 全部已启用第三方插件。任何内部错误折价为 error 字段
   *  (调用方据此放行),绝不因检查失败阻断更新主流程。 */
  async function assessPluginsForDshUpdate(target) {
    const out = { target, checked: 0, unknown: 0, source: null, incompatible: [], error: null }
    try {
      const tree = await resolveDshTargetTree(target)
      if (!tree) {
        out.error = '目标版本依赖信息不可得(缓存未预热且 npm 元数据不可达)'
        return out
      }
      out.source = tree.source
      for (const p of listEnabledThirdPartyPlugins()) {
        const sigs = compatSignalsOf(p.pkg)
        if (!sigs.length) { out.unknown++; continue }
        out.checked++
        for (const sig of sigs) {
          const bad = signalIncompatibility(sig, target, tree)
          if (bad) {
            out.incompatible.push({ name: p.name, version: p.version, key: sig.key, range: sig.range, ...bad })
            break
          }
        }
      }
    } catch (e) {
      out.error = e.message
    }
    return out
  }

  return { assessPluginsForDshUpdate, listEnabledThirdPartyPlugins }
}

module.exports = {
  createCompatChecker,
  parseVerLoose,
  parseRangeIntervals,
  rangeSatisfies,
  rangesIntersect,
  compatSignalsOf,
  isSafePkgName,
}
