// scripts/seed-dsh-version.mjs — 用法: node scripts/seed-dsh-version.mjs 0.1.5-rc.1
// 结构镜像 main.js pnpmSeedDsh(0.1.2-rc.1 实证):官方源播种 + onlyBuiltDependencies 放行
// + rebuild 补构建 + 版本验证。bin 入口实查 rc.1 seed 为 lib/bin.js(无 bin/ 目录)。
import { mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'

const version = process.argv[2]
if (!version) { console.error('用法: node seed-dsh-version.mjs <version>'); process.exit(1) }
const seedDir = join(process.env.LOCALAPPDATA || join(process.env.USERPROFILE ?? '', 'AppData', 'Local'),
  'npm-cache', '_npx', `dsh-${version}-pnpm-seed`)
const allowBuilds = ['@deepseek-ai/dsh-subprocess-local', '@google/genai', 'koffi', 'node-pty', 'protobufjs']
mkdirSync(seedDir, { recursive: true })
writeFileSync(join(seedDir, 'package.json'), JSON.stringify({
  name: `dsh-${version.replace(/[^0-9a-z.-]/gi, '_')}-seed`, private: true,
  dependencies: { '@deepseek-ai/dsh': version },
}))
writeFileSync(join(seedDir, 'pnpm-workspace.yaml'),
  'onlyBuiltDependencies:\n' + allowBuilds.map((n) => `  - '${n}'`).join('\n') + '\n')
const wr = spawnSync('where.exe', ['pnpm.cmd'], { encoding: 'utf8' })
const pnpm = (wr.stdout || '').split(/\r?\n/).find((l) => l.trim())
if (!pnpm) { console.error('未找到 pnpm'); process.exit(1) }
console.log('install:', seedDir)
let r = spawnSync('cmd.exe', ['/c', pnpm.trim(), 'install', '--registry=https://registry.npmjs.org'],
  { cwd: seedDir, stdio: 'inherit' })
if (r.status !== 0 && r.status !== 1) { console.error(`install 退出码 ${r.status}`); process.exit(1) }
r = spawnSync('cmd.exe', ['/c', pnpm.trim(), 'rebuild'], { cwd: seedDir, stdio: 'inherit' })
console.log('rebuild 退出码:', r.status)
// 版本验证:找 bin 并 node 直跑(候选顺序对齐 rc.1 实测:lib/bin.js 优先)
const nm = join(seedDir, 'node_modules')
const candidates = [
  join(nm, '@deepseek-ai', 'dsh', 'lib', 'bin.js'),
  join(nm, '@deepseek-ai', 'dsh', 'bin', 'dsh.js'),
  join(nm, '@deepseek-ai', 'dsh', 'dist', 'cli.js'),
]
let bin = null
for (const c of candidates) { if (existsSync(c)) { bin = c; break } }
if (!bin) { console.error('未找到 dsh bin(候选: lib/bin.js / bin/dsh.js / dist/cli.js 均不存在)'); process.exit(1) }
console.log('bin:', bin)
const v = spawnSync(process.execPath, [bin, '--version'], { encoding: 'utf8', timeout: 30_000 })
const out = (v.stdout || v.stderr || '').trim()
console.log('dsh --version →', out)
// 兜底:直接读包 package.json 版本(与壳 resolveCachedDshBin 同源判定)
try {
  const req = createRequire(join(nm, '@deepseek-ai', 'dsh', 'package.json'))
  const pv = req(join(nm, '@deepseek-ai', 'dsh', 'package.json')).version
  console.log('package.json version:', pv)
  process.exit(pv === version ? 0 : 1)
} catch (e) {
  console.error('package.json 读取失败:', e.message)
  process.exit(1)
}
