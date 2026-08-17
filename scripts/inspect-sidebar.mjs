// 提取 better-sidebar 原版 lib 中的关键样式/逻辑片段,用于重放补丁
import fs from 'node:fs'
const lib = process.env.USERPROFILE + '/.dsh/profiles/web/node_modules/dsh-better-sidebar/lib'
const c = fs.readFileSync(lib + '/client.js', 'utf8')

const show = (label, idx, len) => {
  console.log(`\n=== ${label} @${idx} ===`)
  console.log(idx >= 0 ? c.slice(idx, idx + len).replace(/\\n/g, '\n') : '(not found)')
}

const all = (pat) => { const r = []; let i = 0; while ((i = c.indexOf(pat, i)) >= 0) { r.push(i); i += pat.length } return r }
const rule = (sel) => { const i = c.indexOf(sel + '{'); if (i < 0) return '(missing) ' + sel; let d = 1, j = i + sel.length + 1; while (d > 0 && j < c.length) { if (c[j] === '{') d++; else if (c[j] === '}') d--; j++ } return c.slice(i, j) }
console.log('\n=== full rules ===')
console.log(rule('.W-zNGW_bottomPanel'))
console.log(rule('.W-zNGW_bottomPanelHidden'))
console.log(rule('.W-zNGW_boundaryError'))
console.log(rule('.W-zNGW_cornerHandle'))
