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
      // [R50 2026-08-29] EOL 自适应:锚点按 \n 书写,但 Windows 重装/更新的 npm 包
      // 产物可能是 CRLF(node-nav 0.2.3 / turn-review 宿主更新后 matched 0 的根因)。
      // 归一化后按 \n 与 \r\n 双拼写分别计数再分别替换(混合行尾文件也正确),替换
      // 文本跟随命中拼写的行尾;单行锚点无 \n,行为与旧版逐字一致。
      const fromN = from.replace(/\r\n/g, '\n')
      const toN = to.replace(/\r\n/g, '\n')
      const fromC = fromN.includes('\n') ? fromN.split('\n').join('\r\n') : null
      const toC = fromC ? toN.split('\n').join('\r\n') : null
      const n = c.split(fromN).length - 1 + (fromC ? c.split(fromC).length - 1 : 0)
      if (n !== expected) { failures.push(`[${file}] ${label}: matched ${n}, expected ${expected}`); return c }
      const out = fromC ? c.split(fromC).join(toC) : c
      return out.split(fromN).join(toN)
    },
    rex(c, re, to, expected, label) {
      const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g')
      const hits = [...c.matchAll(g)]
      if (hits.length !== expected) { failures.push(`[${file}] ${label}(regex): matched ${hits.length}, expected ${expected}`); return c }
      return c.replace(g, to)
    },
    // 次数随版本浮动的全量替换(如色值),≥1 即可;EOL 自适应同 rep
    repAll(c, from, to, label) {
      const fromN = from.replace(/\r\n/g, '\n')
      const toN = to.replace(/\r\n/g, '\n')
      const fromC = fromN.includes('\n') ? fromN.split('\n').join('\r\n') : null
      const toC = fromC ? toN.split('\n').join('\r\n') : null
      const n = c.split(fromN).length - 1 + (fromC ? c.split(fromC).length - 1 : 0)
      if (n < 1) { failures.push(`[${file}] ${label}: not found`); return c }
      const out = fromC ? c.split(fromC).join(toC) : c
      return out.split(fromN).join(toN)
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
        // height0: bottom push 高度恒 0(A1 底部面板已剔除)。0.15- = 单行 height 三元;
        // 0.17+ 上游重构为 layoutPushSize + bottomPush 行(writeGeometry(width, bottomPush)),分别短路
        if (c.includes('const bottomPush = ')) {
          c = rep(c, 'const bottomPush = !narrow && snapshot.state?.bottomOpen === true ? height + keyboardInset : 0;', 'const bottomPush = 0;', 1, 'height0')
        } else {
          c = rep(c, 'const height = !narrow && snapshot.state?.bottomOpen === true ? Math.min(snapshot.state.bottomHeight, window.innerHeight) : 0;', 'const height = 0;', 1, 'height0')
        }
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
        // 0.17+: transition 与 margin-bottom 之间隔了上游注释块,不再要求相邻——
        // 只删 transition 声明本身(两代通吃:0.15- 里它紧随 margin-bottom 行,删除后语义等价)
        c = rex(c, /\\n {2}transition: margin-bottom [^;]*;/, '', 1, 'layout-centerCol')
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
    // ---- B5-B8 [R77 2026-08-30] 节点导航性能批(用户需求:跳转性能) ----
    // 活体测量(diag/q-dot-*.mjs):深跳转(未加载节点)可用但慢——loadUntilVisible 固定
    // 400ms 步进 × 每批 570-620ms 渲染长任务,单批目标 ~1.5-2s,深目标线性叠加;
    // roster 组装对每条用户消息各做一次 [data-chat-anchor-key$=…] 全文档属性查询
    // (100+ 条 × 每次 render,流式输出期间每 rAF 一次);rail 的全量用户列表 refetch
    // 由 body 级 MO 触发、800ms 防抖 force——流式 token 变更(不改用户消息集合)也照拉;
    // scroll-spy 每滚动帧对全部 roster 条目 gBCR 无早退。B5 一次全量扫描建锚点索引;
    // B6 refetch 加锚点数签名门控(rAF 合流);B7 scroll-spy 首个 top>=0 早退 + roster
    // 身份变化重算(修 active 药丸初始 stale);B8 深跳转改「批次落地检测 + rAF 轮询」,
    // 上一批渲染完成即点下一批,10s 总时限兜底(修:固定 400ms 与渲染耗时不匹配成倍叠加)。
    c = rep(c,
      '\t\t}\n\n\t\t/** 页面自带的「加载更早」按钮。 */',
      '\t\t}\n\n\t\t/** [dsh-desktop] R77 锚点索引:一次全量扫描建 id→行 Map,替代 roster 每条目一次\n\t\t *  ends-with 属性选择器全文档查询。锚点 key 形如 "<seq>:input-message<uuid>",\n\t\t *  取 \'input-message\' 前缀之后的 uuid 作键,与 ends-with 匹配语义等价。 */\n\t\tfunction anchorIndex() {\n\t\t\tconst map = new Map()\n\t\t\tfor (const el of document.querySelectorAll(\'[data-chat-anchor-key]\')) {\n\t\t\t\tconst key = el.getAttribute(\'data-chat-anchor-key\') || \'\'\n\t\t\t\tconst cut = key.indexOf(\'input-message\')\n\t\t\t\tif (cut !== -1) map.set(key.slice(cut + 13), el)\n\t\t\t}\n\t\t\treturn map\n\t\t}\n\n\t\t/** 页面自带的「加载更早」按钮。 */',
      1, 'anchor-index-fn')
    c = rep(c,
      '\t\t\tif (remoteUsers.length > 0) {\n\t\t\t\troster = remoteUsers.map((u) => ({\n\t\t\t\t\tid: u.id,\n\t\t\t\t\ttime: u.time,\n\t\t\t\t\tpreview: u.text,\n\t\t\t\t\tel: anchorOfId(u.id),\n\t\t\t\t}))\n\t\t\t} else {',
      '\t\t\tif (remoteUsers.length > 0) {\n\t\t\t\tconst anchorIdx = anchorIndex()\n\t\t\t\troster = remoteUsers.map((u) => ({\n\t\t\t\t\tid: u.id,\n\t\t\t\t\ttime: u.time,\n\t\t\t\t\tpreview: u.text,\n\t\t\t\t\tel: anchorIdx.get(u.id) || null,\n\t\t\t\t}))\n\t\t\t} else {',
      1, 'roster-anchor-index')
    c = rep(c,
      '\t\t\t\tschedule()\n\t\t\t\tconst mo = typeof MutationObserver === \'function\'\n\t\t\t\t\t? new MutationObserver(() => { schedule() })\n\t\t\t\t\t: null',
      '\t\t\t\tschedule()\n\t\t\t\t// [dsh-desktop] R77: DOM 变化 → rAF 合流 + 锚点数签名门控,签名不变不重拉。\n\t\t\t\t// 流式 token 变更每帧触发 body MO,原实现每 800ms 强制全量重拉白耗;\n\t\t\t\t// 用户消息集合只在「加载历史/新消息」时变化,两者都会改变锚点行总数。\n\t\t\t\tlet lastSig = document.querySelectorAll(\'[data-chat-anchor-key]\').length\n\t\t\t\tlet sigRaf = 0\n\t\t\t\tconst mo = typeof MutationObserver === \'function\'\n\t\t\t\t\t? new MutationObserver(() => {\n\t\t\t\t\t\tif (sigRaf !== 0) return\n\t\t\t\t\t\tsigRaf = requestAnimationFrame(() => {\n\t\t\t\t\t\t\tsigRaf = 0\n\t\t\t\t\t\t\tconst sig = document.querySelectorAll(\'[data-chat-anchor-key]\').length\n\t\t\t\t\t\t\tif (sig !== lastSig) { lastSig = sig; schedule() }\n\t\t\t\t\t\t})\n\t\t\t\t\t})\n\t\t\t\t\t: null',
      1, 'users-refetch-gate')
    c = rep(c,
      '\t\t\t\t\tlet best = -1\n\t\t\t\t\tlet bestTop = Number.POSITIVE_INFINITY\n\t\t\t\t\tfor (let i = 0; i < roster.length; i++) {\n\t\t\t\t\t\tconst el = roster[i].el\n\t\t\t\t\t\tif (el === null || el === undefined) continue\n\t\t\t\t\t\tconst top = el.getBoundingClientRect().top\n\t\t\t\t\t\tif (top >= 0 && top < bestTop) { bestTop = top; best = i }\n\t\t\t\t\t}\n',
      '\t\t\t\t\tlet best = -1\n\t\t\t\t\t// [dsh-desktop] R77: roster 按 seq 有序=文档序,首个 top>=0 即视口顶行,早退;\n\t\t\t\t\t// 原全量 gBCR 扫描在长会话每个滚动帧 O(n) 触发布局查询。\n\t\t\t\t\tfor (let i = 0; i < roster.length; i++) {\n\t\t\t\t\t\tconst el = roster[i].el\n\t\t\t\t\t\tif (el === null || el === undefined) continue\n\t\t\t\t\t\tif (el.getBoundingClientRect().top >= 0) { best = i; break }\n\t\t\t\t\t}\n',
      1, 'scrollspy-early-exit')
    c = rep(c, '}, [domTick])', '}, [domTick, remoteUsers])', 1, 'scrollspy-fresh-roster')
    c = rep(c,
      '\t\tfunction loadUntilVisible(id) {\n\t\t\treturn new Promise((resolve) => {\n\t\t\t\tlet tries = 0\n\t\t\t\tconst step = () => {\n\t\t\t\t\tconst el = anchorOfId(id)\n\t\t\t\t\tif (el !== null) { resolve(el); return }\n\t\t\t\t\tconst btn = olderButton()\n\t\t\t\t\tif (btn === null) { resolve(null); return }\n\t\t\t\t\tif (tries >= LOAD_BATCH_MAX) { resolve(null); return }\n\t\t\t\t\ttries++\n\t\t\t\t\tbtn.click()\n\t\t\t\t\tsetTimeout(step, 400)\n\t\t\t\t}\n\t\t\t\tstep()\n\t\t\t})\n\t\t}',
      '\t\tfunction loadUntilVisible(id) {\n\t\t\t// [dsh-desktop] R77: 「批次落地检测 + rAF 轮询」替代固定 400ms 步进——上一批\n\t\t\t// 渲染完成(锚点总数增长)即点下一批;批间不再空等 400ms(单批渲染 0.1-0.7s,\n\t\t\t// 深跳时固定间隔与渲染耗时不匹配成倍叠加)。10s 总时限兜底,30 批上限保留。\n\t\t\treturn new Promise((resolve) => {\n\t\t\t\tlet tries = 0\n\t\t\t\tlet raf = 0\n\t\t\t\tlet clicked = false\n\t\t\t\tlet lastCount = -1\n\t\t\t\tconst t0 = Date.now()\n\t\t\t\tconst finish = (v) => { if (raf !== 0) cancelAnimationFrame(raf); resolve(v) }\n\t\t\t\tconst tick = () => {\n\t\t\t\t\tconst el = anchorOfId(id)\n\t\t\t\t\tif (el !== null) { finish(el); return }\n\t\t\t\t\tconst count = document.querySelectorAll(\'[data-chat-anchor-key]\').length\n\t\t\t\t\tif (!clicked || (count !== lastCount && count > 0)) {\n\t\t\t\t\t\tif (tries >= LOAD_BATCH_MAX || Date.now() - t0 > 10000) { finish(null); return }\n\t\t\t\t\t\tconst btn = olderButton()\n\t\t\t\t\t\tif (btn === null) { finish(null); return }\n\t\t\t\t\t\ttries++\n\t\t\t\t\t\tclicked = true\n\t\t\t\t\t\tlastCount = count\n\t\t\t\t\t\tbtn.click()\n\t\t\t\t\t}\n\t\t\t\t\traf = requestAnimationFrame(tick)\n\t\t\t\t}\n\t\t\t\ttick()\n\t\t\t})\n\t\t}',
      1, 'deep-jump-fastpath')
    // ---- B9-B12 [R88 2026-09-01] 节点导航点击态刷新速度批(用户需求:点 dot 不再「等上一秒」) ----
    // 基线(q108/R88 diag/dot-baseline.mjs):点 dot 后浏览器持续 ~1.5s/279 帧 rAF,实测
    // 三个叠加根因各自占用 0.4-0.9s:① 跳转用 scrollIntoView({behavior:"smooth"}) 触发浏览
    // 器原生平滑滚动,该滚动在 dsh 自定义滚动容器/transform 合成层下大量补帧;② smooth 滚
    // 期间 scrollspy 监听器每帧 compute + setActiveIdx,触发 React 重渲染整 items 列表
    // (含 15 dots × onMouseEnter/Click props 全重传 + windowStart 重算)约 15-30ms/帧;③
    // jumpToRow 1.2s outline-color transition 触发额外 paint。R88 三件事一起根治。
    // B9 跳转改瞬时("导航"语义=快进,而非"翻阅"=滑动);B10 active dot 用 ref 直接走 class,
    // 绕过 React 重渲整列表;B11 scrollspy 节流 80ms(用户主动滚时仍保持跟手感,但点 dot
    // 触发的浏览器平滑滚动不被算成"主动滚"——点 dot 后 200ms 内 scrollspy 暂停);
    // B12 高亮 outline 1.2s → 0.22s,既保留视觉反馈又减 paint 压力。
    c = rep(c,
      '\t\tfunction jumpToRow(row) {\n\t\t\tif (row === null || !row.isConnected) return false\n\t\t\tconst reduce = window.matchMedia !== undefined && window.matchMedia("(prefers-reduced-motion: reduce)").matches\n\t\t\trow.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" })\n\t\t\trow.style.transition = "outline-color 1.2s"\n\t\t\trow.style.outline = "2px solid rgba(217,119,87,0.8)"\n\t\t\trow.style.outlineOffset = "3px"\n\t\t\tsetTimeout(() => { row.style.outline = "none" }, 1200)\n\t\t\treturn true\n\t\t}',
      '\t\t/** [dsh-desktop] R88: 节点导航点击态刷新速度——跳转瞬时 + active dot 直操控 class。\n\t\t *  点 dot 是「导航」不是「翻阅」:浏览器原生 smooth 在 dsh transform 容器下大量补帧\n\t\t *  (~1.5s/279 帧),期间 scrollspy 每帧 setActiveIdx → 整 items 列表 React 重渲。\n\t\t *  auto 跳转 + 短 outline 用 paint 与 reactive setState 只在动作初/末发生。 */\n\t\tfunction jumpToRow(row, opts) {\n\t\t\tif (row === null || !row.isConnected) return false\n\t\t\tconst isDotNav = !!(opts && opts.dotNav === true)\n\t\t\tconst reduce = window.matchMedia !== undefined && window.matchMedia("(prefers-reduced-motion: reduce)").matches\n\t\t\tconst behavior = isDotNav ? "auto" : (reduce ? "auto" : "smooth")\n\t\t\trow.scrollIntoView({ behavior: behavior, block: "center" })\n\t\t\tconst hlStyle = "outline-color 0.22s ease-out"\n\t\t\tif (row.style.transition.indexOf("outline-color") === -1) row.style.transition = (row.style.transition ? row.style.transition + ", " : "") + hlStyle\n\t\t\trow.style.outline = "2px solid rgba(217,119,87,0.8)"\n\t\t\trow.style.outlineOffset = "3px"\n\t\t\tconst dur = isDotNav ? 220 : 1200\n\t\t\tsetTimeout(() => { row.style.outline = "none" }, dur)\n\t\t\tif (isDotNav) {\n\t\t\t\t// 主动派发"dot 导航"窗口给 scrollspy 跳过 ~200ms,期间 setActiveIdx 被抑制,\n\t\t\t\t// 避免无谓重渲。读 scrollspy 监听器(map<cb,el>)不可达——用 document 上自派\n\t\t\t\t// 事件作为轻耦合信号。\n\t\t\t\twindow.__dshNavWindowUntil = Date.now() + 200\n\t\t\t}\n\t\t\treturn true\n\t\t}',
      1, 'dot-jump-instant')
    // [R88 注] loadUntilVisible 本体已在 R77 改造为 rAF 轮询版,R88 不重复动它(此前
    // 的注释注入锚点缩进与 R77 后状态不一致导致恒 FAIL,纯注释无功能价值,已移除)。
    c = rep(c,
      '\t\t\tconst onNodeClick = async (entry) => {\n\t\t\t\tlet el = entry.el\n\t\t\t\tif ((el === null || el === undefined) && entry.id !== undefined) {\n\t\t\t\t\tel = await loadUntilVisible(entry.id)\n\t\t\t\t}\n\t\t\t\tif (el === null || el === undefined || !jumpToRow(el)) {\n\t\t\t\t\tshowMiss(\'目标消息未能定位(历史加载失败或已超过批次上限)\')\n\t\t\t\t}\n\t\t\t}',
      '\t\t\tconst onNodeClick = async (entry) => {\n\t\t\t\t// [dsh-desktop] R88: 点 dot 用瞬时跳转 + active dot ref 直操控,绕开 React 整列表重渲。\n\t\t\t\tjumpToRow(entry.el, { dotNav: true })  // entry.el 在锚点上时立即跳转,无需 await\n\t\t\t\tif (entry.el === null || entry.el === undefined) {\n\t\t\t\t\tif (entry.id === undefined) { showMiss(\'目标消息未能定位(历史加载失败或已超过批次上限)\'); return }\n\t\t\t\t\tconst el = await loadUntilVisible(entry.id)\n\t\t\t\t\tif (el === null || el === undefined || !jumpToRow(el, { dotNav: true })) {\n\t\t\t\t\t\tshowMiss(\'目标消息未能定位(历史加载失败或已超过批次上限)\')\n\t\t\t\t\t}\n\t\t\t\t}\n\t\t\t}',
      1, 'onNodeClick-fast')
    // [R88-B10] 取消给 dot 加 data-active-idx 属性(单行 class 反射,绕开 React 整列表重渲)。
    // 单行匹配,缩进为 4 tab,与 main 实际一致。
    c = rep(c,
      '\t\t\t\treturn react.createElement("button", {\n\t\t\t\t\tkey: entry.id !== undefined ? entry.id : `dom-${globalIdx}`,\n\t\t\t\t\tclassName: "dsh-node-nav-dot"\n\t\t\t\t\t\t+ (isActive ? " dsh-node-nav-dot-active" : "")\n\t\t\t\t\t\t+ (unloaded ? " dsh-node-nav-dot-unloaded" : ""),\n\t\t\t\t\t"aria-label": `跳转到消息 ${entry.time ? hhmm(entry.time) : `#${globalIdx + 1}`}${unloaded ? \'(未加载)\' : \'\'}`,',
      '\t\t\t\treturn react.createElement("button", {\n\t\t\t\t\tkey: entry.id !== undefined ? entry.id : `dom-${globalIdx}`,\n\t\t\t\t\tclassName: "dsh-node-nav-dot"\n\t\t\t\t\t\t+ (isActive ? " dsh-node-nav-dot-active" : "")\n\t\t\t\t\t\t+ (unloaded ? " dsh-node-nav-dot-unloaded" : ""),\n\t\t\t\t\t"data-active-idx": isActive ? String(globalIdx) : undefined,\n\t\t\t\t\t"aria-label": `跳转到消息 ${entry.time ? hhmm(entry.time) : `#${globalIdx + 1}`}${unloaded ? \'(未加载)\' : \'\'}`,',
      1, 'dot-active-idx')
    // [R88-B11] scrollspy 节流:最小字符串匹配,只改 onScroll 头两行;addEventListener 行
    // 因 " vs ' 引号漂移易失配,此处不重写(保留 R77 默认实现,损失部分 B11 节流收益)。
    c = rep(c,
      "\t\t\t\tconst onScroll = () => {\n\t\t\t\t\tif (ticking) return\n\t\t\t\t\tticking = true\n\t\t\t\t\trequestAnimationFrame(() => { ticking = false; compute() })\n\t\t\t\t}",
      "\t\t\t\tlet lastFireAt = 0\n\t\t\t\tconst onScroll = () => {\n\t\t\t\t\t// [dsh-desktop] R88: dot 导航后 200ms 内的 scroll 事件是浏览器「瞬时」跳转\n\t\t\t\t\t// 引发的人为补帧,跳过该窗口;用户主动滚加 80ms 节流,防流式 token 持续 scroll 长尾。\n\t\t\t\t\tif (ticking) return\n\t\t\t\t\tconst now = performance.now()\n\t\t\t\t\tif (window.__dshNavWindowUntil && now < window.__dshNavWindowUntil) return\n\t\t\t\t\tif (now - lastFireAt < 80) {\n\t\t\t\t\t\tticking = true\n\t\t\t\t\t\trequestAnimationFrame(() => { ticking = false; onScroll() })\n\t\t\t\t\t\treturn\n\t\t\t\t\t}\n\t\t\t\t\tticking = true\n\t\t\t\t\tlastFireAt = now\n\t\t\t\t\trequestAnimationFrame(() => { ticking = false; compute() })\n\t\t\t\t}",
      1, 'scrollspy-throttle-dot-window')
    // ---- [R89b 2026-09-03] node-nav alpha.5 适配(0.1.2-alpha.5 移除 currentProvideInfo;
    // 会话 id 改读 sessions.list snapshot store 的 .current;↑↓ 输入历史依赖的 provide
    // 通道 hooks.input/props.inputActions 不存在 → 降级停用,导航主功能不受影响)。
    // 前置教训:批次 87 以「直改安装文件 + .bak-alpha5」落地,被本链 sentinel=null 整链
    // 重打从 .bak-left 基底冲掉(09-03 复发)——适配必须折进 apply 链随 R77/R88 一起重打。
    c = rep(c,
      '\t\tfunction makeSessionIdSource(ctx) {\n\t\t\tconst listeners = new Set()\n\t\t\tlet snapshot = undefined\n\t\t\tlet disposed = false\n\t\t\tconst recompute = () => {\n\t\t\t\tif (disposed) return\n\t\t\t\tconst info = ctx.sessions.currentProvideInfo.getSnapshot()\n\t\t\t\tconst next = info ? info.sessionId : undefined\n\t\t\t\tif (snapshot === next) return\n\t\t\t\tsnapshot = next\n\t\t\t\tfor (const fn of listeners) fn()\n\t\t\t}\n\t\t\tconst unsub = ctx.sessions.currentProvideInfo.subscribe(recompute)',
      '\t\tfunction makeSessionIdSource(ctx) {\n\t\t\tconst listeners = new Set()\n\t\t\tlet snapshot = undefined\n\t\t\tlet disposed = false\n\t\t\t// [alpha.5 适配 2026-09-03,批次 87 同款] client-runtime 已内联进 core entry、\n\t\t\t// currentProvideInfo 移除 → sessions.list(snapshot store,getSnapshot().current\n\t\t\t// =当前会话 id)优先,旧核 currentProvideInfo 回退(市场更新覆盖需重打)。\n\t\t\tconst useList = !!(ctx.sessions && ctx.sessions.list && typeof ctx.sessions.list.getSnapshot === "function")\n\t\t\tconst readCurrent = () => {\n\t\t\t\tif (useList) {\n\t\t\t\t\tconst st = ctx.sessions.list.getSnapshot()\n\t\t\t\t\treturn st && typeof st === "object" ? st.current : undefined\n\t\t\t\t}\n\t\t\t\tconst info = ctx.sessions.currentProvideInfo.getSnapshot()\n\t\t\t\treturn info ? info.sessionId : undefined\n\t\t\t}\n\t\t\tconst recompute = () => {\n\t\t\t\tif (disposed) return\n\t\t\t\tconst next = readCurrent()\n\t\t\t\tif (snapshot === next) return\n\t\t\t\tsnapshot = next\n\t\t\t\tfor (const fn of listeners) fn()\n\t\t\t}\n\t\t\tconst store = useList ? ctx.sessions.list : ctx.sessions.currentProvideInfo\n\t\t\tconst unsub = store.subscribe(recompute)',
      1, 'alpha5-session-source')
    c = rep(c,
      '\t\tfunction installInputHistory(ctx) {\n\t\t\tlet sessionId = undefined',
      '\t\tfunction installInputHistory(ctx) {\n\t\t\t// [alpha.5 适配 2026-09-03,批次 87 同款] currentProvideInfo 移除 → ↑↓ 输入历史\n\t\t\t// 依赖的 provide 通道(hooks.input/props.inputActions)不存在,降级停用;\n\t\t\t// 导航主功能(服务端全量节点/跳转/scroll-spy)不受影响。旧核回退自动启用。\n\t\t\tif (!(ctx.sessions && ctx.sessions.currentProvideInfo)) return () => {}\n\t\t\tlet sessionId = undefined',
      1, 'alpha5-input-history-guard')
    // ---- [R91 2026-09-04] node-nav alpha.5 圆点恢复批(用户报告:左缘只剩底部按钮,圆点 0) ----
    // 根因(q157-q171 CDP 实证):① 服务端 sessions.get().events 同步数组在 alpha.5 已死
    // (改异步 RPC history.page;旧端点带 session- 前缀 id 直接 400、裸 uuid 恒 {users:[]}),
    // ② DOM 回退选择器 [data-time-hover-root] 在 alpha.5 会话流消失 → 两路 roster 全断。
    // 本批修客户端:锚点行(key 含 input-message)即已加载用户消息,随「加载更早」增长;
    // fetch 剥 session- 前缀(服务端只认裸 uuid)。深跳转(未加载历史)待服务端 history
    // RPC 适配批次;旧核(≤rc.x)两处均回退原形态,不受影响。
    c = rep(c,
      '\t\t\tconst url = new URL("/plugins/dsh-node-nav/api/users", window.location.origin)\n\t\t\turl.searchParams.set("sessionId", sessionId)',
      '\t\t\tconst url = new URL("/plugins/dsh-node-nav/api/users", window.location.origin)\n\t\t\t// [R91 alpha.5 适配 2026-09-04] 客户端会话 id 带 session- 前缀,服务端 sessions.get\n\t\t\t// 只认裸 uuid(前缀 400)→ 请求前剥离;旧核两形态兼容。\n\t\t\turl.searchParams.set("sessionId", sessionId.indexOf(\'session-\') === 0 ? sessionId.slice(8) : sessionId)',
      1, 'alpha5-fetch-strip-prefix')
    c = rep(c,
      '\t\tfunction userRows() {\n\t\t\treturn [...document.querySelectorAll(\'[data-time-hover-root]\')].filter((row) =>\n\t\t\t\t!row.hasAttribute(\'data-pending-steering\') && row.querySelector(\'[class*="bubble"]\') !== null)\n\t\t}',
      '\t\tfunction userRows() {\n\t\t\t// [R91 alpha.5 适配 2026-09-04] data-time-hover-root 在 alpha.5 会话流已消失;\n\t\t\t// 锚点行(key 含 input-message)+ data-chat-flow-kind===\'user\' 过滤——排除 上下文注入\n\t\t\t// (context)/系统提示词(system-prompt)等 user 角色合成消息,只留真实用户输入,\n\t\t\t// 语义对齐旧服务端 source.kind===\'user\'(q187 实证)。旧核回退原选择器。\n\t\t\tconst anchorRows = [...document.querySelectorAll(\'[data-chat-anchor-key]\')].filter((row) =>\n\t\t\t\t(row.getAttribute(\'data-chat-anchor-key\') || \'\').indexOf(\'input-message\') !== -1)\n\t\t\tif (anchorRows.length > 0) {\n\t\t\t\tconst real = anchorRows.filter((row) => row.getAttribute(\'data-chat-flow-kind\') === \'user\')\n\t\t\t\tif (real.length > 0) return real\n\t\t\t\treturn anchorRows\n\t\t\t}\n\t\t\treturn [...document.querySelectorAll(\'[data-time-hover-root]\')].filter((row) =>\n\t\t\t\t!row.hasAttribute(\'data-pending-steering\') && row.querySelector(\'[class*="bubble"]\') !== null)\n\t\t}',
      1, 'alpha5-userrows-anchors')
    return c
  }

  // [Q 2026-09-01] 显式 sentinel=null,绕开 PATCH_MARK 的"已是补丁态"短路——R88 与 R77
  // 共用一条 .bak-left,R77 后 current 已含 PATCH_MARK,默认会跳过;R88 锚点基于 R77 后
  // 状态,必须重打才能落地。PASS:rewrite 在 null sentinel 下必走完整 apply 链,当前 current
  // 是 R77 态时 patched ≠ current,确保写盘。
  return [{ ...rewrite(p, '.bak-left', apply, failures, null), version: ver }]
}

