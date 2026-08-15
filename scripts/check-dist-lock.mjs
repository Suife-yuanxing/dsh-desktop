// 构建前置锁检测(npm run dist 前 auto 跑):electron-builder 需删除旧
// win-unpacked,若 app.asar / 主 exe 被其他进程占用(在跑的应用、IDE 句柄)
// 会中途报 "The process cannot access the file..."。
// 以 r+(要求写共享)探测关键文件,提前失败并给出处置建议。
import { existsSync, openSync, closeSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const distRoots = readdirSync('.', { withFileTypes: true })
  .filter((e) => e.isDirectory() && /^dist-v0\.3/.test(e.name))
  .map((e) => e.name)

const targets = []
for (const root of distRoots) {
  const unpacked = join(root, 'win-unpacked')
  const asar = join(unpacked, 'resources', 'app.asar')
  if (existsSync(asar)) targets.push(asar)
  const exe = join(unpacked, 'DeepSeek Harness.exe')
  if (existsSync(exe)) targets.push(exe)
}

const locked = []
for (const file of targets) {
  try {
    const fd = openSync(file, 'r+') // 他进程持有不共享写的句柄时抛 EBUSY/EPERM
    closeSync(fd)
  } catch {
    locked.push(file)
  }
}

if (locked.length) {
  console.error('构建前置检查:以下文件被占用,electron-builder 将无法清理:')
  for (const f of locked) console.error(`  - ${f}`)
  console.error([
    '处置建议:',
    '  1. 退出正在运行的应用:Get-Process -Name "DeepSeek Harness" | Stop-Process',
    '  2. 若无应用在跑,通常是 IDE 句柄锁定:关闭 IDE 或运行 cleanup-win-unpacked.ps1',
    '  3. 或构建到备用目录:npx electron-builder --win --config builder.yml --publish never --config.directories.output=dist-v0.3-rebuild',
  ].join('\n'))
  process.exit(1)
}
console.log(`构建前置检查:通过(${targets.length} 个关键文件无锁)`)
