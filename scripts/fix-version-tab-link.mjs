// 修复 dsh-desktop-version-tab 解析:
// 1) pnpm 把 link:D:/dshvt 当相对路径处理(不支持跨盘符绝对 link:),生成了
//    指向 profiles\web\D:\dshvt 的坏 junction → dsh 启动报 cannot resolve
//    profile bundle。删除坏链接,重建指向工作区插件目录的 junction。
// 2) package.json 移除该 link: 依赖项,防将来 pnpm install/update 再写坏
//    (junction 作为 extraneous 保留;若未来 pnpm 清除,重跑本脚本即可)。
// [问题103] 2026-08-23:D 盘根中转 junction D:\dshvt 被外部清理工具误删 →
// dsh 启动即崩(cannot resolve profile bundle)循环熔断。链路改为 profile
// 直连工作区插件目录(消除 D 盘根单点;D:\dshvt 不再承重,可被清理无害)。
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const profileDir = path.join(os.homedir(), '.dsh', 'profiles', 'web')
const linkPath = path.join(profileDir, 'node_modules', 'dsh-desktop-version-tab')
const target = 'd:\\deepseek harness\\dsh-desktop\\dsh-plugin'

if (!fs.existsSync(target + path.sep + 'package.json')) { console.error('FATAL: target plugin dir missing: ' + target); process.exit(1) }

if (fs.existsSync(linkPath) || fs.lstatSync(linkPath).isSymbolicLink()) {
  // junction/symlink 一律先删(lstat 判定链接本身;悬空 junction 的 existsSync 为 false)
  fs.rmSync(linkPath, { force: true, recursive: true, maxRetries: 5, retryDelay: 300 })
  console.log('removed broken link')
}
fs.symlinkSync(target, linkPath, 'junction')
console.log('junction created:', linkPath, '->', target)
console.log('resolves:', fs.realpathSync(linkPath))

const pkgFile = path.join(profileDir, 'package.json')
const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8'))
if (pkg.dependencies && pkg.dependencies['dsh-desktop-version-tab']) {
  delete pkg.dependencies['dsh-desktop-version-tab']
  fs.writeFileSync(pkgFile, JSON.stringify(pkg, null, 2) + '\n', 'utf8')
  console.log('removed link: dependency from package.json')
} else console.log('dependency entry already absent')