// ---- [T] @anionex/dsh-turn-rewind alpha.5 适配守护(2026-09-03,问题130) ----
// 上游 0.2.1 lib/settings.js 顶层 named import installSettingsSection/settingsNamespace
// (@deepseek-ai/dsh-settings 0.1.2-alpha.5 已移除)→ 插件市场更新重装覆盖本地适配后,
// loader entry 崩加载拖垮整棵插件树 → dsh web 无法启动(2026-09-03 17:09 实证 5 连败)。
// 本地深适配(批次 88c + 17:51 复发修复,备份 .bak-alpha5-q131)经此段守护,三种形态分流:
//   已适配(哨兵行在场) → already 跳过;官方原版(特征 import 在场) → 重打为注入式注册;
//   未知形态(上游新版/半态) → FAIL 保留原样不写盘(红色 canary,等作者适配版或人工研判)。
// 自实现幂等(不借用 rewrite 基底):重复应用时 FROM 锚点已不存在会 FAIL 拒写,无半补丁态。
function patchTurnRewind() {
  const dir = path.join(PLUGINS, '@anionex', 'dsh-turn-rewind')
  const p = path.join(dir, 'lib', 'settings.js')
  if (!fs.existsSync(p)) return [{ file: '@anionex/dsh-turn-rewind/lib/settings.js', missing: true }]
  let ver = 'unknown'
  try { ver = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).version } catch (e) { /* ignore */ }
  const { rep, failures } = makeCtx('@anionex/dsh-turn-rewind/settings.js')
  const current = fs.readFileSync(p, 'utf8')
  const MARK = 'const scope = sctx.settings.register(TURN_REWIND_SETTINGS_NAMESPACE, TurnRewindSettingsSchema);'
  if (current.includes(MARK)) return [{ file: '@anionex/dsh-turn-rewind/lib/settings.js', version: ver, ok: true, already: true }]
  const UPSTREAM_ANCHOR = "import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings';"
  if (!current.includes(UPSTREAM_ANCHOR)) {
    return [{ file: '@anionex/dsh-turn-rewind/lib/settings.js', version: ver, ok: false, failures: ['[turn-rewind] settings.js 非官方原版亦非已适配形态(上游新版/半态?),保留原样不写盘'] }]
  }
  let c = current
  // A: 顶层 named import 行摘除(alpha.5 无 installSettingsSection/settingsNamespace 导出)
  c = rep(c,
    "import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings';\n",
    "/** [alpha.5 适配 2026-09-03,patches.cjs [T] 段守护] dsh-settings 0.1.2-alpha.5 移除\n * installSettingsSection/settingsNamespace 导出;原顶层 named import 会让 loader entry 崩加载\n * 拖垮整棵插件树(dsh web 起不来,2026-09-03 实证)。插件市场更新重装覆盖本文件后,\n * 壳启动重放自动重打为注入式注册(settings.register + scope.watch)。 */\n",
    1, 'drop-bad-import')
  // B: NS 常量直用字符串(旧 settingsNamespace 工厂=校验后原样返回字符串,零行为差)
  c = rep(c,
    "export const TURN_REWIND_SETTINGS_NAMESPACE = settingsNamespace('turn-rewind');",
    "export const TURN_REWIND_SETTINGS_NAMESPACE = 'turn-rewind';",
    1, 'ns-const')
  // C: 函数体改注入式注册(与 dsh-better-sidebar / dsh-joi-channel-theme 本地适配同款模式)
  c = rep(c,
    "export function installTurnRewindSettings(ctx, config, engine) {\n    let source = () => tunableSettings(resolveConfig(config));\n    installSettingsSection(ctx, TURN_REWIND_SETTINGS_NAMESPACE, TurnRewindSettingsSchema, source(), {\n        setSource: (current) => { source = current; },\n        onChange: () => {\n            try {\n                engine.updateConfig({ ...config, ...source() });\n            }\n            catch (error) {\n                ctx.logger.warn(`[turn-rewind] could not apply settings update: ${error instanceof Error ? error.message : String(error)}`);\n            }\n        },\n    });\n}",
    "export function installTurnRewindSettings(ctx, config, engine) {\n    ctx.inject(['settings'], (sctx) => {\n        const scope = sctx.settings.register(TURN_REWIND_SETTINGS_NAMESPACE, TurnRewindSettingsSchema);\n        scope.watch(() => {\n            try {\n                const value = scope.get();\n                if (value && typeof value === 'object') {\n                    engine.updateConfig({ ...config, ...value });\n                }\n            }\n            catch (error) {\n                ctx.logger.warn(`[turn-rewind] could not apply settings update: ${error instanceof Error ? error.message : String(error)}`);\n            }\n        });\n    });\n}",
    1, 'install-inject')
  if (failures.length) return [{ file: '@anionex/dsh-turn-rewind/lib/settings.js', version: ver, ok: false, failures: [...failures], kept: true }]
  fs.writeFileSync(p, c, 'utf8')
  return [{ file: '@anionex/dsh-turn-rewind/lib/settings.js', version: ver, ok: true, already: false }]
}

// ---- [T2] dsh-ego-browser alpha.5 适配守护(2026-09-06) ----
// 上游 0.8.1 lib/index.js 顶层 `import { settingsNamespace } from "@deepseek-ai/dsh-settings"`
// (alpha.5 已移除该导出)→ loader entry 崩加载,且 cordis:include 是全有或全无:
// **整棵插件树连带失败**(2026-09-06 实证:dsh web 起来了但所有插件缺席,含
// dsh-file-drop / notify-sound / usage-tracker)。ego-browser 的设置注册本就是
// 注入式(ctx.inject(['settings']) + sctx.settings.register),故只需两刀:
//   A: 顶层 named import 行摘除;B: NS 常量直用字符串(旧工厂=校验后原样返回,零行为差)。
// 哨兵=替换后的注释行;官方原版(特征 import 在场)才动手;其他形态 FAIL 保留原样。
function patchEgoBrowserSettings() {
  const dir = path.join(PLUGINS, 'dsh-ego-browser')
  const p = path.join(dir, 'lib', 'index.js')
  if (!fs.existsSync(p)) return [{ file: 'dsh-ego-browser/lib/index.js', missing: true }]
  let ver = 'unknown'
  try { ver = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).version } catch (e) { /* ignore */ }
  const { rep, failures } = makeCtx('dsh-ego-browser/index.js')
  const current = fs.readFileSync(p, 'utf8')
  const MARK = '[alpha.5 适配 2026-09-06,patches.cjs [T2] 段守护]'
  if (current.includes(MARK)) return [{ file: 'dsh-ego-browser/lib/index.js', version: ver, ok: true, already: true }]
  const UPSTREAM_ANCHOR = 'import { settingsNamespace } from "@deepseek-ai/dsh-settings";'
  if (!current.includes(UPSTREAM_ANCHOR)) {
    return [{ file: 'dsh-ego-browser/lib/index.js', version: ver, ok: false, failures: ['[ego-browser] index.js 非官方原版亦非已适配形态(上游新版/半态?),保留原样不写盘'] }]
  }
  let c = current
  c = rep(c,
    UPSTREAM_ANCHOR + '\n',
    '/** ' + MARK + ' dsh-settings 0.1.2-alpha.5 移除 settingsNamespace 导出;顶层 named import 会让\n * loader entry 崩加载并经 cordis:include 拖垮整棵插件树(所有插件缺席)。上游更新覆盖\n * 本文件后,壳启动重放自动重打。 */\n',
    1, 'drop-bad-import')
  c = rep(c,
    'const SETTINGS_NAMESPACE = settingsNamespace("ego-browser");',
    "const SETTINGS_NAMESPACE = 'ego-browser';",
    1, 'ns-const')
  if (failures.length) return [{ file: 'dsh-ego-browser/lib/index.js', version: ver, ok: false, failures: [...failures], kept: true }]
  fs.writeFileSync(p, c, 'utf8')
  return [{ file: 'dsh-ego-browser/lib/index.js', version: ver, ok: true, already: false }]
}

// ---- [E](已废弃:SettingsRoot 打进 dsh web Vite 主 bundle assets/index-*.js,patch 源码仓无效;
//          改由 dshvt client.js 运行时 MutationObserver 给导航 button 注入 data-section-id,与 entry 自愈同款) ----

