// dsh-desktop 补丁重放双模入口 [P3fix/G5 2026-09-13]
// 职责:在隔离环境执行 ~/.dsh/patches.cjs 的 replayAll(纯同步,实测 616 文件读 53MB,
// ~4-8s CPU)——主进程事件循环不再被运行期重放阻塞。
//   ① worker 线程模式(main.js runReplayInWorker):45s 守护轮 / 7.5min 强制轮 / 复用路径
//      5s 延迟重放;结果经 parentPort 结构化回传。
//   ② CLI 模式(startDsh spawn 前同步重放的备选 / 人工验证):stdout 输出 JSON。
//      注意:worker 以本文件为入口时 require.main === module 亦为真,模式判定以
//      parentPort 存在性为准(仅 worker 线程有 parentPort)。
// 信任边界:本文件不接收外部传入的代码或路径;patches.cjs 路径按 os.homedir() 自算
// (与 main.js 同一正本),缺失/损坏时回退 asar 内嵌副本。
const os = require('node:os')
const path = require('node:path')
const { parentPort } = require('node:worker_threads')

function loadReplayer() {
  try {
    return require(path.join(os.homedir(), '.dsh', 'patches.cjs')).replayAll
  } catch {
    return require('./patches.cjs').replayAll
  }
}

function runReplay() {
  const logs = []
  const r = loadReplayer()((l) => { logs.push(l) })
  return { result: r, logs }
}

if (parentPort) {
  try {
    parentPort.postMessage(runReplay())
  } catch (e) {
    parentPort.postMessage({ result: null, logs: [], error: String((e && e.message) || e) })
  }
} else if (require.main === module) {
  let out
  try { out = runReplay() } catch (e) { out = { result: null, logs: [], error: String((e && e.message) || e) } }
  process.stdout.write(JSON.stringify(out), () => {
    process.exit(out.result && out.result.ok ? 0 : 1)
  })
}
