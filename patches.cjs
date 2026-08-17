// dsh-desktop 本地补丁重放器 v3(统一版;main.js 每次启动时自动调用,亦可单独运行: node patches.cjs)
// 目标: 插件经 pnpm 更新覆盖 node_modules 后,壳启动即自动恢复全部本地定制,彻底告别手动重打。
//
//   [A] dsh-better-sidebar (验证 0.12.1 → 0.12.3)
//       A1 底部面板剔除: migrateBottomTabs 无条件合并 + toggle×2/bottomPanel/cornerHandle 编译剔除 + height=0
//       A2 Claude-GUI 浮动卡片: panel top85/right8/bottom8 + radius12 + 全 border + shadow + overflow hidden
//          + toggleCluster top88/right18 + panelHidden +16px + panelResize left0 + boundaryError 同风格 + tabBar 48
//       A3 Claude 动效: :root --dsh-bsr-slide-duration 300ms / --dsh-bsr-slide-ease; #root/#centerCol 共用曲线
//       A4 对称 gap: --dsh-bsr-gap 8px(collapsed 0), #root margin-right = calc(width + gap*2)
//       v3 关键改进: CSS 采用「整条规则正则替换」(匹配 .P_rule{...} 边界,重写全文),
//       规则内部属性漂移(z-index 50→40 / 背景变量 / transition 展开式)不再导致补丁失败。
//
//   [B] dsh-node-nav (验证 0.2.3)
//       B1 圆点导航 rail 右侧(right:28) → 聊天区左缘(left:292 = 280 侧栏 + 12)
//       B2 预览弹窗改从 rail 右侧弹出; miss 提示跟随左侧
//       B3 圆点缩小 11→8px、halo 收窄 3→2px、强调色 indigo → Claude 橙 #d97757
//       (2026-08-17 起圆点精化/侧栏联动改由 dshvt client.js 运行时覆盖层实现,此处保留基底位置补丁)
//
//   [C] 设置页信息架构(2026-08-17):第三方 section 重排 + 社区插件并入插件市场
//       C1 mnemon 记忆系统 order 20→13(紧跟 人设11/技能12)
//       C2 dshmarket 插件市场 order 40→16,新增「社区」tab(静态索引镜像 community-plugins 内置清单)
//       C3 web-ui-settings Web UI 插件 order 110→17;C4 dsh-pet 宠物 order 130→18
//       C5 community-plugins 独立 section 摘除(if(false) 门控,内容已并入市场 tab)
//       C6 better-sidebar 侧边卡片 order 100→21(随 [A] 链重放)
//
// 自愈策略: 每个文件首次补丁前留 .bak-*;之后每次重放以 .bak 为基底从头重打,
// 计数不符 → 写回原始内容并告警(绝不留半补丁状态),完全幂等。
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')

const PLUGINS = path.join(os.homedir(), '.dsh', 'profiles', 'web', 'node_modules')
const MOTION = 'var(--dsh-bsr-slide-duration) var(--dsh-bsr-slide-ease)'

// ---- 通用: 计数式字符串替换 / 计数式正则替换 ----
function makeCtx(file) {
  const failures = []
  return {
    failures,
    rep(c, from, to, expected, label) {
      const n = c.split(from).length - 1
      if (n !== expected) { failures.push(`[${file}] ${label}: matched ${n}, expected ${expected}`); return c }
      return c.split(from).join(to)
    },
    rex(c, re, to, expected, label) {
      const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g')
      const hits = [...c.matchAll(g)]
      if (hits.length !== expected) { failures.push(`[${file}] ${label}(regex): matched ${hits.length}, expected ${expected}`); return c }
      return c.replace(g, to)
    },
    // 次数随版本浮动的全量替换(如色值),≥1 即可
    repAll(c, from, to, label) {
      const n = c.split(from).length - 1
      if (n < 1) { failures.push(`[${file}] ${label}: not found`); return c }
      return c.split(from).join(to)
    },
    // 可选正则替换:0.12.3 新增的 title-bar-strip 兼容规则存在则中和,不存在(未来版本移除)则跳过
    rexOpt(c, re, to, label) {
      const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g')
      const hits = [...c.matchAll(g)]
      if (hits.length > 1) { failures.push(`[${file}] ${label}(rexOpt): matched ${hits.length} > 1`); return c }
      return hits.length === 1 ? c.replace(g, to) : c
    },
    // 全量正则替换:命中 ≥1 即可(次数随版本浮动,如桌面/移动端双 tabBar 规则)
    rexAll(c, re, to, label) {
      const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g')
      const hits = [...c.matchAll(g)]
      if (hits.length < 1) { failures.push(`[${file}] ${label}(rexAll): not found`); return c }
      return c.replace(g, to)
    },
  }
}

