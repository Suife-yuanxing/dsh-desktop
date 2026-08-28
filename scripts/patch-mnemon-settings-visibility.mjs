// dsh-mnemon 记忆系统设置「静默死控件」修复重放器(npm run fix:mnemon-settings-visibility)
// 背景:v0.5.2 批次排查「展示形态(Buildin)无法切换」:当前构建切换全链路(单选可点/
// 保存持久化/入口随 displayMode 挂卸)活体验证均正常;唯一潜伏缺陷 = MnemonSettingsCard
// 的不可用告警 guard 要求 core+interaction 两个设置快照同时 unavailable 才显示,
// 单侧 RPC 失败(瞬时超时/Host 未就绪)时卡片照常渲染但 coreDisabled=true——
// 展示形态等单选组静默禁用、零提示,正是「点了没反应/无法切换」的可行机制。
// 修复:guard 改为任一 scope unavailable 即显示告警页,并附「重试」按钮原地
// 重载两个快照(scope.load()/interactionScope.load(),12s RPC 超时后可一键恢复)。
// 本脚本幂等:已打(marker 在)跳过;锚点不匹配(插件更新改版)拒改报错。
import { copyFileSync, readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const CANDIDATES = [
  join(homedir(), '.dsh', 'profiles', 'web', 'node_modules', 'dsh-mnemon', 'lib', 'client.js'),
  join(homedir(), '.dsh', 'profiles', 'node_modules', 'dsh-mnemon', 'lib', 'client.js'),
]
const file = CANDIDATES.find((p) => existsSync(p))
if (!file) {
  console.error('fix:mnemon-settings-visibility — 未找到 dsh-mnemon 安装(可能未安装该插件),跳过。')
  process.exit(0)
}

const MARKER = 'mnemon-settings-visibility-fix'
const OLD = `\t\t\tif (coreSnapshot.status === "unavailable" && interactionSnapshot.status === "unavailable") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("section", {\n\t\t\t\tclassName: MnemonSettingsCard_module_css_default.page,\n\t\t\t\t"aria-label": t("config.aria"),\n\t\t\t\tchildren: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {\n\t\t\t\t\tclassName: MnemonSettingsCard_module_css_default.error,\n\t\t\t\t\trole: "alert",\n\t\t\t\t\tchildren: t("config.unavailable")\n\t\t\t\t})\n\t\t\t});`
const NEW = `\t\t\t// [dsh-desktop ${MARKER}] 任一设置快照不可用即显式告警 + 原地重试。
\t\t\t// 原为 &&(两侧同时不可用才告警):单侧 RPC 失败时卡片照常渲染但
\t\t\t// coreDisabled=true,展示形态等单选组静默禁用零提示("无法切换"体感)。
\t\t\tif (coreSnapshot.status === "unavailable" || interactionSnapshot.status === "unavailable") return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {\n\t\t\t\tclassName: MnemonSettingsCard_module_css_default.page,\n\t\t\t\t"aria-label": t("config.aria"),\n\t\t\t\tchildren: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {\n\t\t\t\t\tclassName: MnemonSettingsCard_module_css_default.error,\n\t\t\t\t\trole: "alert",\n\t\t\t\t\tchildren: t("config.unavailable")\n\t\t\t\t}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {\n\t\t\t\t\ttype: "button",\n\t\t\t\t\tstyle: { marginTop: 12, padding: "6px 14px", borderRadius: 8, border: "1px solid var(--dsw-alias-border-l2)", background: "var(--dsw-alias-bg-layer-2)", color: "var(--dsw-alias-label-primary)", cursor: "pointer", font: "inherit", fontSize: 13 },\n\t\t\t\t\tonClick: () => {\n\t\t\t\t\t\tscope?.load?.();\n\t\t\t\t\t\tinteractionScope?.load?.();\n\t\t\t\t\t},\n\t\t\t\t\tchildren: "重试 / Retry"\n\t\t\t\t})]\n\t\t\t});`

let c = readFileSync(file, 'utf8')
if (c.includes(MARKER)) {
  console.log('fix:mnemon-settings-visibility — 已打补丁,跳过。')
  process.exit(0)
}
if (!c.includes(OLD)) {
  console.error('fix:mnemon-settings-visibility — 锚点不匹配(dsh-mnemon 已改版?),拒绝盲改;请人工核对 ' + file)
  process.exit(1)
}

const backup = file + '.bak-visibility'
if (!existsSync(backup)) copyFileSync(file, backup)
c = c.replace(OLD, NEW)
const tmp = file + '.tmp-visibility'
writeFileSync(tmp, c)
renameSync(tmp, file)
console.log('fix:mnemon-settings-visibility — 已修复并写回(备份: .bak-visibility)。强刷 Web UI 即生效。')
console.log('  ' + file)
