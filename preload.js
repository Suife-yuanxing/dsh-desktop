// 预加载:contextIsolation 开启,仅暴露启动阶段订阅与版本信息。
// 二期主题注入(--dsw-* 变量)将通过此桥扩展。
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('dshDesktop', {
  version: '0.3.0',
  // splash 页订阅主进程推送的启动阶段(probe/spawn/wait/ready/crash)
  onStage: (cb) => ipcRenderer.on('dsh-stage', (_e, stage) => cb(stage)),
})
