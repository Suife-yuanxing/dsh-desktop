// dsh-desktop 补丁重放同步助手 [P3fix/G5 2026-09-13]
// 供 main.js 的 startDsh spawn 前同步重放使用(startDsh 调用方未 async 化,须保持同步语义:
// 托盘重启/自动恢复/版本切换路径,补丁必须先于 dsh 服务进程加载插件产物落位)。
// 独立模块承载 HOME 正本的动态 require——与 patches-replay-worker.cjs 同款信任边界:
// 路径按 os.homedir() 自算,不接收外部传入代码/路径;缺失/损坏回退 asar 内嵌副本。
const os = require('node:os')
const path = require('node:path')
// [批次191 2026-10-07] 内容哨兵快速通道:先比对目标树是否与上次成功重放后一致,
// 一致则整轮跳过(replaySync 语义 = 补丁必先于 spawn 落位;树未变 ⇒ 落位已在,
// 跳过等价)。不一致才加载 655KB 正本走全量,并由 runWithRecording 重建清单。
// 状态文件/失败模式见 patches-replay-fastpath.cjs 头注。
const fastpath = require('./patches-replay-fastpath.cjs')

function replaySync(log) {
  if (fastpath.shouldSkip(log)) return { ok: true, items: [], fastpath: true }
  let replayer
  try {
    // [q203 2026-09-22] require 缓存失效重读:壳是长驻进程,HOME 正本在运行期被编辑/
    // 改号时裸 require 会命中启动时加载的旧模块——2026-09-22 R105 双写事故的直接放大器:
    // 改号脚本 13:42:50 把活体文件哨兵(r104→r105)与 .bak 后缀改名,13:52 重启同步重放
    // 仍执行壳启动时缓存的 r104 时代模块,守卫(查 r104 哨兵)落空 + 基底被改名抽走 →
    // 对已打内容重插一份。q194 注释所述「每次调用重读」在本路径补实(运行期守护走
    // worker 新 isolate,天然无此问题)。过期缓存删除为 no-op,缺失文件仍走 asar 回退。
    const homeReplayer = path.join(os.homedir(), '.dsh', 'patches.cjs')
    delete require.cache[require.resolve(homeReplayer)]
    replayer = require(homeReplayer).replayAll
  } catch {
    replayer = require('./patches.cjs').replayAll
  }
  return fastpath.runWithRecording(() => replayer(log), log)
}

module.exports = { replaySync }
