// 打印 node-nav CSS_TEXT 全文 + 圆点渲染/预览定位代码
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const c = fs.readFileSync(path.join(os.homedir(), '.dsh', 'profiles', 'web', 'node_modules', 'dsh-node-nav', 'client.js'), 'utf8')
const s = c.indexOf('const CSS_TEXT')
// 模板串以反引号开始/结束
const t0 = c.indexOf('`', s)
const t1 = c.indexOf('`', t0 + 1)
console.log('=== CSS_TEXT ===')
console.log(c.slice(t0 + 1, t1))

// 圆点创建 + 预览定位相关
for (const mark of ['createElement("div")', 'dot', 'preview.style.right', 'rail']) {
  let i = -1, n = 0
  while ((i = c.indexOf(mark, i + 1)) >= 0 && n < 2) {
    console.log('\n=== around "' + mark + '" @' + i + ' ===')
    console.log(c.slice(Math.max(0, i - 250), i + 350))
    n++
  }
}
