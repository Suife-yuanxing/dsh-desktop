// 预加载:contextIsolation 开启,仅暴露启动阶段订阅与版本信息。
// 二期主题注入(--dsw-* 变量)将通过此桥扩展。
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('dshDesktop', {
  version: '0.4.3',
  // splash 页订阅主进程推送的启动阶段(probe/spawn/wait/ready/crash)
  onStage: (cb) => ipcRenderer.on('dsh-stage', (_e, stage) => cb(stage)),
  // 设置页:更新管理(版本切换仅经壳 HTTP API,不在 UI 暴露)
  settings: {
    get: () => ipcRenderer.invoke('dsh-settings:get'),
    checkDshUpdate: () => ipcRenderer.send('dsh-settings:check-dsh-update'),
    checkShellUpdate: () => ipcRenderer.send('dsh-settings:check-shell-update'),
    onStatus: (cb) => ipcRenderer.on('dsh-settings:status', (_e, s) => cb(s)),
  },
  // 日志查看:tail 读取最近 N 行
  logs: {
    tail: (lines) => ipcRenderer.invoke('dsh-logs:tail', lines),
    openDir: () => ipcRenderer.send('dsh-logs:open-dir'),
  },
  // 主窗口自定义控制按钮(壳注入的浮层经此桥操作窗口;原生 overlay 悬停反馈过弱已弃用)
  windowControls: {
    minimize: () => ipcRenderer.send('dsh-win:minimize'),
    toggleMaximize: () => ipcRenderer.send('dsh-win:toggle-maximize'),
    close: () => ipcRenderer.send('dsh-win:close'),
    getMaximized: () => ipcRenderer.invoke('dsh-win:is-maximized'),
    onMaximized: (cb) => {
      const h = (_e, v) => cb(v)
      ipcRenderer.on('dsh-win:maximized', h)
      return () => ipcRenderer.removeListener('dsh-win:maximized', h)
    },
  },
})
