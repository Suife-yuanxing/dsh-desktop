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
- 壳设置 UI 不提供该开关，配置文件编辑即切换手段（v0.5.1 起设置界面可切换，见下节）
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

### 运行时轨道开关与联合工作区（v0.5.1）

双轨切换进设置界面，配置文件编辑仍是等价的回滚手段：

- **壳设置窗口**（菜单「文件 → 设置」，Ctrl+,）：「运行时」卡片提供轨道切换按钮与本地构建目录/bin.js 状态展示
- **Web UI 设置 → 更新**：「运行时轨道」分组提供同款切换（内联确认，切换经 202 编排 + 轮询）与「联合工作区」灰度开关
- 切换编排复用版本切换的回滚语义：目标轨道在 60s 切换预算内未就绪 → 自动还原原轨道并重启；本地 bin 缺失等折叠回退场景会如实警示（不谎报成功）
- **联合工作区灰度开关**：写 `~/.dsh/cordis.patch.yml` 的 `api-gateway` 配置行（`federatedWorkspacesEnabled`；该行 id 是 apiproxy 模块在 web profile 组合树里的行 id，`host-apiproxy` 只是模块短名，拿它当行 id 会挂空——v0.5.2 勘正）。硬约束：**仅本地构建轨道可写**——官方 npm 包无此功能代码，写入会被官方 schema 拒载。开关块为壳独占管理的标准格式，手写内容会被拒绝读写并引导手动编辑
- 切换进行中（`switching`/`restarting` 互斥）时 `/switch`、`/restart`、`/runtime/track` 互相拒绝（409）

### 便携版 local 轨修复与图片预览 portal 修复（v0.5.2）

两个实测缺陷修复：

- **默认探测打包态修复**：0.5.1 便携版 exe 由 Temp 解压目录启动，`process.execPath`/`__dirname` 锚点向上都够不着工作区 ⇒ `resolveDefaultLocalDir()` 恒返回 null，local 轨静默回退官方（`[dshRuntime] local runtime missing at null` breadcrumb），联合工作区开关因此置灰。v0.5.2 补两类锚点：
  - `PORTABLE_EXECUTABLE_DIR`——electron-builder 便携版启动时注入的真实 exe 所在目录（首个打包态锚点）；
  - `DSH_LOCAL_DIR` 环境变量——显式覆盖，优先级高于一切探测（安装版/非常规布局用）。
  回归锁：`npm run verify:runtime` 新增两条断言（PORTABLE 锚点先于 dev `__dirname` 命中夹具；env 覆盖一切锚点）。
