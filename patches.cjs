// dsh-desktop 本地补丁重放器 v3(统一版;main.js 每次启动时自动调用,亦可单独运行: node patches.cjs)
// 目标: 插件经 pnpm 更新覆盖 node_modules 后,壳启动即自动恢复全部本地定制,彻底告别手动重打。
//
//   [A] dsh-better-sidebar (验证 0.12.1 → 0.12.3 → 0.14.0)
//       A1 底部面板剔除: migrateBottomTabs 无条件合并 + toggle×2/bottomPanel/cornerHandle 编译剔除 + height=0
//       A2 Claude-GUI 浮动卡片: panel 锚定聊天页右上侧区域(标题栏安全区 +8 / right12 / bottom12)
//          + radius12 + 全 border + 双层阴影 + overflow hidden + toggleCluster 同安全带下沿
//          + panelHidden +16px + panelResize left0 + boundaryError 同风格 + tabBar padding 归一 48
//          (0.14.0 起 panel 从 position:fixed 改为 fixed 锚定容器内 position:absolute,
//           签名放宽为 position:(fixed|absolute);主规则与 title-bar-strip 后置规则 rexAll 全量重写)
//       A3 Claude 动效: :root --dsh-bsr-slide-duration 300ms / --dsh-bsr-slide-ease; #root/#centerCol 共用曲线
//          (0.14.0 布局模板 transition 改多行展开式并新增 width:calc,锚点放宽为跨行通配)
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
//       C7 skin-center 皮肤中心 order 120→14.5(浮点,紧跟 dshvt「皮肤」14,与「皮肤」页指引卡呼应)
//
//   [D] dsh-client-ui-conversation 思维链(2026-08-17,验证 0.1.0-rc.5)
//       D1 thinkBody 纯文本 → MarkdownText(列表/缩进/代码块层级还原)
//       D2 CSS 精化:400px 限高 + Claude 橙左边条 + markdown 块紧凑化
//       (包为 junction 指向本地源码仓,serve lib 构建产物;上游 rebuild 冲掉后自动重放恢复)
//
//   [I] git-graph 分支 chip 移除(R29,2026-08-18,验证 0.1.20)
//       I1 BranchChip 组件短路(return null):聊天框上方 git 分支 chip(含「分离 HEAD」)
//          整体不入 DOM。侧边栏 better-sidebar Git 面板不受影响(另一插件)。
//          (dshvt 覆盖层另有 [data-gitgraph-chip-anchor]{display:none} 兜底,防锚点失配复现)
//
//   [E] profile 守护(2026-08-20): dsh-web-ui-all 0.2.3 内嵌 dsh-better-sidebar 0.13.0
//       (loader 行 web-ui-better-sidebar),与独立 dsh-better-sidebar 争注 /sidebar/api
//       前缀路由致 dsh 启动崩溃、壳陷无限重启。守护 cordis.patch.yml 中的禁用行,
//       插件/市场流程改动 profile 补丁后壳启动即恢复。纯 ASCII 追加,不触碰原有字节
//       (文件含 GBK 注释,按 utf8 回写会损坏)。
//
// 自愈策略: 每个文件首次补丁前留 .bak-*;之后每次重放以 .bak 为基底从头重打,
// 计数不符 → 写回原始内容并告警(绝不留半补丁状态),完全幂等。
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')

const PLUGINS = path.join(os.homedir(), '.dsh', 'profiles', 'web', 'node_modules')
const MOTION = 'var(--dsh-bsr-slide-duration) var(--dsh-bsr-slide-ease)'

