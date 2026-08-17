// 终验:从插件上下文解析 @deepseek-ai/* 必须落到 npx 缓存(与 dsh 运行时同一物理副本)
import { createRequire } from 'node:module'
const profileReq = createRequire(process.env.USERPROFILE + '/.dsh/profiles/web/node_modules/@linxin666/dsh-remote-web-ui/lib/index.js')
const pluginReq = createRequire(process.env.USERPROFILE + '/.dsh/profiles/web/node_modules/dsh-plugin-long-term-memory/lib/index.js')
const npxRoot = process.env.USERPROFILE + '/AppData/Local/npm-cache/_npx/6c7f445d1bf61956/node_modules/'
let ok = true
for (const p of ['@deepseek-ai/dsh-tools', '@deepseek-ai/cordis', '@deepseek-ai/cosmokit', '@deepseek-ai/schemastery']) {
  const a = profileReq.resolve(p)
  const b = pluginReq.resolve(p)
  const same = a === b && a.includes('_npx')
  if (!same) ok = false
  console.log(`${p}\n  remote-web-ui: ${a}\n  long-term-mem: ${b}\n  ${same ? 'OK single identity' : 'MISMATCH!'}`)
}
// junction 覆盖仍可解析
for (const p of ['@deepseek-ai/dsh-client-ui-conversation', '@deepseek-ai/dsh-session-log-export']) {
  try { const r = profileReq.resolve(p); console.log(`${p}\n  -> ${r}`) }
  catch (e) { ok = false; console.log(`${p} RESOLVE FAIL: ${e.code}`) }
}
console.log(ok ? 'ALL GOOD' : 'PROBLEMS FOUND')
