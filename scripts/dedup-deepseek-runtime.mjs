// 将 profile node_modules 中被 npm/pnpm 重新 hoist 的 @deepseek-ai 运行时包
// 移入 @deepseek-ai.bak-dup 备份区(双副本会导致 TOOL_RUNTIME_SCHEDULER
// Symbol 身份不匹配,破坏工具调度)。保留 junction 覆盖目录不动。
import fs from 'node:fs'
import path from 'node:path'

const NM = path.join(process.env.USERPROFILE || '', '.dsh', 'profiles', 'web', 'node_modules')
const SCOPE = path.join(NM, '@deepseek-ai')
const BAK = path.join(NM, '@deepseek-ai.bak-dup')
const OFFENDERS = ['cordis', 'cosmokit', 'dsh-tools', 'schemastery']

fs.mkdirSync(BAK, { recursive: true })
for (const p of OFFENDERS) {
  const src = path.join(SCOPE, p)
  const dst = path.join(BAK, p)
  if (!fs.existsSync(src)) { console.log(`skip (absent): ${p}`); continue }
  try {
    fs.rmSync(dst, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 })
    fs.renameSync(src, dst)
    console.log(`moved: ${p}`)
  } catch (e) {
    console.log(`FAIL ${p}: ${e.message}`)
    process.exitCode = 1
  }
}
console.log('--- @deepseek-ai now contains ---')
for (const e of fs.readdirSync(SCOPE, { withFileTypes: true })) {
  const lt = fs.readlinkSync(path.join(SCOPE, e.name)).catch ? '' : ''
  console.log(`${e.name}${e.isSymbolicLink() ? ' (link)' : ''}${lt}`)
}