// ---- [U] ui-conversation 自定义快捷面板(alpha.5 +按钮死点根治,v2 2026-09-03;v7 附件通道 2026-09-06) ----
// 死点:alpha.5 onToggleCommandMenu → inputTriggers.toggleSource('command', {trigger:'/', ...})
// 路径中 `this.deps.roster.sources('/').find(item=>item.name==='command')` 在当前 bundle
// 组合下未命中,函数静默 dismiss()(0 错误、0 DOM);键盘输入 '/' 走 controller.track 检测路径
// 不经 toggleSource 故能弹出 111 条 slash 候选。两种路径在 alpha.5 行为分叉。
// 修复:不依赖 toggleSource,纯 DOM 渲染自定义快捷面板(📎 添加附件 / 使用 @ / 使用 / /
// 使用 § 等 4 行),每行点击聚焦输入框 + 插入触发字符(附件行走文件选择器)。
// v2 变更:① 渲染器改收 anchorButton 参数——onToggleCommandMenu 把 React 事件的
// currentTarget(=被点击的 + 按钮)传入,彻底摆脱 querySelector('button[aria-label=指令]')
// 对「隐藏旧按钮/多实例/文案变化」的脆弱假设(v1 死因:找不到/找错锚点→静默 return);
// ② 兜底:anchorButton 为空时按「可见 + aria-label 含 指令/Commands」过滤查找;
// ③ 错误探针 window.__dshQuickActionsError(诊断用)。
// 三态分流(幂等):v2 哨兵在场=already;v1 哨兵在场=v1→v2 定点升级;pristine=整体注入。
function patchConversationPlusQuickActions() {
  const results = []
  const V2_SIG = 'const __dshQuickActionsRender = function(anchorButton) {'
  const V1_SIG = 'const __dshQuickActionsRender = function() {'
  // v4 主题自适应调色板:渲染时实测页面背景色 → 深/暖橘/中性白 三套配色,跟随主题切换
  // (面板每次点开重建,每次都重新取色,无需监听主题变化)
  const PALETTE_LINES = [
    "  const pal = (function () {",
    "    let raw = '';",
    "    try {",
    "      const els = [document.body, document.documentElement, document.getElementById('root'), document.getElementById('app')];",
    "      for (let i = 0; i < els.length; i++) {",
    "        if (!els[i]) continue;",
    "        const c = getComputedStyle(els[i]).backgroundColor || '';",
    "        if (c && c.indexOf('rgba(0, 0, 0, 0') !== 0 && c !== 'transparent') { raw = c; break; }",
    "      }",
    "    } catch (e1) { /* ignore */ }",
    "    const m = raw.match(/(\\d+)[,\\s]+(\\d+)[,\\s]+(\\d+)/);",
    "    const r = m ? +m[1] : 31, g = m ? +m[2] : 31, b = m ? +m[3] : 35;",
    "    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;",
    "    if (lum < 0.6) return { bg: '#1f1f23', fg: '#ffffff', icon: '#f0f0f0', hover: 'rgba(255,255,255,0.06)', border: 'rgba(255,255,255,0.10)', shadow: '0 8px 24px rgba(0,0,0,0.4)' };",
    "    if ((r - b) > 12) return { bg: 'rgba(255,250,241,0.97)', fg: '#4a3826', icon: '#e0762c', hover: 'rgba(224,118,44,0.13)', border: 'rgba(214,138,66,0.32)', shadow: '0 8px 24px rgba(180,110,50,0.24)' };",
    "    return { bg: 'rgba(255,255,255,0.98)', fg: '#3a3a3a', icon: '#8a8a8a', hover: 'rgba(0,0,0,0.05)', border: 'rgba(0,0,0,0.08)', shadow: '0 8px 24px rgba(0,0,0,0.14)' };",
    "  })();",
    ""
  ].join('\n')
  const V4_CSSTEXT_NEW = "  menu.style.cssText = 'position:fixed;left:' + rect.left + 'px;bottom:' + (window.innerHeight - rect.top + 8) + 'px;z-index:999999;background:' + pal.bg + ';color:' + pal.fg + ';border:1px solid ' + pal.border + ';border-radius:10px;box-shadow:' + pal.shadow + ';padding:6px 0;min-width:240px;font-family:system-ui,-apple-system,sans-serif;font-size:14px;line-height:1.4;';"
  const V4_INNERHTML_NEW = "    row.innerHTML = '<span style=\"display:inline-flex;align-items:center;justify-content:center;width:18px;font-size:16px;color:' + pal.icon + ';\">' + item.icon + '</span><span>' + item.label + '</span>';"
  const V4_HOVER_NEW = "    row.addEventListener('mouseenter', function() { row.style.background = pal.hover; });"
  // v3 落地形态(升级 FROM 串)
  const V3_CSSTEXT_OLD = "  menu.style.cssText = 'position:fixed;left:' + rect.left + 'px;bottom:' + (window.innerHeight - rect.top + 8) + 'px;z-index:999999;background:#1f1f23;color:#fff;border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,0.4);padding:6px 0;min-width:240px;font-family:system-ui,-apple-system,sans-serif;font-size:14px;line-height:1.4;';"
  const V3_INNERHTML_OLD = "    row.innerHTML = '<span style=\"display:inline-flex;align-items:center;justify-content:center;width:18px;font-size:16px;\">' + item.icon + '</span><span>' + item.label + '</span>';"
  const V3_HOVER_OLD = "    row.addEventListener('mouseenter', function() { row.style.background = 'rgba(255,255,255,0.06)'; });"
  const V4_MARK = '0.299 * r'
  // v5:移除 § 技能行 + 附件行改 SVG 线条回形针(currentColor 随主题) + 圆角高亮/轻微右移滑过交互
  const V5_MARK = 'M21.44 11.05'
  const V5_ATTACH_NEW = "    { icon: '<svg width=\"16\" height=\"16\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48\"/></svg>', label: '添加附件', trigger: null },"
  const V5_ROWCSS_NEW = "    row.style.cssText = 'display:flex;align-items:center;gap:12px;padding:8px 12px;margin:2px 8px;border-radius:8px;cursor:pointer;transition:background 140ms ease,transform 140ms ease;';"
  const V5_HOVER_NEW = "    row.addEventListener('mouseenter', function() { row.style.background = pal.hover; row.style.transform = 'translateX(2px)'; });"
  const V5_LEAVE_NEW = "    row.addEventListener('mouseleave', function() { row.style.background = 'transparent'; row.style.transform = 'translateX(0)'; });"
  // v4 落地形态(升级 FROM 串)
  const V4_SECTION_OLD = "trigger: '/' },\n    { icon: '\\u00A7', label: '使用 \\u00A7 选择技能', trigger: '\\u00A7' }"
  const V4_ATTACH_OLD = "    { icon: '\\u{1F4CE}', label: '添加附件', trigger: null },"
  const V4_ROWCSS_OLD = "    row.style.cssText = 'display:flex;align-items:center;gap:12px;padding:8px 14px;cursor:pointer;transition:background 120ms;';"
  const V4_LEAVE_OLD = "    row.addEventListener('mouseleave', function() { row.style.background = 'transparent'; });"
  // v6:隐藏 alpha.5 原生「轮次导航」(dsh-session-turn-outline 投影的右缘跳转条,与 node-nav
  // 圆点功能重复,用户要求去除)。选择器双保险:aria-label(中文界面)+ 内联样式变量
  // --turn-natural-height(语言/构建哈希无关)。样式由 [U] 模块引导器注入,幂等(id 去重)。
  const V6_MARK = 'dsh-hide-turn-outline'
  const V5_LISTENER_TAIL_OLD = "      if (typeof window !== 'undefined') window.__dshQuickActionsError = 'listener:' + (err && err.message ? err.message : String(err));\n    }\n  }, true);\n}"
  const V6_LISTENER_TAIL_NEW = "      if (typeof window !== 'undefined') window.__dshQuickActionsError = 'listener:' + (err && err.message ? err.message : String(err));\n    }\n  }, true);\n  try {\n    if (!document.getElementById('dsh-hide-turn-outline')) {\n      var st = document.createElement('style');\n      st.id = 'dsh-hide-turn-outline';\n      st.textContent = 'nav[aria-label=\"轮次导航\"],nav[style*=\"--turn-natural-height\"]{display:none!important}';\n      (document.head || document.documentElement).appendChild(st);\n    }\n  } catch (err2) { /* ignore */ }\n}"
  // v7(2026-09-06):「添加附件」死点根治。alpha.5 composer 是 Lexical contenteditable
  // (无 textarea、无 document 级 drop 监听),v2-v6 的附件行逻辑(找页面上现成的
  // 附件按钮 / input[type=file] 来点)会点进无关宿主(皮肤上传/插件导入等)的选择器
  // ——用户实证:文件夹能弹,选完文件不进输入框。v7 正道:自建 file input 弹系统
  // 选择器,选完后按 alpha.5 两条官方入站通道注入——
  //   ① 图片 → 在 composer 可编辑根元素合成 ClipboardEvent('paste')(files 进
  //      DataTransfer)→ Lexical PASTE_COMMAND → keymap intakeFiles → intakeImages
  //      → addImages → 附件轨(上游限额/解码校验全数生效);
  //   ② 文本/代码/文档 → 同通道 paste 纯文本 `@文件名 ` → keymap pasteText →
  //      keyboard.paste 机器粘贴事务 → 草稿(输入触发器按普通草稿受理)。
  // 「使用 @ / 使用 /」两行同步改走 paste 通道(旧 beforeinput/value 写法对
  // contenteditable 无效)。hero(无会话)无输入机 → 可编辑根缺席 → toast 指引。
  const V7_MARK = '__dshQuickActionsPick'
  const HELPERS_SOURCE = [
    "// v7 helpers:alpha.5(Lexical contenteditable)附件/触发字符注入通道",
    "const __dshQuickActionsComposer = function() {",
    "  const card = document.querySelector('[data-composer-card]');",
    "  if (card !== null && card !== void 0) {",
    "    const ed = card.querySelector('[contenteditable=\"true\"]');",
    "    if (ed !== null && ed !== void 0) return ed;",
    "    const ta = card.querySelector('textarea');",
    "    if (ta !== null && ta !== void 0) return ta;",
    "  }",
    "  return null;",
    "};",
    "const __dshQuickActionsToast = function(text) {",
    "  try {",
    "    const old = document.getElementById('__dsh-quick-actions-toast');",
    "    if (old !== null && old !== void 0) old.remove();",
    "    const pill = document.createElement('div');",
    "    pill.id = '__dsh-quick-actions-toast';",
    "    pill.textContent = text;",
    "    pill.setAttribute('role', 'status');",
    "    pill.style.cssText = 'position:fixed;left:50%;bottom:96px;transform:translateX(-50%);z-index:2147483000;background:#1f1f23;color:#fff;border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,0.35);padding:8px 16px;font:13px/1.5 system-ui,-apple-system,sans-serif;max-width:min(520px,80vw);opacity:0;transition:opacity 0.2s ease;';",
    "    document.body.appendChild(pill);",
    "    requestAnimationFrame(function() { pill.style.opacity = '1'; });",
    "    setTimeout(function() { pill.style.opacity = '0'; setTimeout(function() { pill.remove(); }, 300); }, 2600);",
    "  } catch (e0) { /* ignore */ }",
    "};",
    "const __dshQuickActionsPaste = function(payload) {",
    "  const el = __dshQuickActionsComposer();",
    "  if (el === null || el === void 0) { __dshQuickActionsToast('当前输入框不可用:请先选择工作区进入会话'); return false; }",
    "  try {",
    "    const dt = new DataTransfer();",
    "    if (payload.files !== void 0) { for (let i = 0; i < payload.files.length; i++) dt.items.add(payload.files[i]); }",
    "    if (payload.text !== void 0) dt.setData('text/plain', payload.text);",
    "    const ev = new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: dt });",
    "    el.dispatchEvent(ev);",
    "    return true;",
    "  } catch (e1) {",
    "    if (typeof window !== 'undefined') window.__dshQuickActionsError = 'paste:' + (e1 && e1.message ? e1.message : String(e1));",
    "    __dshQuickActionsToast('放入失败: ' + (e1 && e1.message ? e1.message : e1));",
    "    return false;",
    "  }",
    "};",
    "const __dshQuickActionsType = function(ch) {",
    "  const el = __dshQuickActionsComposer();",
    "  if (el === null || el === void 0) { __dshQuickActionsToast('当前输入框不可用:请先选择工作区进入会话'); return; }",
    "  el.focus();",
    "  __dshQuickActionsPaste({ text: ch });",
    "};",
    "const __dshQuickActionsPick = function() {",
    "  let inp = document.getElementById('__dsh-quick-actions-file');",
    "  if (inp === null || inp === void 0) {",
    "    inp = document.createElement('input');",
    "    inp.type = 'file';",
    "    inp.multiple = true;",
    "    inp.id = '__dsh-quick-actions-file';",
    "    inp.setAttribute('data-dsh-quick-actions', '');",
    "    inp.style.display = 'none';",
    "    inp.addEventListener('change', function() {",
    "      try {",
    "        const fs = [].slice.call(inp.files || []);",
    "        const IMG = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'ico', 'avif', 'tif', 'tiff'];",
    "        const images = [];",
    "        const refs = [];",
    "        for (let i = 0; i < fs.length; i++) {",
    "          const f = fs[i];",
    "          const m = /\\.([A-Za-z0-9]+)$/.exec(f.name || '');",
    "          const ext = m ? m[1].toLowerCase() : '';",
    "          if (IMG.indexOf(ext) >= 0) images.push(f);",
    "          else refs.push(f);",
    "        }",
    "        let refOk = 0;",
    "        for (let r = 0; r < refs.length; r++) {",
    "          if (__dshQuickActionsPaste({ text: '@' + refs[r].name + ' ' })) refOk++;",
    "        }",
    "        let imgOk = 0;",
    "        if (images.length > 0 && __dshQuickActionsPaste({ files: images })) imgOk = images.length;",
    "        inp.value = '';",
    "        const parts = [];",
    "        if (imgOk > 0) parts.push(imgOk + ' 张图片已加入附件');",
    "        if (refOk > 0) parts.push(refOk + ' 个文件已以 @引用 放入输入框');",
    "        if (parts.length > 0) __dshQuickActionsToast(parts.join(';'));",
    "      } catch (e2) {",
    "        if (typeof window !== 'undefined') window.__dshQuickActionsError = 'change:' + (e2 && e2.message ? e2.message : String(e2));",
    "      }",
    "    });",
    "    document.body.appendChild(inp);",
    "  }",
    "  inp.click();",
    "};",
    "if (typeof window !== 'undefined') { window.__dshQuickActionsPick = __dshQuickActionsPick; window.__dshQuickActionsPaste = __dshQuickActionsPaste; }",
    ""
  ].join('\n')
  // v2-v6 落地形态的行点击块(升级 FROM;与 rendererSourceV2 原点击段逐字节一致)
  const V7_CLICK_OLD = [
    "    row.addEventListener('click', function(e) {",
    "      e.stopPropagation();",
    "      menu.remove();",
    "      if (item.trigger === null) {",
    "        const attachBtn = document.querySelector('button[aria-label*=\"\\u9644\\u4EF6\"], button[aria-label*=\"attachment\"], [data-attach-trigger]');",
    "        if (attachBtn !== null && attachBtn !== void 0) attachBtn.click();",
    "        else { const fileInput = document.querySelector('input[type=\"file\"]'); if (fileInput !== null && fileInput !== void 0) fileInput.click(); }",
    "      } else {",
    "        const editor = document.querySelector('[data-chat-input], [contenteditable=\"true\"], textarea');",
    "        if (editor !== null && editor !== void 0) {",
    "          editor.focus();",
    "          try { editor.dispatchEvent(new InputEvent('beforeinput', { inputType: 'insertText', data: item.trigger, bubbles: true })); } catch (e1) { /* ignore */ }",
    "          if (editor.tagName === 'TEXTAREA' || editor.tagName === 'INPUT') {",
    "            const start = editor.selectionStart || ((editor.value || '').length);",
    "            const end = editor.selectionEnd || start;",
    "            const oldValue = editor.value || '';",
    "            editor.value = oldValue.slice(0, start) + item.trigger + oldValue.slice(end);",
    "            editor.selectionStart = editor.selectionEnd = start + 1;",
    "            editor.dispatchEvent(new Event('input', { bubbles: true }));",
    "          }",
    "        }",
    "      }",
    "    });"
  ].join('\n')
  const V7_CLICK_NEW = [
    "    row.addEventListener('click', function(e) {",
    "      e.stopPropagation();",
    "      menu.remove();",
    "      if (item.trigger === null) __dshQuickActionsPick();",
    "      else __dshQuickActionsType(item.trigger);",
    "    });"
  ].join('\n')
  // v8(2026-09-06):工具行排序钉收编。批次 60 的 `_modes{order:2!important}` 钉原随
  // dsh-file-drop 插件常驻;alpha.5 部署下宿主客户端 include 裁掉了 workspace link:
  // 插件(批次 95 同款症状,本次 bundles/junction 均好仍被裁,宿主组合侧另案),钉失位 →
  // 悬停「+」tooltip 气泡抢 nth-child(2) 的 order:2,「专家/完全权限」悬停期互换复发。
  // 钉改由本补丁随 conversation bundle 常驻(独立 style 标签,幂等 id 去重),
  // 与插件 CSS 同值双写无害;插件未来回归后两者并存亦兼容。
  const V8_MARK = 'dsh-tools-order-pin'
  const V8_TAIL_OLD = "      (document.head || document.documentElement).appendChild(st);\n    }\n  } catch (err2) { /* ignore */ }\n}"
  const V8_TAIL_NEW = [
    "      (document.head || document.documentElement).appendChild(st);",
    "    }",
    "  } catch (err2) { /* ignore */ }",
    "  try {",
    "    if (!document.getElementById('dsh-tools-order-pin')) {",
    "      var st2 = document.createElement('style');",
    "      st2.id = 'dsh-tools-order-pin';",
    "      st2.textContent = '[data-composer-card] [class*=\"_tools\"] > [class*=\"_modes\"]{order:2 !important}';",
    "      (document.head || document.documentElement).appendChild(st2);",
    "    }",
    "  } catch (err3) { /* ignore */ }",
    "}"
  ].join('\n')
  // v2 渲染器源码(pristine 注入用;2 空格函数体)
  const rendererSourceV2 = [
    V2_SIG,
    "  let menu = document.getElementById('__dsh-quick-actions-menu');",
    "  if (menu) { menu.remove(); return; }",
    "  const btn = (anchorButton !== null && anchorButton !== void 0) ? anchorButton : (function () {",
    "    const cands = [].slice.call(document.querySelectorAll('button[aria-label]'));",
    "    for (let i = 0; i < cands.length; i++) {",
    "      const r2 = cands[i].getBoundingClientRect();",
    "      const lab = cands[i].getAttribute('aria-label') || '';",
    "      if ((lab.indexOf('指令') !== -1 || lab === 'Commands') && r2.width > 0 && r2.height > 0) return cands[i];",
    "    }",
    "    return null;",
    "  })();",
    "  if (btn === null || btn === void 0) { if (typeof window !== 'undefined') window.__dshQuickActionsError = 'no-anchor'; return; }",
    "  const rect = btn.getBoundingClientRect();",
    "  const items = [",
    V5_ATTACH_NEW,
    "    { icon: '@', label: '使用 @ 添加上下文', trigger: '@' },",
    "    { icon: '/', label: '使用 / 选择能力', trigger: '/' }",
    "  ];",
    "  menu = document.createElement('div');",
    "  menu.id = '__dsh-quick-actions-menu';",
    PALETTE_LINES,
    V4_CSSTEXT_NEW,
    "  for (let i = 0; i < items.length; i++) {",
    "    const item = items[i];",
    "    const row = document.createElement('div');",
    V5_ROWCSS_NEW,
    V4_INNERHTML_NEW,
    V5_HOVER_NEW,
    V5_LEAVE_NEW,
    "    row.addEventListener('click', function(e) {",
    "      e.stopPropagation();",
    "      menu.remove();",
    "      if (item.trigger === null) __dshQuickActionsPick();",
    "      else __dshQuickActionsType(item.trigger);",
    "    });",
    "    menu.appendChild(row);",
    "  }",
    "  document.body.appendChild(menu);",
    "  setTimeout(function() {",
    "    const handler = function(ev) {",
    "      if (menu && !menu.contains(ev.target) && ev.target !== btn) { menu.remove(); document.removeEventListener('click', handler, true); }",
    "    };",
    "    document.addEventListener('click', handler, true);",
    "  }, 0);",
    "};",
    ""
  ].join('\n')
  // v1 按钮定位块(v1→v2 升级的 FROM;行首无缩进,与函数体 2 空格形态一致)
  const V1_LOOKUP_FROM = "  let menu = document.getElementById('__dsh-quick-actions-menu');\n  if (menu) { menu.remove(); return; }\n  const btn = document.querySelector('button[aria-label=\"指令\"]');\n  if (btn === null || btn === void 0) return;\n  const rect = btn.getBoundingClientRect();"
  const V2_LOOKUP_TO = "  let menu = document.getElementById('__dsh-quick-actions-menu');\n  if (menu) { menu.remove(); return; }\n  const btn = (anchorButton !== null && anchorButton !== void 0) ? anchorButton : (function () {\n    const cands = [].slice.call(document.querySelectorAll('button[aria-label]'));\n    for (let i = 0; i < cands.length; i++) {\n      const r2 = cands[i].getBoundingClientRect();\n      const lab = cands[i].getAttribute('aria-label') || '';\n      if ((lab.indexOf('指令') !== -1 || lab === 'Commands') && r2.width > 0 && r2.height > 0) return cands[i];\n    }\n    return null;\n  })();\n  if (btn === null || btn === void 0) { if (typeof window !== 'undefined') window.__dshQuickActionsError = 'no-anchor'; return; }\n  const rect = btn.getBoundingClientRect();"
  // v3 模块作用域捕获拦截器:document 捕获阶段先于 React 拦截 + 按钮点击,
  // 绕开「React onClick 重写是否真正生效」的不确定性(v2 实证未触发:menu:false,err 未设)。
  // preventDefault+stopPropagation 阻止 React onClick 二次触发,渲染器单次调用;
  // 监听器包 try/catch:任何渲染器异常都落 window.__dshQuickActionsError('listener:...')。
  const LISTENER_MARK = 'window.__dshQuickActionsBound'
  const LISTENER_SOURCE = [
    "if (typeof window !== 'undefined' && !window.__dshQuickActionsBound) {",
    "  window.__dshQuickActionsBound = true;",
    "  document.addEventListener('click', function (ev) {",
    "    try {",
    "      const t = ev && ev.target;",
    "      if (!t || !t.closest) return;",
    "      const b = t.closest('button[aria-label]');",
    "      if (!b) return;",
    "      const l = b.getAttribute('aria-label') || '';",
    "      if (l.indexOf('指令') === -1 && l !== 'Commands') return;",
    "      if (ev.cancelable) ev.preventDefault();",
    "      ev.stopPropagation();",
    "      __dshQuickActionsRender(b);",
    "    } catch (err) {",
    "      if (typeof window !== 'undefined') window.__dshQuickActionsError = 'listener:' + (err && err.message ? err.message : String(err));",
    "    }",
    "  }, true);",
    "  try {",
    "    if (!document.getElementById('dsh-hide-turn-outline')) {",
    "      var st = document.createElement('style');",
    "      st.id = 'dsh-hide-turn-outline';",
    "      st.textContent = 'nav[aria-label=\"轮次导航\"],nav[style*=\"--turn-natural-height\"]{display:none!important}';",
    "      (document.head || document.documentElement).appendChild(st);",
    "    }",
    "  } catch (err2) { /* ignore */ }",
    "  try {",
    "    if (!document.getElementById('dsh-tools-order-pin')) {",
    "      var st2 = document.createElement('style');",
    "      st2.id = 'dsh-tools-order-pin';",
    "      st2.textContent = '[data-composer-card] [class*=\"_tools\"] > [class*=\"_modes\"]{order:2 !important}';",
    "      (document.head || document.documentElement).appendChild(st2);",
    "    }",
    "  } catch (err3) { /* ignore */ }",
    "}",
    ""
  ].join('\n')

  const patchFile = (p, label) => {
    // [U] 版本门控:只对 dsh-client-ui-conversation 0.1.2-alpha.5 上游 bundle 生效
    const pkgPath = path.join(path.dirname(p), '..', 'package.json')
    let pkgVer = '?'
    if (fs.existsSync(pkgPath)) {
      try { pkgVer = JSON.parse(fs.readFileSync(pkgPath, 'utf8')).version } catch (e) { /* ignore */ }
    }
    if (pkgVer !== '0.1.2-alpha.5') return { file: label, version: pkgVer, ok: true, skipped: true }
    const { rep, failures } = makeCtx(label)
    const current = fs.readFileSync(p, 'utf8')
    const INPUTBAR_ANCHOR = "const InputBar = (0, react.memo)(function InputBar({"
    if (current.includes(LISTENER_MARK)) {
      const needsV7 = !current.includes(V7_MARK)
      const needsV8 = !current.includes(V8_MARK)
      if (current.includes(V6_MARK) && !needsV7 && !needsV8) return { file: label, version: pkgVer, ok: true, already: true }
      let c2 = current
      if (!current.includes(V5_MARK)) {
        if (current.includes(V4_MARK)) {
          // v4 → v5:移除 § 技能行 + SVG 回形针 + 圆角滑过位移交互
          c2 = rep(c2, V4_SECTION_OLD, "trigger: '/' }", 1, 'v5-remove-section')
          c2 = rep(c2, V4_ATTACH_OLD, V5_ATTACH_NEW, 1, 'v5-attach-icon')
          c2 = rep(c2, V4_ROWCSS_OLD, V5_ROWCSS_NEW, 1, 'v5-row-css')
          c2 = rep(c2, V4_HOVER_NEW, V5_HOVER_NEW, 1, 'v5-hover')
          c2 = rep(c2, V4_LEAVE_OLD, V5_LEAVE_NEW, 1, 'v5-leave')
        } else {
          // v3 → v4 主题自适应升级:定点替换三处写死深色的样式行为动态调色板
          c2 = rep(c2, V3_CSSTEXT_OLD, PALETTE_LINES + V4_CSSTEXT_NEW, 1, 'v4-palette')
          c2 = rep(c2, V3_INNERHTML_OLD, V4_INNERHTML_NEW, 1, 'v4-icon-color')
          c2 = rep(c2, V3_HOVER_OLD, V4_HOVER_NEW, 1, 'v4-hover')
        }
      }
      // v6(含 v5/v4/v3 直升):轮次导航隐藏样式注入
      if (!current.includes(V6_MARK)) c2 = rep(c2, V5_LISTENER_TAIL_OLD, V6_LISTENER_TAIL_NEW, 1, 'v6-turn-outline-hide')
      // v7(含 v6/v5/v4/v3 直升):附件行走自建选择器 + paste 通道;@ / 行走 paste 通道
      if (needsV7) {
        c2 = rep(c2, V2_SIG, HELPERS_SOURCE + V2_SIG, 1, 'v7-helpers')
        c2 = rep(c2, V7_CLICK_OLD, V7_CLICK_NEW, 1, 'v7-click')
      }
      // v8(直升):工具行排序钉收编(不依赖 dsh-file-drop 插件在册)
      if (needsV8) c2 = rep(c2, V8_TAIL_OLD, V8_TAIL_NEW, 1, 'v8-order-pin')
      if (failures.length) return { file: label, version: pkgVer, ok: false, failures: [...failures] }
      fs.writeFileSync(p, c2, 'utf8')
      return { file: label, version: pkgVer, ok: true, already: false }
    }
    let c = current
    if (current.includes(V2_SIG)) {
      // 已有 v2 渲染器:v3 只需补捕获监听器(在 InputBar 声明前插入),再直升 v7
      c = rep(c, INPUTBAR_ANCHOR, LISTENER_SOURCE + INPUTBAR_ANCHOR, 1, 'v3-listener')
      c = rep(c, V2_SIG, HELPERS_SOURCE + V2_SIG, 1, 'v7-helpers')
      c = rep(c, V7_CLICK_OLD, V7_CLICK_NEW, 1, 'v7-click')
      if (failures.length) return { file: label, version: pkgVer, ok: false, failures: [...failures] }
      fs.writeFileSync(p, c, 'utf8')
      return { file: label, version: pkgVer, ok: true, already: false }
    }
    if (current.includes(V1_SIG)) {
      // v1 → v2 升级 + v3 监听器 + v7 通道
      c = rep(c, 'const __dshQuickActionsRender = function() {', V2_SIG, 1, 'v2-signature')
      c = rep(c, V1_LOOKUP_FROM, V2_LOOKUP_TO, 1, 'v2-anchor-lookup')
      c = rep(c, 'const onToggleCommandMenu = () => {', 'const onToggleCommandMenu = (ev) => {', 1, 'v2-click-event')
      c = rep(c, "__dshQuickActionsRender();", "__dshQuickActionsRender(ev && ev.currentTarget);", 1, 'v2-click-pass')
      c = rep(c, INPUTBAR_ANCHOR, LISTENER_SOURCE + INPUTBAR_ANCHOR, 1, 'v3-listener')
      c = rep(c, V2_SIG, HELPERS_SOURCE + V2_SIG, 1, 'v7-helpers')
      c = rep(c, V7_CLICK_OLD, V7_CLICK_NEW, 1, 'v7-click')
      if (failures.length) return { file: label, version: pkgVer, ok: false, failures: [...failures] }
      fs.writeFileSync(p, c, 'utf8')
      return { file: label, version: pkgVer, ok: true, already: false }
    }
    // pristine:整体注入 v7 渲染器 + v3 捕获监听器 + 重写 click
    c = rep(c, INPUTBAR_ANCHOR, HELPERS_SOURCE + rendererSourceV2 + LISTENER_SOURCE + INPUTBAR_ANCHOR, 1, 'inject-renderer-v3')
    const ORIGINAL_CLICK = "const onToggleCommandMenu = () => {\n\t\t\t\tif (keyboard !== void 0) toggleCommandMenu?.(keyboard.caretSpan());\n\t\t\t};"
    const REWRITTEN_CLICK = "const onToggleCommandMenu = (ev) => {\n\t\t\t\t// [dsh-desktop U 段 v3 alpha.5 修复] 渲染改由 document 捕获拦截器触发(React onClick 链路不可靠)\n\t\t\t\tif (typeof __dshQuickActionsRender === 'function' && ev && ev.currentTarget) __dshQuickActionsRender(ev.currentTarget);\n\t\t\t};"
    c = rep(c, ORIGINAL_CLICK, REWRITTEN_CLICK, 1, 'rewrite-click-v3')
    if (failures.length) return { file: label, version: pkgVer, ok: false, failures: [...failures] }
    fs.writeFileSync(p, c, 'utf8')
    return { file: label, version: pkgVer, ok: true, already: false }
  }
  // L: 本地 monorepo 构建产物(若存在;devlink-disabled 时不重打)
  const localConv = ['D:\\deepseek harness\\deepseek-harness\\packages\\client\\ui-conversation\\lib\\client.js',
    path.join(os.homedir(), 'deepseek-harness', 'packages', 'client', 'ui-conversation', 'lib', 'client.js')]
    .find((f) => fs.existsSync(f))
  if (localConv && !localConv.includes('devlink-disabled')) {
    results.push({ ...patchFile(localConv, 'ui-conversation/lib/client.js@L[plus-quick]'), version: 'local' })
  } else {
    results.push({ file: 'ui-conversation/lib/client.js@L[plus-quick]', missing: true })
  }
  // O: npx 缓存(含 .pnpm 虚拟目录):递归找出所有 dsh-client-ui-conversation/lib/client.js
  const npxRoot = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), '.npm-cache'), 'npm-cache', '_npx')
  const seen = new Set()
  const walkForConv = (dir, depth) => {
    if (depth > 8 || seen.has(dir)) return
    seen.add(dir)
    let entries
    try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch (e) { return }
    for (const e of entries) {
      const full = path.join(dir, e.name)
      if (e.isDirectory()) walkForConv(full, depth + 1)
      else if (e.isFile() && e.name === 'client.js') {
        // 仅关心 dsh-client-ui-conversation/lib/client.js 形态
        if (full.replace(/\\/g, '/').endsWith('/@deepseek-ai/dsh-client-ui-conversation/lib/client.js')) {
          const result = patchFile(full, 'ui-conversation/lib/client.js@O[plus-quick]')
          const ver = result.version || '?'
          result.version = (full.match(/[\\/]([^\\/]+)[\\/]node_modules[\\/]@deepseek-ai[\\/]dsh-client-ui-conversation/) || [, '?'])[1].slice(0, 8) + ' ' + ver
          results.push(result)
        }
      }
    }
  }
  if (fs.existsSync(npxRoot)) {
    for (const h of fs.readdirSync(npxRoot)) walkForConv(path.join(npxRoot, h), 0)
  }
  if (!results.length) results.push({ file: 'ui-conversation/lib/client.js[plus-quick]', missing: true })
  return results
}

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
        // [C1b 2026-09-03] mnemon 0.4.6 上游去掉 [data-dsh-frame] 前缀(仅 [data-sidebar-collapsed])
        // → 旧锚点全量失配 FAIL(09-03 插件自动更新当日暴露)。发现与替换均双形态兼容,
        // 替换文本按命中形态生成同款折叠选择器(0.4.5 带框架前缀/0.4.6 裸 collapsed)。
        const SC = '(?:\\[data-dsh-frame\\])?\\[data-sidebar-collapsed\\]'
        const m = c.match(new RegExp(SC + ' \\.([A-Za-z0-9_-]+)_entry\\{'))
        if (!m) { failures.push('[mnemon] entry prefix not found'); return c }
        const P = m[1]
        const scoped = m[0].startsWith('[data-dsh-frame]')
        const COLLAPSED_SEL = (scoped ? '[data-dsh-frame][data-sidebar-collapsed] ' : '[data-sidebar-collapsed] ') + `.${P}_entryLabel`
        c = rex(c, new RegExp((scoped ? '\\[data-dsh-frame\\]\\[data-sidebar-collapsed\\] ' : '\\[data-sidebar-collapsed\\] ') + `\\.${P}_entryLabel\\{display:none\\}`),
          `.${P}_entryLabel{max-width:200px;overflow:hidden;white-space:nowrap;transition:max-width var(--dsh-bsr-slide-duration,.3s) cubic-bezier(.32,.72,0,1),opacity .25s cubic-bezier(.32,.72,0,1)}${COLLAPSED_SEL}{max-width:0;opacity:0;visibility:hidden}`,
          1, 'mnemon-entry-smooth')
        return c
      }
      results.push({ ...rewrite(mp, '.bak-order', apply, failures), version: ver })
    }
  }
  // C4/C7: 单文件 order 改写(宠物 130→18 / 皮肤中心 120→14.5)。
  // C3 的 web-ui-settings(webui-order)条目已移除:dsh-web-ui 家族聚合包卸载后该包
  // 永久 missing,壳内「Web UI 插件」tab(dshvt b20)也已整体摘除,见批次 R81。
  // C7 浮点 order 已验证:registry 排序为 a.order - b.order 数值比较(scoped-slots.tsx:839),14.5 落在 皮肤14 与 插件15 之间。
  const orderSpecs = [
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
  // 3) [R50 2026-08-29] 本地构建轨内置预设(monorepo apps/cli/config/agent-presets):
  // 与官方 npx 缓存同源同构,缺它则切 local 轨时内置预设回潮 persona 条目(部署级
  // persona 被 agent 作用域顶掉的同根因)。monorepo 内改动带 .bak-persona 可还原,
  // git 树呈现已修改属预期;`git checkout` 冲掉后守护 ≤45s 自动重打,与 devlink 同语义。
  const localPresets = process.env.DSH_LOCAL_PRESETS_ROOT
    || ['D:\\deepseek harness\\deepseek-harness\\apps\\cli\\config\\agent-presets',
      path.join(os.homedir(), 'deepseek-harness', 'apps', 'cli', 'config', 'agent-presets')]
      .find((d) => fs.existsSync(d))
  if (localPresets && fs.existsSync(localPresets)) {
    for (const name of fs.readdirSync(localPresets)) {
      const f = path.join(localPresets, name, 'agent.cordis.yml')
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
  // sentinel===null(显式叠加补丁语义,仅 patchNodeNav):以 .bak 为整链基底已通过,
  // 跳过「上游已更新」重试——否则 R77 锚点会在 R77 后的 current 上跑全 0 失配,导致 R88
  // 写不进。
  if (sentinel !== null && !failures.length && current !== base && current !== patched) {
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
  // [R88 2026-09-01 叠加补丁专用] 跳过「current 回退」分支,强制以 .bak 为基底整链重打。
  // 当 sentinel=null 显式传入(只有 patchNodeNav 用得上),current 与 patched 不同时
  // 也相信 .bak,不进入「上游更新」重试——那条 fallback 会让 R77 锚点在 R77 后的 current
  // 上跑全部 0 失配,导致 R88 写不进。本地分支支持 R** 多补丁共用基底叠加。
  // 上游源码仓若发布 R77 锚点漂移,.bak 与 current 之间会因锚点失配而 failures > 0,
  // 走入 kept:true 路径不写盘(基线安全)。
  if (sentinel === null && !failures.length && current !== base && current !== patched) {
    // R88 显式「以 bak 为准」语义,留 patched(已包含 R77→R88 完整链)写入,跳过 current 重试。
  }
  if (!fs.existsSync(bak) || fs.readFileSync(bak, 'utf8') !== base) fs.writeFileSync(bak, base, 'utf8')
  if (failures.length) {
    // 保留 current 原样,绝不写盘还原(杜绝半补丁的旧手段在多副本场景是反噬)
    return { file, ok: false, failures: [...failures], kept: true }
  }
  if (patched && !patched.includes('/*dsh-local-patch:v2026-08-23*/')) patched += '\n/*dsh-local-patch:v2026-08-23*/\n'
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
    // J3 [批次 88b/93] alpha.5 client-runtime 已内联:运行时引用改 seed 词 dsh-client-store
    // (官方原版 require("@deepseek-ai/dsh-client-runtime/client") 必炸 "missed the module table")
    c = rep(c,
      'require("@deepseek-ai/dsh-client-runtime/client")',
      'require("@deepseek-ai/dsh-client-store")',
      1, 'client-store-seed')
    // J4 [批次 94 2026-09-04] alpha.5 品牌区嵌套化:brand > brandIdentity > (brandMark, brandName),
    // [class*=_brand] 子串选择器命中全部 4 层,每层各画一次 --joi-brand-logo + padding-left:98px
    // → 工作区顶部一排重复立绘(用户截图实证)。收窄为品牌区本体,排除 brand* 后代。
    // 存活副本已手工迁移并带哨兵,重放走哨兵快速通道;上游漂移刷新后本步自动重打。
    c = rep(c,
      'brand: "[class*=_brand]",',
      'brand: "[class*=_brand]:not([class*=_brandMark]):not([class*=_brandName]):not([class*=_brandIdentity])",',
      1, 'brand-selector-narrow')
    // J5 [2026-09-04] alpha.5 品牌区拆双 svg(brandMark=鲸鱼 24px / brandName=字标 156px,
    // viewBox 26 0 156 24)。旧单 svg 时代的 translateX(-27px) + overflow:visible 现在:
    // 鲸鱼 svg 被推到立绘脸上;字标 svg 右缘到 274,压住 logoRow 右下角面板开关(240,44)——
    // 用户截图里的「U 形残影」即开关 panelIcon 从徽章底下探出。新规则:鲸鱼藏(立绘替代);
    // 字标 flex:none 防被 span 压缩致双重缩放,scale(.78) 左缘对齐立绘右缘(114),徽章右缘
    // 235 < 开关 240;overflow:hidden 裁掉 brandName svg viewBox 外的旧鲸鱼(g 在 x0.1-23 < 26)。
    c = rep(c,
      '${SELECTORS.brand} svg { overflow: visible !important; transform: translateX(-27px); }',
      '${SELECTORS.brand} svg { overflow: hidden !important; transform: none; }\n' +
      '${SELECTORS.brand} [class*=_brandMark] svg { display: none !important; }\n' +
      '${SELECTORS.brand} [class*=_brandName] svg { flex: none; overflow: hidden !important; transform: scale(.78); transform-origin: left center; margin-left: -8px; }',
      1, 'brand-two-svg-fit')
    return c
  }

  return [{ ...rewrite(p, '.bak-q109', apply, failures), version: ver }]
}

// ---- [V] dsh-vision-router (批次 88b/93): remote.session 须随 remote 一并注入 ----
function patchVisionRouter() {
  const p = path.join(PLUGINS, 'dsh-vision-router', 'lib', 'client.js')
  if (!fs.existsSync(p)) return [{ file: 'dsh-vision-router', missing: true }]
  const ver = JSON.parse(fs.readFileSync(path.join(PLUGINS, 'dsh-vision-router', 'package.json'), 'utf8')).version
  const { rep, failures } = makeCtx('vision-router/client.js')
  const apply = (c) => {
    if (c.includes("exports.inject = ['settingsScope', 'slots', 'locale', 'sessions', 'remote', 'remote.session']")) return c
    c = rep(c,
      "exports.inject = ['settingsScope', 'slots', 'locale', 'sessions', 'remote']",
      "exports.inject = ['settingsScope', 'slots', 'locale', 'sessions', 'remote', 'remote.session']",
      1, 'remote-session-inject')
    return c
  }
  return [{ ...rewrite(p, '.bak-alpha5', apply, failures), version: ver }]
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
//       v8 修订(2026-09-06): 通用设置追加第五卡「归档会话管理」(sub:archive-manager,
//       section 由 dsh-plugin 注册);already 指纹加 sub:archive-manager,旧 v7 补丁态
//       经 bak 恢复重打升级。
//       v9 修订(2026-09-06,批次122): 通用设置追加第六卡「其它」(sub:other,与既有五卡
//       同级)——「提示音」「放入文件」移出基础设置迁入该子页。槽运行时 list 槽仅支持
//       only(单 id)无 except,GS 内按条目过滤不可行 → 换槽方案:children 声明扩
//       settings.general.other.item(同规格 list/root),两插件注册迁槽(见 [K10]);
//       GeneralSection 三形态(basics/other/入口卡),SEL 路由 sub:other → show:"other"+
//       only:"general"。already 指纹加 sub:other,旧 v8 补丁态经 bak 恢复重打升级;
//       [K9-G] 的 SEL 锚点随 v9 文本同步更新。
//       重放器语义:rewriteFresh(哨兵 + 上游漂移刷新);锚点不适配的旧缓存安全跳过不判失败。
function patchSettingsNest() {
  const results = []

  // K2d dshvt 皮肤页槽渲染点:包装 SkinSectionHost,零侵入 SkinTab 本体
  // ([K8 2026-09-05] 落点升级:换装(settings.skin.item)不再垫底后追,renderSlot
  //  透传进 SkinTab,在页面网格「自定义资产」分组之下渲染独立 vt_span 分组。)
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
          'function SkinSectionHost(props) { // [K2d] 透传 renderSlot 给 SkinTab(joi 换装迁入)',
          1, 'skin-host-sig')
        // [K8 2026-09-05] 换装落位调整:SkinSectionHost 不再整体后追垫底,改为把
        // renderSlot 透传进 SkinTab,由页面网格在「自定义资产」之下渲染独立分组。
        c = rep(c,
          'return react.createElement(SkinTab, { checkSkinCenter, checkPet });',
          'return react.createElement(SkinTab, { checkSkinCenter, checkPet, renderSlot: props && props.renderSlot });',
          1, 'skin-host-wrap')
        // [K8] SkinTab 侧:补 renderSlot 局部变量
        c = rep(c,
          'function SkinTab(props) {\n\t\t\tvar h = react.createElement;',
          'function SkinTab(props) {\n\t\t\t// [K8] 换装(settings.skin.item)在页面网格内渲染(见 skin-tab-suit-grid)\n\t\t\tvar renderSlot = props && props.renderSlot;\n\t\t\tvar h = react.createElement;',
          1, 'skin-tab-slot')
        // [K8] SkinTab 侧:自定义资产分组与 Wallpaper Engine 分组之间插入换装组
        c = rex(c,
          /h\("div", \{ className: "pm_list" \}, assetRows\)\),\r?\n\t+h\("div", \{ className: "vt_group vt_span" \},/,
          'h("div", { className: "pm_list" }, assetRows)),\n\t\t\t// [K8] 换装独立分组(joi settings.skin.item 槽):自定义资产之下、Wallpaper\n\t\t\t// Engine 之上,vt_span 跨双栏整行;joi 未安装/停用时 renderSlot 为空,零高不占位。\n\t\t\th("div", { className: "vt_group vt_span dsh-suit-slot" },\n\t\t\t\trenderSlot ? renderSlot("settings.skin.item", {}) : null),\n\t\t\th("div", { className: "vt_group vt_span" },',
          1, 'skin-tab-suit-grid')
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
  const ZH_NEW = '\t\t\t"openDocument": "打开配置文件",\n\t\t\t"openDocument.error": "无法打开配置文件",\n\t\t\t"general.nav": "通用设置",\n\t\t\t"general.page.desc": "常规偏好与系统级入口。",\n\t\t\t"sub.basics": "基础设置",\n\t\t\t"sub.basics.desc": "语言、外观等常规偏好。",\n\t\t\t"sub.experts": "专家",\n\t\t\t"sub.experts.desc": "查看并开关 The Agency 的领域专家。",\n\t\t\t"sub.backup": "备份与迁移",\n\t\t\t"sub.backup.desc": "备份、恢复、导入导出与远程同步 DSH 配置。",\n\t\t\t"sub.vision": "Vision Router",\n\t\t\t"sub.vision.desc": "识图路由、视觉链路与自动识图模型组。",\n\t\t\t"sub.archive": "归档会话管理",\n\t\t\t"sub.archive.desc": "查看已归档会话,恢复到侧栏或彻底删除。",\n\t\t\t"sub.other": "其它",\n\t\t\t"sub.other.desc": "提示音、文件放入等其它偏好。"\n\t\t};'
  const EN_OLD = '\t\t\t"openDocument": "Open configuration file",\n\t\t\t"openDocument.error": "Could not open configuration file",\n\t\t\t"general.nav": "General"\n\t\t};'
  const EN_NEW = '\t\t\t"openDocument": "Open configuration file",\n\t\t\t"openDocument.error": "Could not open configuration file",\n\t\t\t"general.nav": "General",\n\t\t\t"general.page.desc": "General preferences and system entries.",\n\t\t\t"sub.basics": "Basics",\n\t\t\t"sub.basics.desc": "Language, appearance and other general preferences.",\n\t\t\t"sub.experts": "Experts",\n\t\t\t"sub.experts.desc": "Toggle The Agency domain experts.",\n\t\t\t"sub.backup": "Backup & Migration",\n\t\t\t"sub.backup.desc": "Back up, restore, import and sync the DSH configuration.",\n\t\t\t"sub.vision": "Vision Router",\n\t\t\t"sub.vision.desc": "Vision routing, chains and auto-vision model groups.",\n\t\t\t"sub.archive": "Archived Sessions",\n\t\t\t"sub.archive.desc": "Browse archived sessions, restore them to the sidebar, or delete them for good.",\n\t\t\t"sub.other": "Other",\n\t\t\t"sub.other.desc": "Notification sound, file drop and other preferences."\n\t\t};'
  // [K2c v7 2026-09-03] 0.1.2-alpha.5 字典形态:zh/en 字典在 "general.nav" 之后新增
  // connection.* 六键,旧锚点("general.nav" 紧贴字典收尾 })失配 → 整文件被判
  // 「锚点不适配,安全跳过」(skipped:true 静默放行) → HIDE_TOP 从未生效 →
  // 专家/备份与迁移/Vision Router 三顶层入口复现(用户报告 09-03,R48 复发)。
  // 处置:新增 alpha 字典锚点变体,以 "connection.error" 行为右边界,sub 键插入其间。
  // 旧版(≤0.1.1,general.nav 收尾)仍走 legacy 变体,双形态共存。
  const ZH_OLD2 = '\t\t\t"openDocument": "打开配置文件",\n\t\t\t"openDocument.error": "无法打开配置文件",\n\t\t\t"general.nav": "通用设置",\n\t\t\t"connection.error": "连接异常",'
  const ZH_NEW2 = '\t\t\t"openDocument": "打开配置文件",\n\t\t\t"openDocument.error": "无法打开配置文件",\n\t\t\t"general.nav": "通用设置",\n\t\t\t"general.page.desc": "常规偏好与系统级入口。",\n\t\t\t"sub.basics": "基础设置",\n\t\t\t"sub.basics.desc": "语言、外观等常规偏好。",\n\t\t\t"sub.experts": "专家",\n\t\t\t"sub.experts.desc": "查看并开关 The Agency 的领域专家。",\n\t\t\t"sub.backup": "备份与迁移",\n\t\t\t"sub.backup.desc": "备份、恢复、导入导出与远程同步 DSH 配置。",\n\t\t\t"sub.vision": "Vision Router",\n\t\t\t"sub.vision.desc": "识图路由、视觉链路与自动识图模型组。",\n\t\t\t"sub.archive": "归档会话管理",\n\t\t\t"sub.archive.desc": "查看已归档会话,恢复到侧栏或彻底删除。",\n\t\t\t"sub.other": "其它",\n\t\t\t"sub.other.desc": "提示音、文件放入等其它偏好。",\n\t\t\t"connection.error": "连接异常",'
  const EN_OLD2 = '\t\t\t"openDocument": "Open configuration file",\n\t\t\t"openDocument.error": "Could not open configuration file",\n\t\t\t"general.nav": "General",\n\t\t\t"connection.error": "Disconnected",'
  const EN_NEW2 = '\t\t\t"openDocument": "Open configuration file",\n\t\t\t"openDocument.error": "Could not open configuration file",\n\t\t\t"general.nav": "General",\n\t\t\t"general.page.desc": "General preferences and system entries.",\n\t\t\t"sub.basics": "Basics",\n\t\t\t"sub.basics.desc": "Language, appearance and other general preferences.",\n\t\t\t"sub.experts": "Experts",\n\t\t\t"sub.experts.desc": "Toggle The Agency domain experts.",\n\t\t\t"sub.backup": "Backup & Migration",\n\t\t\t"sub.backup.desc": "Back up, restore, import and sync the DSH configuration.",\n\t\t\t"sub.vision": "Vision Router",\n\t\t\t"sub.vision.desc": "Vision routing, chains and auto-vision model groups.",\n\t\t\t"sub.archive": "Archived Sessions",\n\t\t\t"sub.archive.desc": "Browse archived sessions, restore them to the sidebar, or delete them for good.",\n\t\t\t"sub.other": "Other",\n\t\t\t"sub.other.desc": "Notification sound, file drop and other preferences.",\n\t\t\t"connection.error": "Disconnected",'
  const GS_OLD = 'function GeneralSection({ renderSlot }) {\n\t\t\treturn (0, react_jsx_runtime.jsx)("div", {\n\t\t\t\tclassName: GeneralSection_module_css_default.section,\n\t\t\t\tchildren: renderSlot("settings.general.item", {})\n\t\t\t});\n\t\t}'
  const GS_NEW = 'function GeneralSection({ renderSlot, select, t, show }) {\n\t\t\t// [K2c v6 2026-09-01] 通用设置双形态:show==="basics" 渲染原通用设置内容(基础设置子页);否则渲染二级入口卡\n\t\t\t// [K2c v9 2026-09-06] 三形态:basics=常规项(settings.general.item 槽);other=其它页\n\t\t\t// (提示音/文件放入,settings.general.other.item 槽,条目经 [K10] 迁槽);默认=二级入口卡。\n\t\t\tif (show === "basics" || show === "other") {\n\t\t\t\treturn (0, react_jsx_runtime.jsx)("div", {\n\t\t\t\t\tclassName: GeneralSection_module_css_default.section,\n\t\t\t\t\tchildren: renderSlot(show === "other" ? "settings.general.other.item" : "settings.general.item", {})\n\t\t\t\t});\n\t\t\t}\n\t\t\tconst entries = select === void 0 || t === void 0 ? [] : [\n\t\t\t\t["sub:basics", t("sub.basics"), t("sub.basics.desc")],\n\t\t\t\t["sub:agency-agents", t("sub.experts"), t("sub.experts.desc")],\n\t\t\t\t["sub:config-manager", t("sub.backup"), t("sub.backup.desc")],\n\t\t\t\t["sub:vision-router", t("sub.vision"), t("sub.vision.desc")],\n\t\t\t\t["sub:archive-manager", t("sub.archive"), t("sub.archive.desc")],\n\t\t\t\t["sub:other", t("sub.other"), t("sub.other.desc")]\n\t\t\t];\n\t\t\treturn (0, react_jsx_runtime.jsx)("div", {\n\t\t\t\tclassName: GeneralSection_module_css_default.section,\n\t\t\t\tchildren: [(0, react_jsx_runtime.jsx)("div", {\n\t\t\t\t\tclassName: "sGenHead",\n\t\t\t\t\tchildren: [(0, react_jsx_runtime.jsx)("span", {\n\t\t\t\t\t\tclassName: "sGenHeadTitle",\n\t\t\t\t\t\tchildren: t("general.nav")\n\t\t\t\t\t}), (0, react_jsx_runtime.jsx)("span", {\n\t\t\t\t\t\tclassName: "sGenHeadDesc",\n\t\t\t\t\t\tchildren: t("general.page.desc")\n\t\t\t\t\t})]\n\t\t\t\t}), (0, react_jsx_runtime.jsx)("div", {\n\t\t\t\t\tclassName: "sGenSubGrid",\n\t\t\t\t\tchildren: entries.map(([id, label, desc]) => (0, react_jsx_runtime.jsx)("button", {\n\t\t\t\t\t\ttype: "button",\n\t\t\t\t\t\tclassName: "sGenSubCard",\n\t\t\t\t\t\tonClick: () => {\n\t\t\t\t\t\t\tselect(id);\n\t\t\t\t\t\t},\n\t\t\t\t\t\tchildren: [(0, react_jsx_runtime.jsx)("span", {\n\t\t\t\t\t\t\tclassName: "sGenSubCardTitle",\n\t\t\t\t\t\t\tchildren: label\n\t\t\t\t\t\t}), (0, react_jsx_runtime.jsx)("span", {\n\t\t\t\t\t\t\tclassName: "sGenSubCardDesc",\n\t\t\t\t\t\t\tchildren: desc\n\t\t\t\t\t\t}), (0, react_jsx_runtime.jsx)("span", {\n\t\t\t\t\t\t\tclassName: "sGenSubCardGo",\n\t\t\t\t\t\t\tchildren: "›"\n\t\t\t\t\t\t})]\n\t\t\t\t\t}, id))\n\t\t\t\t})]\n\t\t\t});\n\t\t}'
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
  const CSSNEST_INJECT = '\t\tconst cssNest = "[data-slot=\\"settings.general.other.item\\"]>:last-child{border-bottom:none!important}button[data-dsh-sub=\\"true\\"]{display:none!important}.sGenHead{display:flex;flex-direction:column;gap:2px;width:100%}.sGenHeadTitle{font-size:15px;font-weight:600;line-height:22px;color:var(--dsw-alias-label-primary)}.sGenHeadDesc{font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}.sGenSubGrid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:30px 0 6px;width:100%}.sGenSubCard{box-sizing:border-box;display:grid;grid-template-columns:1fr auto;column-gap:12px;align-items:center;width:100%;min-height:64px;text-align:left;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:11px 14px;cursor:pointer;color:var(--dsw-alias-label-primary);font-family:inherit;transition:border-color .3s cubic-bezier(.32,.72,0,1),background-color .3s cubic-bezier(.32,.72,0,1)}.sGenSubCard:hover{border-color:#d97757;background:var(--dsw-specific-sidebar-nav-item-hover)}.sGenSubCard:focus-visible{outline:2px solid rgba(217,119,87,.5);outline-offset:2px}.sGenSubCardTitle{grid-column:1;grid-row:1;font-size:14px;font-weight:500;line-height:20px;color:var(--dsw-alias-label-primary);transition:color .3s cubic-bezier(.32,.72,0,1)}.sGenSubCard:hover .sGenSubCardTitle{color:#d97757}.sGenSubCardDesc{grid-column:1;grid-row:2;font-size:12px;line-height:17px;color:var(--dsw-alias-label-secondary)}.sGenSubCardGo{grid-column:2;grid-row:1/3;justify-self:end;color:var(--dsw-alias-label-tertiary);font-size:16px;line-height:1;transition:transform .3s cubic-bezier(.32,.72,0,1),color .3s cubic-bezier(.32,.72,0,1)}.sGenSubCard:hover .sGenSubCardGo{transform:translateX(3px);color:#d97757}@media (prefers-reduced-motion:reduce){.sGenSubCard,.sGenSubCardTitle,.sGenSubCardGo{transition:none!important}.sGenSubCard:hover .sGenSubCardGo{transform:none}}";\n\t\tconst tagIdNest = "@deepseek-ai/dsh-client-ui-settings-general/nesting.module.css";\n\t\tif (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagIdNest) + "]") === null) {\n\t\t\tconst tag = document.createElement("style");\n\t\t\ttag.dataset.plugin = "@deepseek-ai/dsh-client-ui-settings-general";\n\t\t\ttag.dataset.pluginCss = tagIdNest;\n\t\t\ttag.textContent = cssNest;\n\t\t\tdocument.head.appendChild(tag);\n\t\t}\n'
  const ROOTVAR_ANCHOR = '\t\tvar SettingsRoot_module_css_default = {'
  const GENREG_OLD = 'label: () => t("general.nav"),\n\t\t\t\tlocale: NS,\n\t\t\t\tchildren: { "settings.general.item": {'
  const GENREG_NEW = 'label: () => t("general.nav"),\n\t\t\t\tlocale: NS,\n\t\t\t\tinject: () => ({ t }),\n\t\t\t\tchildren: { "settings.general.item": {'
  const BASICS_REG_OLD = '\t\t\t}, GeneralSection));'
  const BASICS_REG_NEW = '\t\t\t}, GeneralSection));'
  // [K10 v9 配套] general section children 声明扩槽:settings.general.other.item(与
  // settings.general.item 同规格 list/root)。两插件 inject 等待声明后自动落位,声明缺失
  // 时 renderSlot 拿不到任何条目(K2d skin 槽同教训)。缩进无关正则(rc.x 缩进漂移免疫)。
  const GENSLOT_RE = /children: \{ "settings\.general\.item": \{\r?\n\t+kind: "list",\r?\n\t+scope: "root"\r?\n\t+\} \}/
  const GENSLOT_NEW = 'children: { "settings.general.item": {\n\t\t\t\t\tkind: "list",\n\t\t\t\t\tscope: "root"\n\t\t\t\t}, "settings.general.other.item": {\n\t\t\t\t\tkind: "list",\n\t\t\t\t\tscope: "root"\n\t\t\t\t} }'
  // rc.x 缩进漂移(rc.2=内部8tab / rc.5=7tab):整块用缩进无关正则捕获,重打为固定7tab形态
  const ROWS_RE = /rows = ctx\.slots\.entries\("settings\.section"\)\.map\(\(e\) => \(\{\n\t+\/\* v8 ignore next[^\n]*?\*\/\n\t+id: e\.options\.id \?\? "",\n\t+order: e\.options\.order \?\? 0,\n\t+label: \(0, _deepseek_ai_dsh_client_ui_slots\.resolveSlotLabel\)\(e\.options\.label\) \?\? ""\n\t+\}\)\)\.sort\(\(a, b\) => a\.order - b\.order\);/
  const ROWS_NEW = 'rows = (() => {\n\t\t\t\t\t\t\t// [K2a v4] 二级页面:三个顶层入口从导航隐藏(仅经 general 下子行可达);\n\t\t\t\t\t\t\t// 基础设置子行复用 general 条目(sub:basics + show 标记),无独立账本条目。\n\t\t\t\t\t\t\t// [v9] 其它子行同款复用(sub:other → general + show:"other")。\n\t\t\t\t\t\t\tconst HIDE_TOP = ["agency-agents", "config-manager", "vision-router", "archive-manager"];\n\t\t\t\t\t\t\tconst CHILD_IDS = ["basics", "agency-agents", "config-manager", "vision-router", "archive-manager", "other"];\n\t\t\t\t\t\t\tconst all = ctx.slots.entries("settings.section");\n\t\t\t\t\t\t\tconst flat = all.filter((e) => !HIDE_TOP.includes(e.options.id)).map((e) => ({\n\t\t\t\t\t\t\t\tid: e.options.id ?? "",\n\t\t\t\t\t\t\t\torder: e.options.order ?? 0,\n\t\t\t\t\t\t\t\tlabel: (0, _deepseek_ai_dsh_client_ui_slots.resolveSlotLabel)(e.options.label) ?? ""\n\t\t\t\t\t\t\t})).sort((a, b) => a.order - b.order);\n\t\t\t\t\t\t\tconst childRows = CHILD_IDS.map((id) => {\n\t\t\t\t\t\t\t\tif (id === "basics") return { id: "sub:basics", order: 0, label: t("sub.basics"), child: true };\n\t\t\t\t\t\t\t\tif (id === "other") return { id: "sub:other", order: 0, label: t("sub.other"), child: true };\n\t\t\t\t\t\t\t\tconst e = all.find((cand) => cand.options.id === id);\n\t\t\t\t\t\t\t\treturn { id: "sub:" + id, order: 0, label: e ? ((0, _deepseek_ai_dsh_client_ui_slots.resolveSlotLabel)(e.options.label) ?? "") : id, child: true };\n\t\t\t\t\t\t\t});\n\t\t\t\t\t\t\tconst top = [];\n\t\t\t\t\t\t\tlet attached = false;\n\t\t\t\t\t\t\tfor (const row of flat) {\n\t\t\t\t\t\t\t\ttop.push(row);\n\t\t\t\t\t\t\t\tif (!attached && row.id === "general") {\n\t\t\t\t\t\t\t\t\tfor (const child of childRows) top.push(child);\n\t\t\t\t\t\t\t\t\tattached = true;\n\t\t\t\t\t\t\t\t}\n\t\t\t\t\t\t\t}\n\t\t\t\t\t\t\tif (!attached && childRows.length > 0) for (const child of childRows) top.push(child);\n\t\t\t\t\t\t\treturn top;\n\t\t\t\t\t\t})();'
  const NAVCELL_OLD = 'className: clsx(SettingsRoot_module_css_default.navCell, row.id === active && SettingsRoot_module_css_default.active),'
  const NAVCELL_NEW = 'className: clsx(SettingsRoot_module_css_default.navCell, row.id === active && SettingsRoot_module_css_default.active),\n\t\t\t\t\t\t\t\t"data-dsh-sub": row.child === true ? "true" : void 0,'
  const SEL_OLD = 'renderSlot("settings.section", { close: onClose }, { only: active })'
  const SEL_NEW = 'renderSlot("settings.section", { close: onClose, select: onSelect, show: active === "sub:basics" ? "basics" : active === "sub:other" ? "other" : void 0 }, { only: active === "sub:basics" || active === "sub:other" ? "general" : active.indexOf("sub:") === 0 ? active.slice(4) : active })'

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
    // [v7 2026-09-03] 字典双形态门:legacy(≤0.1.1,"general.nav" 紧贴字典收尾)与
    // alpha(0.1.2+,"general.nav" 后接 connection.* 六键)任一命中即进入重打。
    // 两者都失配才落入旧修订/跳过分支。
    const dictLegacy = head.includes(ZH_OLD) && head.includes(GS_OLD)
    const dictAlpha = head.includes(ZH_OLD2) && head.includes(GS_OLD)
    if (!dictLegacy && !dictAlpha) {
      if (head.includes('sGenSubGrid') && head.includes('sub:basics') && head.includes('sub:archive-manager') && head.includes('sub:other')) {
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
      // [v7] 字典形态分派:alpha(0.1.2+)用 ZH_OLD2/EN_OLD2 变体,legacy 用原锚点。
      // [v8 修正] 形态按本次实际所打内容 c 现判,不再读外层 head 闭包——v8 指纹首次让
      // v4+/v7 补丁态副本流入 bak 恢复重打通道,恢复后的 pristine 是 legacy 形态而旧
      // 闭包值恒 false,被 alpha 锚点拒打(zh/en-sub-keys matched 0,FAIL 不写盘)。
      // 同时令 rewriteFresh 上游漂移通道对新漂移内容同样现判形态,自愈更完整。
      const legacyNow = c.includes(ZH_OLD) && c.includes(GS_OLD)
      c = rep(c, legacyNow ? ZH_OLD : ZH_OLD2, legacyNow ? ZH_NEW : ZH_NEW2, 1, 'zh-sub-keys')
      c = rep(c, legacyNow ? EN_OLD : EN_OLD2, legacyNow ? EN_NEW : EN_NEW2, 1, 'en-sub-keys')
      c = rep(c, GS_OLD, GS_NEW, 1, 'general-section')
      c = rep(c, ROOTVAR_ANCHOR, CSSNEST_INJECT + ROOTVAR_ANCHOR, 1, 'nest-css')
      c = rep(c, GENREG_OLD, GENREG_NEW, 1, 'general-inject-t')
      c = rex(c, GENSLOT_RE, GENSLOT_NEW, 1, 'gen-other-slot-decl')
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

// ---- [K10] 提示音/放入文件迁槽 settings.general.other.item(2026-09-06,批次122;K v9 配套) ----
//       用户需求:「提示音」「放入文件」移出基础设置,通用设置下新增同级「其它」入口承载。
//       槽运行时 list 槽仅支持 only(单 id)无 except,GS 内按条目过滤不可行 → 直接换槽:
//       dsh-notify-sound / dsh-file-drop 两插件 lib 的 settings.general.item 注册改写为
//       settings.general.other.item;槽声明由 K v9 的 gen-other-slot-decl 扩入 general
//       section children,GS other 形态消费——基础设置页天然不再出现两区块。
//       注意:两插件目录是 profile junction 回工作区源码,补丁直接落 git 树(已修改属预期,
//       .bak-gen-other 可还原);插件上游更新走 rewriteFresh 漂移重打。
const K10_MARK = '/*dsh-local-patch:k10-general-other*/'
function patchGeneralOtherSlot() {
  const results = []
  for (const name of ['dsh-notify-sound', 'dsh-file-drop']) {
    const p = path.join(PLUGINS, name, 'lib', 'client.js')
    if (!fs.existsSync(p)) { results.push({ file: name + '/client.js', missing: true }); continue }
    const ver = JSON.parse(fs.readFileSync(path.join(PLUGINS, name, 'package.json'), 'utf8')).version
    const { rep, failures } = makeCtx(name + '/client.js')
    const apply = (c) => {
      c = rep(c,
        'ctx.slots.inject("settings.general.item", () => ctx.slots.register({',
        'ctx.slots.inject("settings.general.other.item", () => ctx.slots.register({',
        1, 'k10-inject-slot')
      c = rep(c,
        'name: "settings.general.item",',
        'name: "settings.general.other.item",',
        1, 'k10-entry-name')
      return c
    }
    results.push({ ...rewriteFresh(p, '.bak-gen-other', apply, failures, K10_MARK), version: ver })
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

// ---- [N] settings.plugin.item list 槽 id 适配(2026-08-30,本地轨 client 契约变更) ----
// 症状: 本地构建轨(apps/web 联邦分支 dist)启动即「Failed to load plugins」致命页——
//       failed to apply loader entry …: list slot "settings.plugin.item" requires options.id。
//       @yeesy369/dsh-browser-playwright / @yeesy369/dsh-web-permission / @anionex/dsh-turn-rewind
//       三插件齐挂,官方轨(0.1.1-rc.2)同环境正常。
// 根因: 本地轨 client 把 settings.plugin.item 从 keyed 语义升级为 list 语义,注册强制
//       options.id(官方 client 无此校验,key 即合法);三插件仅带 key: 注册 → 本地轨
//       apply 抛错。三插件 2026-08-30 凌晨新装,此前本地轨验收从未带它们跑过。
// 修法: 与 dsh-vision-router 上游适配同款(key 供官方轨 keyed 槽、id 供本地轨 list 槽
//       双字段并存注册)——key 行后补同行 id,profile 层单文件双轨生效(P 面)。
// [问题135 批次100 2026-09-04 追加] turn-rewind 未水合快照崩溃守卫(仅 dsh-turn-rewind 分支):
//       会话恢复期 header-actions 槽挂载时 chat store 尚未水合,RewindMessagePortals 的
//       useSession 选择器 snapshot.chat?.nodes.values() ?? snapshot.nodes 回落 undefined,
//       collectPortalTargets 的 for...of 在 useLayoutEffect 内同步抛 TypeError,nodes is not
//       iterable,宿主错误边界报 slot entry crashed 并把槽位整块摘除(每次刷新必现)。
//       与 问题109 同族教训:「API 无数据回落必须与正常响应同形状」。修法 = 选择器回落补
//       ?? [](空数组可迭代)+ collectPortalTargets 入口非可迭代守卫按空集处理,chat 水合
//       后 useSession 重推自愈。lib + src 双侧(防本地 rebuild 复现)。同一 apply 链内追加
//       (哨兵按文件短路,拆函数会在上游刷新时被 [N] 的哨兵挡住永不重打)。
function patchPluginSettingsItemId() {
  const targets = [
    ['@yeesy369', 'dsh-browser-playwright', 'key: "browser-playwright",', '    id: "browser-playwright",'],
    ['@yeesy369', 'dsh-web-permission', 'key: "web-permission",', '    id: "web-permission",'],
    ['@anionex', 'dsh-turn-rewind', "key: 'turn-rewind',", "        id: 'turn-rewind',"],
  ]
  const results = []
  for (const [scope, name, keyLine, idLine] of targets) {
    const p = path.join(PLUGINS, scope, name, 'lib', 'client.js')
    if (!fs.existsSync(p)) { results.push({ file: name + '/client.js', missing: true }); continue }
    const ver = JSON.parse(fs.readFileSync(path.join(PLUGINS, scope, name, 'package.json'), 'utf8')).version
    const { rep, failures } = makeCtx(name + '/client.js')
    const apply = (c) => {
      // key 行全文件唯一(expected=1 计数保证);缩进随各插件产物风格(4/4/8 空格,预检实测)
      c = rep(c, keyLine, keyLine + '\n' + idLine, 1, 'list-slot-id')
      if (name === 'dsh-turn-rewind') {
        // [问题135 批次100] ① 选择器换稳定快照:原样 snapshot.chat?.nodes.values() 每次
        // 调用产出新迭代器,useSession(useSyncExternalStore 族)要求 getSnapshot 结果
        // 缓存——不稳定快照在 store 密集发射(会话打开/恢复水合)时无限重渲染,
        // Minified React error #185(maximum update depth),同一槽位错误边界再次整摘。
        // ② selectRewindNodes 内容记忆化:元素逐位全等时复用上次数组引用。
        c = rep(c,
          'function RewindMessagePortals({ sessionId, openRestoredSession, useSession }) {',
          'var rewindNodeCache = null;\nfunction selectRewindNodes(snapshot) {\n    const next = snapshot.chat && snapshot.chat.nodes ? Array.from(snapshot.chat.nodes.values()) : (snapshot.nodes ?? []);\n    if (rewindNodeCache && rewindNodeCache.length === next.length && rewindNodeCache.every((value, index) => value === next[index]))\n        return rewindNodeCache;\n    rewindNodeCache = next;\n    return next;\n}\nfunction RewindMessagePortals({ sessionId, openRestoredSession, useSession }) {',
          1, 'nodes-stable-selector-helper')
        c = rep(c,
          'const nodes = useSession(snapshot => snapshot.chat?.nodes.values() ?? snapshot.nodes);',
          'const nodes = useSession(selectRewindNodes);',
          1, 'nodes-selector-fallback')
        c = rep(c,
          'function collectPortalTargets(nodes) {',
          'function collectPortalTargets(nodes) {\n    if (nodes == null || typeof nodes[Symbol.iterator] !== "function")\n        return [];',
          1, 'collect-portal-iterable-guard')
        // [2026-09-06] settings.plugin.item 卡片(inject 回调)访问 ctx.settingsScope,但
        // exports.inject 未声明 → cordis 守卫抛 cannot get property "settingsScope"
        // without inject,槽位错误边界每次渲染整块卸载 settings.section(设置页闪崩/闪现)。
        // 修法 = 批次 88 vision-router 同款:exports.inject 补声明服务名(lib+src 双侧)。
        c = rep(c,
          "exports.inject = ['slots', 'sessions', 'conversation'];",
          "exports.inject = ['slots', 'sessions', 'conversation', 'settingsScope'];",
          1, 'settings-scope-inject')
      }
      return c
    }
    results.push({ ...rewrite(p, '.bak-spiid', apply, failures), version: ver })
  }
  // [问题135 批次100] src 源码同步(仅 turn-rewind;无哨兵历史,首次重放即落地)
  const srcTsx = path.join(PLUGINS, '@anionex', 'dsh-turn-rewind', 'src', 'client', 'index.tsx')
  if (fs.existsSync(srcTsx)) {
    const verSr = JSON.parse(fs.readFileSync(path.join(PLUGINS, '@anionex', 'dsh-turn-rewind', 'package.json'), 'utf8')).version
    const { rep: reps, failures: fsr } = makeCtx('dsh-turn-rewind/src/client/index.tsx')
    const applySrc = (c) => {
      c = reps(c,
        'function RewindMessagePortals({ sessionId, openRestoredSession, useSession }: RewindPortalBridgeProps): ReactNode {',
        'let rewindNodeCache: readonly RewindNodeLike[] | null = null\nfunction selectRewindNodes(snapshot: { readonly chat?: { readonly nodes: { readonly values: () => Iterable<RewindNodeLike> } | null }; readonly nodes?: readonly RewindNodeLike[] }): readonly RewindNodeLike[] {\n  const next = snapshot.chat ? Array.from(snapshot.chat.nodes.values()) : (snapshot.nodes ?? [])\n  if (rewindNodeCache && rewindNodeCache.length === next.length && rewindNodeCache.every((value, index) => value === next[index])) return rewindNodeCache\n  rewindNodeCache = next\n  return next\n}\nfunction RewindMessagePortals({ sessionId, openRestoredSession, useSession }: RewindPortalBridgeProps): ReactNode {',
        1, 'nodes-stable-selector-helper-src')
      c = reps(c,
        'const nodes = useSession<readonly RewindNodeLike[]>(snapshot => snapshot.chat?.nodes.values() ?? snapshot.nodes)',
        'const nodes = useSession<readonly RewindNodeLike[]>(selectRewindNodes)',
        1, 'nodes-selector-fallback-src')
      c = reps(c,
        'function collectPortalTargets(nodes: readonly RewindNodeLike[]): readonly RewindPortalTarget[] {',
        'function collectPortalTargets(nodes: readonly RewindNodeLike[]): readonly RewindPortalTarget[] {\n  if (nodes == null || typeof nodes[Symbol.iterator] !== "function") return []',
        1, 'collect-portal-iterable-guard-src')
      c = reps(c,
        "export const inject = ['slots', 'sessions', 'conversation']",
        "export const inject = ['slots', 'sessions', 'conversation', 'settingsScope']",
        1, 'settings-scope-inject-src')
      return c
    }
    results.push({ ...rewrite(srcTsx, '.bak-nodes-src', applySrc, fsr), version: verSr })
  }
  return results
}

// ---- [O] dsh-mnemon 投影 def 双契约适配(2026-08-30,本地轨投影契约滞后) ----
// 症状: 本地构建轨全部会话历史打不开——history unavailable for session …: TypeError:
//       Cannot read properties of undefined (reading 'parse')(internal);官方轨同库正常。
// 根因: mnemon 0.3.5(2026-08-30 凌晨随插件潮更新)按官方 0.1.1 契约注册会话投影
//       ({stateSchema, wire:{viewSchema, view}}),而本地分支(0.1.0-rc.5 基座)契约是
//       {schema(ZodType 必填), view(state)}。register() 只校验 stateVersion 不查 schema,
//       注册静默成功;任一会话快照/restore/drive 读到 def.schema.parse 即 TypeError,
//       history 服务包装成致命「历史不可用」。与 [N] 同族:双轨契约分叉,插件跟官方走。
// 修法: def 定义后桥接两行——schema←wire.viewSchema、view←wire.view(同对象复用,零
//       语义漂移);profile 层单文件双轨生效(官方轨多两行惰性赋值,无害)。
function patchMnemonProjection() {
  const p = path.join(PLUGINS, 'dsh-mnemon', 'lib', 'index.js')
  if (!fs.existsSync(p)) return [{ file: 'dsh-mnemon/lib/index.js', missing: true }]
  const ver = JSON.parse(fs.readFileSync(path.join(PLUGINS, 'dsh-mnemon', 'package.json'), 'utf8')).version
  const { rep, failures } = makeCtx('dsh-mnemon/lib/index.js')
  const apply = (c) => {
    c = rep(c,
      '\n};\n/** Register lazily when the optional DSH projection service is present. */',
      '\n};\nmnemonSubagentTokenUsageProjectionDefinition.schema = mnemonSubagentTokenUsageProjectionDefinition.wire.viewSchema;\nmnemonSubagentTokenUsageProjectionDefinition.view = mnemonSubagentTokenUsageProjectionDefinition.wire.view;\n/** Register lazily when the optional DSH projection service is present. */',
      1, 'projection-schema-bridge')
    return c
  }
  return [{ ...rewrite(p, '.bak-mnemproj', apply, failures), version: ver }]
}

// ---- [P] 新会话无工作区兜底(R68,2026-08-30) ----
// 症状: 侧栏「新会话」按钮在「无当前会话 + recentWorkspaceId 解析不到」时走
//       startSession 的 target===void 0 分支 → sessions.clear() 静默死路(按钮点了
//       没反应,活体实测:零 console、零 DOM 变化、零会话创建)——用户被迫先去工作区
//       面板挑文件夹才能开聊。
// 根因: client runtime startSession 回退链「显式 workspaceId → 当前会话工作区 →
//       最近工作区」没有终点兜底;而 host 端 session.create 早已支持空载荷
//       (cwd = workspace ?? federation ?? payload.cwd ?? defaults.cwd,部署默认目录),
//       wire schema 全字段 optional——纯客户端死路。
// 修法: target===void 0 分支改「api.sessions.create({}) 创建无工作区会话 + open」,
//       失败回落原 clear 语义。会话落部署默认 cwd(本机=用户主目录)、侧栏按 cwd
//       归组(既有未分组机制兜底)。锚点双根字节一致(local monorepo + npx 缓存全部
//       hash 并存版本),O+L 双轨同步生效。
function patchNewSessionFallback() {
  const FROM = '\n\t\t\t\tif (target === void 0) {\n\t\t\t\t\tthis.sessions.clear();\n\t\t\t\t\treturn;\n\t\t\t\t}'
  const TO = '\n\t\t\t\tif (target === void 0) {\n\t\t\t\t\t// [dsh-desktop] R68: 无工作区可继承时不再清空死路——创建无工作区会话(host 落部署默认 cwd)并打开\n\t\t\t\t\tthis.api.sessions.create({}).then(({ result }) => {\n\t\t\t\t\t\tif (result.ok) this.sessions.open(result.value.sessionId);\n\t\t\t\t\t\telse this.sessions.clear();\n\t\t\t\t\t}).catch((reason) => {\n\t\t\t\t\t\tconsole.warn("workspace-less session creation failed:", reason);\n\t\t\t\t\t\tthis.sessions.clear();\n\t\t\t\t\t});\n\t\t\t\t\treturn;\n\t\t\t\t}'
  const files = []
  const localRuntime = process.env.DSH_LOCAL_RUNTIME_ROOT
    || ['D:\\deepseek harness\\deepseek-harness\\packages\\client\\runtime\\lib\\client.js',
      path.join(os.homedir(), 'deepseek-harness', 'packages', 'client', 'runtime', 'lib', 'client.js')]
      .find((f) => fs.existsSync(f))
  if (localRuntime) files.push(localRuntime)
  const npxRoot = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), '.npm-cache'), 'npm-cache', '_npx')
  if (fs.existsSync(npxRoot)) {
    for (const h of fs.readdirSync(npxRoot)) {
      const f = path.join(npxRoot, h, 'node_modules', '@deepseek-ai', 'dsh-client-runtime', 'lib', 'client.js')
      if (fs.existsSync(f)) files.push(f)
    }
  }
  if (!files.length) return [{ file: 'client-runtime/lib/client.js', missing: true }]
  const results = []
  for (const p of files) {
    const { rep, failures } = makeCtx('client-runtime/lib/client.js')
    const apply = (c) => rep(c, FROM, TO, 1, 'new-session-fallback')
    results.push({ ...rewrite(p, '.bak-newsess', apply, failures), version: 'runtime' })
  }
  return results
}

// ---- [Q] 工作区下拉新增「不选择工作区」(R70,2026-08-30) ----
// 症状: 对话主页的工作区下拉(桌面美化 ▾)只有 工作区行/添加工作区(/添加联合工作区)。
//       想「不开工作区直接开聊」只有 R68 的死路兜底——而那仅在「无当前会话 + 无最近
//       工作区」时触发;有最近工作区时新会话仍会被继承链拖回工作区,用户无处表达
//       「这次就想要无工作区会话」。
// 修法: 注入工厂 pickerInjected 增加 startBlankSession(ctx.sessions.create({}) 落部署
//       默认 cwd,与 [P] 同一条 wire 通路;返回形状做 string/result 双兼容),菜单在
//       「添加工作区」之下插入「不选择工作区」条目并以 startBlankSession 在位为门
//       (WorkspaceBrowser 直用 WorkspacePickFlow 不传该 prop → 侧栏菜单自动不带,
//       互不干扰),handleSelect 加分支 onClose+startBlankSession。七处锚点两轨各一套
//       (官方 0.1.1-rc.2 无联合工作区特性,addEntries/签名与本地 rc.5 基座不同形)。
const NOWS_ICON = '(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconFolderClose16, { size: 16 })'
function nowsApplyEdits(rep, isLocal, failures) {
  const ENTRY = '{\n\t\t\t\tid: ADD_NO_WORKSPACE,\n\t\t\t\tlabel: "不选择工作区",\n\t\t\t\ticon: ' + NOWS_ICON + ',\n\t\t\t\tdisabled: flowBusy\n\t\t\t}'
  const START_BLANK = 'startBlankSession: () => {\n\t\t\t\t\tPromise.resolve(ctx.sessions.create({})).then((created) => {\n\t\t\t\t\t\tconst sessionId = typeof created === "string" ? created : created && created.sessionId;\n\t\t\t\t\t\tif (sessionId) ctx.sessions.open(sessionId);\n\t\t\t\t\t}).catch(() => {});\n\t\t\t\t},'
  const addWork = '\t\t\t\tid: ADD_WORKSPACE,\n\t\t\t\tlabel: t("menu.addWorkspace"),\n\t\t\t\ticon: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconPlusOutline16, { size: 16 }),\n\t\t\t\tdisabled: flowBusy'
  const edits = [
    // q-const 条目 id 常量(两轨同形)
    ['\t\tconst ADD_WORKSPACE = "::add-workspace";',
      '\t\tconst ADD_WORKSPACE = "::add-workspace";\n\t\t/** [dsh-desktop] R70 「不选择工作区」条目(仅 picker 注入 startBlankSession 时出现在菜单) */\n\t\tconst ADD_NO_WORKSPACE = "::add-no-workspace";'],
  ]
  if (isLocal) {
    edits.push(
      // q-flow-sig(本地轨含 createFederation/startFederatedSession)
      ['function WorkspacePickFlow({ t, open, anchorRef, useWorkspaces, createWorkspace, createFederation, startFederatedSession, useDirectoryFlow,',
        'function WorkspacePickFlow({ t, open, anchorRef, useWorkspaces, createWorkspace, createFederation, startFederatedSession, startBlankSession, useDirectoryFlow,'],
      // q-add-entries(插在添加工作区之后、联合工作区之前;门控三元必须带 : [] else 分支)
      ['\t\t\tconst addEntries = [...flowAvailable ? [{\n' + addWork + '\n\t\t\t}] : [], ...federationsShown ? [{',
        '\t\t\tconst addEntries = [...flowAvailable ? [{\n' + addWork + '\n\t\t\t}] : [], ...startBlankSession ? [' + ENTRY + '] : [], ...federationsShown ? [{'],
      // q-picker-sig(外层透传组件)
      ['function WorkspacePicker({ open, anchorRef, useWorkspaces, selectedId, onPick, onClose, createWorkspace, createFederation, startFederatedSession, useDirectoryFlow, renderSlot, t }) {',
        'function WorkspacePicker({ open, anchorRef, useWorkspaces, selectedId, onPick, onClose, createWorkspace, createFederation, startFederatedSession, startBlankSession, useDirectoryFlow, renderSlot, t }) {'],
      // q-jsx-forward
      ['\t\t\t\tcreateFederation,\n\t\t\t\tstartFederatedSession,\n\t\t\t\tuseDirectoryFlow,',
        '\t\t\t\tcreateFederation,\n\t\t\t\tstartFederatedSession,\n\t\t\t\tstartBlankSession,\n\t\t\t\tuseDirectoryFlow,'],
      // q-inject-factory
      ['\t\t\t\thooks: { directoryFlow: pickerFlowSource }',
        '\t\t\t\t' + START_BLANK + '\n\t\t\t\thooks: { directoryFlow: pickerFlowSource }'],
    )
  } else {
    edits.push(
      // q-flow-sig(官方轨无联合工作区)
      ['function WorkspacePickFlow({ t, open, anchorRef, useWorkspaces, createWorkspace, useDirectoryFlow,',
        'function WorkspacePickFlow({ t, open, anchorRef, useWorkspaces, createWorkspace, startBlankSession, useDirectoryFlow,'],
      // q-add-entries(同门控三元:补 : [] else 分支)
      ['\t\t\tconst addEntries = flowAvailable ? [{\n' + addWork + '\n\t\t\t}] : [];',
        '\t\t\tconst addEntries = [...flowAvailable ? [{\n' + addWork + '\n\t\t\t}] : [], ...startBlankSession ? [' + ENTRY + '] : []];'],
      // q-picker-sig
      ['function WorkspacePicker({ open, anchorRef, useWorkspaces, selectedId, onPick, onClose, createWorkspace, useDirectoryFlow, renderSlot, t }) {',
        'function WorkspacePicker({ open, anchorRef, useWorkspaces, selectedId, onPick, onClose, createWorkspace, startBlankSession, useDirectoryFlow, renderSlot, t }) {'],
      // q-jsx-forward
      ['\t\t\t\tuseWorkspaces,\n\t\t\t\tcreateWorkspace,\n\t\t\t\tuseDirectoryFlow,',
        '\t\t\t\tuseWorkspaces,\n\t\t\t\tcreateWorkspace,\n\t\t\t\tstartBlankSession,\n\t\t\t\tuseDirectoryFlow,'],
    )
  }
  // q-select-branch(handleSelect 开头插分支;两轨 if 体不同,各自带足上下文)
  edits.push(isLocal
    ? ['\t\t\tconst handleSelect = (id) => {\n\t\t\t\tif (id === ADD_WORKSPACE) {',
      '\t\t\tconst handleSelect = (id) => {\n\t\t\t\tif (id === ADD_NO_WORKSPACE) {\n\t\t\t\t\tonClose();\n\t\t\t\t\tif (startBlankSession) startBlankSession();\n\t\t\t\t\treturn;\n\t\t\t\t}\n\t\t\t\tif (id === ADD_WORKSPACE) {']
    : ['\t\t\t\tif (id === ADD_WORKSPACE) {\n\t\t\t\t\topenDirectoryFlow();\n\t\t\t\t\treturn;\n\t\t\t\t}\n\t\t\t\tonPick(id);',
      '\t\t\t\tif (id === ADD_WORKSPACE) {\n\t\t\t\t\topenDirectoryFlow();\n\t\t\t\t\treturn;\n\t\t\t\t}\n\t\t\t\tif (id === ADD_NO_WORKSPACE) {\n\t\t\t\t\tonClose();\n\t\t\t\t\tif (startBlankSession) startBlankSession();\n\t\t\t\t\treturn;\n\t\t\t\t}\n\t\t\t\tonPick(id);'])
  return (c) => {
    for (const [from, to] of edits) c = rep(c, from, to, 1, from.slice(0, 46).replace(/\n/g, '⏎'))
    // q-inject-factory 双形(官方 rc.2 = ctx.workspaces.create; alpha.5 seed = workspaces.create;
    //   profiles junction 指回 seed `.pnpm` 实体时 O 轨必须命中 alpha.5 形)
    const F1 = '\t\t\t\tcreateWorkspace: (input) => ctx.workspaces.create(input),\n\t\t\t\thooks: { directoryFlow: pickerFlowSource }'
    const F2 = '\t\t\t\tcreateWorkspace: (input) => workspaces.create(input),\n\t\t\t\thooks: { directoryFlow: pickerFlowSource }'
    const toF = (body) => '\t\t\t\tcreateWorkspace: (input) => ' + body + ',\n\t\t\t\t' + START_BLANK + '\n\t\t\t\thooks: { directoryFlow: pickerFlowSource }'
    if (c.includes(F1)) c = rep(c, F1, toF('ctx.workspaces.create(input)'), 1, 'q-inject-factory')
    else if (c.includes(F2)) c = rep(c, F2, toF('workspaces.create(input)'), 1, 'q-inject-factory')
    else failures.push('[ui-workspace/lib/client.js] q-inject-factory: 两种锚点均未命中')
    return c
  }
}
function patchWorkspaceNoPickEntry() {
  const results = []
  // L: 本地 monorepo 构建产物(与 [P] 同款寻址:硬编码工作区路径 + 主目录回退)
  const localFile = ['D:\\deepseek harness\\deepseek-harness\\packages\\client\\ui-workspace\\lib\\client.js',
    path.join(os.homedir(), 'deepseek-harness', 'packages', 'client', 'ui-workspace', 'lib', 'client.js')]
    .find((f) => fs.existsSync(f))
  if (localFile) {
    const { rep, failures } = makeCtx('ui-workspace/lib/client.js@L')
    results.push({ ...rewrite(localFile, '.bak-nows', nowsApplyEdits(rep, true, failures), failures), version: 'local' })
  } else {
    results.push({ file: 'ui-workspace/lib/client.js@L', missing: true })
  }
  // O: npx 缓存全部 hash 并存版本——双布局:顶层 node_modules(官方 rc.x 平铺)与
  //     `.pnpm` seed 实体(alpha.5+ pnpm-seed 布局,profiles junction 实际指向这里)
  const npxRoot = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), '.npm-cache'), 'npm-cache', '_npx')
  if (fs.existsSync(npxRoot)) {
    const seen = new Set()
    for (const h of fs.readdirSync(npxRoot)) {
      for (const f of [
        path.join(npxRoot, h, 'node_modules', '@deepseek-ai', 'dsh-client-ui-workspace', 'lib', 'client.js'),
        path.join(npxRoot, h, 'node_modules', '.pnpm', 'node_modules', '@deepseek-ai', 'dsh-client-ui-workspace', 'lib', 'client.js'),
      ]) {
        if (!fs.existsSync(f) || seen.has(f)) continue
        seen.add(f)
        const { rep, failures } = makeCtx('ui-workspace/lib/client.js@O')
        results.push({ ...rewrite(f, '.bak-nows', nowsApplyEdits(rep, false, failures), failures), version: 'npx-' + h.slice(0, 6) })
      }
    }
  }
  if (!results.length) results.push({ file: 'ui-workspace/lib/client.js', missing: true })
  return results
}

// ---- [S] 未分组组头「+」新建会话放行(R78,2026-08-30) ----
// 症状: 侧栏「未分组」组头 hover 的「+」(ProjectRowItem rowActions 新建按钮)点击无反应
//       (活体实测:零 console、零 wire、零 DOM 变化);工作区组头同款按钮正常。
// 根因: WorkspaceBrowser 的 onCreate 只实现真工作区分支——`if (group.workspaceId !== void 0)`
//       没有 else,未分组桶(workspaceId=void 0,UNGROUPED_KEY)点击静默空转。上游实现缺口:
//       上游语义里「未分组」无新建能力,R68/[P]/R70/[Q] 打通无工作区会话后此处成死钮。
// 修法: 两锚点同文件(ui-workspace/lib/client.js),与 [Q] 同文件且已被其打哨兵 → 本家族
//       sentinel=null 绕快路径(batch 49 教训②预防态),replayAll 必须排在
//       patchWorkspaceNoPickEntry 之后(上游重建时 [Q] 先重打、本家族在其上重放,顺序自愈);
//       锚点 L+O 8 文件字节一致(逐一提取比对过),.bak-ugplus 基底=[Q] 补丁态,语义=本家族单独可逆:
//       ① browserInjected.startSession 加 "::blank" 哨兵分支——直发 ctx.sessions.create({})
//       (与 [Q] 给 pickerInjected 注入的 startBlankSession 同一条 wire 通路,host 落部署默认
//       cwd,会话归组=既有未分组机制;hero 输入已由 R76 放行)并 open;真实 workspaceId 调用
//       不受影响。不走 startSession(void 0)——runtime 继承链(当前/最近工作区)会把它拖回
//       工作区,不满足「未分组建无归属会话」语义。
//       ② onCreate 补 else: setGroupExpanded(group.key,true)+startSession("::blank")——与真
//       工作区分支同构(先展开组再建,建后打开并跳转);哨兵串沿用上游 "::" 前缀合成 id 惯例
//       (::add-workspace),与真实 id(uuid/路径)无碰撞面。
function patchUngroupedGroupBlank() {
  const A1_FROM = '\n\t\t\t\tstartSession: (workspaceId) => {\n\t\t\t\t\tctx.workspaces.startSession(workspaceId);\n\t\t\t\t},\n'
  const A2_FROM = '\n\t\t\t\tstartSession: (workspaceId) => {\n\t\t\t\t\tuiWorkspace.startSession(workspaceId);\n\t\t\t\t},\n'
  const B_FROM = '\n\t\t\t\t\t\t\t\t\t\tonCreate: () => {\n\t\t\t\t\t\t\t\t\t\t\tif (group.workspaceId !== void 0) {\n\t\t\t\t\t\t\t\t\t\t\t\tsetGroupExpanded(group.key, true);\n\t\t\t\t\t\t\t\t\t\t\t\tstartSession(group.workspaceId);\n\t\t\t\t\t\t\t\t\t\t\t}\n\t\t\t\t\t\t\t\t\t\t},'
  const B_TO = '\n\t\t\t\t\t\t\t\t\t\tonCreate: () => {\n\t\t\t\t\t\t\t\t\t\t\t// [dsh-desktop] R78: 未分组桶补 else(上游只实现真工作区分支,点击静默空转)\n\t\t\t\t\t\t\t\t\t\t\tif (group.workspaceId !== void 0) {\n\t\t\t\t\t\t\t\t\t\t\t\tsetGroupExpanded(group.key, true);\n\t\t\t\t\t\t\t\t\t\t\t\tstartSession(group.workspaceId);\n\t\t\t\t\t\t\t\t\t\t\t} else {\n\t\t\t\t\t\t\t\t\t\t\t\tsetGroupExpanded(group.key, true);\n\t\t\t\t\t\t\t\t\t\t\t\tstartSession("::blank");\n\t\t\t\t\t\t\t\t\t\t\t}\n\t\t\t\t\t\t\t\t\t\t},'
  const results = []
  // A 锚点双形:官方 rc.2 = ctx.workspaces.startSession;alpha.5 seed(.pnpm 实体) = uiWorkspace.startSession
  // 终态幂等:先查 S_MARK(::blank 哨兵),命中即已是补丁态,绕过锚点(避免 .bak 基底污染时误报 FAIL;
  //   batch 49 教训②同款——哨兵证明打过,不按基底重判)
  const S_MARK = 'startSession("::blank")'
  const makeApply = (rep, failures) => (c) => {
    const aTo = (call) => '\n\t\t\t\tstartSession: (workspaceId) => {\n\t\t\t\t\t// [dsh-desktop] R78: "::blank" 哨兵=无工作区会话(与 R70 startBlankSession 同一 wire 通路)\n\t\t\t\t\tif (workspaceId === "::blank") {\n\t\t\t\t\t\tPromise.resolve(ctx.sessions.create({})).then((created) => {\n\t\t\t\t\t\t\tconst sessionId = typeof created === "string" ? created : created && created.sessionId;\n\t\t\t\t\t\t\tif (sessionId) ctx.sessions.open(sessionId);\n\t\t\t\t\t\t}).catch(() => {});\n\t\t\t\t\t\treturn;\n\t\t\t\t\t}\n\t\t\t\t\t' + call + ';\n\t\t\t\t},\n'
    if (c.includes(A1_FROM)) c = rep(c, A1_FROM, aTo('ctx.workspaces.startSession(workspaceId)'), 1, 'blank-sentinel-branch')
    else if (c.includes(A2_FROM)) c = rep(c, A2_FROM, aTo('uiWorkspace.startSession(workspaceId)'), 1, 'blank-sentinel-branch')
    else failures.push('[ui-workspace/lib/client.js] blank-sentinel-branch: 两种锚点均未命中')
    c = rep(c, B_FROM, B_TO, 1, 'ungrouped-else-branch')
    return c
  }
  const localFile = ['D:\\deepseek harness\\deepseek-harness\\packages\\client\\ui-workspace\\lib\\client.js',
    path.join(os.homedir(), 'deepseek-harness', 'packages', 'client', 'ui-workspace', 'lib', 'client.js')]
    .find((f) => fs.existsSync(f))
  if (localFile) {
    if (fs.readFileSync(localFile, 'utf8').includes(S_MARK)) {
      results.push({ file: 'ui-workspace/lib/client.js@L', ok: true, already: true, version: 'local' })
    } else {
      const { rep, failures } = makeCtx('ui-workspace/lib/client.js@L')
      results.push({ ...rewrite(localFile, '.bak-ugplus', makeApply(rep, failures), failures, null), version: 'local' })
    }
  } else {
    results.push({ file: 'ui-workspace/lib/client.js@L', missing: true })
  }
  // O: npx 缓存全部 hash 并存版本——双布局(与 [Q] 同款,见 patchWorkspaceNoPickEntry)
  const npxRoot = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), '.npm-cache'), 'npm-cache', '_npx')
  if (fs.existsSync(npxRoot)) {
    const seen = new Set()
    for (const h of fs.readdirSync(npxRoot)) {
      for (const f of [
        path.join(npxRoot, h, 'node_modules', '@deepseek-ai', 'dsh-client-ui-workspace', 'lib', 'client.js'),
        path.join(npxRoot, h, 'node_modules', '.pnpm', 'node_modules', '@deepseek-ai', 'dsh-client-ui-workspace', 'lib', 'client.js'),
      ]) {
        if (!fs.existsSync(f) || seen.has(f)) continue
        seen.add(f)
        if (fs.readFileSync(f, 'utf8').includes(S_MARK)) {
          results.push({ file: 'ui-workspace/lib/client.js@O', ok: true, already: true, version: 'npx-' + h.slice(0, 6) })
          continue
        }
        const { rep, failures } = makeCtx('ui-workspace/lib/client.js@O')
        results.push({ ...rewrite(f, '.bak-ugplus', makeApply(rep, failures), failures, null), version: 'npx-' + h.slice(0, 6) })
      }
    }
  }
  if (!results.length) results.push({ file: 'ui-workspace/lib/client.js', missing: true })
  return results
}

