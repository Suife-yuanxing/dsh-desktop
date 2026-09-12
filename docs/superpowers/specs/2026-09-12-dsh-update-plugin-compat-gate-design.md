# dsh 更新前插件兼容性预检与确认门控 — 设计文档

> 2026-09-12 · v0.5.17 批次 · 状态:已实现

## 需求

dsh 更新时优先检查当前安装且启用的插件是否与更新目标版本兼容;如有不兼容则提醒用户,等待用户确认后才继续安装最新版本。同时调研业界有无类似或更优方案。

## 业界调研结论

| 生态 | 做法 | 与本方案的关系 |
|------|------|----------------|
| VS Code | 插件声明 `engines.vscode` 语义化范围;市场只解析兼容版本,最新版不兼容时回退旧版插件 | 同为「声明元数据」判定;本生态插件多为本仓/社区直装版,无按宿主版本回滚的发布矩阵,故不做自动降级 |
| JetBrains | IDE 升级前/时警告不兼容插件,引导先升级/禁用 | 同型:警告后放行 |
| WordPress | 「未经测试」元数据警告 + Install Anyway 确认 | 同型:警告 + 确认,与本地 dshmarket「仍要安装」先例一致 |
| 结论 | 「元数据判定 + 警告后放行」是通行模式;更优的「自动解析兼容版本」在本生态不可行(插件无多版本发布矩阵) | — |

## 判定口径(实证校准)

- 信号源:插件 package.json 的 `engines.dsh` + `peerDependencies` 中 `@deepseek-ai/dsh` 前缀声明。`@deepseek-ai/cordis`/`schemastery` 不在 dsh 锁步版本线,忽略(同 dshmarket `deriveHostCompatibility` 口径);`workspace:^` 等非版本声明视为无信号。
- 目标数据:新版将携带的 `@deepseek-ai/dsh*` 子包版本。双源:① npx 缓存树(预检播种后即有,精确版本,离线;三层并集兼容 npm 扁平布局与 pnpm 虚拟仓库布局,深层传递依赖如 dsh-client-* 在 `.pnpm` 各段);② packument `versions[target].dependencies`(HTTP 三级降级,范围声明)。
- 判定:engines.dsh / peer dsh → 目标版本是否满足范围;其他 dsh 子包 peer → 插件范围与新版子包依赖范围是否相交。无交集 = 不兼容。
- 关键实证(真实机器,目标 0.1.5-rc.2):exact 钉死声明全部被准确检出(如 `dsh-tools@0.1.0-rc.6`、`0.1.5-rc.1`、`^0.0.1-rc.1`、`0.1.5-rc.1 || 0.1.2-rc.1 || …`),caret/`>=` 声明全部正确放行。rc 线高频发版下 caret 声明天然跨 rc 兼容,exact 钉死是失配主因。
- 预发布语义:预发布按全序参与匹配,不做 semver「同元组预发布才匹配」限制(dsh 0.1.x 全线预发布,`^0.1.0-rc.6` 本意即覆盖后续 rc)。

## fail-open 原则(不挡更新)

声明缺失、写法不认识、目标依赖数据不可得(缓存未预热且 npm 不可达)、检查内部异常——一律放行并记日志。插件兼容性检查永不阻断更新主流程;失败时行为与旧版完全一致。

## 用户确认门控(两个入口)

1. **Web UI 更新 tab**(截图中的「更新 dsh」按钮):`POST /updates/apply-dsh` 不带确认时,壳评估后返 `{ ok:true, needsCompatConfirm:true, target, incompatible:[{name,version,reason}] }`,前端渲染内联确认块(复用 `cm_confirm` 样式族,列出不兼容插件与原因),「仍要更新」回带 `{ confirmCompat:true, target }` 继续安装(target 回带防两次点击间最新版漂移),「取消」终止。
2. **壳设置窗口**(`检查 dsh 更新` → `checkDshUpdate`):用户选「更新并重启服务」后、可运行性预检前,若检出不兼容则弹 warning 对话框列出清单(至多 8 条+计数),「仍要更新并重启服务 / 取消」,取消即终止。

`POST /switch`(版本直切端点)当前无 UI 调用方,未加门控(口径变更留待有调用方时跟进)。

## 实现落点

| 文件 | 内容 |
|------|------|
| `dsh-plugin-compat.cjs`(新) | 零依赖引擎:宽松 semver 解析/范围求交、目标树双源解析(10 分钟记忆)、启用插件清单(profile 账本 bundles − 双层 patch 禁用行 − dsh 锁步内建包)、信号提取与判定、汇总评估(内部错误折价为 error 字段)。网络与宿主状态经 `createCompatChecker` 注入 |
| `main.js` | `fetchDshPackument`(packument 拉取带 5 分钟记忆,版本清单共用)、`parsePatchFile`/`parsePatchText` 拆分、预检器实例装配、`applyDshLatest(body)` 门控、`/updates/apply-dsh` 带体、`checkDshUpdate` 二次确认对话框 |
| `dsh-plugin/lib/client.js` | `applyDsh` 处理 `needsCompatConfirm` + 内联确认块(`.cm_compat` 样式)+ 轮询 10 分钟兜底 + 文案 |
| `settings.html` | 提示文案 |

安全加固:账本包名/缓存哈希目录名过白名单正则(拒绝 `..`)后才拼路径;本模块不触网、不执行命令。

## 已知近似(有意为之)

- 禁用行 id 与包名大多同名;个别行 id 不同的包按「已启用」处理——宁多勿漏(多提醒可取消,漏提醒破坏数据)。
- 新版树未见某 peer 子包(深层嵌套/依赖重构)→ 无法判定,放行。
- 测试脚本:`scripts/_tmp-compat-engine-test.cjs`(39 断言)、`scripts/_tmp-compat-integration.cjs`(真实机器全链路)。
