// 下载并安装 mnemon CLI 到 %LOCALAPPDATA%\Programs\mnemon\mnemon.exe
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { execFileSync } from 'node:child_process'

const VER = '0.2.3'
const URL = `https://github.com/mnemon-dev/mnemon/releases/download/v${VER}/mnemon_${VER}_windows_amd64.zip`
const tmp = path.join(os.tmpdir(), `mnemon-${VER}.zip`)
const destDir = path.join(process.env.LOCALAPPDATA, 'Programs', 'mnemon')
const destExe = path.join(destDir, 'mnemon.exe')

if (fs.existsSync(destExe)) { console.log('already installed:', destExe); process.exit(0) }

console.log('downloading', URL)
const res = await fetch(URL)
if (!res.ok) { console.error('download failed:', res.status); process.exit(1) }
const buf = Buffer.from(await res.arrayBuffer())
fs.writeFileSync(tmp, buf)
console.log('downloaded', Math.round(buf.length / 1048576) + 'MB ->', tmp)

const extractDir = path.join(os.tmpdir(), `mnemon-extract-${VER}`)
fs.rmSync(extractDir, { recursive: true, force: true })
fs.mkdirSync(extractDir, { recursive: true })
// Windows 自带 bsdtar 处理 zip
execFileSync('tar', ['-xf', tmp, '-C', extractDir], { stdio: 'inherit' })
// 找到 mnemon.exe
let found = null
const walk = (d) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name)
    if (e.isDirectory()) walk(p)
    else if (e.name.toLowerCase() === 'mnemon.exe') found = p
  }
}
walk(extractDir)
if (!found) { console.error('mnemon.exe not found in archive'); process.exit(1) }

fs.mkdirSync(destDir, { recursive: true })
fs.copyFileSync(found, destExe)
console.log('installed:', destExe, fs.statSync(destExe).size, 'bytes')
// 验证
try {
  const out = execFileSync(destExe, ['--version'], { encoding: 'utf8', timeout: 15000 })
  console.log('version:', out.trim())
} catch (e) { console.log('version check rc:', e.status ?? e.message) }