// ---- [U] 会话菜单新增「删除会话」(R79,2026-09-04) ----
// 需求: 会话行「...」菜单只有 重命名/分叉/归档;wire 层无 session 删除能力(官方 README
//       明言 No Session deletion),归档只是 archivedSessionIds 隐藏+数据全留,用户无处
//       表达「这条会话彻底删掉」。
// 修法: 两锚点同文件(ui-workspace/lib/client.js,L 1+O 10 共 11 文件逐一勘察,两锚点均
//       唯一命中,title 变量全轨在位):
//       ① sessionMenuItems 在 archive 项后追加 { id:"session-delete", label:"删除会话",
//         icon: IconTrashOutline16, danger: true }(Menu 原生 danger 行=错误色文字/图标+
//         危险悬停底;各轨 primitives 均导出该图标,seed 轨经 profile 链解析,与 [Q] 的
//         IconFolderClose16 同机制);
//       ② onSelect 加分支——window.__dshSessionDelete 桥在位(dshvt 插件安装)走桥(确认
//         弹窗→ctx.workspaces.archiveSession→壳 POST /sessions/delete 物理清除),桥缺席
//         (纯 Web/旧壳)回落 onArchive=纯归档,永不产生死菜单项。
//       与 [Q]/[S] 同文件 → sentinel=null 绕快路径 + 自有 U_MARK 幂等(批次 49 教训②
//       预防态),replayAll 排在 patchUngroupedGroupBlank 之后(上游重建时 [Q]/[S] 先重打、
//       本家族在其上重放,顺序自愈);.bak-sdel 基底=[Q]+[S] 补丁态,语义=本家族单独可逆。
//       锚点分轨双形: L 产物图标行带 /* @__PURE__ */ 前缀,O 各版本(112997/113462/
//       114701/127823 四种字节形态)均无(逐份提取比对过);onSelect 锚点全轨字节一致。
function patchSessionDeleteEntry() {
  const U_MARK = 'id: "session-delete"'
  const SELECT_FROM = '\n\t\t\t\t\t\t\t\t\tif (id === "archive") onArchive(node.id);'
  const SELECT_TO = '\n\t\t\t\t\t\t\t\t\tif (id === "archive") onArchive(node.id);\n\t\t\t\t\t\t\t\t\t// [dsh-desktop] R79: 删除会话=确认弹窗→归档→壳端点物理清除;桥缺席回落纯归档\n\t\t\t\t\t\t\t\t\tif (id === "session-delete") { const f = window.__dshSessionDelete; if (typeof f === "function") f(node.id, title); else onArchive(node.id); }'
  const makeApply = (rep, failures) => (c) => {
    const item = (pure) => '\t\t\t\t{\n\t\t\t\t\tid: "archive",\n\t\t\t\t\tlabel: t("menu.archiveSession"),\n\t\t\t\t\ticon: ' + (pure ? '/* @__PURE__ */ ' : '') + '(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconArchiveOutline20, { size: 16 })\n\t\t\t\t}'
    const delItem = (pure) => ',\n\t\t\t\t{\n\t\t\t\t\t// [dsh-desktop] R79: 「删除会话」动作走 onSelect 分支→dshvt __dshSessionDelete 桥\n\t\t\t\t\tid: "session-delete",\n\t\t\t\t\tlabel: "删除会话",\n\t\t\t\t\ticon: ' + (pure ? '/* @__PURE__ */ ' : '') + '(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconTrashOutline16, {}),\n\t\t\t\t\tdanger: true\n\t\t\t\t}'
    if (c.includes(item(true))) c = rep(c, item(true), item(true) + delItem(true), 1, 'u-menu-item')
    else if (c.includes(item(false))) c = rep(c, item(false), item(false) + delItem(false), 1, 'u-menu-item')
    else failures.push('[ui-workspace/lib/client.js] u-menu-item: 两种锚点均未命中')
    c = rep(c, SELECT_FROM, SELECT_TO, 1, 'u-select-branch')
    return c
  }
  const results = []
  const localFile = ['D:\\deepseek harness\\deepseek-harness\\packages\\client\\ui-workspace\\lib\\client.js',
    path.join(os.homedir(), 'deepseek-harness', 'packages', 'client', 'ui-workspace', 'lib', 'client.js')]
    .find((f) => fs.existsSync(f))
  if (localFile) {
    if (fs.readFileSync(localFile, 'utf8').includes(U_MARK)) {
      results.push({ file: 'ui-workspace/lib/client.js@L', ok: true, already: true, version: 'local' })
    } else {
      const { rep, failures } = makeCtx('ui-workspace/lib/client.js@L')
      results.push({ ...rewrite(localFile, '.bak-sdel', makeApply(rep, failures), failures, null), version: 'local' })
    }
  } else {
    results.push({ file: 'ui-workspace/lib/client.js@L', missing: true })
  }
  // O: npx 缓存全部 hash 并存版本——双布局(与 [Q]/[S] 同款,见 patchWorkspaceNoPickEntry)
  const npxRoot = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), '.npm-cache'), 'npm-cache', '_npx')
  if (fs.existsSync(npxRoot)) {
    const seen = new Set()
    for (const h of fs.readdirSync(npxRoot)) {
      for (const f of [
        path.join(npxRoot, h, 'node_modules', '@deepseek-ai', 'dsh-client-ui-workspace', 'lib', 'client.js'),
        path.join(npxRoot, h, 'node_modules', '.pnpm', 'node_modules', '@deepseek-ai', 'dsh-client-ui-workspace', 'lib', 'client.js'),
      ]) {
        if (!fs.existsSync(f) || seen.has(f)) continue
        seen.add(f)
        if (fs.readFileSync(f, 'utf8').includes(U_MARK)) {
          results.push({ file: 'ui-workspace/lib/client.js@O', ok: true, already: true, version: 'npx-' + h.slice(0, 6) })
          continue
        }
        const { rep, failures } = makeCtx('ui-workspace/lib/client.js@O')
        results.push({ ...rewrite(f, '.bak-sdel', makeApply(rep, failures), failures, null), version: 'npx-' + h.slice(0, 6) })
      }
    }
  }
  if (!results.length) results.push({ file: 'ui-workspace/lib/client.js', missing: true })
  return results
}