// [q99 永久修复 2026-08-23] 补丁哨兵标记:apply 产物末尾追加唯一注释(JS 文件末尾追加
// 注释语法安全,不入 CSS 模板字面量)。重放时 current 含哨兵即判「已是补丁态」直接跳过,
// 根除「对补丁态文件重复 apply → 锚点已被改写 → 误报 FAIL」一整类错配——包括多副本
// 重放器并存时(新 asar / 旧 asar / 手动 node patches.cjs)新旧锚点互不认识的问题。
const PATCH_MARK = '/*dsh-local-patch:v2026-08-23*/'
// YAML 场景(preset agent.cordis.yml)的哨兵必须用 # 行注释(YAML 无块注释)
const YAML_MARK = '#dsh-local-patch:v2026-08-23'

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
    const { rep, repAll, rex, rexOpt, rexAll, failures } = makeCtx(`bsr/${f}`)

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
      // 0.14.0: panel 主规则 position:fixed → position:absolute(外套 fixed 锚定容器),签名二选一
      const pm = c.match(/\.([A-Za-z0-9_-]+)_panel\{[^}]*position:(?:fixed|absolute)/)
      if (pm) {
        const P = pm[1]
        // A5 noside 注入(旧补丁链 .bak-noside 步骤,随 0.12.3 重放器重建时遗漏,2026-08-17 补回):
        // 隐藏 aionui 原生 explorer/preview 列,better-sidebar 浮动卡片为唯一右侧表面。
        // 插入点 = CSS_TEXT 模板字面量内首条 _panel 规则之前(每次从 .bak 基底重打,天然幂等);
        // 仅注入完整产物(terminal/editor bundle 无该场景)。
        if (isFull && !c.includes('aionui-explorer-col')) {
          const idx = c.indexOf(`.${P}_panel{`)
          if (idx < 0) { failures.push(`[bsr/${f}] noside anchor missing`) }
          else {
            const NOSIDE = '.aionui-explorer-col,.aionui-preview-col,button.aionui-floating-expand,.aionui-collapse-chevron{display:none!important}'
            c = c.slice(0, idx) + NOSIDE + c.slice(idx)
          }
        }
        // 几何令牌:聊天页右上侧区域 = 标题栏安全区(壳发布 --dsh-titlebar-safe,44px)下沿 +8px,
        // 右侧/底部各留 12px 呼吸距;旧壳无令牌时硬底线 44px 兜底(与问题82 同源单一事实)。
        const TOP = 'calc(var(--dsh-titlebar-safe, 44px) + 8px)'
        const CTOP = 'calc(var(--dsh-titlebar-safe, 44px) + 10px)'
        const rules = [
          // 主规则以 position:fixed|absolute 为内容签名;rexAll 连同 title-bar-strip 后置规则一并重写,
          // 杜绝后置 padding-top/top 覆盖把卡片顶回窗口上沿(0.12.3/0.14.0 均存在该后置规则)
          ['panel', new RegExp(`\\.${P}_panel\\{[^}]*position:(?:fixed|absolute)[^}]*\\}`), `.${P}_panel{z-index:50;pointer-events:auto;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l2);border-radius:12px;box-shadow:0 18px 44px rgba(0,0,0,.14),0 4px 12px rgba(0,0,0,.08);box-sizing:border-box;overflow:hidden;padding-top:0;transition:transform ${MOTION}, width ${MOTION};flex-direction:column;display:flex;position:fixed;top:${TOP};bottom:12px;right:var(--dsh-bsr-panel-right, 12px)}`],
          ['panelHidden', new RegExp(`\\.${P}_panelHidden\\{[^}]*\\}`), `.${P}_panelHidden{pointer-events:none;visibility:hidden;transition:transform ${MOTION}, width ${MOTION}, visibility 0s linear var(--dsh-bsr-slide-duration);transform:translateX(calc(102% + 28px))}`],
          ['panelResize', new RegExp(`\\.${P}_panelResize\\{[^}]*\\}`), `.${P}_panelResize{cursor:col-resize;z-index:2;touch-action:none;width:8px;position:absolute;top:0;bottom:0;left:0}`],
          // 0.14.0 toggleCluster 为 position:absolute(锚定容器内),rexAll 连同 strip 后置规则全量重写;
          // [问题93] 入口/面板右距改令牌驱动(聊天页内对齐由 dshvt 发布 --dsh-bsr-cluster-right/--dsh-bsr-panel-right)
          ['toggleCluster', new RegExp(`\\.${P}_toggleCluster\\{[^}]*position:(?:fixed|absolute)[^}]*\\}`), `.${P}_toggleCluster{z-index:55;pointer-events:auto;flex-direction:row;gap:4px;display:flex;position:fixed;top:${CTOP};right:var(--dsh-bsr-cluster-right, 22px)}`],
          ['bottomPanel', new RegExp(`\\.${P}_bottomPanel\\{[^}]*border-top[^}]*\\}`), `.${P}_bottomPanel{z-index:50;background:var(--dsw-alias-bg-layer-1);border-top:1px solid var(--dsw-alias-border-l2);transition:transform ${MOTION}, height ${MOTION};flex-direction:column;display:flex;position:fixed;bottom:0}`],
          ['bottomPanelHidden', new RegExp(`\\.${P}_bottomPanelHidden\\{[^}]*\\}`), `.${P}_bottomPanelHidden{pointer-events:none;visibility:hidden;transition:transform ${MOTION}, height ${MOTION}, visibility 0s linear var(--dsh-bsr-slide-duration);transform:translateY(102%)}`],
          ['toggleClusterPost', new RegExp(`\\.${P}_toggleCluster\\{[^}]*top:[^}]*\\}`), `.${P}_toggleCluster{z-index:55;pointer-events:auto;flex-direction:row;gap:4px;display:flex;position:fixed;top:${CTOP};right:var(--dsh-bsr-cluster-right, 22px)}`],
          ['panelPost', new RegExp(`\\.${P}_panel\\{[^}]*padding-top:[^}]*\\}`), `.${P}_panel{z-index:50;pointer-events:auto;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l2);border-radius:12px;box-shadow:0 18px 44px rgba(0,0,0,.14),0 4px 12px rgba(0,0,0,.08);box-sizing:border-box;overflow:hidden;padding-top:0;transition:transform ${MOTION}, width ${MOTION};flex-direction:column;display:flex;position:fixed;top:${TOP};bottom:12px;right:var(--dsh-bsr-panel-right, 12px)}`],
          ['boundaryError', new RegExp(`\\.${P}_boundaryError\\{[^}]*\\}`), `.${P}_boundaryError{z-index:50;pointer-events:auto;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l2);border-radius:12px;box-shadow:0 18px 44px rgba(0,0,0,.14),0 4px 12px rgba(0,0,0,.08);box-sizing:border-box;font:var(--dsw-font-xxs-12);color:var(--dsw-alias-state-error-primary);flex-direction:column;align-items:flex-start;gap:8px;padding:16px;display:flex;position:fixed;top:${TOP};bottom:12px;right:var(--dsh-bsr-panel-right, 12px);overflow:auto}`],
        ]
        for (const [name, re, body] of rules) {
          // [问题93] 后置覆盖规则捕获:上游在主规则之后还留有无 position 签名的短覆盖规则
          // (toggleCluster{top:calc(--dsh-title-bar-strip,40px)+3px)} / panel{padding-top:…}),
          // 同特异性后声明者胜,把入口/面板顶回窗口上沿(位置漂移根因);旧签名要求 position: 属性必含,
          // 恰好漏掉这两条。*Post 规则以 top:/padding-top: 为后置签名再扫一轮全量重写
          // (主规则重写体含 top: 会被幂等重写为同一文本,无害);未来上游同类后置覆盖带 top 即被捕获。
          if (name === 'panel' || name === 'toggleCluster' || name === 'panelPost' || name === 'toggleClusterPost') {
            c = rexAll(c, re, body, `css-${name}`)
          } else {
            c = rex(c, re, body, 1, `css-${name}`)
          }
        }
        // tabBar:0.14.0 为裸 .tabBar{padding-right:72/40px}(无 :not 前缀,旧形选择器失配),
        // 按“子串重写”归一 48px——带前缀的规则(bottomPanel/媒体查询内)前缀保留;
        // 严禁追加到文件末尾(CSS 在 JS 模板字面量内,出模板即 bundle 语法损坏,b19 回归实证)
        c = rexAll(c, new RegExp(`\\.${P}_tabBar\\{padding-right:\\d+px\\}`), `.${P}_tabBar{padding-right:48px}`, 'css-tabBar')
      } else if (isFull) {
        failures.push(`[bsr/${f}] panel prefix not found`)
      }

      // A3/A4 layout.css(字面 \n 转义;正则容忍 transition 写法漂移)
      // [q109 2026-08-26] #root/#centerCol 布局属性过渡移除: 开合=一次瞬时重排,面板仍
      // transform 滑入(GPU 合成);长会话下 300ms 逐帧全量重排的卡顿与「抬起-落下」根除
      // 0.14.0 模板:#root 新增 width:calc 行,transition 改多行展开式 → 跨行通配锚点
      if (/margin-right: var\(--dsh-sidebar-width, 0px\);/.test(c)) {
        c = rex(c, /#root \{\\n  margin-right: var\(--dsh-sidebar-width, 0px\);[\s\S]*?\}/,
          `#root {\\n  margin-right: calc(var(--dsh-sidebar-width, 0px) + var(--dsh-bsr-gap, 0px) * 2);\\n  width: calc(100% - var(--dsh-sidebar-width, 0px));\\n}`, 1, 'layout-root')
        c = rex(c, /margin-bottom: var\(--dsh-sidebar-height, 0px\);\\n  transition: margin-bottom [^;]*;/, 'margin-bottom: var(--dsh-sidebar-height, 0px);', 1, 'layout-centerCol')
        c = rep(c, 'padding-right: 78px;', 'padding-right: 54px;', 1, 'layout-collapsedHeader')
        const VARS = `:root {\\n  --dsh-bsr-slide-duration: 300ms;\\n  --dsh-bsr-slide-ease: cubic-bezier(0.32, 0.72, 0, 1);\\n  --dsh-bsr-gap: 8px;\\n}\\n\\nbody[data-dsh-sidebar-collapsed] {\\n  --dsh-bsr-gap: 0px;\\n}\\n\\n`
        c = rex(c, /(#root \{\\n  margin-right: calc\(var\(--dsh-sidebar-width, 0px\) \+ var\(--dsh-bsr-gap, 0px\) \* 2\);)/, VARS + '$1', 1, 'layout-vars')
      } else if (isFull) {
        failures.push(`[bsr/${f}] layout.css anchor missing`)
      }

      // A6 布局推送变量/属性收窄 #root(2026-08-29,侧边卡片大文件开合卡顿根治):
      // writeGeometry 把 --dsh-sidebar-width/height 写在 documentElement、collapsed/dragging
      // 属性挂在 body——自定义属性与属性变更的样式失效域都是全文档,卡片内大文件(数万节点
      // 编辑器 DOM)在每次开合时被迫整树重算(Tracing 实测单次开合 UpdateLayoutTree 500ms、
      // 长任务 700ms)。layout.css 全部消费者都在 #root 子树内,而面板宿主 [data-dsh-panel-host]
      // 挂在 body(#root 之外)——写入收窄到 #root 后失效域不再含卡片内容(实测 500ms→30-100ms)。
      // dshvt installPushClamp 读侧同步迁移(computed 继承使读 #root 对新旧写法双兼容)。
      if (isFull) {
        c = rep(c,
          'const writeGeometry = (width, height) => {\n\t\t\t\tdocument.documentElement.style.setProperty("--dsh-sidebar-width", `${width}px`);\n\t\t\t\tdocument.documentElement.style.setProperty("--dsh-sidebar-height", `${height}px`);\n\t\t\t};',
          'const writeGeometry = (width, height) => {\n\t\t\t\t/*dsh-bsr-root-scope*/ const geoEl = document.getElementById("root") || document.documentElement;\n\t\t\t\tgeoEl.style.setProperty("--dsh-sidebar-width", `${width}px`);\n\t\t\t\tgeoEl.style.setProperty("--dsh-sidebar-height", `${height}px`);\n\t\t\t};',
          1, 'geo-root-scope')
        c = repAll(c,
          'document.documentElement.style.removeProperty("--dsh-sidebar-width")',
          '(document.getElementById("root") || document.documentElement).style.removeProperty("--dsh-sidebar-width")',
          'geo-remove-w')
        c = repAll(c,
          'document.documentElement.style.removeProperty("--dsh-sidebar-height")',
          '(document.getElementById("root") || document.documentElement).style.removeProperty("--dsh-sidebar-height")',
          'geo-remove-h')
        c = repAll(c,
          'document.body.setAttribute("data-dsh-sidebar-collapsed", "")',
          '(document.getElementById("root") || document.body).setAttribute("data-dsh-sidebar-collapsed", "")',
          'attr-collapsed-set')
        c = repAll(c,
          'document.body.removeAttribute("data-dsh-sidebar-collapsed")',
          '(document.getElementById("root") || document.body).removeAttribute("data-dsh-sidebar-collapsed")',
          'attr-collapsed-rm')
        c = repAll(c,
          'document.body.setAttribute("data-dsh-sidebar-dragging", "")',
          '(document.getElementById("root") || document.body).setAttribute("data-dsh-sidebar-dragging", "")',
          'attr-dragging-set')
        c = repAll(c,
          'document.body.removeAttribute("data-dsh-sidebar-dragging")',
          '(document.getElementById("root") || document.body).removeAttribute("data-dsh-sidebar-dragging")',
          'attr-dragging-rm')
        // layout.css 选择器跟随属性迁移(body[...] → #root[...];拖拽规则的 #root 自引用去重,
        // 使 `#root[data-dsh-sidebar-dragging] #root …` 回落为单 #root 前缀)
        c = repAll(c, 'body[data-dsh-sidebar-collapsed]', '#root[data-dsh-sidebar-collapsed]', 'css-collapsed-sel')
        c = repAll(c, 'body[data-dsh-sidebar-dragging]', '#root[data-dsh-sidebar-dragging]', 'css-dragging-sel')
        c = repAll(c, '#root[data-dsh-sidebar-dragging] #root', '#root[data-dsh-sidebar-dragging]', 'css-dragging-self')
      }
      return c
    }

    // [A6 升级通道] 旧补丁态(哨兵在、无 dsh-bsr-root-scope 标记)会被 rewrite 的哨兵快速通道
    // 永久跳过;而放宽哨兵会让漂移路径把旧补丁态当「新上游」刷进 bak、毁掉 pristine 基底。
    // 按 [K] v5 同款方案:检测旧补丁态 → 先从 .bak-repatch 恢复 pristine → 落回正常重放;
    // 无 bak 时显式 FAIL 拒绝盲改(FAIL 不写盘铁律)。仅完整产物参与(terminal/editor
    // 无这些锚点,其哨兵态与本步无关)。
    if (isFull) {
      const head = fs.readFileSync(p, 'utf8')
      if (head.includes('dsh-local-patch') && !head.includes('dsh-bsr-root-scope')) {
        const bak = p + '.bak-repatch'
        if (fs.existsSync(bak)) {
          fs.copyFileSync(bak, p)
        } else {
          results.push({ file: 'bsr/' + f, ok: false, failures: ['[A6] 旧补丁态且缺 .bak-repatch,拒绝盲改,请手动恢复 pristine'] })
          continue
        }
      }
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
    // B4 [q105] 插槽注册竞态修复(2026-08-24): dsh 0.1.1-rc.2 起 client boot 并行化
    // (runPluginBoot 用 Promise.all 并发 create 各 entry),本插件(小 bundle)可能先于
    // ui-layout(大 bundle)完成 init——彼时 shell.overlay 尚未被 layout 的 root children
    // 表声明,裸 register 即抛「slot "shell.overlay" is not declared」→ entry 失败 →
    // 整个 app 卡 boot 屏「Failed to load plugins」(冷启动/插件热重载时的竞态)。
    // 改官方 slots.inject 延迟注册(dshmarket 的 toast 同款姿势): 插槽已声明则同步注册,
    // 未声明则订阅声明事件、声明后自动注册;offSlot 返回幂等卸载器,清理语义不变。
    c = rep(c,
      '\t\t\t\tconst offSlot = ctx.slots.register({\n\t\t\t\t\tname: "shell.overlay",\n\t\t\t\t\tid: "dsh-node-nav-rail",\n\t\t\t\t\tinject: () => ({ hooks: { sessionId: sessionIdSource } }),\n\t\t\t\t}, NodeNavRail)',
      '\t\t\t\t// [q105] shell.overlay 声明时机竞态修复: 裸 register → slots.inject 延迟注册\n\t\t\t\tconst offSlot = ctx.slots.inject("shell.overlay", () => ctx.slots.register({\n\t\t\t\t\tname: "shell.overlay",\n\t\t\t\t\tid: "dsh-node-nav-rail",\n\t\t\t\t\tinject: () => ({ hooks: { sessionId: sessionIdSource } }),\n\t\t\t\t\t}, NodeNavRail))',
      1, 'overlay-inject')
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

// ---- [E](已废弃:SettingsRoot 打进 dsh web Vite 主 bundle assets/index-*.js,patch 源码仓无效;
//          改由 dshvt client.js 运行时 MutationObserver 给导航 button 注入 data-section-id,与 entry 自愈同款) ----

// ---- [F] 三视图 entry 收起态平滑化(2026-08-17,问题2) ----
//       任务看板/SSH/记忆的侧栏 entry 行收起时 label display:none 硬切 + padding 瞬变,
//       与原生侧栏项的渐变收起节奏不一致。替换为 max-width/opacity 收缩过渡(可插值),
//       配合 dshvt 覆盖层的 .entry padding 过渡,与侧栏 300ms Claude 曲线同拍。
function patchEntrySmooth() {
  const results = []
  // 注意:dsh-mnemon 不在此列 —— 该文件同时被 [C] C1 order 补丁处理,双备份链会互相覆盖;
  // 其 entry 平滑化合并进 patchSettingsInfoArch 的 mnemon 单文件双补丁(共用 .bak-order 基底)。
  const specs = [
    { dir: '@linxin666/dsh-client-ui-task-board', label: 'taskboard-entry' },
    { dir: '@linxin666/dsh-ssh', label: 'ssh-entry' },
  ]
  for (const s of specs) {
    const p = path.join(PLUGINS, s.dir, 'lib', 'client.js')
    if (!fs.existsSync(p)) { results.push({ file: s.dir, missing: true }); continue }
    const ver = JSON.parse(fs.readFileSync(path.join(PLUGINS, s.dir, 'package.json'), 'utf8')).version
    const { rex, failures } = makeCtx(s.label)

    const apply = (c) => {
      const m = c.match(/\[data-dsh-frame\]\[data-sidebar-collapsed\] \.([A-Za-z0-9_-]+)_entry\{/)
      if (!m) { failures.push(`[${s.label}] entry prefix not found`); return c }
      const P = m[1]
      // 收起态 label 规则替换为「基态可插值 + 收起态收缩」两条
      c = rex(c, new RegExp(`\\[data-dsh-frame\\]\\[data-sidebar-collapsed\\] \\.${P}_entryLabel\\{display:none\\}`),
        `.${P}_entryLabel{max-width:200px;overflow:hidden;white-space:nowrap;transition:max-width var(--dsh-bsr-slide-duration,.3s) cubic-bezier(.32,.72,0,1),opacity .25s cubic-bezier(.32,.72,0,1)}[data-dsh-frame][data-sidebar-collapsed] .${P}_entryLabel{max-width:0;opacity:0;visibility:hidden}`,
        1, 'entry-label-smooth')
      return c
    }

    results.push({ ...rewrite(p, '.bak-entry', apply, failures), version: ver })
  }
  return results
}

// ---- [G] dshmarket 更新恒带 release-age 放行(2026-08-17,问题3) + [H] preview 预检路由(R31) ----
//       pnpm 11 minimumReleaseAge(~24h) 静默吞更(exit 0 版本不变),dshmarket 检出 stale 后
//       才提示「等一天/立即更新」。用户要求默认直接安装 → update 路由恒带
//       RELEASE_AGE_OVERRIDE(--config.minimumReleaseAge=0,单命令作用域)。
//       [H](R31,2026-08-18) host 侧新增 /dsh-market/preview 预检路由:安装前拉目标包
//       manifest(npm latest / github HEAD),比对 engines.node 与宿主 peerDependencies;
//       元数据不可得报 unknown 不阻断。client 侧警告块在 patchSettingsInfoArch 的 C2 链注入。
function patchDshmarket() {
  const p = path.join(PLUGINS, 'dshmarket', 'lib', 'routes.js')
  if (!fs.existsSync(p)) return [{ file: 'dshmarket', missing: true }]
  const ver = JSON.parse(fs.readFileSync(path.join(PLUGINS, 'dshmarket', 'package.json'), 'utf8')).version
  const { rep, failures } = makeCtx('dshmarket')

  // [H] preview register 块(插在 install register 之前;与 routes.js 源码同缩进风格)
  const previewBlock = [
    '        // [dsh-desktop] R31 preview: pre-install compatibility probe (read-only, never installs).',
    '        host.webServer.register({',
    "            kind: 'exact',",
    "            path: '/dsh-market/preview',",
    '            handler: async (request, response) => {',
    "                if (request.method !== 'POST') {",
    "                    response.writeHead(405, { allow: 'POST' });",
    '                    response.end();',
    '                    return;',
    '                }',
    '                if (!sameOrigin(request)) {',
    "                    sendJson(response, 403, { error: 'untrusted origin' });",
    '                    return;',
    '                }',
    '                try {',
    '                    const body = (await readJsonBody(request));',
    "                    const url = typeof body.url === 'string' ? body.url : '';",
    '                    const { registry } = await loadRegistry();',
    '                    const entry = registry.plugins.find(p => p.url.toLowerCase() === url.toLowerCase());',
    '                    if (entry === undefined) {',
    "                        sendJson(response, 400, { error: 'plugin is not in the curated registry' });",
    '                        return;',
    '                    }',
    '                    const report = { ok: true, name: entry.name, mismatch: false, checks: [] };',
    '                    let manifest = null;',
    '                    if (entry.npm) {',
    '                        try {',
    '                            manifest = await fetch(`https://registry.npmjs.org/${encodeURIComponent(entry.npm)}/latest`, { signal: AbortSignal.timeout(6000) }).then(r => r.json());',
    '                        } catch {}',
    '                    } else {',
    '                        const m = /^https?:\\/\\/github\\.com\\/([^/]+\\/[^/]+?)(?:\\/|$)/.exec(entry.url);',
    '                        if (m) {',
    '                            try {',
    '                                manifest = await fetch(`https://raw.githubusercontent.com/${m[1]}/HEAD/package.json`, { signal: AbortSignal.timeout(6000) }).then(r => r.json());',
    '                            } catch {}',
    '                        }',
    '                    }',
    "                    if (manifest === null || typeof manifest !== 'object') {",
    "                        report.checks.push({ kind: 'unknown', text: 'metadata unavailable' });",
    '                    } else {',
    '                        const dshmSatisfies = (version, range) => {',
    '                            const cmp = (a, b) => {',
    "                                const pa = String(a).split('.').map(Number), pb = String(b).split('.').map(Number);",
    '                                for (let i = 0; i < 3; i++) {',
    '                                    const x = pa[i] || 0, y = pb[i] || 0;',
    '                                    if (x !== y) return x < y ? -1 : 1;',
    '                                }',
    '                                return 0;',
    '                            };',
    '                            const part = (v, r) => {',
    '                                const m2 = /^(\\^|~|>=|<=|>|<|=)?\\s*(\\d+\\.\\d+\\.\\d+.*)$/.exec(r.trim());',
    '                                if (!m2) return true;',
    "                                const op = m2[1] || '=', base = m2[2];",
    "                                if (op === '^') return cmp(v, base) >= 0 && String(v).split('.')[0] === String(base).split('.')[0];",
    "                                if (op === '~') return cmp(v, base) >= 0 && String(v).split('.').slice(0, 2).join('.') === String(base).split('.').slice(0, 2).join('.');",
    '                                const c = cmp(v, base);',
    "                                if (op === '>=') return c >= 0;",
    "                                if (op === '<=') return c <= 0;",
    "                                if (op === '>') return c > 0;",
    "                                if (op === '<') return c < 0;",
    '                                return c === 0;',
    '                            };',
    "                            return String(range || '*').trim().split('||').some(alt => alt.trim().split(/\\s+/).every(seg => part(version, seg)));",
    '                        };',
    "                        const hostPeers = ['@deepseek-ai/cordis', '@deepseek-ai/dsh'];",
    '                        const peers = (manifest.peerDependencies || {});',
    '                        for (const name of hostPeers) {',
    '                            const range = peers[name];',
    '                            if (!range) continue;',
    '                            let installed = null;',
    '                            try {',
    "                                installed = JSON.parse(readFileSync(join(activeProfileDir, 'node_modules', name, 'package.json'), 'utf8')).version;",
    '                            } catch {}',
    '                            if (installed === null) report.checks.push({ kind: \'info\', text: `${name} ${range}: provided by dsh runtime (not in profile)` });',
    '                            else if (!dshmSatisfies(installed, range)) {',
    '                                report.mismatch = true;',
    '                                report.checks.push({ kind: \'peer\', text: `${name}: requires ${range}, profile has ${installed}` });',
    '                            }',
    '                        }',
    '                        const nodeRange = (manifest.engines || {}).node;',
    '                        if (nodeRange && !dshmSatisfies(process.versions.node, nodeRange)) {',
    '                            report.mismatch = true;',
    '                            report.checks.push({ kind: \'engine\', text: `engines.node: requires ${nodeRange}, runtime ${process.versions.node}` });',
    '                        }',
    "                        if (report.checks.length === 0) report.checks.push({ kind: 'pass', text: 'no compatibility constraints found' });",
    '                    }',
    '                    sendJson(response, 200, report);',
    '                } catch (error) {',
    '                    const message = error instanceof Error ? error.message : String(error);',
    '                    host.logger?.warn(`[dsh-market] preview failed: ${message}`);',
    '                    sendJson(response, 500, { error: message });',
    '                }',
    '            },',
    '        }),',
  ].join('\n')

  const apply = (c) => {
    c = rep(c, "const addArgs = force ? ['add', RELEASE_AGE_OVERRIDE, target] : ['add', target];",
      "const addArgs = ['add', RELEASE_AGE_OVERRIDE, target]; // [dsh-desktop] 恒带放行:默认立即更新,绕过 pnpm fresh-release 等待",
      1, 'update-force-always')
    // [H] preview register 注入在 install register 之前
    c = rep(c, "        host.webServer.register({\n            kind: 'exact',\n            path: '/dsh-market/install',",
      previewBlock + "\n        host.webServer.register({\n            kind: 'exact',\n            path: '/dsh-market/install',",
      1, 'preview-route')
    return c
  }

  return [{ ...rewrite(p, '.bak-dsh', apply, failures), version: ver }]
}

// ---- [D] dsh-client-ui-conversation 思维链展示优化(2026-08-17,验证 0.1.0-rc.5) ----
//       D1 thinkBody 纯文本 → MarkdownText 渲染(列表/缩进/代码块/粗体层级还原)
//       D2 thinkBody CSS:限高 260→400px、左边条 Claude 橙、去 pre-wrap/mask、
//          markdown 块(p/ul/ol/pre/heading)紧凑化归一 13px/1.7
//       汉化核实:上游 locales.ts 已全 i18n(zh='思维链'),无需补字典;页面 lang=zh-CN 即中文。
function patchConversation() {
  // 注意:该包是 junction → 本地源码仓(packages/client/ui-conversation),serve 的是 lib 构建产物;
  // 上游 rebuild 后产物更新会冲掉补丁,与本重放器其他段一样自动恢复。
  // 2026-08-22 [devlink 形态]: 手工 dev 链接目录名曾出现 `.devlink-disabled` 后缀
  // (不在 pnpm 依赖图内,linker 不管理它),先探测实际目录名再补丁,两种形态均兼容。
  const pkgDir = ['@deepseek-ai/dsh-client-ui-conversation.devlink-disabled', '@deepseek-ai/dsh-client-ui-conversation']
    .map((n) => path.join(PLUGINS, n))
    .find((d) => fs.existsSync(path.join(d, 'lib', 'client.js')))
  if (!pkgDir) return [{ file: 'conversation', missing: true }]
  const p = path.join(pkgDir, 'lib', 'client.js')
  const ver = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8')).version
  const { rep, rex, failures } = makeCtx('conv')

  const apply = (c) => {
    // D1 markdown 渲染(MarkdownText 与 ReasoningRow 同 bundle 同作用域,9036 行已验证可用;
    // codeLabels 复用 conversation locale 的 copy/copied 键)
    c = rex(c,
      /children: (?:\/\* @__PURE__ \*\/ )?\(0, react_jsx_runtime\.jsx\)\("div", \{\s*className: ReasoningRow_module_css_default\.thinkBody,\s*children: text\s*\}\)/,
      'children: (0, react_jsx_runtime.jsx)("div", {\n\t\t\t\t\t\tclassName: ReasoningRow_module_css_default.thinkBody,\n\t\t\t\t\t\tchildren: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.MarkdownText, { text: text, streaming: running, codeLabels: { copyLabel: t("copy"), copiedLabel: t("copied") } })\n\t\t\t\t\t})',
      1, 'think-md')
    // D2 CSS:类名前缀动态探测(构建哈希会漂移),整条规则替换
    const m = c.match(/\.([A-Za-z0-9_-]+)_thinkBody\{/)
    if (!m) { failures.push('[conv] thinkBody prefix not found'); return c }
    const P = m[1]
    c = rex(c, new RegExp(`\\.${P}_thinkBody\\{[^}]*\\}`),
      `.${P}_thinkBody{max-height:400px;color:var(--dsw-alias-label-secondary);word-break:break-word;background:color-mix(in srgb, var(--dsw-alias-fill-l2,#7f7f7f1a) 40%, transparent);border-left:2px solid rgba(217,119,87,.45);scrollbar-width:thin;border-radius:0 8px 8px 0;margin:2px 0 4px 8px;padding:10px 14px;font-size:13px;line-height:1.75;overflow-y:auto}`,
      1, 'think-css')
    c = rex(c, new RegExp(`\\.${P}_thinkBody:hover\\{[^}]*\\}`),
      `.${P}_thinkBody:hover{border-left-color:rgba(217,119,87,.8)}`,
      1, 'think-css-hover')
    // markdown 块紧凑化:插在主规则之后(追加式注入,每次从 .bak 基底重打天然幂等)
    const idx = c.indexOf(`.${P}_thinkBody{`)
    if (idx < 0) { failures.push('[conv] think-css inject anchor missing'); return c }
    const TIGHT = `.${P}_thinkBody :is(p,ul,ol,pre,blockquote){margin:6px 0;font-size:13px;line-height:1.7}.${P}_thinkBody>:first-child{margin-top:0}.${P}_thinkBody>:last-child{margin-bottom:0}.${P}_thinkBody :is(h1,h2,h3,h4,h5){font-size:14px;font-weight:600;margin:10px 0 6px}.${P}_thinkBody :is(ul,ol){padding-left:20px}.${P}_thinkBody code{font-size:12px}`
    // [R39] 思维过程多样化表达:GFM 表格已解析为 <table>,补样式使其成可读表格
    // (display:block+overflow-x 横向滚动防撑破窄容器);引用块/分隔线/链接精化。
    const TABLE = `.${P}_thinkBody table{display:block;overflow-x:auto;max-width:100%;border-collapse:collapse;margin:8px 0;font-size:12px;line-height:1.6;scrollbar-width:thin}.${P}_thinkBody :is(th,td){border:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,.25));padding:4px 10px;text-align:left;white-space:nowrap}.${P}_thinkBody th{background:color-mix(in srgb, var(--dsw-alias-fill-l2,#7f7f7f) 55%, transparent);font-weight:600;color:var(--dsw-alias-label-primary)}.${P}_thinkBody tbody tr:nth-child(even){background:color-mix(in srgb, var(--dsw-alias-fill-l2,#7f7f7f) 18%, transparent)}.${P}_thinkBody blockquote{border-left:2px solid var(--dsw-alias-border-l2,rgba(127,127,127,.35));padding:2px 10px;color:var(--dsw-alias-label-tertiary)}.${P}_thinkBody hr{border:none;border-top:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,.25));margin:10px 0}.${P}_thinkBody a{color:var(--dsw-alias-link-primary,var(--dsw-alias-button-info-fill,#4176e6));text-decoration:none}.${P}_thinkBody a:hover{text-decoration:underline}.${P}_thinkBody li::marker{color:var(--dsw-alias-label-tertiary)}`
    c = c.slice(0, idx) + TIGHT + TABLE + c.slice(idx)
    return c
  }

  return [{ ...rewrite(p, '.bak-dsh', apply, failures), version: ver }]
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
  // C1(mnemon 单文件双补丁:order 20→13 + [F] entry 收起平滑化,共用 .bak-order 基底链防互相覆盖)
  {
    const mp = path.join(PLUGINS, 'dsh-mnemon', 'lib', 'client.js')
    if (!fs.existsSync(mp)) results.push({ file: 'dsh-mnemon', missing: true })
    else {
      const { rex, failures } = makeCtx('mnemon')
      const ver = JSON.parse(fs.readFileSync(path.join(PLUGINS, 'dsh-mnemon', 'package.json'), 'utf8')).version
      const apply = (c) => {
        c = rex(c, /id: "mnemon",(\s*\n\s*)order: 20,/, 'id: "mnemon",$1order: 13,', 1, 'mnemon-order')
        const m = c.match(/\[data-dsh-frame\]\[data-sidebar-collapsed\] \.([A-Za-z0-9_-]+)_entry\{/)
        if (!m) { failures.push('[mnemon] entry prefix not found'); return c }
        const P = m[1]
        c = rex(c, new RegExp(`\\[data-dsh-frame\\]\\[data-sidebar-collapsed\\] \\.${P}_entryLabel\\{display:none\\}`),
          `.${P}_entryLabel{max-width:200px;overflow:hidden;white-space:nowrap;transition:max-width var(--dsh-bsr-slide-duration,.3s) cubic-bezier(.32,.72,0,1),opacity .25s cubic-bezier(.32,.72,0,1)}[data-dsh-frame][data-sidebar-collapsed] .${P}_entryLabel{max-width:0;opacity:0;visibility:hidden}`,
          1, 'mnemon-entry-smooth')
        return c
      }
      results.push({ ...rewrite(mp, '.bak-order', apply, failures), version: ver })
    }
  }
  // C3/C4/C7: 单文件 order 改写(Web UI 插件 110→17 / 宠物 130→18 / 皮肤中心 120→14.5)
  // C7 浮点 order 已验证:registry 排序为 a.order - b.order 数值比较(scoped-slots.tsx:839),14.5 落在 皮肤14 与 插件15 之间。
  const orderSpecs = [
    { dir: '@linxin666/dsh-client-ui-web-ui-settings', re: /id: "web-ui-plugins",(\s*\n\s*)order: 110,/, to: 'id: "web-ui-plugins",$1order: 17,', label: 'webui-order' },
    { dir: '@linxin666/dsh-pet', re: /id: "pet",(\s*\n\s*)order: 130,/, to: 'id: "pet",$1order: 18,', label: 'pet-order' },
    { dir: '@linxin666/dsh-client-ui-skin-center', re: /id: "skin-center",(\s*\n\s*)order: 120,/, to: 'id: "skin-center",$1order: 14.5,', label: 'skin-center-order' },
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
  //     + [H/R31] 兼容性预检:安装 onClick 先 fetch /dsh-market/preview,Modal 内插入 compatWarn 块
  const mp = path.join(PLUGINS, 'dshmarket', 'client', 'client.js')
  if (!fs.existsSync(mp)) results.push({ file: 'dshmarket', missing: true })
  else {
    const { rep, rex, failures } = makeCtx('dshmarket')
    const ver = JSON.parse(fs.readFileSync(path.join(PLUGINS, 'dshmarket', 'package.json'), 'utf8')).version
    // [H] compatWarn 块(7 tab 基准缩进,插在 deprecated 块之前;mismatch 红警 / unknown 弱提示)
    const compatBlock = [
      '\t\t\t\t\t\t\tcompat !== null && (compat.mismatch === true || compat.checks.some((c) => c.kind === "unknown")) && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {',
      '\t\t\t\t\t\t\t\tclassName: Market_module_css_default.warnLine,',
      '\t\t\t\t\t\t\t\tchildren: [',
      '\t\t\t\t\t\t\t\t\t/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconWarningOutline16, {',
      '\t\t\t\t\t\t\t\t\t\tsize: 14,',
      '\t\t\t\t\t\t\t\t\t\tclassName: Market_module_css_default.bannerIcon',
      '\t\t\t\t\t\t\t\t\t}),',
      '\t\t\t\t\t\t\t\t\t" " + (compat.mismatch === true ? t("compatWarn") : t("compatUnknown")) + " ",',
      '\t\t\t\t\t\t\t\t\t/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {',
      '\t\t\t\t\t\t\t\t\t\tchildren: compat.checks.map((c, i) => c.text + (i < compat.checks.length - 1 ? "; " : ""))',
      '\t\t\t\t\t\t\t\t\t}),',
      '\t\t\t\t\t\t\t\t\t" ",',
      '\t\t\t\t\t\t\t\t\t/* @__PURE__ */ (0, react_jsx_runtime.jsx)("a", {',
      '\t\t\t\t\t\t\t\t\t\tclassName: Market_module_css_default.src,',
      '\t\t\t\t\t\t\t\t\t\thref: confirming.url + "#readme",',
      '\t\t\t\t\t\t\t\t\t\ttarget: "_blank",',
      '\t\t\t\t\t\t\t\t\t\trel: "noreferrer",',
      '\t\t\t\t\t\t\t\t\t\tchildren: t("readme")',
      '\t\t\t\t\t\t\t\t\t})',
      '\t\t\t\t\t\t\t\t]',
      '\t\t\t\t\t\t\t}),',
    ].join('\n')
    const apply = (c) => {
      c = rex(c, /id: "market",(\s*\n\s*)order: 40,/, 'id: "market",$1order: 16,', 1, 'market-order')
      // 字典(zh/en 各 6 键)
      c = rep(c, '\t\t\ttabDiscover: "发现",',
        '\t\t\ttabCommunity: "社区",\n\t\t\tcommunityNotice: "社区贡献者登记的插件索引,复制安装命令到终端执行即可安装;条目由作者自行维护,使用前请自行评估。",\n\t\t\tcommunityAuthor: "作者",\n\t\t\tcommunityCopy: "复制",\n\t\t\tcommunityCopied: "已复制",\n\t\t\tcommunityRepo: "仓库",\n\t\t\ttabDiscover: "发现",', 1, 'zh-community-keys')
      c = rep(c, '\t\t\ttabDiscover: "Discover",',
        '\t\t\ttabCommunity: "Community",\n\t\t\tcommunityNotice: "An index of plugins registered by community contributors. Copy an install command into your terminal to install; entries are maintained by their authors - evaluate before use.",\n\t\t\tcommunityAuthor: "Author",\n\t\t\tcommunityCopy: "Copy",\n\t\t\tcommunityCopied: "Copied",\n\t\t\tcommunityRepo: "Repo",\n\t\t\ttabDiscover: "Discover",', 1, 'en-community-keys')
      // [H] 字典:兼容性警告键(锚 tabDiscover 键,在 C2 键插入后仍唯一)
      c = rep(c, '\t\t\ttabDiscover: "发现",',
        '\t\t\tcompatWarn: "检测到潜在兼容性问题,安装后可能无法加载或影响宿主运行:",\n\t\t\tcompatUnknown: "无法验证该插件与当前环境的兼容性(元数据不可得)。",\n\t\t\tinstallAnyway: "仍要安装",\n\t\t\ttabDiscover: "发现",', 1, 'zh-compat-keys')
      c = rep(c, '\t\t\ttabDiscover: "Discover",',
        '\t\t\tcompatWarn: "Potential compatibility issues detected; the plugin may fail to load or affect the host:",\n\t\t\tcompatUnknown: "Compatibility with this environment could not be verified (metadata unavailable).",\n\t\t\tinstallAnyway: "Install anyway",\n\t\t\ttabDiscover: "Discover",', 1, 'en-compat-keys')
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
      // [H] state:compat 预检报告(锚 confirming state 定义)
      c = rep(c, '\t\t\tconst [confirming, setConfirming] = (0, react.useState)(null);',
        '\t\t\tconst [confirming, setConfirming] = (0, react.useState)(null);\n\t\t\tconst [compat, setCompat] = (0, react.useState)(null);', 1, 'compat-state')
      // [H] doInstall 开头清 compat(跨安装残留)
      c = rep(c, '\t\t\tconst doInstall = (0, react.useCallback)((plugin) => {\n\t\t\t\tsetBuildsSkipped(null);',
        '\t\t\tconst doInstall = (0, react.useCallback)((plugin) => {\n\t\t\t\tsetCompat(null);\n\t\t\t\tsetBuildsSkipped(null);', 1, 'compat-reset')
      // [H] 安装按钮:先开 Modal(不阻塞),异步拉预检报告填充警告块
      c = rep(c, '\t\t\t\t\t\t\t\t\tonClick: () => setConfirming(p),',
        '\t\t\t\t\t\t\t\t\tonClick: () => {\n\t\t\t\t\t\t\t\t\t\tsetCompat(null);\n\t\t\t\t\t\t\t\t\t\tsetConfirming(p);\n\t\t\t\t\t\t\t\t\t\tfetch("/dsh-market/preview", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: p.url }) }).then((r) => r.json()).then((b) => { if (b && b.ok) setCompat(b); }).catch(() => {});\n\t\t\t\t\t\t\t\t\t},', 2, 'compat-fetch')
      // [H] Modal 警告块:插在 deprecated 块之前
      c = rep(c, '\t\t\t\t\t\t\tconfirming.deprecated === true && (() => {',
        compatBlock + '\n\t\t\t\t\t\t\tconfirming.deprecated === true && (() => {', 1, 'compat-warn')
      // [H] 确认按钮文案:有 mismatch 时变「仍要安装」
      // [问题88] dshmarket 1.18.0 把确认键从 t("confirm") 改为 t("confirmInstall")——锚点兼容两代键名,
      // 回退分支沿用捕获到的原键,避免给旧版注入不存在的字典键。
      c = rex(c, /onClick: \(\) => doInstall\(confirming\),\n(\t+)children: t\("(confirm(?:Install)?)"\)/,
        (_m, g1, g2) => 'onClick: () => doInstall(confirming),\n' + g1 + 'children: compat !== null && compat.mismatch === true ? t("installAnyway") : t("' + g2 + '")', 1, 'compat-confirm')
      return c
    }
    results.push({ ...rewrite(mp, '.bak-dshm', apply, failures), version: ver })
  }
  return results
}

// ---- [I] git-graph 分支 chip 移除(R29,2026-08-18) ----
function patchGitGraph() {
  const p = path.join(PLUGINS, '@linxin666', 'dsh-client-ui-git-graph', 'lib', 'client.js')
  if (!fs.existsSync(p)) return [{ file: 'git-graph', missing: true }]
  const ver = JSON.parse(fs.readFileSync(path.join(PLUGINS, '@linxin666', 'dsh-client-ui-git-graph', 'package.json'), 'utf8')).version
  const { rep, failures } = makeCtx('git-graph')
  const apply = (c) => {
    // I1: 组件短路——chip/分支弹窗/图谱对话框入口全部不入 DOM
    c = rep(c, '\t\tfunction BranchChip(props) {',
      '\t\tfunction BranchChip(props) {\n\t\t\treturn null; // [dsh-desktop] R29: chat-input git chip removed (sidebar git panel already covers it)', 1, 'chip-shortcircuit')
    return c
  }
  return [{ ...rewrite(p, '.bak-gitgraph', apply, failures), version: ver }]
}

// ---- [J] Agent 预设 persona shadow 移除(问题54,2026-08-19) ----
// 新版 dsh 每个内置预设(standard/code/cordis/minimal)自带 `- id: persona`
// (@deepseek-ai/dsh-persona)条目,注释明言 "shadowing the deployment default"——
// 部署级 system-prompt.config.persona(壳 /persona 写入)被 agent 作用域同名
// section 顶掉,设置页改人设不生效。移除预设的 persona 条目后,部署级
// persona 自然接管(恢复 R6 链路)。无 persona 条目的预设 no-op。
// 预设文件随 dsh 版本更新被覆盖——用「上游漂移自愈」重写:当前文件既不等于
// 备份基底也不等于补丁态时,认定上游已更新,刷新基底重打(避免旧基底回写旧版内容)。
function stripPresetPersona(c) {
  const lines = c.split('\n')
  const out = []
  let i = 0, removed = 0
  while (i < lines.length) {
    if (lines[i].trim() === '- id: persona' && lines[i + 1] && lines[i + 1].includes("name: '@deepseek-ai/dsh-persona'")) {
      i += 2
      // 跳过块内行:缩进行属块;空行仅当其后仍是缩进行时才属块(否则是下一条目分隔)
      while (i < lines.length) {
        if (lines[i].trim() === '') {
          let j = i + 1
          while (j < lines.length && lines[j].trim() === '') j++
          if (j >= lines.length || !/^\s/.test(lines[j])) break
          i++
          continue
        }
        if (/^\s/.test(lines[i])) { i++; continue }
        break
      }
      removed++
      continue
    }
    out.push(lines[i])
    i++
  }
  return { text: out.join('\n'), removed }
}

/** 上游漂移自愈重写:文件被上游更新(≠基底且≠补丁态)时刷新基底重打。
 *  [q99] FAIL 不写盘:失配时保留 current 原样只告警——原「写回 base」在多副本重放器
 *  并存场景是反噬(旧版重放器把新版打好的补丁整体抹掉,即 2026-08-23 侧边栏复发主根因)。
 *  apply 为纯函数,失败不落盘即无半补丁,还原写盘没有收益只有破坏。 */
function rewriteFresh(p, bakSuffix, apply, failures, sentinel) {
  const file = path.basename(path.dirname(p)) + '/' + path.basename(p)
  const bak = p + bakSuffix
  const current = fs.readFileSync(p, 'utf8')
  // 哨兵快速通道:已是补丁态,幂等跳过(不动 bak)
  if (sentinel && current.includes(sentinel)) return { file, ok: true, already: true }
  let base = fs.existsSync(bak) ? fs.readFileSync(bak, 'utf8') : current
  let patched = apply(base)
  if (current !== base && current !== patched) {
    // 上游已更新:刷新基底,从新内容重打;清空旧基底的失配记录,避免污染新基底判定
    base = current
    failures.length = 0
    patched = apply(base)
  }
  if (!fs.existsSync(bak) || fs.readFileSync(bak, 'utf8') !== base) fs.writeFileSync(bak, base, 'utf8')
  if (failures.length) {
    return { file, ok: false, failures: [...failures], kept: true }
  }
  if (sentinel && !patched.includes(sentinel)) patched += '\n' + sentinel + '\n'
  const already = current === patched
  if (!already) fs.writeFileSync(p, patched, 'utf8')
  return { file, ok: true, already }
}

function patchPresets() {
  const results = []
  const files = []
  // 1) npx 缓存内所有 dsh 版本的内置预设(多哈希并存时全打)
  const npxRoot = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), '.npm-cache'), 'npm-cache', '_npx')
  if (fs.existsSync(npxRoot)) {
    for (const h of fs.readdirSync(npxRoot)) {
      const root = path.join(npxRoot, h, 'node_modules', '@deepseek-ai', 'dsh', 'config', 'agent-presets')
      if (!fs.existsSync(root)) continue
      for (const name of fs.readdirSync(root)) {
        const f = path.join(root, name, 'agent.cordis.yml')
        if (fs.existsSync(f)) files.push(f)
      }
    }
  }
  // 2) 用户自定义预设
  const userRoot = path.join(os.homedir(), '.dsh', '.agent-presets')
  if (fs.existsSync(userRoot)) {
    for (const name of fs.readdirSync(userRoot)) {
      const f = path.join(userRoot, name, 'agent.cordis.yml')
      if (fs.existsSync(f)) files.push(f)
    }
  }
  for (const p of files) {
    const { failures } = makeCtx('presets')
    const apply = (c) => {
      const r = stripPresetPersona(c)
      // 无 persona 条目的预设合法 no-op,不算失败
      return r.text
    }
    try {
      results.push({ ...rewriteFresh(p, '.bak-persona', apply, failures, YAML_MARK), version: 'preset' })
    } catch (e) {
      results.push({ file: p, ok: false, failures: [`[presets] ${e.message}`] })
    }
  }
  if (!files.length) results.push({ file: 'presets', missing: true })
  return results
}

// ---- 核心: 自愈式重写(哨兵快速通道 → 上游漂移刷新 → FAIL 不写盘) ----
// [q99 2026-08-23] 三项加固(同 rewriteFresh):
//   ① 哨兵快速通道:current 含 PATCH_MARK 即已是补丁态,跳过 apply(免疫一切锚点误报);
//   ② 上游漂移刷新:current ≠ base 且 ≠ patched 且无哨兵 = 新上游 → 刷新 base 重打
//     (原版恒以旧 bak 为基底,上游小版本更新会被回滚成旧文件+补丁);
//   ③ FAIL 不写盘:失配保留 current 原样(补丁态/新上游纯净态都不动)。
//     原版 FAIL「写回 base」在旧 asar 重放器仍可被启动的场景是主动反噬——
//     2026-08-23 13:35 即旧 asar 内 0.13 时代锚点对 0.15.1 FAIL 后把新补丁整体还原,
//     侧边栏一夜回退原生形态(问题99复发主根因)。
function rewrite(p, bakSuffix, apply, failures, sentinel = PATCH_MARK) {
  const file = path.basename(p)
  const bak = p + bakSuffix
  const current = fs.readFileSync(p, 'utf8')
  if (sentinel && current.includes(sentinel)) return { file, ok: true, already: true }
  let base = fs.existsSync(bak) ? fs.readFileSync(bak, 'utf8') : current
  if (!fs.existsSync(bak)) fs.writeFileSync(bak, base, 'utf8')

  let patched
  try {
    patched = apply(base)
  } catch (e) {
    failures.push(`${file}: ${e.message}`)
    patched = base
  }
  if (!failures.length && current !== base && current !== patched) {
    // 上游已更新:刷新基底从新内容重打;清空旧基底失配记录
    base = current
    failures.length = 0
    try {
      patched = apply(base)
    } catch (e) {
      failures.push(`${file}: ${e.message}`)
      patched = base
    }
  }
  if (!fs.existsSync(bak) || fs.readFileSync(bak, 'utf8') !== base) fs.writeFileSync(bak, base, 'utf8')
  if (failures.length) {
    // 保留 current 原样,绝不写盘还原(杜绝半补丁的旧手段在多副本场景是反噬)
    return { file, ok: false, failures: [...failures], kept: true }
  }
  if (sentinel && !patched.includes(sentinel)) patched += '\n' + sentinel + '\n'
  const already = current === patched
  if (!already) fs.writeFileSync(p, patched, 'utf8')
  return { file, ok: true, already }
}

// ---- [E] profile 守护: 禁用聚合包内嵌 better-sidebar,防 /sidebar/api 路由冲突回潮 ----
// 补丁语义按 id 后写覆盖先写:若有人把该行改回启用,末尾再追一条 disabled:true 强制压回。
function patchProfileSidebarDedup() {
  const file = 'cordis.patch.yml'
  const p = path.join(os.homedir(), '.dsh', 'profiles', 'web', 'cordis.patch.yml')
  if (!fs.existsSync(p)) return [{ file, missing: true }]
  const ROW = '- id: web-ui-better-sidebar'
  // 2026-08-22 [dshmarket 体检]: 聚合包(dsh-web-ui-all)卸载后不再自动追加守护行,
  // 否则每次体检都会报 web-ui-better-sidebar "patch target not found" 孤儿。
  // 仅在聚合包内嵌 better-sidebar 仍在 node_modules 时才守护;重装聚合包后自动恢复,
  // crash-loop 防护语义不变。
  // 2026-08-23 [q99]: 包不在而守护行仍在 = 孤儿行(手工删除会漏/装卸时序会再生产生),
  // 自动清理整个守护块(注释+行),体检归零;重装聚合包后本函数自动追加回来。
  if (!fs.existsSync(path.join(PLUGINS, '@linxin666', 'dsh-client-ui-web-ui-better-sidebar'))) {
    const buf0 = fs.readFileSync(p)
    const view0 = buf0.toString('latin1')
    const last0 = view0.lastIndexOf(ROW)
    if (last0 >= 0) {
      // 回溯吞掉紧邻上方的 [dsh-desktop guard] 注释块;向前吞到上一个非守护内容之后
      let start = last0
      const commentHead = view0.lastIndexOf('# [dsh-desktop guard]', last0)
      if (commentHead >= 0 && commentHead > view0.lastIndexOf('\n-', commentHead)) start = commentHead
      // 守护块末尾 = disabled 行之后的连续空行
      const rest = view0.slice(last0 + ROW.length)
      const disMatch = rest.match(/^\s*\n\s*disabled:\s*true\s*\n?/)
      const end = disMatch ? last0 + ROW.length + disMatch[0].length : last0 + ROW.length
      const cleaned = view0.slice(0, start).replace(/\n+$/, '\n\n') + view0.slice(end).replace(/^\n+/, '')
      fs.writeFileSync(p, Buffer.from(cleaned, 'latin1'))
      return [{ file, ok: true, already: false, version: 'profile', cleanedOrphan: true }]
    }
    return [{ file, ok: true, already: true, version: 'profile' }]
  }
  const GUARD = [
    '',
    '# [dsh-desktop guard] dsh-web-ui-all bundles its own dsh-better-sidebar (row',
    '# web-ui-better-sidebar) which clashes with the standalone dsh-better-sidebar',
    '# over the "/sidebar/api" prefix route and crashes dsh at boot (endless shell',
    '# restart loop). Keep the aggregated copy disabled; standalone 0.13.1 stays.',
    ROW,
    '  disabled: true',
    '',
  ].join('\n')
  const buf = fs.readFileSync(p)
  const view = buf.toString('latin1') // 仅用于 ASCII 标记检索,不回写
  if (!view.includes(ROW)) {
    fs.appendFileSync(p, Buffer.from(GUARD, 'ascii'))
    return [{ file, ok: true, already: false, version: 'profile' }]
  }
  // 标记已存在:确认最后一条 web-ui-better-sidebar 行仍为 disabled: true
  const last = view.lastIndexOf(ROW)
  if (/\n\s*disabled:\s*true/.test(view.slice(last + ROW.length, last + ROW.length + 60))) {
    return [{ file, ok: true, already: true, version: 'profile' }]
  }
  fs.appendFileSync(p, Buffer.from(GUARD, 'ascii')) // 被改回启用→追加覆盖行强制禁用
  return [{ file, ok: true, already: false, version: 'profile' }]
}

// ---- [H] dsh-turn-review 本轮审查 idle 崩溃修复(2026-08-26,问题108) ----
//       症状: 打开「本轮审查」标签页即报 dsh-better-sidebar: status.rows is not iterable。
//       根因: host 侧 status 在该会话尚无审查窗口时(dsh 重启后/首回合结束前,内存 Map 为空)
//       回落 {sessionId, phase:'idle'},缺 rows/pendingSubagents/snapshotError/history 字段,
//       client 面板 for...of status.rows 直接 TypeError(经 better-sidebar 错误边界上报,
//       故误归因于宿主插件)。H1 host 回落补全完整形状;H2 client 面板全字段空值兜底,
//       双侧同修:任一侧旧版本在场都不再崩(0.1.0 验证)。
function patchTurnReview() {
  const dir = path.join(PLUGINS, 'dsh-turn-review')
  if (!fs.existsSync(dir)) return [{ file: 'dsh-turn-review', missing: true }]
  const ver = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).version
  const results = []

  // H1 host: idle 回落补全完整 status 形状(lib/index.js,运行时宿主入口)
  {
    const p = path.join(dir, 'lib', 'index.js')
    if (fs.existsSync(p)) {
      const { rep, failures } = makeCtx('turn-review/index.js')
      const apply = (c) => {
        c = rep(c,
          'tracker.get(sessionId) ?? {\n\t\t\t\tsessionId,\n\t\t\t\tphase: "idle"\n\t\t\t};',
          'tracker.get(sessionId) ?? {\n\t\t\t\tsessionId,\n\t\t\t\tphase: "idle",\n\t\t\t\trows: [],\n\t\t\t\tpendingSubagents: [],\n\t\t\t\tsnapshotError: null,\n\t\t\t\thistory: []\n\t\t\t};',
          1, 'idle-shape')
        return c
      }
      results.push({ ...rewrite(p, '.bak-q108', apply, failures), version: ver })
    }
  }

  // H2 client: rows/pendingSubagents/history 空值兜底(client.js 与 client-registry.js 同源双副本)
  for (const f of ['client.js', 'client-registry.js']) {
    const p = path.join(dir, 'lib', f)
    if (!fs.existsSync(p)) continue
    const { rep, failures } = makeCtx('turn-review/' + f)
    const apply = (c) => {
      c = rep(c,
        'for (const row of status.rows) groups[row.sessionKind === "unattributed" ? "unattributed" : row.sessionKind].push(row);',
        'for (const row of status.rows ?? []) groups[row.sessionKind === "unattributed" ? "unattributed" : row.sessionKind].push(row);',
        1, 'rows-iter')
      c = rep(c,
        'for (const path of current) if (next.rows.some((row) => row.path === path)) keep.add(path);',
        'for (const path of current) if ((next.rows ?? []).some((row) => row.path === path)) keep.add(path);',
        1, 'keep-rows')
      c = rep(c,
        'setSelected((current) => current !== null && next.rows.some((row) => row.path === current) ? current : null);',
        'setSelected((current) => current !== null && (next.rows ?? []).some((row) => row.path === current) ? current : null);',
        1, 'sel-rows')
      c = rep(c,
        'status.phase === "pending" && status.pendingSubagents.length > 0 &&',
        'status.phase === "pending" && (status.pendingSubagents?.length ?? 0) > 0 &&',
        1, 'pending-gate')
      c = rep(c,
        'status.pendingSubagents.length,',
        'status.pendingSubagents?.length ?? 0,',
        1, 'pending-count')
      c = rep(c,
        'status.history.length > 0 &&',
        'status.history?.length > 0 &&',
        1, 'history-gate')
      c = rep(c,
        'children: status.history.length',
        'children: status.history?.length ?? 0',
        1, 'history-count')
      c = rep(c,
        'children: [...status.history].reverse().map((record) => {',
        'children: [...status.history ?? []].reverse().map((record) => {',
        1, 'history-list')
      return c
    }
    results.push({ ...rewrite(p, '.bak-q108', apply, failures), version: ver })
  }

  // src 源码同步(非运行时产物;防本地 rebuild 复现旧缺陷,锚点漂移 FAIL 时安全跳过)
  {
    const p = path.join(dir, 'src', 'index.ts')
    if (fs.existsSync(p)) {
      const { rep, failures } = makeCtx('turn-review/src-index.ts')
      const apply = (c) => {
        c = rep(c,
          "tracker.get(sessionId) ?? { sessionId, phase: 'idle' }",
          "tracker.get(sessionId) ?? {\n        sessionId,\n        phase: 'idle',\n        rows: [],\n        pendingSubagents: [],\n        snapshotError: null,\n        history: [],\n      }",
          1, 'idle-shape')
        return c
      }
      results.push({ ...rewrite(p, '.bak-q108', apply, failures), version: ver })
    }
  }
  {
    const p = path.join(dir, 'src', 'client', 'ReviewPanel.tsx')
    if (fs.existsSync(p)) {
      const { rep, failures } = makeCtx('turn-review/src-ReviewPanel.tsx')
      const apply = (c) => {
        c = rep(c, 'for (const row of status.rows) {', 'for (const row of status.rows ?? []) {', 1, 'rows-iter')
        c = rep(c,
          'if (next.rows.some(row => row.path === path)) keep.add(path)',
          'if ((next.rows ?? []).some(row => row.path === path)) keep.add(path)',
          1, 'keep-rows')
        c = rep(c,
          'setSelected(current => (current !== null && next.rows.some(row => row.path === current) ? current : null))',
          'setSelected(current => (current !== null && (next.rows ?? []).some(row => row.path === current) ? current : null))',
          1, 'sel-rows')
        c = rep(c,
          "status.phase === 'pending' && status.pendingSubagents.length > 0 &&",
          "status.phase === 'pending' && (status.pendingSubagents?.length ?? 0) > 0 &&",
          1, 'pending-gate')
        c = rep(c, '{status.pendingSubagents.length}', '{status.pendingSubagents?.length ?? 0}', 1, 'pending-count')
        c = rep(c, 'status.history.length > 0 &&', 'status.history?.length > 0 &&', 1, 'history-gate')
        c = rep(c, '{status.history.length}', '{status.history?.length ?? 0}', 1, 'history-count')
        c = rep(c, '{[...status.history].reverse().map(record => {', '{[...status.history ?? []].reverse().map(record => {', 1, 'history-list')
        return c
      }
      results.push({ ...rewrite(p, '.bak-q108', apply, failures), version: ver })
    }
  }

  return results
}

// ---- [J] dsh-joi-channel-theme 装饰层读写分离(2026-08-26,问题109) ----
//       症状: 侧边卡片开合时(长会话+joi 皮肤)整个会话框「抬起再落下」+ 明显卡顿。
//       根因: 布局动画本体是 [A] A3 段 #root 的 300ms 过渡(本轮已移除);joi 侧放大器
//       是 reconcile 每次 MutationObserver/resize 触发都全量重算装饰,paintTexture 与
//       applyHalo 在同循环里交替「读布局(getBoundingClientRect)↔ 写 class」——class 写入
//       使布局失效,下一次读被迫整页强制回流;长会话数万节点逐帧触发 = 布局抖动,
//       滚动锚定与贴底逻辑被拖出可见的「抬起-落下」。
//       J1 paintTexture 两阶段(先纯读收集,再统一写类);J2 applyHalo 同法。
//       读集中一次回流,写集中一次失效,整趟 reconcile 从 O(命中数) 次强制回流降为 1 次。
function patchJoiTheme() {
  const p = path.join(PLUGINS, 'dsh-joi-channel-theme', 'lib', 'client.js')
  if (!fs.existsSync(p)) return [{ file: 'dsh-joi-theme', missing: true }]
  const ver = JSON.parse(fs.readFileSync(path.join(PLUGINS, 'dsh-joi-channel-theme', 'package.json'), 'utf8')).version
  const { rep, failures } = makeCtx('joi-theme/client.js')

  const apply = (c) => {
    // J1 paintTexture 两阶段: 先收集命中再统一加类,消除读-写交替的强制回流
    c = rep(c,
      '\t\t\tlet hit = 0;\n\t\t\tfor (const el of document.querySelectorAll("body div")) {\n\t\t\t\tif (hit >= 8) break;\n\t\t\t\tconst r = el.getBoundingClientRect();\n\t\t\t\tif (r.width < window.innerWidth * .45 || r.height < window.innerHeight * .45) continue;\n\t\t\t\tif (getComputedStyle(el).backgroundColor !== base) continue;\n\t\t\t\tel.classList.add(TEX_CLASS);\n\t\t\t\thit++;\n\t\t\t}\n\t\t\treturn hit;',
      '\t\t\tconst found = [];\n\t\t\tfor (const el of document.querySelectorAll("body div")) {\n\t\t\t\tif (found.length >= 8) break;\n\t\t\t\tconst r = el.getBoundingClientRect();\n\t\t\t\tif (r.width < window.innerWidth * .45 || r.height < window.innerHeight * .45) continue;\n\t\t\t\tif (getComputedStyle(el).backgroundColor !== base) continue;\n\t\t\t\tfound.push(el);\n\t\t\t}\n\t\t\tfor (const el of found) el.classList.add(TEX_CLASS);\n\t\t\treturn found.length;',
      1, 'texture-two-phase')
    // J2 applyHalo 两阶段: 先读全部 block 矩形再统一 toggle 类
    c = rep(c,
      '\t\t\tfor (const block of blocks) {\n\t\t\t\tconst r = block.getBoundingClientRect();\n\t\t\t\tblock.classList.toggle(HALO_CLASS, boxes.some((b) => intersects(r, b)));\n\t\t\t}',
      '\t\t\tconst marks = [];\n\t\t\tfor (const block of blocks) {\n\t\t\t\tconst r = block.getBoundingClientRect();\n\t\t\t\tmarks.push([block, boxes.some((b) => intersects(r, b))]);\n\t\t\t}\n\t\t\tfor (const [block, on] of marks) block.classList.toggle(HALO_CLASS, on);',
      1, 'halo-two-phase')
    // [K1 2026-08-27] 换装入口迁址: settings.general.item → settings.skin.item
    // 渲染落点由 [K2] 在 dshvt 皮肤页注入(settings.skin.item 槽)。当前存活副本已手工
    // 迁移并带哨兵 → 重放走哨兵快速通道不会进入本分支;未来上游漂移刷新后重打,或上游
    // 回归旧锚点时此分支兜底迁移。两种终态都合法,不算失败。
    if (c.includes('ctx.slots.inject("settings.general.item"')) {
      c = rep(c,
        'ctx.slots.inject("settings.general.item", () => ctx.slots.register({\n\t\t\t\tname: "settings.general.item",',
        'ctx.slots.inject("settings.skin.item", () => ctx.slots.register({\n\t\t\t\tname: "settings.skin.item",',
        1, 'suit-slot-move')
    } else if (!c.includes('ctx.slots.inject("settings.skin.item"')) {
      failures.push('suit-slot-move: neither old nor new slot anchor found')
    }
    return c
  }

  return [{ ...rewrite(p, '.bak-q109', apply, failures), version: ver }]
}

// ---- [K] 设置页合并(2026-08-27,问题110;v2 同日修订:通用设置二级页签方案) ----
//       K1 joi 换装迁址 settings.general.item → settings.skin.item(执行体并入 patchJoiTheme 链)。
//       K2 通用设置页(核心包 dsh-client-ui-settings-general;遍历全部 npx 缓存 + devlink 层):
//         a) 新增账本条目 general-basics(基础设置页=原通用设置内容,顶层导航隐藏);
//         b) GeneralSection 改为二级入口页:四张卡(基础设置/专家/备份与迁移/Vision Router);
//         c) 导航行计算:三个顶层入口原样保留,同时在 general 行下挂四个缩进子行(sub: 前缀
//            虚拟 id,壳渲染时映射回真实账本条目,不递归调用同槽 renderSlot);
//         d) dshvt 皮肤页底部补 settings.skin.item 槽渲染点(K1 的落点)。
//       v3 修订: v2 的内容区页签方案因「settings.section 渲染期间递归 renderSlot 同槽」被
//       槽运行时错误边界拦截而废弃;v3 全部走壳层原生渲染路径,无任何递归。
//       重放器语义:rewriteFresh(哨兵 + 上游漂移刷新);锚点不适配的旧缓存安全跳过不判失败。
function patchSettingsNest() {
  const results = []

  // K2d dshvt 皮肤页槽渲染点:包装 SkinSectionHost,零侵入 SkinTab 本体
  {
    const p = path.join(PLUGINS, 'dsh-desktop-version-tab', 'lib', 'client.js')
    if (!fs.existsSync(p)) {
      results.push({ file: 'dshvt/client.js', missing: true })
    } else {
      const ver = JSON.parse(fs.readFileSync(path.join(PLUGINS, 'dsh-desktop-version-tab', 'package.json'), 'utf8')).version
      const { rep, rex, failures } = makeCtx('dshvt/client.js')
      const apply = (c) => {
        c = rep(c,
          'function SkinSectionHost() {',
          'function SkinSectionHost(props) { // [K2d] 透传 renderSlot:皮肤页底部补 settings.skin.item 槽(joi 换装迁入)',
          1, 'skin-host-sig')
        c = rep(c,
          'return react.createElement(SkinTab, { checkSkinCenter, checkPet });',
          'return react.createElement("div", null, react.createElement(SkinTab, { checkSkinCenter, checkPet }), props && props.renderSlot ? props.renderSlot("settings.skin.item", {}) : null);',
          1, 'skin-host-wrap')
        // 槽声明:skin section 注册时补 children(settings.skin.item),joi 换装行的
        // slots.inject 等待声明后自动落位;没有它 renderSlot 拿不到任何条目。
        // dshvt 产物为 CRLF 行尾 → 用 \r?\n 正则锚定。
        c = rex(c,
          /locale: NS6,\r?\n\t\t\t\}, function SkinSectionHost\(props\) \{/,
          'locale: NS6,\r\n\t\t\t\tchildren: { "settings.skin.item": {\r\n\t\t\t\t\tkind: "list",\r\n\t\t\t\t\tscope: "root"\r\n\t\t\t\t} }\r\n\t\t\t}, function SkinSectionHost(props) {',
          1, 'skin-slot-declare')
        return c
      }
      results.push({ ...rewrite(p, '.bak-nestskin', apply, failures), version: ver })
    }
  }

  // K2a/b/c 通用设置核心包
  const ZH_OLD = '\t\t\t"openDocument": "打开配置文件",\n\t\t\t"openDocument.error": "无法打开配置文件",\n\t\t\t"general.nav": "通用设置"\n\t\t};'
  const ZH_NEW = '\t\t\t"openDocument": "打开配置文件",\n\t\t\t"openDocument.error": "无法打开配置文件",\n\t\t\t"general.nav": "通用设置",\n\t\t\t"sub.basics": "基础设置",\n\t\t\t"sub.basics.desc": "语言、外观、提示音、文件放入等常规偏好。",\n\t\t\t"sub.experts": "专家",\n\t\t\t"sub.experts.desc": "查看并开关 The Agency 的领域专家。",\n\t\t\t"sub.backup": "备份与迁移",\n\t\t\t"sub.backup.desc": "备份、恢复、导入导出与远程同步 DSH 配置。",\n\t\t\t"sub.vision": "Vision Router",\n\t\t\t"sub.vision.desc": "识图路由、视觉链路与自动识图模型组。"\n\t\t};'
  const EN_OLD = '\t\t\t"openDocument": "Open configuration file",\n\t\t\t"openDocument.error": "Could not open configuration file",\n\t\t\t"general.nav": "General"\n\t\t};'
  const EN_NEW = '\t\t\t"openDocument": "Open configuration file",\n\t\t\t"openDocument.error": "Could not open configuration file",\n\t\t\t"general.nav": "General",\n\t\t\t"sub.basics": "Basics",\n\t\t\t"sub.basics.desc": "Language, appearance, sounds, file drop and other general preferences.",\n\t\t\t"sub.experts": "Experts",\n\t\t\t"sub.experts.desc": "Toggle The Agency domain experts.",\n\t\t\t"sub.backup": "Backup & Migration",\n\t\t\t"sub.backup.desc": "Back up, restore, import and sync the DSH configuration.",\n\t\t\t"sub.vision": "Vision Router",\n\t\t\t"sub.vision.desc": "Vision routing, chains and auto-vision model groups."\n\t\t};'
  const GS_OLD = 'function GeneralSection({ renderSlot }) {\n\t\t\treturn (0, react_jsx_runtime.jsx)("div", {\n\t\t\t\tclassName: GeneralSection_module_css_default.section,\n\t\t\t\tchildren: renderSlot("settings.general.item", {})\n\t\t\t});\n\t\t}'
  const GS_NEW = 'function GeneralSection({ renderSlot, select, t, show }) {\n\t\t\t// [K2c v4] 通用设置双形态:show==="basics" 渲染原通用设置内容(基础设置子页);否则渲染二级入口卡\n\t\t\tif (show === "basics") {\n\t\t\t\treturn (0, react_jsx_runtime.jsx)("div", {\n\t\t\t\t\tclassName: GeneralSection_module_css_default.section,\n\t\t\t\t\tchildren: renderSlot("settings.general.item", {})\n\t\t\t\t});\n\t\t\t}\n\t\t\tconst entries = select === void 0 || t === void 0 ? [] : [\n\t\t\t\t["sub:basics", t("sub.basics"), t("sub.basics.desc")],\n\t\t\t\t["sub:agency-agents", t("sub.experts"), t("sub.experts.desc")],\n\t\t\t\t["sub:config-manager", t("sub.backup"), t("sub.backup.desc")],\n\t\t\t\t["sub:vision-router", t("sub.vision"), t("sub.vision.desc")]\n\t\t\t];\n\t\t\treturn (0, react_jsx_runtime.jsx)("div", {\n\t\t\t\tclassName: GeneralSection_module_css_default.section,\n\t\t\t\tchildren: (0, react_jsx_runtime.jsx)("div", {\n\t\t\t\t\tclassName: "sGenSubGrid",\n\t\t\t\t\tchildren: entries.map(([id, label, desc]) => (0, react_jsx_runtime.jsx)("button", {\n\t\t\t\t\t\ttype: "button",\n\t\t\t\t\t\tclassName: "sGenSubCard",\n\t\t\t\t\t\tonClick: () => {\n\t\t\t\t\t\t\tselect(id);\n\t\t\t\t\t\t},\n\t\t\t\t\t\tchildren: [(0, react_jsx_runtime.jsx)("span", {\n\t\t\t\t\t\t\tclassName: "sGenSubCardTitle",\n\t\t\t\t\t\t\tchildren: label\n\t\t\t\t\t\t}), (0, react_jsx_runtime.jsx)("span", {\n\t\t\t\t\t\t\tclassName: "sGenSubCardDesc",\n\t\t\t\t\t\t\tchildren: desc\n\t\t\t\t\t\t}), (0, react_jsx_runtime.jsx)("span", {\n\t\t\t\t\t\t\tclassName: "sGenSubCardGo",\n\t\t\t\t\t\t\tchildren: "›"\n\t\t\t\t\t\t})]\n\t\t\t\t\t}, id))\n\t\t\t\t})\n\t\t\t});\n\t\t}'
  // [K2d 2026-08-28] 用户需求:导航里四个二级子页行整体去除——通用页入口卡为唯一入口。
  // 行保留在 DOM(childRows 仍注入,active/跳转链路依赖 rows 结构),仅 display:none
  // (与 skin-center/pet 隐藏同款"内容保留可激活"模式)。
  // [K2d 修正] 原 .Q6vcTq_navCell 是 css-modules hash 类名,上游升级后漂移为 VOzbGW_
  // ——hash 锚定规则静默失配(旧缩进子行样式早已无效)。改属性选择器 button[data-dsh-sub]
  // (K2a 自己注入的标记,hash 无关),加 !important 盖上游 navCell 的 display:flex。
  // [K2e 2026-08-28] 入口卡重排:整行横向长方形(单列),贴 harness 原生设置行语言——
  // hairline 边框(--dsw-alias-border-l2,同 vt_backBar)+ radius 8px(实测原生 ns_row/
  // navCell 同款)+ 14px 标题/12px 描述左列、chevron 右列跨行居中(grid 三区布局,DOM 零改);
  // hover 边框/标题/箭头转 Claude 橙 #d97757 + 箭头右移 3px,全过渡 Claude 曲线 .3s
  // (cubic-bezier(.32,.72,0,1));reduced-motion 全关。
  const CSSNEST_INJECT = '\t\tconst cssNest = "button[data-dsh-sub=\\"true\\"]{display:none!important}.sGenSubGrid{display:flex;flex-direction:column;gap:10px;margin-bottom:6px;width:100%}.sGenSubCard{box-sizing:border-box;display:grid;grid-template-columns:1fr auto;column-gap:12px;align-items:center;width:100%;min-height:58px;text-align:left;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:11px 14px;cursor:pointer;color:var(--dsw-alias-label-primary);font-family:inherit;transition:border-color .3s cubic-bezier(.32,.72,0,1),background-color .3s cubic-bezier(.32,.72,0,1)}.sGenSubCard:hover{border-color:#d97757;background:var(--dsw-specific-sidebar-nav-item-hover)}.sGenSubCard:focus-visible{outline:2px solid rgba(217,119,87,.5);outline-offset:2px}.sGenSubCardTitle{grid-column:1;grid-row:1;font-size:14px;font-weight:500;line-height:20px;color:var(--dsw-alias-label-primary);transition:color .3s cubic-bezier(.32,.72,0,1)}.sGenSubCard:hover .sGenSubCardTitle{color:#d97757}.sGenSubCardDesc{grid-column:1;grid-row:2;font-size:12px;line-height:17px;color:var(--dsw-alias-label-secondary)}.sGenSubCardGo{grid-column:2;grid-row:1/3;justify-self:end;color:var(--dsw-alias-label-tertiary);font-size:16px;line-height:1;transition:transform .3s cubic-bezier(.32,.72,0,1),color .3s cubic-bezier(.32,.72,0,1)}.sGenSubCard:hover .sGenSubCardGo{transform:translateX(3px);color:#d97757}@media (prefers-reduced-motion:reduce){.sGenSubCard,.sGenSubCardTitle,.sGenSubCardGo{transition:none!important}.sGenSubCard:hover .sGenSubCardGo{transform:none}}";\n\t\tconst tagIdNest = "@deepseek-ai/dsh-client-ui-settings-general/nesting.module.css";\n\t\tif (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagIdNest) + "]") === null) {\n\t\t\tconst tag = document.createElement("style");\n\t\t\ttag.dataset.plugin = "@deepseek-ai/dsh-client-ui-settings-general";\n\t\t\ttag.dataset.pluginCss = tagIdNest;\n\t\t\ttag.textContent = cssNest;\n\t\t\tdocument.head.appendChild(tag);\n\t\t}\n'
  const ROOTVAR_ANCHOR = '\t\tvar SettingsRoot_module_css_default = {'
  const GENREG_OLD = 'label: () => t("general.nav"),\n\t\t\t\tlocale: NS,\n\t\t\t\tchildren: { "settings.general.item": {'
  const GENREG_NEW = 'label: () => t("general.nav"),\n\t\t\t\tlocale: NS,\n\t\t\t\tinject: () => ({ t }),\n\t\t\t\tchildren: { "settings.general.item": {'
  const BASICS_REG_OLD = '\t\t\t}, GeneralSection));'
  const BASICS_REG_NEW = '\t\t\t}, GeneralSection));'
  // rc.x 缩进漂移(rc.2=内部8tab / rc.5=7tab):整块用缩进无关正则捕获,重打为固定7tab形态
  const ROWS_RE = /rows = ctx\.slots\.entries\("settings\.section"\)\.map\(\(e\) => \(\{\n\t+\/\* v8 ignore next[^\n]*?\*\/\n\t+id: e\.options\.id \?\? "",\n\t+order: e\.options\.order \?\? 0,\n\t+label: \(0, _deepseek_ai_dsh_client_ui_slots\.resolveSlotLabel\)\(e\.options\.label\) \?\? ""\n\t+\}\)\)\.sort\(\(a, b\) => a\.order - b\.order\);/
  const ROWS_NEW = 'rows = (() => {\n\t\t\t\t\t\t\t// [K2a v4] 二级页面:三个顶层入口从导航隐藏(仅经 general 下子行可达);\n\t\t\t\t\t\t\t// 基础设置子行复用 general 条目(sub:basics + show 标记),无独立账本条目。\n\t\t\t\t\t\t\tconst HIDE_TOP = ["agency-agents", "config-manager", "vision-router"];\n\t\t\t\t\t\t\tconst CHILD_IDS = ["basics", "agency-agents", "config-manager", "vision-router"];\n\t\t\t\t\t\t\tconst all = ctx.slots.entries("settings.section");\n\t\t\t\t\t\t\tconst flat = all.filter((e) => !HIDE_TOP.includes(e.options.id)).map((e) => ({\n\t\t\t\t\t\t\t\tid: e.options.id ?? "",\n\t\t\t\t\t\t\t\torder: e.options.order ?? 0,\n\t\t\t\t\t\t\t\tlabel: (0, _deepseek_ai_dsh_client_ui_slots.resolveSlotLabel)(e.options.label) ?? ""\n\t\t\t\t\t\t\t})).sort((a, b) => a.order - b.order);\n\t\t\t\t\t\t\tconst childRows = CHILD_IDS.map((id) => {\n\t\t\t\t\t\t\t\tif (id === "basics") return { id: "sub:basics", order: 0, label: t("sub.basics"), child: true };\n\t\t\t\t\t\t\t\tconst e = all.find((cand) => cand.options.id === id);\n\t\t\t\t\t\t\t\treturn { id: "sub:" + id, order: 0, label: e ? ((0, _deepseek_ai_dsh_client_ui_slots.resolveSlotLabel)(e.options.label) ?? "") : id, child: true };\n\t\t\t\t\t\t\t});\n\t\t\t\t\t\t\tconst top = [];\n\t\t\t\t\t\t\tlet attached = false;\n\t\t\t\t\t\t\tfor (const row of flat) {\n\t\t\t\t\t\t\t\ttop.push(row);\n\t\t\t\t\t\t\t\tif (!attached && row.id === "general") {\n\t\t\t\t\t\t\t\t\tfor (const child of childRows) top.push(child);\n\t\t\t\t\t\t\t\t\tattached = true;\n\t\t\t\t\t\t\t\t}\n\t\t\t\t\t\t\t}\n\t\t\t\t\t\t\tif (!attached && childRows.length > 0) for (const child of childRows) top.push(child);\n\t\t\t\t\t\t\treturn top;\n\t\t\t\t\t\t})();'
  const NAVCELL_OLD = 'className: clsx(SettingsRoot_module_css_default.navCell, row.id === active && SettingsRoot_module_css_default.active),'
  const NAVCELL_NEW = 'className: clsx(SettingsRoot_module_css_default.navCell, row.id === active && SettingsRoot_module_css_default.active),\n\t\t\t\t\t\t\t\t"data-dsh-sub": row.child === true ? "true" : void 0,'
  const SEL_OLD = 'renderSlot("settings.section", { close: onClose }, { only: active })'
  const SEL_NEW = 'renderSlot("settings.section", { close: onClose, select: onSelect, show: active === "sub:basics" ? "basics" : void 0 }, { only: active === "sub:basics" ? "general" : active.indexOf("sub:") === 0 ? active.slice(4) : active })'

  const roots = []
  const npxCache = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'npm-cache', '_npx')
  if (fs.existsSync(npxCache)) {
    for (const h of fs.readdirSync(npxCache)) {
      roots.push(path.join(npxCache, h, 'node_modules', '@deepseek-ai', 'dsh-client-ui-settings-general', 'lib', 'client.js'))
    }
  }
  // devlink 层(本地仓 junction):local 轨 / 仓库构建产物走这里
  roots.push(path.join(os.homedir(), '.dsh', 'profiles', 'node_modules', '@deepseek-ai', 'dsh-client-ui-settings-general', 'lib', 'client.js'))

  for (const p of roots) {
    if (!fs.existsSync(p)) continue
    const pkgDir = path.dirname(path.dirname(p))
    const ver = (() => { try { return JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8')).version } catch { return '?' } })()
    const label = 'general-nest/' + pkgDir.split(path.sep).slice(-2).join('/') + '/client.js'
    const head = fs.readFileSync(p, 'utf8')
    // 锚点不适配的版本(rc 更早/更晚变体):安全跳过,不建 bak 不判失败。
    // [v5 2026-08-29] 旧修订升级通道:v4 之前的旧 [K](如 08-27 三卡横排版)同样占用
    // sGenSubGrid 但缺 v4 指纹(sub:basics)——按旧逻辑判「已是补丁态」会永久卡死在旧
    // 结构(复现根因:旧版占坑后 v4 只成功打在官方 npx 副本,切本地轨后本地副本永远
    // already;无哨兵走漂移刷新也会因对旧补丁内容重打锚点失配而 FAIL 保盘)。
    // 处置:有 bak → 恢复 pristine 落回正常重打;无 bak → 显式 FAIL 引导手动恢复。
    if (!head.includes(ZH_OLD) || !head.includes(GS_OLD)) {
      if (head.includes('sGenSubGrid') && head.includes('sub:basics')) {
        results.push({ file: label, ok: true, already: true, version: ver })
        continue
      }
      if (head.includes('sGenSubGrid')) {
        const staleBak = p + '.bak-nest-skin'
        if (fs.existsSync(staleBak)) {
          fs.copyFileSync(staleBak, p)
          results.push({ file: label, ok: true, refreshed: true, version: ver })
          // head 仍持旧内容,但下方 rewriteFresh 会重读盘上的 pristine 再打
        } else {
          results.push({ file: label, ok: false, failures: [label + ': 旧修订补丁态且缺 bak,拒绝盲改,请手动恢复'] })
          continue
        }
      } else {
        results.push({ file: label, ok: true, skipped: true, version: ver })
        continue
      }
    }
    const { rep, rex, failures } = makeCtx(label)
    const apply = (c) => {
      c = rep(c, ZH_OLD, ZH_NEW, 1, 'zh-sub-keys')
      c = rep(c, EN_OLD, EN_NEW, 1, 'en-sub-keys')
      c = rep(c, GS_OLD, GS_NEW, 1, 'general-section')
      c = rep(c, ROOTVAR_ANCHOR, CSSNEST_INJECT + ROOTVAR_ANCHOR, 1, 'nest-css')
      c = rep(c, GENREG_OLD, GENREG_NEW, 1, 'general-inject-t')
      c = rep(c, BASICS_REG_OLD, BASICS_REG_NEW, 1, 'basics-entry')
      c = rex(c, ROWS_RE, ROWS_NEW, 1, 'rows-nest')
      c = rep(c, NAVCELL_OLD, NAVCELL_NEW, 1, 'nav-sub-attr')
      c = rep(c, SEL_OLD, SEL_NEW, 1, 'select-passthrough')
      return c
    }
    results.push({ ...rewriteFresh(p, '.bak-nest-skin', apply, failures, PATCH_MARK), version: ver })
  }
  return results
}

// ---- [L] dsh-mobile-glass SW 导航策略 network-first(2026-08-27,问题111) ----
//       症状: 插件/核心文件热改后,壳窗口与浏览器「重启 dsh/普通刷新」仍跑旧 UI——
//       SW 对导航 stale-while-revalidate 立即回旧 HTML 壳,旧壳钉住旧 ?rev 模块,
//       需要刷两次才见新内容;桌面壳 reloadIgnoringCache 也被 SW 接管绕不开。
//       修复: 导航改 network-first(在线直连,失败回落缓存→离线页);sw.js 字节变化
//       触发已注册 SW 自动更新(updateViaCache:'none' + skipWaiting + clients.claim
//       均已具备),一次重载后所有窗口永久获得「一次刷新即见最新」。
function patchMobileGlassSw() {
  const p = path.join(PLUGINS, 'dsh-mobile-glass', 'lib', 'index.js')
  if (!fs.existsSync(p)) return [{ file: 'mobile-glass/lib/index.js', missing: true }]
  const ver = JSON.parse(fs.readFileSync(path.join(PLUGINS, 'dsh-mobile-glass', 'package.json'), 'utf8')).version
  const { rep, failures } = makeCtx('mobile-glass/lib/index.js')
  const OLD_NAV = [
    '  "    event.respondWith(",',
    '  "      caches.open(CACHE).then(function (cache) {",',
    '  "        return cache.match(req).then(function (cached) {",',
    '  "          var network = fetch(req).then(function (res) {",',
    '  "            if (res && res.ok) cache.put(req, res.clone());",',
    '  "            return res;",',
    '  "          }).catch(function () { return null; });",',
    '  "          if (cached) {",',
    '  "            network.then(function () {});",',
    '  "            return cached;",',
    '  "          }",',
    '  "          return network.then(function (res) {",',
    '  "            return res || caches.match(\'/offline\');",',
    '  "          });",',
    '  "        });",',
    '  "      })",',
    '  "    );",',
  ].join('\r\n')
  const NEW_NAV = [
    '  "    event.respondWith(",',
    '  "      fetch(req).then(function (res) {",',
    '  "        if (res && res.ok) caches.open(CACHE).then(function (cache) { cache.put(req, res.clone()); });",',
    '  "        return res;",',
    '  "      }).catch(function () {",',
    '  "        return caches.open(CACHE).then(function (cache) { return cache.match(req); }).then(function (cached) { return cached || caches.match(\'/offline\'); });",',
    '  "      })",',
    '  "    );",',
  ].join('\r\n')
  const apply = (c) => rep(c, OLD_NAV, NEW_NAV, 1, 'sw-nav-netfirst')
  return [{ ...rewrite(p, '.bak-sw-netfirst', apply, failures), version: ver }]
}

// ---- [M] dsh-agent-teams 活动面板坞进 better-sidebar(2026-08-28,用户需求;方案同上游 issue #43) ----
//       浮窗(shell.overlay Panel)移除 → 聊天列不再被 docked 面板挤压(padding-right 420px);
//       ActivityPanel 经 variant="sidebar" 形态注册为 ctx.betterSidebar tab(单实例、常驻展开、
//       填充 tab 容器、无折叠徽章/关闭/dock 控件、不写 data-agent-teams-panel-open);
//       会话卡保留,其「打开活动面板」事件(agent-teams:open-panel)路由到 openTab。
//       依赖: better-sidebar 在场——M1 经 inject 硬声明该服务(问题51 守卫;声明同时保证
//       服务晚加载时 fiber 等待,tab 注册时序安全)。若日后卸载 better-sidebar,
//       本插件会因服务缺失而 pending——需删本段重放回滚。
function patchAgentTeamsTab() {
  const dir = path.join(PLUGINS, '@nanmicoder', 'dsh-agent-teams')
  if (!fs.existsSync(dir)) return [{ file: 'agent-teams', missing: true }]
  const ver = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).version
  const p = path.join(dir, 'lib', 'client.js')
  if (!fs.existsSync(p)) return [{ file: 'agent-teams/client.js', missing: true }]
  const { rep, failures } = makeCtx('agent-teams/client.js')
  const apply = (c) => {
    // M1 inject 声明 betterSidebar 服务
    c = rep(c,
      '\t\t\t"locale",\n\t\t\t"modelDirectories"\n\t\t];',
      '\t\t\t"locale",\n\t\t\t"modelDirectories",\n\t\t\t"betterSidebar"\n\t\t];',
      1, 'inject-bs')
    // M2 Panel 透传 variant
    c = rep(c,
      '\t\t\tconst Panel = ({ t }) => (0, react_jsx_runtime.jsx)(ActivityPanel, {\n\t\t\t\tsessionsList: ctx.sessions.list,\n\t\t\t\tmodelDirectories: ctx.modelDirectories,\n\t\t\t\topenMember,\n\t\t\t\tt\n\t\t\t});',
      '\t\t\tconst Panel = ({ t, variant }) => (0, react_jsx_runtime.jsx)(ActivityPanel, {\n\t\t\t\tsessionsList: ctx.sessions.list,\n\t\t\t\tmodelDirectories: ctx.modelDirectories,\n\t\t\t\topenMember,\n\t\t\t\tt,\n\t\t\t\tvariant\n\t\t\t});',
      1, 'panel-variant-pass')
    // M3 shell.overlay 浮窗 → better-sidebar tab 注册 + open-panel 事件路由
    c = rep(c,
      '\t\t\tctx.slots.inject("shell.overlay", () => ctx.slots.register({\n\t\t\t\tname: "shell.overlay",\n\t\t\t\tid: "agent-teams-activity",\n\t\t\t\torder: 80,\n\t\t\t\tlabel: "AgentTeams activity",\n\t\t\t\tlocale: AGENT_TEAMS_LOCALE_NAMESPACE\n\t\t\t}, Panel));',
      '\t\t\t// [M] 浮窗移除,面板注册为 better-sidebar tab(方案同上游 issue #43)\n\t\t\tctx.effect(() => ctx.betterSidebar.registerTab({\n\t\t\t\tid: "agent-teams:activity",\n\t\t\t\ttitle: "AgentTeams",\n\t\t\t\torder: 60,\n\t\t\t\tsingle: true,\n\t\t\t\ticon: (size) => (0, react_jsx_runtime.jsx)("svg", { xmlns: "http://www.w3.org/2000/svg", width: size, height: size, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", "stroke-width": 1.4, "stroke-linecap": "round", "stroke-linejoin": "round", children: [(0, react_jsx_runtime.jsx)("circle", { cx: "5.2", cy: "4.6", r: "2.3" }), (0, react_jsx_runtime.jsx)("path", { d: "M1.7 13.3c.5-2.1 1.9-3.2 3.5-3.2s3 1.1 3.5 3.2" }), (0, react_jsx_runtime.jsx)("circle", { cx: "11.2", cy: "5.6", r: "1.9" }), (0, react_jsx_runtime.jsx)("path", { d: "M10.4 9.6c1.8.1 3.1 1.2 3.7 3.3" })] }),\n\t\t\t\tcomponent: () => Panel({ t: ctx.locale.bind(AGENT_TEAMS_LOCALE_NAMESPACE), variant: "sidebar" })\n\t\t\t}), "agent-teams: sidebar tab");\n\t\t\t// [M] 会话卡「打开活动面板」按钮 → 路由到侧边栏 tab(浮窗已移除)\n\t\t\tctx.effect(() => {\n\t\t\t\tconst onOpenPanel = () => {\n\t\t\t\t\ttry { ctx.betterSidebar.openTab({ type: "agent-teams:activity" }) } catch (e) {}\n\t\t\t\t};\n\t\t\t\twindow.addEventListener("agent-teams:open-panel", onOpenPanel);\n\t\t\t\treturn () => window.removeEventListener("agent-teams:open-panel", onOpenPanel);\n\t\t\t}, "agent-teams: open-panel router");',
      1, 'overlay-to-tab')
    // M4 ActivityPanel 签名接收 variant
    c = rep(c,
      'function ActivityPanel({ sessionsList, modelDirectories, openMember, t }) {',
      'function ActivityPanel({ sessionsList, modelDirectories, openMember, t, variant }) {',
      1, 'panel-sig')
    // M5 sidebar 形态恒展开(无折叠徽章)
    c = rep(c,
      'const expanded = activityPanelExpandedForSession(open, openOwner, current);',
      'const expanded = variant === "sidebar" ? true : activityPanelExpandedForSession(open, openOwner, current);',
      1, 'panel-expanded')
    // M6 sidebar 形态不写 data-agent-teams-panel-open(聊天列不让位)、不设 shift 变量
    c = rep(c,
      '\t\t\t(0, react.useLayoutEffect)(() => {\n\t\t\t\tconst root = document.documentElement;\n\t\t\t\tif (expanded && geometry.mode === "docked" && !compact) {',
      '\t\t\t(0, react.useLayoutEffect)(() => {\n\t\t\t\tif (variant === "sidebar") return;\n\t\t\t\tconst root = document.documentElement;\n\t\t\t\tif (expanded && geometry.mode === "docked" && !compact) {',
      1, 'panel-shift-skip')
    // M7 sidebar 形态面板尺寸:填充 tab 容器,忽略浮窗几何(inline 无 transform)
    c = rep(c,
      '\t\t\tconst panelStyle = {\n\t\t\t\twidth: geometry.width,\n\t\t\t\theight: autoHeight ? "auto" : geometry.height,\n\t\t\t\tmaxHeight: panelMaximumHeight(geometry, bounds),\n\t\t\t\ttransform: `translate3d(${geometry.x}px, ${geometry.y}px, 0)`\n\t\t\t};',
      '\t\t\tconst panelStyle = variant === "sidebar" ? { width: "100%", height: "100%" } : {\n\t\t\t\twidth: geometry.width,\n\t\t\t\theight: autoHeight ? "auto" : geometry.height,\n\t\t\t\tmaxHeight: panelMaximumHeight(geometry, bounds),\n\t\t\t\ttransform: `translate3d(${geometry.x}px, ${geometry.y}px, 0)`\n\t\t\t};',
      1, 'panel-style')
    // M8 aside 挂 data-variant(CSS 钩子;属性选择器,hash 类名免疫)
    c = rep(c,
      '\t\t\t\t"data-agent-teams-activity": true,',
      '\t\t\t\t"data-agent-teams-activity": true,\n\t\t\t\t"data-variant": variant,',
      1, 'panel-attr')
    // M9 sidebar 形态 CSS:静态填充 + 关浮窗专属控件(属性选择器为主,Q6vcTq hash 漂移教训)
    c = rep(c,
      '\t\tvar ActivityPanel_module_css_default = {',
      '\t\tconst cssSidebarVariant = "[data-agent-teams-activity][data-variant=sidebar]{position:relative!important;top:auto!important;left:auto!important;transform:none!important;width:100%!important;height:100%!important;max-height:none!important;border:none!important;border-radius:0!important;box-shadow:none!important;animation:none!important;backdrop-filter:none!important;background:var(--dsw-alias-bg-layer-1,#fff)!important}[data-agent-teams-activity][data-variant=sidebar] [data-control=collapse],[data-agent-teams-activity][data-variant=sidebar] [data-control=dock]{display:none!important}";\n\t\tconst tagIdSidebarVariant = "@nanmicoder/dsh-agent-teams/sidebar-variant.css";\n\t\tif (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagIdSidebarVariant) + "]") === null) {\n\t\t\tconst tagSidebar = document.createElement("style");\n\t\t\ttagSidebar.dataset.plugin = "@nanmicoder/dsh-agent-teams";\n\t\t\ttagSidebar.dataset.pluginCss = tagIdSidebarVariant;\n\t\t\ttagSidebar.textContent = cssSidebarVariant;\n\t\t\tdocument.head.appendChild(tagSidebar);\n\t\t}\n\t\tvar ActivityPanel_module_css_default = {',
      1, 'sidebar-css')
    return c
  }
  return [{ ...rewrite(p, '.bak-at-tab', apply, failures), version: ver }]
}

// ---- 入口 ----
function replayAll(log = () => {}) {
  const out = { ok: true, items: [] }
  for (const r of [...patchBetterSidebar(), ...patchNodeNav(), ...patchConversation(), ...patchEntrySmooth(), ...patchDshmarket(), ...patchSettingsInfoArch(), ...patchGitGraph(), ...patchPresets(), ...patchProfileSidebarDedup(), ...patchTurnReview(), ...patchJoiTheme(), ...patchMobileGlassSw(), ...patchSettingsNest(), ...patchAgentTeamsTab()]) {
    if (r.missing) { log(`[patches] ${r.file}: 未安装,跳过`); continue }
    out.items.push(r)
    if (r.ok) log(`[patches] ${r.file}@${r.version}: ${r.skipped ? '锚点不适配,安全跳过' : r.already ? '已是补丁态' : '已恢复本地定制'}`)
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
