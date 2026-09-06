// [R50 2026-08-29] 补丁双轨同步审计:一条命令看清「补丁层对官方轨/本地轨的覆盖是否完整」。
//
//   node scripts/audit-patch-coverage.cjs        (或 npm run audit:patches)
//
// 输出三段:
//   1) 双副本一致性 —— 运行面 ~/.dsh/patches.cjs 与仓库镜像 dsh-desktop/patches.cjs
//      的 sha256 比对。两者内容必须一致(镜像只作 asar 回退与版本化留档),失配即
//      提示同步并置 exit 1。
//   2) family × 轨道覆盖矩阵 —— 对运行面重放器做静态扫描,把每个 patch 家族归类到
//      它落笔的轨道面:
//        P = profile 层(~/.dsh/profiles,市场插件与 devlink 核心包,两轨物理共用同一
//            份文件 → 打一次两轨生效,结构性同步);
//        O = 官方轨(npx 缓存内 @deepseek-ai/* 产物);
//        L = 本地轨(monorepo,经 DSH_LOCAL_PRESETS_ROOT 约定常量寻址)。
//      判定:P 或 O+L = 双轨覆盖 ✓;仅 O 或仅 L = 覆盖缺口 ⚠(需补根或在 patches.cjs
//      注释中显式声明单轨意图)。缺口只告警不置败——单轨可能是有意为之。
//   3) 幂等重放状态 —— 实际执行一次 replayAll(哨兵快速通道,已补丁态零写盘),汇报
//      ok/missing/FAIL 明细;存在 FAIL 置 exit 1。
//
// 纪律(见 README「补丁双轨同步」节):任何新 family 落地时必须覆盖双轨,或注释声明
// 单轨意图;镜像副本同步修改且不得提交(仅本脚本与文档入库)。

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const crypto = require('node:crypto')

const RUNTIME = path.join(os.homedir(), '.dsh', 'patches.cjs')
const MIRROR = path.join(__dirname, '..', 'patches.cjs')

let exitCode = 0
const warn = (s) => console.log('  ⚠ ' + s)
const bad = (s) => { console.log('  ✗ ' + s); exitCode = 1 }
const ok = (s) => console.log('  ✓ ' + s)

console.log('== 1) 双副本一致性 ==')
if (!fs.existsSync(RUNTIME)) {
  bad(`运行面重放器缺失: ${RUNTIME}(壳将回退 asar 内嵌副本)`)
} else {
  const h1 = crypto.createHash('sha256').update(fs.readFileSync(RUNTIME)).digest('hex')
  const h2 = fs.existsSync(MIRROR) ? crypto.createHash('sha256').update(fs.readFileSync(MIRROR)).digest('hex') : null
  if (!h2) warn(`仓库镜像缺失: ${MIRROR}`)
  else if (h1 === h2) ok('运行面与仓库镜像 sha256 一致')
  else bad('运行面与仓库镜像内容失配 —— 两份都要改,改完重跑本审计')
}

console.log('\n== 2) family × 轨道覆盖矩阵 ==')
const src = fs.readFileSync(RUNTIME, 'utf8')
const lines = src.split('\n')
// 所有顶层函数位置;family 函数体 = 定义行到下一个顶层函数(把 rewrite/makeCtx 等助手排除在外)
const topFuncs = []
lines.forEach((l, i) => { const m = l.match(/^(?:async )?function (\w+)\(/); if (m) topFuncs.push({ name: m[1], line: i }) })
const fams = topFuncs.filter((f) => /^patch/.test(f.name))

const rows = fams.map((f, idx) => {
  const next = topFuncs[topFuncs.findIndex((t) => t === f) + 1]
  const body = lines.slice(f.line, (next ? next.line : lines.length)).join('\n')
  const surfaces = []
  if (/PLUGINS|'\.dsh',\s*'profiles'/.test(body)) surfaces.push('P')
  if (/_npx|npm-cache/.test(body)) surfaces.push('O')
  if (/DSH_LOCAL_PRESETS_ROOT|DSH_LOCAL_RUNTIME_ROOT|deepseek-harness[/\\]{1,2}packages/.test(body)) surfaces.push('L')
  return { name: f.name, surfaces }
})

const LEGEND = '  (P=profile 层两轨共享  O=官方 npx 缓存  L=本地 monorepo)'
console.log(LEGEND)
for (const r of rows) {
  const tag = r.surfaces.join('+') || '—'
  let verdict
  if (r.surfaces.includes('P') || (r.surfaces.includes('O') && r.surfaces.includes('L'))) verdict = '双轨覆盖 ✓'
  else if (r.surfaces.includes('O')) verdict = '⚠ 仅官方轨 —— 本地轨缺根'
  else if (r.surfaces.includes('L')) verdict = '⚠ 仅本地轨 —— 官方轨缺根'
  else verdict = '(配置/用户数据,轨道无关)'
  console.log(`  ${r.name.padEnd(26)} [${tag.padEnd(5)}] ${verdict}`)
  if (verdict.includes('⚠')) warn(`${r.name}: 单轨覆盖 —— 补齐另一轨根,或在 patches.cjs 该家族注释中声明单轨意图`)
}

console.log('\n== 3) 幂等重放状态 ==')
try {
  const { replayAll } = require(RUNTIME)
  const logs = []
  const r = replayAll((l) => logs.push(l))
  const items = r.items || []
  const fails = items.filter((i) => !i.ok)
  const missing = logs.filter((l) => l.includes('未安装'))
  const patched = items.length - fails.length
  ok(`目标 ${items.length} 项:补丁态/已打 ${patched},未安装(跳过) ${missing.length},FAIL ${fails.length}`)
  for (const m of missing) console.log(`    · ${m.replace('[patches] ', '')}`)
  for (const f of fails) bad(`${f.file}: ${(f.failures || []).join('; ')}`)
} catch (e) {
  bad(`replayAll 执行异常: ${e.message}`)
}

console.log(`\n审计结论: ${exitCode === 0 ? 'PASS(双轨覆盖完整,重放无 FAIL)' : 'FAIL(见上方 ✗ 标记)'}`)
process.exit(exitCode)