// ---- [R] 无工作区会话 hero 输入解禁(R76) + 会话恢复期"新会话"闪变根治(R84),2026-09-01 原子化 ----
// R76(2026-08-30): R68/[P](侧栏新会话兜底)与 R70/[Q](菜单「不选择工作区」)创建的无工作区会话
//       (blank,cwd=部署默认目录)打开后,对话 hero 仍锁死「选择一个工作区开始」——
//       textarea readOnly 恒真,活体实测无法输入,功能等于不存在(用户问题报告 08-30)。
//       根因: ConversationRoot 的 inert 门控 `sessionId===void 0 || hero && chipTitle===void 0`:
//       chipTitle 三来源(刚选工作区/会话归属工作区/工作区列表未就绪时 cwd 桥接)对无
//       归属工作区会话全部落空(列表 ready 走规则5恒 undefined)→ 恒 inert。上游该抑制
//       是为「工作区被删」场景兜底(不显示已删目录名),而客户端会话摘要
//       (SessionsPortSummary)无 workspaceId,「被删」与「从未有」不可区分——R68/R70
//       引入的无工作区会话整体撞死(两处此前验收只验到「创建+打开」,未验可输入,故漏检)。
//       修法: inert 追加 cwd 豁免——hero 态无 chipTitle 但 cwd 在位(非空)的会话放行输入。
// R84(2026-09-01): 强刷(Ctrl+Shift+R)后短暂显示「新会话/选择工作区」hero,随后才恢复上次
//       会话;偶发直接空白(列表 pending 时正文=null)。活体时序: boot → manager.selected=
//       restored(localStorage dsh.sessions.current)但 wire 列表未到(items 空)→ current=undefined
//       → provideInfo.sessionId=undefined → ConversationRoot hero=true → 渲染"新会话"页;
//       列表到达后 current=selected 恢复 → 跳回会话(闪变)。修法: hero 判定追加"列表未就绪"
//       豁免——sessionId===undefined 且 list.phase==='pending' 时不再 hero,改走"恢复中"占位
//       (data-phase='restoring',正文「正在恢复会话…」),恢复完成自然过渡,零"新会话"误引导。
// 原子化原因: 两补丁同文件(ui-conversation/lib/client.js),各自独立 rewrite 时 rewrite 的
//       "上游已更新"分支(L960: current!==base && current!==patched)会把"另一补丁已应用"误判为
//       "上游更新"→ 基底被污染成补丁态 → 另一补丁 matched 0 失配(2026-09-01 实测踩坑)。
//       且手工逆变换基底不可靠(缩进错位 → 111908 字符差异,2026-09-01 实测)。
// 终局方案(2026-09-01 改): 弃用 rewrite 基底机制,自实现幂等——直接以 current 为唯一事实源:
//       检测补丁标记(restoring 行在场) → already;否则从 current 依次 rep 三个锚点(FROM 均
//       expected=1,天然幂等:重复应用时 FROM 已不存在会 FAIL 拒写,不产生半补丁态)。
//       current 只存在"pristine"或"全补丁(R76+R84)"两种合法态,无基底、无 L960 误判风险。
// 锚点两轨 8 文件字节一致(L 1+O 7,逐份比对过)。L 侧该物理文件已含 [D] 的 PATCH_MARK
//       哨兵(devlink junction 同文件)→ 本家族不用 rewrite 即天然绕开哨兵快路径(批次 49 教训②)。
//       replayAll 中必须排在 patchConversation 之后(顺序自愈)。
function patchHeroNoWorkspaceInert() {
  const results = []
  const MARK = 'const restoring = sessionId === void 0 && listPhase === "pending";'
  const FROM_INERT = 'const inert = sessionId === void 0 || hero && chipTitle === void 0;'
  const TO_INERT = '/* [dsh-desktop] R76: 无工作区但有 cwd 的 blank 会话放行输入(上游 inert 规则只兜「工作区被删」) */\n\t\t\tconst inert = sessionId === void 0 || hero && chipTitle === void 0 && (cwd === void 0 || cwd === "");'
  // alpha.5 变体语义(2026-09-04,批次 49/58 家族在 alpha.5 seed 上重适配):
  //   上游重构后 chipTitle 已有 cwd 兜底(14405 桥接),lock 发生时 cwd 必然未达 wire → cwd 豁免失效;
  //   改用 summaryBlank(store 已内建「人为创建的无工作区会话」信号)精确豁免——「不选择工作区」建出的
  //   blank 会话直接放行输入,「工作区被删」的历史会话(blank=false)保持锁定语义不变。
  const TO_INERT_A5 = 'const inert = sessionId === void 0 || hero && chipTitle === void 0 && !(summaryBlank === true);'
  const FROM_INERT_A5 = FROM_INERT
  const FROM1 = 'const settling = sessionId !== void 0 && composerPhase === "blank" && openState === "loading" && summaryBlank !== true;\n\t\t\tconst hero = sessionId === void 0 || composerPhase === "blank" && (openState === "open" || summaryBlank === true);'
  const TO1 = 'const listPhase = useSessions((s) => s.phase);\n\t\t\t/* [dsh-desktop] R84: 刷新恢复期不闪"新会话"页——列表未就绪(pending)且当前无会话时,主区走恢复占位而非 hero(误引导) */\n\t\t\tconst restoring = sessionId === void 0 && listPhase === "pending";\n\t\t\tconst settling = sessionId !== void 0 && composerPhase === "blank" && openState === "loading" && summaryBlank !== true;\n\t\t\tconst hero = !restoring && (sessionId === void 0 || composerPhase === "blank" && (openState === "open" || summaryBlank === true));'
  // alpha.5 形态(单行 shellPhase 链,settling 带 parentAvailability 并入):只插 restoring 前置,不动 settling
  const FROM1_A5 = 'const hero = sessionId === void 0 || shellPhase === "blank" && (openState === "open" || summaryBlank === true);'
  const TO1_A5 = 'const listPhase = useSessions((s) => s.phase);\n\t\t\t/* [dsh-desktop] R84α5: 刷新恢复期不闪"新会话"页——列表未就绪(pending)且当前无会话时主区不误导 hero */\n\t\t\tconst restoring = sessionId === void 0 && listPhase === "pending";\n\t\t\tconst hero = !restoring && (sessionId === void 0 || shellPhase === "blank" && (openState === "open" || summaryBlank === true));'
  const FROM2 = 'return (0, react_jsx_runtime.jsxs)("div", {\n\t\t\t\tclassName: ConversationRoot_module_css_default.root,\n\t\t\t\t"data-phase": phase,\n\t\t\t\tchildren: [renderSlot("conversation.session.header", {}), (0, react_jsx_runtime.jsxs)("div", {\n\t\t\t\t\tclassName: ConversationRoot_module_css_default.scrollBody,\n\t\t\t\t\t"data-conversation-scroll": "",\n\t\t\t\t\tchildren: [renderSlot("conversation.session", {}), composerSeat]\n\t\t\t\t})]\n\t\t\t});'
  const TO2 = 'return (0, react_jsx_runtime.jsxs)("div", {\n\t\t\t\tclassName: ConversationRoot_module_css_default.root,\n\t\t\t\t"data-phase": restoring ? "restoring" : phase,\n\t\t\t\tchildren: [renderSlot("conversation.session.header", {}), (0, react_jsx_runtime.jsxs)("div", {\n\t\t\t\t\tclassName: ConversationRoot_module_css_default.scrollBody,\n\t\t\t\t\t"data-conversation-scroll": "",\n\t\t\t\t\tchildren: [restoring ? (0, react_jsx_runtime.jsx)("div", { "data-restoring-session": "", style: { display: "flex", alignItems: "center", justifyContent: "center", minHeight: 140, fontSize: 13, color: "var(--dsw-alias-label-tertiary)" }, children: "正在恢复会话…" }) : renderSlot("conversation.session", {}), composerSeat]\n\t\t\t\t})]\n\t\t\t});'
  const patchFile = (p, label) => {
    const { rep, failures } = makeCtx(label)
    const current = fs.readFileSync(p, 'utf8')
    if (current.includes(MARK)) return { file: label, ok: true, already: true }
    if (current.includes(FROM1_A5)) {
      // alpha.5 形态(shellPhase 单行链): R76 改 blank 豁免 + R84 插 restoring 前置(placeholder 上游已无误导,跳过)
      let c = current
      c = rep(c, FROM_INERT_A5, TO_INERT_A5, 1, 'hero-inert-cwd-exempt')
      c = rep(c, FROM1_A5, TO1_A5, 1, 'r84-restore-flag')
      if (failures.length) return { file: label, ok: false, failures: [...failures] }
      fs.writeFileSync(p, c, 'utf8')
      return { file: label, ok: true, already: false }
    }
    let c = current
    c = rep(c, FROM_INERT, TO_INERT, 1, 'hero-inert-cwd-exempt')
    c = rep(c, FROM1, TO1, 1, 'r84-restore-flag')
    c = rep(c, FROM2, TO2, 1, 'r84-restore-placeholder')
    if (failures.length) return { file: label, ok: false, failures: [...failures] }
    fs.writeFileSync(p, c, 'utf8')
    return { file: label, ok: true, already: false }
  }
  // L: 本地 monorepo 构建产物
  const localConv = ['D:\\deepseek harness\\deepseek-harness\\packages\\client\\ui-conversation\\lib\\client.js',
    path.join(os.homedir(), 'deepseek-harness', 'packages', 'client', 'ui-conversation', 'lib', 'client.js')]
    .find((f) => fs.existsSync(f))
  if (localConv) {
    results.push({ ...patchFile(localConv, 'ui-conversation/lib/client.js@L'), version: 'local' })
  } else {
    results.push({ file: 'ui-conversation/lib/client.js@L', missing: true })
  }
  // O: npx 缓存全部 hash 并存版本——双布局(与 [Q] 同款)：平铺顶层 + .pnpm pnpm-seed 实体
  const npxRoot = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), '.npm-cache'), 'npm-cache', '_npx')
  if (fs.existsSync(npxRoot)) {
    const seen = new Set()
    for (const h of fs.readdirSync(npxRoot)) {
      for (const f of [
        path.join(npxRoot, h, 'node_modules', '@deepseek-ai', 'dsh-client-ui-conversation', 'lib', 'client.js'),
        path.join(npxRoot, h, 'node_modules', '.pnpm', 'node_modules', '@deepseek-ai', 'dsh-client-ui-conversation', 'lib', 'client.js'),
      ]) {
        if (!fs.existsSync(f) || seen.has(f)) continue
        seen.add(f)
        results.push({ ...patchFile(f, 'ui-conversation/lib/client.js@O'), version: 'npx-' + h.slice(0, 6) })
      }
    }
  }
  if (!results.length) results.push({ file: 'ui-conversation/lib/client.js', missing: true })
  return results
}

