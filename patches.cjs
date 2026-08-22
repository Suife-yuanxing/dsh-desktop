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
      // 0.14.0 模板:#root 新增 width:calc 行,transition 改多行展开式 → 跨行通配锚点
      if (/margin-right: var\(--dsh-sidebar-width, 0px\);/.test(c)) {
        c = rex(c, /#root \{\\n  margin-right: var\(--dsh-sidebar-width, 0px\);[\s\S]*?\}/,
          `#root {\\n  margin-right: calc(var(--dsh-sidebar-width, 0px) + var(--dsh-bsr-gap, 0px) * 2);\\n  width: calc(100% - var(--dsh-sidebar-width, 0px));\\n  transition: margin-right ${MOTION}, width ${MOTION};\\n}`, 1, 'layout-root')
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
      /children: \(0, react_jsx_runtime\.jsx\)\("div", \{\s*className: ReasoningRow_module_css_default\.thinkBody,\s*children: text\s*\}\)/,
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
        '\t\t\t\t\t\t\t\t\tonClick: () => {\n\t\t\t\t\t\t\t\t\t\tsetCompat(null);\n\t\t\t\t\t\t\t\t\t\tsetConfirming(p);\n\t\t\t\t\t\t\t\t\t\tfetch("/dsh-market/preview", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: p.url }) }).then((r) => r.json()).then((b) => { if (b && b.ok) setCompat(b); }).catch(() => {});\n\t\t\t\t\t\t\t\t\t},', 1, 'compat-fetch')
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

/** 上游漂移自愈重写:文件被上游更新(≠基底且≠补丁态)时刷新基底重打。 */
function rewriteFresh(p, bakSuffix, apply, failures) {
  const file = path.basename(path.dirname(p)) + '/' + path.basename(p)
  const bak = p + bakSuffix
  const current = fs.readFileSync(p, 'utf8')
  let base = fs.existsSync(bak) ? fs.readFileSync(bak, 'utf8') : current
  let patched = apply(base)
  if (current !== base && current !== patched) {
    // 上游已更新:刷新基底,从新内容重打
    base = current
    patched = apply(base)
  }
  if (!fs.existsSync(bak) || fs.readFileSync(bak, 'utf8') !== base) fs.writeFileSync(bak, base, 'utf8')
  if (failures.length) {
    fs.writeFileSync(p, base, 'utf8')
    return { file, ok: false, failures: [...failures] }
  }
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
      results.push({ ...rewriteFresh(p, '.bak-persona', apply, failures), version: 'preset' })
    } catch (e) {
      results.push({ file: p, ok: false, failures: [`[presets] ${e.message}`] })
    }
  }
  if (!files.length) results.push({ file: 'presets', missing: true })
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

// ---- [E] profile 守护: 禁用聚合包内嵌 better-sidebar,防 /sidebar/api 路由冲突回潮 ----
// 补丁语义按 id 后写覆盖先写:若有人把该行改回启用,末尾再追一条 disabled:true 强制压回。
function patchProfileSidebarDedup() {
  const file = 'cordis.patch.yml'
  const p = path.join(os.homedir(), '.dsh', 'profiles', 'web', 'cordis.patch.yml')
  if (!fs.existsSync(p)) return [{ file, missing: true }]
  // 2026-08-22 [dshmarket 体检]: 聚合包(dsh-web-ui-all)卸载后不再自动追加守护行,
  // 否则每次体检都会报 web-ui-better-sidebar "patch target not found" 孤儿。
  // 仅在聚合包内嵌 better-sidebar 仍在 node_modules 时才守护;重装聚合包后自动恢复,
  // crash-loop 防护语义不变。
  if (!fs.existsSync(path.join(PLUGINS, '@linxin666', 'dsh-client-ui-web-ui-better-sidebar'))) {
    return [{ file, ok: true, already: true, version: 'profile' }]
  }
  const ROW = '- id: web-ui-better-sidebar'
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

// ---- 入口 ----
function replayAll(log = () => {}) {
  const out = { ok: true, items: [] }
  for (const r of [...patchBetterSidebar(), ...patchNodeNav(), ...patchConversation(), ...patchEntrySmooth(), ...patchDshmarket(), ...patchSettingsInfoArch(), ...patchGitGraph(), ...patchPresets(), ...patchProfileSidebarDedup()]) {
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
