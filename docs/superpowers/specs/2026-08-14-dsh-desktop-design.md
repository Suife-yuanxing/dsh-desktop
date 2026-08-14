# dsh-desktop 设计文档

> 日期:2026-08-14 | 状态:已批准

## 目标

把 DeepSeek Harness(`npx @deepseek-ai/dsh web`)打包成 Windows 桌面应用,复用官方 Web UI,零破坏插件化特性。

## 决策记录

| 决策 | 选择 | 理由 |
|------|------|------|
| 壳技术 | Electron + 现有 Web UI | 参考 deepseek-tui-desktop / Husk;自带 Node,加载 127.0.0.1:3080 |
| dsh 运行时 | 系统调用 npx | 与 start-dsh.bat 同源;总是最新版 |
| UI | 官方 Web UI 原样 | $DSH_HOME 配置(3 供应商/6 模型)全部生效 |

## 架构

```
主进程 main.js:
1. 单实例锁 → 二次启动聚焦已有窗口
2. 探测 127.0.0.1:3080 → 已活复用 / 未活 spawn npx dsh web
3. 轮询端口就绪(超时 120s,首次 npx 下载慢)
4. BrowserWindow 加载 Web UI
5. 托盘:显示/重启服务/重载/打开日志/退出
6. 退出 taskkill /T /F 清理进程树(cmd→npx→node)

Node 解析顺序:PATH npx → workbuddy node 绝对路径 → error.html 引导页
日志:~/.dsh/logs/desktop.log
```

## 打包

electron-builder:NSIS 安装包 + portable 便携版,icon 复用官方鲸鱼 dsh-icon.ico。

## 测试

1. `npx electron .` 开发跑通:窗口加载、会话可用、退出进程干净
2. `npx electron-builder --win` 出包安装验证

## 二期预留(不做)

insertCSS 主题注入(--dsw-* 变量)、自绘 UI、自动更新、插件商店界面。

## v0.2(2026-08-14 追加,已批准)

| 项 | 决策 |
|---|---|
| 启动页 | 独立小窗,GitHub 官方鲸鱼 logo + 分阶段状态(探测服务→启动 dsh→等待就绪),主窗就绪后显示并关闭启动页 |
| 崩溃自愈 | dsh 意外退出→自动重启,指数退避 1s/5s/15s,连续 3 次失败→Windows 通知+停机;服务就绪或手动重启则清零计数 |
| 回退路径 | 删除硬编码 FALLBACK_NODE;解析链:PATH `where npx.cmd` → 注册表 `HKLM/HKCU\SOFTWARE\Node.js` InstallPath → 错误引导页 |
| IPC | splash 阶段经 ipcMain→preload `onStage` 推送,主窗口仍 contextIsolation |
