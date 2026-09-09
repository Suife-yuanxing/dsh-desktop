# dsh-desktop

**DeepSeek Harness 桌面壳** —— 基于 Electron 的 Windows 原生桌面封装，为 DeepSeek Harness（DSH）Web UI 提供本地桌面体验：原生窗口、系统托盘、启动画面、版本锁定、自动更新与崩溃自愈。

当前版本：**v0.5.15**（维护批 93-131）

---

## 特性一览

### 桌面体验
- **原生桌面封装**：多窗口共享同一 DSH 服务实例，全中文托盘菜单与原生对话框
- **启动画面**：实时展示 DSH 启动阶段（初始化 / 启动 / 等待 / 就绪 / 崩溃）
- **启动白屏治理（批次 106）**：bootGate 揭窗闸门以「应用就绪探测」为准（250ms 探测 `#root` 挂载 + 主题令牌，4s 主题宽限，20s 硬兜底），揭窗原因与时延落日志
- **自定义皮肤**：导入图片 / 视频 / 音频作为桌面背景，Wallpaper Engine 创意工坊视频壁纸集成

### 版本与运行时管理
- **DSH 版本锁定**：`~/.dsh/desktop-config.json` 的 `dshVersion` 锁定 DSH 版本，避免意外更新导致不兼容
- **版本切换唯一通道 = 壳管理 API `POST :30801/switch`**：预检（probe）→ 写锁 → 60s 切换预算重启 → 就绪确认，失败自动回写旧版并完整重启回滚；外部直改 profile junction / `desktop-config.json` 均会被回滚兜底恢复（实证两次）
- **dsh 运行时双轨**：`official`（npx 缓存快速路径）与 `local`（本地 monorepo 构建产物）任意切换，任一侧异常自动折叠回退原轨并落 breadcrumb；设置界面（壳设置「运行时」卡 + Web UI 更新页）与配置文件等价

### 稳定性与自愈
- **崩溃自愈**：自动检测 DSH 服务崩溃，指数退避重启（最多 3 次），失败后托盘提示手动处理
- **补丁层自愈（patches.cjs）**：市场插件 / 上游升级冲掉本地适配时，启动重放 + 45s patch-guardian 周期重放自动重打补丁；哨兵幂等 + `.bak` 链 + 上游漂移刷新；双轨同步（profile 单文件两轨共享 / 官方 npx + 本地 monorepo 双根）
- **归档会话管理**：会话删除 / 归档 / 恢复（上游 unarchive RPC），归档页批量操作与打开期间轻轮询跟进
- **自动更新**：壳自身 electron-updater 增量更新（`latest.yml`），DSH 运行时 npm 更新

### 系统集成
- **管理 API**：壳内置 HTTP API（端口 30801），供 Web UI 调用版本 / 插件 / 皮肤等管理能力
- **NSIS 安装包 + 便携版**：一键安装（自定义目录 / 桌面快捷方式）或免安装便携运行
- **CI 自动发版**：推送 `v*` tag 即触发 GitHub Actions 构建 Windows 安装包并自动发布 Release

---

## 安装

### 从 Release 安装（推荐）

