// 修复 dsh plugin add 解析本地路径失败留下的坏依赖,改为正确 link + bundles 注册
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const f = path.join(os.homedir(), '.dsh', 'profiles', 'web', 'package.json')
const pkg = JSON.parse(fs.readFileSync(f, 'utf8'))

// 1) 移除垃圾条目 deepseek
delete pkg.dependencies.deepseek
// 2) 修正 link 为绝对路径(cross-drive 用正斜杠)
const target = 'D:/deepseek harness/dsh-midturn-insert'
if (!fs.existsSync(path.join(target, 'package.json'))) {
  console.error('FAIL: plugin dir not found at', target)
  process.exit(1)
}
pkg.dependencies['dsh-midturn-insert'] = 'link:' + target
// 3) bundles 注册(dsh.plugin.json 存在才有效)
if (!pkg.dsh.profile.bundles.includes('dsh-midturn-insert')) {
  pkg.dsh.profile.bundles.push('dsh-midturn-insert')
}

fs.writeFileSync(f, JSON.stringify(pkg, null, 2) + '\n', 'utf8')
console.log('fixed: deepseek removed, dsh-midturn-insert ->', target, ', bundles updated')
