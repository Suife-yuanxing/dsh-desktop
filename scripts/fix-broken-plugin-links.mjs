// 修复 profile web 下 5 个工作区插件 junction 断裂(问题复现:2026-09-08 23:42
// pnpm install 后「其它」设置页空白,提示音/放入文件插件加载失败)。
// 根因同 fix-version-tab-link.mjs(问题103):pnpm 把 package.json 中跨盘符绝对
// link:D:/deepseek harness/<name> 当相对路径处理,生成指向
// profiles\web\D:\deepseek harness\<name> 的坏 junction(目标不存在)。
// 处置(与问题103 先例一致):
//   1) 删除坏链接,重建指向工作区插件目录的 junction;
//   2) package.json 移除该 link: 依赖项,防将来 pnpm install/update 再写坏
//      (junction 作为 extraneous 保留;若未来 pnpm 清除,重跑本脚本即可)。
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const profileDir = path.join(os.homedir(), '.dsh', 'profiles', 'web')
const nmDir = path.join(profileDir, 'node_modules')

const PLUGINS = {
  'dsh-notify-sound':  'D:\\deepseek harness\\dsh-notify-sound',
  'dsh-file-drop':     'D:\\deepseek harness\\dsh-file-drop',
  'dsh-enhance-prompt':'D:\\deepseek harness\\dsh-enhance-prompt',
  'dsh-usage-tracker': 'D:\\deepseek harness\\dsh-usage-tracker',
  'dsh-cu-panel':      'D:\\deepseek harness\\dsh-cu-panel',
}

let failed = false
for (const [name, target] of Object.entries(PLUGINS)) {
  const linkPath = path.join(nmDir, name)
  if (!fs.existsSync(path.join(target, 'package.json'))) {
    console.error(`FATAL: target plugin dir missing: ${target}`)
    failed = true
    continue
  }
  const isLink = (() => { try { return fs.lstatSync(linkPath).isSymbolicLink() } catch { return false } })()
  if (fs.existsSync(linkPath) || isLink) {
    fs.rmSync(linkPath, { force: true, recursive: true, maxRetries: 5, retryDelay: 300 })
    console.log(`removed broken link: ${name}`)
  }
  fs.symlinkSync(target, linkPath, 'junction')
  console.log(`junction created: ${linkPath} -> ${target}`)
  console.log(`resolves: ${fs.realpathSync(linkPath)}`)
}

if (failed) { console.error('abort: some targets missing, package.json untouched'); process.exit(1) }

// package.json 备份 + 移除 5 个 link: 依赖(先例:fix-version-tab-link.mjs)
const pkgFile = path.join(profileDir, 'package.json')
fs.copyFileSync(pkgFile, pkgFile + '.bak-broken-links-20260909')
console.log('backup written:', pkgFile + '.bak-broken-links-20260909')

const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8'))
let removed = 0
if (pkg.dependencies) {
  for (const name of Object.keys(PLUGINS)) {
    if (pkg.dependencies[name]) {
      delete pkg.dependencies[name]
      removed++
      console.log(`removed dependency: ${name}`)
    }
  }
}
fs.writeFileSync(pkgFile, JSON.stringify(pkg, null, 2) + '\n', 'utf8')
console.log(removed ? `package.json updated (${removed} deps removed)` : 'package.json: dependency entries already absent')