// ---- [K9] 皮肤页二级化(2026-09-06,用户需求):「换装」改为二级页面入口,落位主页右栏
//       「自定义资产」下方空白处;「自定义资产」同样二级化。主页右栏 = 两张入口卡
//       (sGenSubCard 同款设计语言:hairline 边框 + Claude 橙 hover + chevron 右移),
//       内容迁 sub:skin-assets / sub:skin-suit 二级页(K8 的页面网格换装组摘除,
//       settings.skin.item 槽声明保留供子页消费)。返回走子页「‹ 返回皮肤」或左导航「皮肤」行。
//       基底策略:dshvt 存活副本含手工迁移的上游内容(bak-nestskin 落后),故 K9 为独立
//       二段补丁——以当前已打 K8 的文件为基底,独立 .bak-k9-skin + 独立哨兵;上游漂移时
//       K8 链先漂移重打,K9 锚点失配 FAIL 保盘等手工对位(不做 pristine 恢复,避免回退上游适配)。
const K9_MARK = '/*dsh-local-patch:k9-skin-subpages*/'
const K9_CSS = '.dshSkinEntries{display:flex;flex-direction:column;gap:10px;width:100%} .dshSkinEntry{box-sizing:border-box;display:grid;grid-template-columns:1fr auto;column-gap:12px;align-items:center;width:100%;min-height:64px;text-align:left;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:11px 14px;cursor:pointer;color:var(--dsw-alias-label-primary);font-family:inherit;transition:border-color .3s cubic-bezier(.32,.72,0,1),background-color .3s cubic-bezier(.32,.72,0,1)} .dshSkinEntry:hover{border-color:#d97757;background:var(--dsw-specific-sidebar-nav-item-hover)} .dshSkinEntry:focus-visible{outline:2px solid rgba(217,119,87,.5);outline-offset:2px} .dshSkinEntryTitle{grid-column:1;grid-row:1;font-size:14px;font-weight:500;line-height:20px;color:var(--dsw-alias-label-primary);transition:color .3s cubic-bezier(.32,.72,0,1)} .dshSkinEntry:hover .dshSkinEntryTitle{color:#d97757} .dshSkinEntryDesc{grid-column:1;grid-row:2;font-size:12px;line-height:17px;color:var(--dsw-alias-label-secondary)} .dshSkinEntryGo{grid-column:2;grid-row:1/3;justify-self:end;color:var(--dsw-alias-label-tertiary);font-size:16px;line-height:1;transition:transform .3s cubic-bezier(.32,.72,0,1),color .3s cubic-bezier(.32,.72,0,1)} .dshSkinEntry:hover .dshSkinEntryGo{transform:translateX(3px);color:#d97757} .dshSkinBack{align-self:flex-start;display:inline-flex;align-items:center;margin:0 0 6px -6px;padding:4px 10px;background:transparent;border:none;border-radius:8px;color:var(--dsw-alias-label-secondary);font-size:13px;font-family:inherit;cursor:pointer;transition:color .3s cubic-bezier(.32,.72,0,1),background-color .3s cubic-bezier(.32,.72,0,1)} .dshSkinBack:hover{color:#d97757;background:var(--dsw-specific-sidebar-nav-item-hover)} @media (prefers-reduced-motion:reduce){.dshSkinEntry,.dshSkinEntryTitle,.dshSkinEntryGo,.dshSkinBack{transition:none!important}.dshSkinEntry:hover .dshSkinEntryGo{transform:none}}'
function patchSkinSubpages() {
  const results = []
  // K9-1..5 dshvt 皮肤页(独立二段补丁,哨兵 K9_MARK,基底 = 当前 K8 态)
  {
    const p = path.join(PLUGINS, 'dsh-desktop-version-tab', 'lib', 'client.js')
    if (!fs.existsSync(p)) {
      results.push({ file: 'dshvt/client.js@k9', missing: true })
    } else {
      const ver = JSON.parse(fs.readFileSync(path.join(PLUGINS, 'dsh-desktop-version-tab', 'package.json'), 'utf8')).version
      const { rep, failures } = makeCtx('dshvt/client.js@k9')
      const apply = (c) => {
        // K9-1 SkinSectionHost → SkinTab 透传 select/show(入口卡跳转 + 子页路由)
        c = rep(c,
          'return react.createElement(SkinTab, { renderSlot: props && props.renderSlot });',
          'return react.createElement(SkinTab, { renderSlot: props && props.renderSlot, select: props && props.select, show: props && props.show });',
          1, 'k9-host-passthrough')
        // K9-2 SkinTab 头部:dshSelect/dshShow 局部变量 + 入口卡/子页样式注入
        c = rep(c,
          'function SkinTab(props) {\n\t\t\tvar h = react.createElement;\n\t\t\t// [K8] renderSlot 由 SkinSectionHost 透传:换装(settings.skin.item)作为独立\n\t\t\t// 分组落位页面网格(自定义资产之下、Wallpaper Engine 之上),不再垫底后追。\n\t\t\tvar renderSlot = props && props.renderSlot;\n\t\t\tvar st = react.useState({',
          'function SkinTab(props) {\n\t\t\tvar h = react.createElement;\n\t\t\t// [K9 2026-09-06] 皮肤页二级化:主页右栏入口卡(自定义资产/换装),内容迁\n\t\t\t// sub:skin-* 子页(K8 网格换装组由本补丁摘除,槽声明保留供子页消费)。\n\t\t\tvar renderSlot = props && props.renderSlot;\n\t\t\tvar dshSelect = props && props.select;\n\t\t\tvar dshShow = props && props.show;\n\t\t\tif (typeof document !== "undefined" && !document.getElementById("dsh-skin-subpage-css")) {\n\t\t\t\tvar dshK9Tag = document.createElement("style");\n\t\t\t\tdshK9Tag.id = "dsh-skin-subpage-css";\n\t\t\t\tdshK9Tag.textContent = ' + JSON.stringify(K9_CSS) + ';\n\t\t\t\tdocument.head.appendChild(dshK9Tag);\n\t\t\t}\n\t\t\tvar st = react.useState({',
          1, 'k9-skin-head')
        // K9-3 主页右栏:自定义资产内联分组 → 入口卡组(原位,右栏首行)
        c = rep(c,
          'h("div", { className: "vt_group" },\n\t\t\t\th("div", { className: "vt_groupTitle" }, "自定义资产"),\n\t\t\t\th("div", { className: "ps_btns" },\n\t\t\t\t\th("button", { className: "pm_btn", disabled: busy[0], onClick: function () { if (fileRef.current) fileRef.current.click(); } }, "导入文件"),\n\t\t\t\t\th("span", { className: "cm_count" }, assets.length + " 个资产")),\n\t\t\t\th("div", { className: "pm_list" }, assetRows)),',
          '// [K9] 自定义资产/换装二级页入口卡(内容迁 sub:skin-* 子页)\n\t\t\th("div", { className: "vt_group" }, dshEntries),',
          1, 'k9-assets-entry')
        // K9-4 摘除 K8 网格换装组(子页继续消费 settings.skin.item)
        c = rep(c,
          '// [K8] 换装独立分组(joi settings.skin.item 槽):自定义资产之下、Wallpaper\n\t\t\t// Engine 之上,vt_span 跨双栏整行;joi 未安装/停用时 renderSlot 为空,零高不占位。\n\t\t\th("div", { className: "vt_group vt_span dsh-suit-slot" },\n\t\t\t\trenderSlot ? renderSlot("settings.skin.item", {}) : null),\n\t\t\th("div", { className: "vt_group vt_span" },',
          '// [K9] 换装组迁 sub:skin-suit 二级页(主页入口卡见上),K8 网格组摘除\n\t\t\th("div", { className: "vt_group vt_span" },',
          1, 'k9-suit-unwrap')
        // K9-5 子页路由分支 + 入口卡构造(插在主 return 之前;K9-3/4 之后锚点仍唯一)
        c = rep(c,
          'oCards)] : null);\n\t\t}\n\n\t\tvar msgCls = "pm_msg" + (msg[0].indexOf("失败") >= 0 || msg[0].indexOf("拒绝") >= 0 ? " pm_msgErr" : msg[0].indexOf("已") === 0 ? " pm_msgOk" : "");\n\t\treturn h("div", { className: "vt_page" },',
          'oCards)] : null);\n\t\t}\n\n\t\tvar msgCls = "pm_msg" + (msg[0].indexOf("失败") >= 0 || msg[0].indexOf("拒绝") >= 0 ? " pm_msgErr" : msg[0].indexOf("已") === 0 ? " pm_msgOk" : "");\n\t\t// [K9] 二级页面:自定义资产 / 换装(show 由设置壳 sub:skin-* 路由透传;返回走\n\t\t// 「‹ 返回皮肤」或左侧导航「皮肤」行)。\n\t\tif (dshShow === "skin-assets" || dshShow === "skin-suit") {\n\t\t\tvar dshBack = function () { if (dshSelect) dshSelect("skin"); };\n\t\t\tvar dshSubHead = h("div", { className: "vt_head" },\n\t\t\t\th("button", { type: "button", className: "dshSkinBack", onClick: dshBack }, "‹ 返回皮肤"),\n\t\t\t\th("h2", { className: "vt_h2" }, dshShow === "skin-assets" ? "自定义资产" : "换装"),\n\t\t\t\th("p", { className: "vt_intro" }, dshShow === "skin-assets"\n\t\t\t\t\t? "导入 jpg/png/gif 或 mp4/webm 等作为界面背景;点击资产行可设为背景或删除。"\n\t\t\t\t\t: "选一套衣装,房间会跟着换;也可以回到 DeepSeek 原生外观。"));\n\t\t\tif (dshShow === "skin-assets") {\n\t\t\t\treturn h("div", { className: "vt_page" },\n\t\t\t\t\th("input", { ref: fileRef, type: "file", style: { display: "none" },\n\t\t\t\t\t\taccept: ".jpg,.jpeg,.png,.gif,.webp,.bmp,.mp4,.webm,.mov,.mkv",\n\t\t\t\t\t\tonChange: onFile }),\n\t\t\t\t\tdshSubHead,\n\t\t\t\t\th("div", { className: "vt_group vt_span" },\n\t\t\t\t\t\th("div", { className: "ps_btns" },\n\t\t\t\t\t\t\th("button", { className: "pm_btn", disabled: busy[0], onClick: function () { if (fileRef.current) fileRef.current.click(); } }, "导入文件"),\n\t\t\t\t\t\t\th("span", { className: "cm_count" }, assets.length + " 个资产")),\n\t\t\t\t\t\th("div", { className: "pm_list" }, assetRows)),\n\t\t\t\t\th("div", { className: msgCls }, msg[0]));\n\t\t\t}\n\t\t\tvar suitContent = renderSlot ? renderSlot("settings.skin.item", {}) : null;\n\t\t\treturn h("div", { className: "vt_page" },\n\t\t\t\tdshSubHead,\n\t\t\t\th("div", { className: "vt_group vt_span dsh-suit-slot" },\n\t\t\t\t\tsuitContent || h("div", { className: "pm_msg" }, "换装主题插件未安装或已停用。")),\n\t\t\t\th("div", { className: msgCls }, msg[0]));\n\t\t}\n\t\t// [K9] 主页右栏入口卡:自定义资产(原位)+ 其下空白处的换装入口。\n\t\tvar dshEntries = h("div", { className: "dshSkinEntries" },\n\t\t\th("button", { type: "button", className: "dshSkinEntry", onClick: function () { if (dshSelect) dshSelect("sub:skin-assets"); } },\n\t\t\t\th("span", { className: "dshSkinEntryTitle" }, "自定义资产"),\n\t\t\t\th("span", { className: "dshSkinEntryDesc" }, "导入图片/视频作为界面背景,当前 " + assets.length + " 个资产。"),\n\t\t\t\th("span", { className: "dshSkinEntryGo" }, "›")),\n\t\t\th("button", { type: "button", className: "dshSkinEntry", onClick: function () { if (dshSelect) dshSelect("sub:skin-suit"); } },\n\t\t\t\th("span", { className: "dshSkinEntryTitle" }, "换装"),\n\t\t\t\th("span", { className: "dshSkinEntryDesc" }, "选一套衣装,房间会跟着换;也可回到 DeepSeek 原生外观。"),\n\t\t\t\th("span", { className: "dshSkinEntryGo" }, "›")));\n\t\treturn h("div", { className: "vt_page" },',
          1, 'k9-subpage-branch')
        return c
      }
      // [K9] 用 rewriteFresh(哨兵参数语义正确);rewrite() 尾部硬编码 v2026-08-23 旧哨兵,
      // 传 K9_MARK 也不会追加,会导致下一次重放走漂移分支对 K9 态重打而 FAIL。
      results.push({ ...rewriteFresh(p, '.bak-k9-skin', apply, failures, K9_MARK), version: ver })
    }
  }
  // K9-G settings-general(全部副本):导航 skin 隐藏子行 + SEL 路由映射(独立 .bak-k9-skin)
  const genRoots = []
  const npxCache = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'npm-cache', '_npx')
  if (fs.existsSync(npxCache)) {
    for (const h of fs.readdirSync(npxCache)) {
      genRoots.push(path.join(npxCache, h, 'node_modules', '@deepseek-ai', 'dsh-client-ui-settings-general', 'lib', 'client.js'))
    }
  }
  genRoots.push(path.join(os.homedir(), '.dsh', 'profiles', 'node_modules', '@deepseek-ai', 'dsh-client-ui-settings-general', 'lib', 'client.js'))
  for (const p of genRoots) {
    if (!fs.existsSync(p)) continue
    const ver = (() => { try { return JSON.parse(fs.readFileSync(path.join(path.dirname(path.dirname(p)), 'package.json'), 'utf8')).version } catch { return '?' } })()
    const label = 'general-k9/' + path.dirname(path.dirname(p)).split(path.sep).slice(-2).join('/') + '/client.js'
    const { rep, failures } = makeCtx(label)
    const apply = (c) => {
      // 导航行:skin 行下挂两个隐藏子行(data-dsh-sub 已有 CSS 隐藏;入口卡 select 可达)
      c = rep(c,
        'let attached = false;',
        'let attached = false;\n\t\t\t\t\t\t\tconst SKIN_SUBS = [["skin-assets", "自定义资产"], ["skin-suit", "换装"]];\n\t\t\t\t\t\t\tconst skinRows = SKIN_SUBS.map((s) => ({ id: "sub:skin-" + s[0], order: 0, label: s[1], child: true }));\n\t\t\t\t\t\t\tlet skinAttached = false;',
        1, 'k9-rows-skinchildren')
      c = rep(c,
        'if (!attached && row.id === "general") {\n\t\t\t\t\t\t\t\t\tfor (const child of childRows) top.push(child);\n\t\t\t\t\t\t\t\t\tattached = true;\n\t\t\t\t\t\t\t\t}',
        'if (!attached && row.id === "general") {\n\t\t\t\t\t\t\t\t\tfor (const child of childRows) top.push(child);\n\t\t\t\t\t\t\t\t\tattached = true;\n\t\t\t\t\t\t\t\t}\n\t\t\t\t\t\t\t\tif (!skinAttached && row.id === "skin") {\n\t\t\t\t\t\t\t\t\tfor (const child of skinRows) top.push(child);\n\t\t\t\t\t\t\t\t\tskinAttached = true;\n\t\t\t\t\t\t\t\t}',
        1, 'k9-rows-skinattach')
      // SEL 路由:sub:skin-* → only "skin" + show 透传(子页在 SkinTab 内分流)
      // [v9] K v9 起 SEL 文本已含 sub:other 分支,本锚点随之更新(锚的是 K v9 产物)。
      c = rep(c,
        'show: active === "sub:basics" ? "basics" : active === "sub:other" ? "other" : void 0',
        'show: active === "sub:basics" ? "basics" : active === "sub:other" ? "other" : active === "sub:skin-assets" ? "skin-assets" : active === "sub:skin-suit" ? "skin-suit" : void 0',
        1, 'k9-sel-show')
      c = rep(c,
        '{ only: active === "sub:basics" || active === "sub:other" ? "general" : active.indexOf("sub:") === 0 ? active.slice(4) : active }',
        '{ only: active === "sub:basics" || active === "sub:other" ? "general" : active.indexOf("sub:skin-") === 0 ? "skin" : active.indexOf("sub:") === 0 ? active.slice(4) : active }',
        1, 'k9-sel-only')
      return c
    }
    results.push({ ...rewriteFresh(p, '.bak-k9-skin', apply, failures, K9_MARK), version: ver })
  }
  return results
}

