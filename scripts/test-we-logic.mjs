// Extract WE-related functions from main.js and run them against the real
// Steam installation, verifying: dir caching, vdf multi-library, declared-file
// priority, incomplete detection. No Electron needed.
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { spawnSync } from 'node:child_process'

const src = fs.readFileSync('d:/deepseek harness/dsh-desktop/main.js', 'utf8')

function slice(startMark, endMark) {
  const i = src.indexOf(startMark)
  if (i < 0) throw new Error('start not found: ' + startMark)
  const j = src.indexOf(endMark, i)
  if (j < 0) throw new Error('end not found: ' + endMark)
  return src.slice(i, j)
}

const code = [
  'const DSH_HOME = process.env.USERPROFILE + "/.dsh";',
  slice('const SKIN_MIME =', 'function isSafeAssetName'),
  slice('// WE 目录发现结果缓存', '/** 读/写皮肤应用状态'),
].join('\n')

const sandbox = { path, fs, spawnSync, console, process, WE_APP_ID: '431960' }
vm.createContext(sandbox)
vm.runInContext(code + '\nthis.__list = listWallpapers; this.__find = findWallpaperEngineDir;', sandbox)

const dir = sandbox.__find()
console.log('WE dir:', dir)
const t0 = Date.now()
const r1 = sandbox.__list()
const t1 = Date.now()
console.log('list#1', t1 - t0, 'ms; installed =', r1.installed, '; count =', r1.wallpapers.length)
const t2 = Date.now()
const r2 = sandbox.__list()
console.log('list#2 (cached dir)', Date.now() - t2, 'ms; count =', r2.wallpapers.length)

const byId = Object.fromEntries(r1.wallpapers.map((w) => [w.id, w]))
for (const id of ['3314492008', '3349708916', '3707489146', '3769527496', '3416436251']) {
  const w = byId[id]
  console.log(id, '|', w.type, '| supported=' + w.supported, '| incomplete=' + w.incomplete, '| file=' + (w.videoFile || '-'))
}
const counts = r1.wallpapers.reduce((a, w) => {
  const k = w.supported ? 'usable' : (w.incomplete ? 'incomplete' : (w.type === 'web' ? 'web' : 'scene'))
  a[k] = (a[k] || 0) + 1
  return a
}, {})
console.log('category counts:', JSON.stringify(counts))