前往 [Releases](https://github.com/Suife-yuanxing/dsh-desktop/releases) 页面，下载最新版本：

| 产物 | 说明 |
|------|------|
| `DeepSeek-Harness-Setup-x.x.x.exe` | NSIS 安装包，一键安装 |
| `DeepSeek-Harness-Portable-x.x.x.exe` | 便携版，免安装即用 |

> 每次发布均附带 `.blockmap` 与 `latest.yml`，供 electron-updater 做增量更新。

### 从源码构建

**前置要求：** Node.js >= 20、npm

```bash
git clone https://github.com/Suife-yuanxing/dsh-desktop.git
cd dsh-desktop
npm install
npm run dist        # 构建产物位于 dist-v0.3/
```

---

## 快速使用

安装后启动 **DeepSeek Harness**，程序自动：显示启动画面 → 经 npx 快速路径拉起 DSH Web 服务（`official` 轨）或执行本地构建产物（`local` 轨）→ 服务就绪（bootGate 探测通过）后揭窗加载界面。

**系统托盘**（右键图标）：

| 菜单项 | 功能 |
|--------|------|
| 新建窗口 | 打开新窗口，共享同一 DSH 服务 |
| 重启服务 | 重启 DSH 运行时（带进度遮罩） |
| 检查 dsh 更新 | 检查 npm 上 DSH 新版本 |
| 检查壳更新 | 检查壳自身新版本 |
| 查看日志 | 打开日志目录 |
| 关于 / 退出 | 版本信息 / 关闭全部窗口并停止服务 |

---

## 核心机制

### 版本锁与切换

配置：`~/.dsh/desktop-config.json`

| 字段 | 取值 | 语义 |
|------|------|------|
| `dshVersion` | 版本号 | official 轨的 npx 安装规格，默认锁定到已验证版本 |
| `dshRuntime` | `"official"` / `"local"` | 运行时来源：官方 npx 缓存路径 / 本地构建产物 |
| `dshLocalDir` | 目录绝对路径（可选） | local 轨构建产物目录；缺省向上探测兄弟仓 `deepseek-harness/apps/cli/lib` |

**切换协议（壳管理 API :30801）**：

- `GET /state` → `{shellVersion, dshVersion, availableVersions[], switching, restarting}`
- `POST /switch`，body `{"version":"0.1.2-rc.1"}`，须带 `Origin: http://127.0.0.1:3080` 同源头；非字符串 / 空 / 不在可用列表 → 400，切换中或版本未变 → 409，受理 → 202 后异步执行
- 编排链：probe 预检（离线命中 npx 缓存快速路径）→ 写锁 → `restartDsh`（60s 切换专属预算）→ 就绪确认 → 刷新全部主窗口；60s 未就绪自动回写旧版本并完整重启回滚
- **纪律**：版本切换唯一通道是 `/switch`；外部改动运行时文件会被回滚兜底恢复，「窗口内成功」是假象，验收以 `/state` 为准

### dsh 运行时双轨

- **official 轨**：npx 缓存快速路径（pnpm 镜像预种），版本锁约束安装规格
- **local 轨**：直接执行本地构建目录 `bin.js`（`node --expose-internals <bin.js> web`）；首次启用前在 deepseek-harness 内执行 `powershell -File scripts/link-local-runtime.ps1` 完成依赖闭包组装
- local 目标做能力探测（bin.js 存在 + node.exe 可解析），异常折叠回 official 并记录 breadcrumb
- 便携版打包态锚点：`PORTABLE_EXECUTABLE_DIR`（electron-builder 注入）与 `DSH_LOCAL_DIR` 环境变量（显式覆盖，优先级最高）

### 补丁层自愈（patches.cjs）

市场插件与上游包升级会冲掉本地适配（已多次实证）。`patches.cjs` 重放器按 family 管理补丁：

- **触发**：壳启动、每次拉起 dsh 前、45s patch-guardian 周期重放
- **幂等**：哨兵标记（already）+ `.bak` 链（盲区恢复）+ 上游漂移刷新（锚点失效即重新审视）
- **双轨同步**：profile 层单文件两轨共用；`[K]` settings-nest 双根（npx 缓存 + profile devlink），`[J]` presets 三源（官方缓存 / 用户自定义 / 本地 monorepo）
- **审计**：`npm run audit:patches` 双副本 sha256 校验 + family×轨道覆盖矩阵，失配即 exit 1

**纪律**：新 family 必须双轨覆盖（profile 单文件，或 O+L 双根），或显式声明单轨意图；`patches.cjs` 两份副本（仓库镜像 + 运行面 `~/.dsh/patches.cjs`）始终同步修改。

---

## 开发与验证

| 命令 | 说明 |
|------|------|
| `npm start` | 以 Electron 启动（开发） |
| `npm run dist` | 构建安装包 + 便携版（`predist` 自动检查版本锁产物） |
| `npm run verify:runtime` | 双轨解析各分支与日志留痕断言 |
| `npm run verify:boot-gate` | bootGate 五场景回归（就绪 / 宽限 / 硬兜底 / 探针异常 / 宽限内补齐） |
| `npm run audit:patches` | 补丁覆盖矩阵审计 |
| `npm run fix:vision-router-portal` | 重打 vision-router 图片预览 portal 补丁（插件升级覆盖后重跑） |
| `npm run fix:mnemon-settings-visibility` | 重打 mnemon 设置卡可见性补丁 |

---

## 项目结构

```
dsh-desktop/
├── main.js                  # Electron 主进程（bootGate / 管理 API :30801 / 版本切换编排）
├── preload.js               # 预加载脚本（contextBridge API）
├── patches.cjs              # 本地补丁重放器（family 体系 + patch-guardian）
├── builder.yml              # electron-builder 配置
├── package.json             # 项目配置与脚本
├── splash.html              # 启动画面
├── error.html               # 崩溃错误页
├── settings.html            # 壳设置页
├── whale-data.js            # 启动画面素材数据
├── scripts/                 # 构建 / 校验 / 修复脚本
│   ├── check-dist-lock.mjs
│   ├── check-dsh-runtime.mjs
│   ├── check-boot-gate.mjs
│   ├── audit-patch-coverage.cjs
│   ├── patch-vision-router-portal.mjs
│   ├── patch-mnemon-settings-visibility.mjs
│   ├── fix-broken-plugin-links.mjs
│   ├── add-defender-exclusions.ps1
│   └── link-local-runtime.ps1
├── docs/                    # 文档
├── dsh-plugin/              # DSH 插件相关
└── .github/workflows/       # CI（v* tag → 自动构建并发布 Release）
```

---

## 技术栈

- **Electron** ^33 — 跨平台桌面框架
- **electron-builder** ^25 — 应用打包与构建
- **electron-updater** ^6.8 — 自动更新
- **NSIS** — Windows 安装程序

## 发布流程

推送 `v*` tag（如 `git push origin v0.5.15`）即触发 [release.yml](.github/workflows/release.yml)：

```
push v* tag → windows-latest 构建 → electron-builder --publish always
           → 自动创建 GitHub Release + 上传 便携版 / 安装包 / blockmap / latest.yml
```

---

## 许可证

[MIT](LICENSE)