- **第三方插件 dsh-vision-router 图片预览修复**：该插件的 presentation boundary 垫片为 rc.8+ 自带一份 `PresentedImage`/`ImageGallery`（官方 rc.8 起不再导出 attachment React 实现），其「查看原图」浮层以 `position:fixed` **就地**渲染在消息流里，被祖先的 `content-visibility:auto`/`contain:paint` 困在单条消息的盒子内——点击模型图片后全屏遮罩只盖一条消息、大图从盒中溢出（表现为显示异常）。修复 = 浮层改经 `ReactDOM.createPortal(document.body)` 挂载（与官方 `ImageLightbox` 同法）。该插件为市场安装（非工作区源码），修复直接落在安装产物 `~/.dsh/profiles/web/node_modules/dsh-vision-router/lib/client-presentation-boundary-main.js`（原文件备份 `.bak-portal`），并配幂等重放器：**插件市场/self-update 覆盖安装后跑 `npm run fix:vision-router-portal` 重打**（锚点不匹配即上游改版，脚本拒改报错）
- **第三方插件 dsh-mnemon 设置卡静默死控件修复（0.5.2 后补丁，随仓脚本交付）**：记忆系统设置卡的不可用告警 guard 原要求 core+interaction 两个设置快照**同时** unavailable 才显示；单侧 RPC 失败（瞬时超时/Host 未就绪）时卡片照常渲染但 `coreDisabled=true`——展示形态（Sidebar/Buildin）等单选组静默禁用、零提示（「无法切换」体感）。修复 = guard 改 `||`（任一不可用即显式告警）+ 告警页附「重试 / Retry」按钮原地重载两个快照。落在安装产物 `lib/client.js`（备份 `.bak-visibility`），重放器 `npm run fix:mnemon-settings-visibility`；插件升级覆盖后重跑即可
- **大图预览关闭按钮让出窗口控制条热区（866583d）+ 拖拽区勘正与 hover 交互（33d2084）**：壳窗口控制条 `#dsh-desktop-win-controls` 恒 fixed top0/高40/z-index 2147483647，而官方 `ImageLightbox`（top20/right20）与 vision-router 便桥浮层（top16/right18）的关闭按钮中心都落在控制条热区内。dshvt CSS 注入 `!important` 规则把两类关闭按钮统一压到安全区令牌之下：`top:calc(var(--dsh-titlebar-safe,44px) + 10px)`、`right:24px`（旧壳无令牌取 44 兜底）。**位置修复后仍点不动的真因**：`TITLEBAR_DRAG_CSS` 把 `header[class*="_header"]` 整条设为 `-webkit-app-region:drag`，而 Electron 拖拽区是几何并集、上层浮层不清除下层 drag 矩形，顶栏（~100px 高）盖住 top:54 的 ×，物理点击全被窗口拖拽吞掉（AXPress 绕过命中测试，会造成"辅助功能可点、鼠标点不动"的假阴性）——修复为两类浮层整体 `no-drag`（遮罩期窗口拖拽失效属模态常规语义）。同批关闭钮 hover 交互：悬停红底白叉 `#e81123`、按下 `#c50f1f`、0.15s 过渡；选择器锚 role/aria 与 CSS module 类名后缀，防构建哈希漂移，双轨通用，纯 dshvt 注入无需动壳或上游

### 补丁层双轨自动同步（R50）

官方轨（npx 缓存）与本地构建轨（monorepo）的补丁/修改同步由 patches.cjs 重放器自动完成，分三种机制：

- **profile 层结构性同步**（14 个 family 中的 12 个）：市场插件与 devlink 核心包物理上只有 `~/.dsh/profiles` 一份文件，两轨共用，打一次两轨生效；
- **双根重放**：[K] settings-nest 同时列 npx 缓存与 profile devlink 根；[J] presets 同时覆盖官方 npx 缓存、用户自定义（`~/.dsh/.agent-presets`）与本地 monorepo（`apps/cli/config/agent-presets`）三源（R50 补齐本地根）；
- **全自动触发**：壳启动、每次拉起 dsh 前、45 秒 patch-guardian 周期重放；哨兵幂等 + `.bak` 链 + 上游漂移刷新保证自愈。

R50 两项加固：

- **makeCtx rep/repAll 换行符自适应**：Windows 重装/更新的 npm 包产物可能是 CRLF，而锚点按 `\n` 书写（node-nav 0.2.3 / turn-review 更新后 matched 0 的根因）；现按 `\n`/`\r\n` 双拼写分别计数与替换，单行锚点行为不变；
- **审计命令 `npm run audit:patches`**：双副本（`~/.dsh/patches.cjs` 与仓库镜像）sha256 校验 + family×轨道覆盖矩阵（P=profile 两轨共享 / O=官方 npx / L=本地 monorepo）+ 幂等重放状态，失配或 FAIL 时 exit 1。

**纪律**：任何新 family 必须双轨覆盖（profile 单文件，或 O+L 双根），或在该 family 注释中显式声明单轨意图；patches.cjs 两份副本始终同步修改；镜像副本虽被仓库跟踪，按约定**永不提交**（运行面 `~/.dsh/patches.cjs` 为准）。

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