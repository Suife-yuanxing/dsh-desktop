// 恢复 pnpm install 清除的两个 junction 覆盖 + 固定 packageManager 为 pnpm@10
// (pnpm 11.7.0 对 link: overrides 的 peer 解析崩溃; 10.14.0 正常)
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const scopeDir = path.join(os.homedir(), '.dsh', 'profiles', 'web', 'node_modules', '@deepseek-ai')
const JUNCTIONS = {
  'dsh-client-ui-conversation': 'D:\\deepseek harness\\deepseek-harness\\packages\\client\\ui-conversation',
  'dsh-session-log-export': 'D:\\deepseek harness\\deepseek-harness\\packages\\session-query\\session-log-export',
}
fs.mkdirSync(scopeDir, { recursive: true })
for (const [name, target] of Object.entries(JUNCTIONS)) {
  const p = path.join(scopeDir, name)
  if (fs.existsSync(p)) { console.log(`exists: ${name}`); continue }
  fs.symlinkSync(target, p, 'junction')
  console.log(`restored: ${name} -> ${target}`)
}

// 固定 pnpm 版本,remote-web-ui 更新器走 corepack 时用 10
const pkgFile = path.join(os.homedir(), '.dsh', 'profiles', 'web', 'package.json')
const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8'))
if (!pkg.packageManager) {
  pkg.packageManager = 'pnpm@10.14.0'
  fs.writeFileSync(pkgFile, JSON.stringify(pkg, null, 2) + '\n', 'utf8')
  console.log('packageManager pinned: pnpm@10.14.0')
} else console.log('packageManager already:', pkg.packageManager)

// 终态检查
console.log('--- @deepseek-ai scope ---')
for (const e of fs.readdirSync(scopeDir, { withFileTypes: true })) {
  const full = path.join(scopeDir, e.name)
  let link = null
  try { link = fs.readlinkSync(full) } catch {}
  console.log(`${e.name}${link ? '  JUNCTION-> ' + link : '  (dir)'}`)
}
