// 预加载:contextIsolation 开启,仅暴露启动阶段订阅与版本信息。
// 二期主题注入(--dsw-* 变量)将通过此桥扩展。
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('dshDesktop', {
  version: '0.3.2',
  // splash 页订阅主进程推送的启动阶段(probe/spawn/wait/ready/crash)
  onStage: (cb) => ipcRenderer.on('dsh-stage', (_e, stage) => cb(stage)),
  // 设置页:dsh 版本与更新管理
  settings: {
    get: () => ipcRenderer.invoke('dsh-settings:get'),
    switchVersion: (v) => ipcRenderer.send('dsh-settings:switch', v),
    refreshVersions: () => ipcRenderer.send('dsh-settings:refresh-versions'),
    checkDshUpdate: () => ipcRenderer.send('dsh-settings:check-dsh-update'),
    checkShellUpdate: () => ipcRenderer.send('dsh-settings:check-shell-update'),
    onStatus: (cb) => ipcRenderer.on('dsh-settings:status', (_e, s) => cb(s)),
  },
})