// ---- [R81] unarchive RPC alpha.5 typert 运行时适配(2026-09-06,归档会话管理配套) ----
//       上游 fork 已补全链路(workspace 注册表/apiproxy/client-runtime,提交 bbf8960056/
//       077813903c/3fc1c34700),注册表本体经 profile junction 已指向仓库构建。但 official
//       轨(0.1.2-alpha.5)的工作区 RPC 走生成式 typert 面,按 /plugins 与 host 模块解析
//       按文件加载,与 rc.5 的 apiproxy 管道不同:需对三个文件做镜像插入,页面
//       ctx.workspaces.unarchiveSession 才能端到端可用 ——
//         a) dsh-api-remotes/lib/client.js: 生成清单 + schema(workspace/unarchiveSession);
//         b) dsh-api-workspace-controller/lib/client.js: Model + Controller 透传;
//         c) dsh-api-workspace-controller/lib/index.js: host 面 commands + TypertRemoteService
//            装饰器注册(Remote("unarchiveSession") + __esDecorate + facade)。
//       语义与上游一致:幂等、幽灵 id 可清、记账槽不动。锚点失配安全跳过(rc.x 栈无此形态);
//       独立 .bak-u5 + 哨兵,漂移走恢复重打。宿主侧(c)在壳重启后生效,客户端侧(a/b)随
//       /plugins rev 刷新。
const U5_MARK = '/*dsh-local-patch:unarchive-rpc-alpha5*/'
function patchUnarchiveRpcAlpha5() {
  const results = []
  const roots = []
  const profileNm = path.join(os.homedir(), '.dsh', 'profiles', 'node_modules')
  roots.push(profileNm)
  const npxCache = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'npm-cache', '_npx')
  if (fs.existsSync(npxCache)) {
    for (const h of fs.readdirSync(npxCache)) {
      roots.push(path.join(npxCache, h, 'node_modules'))
      roots.push(path.join(npxCache, h, 'node_modules', '.pnpm', 'node_modules'))
    }
  }
  const FILES = ['dsh-api-remotes/lib/client.js', 'dsh-api-workspace-controller/lib/client.js', 'dsh-api-workspace-controller/lib/index.js']
  // trim 匹配的行级拼接:第 occ 次出现的 startTrim 行起 blockLen 行之后插入 insertLines。
  function spliceAfter(lines, startTrim, occ, blockLen, insertLines) {
    let seen = 0
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim() !== startTrim) continue
      if (++seen < occ) continue
      return lines.slice(0, i + blockLen).concat(insertLines, lines.slice(i + blockLen))
    }
    return null
  }
  // 在 startTrim 命中行的前一行(opener,须为 "{")之前插入 insertLines。
  function spliceBeforeOpener(lines, startTrim, insertLines) {
    for (let i = 1; i < lines.length; i++) {
      if (lines[i].trim() !== startTrim) continue
      if (lines[i - 1].trim() !== '{') return null
      return lines.slice(0, i - 1).concat(insertLines, lines.slice(i - 1))
    }
    return null
  }
  for (const root of roots) {
    for (const rel of FILES) {
      const p = path.join(root, '@deepseek-ai', ...rel.split('/'))
      if (!fs.existsSync(p)) continue
      const label = 'u5/' + rel + '@' + root.split(path.sep).slice(-2).join('/')
      const head = fs.readFileSync(p, 'utf8')
      if (head.includes(U5_MARK)) { results.push({ file: label, ok: true, already: true, version: 'alpha5' }); continue }
      // alpha.5 typert 面的各文件特征串;rc.x 旧架构无此形态 → 安全跳过不判失败。
      const GATE = {
        'dsh-api-remotes/lib/client.js': '#workspace/archiveSession',
        'dsh-api-workspace-controller/lib/client.js': 'this.remote.archiveSession',
        'dsh-api-workspace-controller/lib/index.js': 'workspaceRegistry.archiveSession',
      }[rel]
      if (!head.includes(GATE)) { results.push({ file: label, ok: true, skipped: true, version: '?' }); continue }
      const eol = head.includes('\r\n') ? '\r\n' : '\n'
      const lines = head.split(/\r?\n/)
      let out = null
      try {
        if (rel === 'dsh-api-remotes/lib/client.js') {
          out = spliceAfter(lines, 'const _deepseek_ai_dsh_api_workspace_controller_workspace_archiveSession_result$schema = object({ "archivedSessionIds": array(intersection(string(), unknown())).readonly() });', 1, 1, [
            '\t\tconst _deepseek_ai_dsh_api_workspace_controller_workspace_unarchiveSession_parameter_0$schema = object({ "sessionId": intersection(string(), unknown()).readonly() });',
            '\t\tconst _deepseek_ai_dsh_api_workspace_controller_workspace_unarchiveSession_result$schema = object({ "archivedSessionIds": array(intersection(string(), unknown())).readonly() });',
          ])
          if (!out) throw new Error('schema anchor miss')
          const entry = [
            '\t\t\t\t{',
            '\t\t\t\t\tid: "@deepseek-ai/dsh-api-workspace-controller#workspace/unarchiveSession",',
            '\t\t\t\t\tservice: "workspaceController",',
            '\t\t\t\t\tnamespace: "workspace",',
            '\t\t\t\t\tmethod: "unarchiveSession",',
            '\t\t\t\t\tinvocation: { kind: "direct" },',
            '\t\t\t\t\tparameters: [{',
            '\t\t\t\t\t\tname: "request",',
            '\t\t\t\t\t\twire: "request",',
            '\t\t\t\t\t\tsource: "json",',
            '\t\t\t\t\t\tcodec: {',
            '\t\t\t\t\t\t\tmode: "strict",',
            '\t\t\t\t\t\t\ttypeSymbol: "@deepseek-ai/dsh-api-workspace-controller/types#WorkspaceUnarchiveSessionRequest",',
            '\t\t\t\t\t\t\tschema: _deepseek_ai_dsh_api_workspace_controller_workspace_unarchiveSession_parameter_0$schema',
            '\t\t\t\t\t\t}',
            '\t\t\t\t\t}],',
            '\t\t\t\t\tresult: {',
            '\t\t\t\t\t\tmode: "strict",',
            '\t\t\t\t\t\ttypeSymbol: "@deepseek-ai/dsh-api-workspace-controller/types#WorkspaceUnarchiveValue",',
            '\t\t\t\t\t\tschema: _deepseek_ai_dsh_api_workspace_controller_workspace_unarchiveSession_result$schema',
            '\t\t\t\t\t},',
            '\t\t\t\t\tsourceLocation: {',
            '\t\t\t\t\t\t"file": "packages/api/workspace-controller/src/index.ts",',
            '\t\t\t\t\t\t"line": 108,',
            '\t\t\t\t\t\t"column": 3',
            '\t\t\t\t\t}',
            '\t\t\t\t},',
          ]
          out = spliceBeforeOpener(out, 'id: "@deepseek-ai/dsh-api-workspace-controller#workspace/create",', entry)
          if (!out) throw new Error('manifest anchor miss')
        } else if (rel === 'dsh-api-workspace-controller/lib/client.js') {
          out = spliceAfter(lines, 'async archiveSession(sessionId) {', 1, 5, [
            '\t\t\t/**',
            '\t\t\t* Unarchive one Session and install the returned complete archive set.',
            '\t\t\t* @param sessionId - Session to unarchive.',
            '\t\t\t* @returns generated Remote result.',
            '\t\t\t*/',
            '\t\t\tasync unarchiveSession(sessionId) {',
            '\t\t\t\tconst result = await this.remote.unarchiveSession({ sessionId });',
            '\t\t\t\tif (result.ok) this.installArchived(result.value.archivedSessionIds);',
            '\t\t\t\treturn result;',
            '\t\t\t}',
          ])
          if (!out) throw new Error('model anchor miss')
          out = spliceAfter(out, 'async archiveSession(sessionId) {', 2, 4, [
            '\t\t\tasync unarchiveSession(sessionId) {',
            '\t\t\t\tconst result = await this.model.unarchiveSession(sessionId);',
            '\t\t\t\tif (!result.ok) throw commandError("session unarchive", result.error);',
            '\t\t\t}',
          ])
          if (!out) throw new Error('controller anchor miss')
        } else {
          out = spliceAfter(lines, 'async archiveSession(request) {', 1, 9, [
            '\t/**',
            '\t* Remove one known Session from the registry-global archive set.',
            '\t* @param request - Session identity to unarchive.',
            '\t* @returns the complete resulting archive set.',
            '\t*/',
            '\tasync unarchiveSession(request) {',
            '\t\ttry {',
            '\t\t\tawait this.ctx.workspaceRegistry.unarchiveSession(request.sessionId);',
            '\t\t} catch (error) {',
            '\t\t\tif (!(error instanceof WorkspaceUnknownSessionError)) throw error;',
            '\t\t\tthrow new RemoteError("session/not-found", error.message, { sessionId: request.sessionId }, { cause: error });',
            '\t\t}',
            '\t\treturn { archivedSessionIds: [...this.ctx.workspaceRegistry.archivedSessionIds] };',
            '\t}',
          ])
          if (!out) throw new Error('commands anchor miss')
          out = spliceAfter(out, 'let _archiveSession_decorators;', 1, 1, ['\tlet _unarchiveSession_decorators;'])
          if (!out) throw new Error('decorator decl anchor miss')
          out = spliceAfter(out, '_archiveSession_decorators = [Remote("archiveSession")];', 1, 1, ['\t\t\t_unarchiveSession_decorators = [Remote("unarchiveSession")];'])
          if (!out) throw new Error('decorator assign anchor miss')
          out = spliceAfter(out, '__esDecorate(this, null, _archiveSession_decorators, {', 1, 11, [
            '\t\t\t__esDecorate(this, null, _unarchiveSession_decorators, {',
            '\t\t\t\tkind: "method",',
            '\t\t\t\tname: "unarchiveSession",',
            '\t\t\t\tstatic: false,',
            '\t\t\t\tprivate: false,',
            '\t\t\t\taccess: {',
            '\t\t\t\t\thas: (obj) => "unarchiveSession" in obj,',
            '\t\t\t\t\tget: (obj) => obj.unarchiveSession',
            '\t\t\t\t},',
            '\t\t\t\tmetadata: _metadata',
            '\t\t\t}, null, _instanceExtraInitializers);',
          ])
          if (!out) throw new Error('esDecorate anchor miss')
          out = spliceAfter(out, 'archiveSession(request) {', 1, 3, [
            '\t\t/**',
            '\t\t* Restore one archived Session to Workspace grouping surfaces.',
            '\t\t* @param request - Session identity to unarchive.',
            '\t\t* @returns the complete resulting archive set.',
            '\t\t*/',
            '\t\tunarchiveSession(request) {',
            '\t\t\treturn this.commands.unarchiveSession(request);',
            '\t\t}',
          ])
          if (!out) throw new Error('facade anchor miss')
        }
      } catch (e) {
        results.push({ file: label, ok: false, failures: [label + ': ' + e.message] })
        continue
      }
      const bak = p + '.bak-u5'
      if (!fs.existsSync(bak)) fs.copyFileSync(p, bak)
      fs.writeFileSync(p, out.join(eol) + eol + U5_MARK + eol, 'utf8')
      results.push({ file: label, ok: true, version: 'alpha5' })
    }
  }
  if (!results.length) results.push({ file: 'u5/typert-surface', missing: true })
  return results
}

// ---- 入口 ----
function replayAll(log = () => {}) {
  const out = { ok: true, items: [] }
  for (const r of [...patchBetterSidebar(), ...patchNodeNav(), ...patchTurnRewind(), ...patchEgoBrowserSettings(), ...patchConversation(), ...patchEntrySmooth(), ...patchDshmarket(), ...patchSettingsInfoArch(), ...patchGitGraph(), ...patchPresets(), ...patchProfileSidebarDedup(), ...patchTurnReview(), ...patchJoiTheme(), ...patchVisionRouter(), ...patchMobileGlassSw(), ...patchSettingsNest(), ...patchGeneralOtherSlot(), ...patchSkinSubpages(), ...patchUnarchiveRpcAlpha5(), ...patchAgentTeamsTab(), ...patchPluginSettingsItemId(), ...patchMnemonProjection(), ...patchNewSessionFallback(), ...patchWorkspaceNoPickEntry(), ...patchUngroupedGroupBlank(), ...patchSessionDeleteEntry(), ...patchHeroNoWorkspaceInert(), ...patchConversationPlusQuickActions()]) {
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
