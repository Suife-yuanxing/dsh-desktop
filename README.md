# dsh-desktop

DeepSeek Harness 桌面壳 -- 基于 Electron 的 Windows 原生桌面封装，为 DeepSeek Harness Web UI 提供本地桌面体验。

## 概述

dsh-desktop 是一个 Electron 桌面壳，将 DeepSeek Harness (DSH) 的 Web 界面封装为原生 Windows 桌面应用程序。它通过 `npx` 启动 DSH 服务，提供版本锁定、自动更新、崩溃自愈、多窗口支持等桌面级特性。

## 功能特性

### 核心功能

- **DSH 版本锁定** -- 通过 `~/.dsh/desktop-config.json` 锁定 DSH 版本，避免意外更新导致不兼容
- **dsh 运行时双轨** -- `dshRuntime` 配置项在官方 npx/缓存路径与本地构建产物之间切换，任一侧异常可一键切回另一侧（v0.5.0）
- **自动更新** -- 支持 DSH 运行时更新（npm）和壳自身更新（electron-updater）
- **崩溃自愈** -- 自动检测 DSH 服务崩溃，指数退避重启（最多 3 次），失败后通知用户手动处理
- **多窗口** -- 多个主窗口共享同一 DSH 服务实例
- **启动画面** -- 显示 DSH 启动阶段的实时进度（初始化/启动/等待/就绪/崩溃）

### 系统集成

- **系统托盘** -- 托盘菜单提供重启服务、新建窗口、版本管理、日志查看等操作
- **NSIS 安装程序** -- 一键安装，支持自定义安装目录和桌面快捷方式
- **便携版** -- 提供免安装便携版本，U 盘即用
- **全中文菜单** -- 原生中文托盘菜单和对话框

### 高级管理

- **插件管理** -- 通过 `~/.dsh/cordis.patch.yml` 热插拔插件，支持启用/禁用/删除
- **MCP 服务器管理** -- 管理 MCP 服务器条目的增删改
- **技能管理** -- 用户级技能条目的启用/禁用/删除
- **人设管理** -- 通过界面修改 system-prompt persona
- **日志查看** -- 内置日志尾部查看器和日志目录快速访问

### 扩展功能

- **自定义皮肤** -- 支持导入图片/视频/音频作为桌面背景
- **Wallpaper Engine 集成** -- 自动检测 Steam 壁纸引擎的创意工坊内容，支持视频壁纸应用
- **HTTP API** -- 壳内置管理 API（端口 30801），供 Web UI 的版本/插件/皮肤标签页调用

## 安装

### 从 Release 安装（推荐）

1. 前往 [Releases](https://github.com/Suife-yuanxing/dsh-desktop/releases) 页面
2. 下载最新版本的安装包（`DeepSeek-Harness-Setup-x.x.x.exe`）或便携版（`DeepSeek-Harness-Portable-x.x.x.exe`）
3. 运行安装程序，按向导完成安装

### 从源码构建

**前置要求：**
- Node.js >= 20
- npm

```bash
# 克隆仓库
git clone https://github.com/Suife-yuanxing/dsh-desktop.git
cd dsh-desktop

# 安装依赖
npm install

# 构建安装包
npm run dist
```

构建产物位于 `dist-v0.3/` 目录。

## 使用方法

### 启动

安装后，从开始菜单或桌面快捷方式启动 **DeepSeek Harness**。程序会自动：

1. 显示启动画面，展示启动阶段进度
2. 通过 `npx` 拉取并启动 DSH Web 服务
3. 服务就绪后加载 Web 界面

### 系统托盘

右键点击系统托盘的图标，可访问：

| 菜单项 | 功能 |
|--------|------|
| 新建窗口 | 打开一个新窗口共享同一 DSH 服务 |
| 重启服务 | 重启 DSH 运行时（带进度遮罩） |
| 检查 dsh 更新 | 检查 npm 上 DSH 的新版本 |
| 检查壳更新 | 检查壳自身的新版本 |
| 查看日志 | 打开日志目录 |
| 关于 | 显示版本信息 |
| 退出 | 关闭所有窗口并停止服务 |

### 版本管理

DSH 版本锁定机制：

- 默认锁定到经过验证的版本
- 可在设置中切换到其他版本或跟踪 `latest`
- 版本切换失败会自动回滚到之前版本
- 支持版本预检：切换前验证新版可正常运行

### dsh 运行时双轨切换（v0.5.0）

`~/.dsh/desktop-config.json` 新增字段控制 dsh 运行时来源：

| 字段 | 取值 | 语义 |
|------|------|------|
| `dshRuntime` | `"official"`（缺省）或 `"local"` | `"official"` 沿用既有 npx/缓存快速路径（行为不变）；`"local"` 直接执行本地构建目录下的 `bin.js` |
| `dshLocalDir` | 目录绝对路径（可选） | local 轨的构建产物目录；缺省向上探测兄弟仓 `deepseek-harness/apps/cli/lib` |

行为约定：

- 仅 `local` 目标做能力探测（`bin.js` 存在 + node.exe 可解析），任何异常都记录 breadcrumb 到 `desktop.log` 并折叠回 official 启动——回滚只需把 `dshRuntime` 改回 `"official"`
- local 轨 spawn 参数固定为 `node --expose-internals <bin.js> web`：本仓 web 组合含 cordis-plugin-hmr，loader 构造期硬性要求暴露 internals（官方轨 npx 树自行装配，不受影响）
- local 轨首次启用前需完成 monorepo 依赖闭包组装：在 deepseek-harness 内执行本仓的 `powershell -File scripts/link-local-runtime.ps1`，把全部 workspace 成员依赖链接镜像到其根 node_modules（幂等可重放；monorepo 重装依赖后需再跑一次）
- 壳设置 UI 不提供该开关，配置文件编辑即切换手段
- 版本锁（`dshVersion`）仅约束 official 轨的 npx 安装规格，local 轨以构建产物自身为准

示例：

```json
{
  "dshVersion": "0.1.0-rc.6",
  "dshRuntime": "local",
  "dshLocalDir": "D:\\deepseek harness\\deepseek-harness\\apps\\cli\\lib"
}
```

启动来源校验：`npm run verify:runtime`（plain-node 断言 resolveDshRuntime 各分支与日志留痕）。

## 项目结构

```
dsh-desktop/
├── main.js              # Electron 主进程
├── preload.js           # 预加载脚本（contextBridge API）
├── patches.cjs          # 本地 patch 重放
├── builder.yml          # electron-builder 配置
├── package.json         # 项目配置
├── splash.html          # 启动画面
├── error.html           # 崩溃错误页面
├── settings.html        # 设置页面
├── whale-data.js        # 鲸鱼娘数据
├── logo.png             # 应用图标
├── icon.ico             # Windows 图标
├── scripts/             # 构建与校验脚本
│   ├── check-dist-lock.mjs
│   ├── check-dsh-runtime.mjs
│   └── link-local-runtime.ps1
├── docs/                # 文档
├── dsh-plugin/          # DSH 插件相关
└── .github/             # GitHub 工作流
```

## 技术栈

- **Electron** ^33.0.0 -- 跨平台桌面框架
- **electron-builder** ^25.0.0 -- 应用打包与构建
- **electron-updater** ^6.8.9 -- 自动更新
- **NSIS** -- Windows 安装程序

## 许可证

[MIT](LICENSE)