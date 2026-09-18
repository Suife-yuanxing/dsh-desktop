// dsh-desktop 补丁重放同步助手 [P3fix/G5 2026-09-13]
// 供 main.js 的 startDsh spawn 前同步重放使用(startDsh 调用方未 async 化,须保持同步语义:
// 托盘重启/自动恢复/版本切换路径,补丁必须先于 dsh 服务进程加载插件产物落位)。
// 独立模块承载 HOME 正本的动态 require——与 patches-replay-worker.cjs 同款信任边界:
// 路径按 os.homedir() 自算,不接收外部传入代码/路径;缺失/损坏回退 asar 内嵌副本。
const os = require('node:os')
const path = require('node:path')

function replaySync(log) {
  let replayer
  try {
    replayer = require(path.join(os.homedir(), '.dsh', 'patches.cjs')).replayAll
  } catch {
    replayer = require('./patches.cjs').replayAll
  }
  return replayer(log)
}

module.exports = { replaySync }