// ---- [A] dsh-better-sidebar ----
function patchBetterSidebar() {
  const dir = path.join(PLUGINS, 'dsh-better-sidebar')
  const results = []
  if (!fs.existsSync(dir)) return [{ file: 'dsh-better-sidebar', missing: true }]
  const ver = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).version
  const FULL = ['client.js', 'client-registry.js'] // 完整 Sidebar 产物;terminal/editor 天然 no-op

  for (const f of ['client.js', 'client-registry.js', 'client-terminal.js', 'client-editor.js']) {
    const p = path.join(dir, 'lib', f)
    if (!fs.existsSync(p)) continue
    const isFull = FULL.includes(f)
    const { rep, rex, rexOpt, rexAll, failures } = makeCtx(`bsr/${f}`)

    const apply = (c) => {
      // A1 JS 剔除(锚点经 0.12.1/0.12.3 双版本验证,esbuild 未压缩输出稳定)
      if (isFull) {
        // C6 设置导航「侧边卡片」order 100 → 21(沉底到 Agent 预设之后、更新之前)
        if (c.includes('id: "better-sidebar"')) {
          c = rex(c, /id: "better-sidebar",(\s*\n\s*)order: 100,/, 'id: "better-sidebar",$1order: 21,', 1, 'settings-order')
        }
        c = rep(c, 'if (!narrow || sessionId === void 0) return;', 'if (sessionId === void 0) return;', 1, 'migrate-gate')
        c = rep(c, 'const height = !narrow && snapshot.state?.bottomOpen === true ? Math.min(snapshot.state.bottomHeight, window.innerHeight) : 0;', 'const height = 0;', 1, 'height0')
        c = rex(c, /!narrow && (\/\* @__PURE__ \*\/ \(0, react_jsx_runtime\.jsx\)\(_deepseek_ai_dsh_client_ui_primitives\.Tooltip, \{\s*label: t\("noSession"\),)/, 'false && $1', 1, 'toggle-noSession')
        c = rex(c, /!narrow && (\/\* @__PURE__ \*\/ \(0, react_jsx_runtime\.jsx\)\(_deepseek_ai_dsh_client_ui_primitives\.Tooltip, \{\s*label: state\.bottomOpen \? t\("collapseBottomPanel"\))/, 'false && $1', 1, 'toggle-main')
        c = rex(c, /!narrow && (\/\* @__PURE__ \*\/ \(0, react_jsx_runtime\.jsxs\)\("div", \{\s*ref: bottomRef,)/, 'false && $1', 1, 'bottomPanel-block')
        c = rep(c, '!narrow && state.panelOpen && state.bottomOpen &&', 'false &&', 1, 'corner')
      }

      // A2 CSS 整条规则重写(匹配规则边界 + 内容签名,免疫内部属性漂移/后置覆盖规则)
      const pm = c.match(/\.([A-Za-z0-9_-]+)_panel\{[^}]*position:fixed/)
      if (pm) {
        const P = pm[1]
        const rules = [
          // 主规则以 position:fixed 为内容签名,避开 0.12.3 新增的 _panel{padding-title-strip} 后置规则
          ['panel', new RegExp(`\\.${P}_panel\\{[^}]*position:fixed[^}]*\\}`), `.${P}_panel{z-index:50;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l2);border-radius:12px;box-shadow:0 12px 32px rgba(0,0,0,.1),0 2px 8px rgba(0,0,0,.06);box-sizing:border-box;overflow:hidden;transition:transform ${MOTION}, width ${MOTION};flex-direction:column;display:flex;position:fixed;top:85px;bottom:8px;right:8px}`],
          ['panelHidden', new RegExp(`\\.${P}_panelHidden\\{[^}]*\\}`), `.${P}_panelHidden{pointer-events:none;visibility:hidden;transition:transform ${MOTION}, width ${MOTION}, visibility 0s linear var(--dsh-bsr-slide-duration);transform:translateX(calc(102% + 16px))}`],
          ['panelResize', new RegExp(`\\.${P}_panelResize\\{[^}]*\\}`), `.${P}_panelResize{cursor:col-resize;z-index:2;touch-action:none;width:8px;position:absolute;top:0;bottom:0;left:0}`],
          ['toggleCluster', new RegExp(`\\.${P}_toggleCluster\\{[^}]*position:fixed[^}]*\\}`), `.${P}_toggleCluster{z-index:55;flex-direction:row;gap:4px;display:flex;position:fixed;top:88px;right:18px}`],
          ['bottomPanel', new RegExp(`\\.${P}_bottomPanel\\{[^}]*\\}`), `.${P}_bottomPanel{z-index:50;background:var(--dsw-alias-bg-layer-1);border-top:1px solid var(--dsw-alias-border-l2);transition:transform ${MOTION}, height ${MOTION};flex-direction:column;display:flex;position:fixed;bottom:0}`],
          ['bottomPanelHidden', new RegExp(`\\.${P}_bottomPanelHidden\\{[^}]*\\}`), `.${P}_bottomPanelHidden{pointer-events:none;visibility:hidden;transition:transform ${MOTION}, height ${MOTION}, visibility 0s linear var(--dsh-bsr-slide-duration);transform:translateY(102%)}`],
          ['boundaryError', new RegExp(`\\.${P}_boundaryError\\{[^}]*\\}`), `.${P}_boundaryError{z-index:50;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l2);border-radius:12px;box-shadow:0 12px 32px rgba(0,0,0,.1),0 2px 8px rgba(0,0,0,.06);box-sizing:border-box;font:var(--dsw-font-xxs-12);color:var(--dsw-alias-state-error-primary);flex-direction:column;align-items:flex-start;gap:8px;padding:16px;display:flex;position:fixed;top:85px;bottom:8px;right:8px;overflow:auto}`],
        ]
        for (const [name, re, body] of rules) {
          c = rex(c, re, body, 1, `css-${name}`)
        }
        // 0.12.3 新增 title-bar-strip 兼容层:后置覆盖 top/padding-top,与浮动卡片(top:85)冲突 → 中和
        c = rexOpt(c, new RegExp(`\\.${P}_panel\\{padding-top:var\\(--dsh-title-bar-strip[^}]*\\}`), `.${P}_panel{padding-top:0}`, 'css-panel-strip')
        c = rexOpt(c, new RegExp(`\\.${P}_toggleCluster\\{top:calc\\(var\\(--dsh-title-bar-strip[^}]*\\}`), `.${P}_toggleCluster{top:88px}`, 'css-toggleCluster-strip')
        // tabBar:桌面 72px + 移动端媒体查询内同形规则,全量归一为 48px
        c = rexAll(c, new RegExp(`\\.${P}_panel:not\\(\\.${P}_panelHidden\\) \\.${P}_tabBar\\{padding-right:\\d+px\\}`),
          `.${P}_panel:not(.${P}_panelHidden) .${P}_tabBar{padding-right:48px}`, 'css-tabBar')
      } else if (isFull) {
        failures.push(`[bsr/${f}] panel prefix not found`)
      }

      // A3/A4 layout.css(字面 \n 转义;正则容忍 transition 写法漂移)
      if (/margin-right: var\(--dsh-sidebar-width, 0px\);/.test(c)) {        c = rex(c, /#root \{\\n  margin-right: var\(--dsh-sidebar-width, 0px\);\\n  transition: margin-right [^;]*;\\n\}/,
          `#root {\\n  margin-right: calc(var(--dsh-sidebar-width, 0px) + var(--dsh-bsr-gap, 0px) * 2);\\n  transition: margin-right var(--dsh-bsr-slide-duration) var(--dsh-bsr-slide-ease);\\n}`, 1, 'layout-root')
        c = rex(c, /(margin-bottom: var\(--dsh-sidebar-height, 0px\);\\n  transition: margin-bottom )[^;]*;/, `$1${MOTION};`, 1, 'layout-centerCol')
        c = rep(c, 'padding-right: 78px;', 'padding-right: 54px;', 1, 'layout-collapsedHeader')
        const VARS = `:root {\\n  --dsh-bsr-slide-duration: 300ms;\\n  --dsh-bsr-slide-ease: cubic-bezier(0.32, 0.72, 0, 1);\\n  --dsh-bsr-gap: 8px;\\n}\\n\\nbody[data-dsh-sidebar-collapsed] {\\n  --dsh-bsr-gap: 0px;\\n}\\n\\n`
        c = rex(c, /(#root \{\\n  margin-right: calc\(var\(--dsh-sidebar-width, 0px\) \+ var\(--dsh-bsr-gap, 0px\) \* 2\);)/, VARS + '$1', 1, 'layout-vars')
      } else if (isFull) {
        failures.push(`[bsr/${f}] layout.css anchor missing`)
      }
      return c
    }

    results.push(rewrite(p, '.bak-repatch', apply, failures))
  }
  return results.map((r) => ({ ...r, version: ver }))
}

// ---- [B] dsh-node-nav ----
function patchNodeNav() {
  const p = path.join(PLUGINS, 'dsh-node-nav', 'client.js')
  if (!fs.existsSync(p)) return [{ file: 'dsh-node-nav', missing: true }]
  const ver = JSON.parse(fs.readFileSync(path.join(PLUGINS, 'dsh-node-nav', 'package.json'), 'utf8')).version
  const { rep, repAll, failures } = makeCtx('node-nav')

  const apply = (c) => {
    // B1 位置: 右 → 左(292 = 280 侧栏 + 12)
    c = rep(c, '.dsh-node-nav-rail { position: fixed; right: 28px;', '.dsh-node-nav-rail { position: fixed; left: 292px;', 1, 'rail-pos')
    c = rep(c, '.dsh-node-nav-miss { position: fixed; right: 52px;', '.dsh-node-nav-miss { position: fixed; left: 316px;', 1, 'miss-pos')
    c = rep(c, 'style: { right: `${detailsWidth > 0 ? detailsWidth + 18 : 28}px` },', 'style: { left: "292px" },', 1, 'rail-inline')
    // B2 预览从锚点左侧 → rail 右侧弹出
    c = rep(c, 'preview.style.right = `${window.innerWidth - r.left + 14}px`', 'preview.style.left = `316px`', 1, 'preview-pos')
    // B3 显示效果: 缩小 + Claude 橙(色值次数随版本浮动,全量替换)
    c = rep(c, 'width: 11px; height: 11px; border-radius: 50%;', 'width: 8px; height: 8px; border-radius: 50%;', 1, 'dot-size')
    c = rep(c, 'width: 11px; height: 11px; border-radius: 3px;', 'width: 9px; height: 9px; border-radius: 3px;', 1, 'bottom-size')
    c = rep(c, 'gap: 9px; padding: 14px 0; }', 'gap: 10px; padding: 12px 0; }', 1, 'rail-gap')
    c = rep(c, 'box-shadow: 0 0 0 3px rgba(255,255,255,0.55);', 'box-shadow: 0 0 0 2px rgba(255,255,255,0.55);', 2, 'halo-light')
    c = rep(c, 'box-shadow: 0 0 0 3px rgba(0,0,0,0.4);', 'box-shadow: 0 0 0 2px rgba(0,0,0,0.4);', 2, 'halo-dark')
    c = repAll(c, '99,102,241', '217,119,87', 'accent-color')
    c = repAll(c, '129,140,248', '236,160,138', 'accent-dark')
    c = repAll(c, '165,180,252', '240,178,156', 'accent-dark-border')
    return c
  }

  return [{ ...rewrite(p, '.bak-left', apply, failures), version: ver }]
}

// ---- [C] 设置页信息架构:第三方 section 重排 + 社区插件并入插件市场 ----
// 重排后的设置导航(order 升序): 通用0 模型10 人设11 技能12 记忆系统13 皮肤14
// 插件15 插件市场16(含社区tab) Web UI插件17 宠物18 Agent预设20 侧边卡片21 更新22
// (人设/技能/皮肤/更新为 dshvt 自管 section,order 在 dsh-plugin/lib/client.js 内维护)

// [dsh-desktop] 社区索引数据:镜像 @linxin666/dsh-client-ui-community-plugins 内置清单
// (静态登记条目,上游更新后同步刷新本表即可)
const DSHM_COMMUNITY_ROWS = [
  ['dsh-data-agent', 'Data Agent', 'Data Agent', 'omdsh-dev', 'https://github.com/omdsh-dev/dsh-data-agent', '为 DSH 定义专用 Data Agent 预设,让 AI 帮你查询、更新、分析数据。', 'Defines a dedicated Data Agent preset for DSH so the AI can query, update and analyze data.', null],
  ['dsh-tui', 'dsh-TUI', 'dsh-TUI', 'ccch1mneyyy', 'https://github.com/ccch1mneyyy/dsh-TUI', 'Claude Code 风格全屏交互终端插件:像素鲸鱼顶栏、实时工作状态行、思考流式展开、双击 Esc 回滚、上下文进度条与 TPS 仪表。', 'A Claude Code style fullscreen interactive terminal plugin: pixel-whale header, live working-state line, streaming reasoning expansion, double-Esc rollback, context progress bar and TPS gauges.', null],
  ['dsh-tianshu-tui', '天书 TUI', 'Tianshu TUI', 'huiliyi37', 'https://github.com/huiliyi37/dsh-tianshu-tui', '基于官方 DeepSeek Harness 的交互式终端 UI 插件,在官方基础上增加 TDD 与证据门等工作流。', 'An interactive terminal UI plugin for DeepSeek Harness that adds TDD and evidence-gate workflows on top of the official base.', null],
  ['dsh-chat-summary', 'Chat Summary', 'Chat Summary', 'v833', 'https://github.com/v833/dsh-chat-summary', '总结当前对话并导出为 Markdown / DOCX / PDF,可选 LLM 智能总结(用户自配 API Key)。', 'Summarize the current conversation and export it as Markdown / DOCX / PDF, with optional LLM summarization using your own API key.', '@linxin666/dsh-client-ui-chat-summary'],
  ['dsh-builtin-toggles', '内置能力检查器', 'Built-in Capability Inspector', 'Starfie1d1272', 'https://github.com/Starfie1d1272/dsh-builtin-toggles', 'Evidence-backed 内置 capability Inspector:展示 DSH Web built-in capability 的 provenance、compatibility 与 structural drift;仅对 9 个经过审阅的 UI leaves 提供 fail-closed 开关。', 'Evidence-backed built-in capability Inspector: surfaces provenance, compatibility and structural drift of DSH Web built-ins, with fail-closed toggles for only the nine reviewed UI leaves.', 'dsh-builtin-toggles'],
  ['dsh-pilot', 'Pilot 浏览器驾驶舱', 'Pilot Browser Cockpit', 'guo6x', 'https://github.com/guo6x/dsh-pilot', '给 agent 一双会开车的手:零依赖 CDP 浏览器操控(8 个 pilot_* 工具:导航/点击/输入/按键/JS/截图)+ Web GUI 可拖拽驾驶舱面板,无需 Playwright、无需 API key。', 'Give your agent hands: zero-dependency CDP browser control (8 pilot_* tools: navigate/click/type/keys/eval/screenshot) plus a draggable cockpit panel in the Web GUI - no Playwright, no API key.', null],
  ['dsh-housekeeper', '环境管家', 'Environment Housekeeper', 'guo6x', 'https://github.com/guo6x/dsh-housekeeper', '管住 agent 的脏手:工具链台账(node/pnpm/git/gh/ffmpeg 等自动探测)、缓存与临时目录扫描 + 白名单安全一键清理、机器规则 AGENTS.md 查看编辑,全在设置面板完成。', 'Keep your agent hands clean: toolchain inventory, scratch/cache scan with whitelist-guarded one-click cleanup, and the machine rules file (AGENTS.md) view/edit - all in the settings panel.', null],
  ['dsh-deepread', 'DeepRead 精读助手', 'DeepRead Assistant', 'xiehuan123', 'https://github.com/xiehuan123/dsh-deepread', '五种模式精读插件(quick / deep / map / feynman / book),支持公众号链接与文件输入、批量对比、预算预检与后台任务进度透明,导出 md / mm / html,Web UI 提供工具结果卡片与精读面板。', 'A five-mode deep reading plugin (quick / deep / map / feynman / book) for links and files, with batch comparison, budget preflight, transparent background-job progress, md / mm / html exports, and Web UI tool-result cards plus a reading panel.', 'dsh-deepread'],
  ['dsh-mnemon', 'Mnemon 记忆系统', 'Mnemon Memory', 'omdsh-dev', 'https://github.com/omdsh-dev/dsh-mnemon', '与 Mnemon CLI 集成的跨 Agent、本地优先持久记忆插件:用户画像 / 工作记忆 / 项目档案与长期 Memory Spaces,支持导入导出。', 'A cross-agent, local-first persistent memory plugin integrating the Mnemon CLI: profiles, working memory, project documents and long-term Memory Spaces, with import and export.', 'dsh-mnemon'],
  ['dsh-plugin-hub', '插件中心(dsh-plugin-hub)', 'Plugin Hub', 'Noob-stupid', 'https://github.com/Noob-stupid/dsh-plugin-hub', '插件管理面板:已安装插件一键启用/停用,内置 GitHub dsh-plugin 插件市场(官方/聚合识别、子包浏览、一键安装与本地 AI 兜底修复、删除卸载)。', 'Plugin management panel: one-click enable/disable, a GitHub dsh-plugin marketplace with official/aggregate detection, subpackage browsing, one-click installs with local-AI fallback repair, and uninstall.', null],
  ['dsh-genui', 'GenUI 生成式 UI', 'GenUI', 'omdsh-dev', 'https://github.com/omdsh-dev/dsh-genui', '给模型输出配交互式 UI:助手回复内联渲染 dsh-ui fence(布局、图表、表单、Mermaid、3D),支持流式渲染与面板停靠,组件交互可回传模型。', 'Interactive UI inside assistant replies via the dsh-ui fence: layouts, charts, forms, Mermaid and 3D with streaming rendering, panel docking and actions that loop back to the model.', null],
  ['dsh-annotation', '选中批注', 'Selection Annotation', 'omdsh-dev', 'https://github.com/omdsh-dev/dsh-annotation', '选中助手文字即可批注,回车随消息发送;自己的气泡只显示问题与「批注 ×N」标签,模型按 Annotation N 逐条对照回复(悬浮芯片)。', 'Select text in an assistant reply to annotate it; annotations are sent with your next message, hidden from your own bubble behind an Annotations xN chip, and the model replies per Annotation N with hoverable chips.', null],
  ['deepseek-harness-auth', 'DeepSeek Harness Auth', 'DeepSeek Harness Auth', 'taichuy', 'https://github.com/taichuy/deepseek-harness-auth', '为 DSH Web 公网部署提供登录认证前置代理,支持账号密码、验证码、失败锁定和 IP/CIDR 白名单。', 'An authentication proxy for public DSH Web deployments with password login, captcha, failed-attempt locking, and IP/CIDR allowlists.', 'deepseek-harness-auth'],
  ['dsh-cloud-sync', '云同步服务', 'Cloud Sync', 'dickpy', 'https://github.com/dickpy/dsh-cloud-sync', '支持 WebDAV、S3、阿里云 OSS、腾讯云 COS 与 MinIO 的 DSH 云同步插件,可同步 profile、插件配置及本地插件源码归档。', 'DSH cloud sync for WebDAV, S3, Alibaba Cloud OSS, Tencent Cloud COS and MinIO, syncing profiles, plugin settings and local plugin source archives.', '@dickpy/dsh-cloud-sync'],
]

// 生成注入 dshmarket client.js 的社区 tab 代码块(2 -tab 基缩进,与 bundle 风格一致)
function buildCommunityBlock() {
  const lines = []
  lines.push('\t\t//#region [dsh-desktop] 社区插件索引(自 community-plugins 并入,源数据见其内置清单)')
  lines.push('\t\tconst DSHM_COMMUNITY_CSS = [')
  const cssRules = [
    '.dshm-cm_root{display:flex;flex-direction:column;gap:10px}',
    '.dshm-cm_notice{font-size:12px;color:var(--dsw-alias-label-tertiary);line-height:1.6}',
    '.dshm-cm_list{display:flex;flex-direction:column;gap:8px}',
    '.dshm-cm_row{border:1px solid var(--dsw-alias-border-l2);border-radius:10px;padding:10px 14px;display:flex;flex-direction:column;gap:4px;background:var(--dsw-alias-bg-layer-1)}',
    '.dshm-cm_head{display:flex;justify-content:space-between;align-items:baseline;gap:8px}',
    '.dshm-cm_name{font-size:13px;font-weight:600;color:var(--dsw-alias-label-primary)}',
    '.dshm-cm_author{font-size:11px;color:var(--dsw-alias-label-tertiary);flex:none}',
    '.dshm-cm_desc{font-size:12px;color:var(--dsw-alias-label-secondary);line-height:1.6}',
    '.dshm-cm_foot{display:flex;align-items:center;gap:8px;margin-top:2px;flex-wrap:wrap}',
    '.dshm-cm_link{font-size:12px;color:var(--dsw-alias-link-primary,var(--dsw-alias-button-info-fill));text-decoration:none;flex:none}',
    '.dshm-cm_link:hover{text-decoration:underline}',
    '.dshm-cm_cmd{flex:1;min-width:0;font-size:11px;color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l2);border-radius:6px;padding:2px 8px;overflow-wrap:anywhere;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}',
    '.dshm-cm_copy{font-size:12px;color:var(--dsw-alias-label-secondary);border:1px solid var(--dsw-alias-border-l2);background:transparent;border-radius:6px;padding:2px 10px;cursor:pointer;flex:none}',
    '.dshm-cm_copy:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}',
  ]
  for (const r of cssRules) lines.push('\t\t\t"' + r + '",')
  lines.push('\t\t].join("");')
  lines.push('\t\tconst DSHM_COMMUNITY_PLUGINS = [')
  for (const [id, name, nameEn, author, repo, desc, descEn, npm] of DSHM_COMMUNITY_ROWS) {
    lines.push('\t\t\t{ id: ' + JSON.stringify(id) + ', name: ' + JSON.stringify(name) + ', nameEn: ' + JSON.stringify(nameEn)
      + ', author: ' + JSON.stringify(author) + ', repo: ' + JSON.stringify(repo)
      + ', description: ' + JSON.stringify(desc) + ', descriptionEn: ' + JSON.stringify(descEn)
      + (npm ? ', npm: ' + JSON.stringify(npm) : '') + ' },')
  }
  lines.push('\t\t];')
  lines.push('\t\tfunction dshmCommunityInstall(entry) {')
  lines.push('\t\t\treturn "dsh plugin --profile web add " + (entry.npm != null ? entry.npm : entry.repo);')
  lines.push('\t\t}')
  lines.push('\t\tfunction DshmCommunityPanel(props) {')
  lines.push('\t\t\tconst t = props.t;')
  lines.push('\t\t\tconst lang = props.lang === "zh" ? "zh" : "en";')
  lines.push('\t\t\tconst [copiedId, setCopiedId] = (0, react.useState)(null);')
  lines.push('\t\t\tconst copyCommand = (id, command) => {')
  lines.push('\t\t\t\tconst mark = () => {')
  lines.push('\t\t\t\t\tsetCopiedId(id);')
  lines.push('\t\t\t\t\twindow.setTimeout(() => setCopiedId((cur) => (cur === id ? null : cur)), 1600);')
  lines.push('\t\t\t\t};')
  lines.push('\t\t\t\tif (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(command).then(mark, mark);')
  lines.push('\t\t\t\telse mark();')
  lines.push('\t\t\t};')
  lines.push('\t\t\treturn /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { className: "dshm-cm_root", children: [')
  lines.push('\t\t\t\t/* @__PURE__ */ (0, react_jsx_runtime.jsx)("style", { children: DSHM_COMMUNITY_CSS }),')
  lines.push('\t\t\t\t/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { className: "dshm-cm_notice", children: t("communityNotice") }),')
  lines.push('\t\t\t\t/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { className: "dshm-cm_list", children: DSHM_COMMUNITY_PLUGINS.map((entry) => {')
  lines.push('\t\t\t\t\tconst command = dshmCommunityInstall(entry);')
  lines.push('\t\t\t\t\treturn /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { className: "dshm-cm_row", children: [')
  lines.push('\t\t\t\t\t\t/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { className: "dshm-cm_head", children: [')
  lines.push('\t\t\t\t\t\t\t/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: "dshm-cm_name", children: lang === "zh" ? entry.name : entry.nameEn }),')
  lines.push('\t\t\t\t\t\t\t/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { className: "dshm-cm_author", children: [t("communityAuthor"), " ", entry.author] })')
  lines.push('\t\t\t\t\t\t] }),')
  lines.push('\t\t\t\t\t\t/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { className: "dshm-cm_desc", children: lang === "zh" || entry.descriptionEn == null ? entry.description : entry.descriptionEn }),')
  lines.push('\t\t\t\t\t\t/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { className: "dshm-cm_foot", children: [')
  lines.push('\t\t\t\t\t\t\t/* @__PURE__ */ (0, react_jsx_runtime.jsx)("a", { className: "dshm-cm_link", href: entry.repo, target: "_blank", rel: "noreferrer", children: t("communityRepo") }),')
  lines.push('\t\t\t\t\t\t\t/* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", { className: "dshm-cm_cmd", children: command }),')
  lines.push('\t\t\t\t\t\t\t/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", { type: "button", className: "dshm-cm_copy", onClick: () => copyCommand(entry.id, command), children: copiedId === entry.id ? t("communityCopied") : t("communityCopy") })')
  lines.push('\t\t\t\t\t\t] })')
  lines.push('\t\t\t\t\t] }, entry.id);')
  lines.push('\t\t\t\t}) })')
  lines.push('\t\t\t] });')
  lines.push('\t\t}')
  lines.push('\t\t//#endregion')
  return lines.join('\n') + '\n'
}

function patchSettingsInfoArch() {
  const results = []
  // C1/C3/C4: 单文件 order 改写(记忆系统 20→13 / Web UI 插件 110→17 / 宠物 130→18)
  const orderSpecs = [
    { dir: 'dsh-mnemon', re: /id: "mnemon",(\s*\n\s*)order: 20,/, to: 'id: "mnemon",$1order: 13,', label: 'mnemon-order' },
    { dir: '@linxin666/dsh-client-ui-web-ui-settings', re: /id: "web-ui-plugins",(\s*\n\s*)order: 110,/, to: 'id: "web-ui-plugins",$1order: 17,', label: 'webui-order' },
    { dir: '@linxin666/dsh-pet', re: /id: "pet",(\s*\n\s*)order: 130,/, to: 'id: "pet",$1order: 18,', label: 'pet-order' },
  ]
  for (const s of orderSpecs) {
    const p = path.join(PLUGINS, s.dir, 'lib', 'client.js')
    if (!fs.existsSync(p)) { results.push({ file: s.dir, missing: true }); continue }
    const { rex, failures } = makeCtx(s.label)
    const ver = JSON.parse(fs.readFileSync(path.join(PLUGINS, s.dir, 'package.json'), 'utf8')).version
    results.push({ ...rewrite(p, '.bak-order', (c) => rex(c, s.re, s.to, 1, s.label), failures), version: ver })
  }

  // C5: community-plugins 独立 section 摘除(内容并入插件市场「社区」tab;if(false) 门控可逆)
  const cp = path.join(PLUGINS, '@linxin666', 'dsh-client-ui-community-plugins', 'lib', 'client.js')
  if (!fs.existsSync(cp)) results.push({ file: 'community-plugins', missing: true })
  else {
    const { rep, failures } = makeCtx('community-gate')
    const ver = JSON.parse(fs.readFileSync(path.join(PLUGINS, '@linxin666', 'dsh-client-ui-community-plugins', 'package.json'), 'utf8')).version
    results.push({
      ...rewrite(cp, '.bak-dshm',
        (c) => rep(c, '\t\tctx.slots.inject("settings.section", () => {',
          '\t\tif (false) ctx.slots.inject("settings.section", () => { // [dsh-desktop] standalone section merged into market community tab', 1, 'gate'), failures),
      version: ver,
    })
  }

  // C2: dshmarket 插件市场 order 40→16 + 注入「社区」tab(按钮/渲染分支/字典/面板组件)
  const mp = path.join(PLUGINS, 'dshmarket', 'client', 'client.js')
  if (!fs.existsSync(mp)) results.push({ file: 'dshmarket', missing: true })
  else {
    const { rep, rex, failures } = makeCtx('dshmarket')
    const ver = JSON.parse(fs.readFileSync(path.join(PLUGINS, 'dshmarket', 'package.json'), 'utf8')).version
    const apply = (c) => {
      c = rex(c, /id: "market",(\s*\n\s*)order: 40,/, 'id: "market",$1order: 16,', 1, 'market-order')
      // 字典(zh/en 各 6 键)
      c = rep(c, '\t\t\ttabDiscover: "发现",',
        '\t\t\ttabCommunity: "社区",\n\t\t\tcommunityNotice: "社区贡献者登记的插件索引,复制安装命令到终端执行即可安装;条目由作者自行维护,使用前请自行评估。",\n\t\t\tcommunityAuthor: "作者",\n\t\t\tcommunityCopy: "复制",\n\t\t\tcommunityCopied: "已复制",\n\t\t\tcommunityRepo: "仓库",\n\t\t\ttabDiscover: "发现",', 1, 'zh-community-keys')
      c = rep(c, '\t\t\ttabDiscover: "Discover",',
        '\t\t\ttabCommunity: "Community",\n\t\t\tcommunityNotice: "An index of plugins registered by community contributors. Copy an install command into your terminal to install; entries are maintained by their authors - evaluate before use.",\n\t\t\tcommunityAuthor: "Author",\n\t\t\tcommunityCopy: "Copy",\n\t\t\tcommunityCopied: "Copied",\n\t\t\tcommunityRepo: "Repo",\n\t\t\ttabDiscover: "Discover",', 1, 'en-community-keys')
      // tab 按钮:插在「发现」按钮之后(函数式替换,缩进跟随捕获组)
      c = rex(c, /(\n(\t+)children: t\("tabDiscover"\)\n(\t+)\}\),\n)/, (m, g1, g2, g3) => {
        const btn = [
          g3 + '/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {',
          g3 + '\tclassName: tab === "community" ? `${Market_module_css_default.tab} ${Market_module_css_default.on}` : Market_module_css_default.tab,',
          g3 + '\tonClick: () => setTab("community"),',
          g3 + '\tchildren: t("tabCommunity")',
          g3 + '}),',
        ].join('\n') + '\n'
        return g1 + btn
      }, 1, 'tab-button')
      // 渲染分支:社区面板插在 themes 分支之前
      c = rep(c, '] }) : tab === "themes" && themeSnap !== null ?',
        '] }) : tab === "community" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(DshmCommunityPanel, { t, lang }) : tab === "themes" && themeSnap !== null ?', 1, 'tab-branch')
      // 面板组件 + 数据:插在 MarketSection 定义之前
      c = rep(c, '\t\tfunction MarketSection(props) {', buildCommunityBlock() + '\t\tfunction MarketSection(props) {', 1, 'panel-insert')
      return c
    }
    results.push({ ...rewrite(mp, '.bak-dshm', apply, failures), version: ver })
  }
  return results
}

// ---- 核心: 自愈式重写(备份基底 → 重打 → 计数不符则还原) ----
function rewrite(p, bakSuffix, apply, failures) {
  const file = path.basename(p)
  const bak = p + bakSuffix
  const base = fs.existsSync(bak) ? fs.readFileSync(bak, 'utf8') : fs.readFileSync(p, 'utf8')
  if (!fs.existsSync(bak)) fs.writeFileSync(bak, base, 'utf8')

  let patched
  try {
    patched = apply(base)
  } catch (e) {
    failures.push(`${file}: ${e.message}`)
    patched = base
  }
  if (failures.length) {
    fs.writeFileSync(p, base, 'utf8') // 还原,杜绝半补丁
    return { file, ok: false, failures: [...failures] }
  }
  const current = fs.readFileSync(p, 'utf8')
  const already = current === patched
  if (!already) fs.writeFileSync(p, patched, 'utf8')
  return { file, ok: true, already }
}

// ---- 入口 ----
function replayAll(log = () => {}) {
  const out = { ok: true, items: [] }
  for (const r of [...patchBetterSidebar(), ...patchNodeNav(), ...patchSettingsInfoArch()]) {
    if (r.missing) { log(`[patches] ${r.file}: 未安装,跳过`); continue }
    out.items.push(r)
    if (r.ok) log(`[patches] ${r.file}@${r.version}: ${r.already ? '已是补丁态' : '已恢复本地定制'}`)
    else { out.ok = false; for (const f of r.failures) log(`[patches] FAIL ${f}`) }
  }
  return out
}

module.exports = { replayAll }
if (require.main === module) {
  const r = replayAll((l) => console.log(l))
  console.log(r.ok ? 'ALL PATCHES OK' : 'PATCH FAILURES — see above')
  process.exit(r.ok ? 0 : 1)
}
