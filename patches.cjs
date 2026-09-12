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
//       A5 aionui 原生 explorer/preview 列剔除(浮动卡片为唯一右侧表面)
//       A6 布局推送变量/属性收窄 #root(卡片内大文件开合卡顿根治,geo-root-scope 标记)
//       A7 产物行让位(2026-09-10): conversation.chat.turnTail 链 priority -1 → 1 ——
//          上游 0.1.5 原生右栏上线后,「点击模型产物」应走 ui-deliverables 行(priority 0)
//          的 chat.openFile → ctx.sidebarRight.openResource → 原生侧栏文本预览 tab,
//          而不是被 better-sidebar 劫持进它自己的编辑器面板(旧侧边栏)。
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
  // [批次144 2026-09-10] 机会性锚点清单:repOpt 未命中的标签(上游已自行解决/代码已迁移)
  // 不算失败,调用方可在结果对象里带出留痕。存在意义 = **不让过时锚点连坐**同一次 apply
  // 里仍然有效的修复(apply 是全趟原子的:任一 failures → 整份不写盘)。
  const optional = []
  return {
    failures,
    optional,
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
    // [批次144 2026-09-10] 机会性计数替换:命中 1 次 → 正常替换;命中 0 次 → **不算失败**
    // (记入 optional 清单,属「上游已自行解决 / 代码已迁移」的预期形态);命中 >1 次 → 才算失配。
    // 用法纪律:一个家族里「功能当下必需」的锚点用 rep(缺了就说明上游变了、要人工研判),
    // 「历史遗留 / 上游可能自解」的锚点用 repOpt —— 否则一处过时锚点会把同趟 apply 里
    // 仍然有效的修复一起拖死(joi-theme 批次 144 实证)。
    repOpt(c, from, to, label) {
      const fromN = from.replace(/\r\n/g, '\n')
      const toN = to.replace(/\r\n/g, '\n')
      const fromC = fromN.includes('\n') ? fromN.split('\n').join('\r\n') : null
      const toC = fromC ? toN.split('\n').join('\r\n') : null
      const n = c.split(fromN).length - 1 + (fromC ? c.split(fromC).length - 1 : 0)
      if (n === 0) { optional.push(label); return c }
      if (n > 1) { failures.push(`[${file}] ${label}(repOpt): matched ${n} > 1`); return c }
      const out = fromC ? c.split(fromC).join(toC) : c
      return out.split(fromN).join(toN)
    },
    // 可选正则替换:0.12.3 新增的 title-bar-strip 兼容规则存在则中和,不存在(未来版本移除)则跳过
    rexOpt(c, re, to, label) {      const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g')
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
    // [R93 2026-09-11] 能力判据(上游 0.19.0「退役插件自绘右侧面板」):
    //   v0.19.0 起 better-sidebar 不再自绘浮动侧边卡片 —— 右列交给 DSH 原生右侧栏
    //   (插件的 7 个 tab 类型注册成原生 tab;文件打开统一走 ctx.sidebarRight.openResource,
    //   并注册 editor tab 类型以 extension 优先级认领 dsh-resource://file/**),插件自己只
    //   保留底部工作台,开合按钮进 DSH 会话头 utilities 槽。上游 README 原话:
    //   「🧩 退役插件自绘右侧面板与自由窗口(#605)」。
    //   本家族(A1 底面板剔除 / A2 卡片几何 / A3 动效 / A4 gap / A5 aionui 列隐藏 /
    //   A6 布局收窄 / A7 产物行让位)全部锚定那个已不存在的 UI ⇒ 24 条锚点整族失配。
    //   判据 = 该产物是否还带「浮动卡片面」的两个稳定特征:CSS 模块面板规则 + 入口簇。
    //   不满足即 skipped(不算 FAIL、不写盘);上游若回退到自绘面板的版本,本家族自动恢复。
    {
      const probe = fs.readFileSync(p, 'utf8')
      if (!/\.\w+_panel\{[^}]*position:(?:fixed|absolute)/.test(probe) || !probe.includes('toggleCluster')) {
        results.push({
          file: 'bsr/' + f,
          ok: true,
          skipped: true,
          reason: '上游已退役自绘右侧面板(0.19.0+ 浮动卡片不存在),A 链无需守护',
        })
        continue
      }
    }
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
        // A7 产物行让位(2026-09-10,用户需求「修复点击模型产物时会调用旧侧边栏」):
        // better-sidebar 以 priority -1 抢占 conversation.chat.turnTail 链 —— 助手回合末尾的
        // 产物行(「本次产出」+ 文件 chip)由它的 SidebarProducedFiles 渲染,**点击走
        // openSidebarFile() → 它自己的编辑器面板(旧侧边栏)**。0.1.5 上游原生右栏
        // (dsh-client-ui-sidebar-right/dockkit + sidebar-documentpreview)上线后,产物行应回到
        // ui-deliverables(默认 priority 0)的行:其 chip 调 chat.openFile →
        // ctx.sidebarRight.openResource(dsh-resource://file/session/<id>/<path>) → 新原生侧栏的
        // 文本预览 tab(dsh-client-ui-chat lib/client.js:8319-8325 实证)。
        // slots 核心排序:条目按 priority 升序,「lowest renders」,链式取首个 select 非空者
        // (dsh-client-ui-slots lib/index.js:96 + dsh-client-ui-renderer lib/client.js:831-848)。
        // 把 priority 降到 1 = 上游条目在场时上游胜出;上游条目缺席(未来移除该注册)才回退旧行,
        // 属优雅降级。**副作用**:产物行 chip 的「在文件夹中显示」手势随之回到上游语义
        // (仅 produced>6 时出现,走 present.open / reveal),better-sidebar 的 explorer 高亮
        // 不再参与。反悔办法=把本行 priority 改回 -1 重放(哨兵态需先从 .bak-repatch 还原)。
        c = rep(c,
          '\t\t\t\tpriority: -1,\n\t\t\t\tregistrant: "dsh-better-sidebar",',
          '\t\t\t\tpriority: 1,\n\t\t\t\tregistrant: "dsh-better-sidebar",',
          1, 'turntail-yield')
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
      } else if (c.includes('#root [data-dsh-frame],')) {
        // 0.18+ 布局推送模型重构(问题122): #root margin-right 单规则 → AppFrame 三栏 grid
        // 的 frame padding-right 模型 + 中列改 [data-dsh-center-col] 标签锚定(上游以标签替换
        // has() 结构选择器,规避流式期间全文档选择器重评估)。等价迁移四件:
        // ① frame padding 加 gap 呼吸距(旧 layout-root 的 gap*2 语义,面板固定 right:12px
        //    下留 4px 内容呼吸)并剥掉 padding-right 布局属性 transition(批次 109 纪律:
        //    开合=一次瞬时重排,面板仍 transform 滑入 GPU 合成);
        // ② details 拖拽柄 transform 与 padding 同步含 gap——柄从 border-box 实测定位,
        //    不同步会落在面板(固定 right:12px)覆盖区内不可见;
        // ③ 中列 margin-bottom 布局属性 transition 照旧剥离(与 0.15- 同规);
        // ④ collapsed 头部 78→54px 与 VARS 令牌注入照旧(A6 随后统一迁移 body→#root 属性面)。
        c = rep(c,
          'padding-right: var(--dsh-sidebar-width, 0px);\\n  transition: padding-right var(--ds-transition-duration-slow) var(--ds-ease-in-out);',
          'padding-right: calc(var(--dsh-sidebar-width, 0px) + var(--dsh-bsr-gap, 0px) * 2);',
          1, 'layout-frame')
        c = rep(c,
          'transform: translateX(calc(0px - var(--dsh-sidebar-width, 0px)));',
          'transform: translateX(calc(0px - (var(--dsh-sidebar-width, 0px) + var(--dsh-bsr-gap, 0px) * 2)));',
          1, 'layout-details')
        c = rex(c, /\\n {2}transition: margin-bottom [^;]*;/, '', 1, 'layout-centerCol')
        c = rep(c, 'padding-right: 78px;', 'padding-right: 54px;', 1, 'layout-collapsedHeader')
        const VARS18 = `:root {\\n  --dsh-bsr-slide-duration: 300ms;\\n  --dsh-bsr-slide-ease: cubic-bezier(0.32, 0.72, 0, 1);\\n  --dsh-bsr-gap: 8px;\\n}\\n\\nbody[data-dsh-sidebar-collapsed] {\\n  --dsh-bsr-gap: 0px;\\n}\\n\\n`
        c = rep(c,
          '#root [data-dsh-frame],\\n#root > [data-slot=\\"root\\"] > div {\\n  box-sizing: border-box;',
          VARS18 + '#root [data-dsh-frame],\\n#root > [data-slot=\\"root\\"] > div {\\n  box-sizing: border-box;',
          1, 'layout-vars')
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

// ---- [R92] dsh-better-sidebar 交付卡片「打开」改道侧边卡片(2026-09-11,用户需求) ----
// 症状: 聊天区「交付文件」卡片(present 产出的文件卡)点「打开」或点卡片本体,落进 0.1.5 原生
//       右侧栏的文本预览 tab,而不是 better-sidebar 的编辑器(用户要的是后者)。
// 根因: 上游 0.1.5 把聊天区文件打开漏斗整体换了 —— 旧漏斗 remote.session.openWorkspacePath
//       已被 dsh-client-ui-chat 弃用(实证 chat/lib/client.js:8319-8325),现在走
//       ctx.sidebarRight.openResource("dsh-resource://file/session/<id>/<path>") →
//       dsh-client-ui-sidebar-right 按 patterns ["dsh-resource://file/**"] 认领 →
//       原生右侧栏 documentpreview tab。better-sidebar 的 openpath-intercept 只影子了旧漏斗
//       (src/client/openpath-intercept.ts 的整个前提是 alpha 主机),故在 0.1.5 上已成死代码。
// 修法: ① document 捕获相监听交付卡片手势(上游卡片自带稳定标记 [data-presented-file];
//          排除带 aria-haspopup=menu 的「更多文件操作」按钮,让「用默认应用打开 / 在文件
//          资源管理器中显示」仍走上游原生通道)→ 置一次性武装位;
//       ② ctx.inject(["sidebarRight"]) 影子实例的 openResource(自有数据属性遮蔽原型方法,
//          与 wrapOpenWorkspacePath 同款可还原姿势): 武装位仍在时解析
//          dsh-resource://file/session/<id>/<path> 并调 openSidebarFile 落进编辑器;
//          其余一律回落上游原方法。
// 作用域: **只锁交付卡片** ——「本轮文件改动」chip 仍走原生右侧栏(保留 R85 时代 A7 的产物行
//       让位成果: 产物行渲染与落点都不动)。上游若删掉 data-presented-file 标记,监听永不命中,
//       行为自动回落成现状(不会坏)。
// 开关: 复用既有 pref interceptOpenPath + editor tab 启用开关 + 未挂起(与 better-sidebar
//       自己的 takeoverEnabled 判据同源);另需 ctx.get("betterSidebar") 在场,否则不吞手势。
// 载体纪律: 本文件已被 [A] 的 rewrite 家族占用(.bak-repatch 基底;current 已带 PATCH_MARK →
//       rewrite 哨兵快速通道会整体跳过 [A],故新家族**不得折进 [A] 的 apply**,也不得再走
//       rewrite),按 patchBlankSessionDup / patchSessionFormatV0Lenient 同款自实现 MARK 家族:
//       直接读 current、命中自有 MARK 即幂等 already、失败不写盘。无 .bak 基底(市场包整体
//       覆盖式更新,陈旧基底只会误导;幂等靠「自有 MARK + 上游锚点」)。
//       重放顺序: 必须排在 patchBetterSidebar() 之后 —— [A] 走 rewrite 重建整份文件时会抹掉
//       本家族的注入,靠 replayAll 的先后把它补回来。
// 生效面: 客户端产物 —— 刷新页面即生效(无需重启 dsh)。
const PRESENTED_REDIRECT_MARK = '/* [dsh-desktop] R92 presented-card-redirect */'
function patchPresentedCardRedirect() {
  const ANCHOR = '}, "dsh-better-sidebar: open-path interception");'
  const INJECT = [
    '\t\t\t\tctx.effect(() => {',
    '\t\t\t\t\ttry {',
    '\t\t\t\t\t\t' + PRESENTED_REDIRECT_MARK,
    '\t\t\t\t\t\t// [R92] 交付卡片手势 → 侧边卡片编辑器;作用域与开关见本家族文件头注释',
    '\t\t\t\t\t\tconst CARD_SELECTOR = "[data-presented-file]";',
    '\t\t\t\t\t\tconst FILE_RESOURCE_PREFIX = "dsh-resource://file/";',
    '\t\t\t\t\t\tlet cardGesture = false;',
    '\t\t\t\t\t\tconst parseFileAddress = (address) => {',
    '\t\t\t\t\t\t\tif (typeof address !== "string" || !address.startsWith(FILE_RESOURCE_PREFIX)) return null;',
    '\t\t\t\t\t\t\tconst rest = address.slice(FILE_RESOURCE_PREFIX.length);',
    '\t\t\t\t\t\t\tif (!rest.startsWith("session/")) return null;',
    '\t\t\t\t\t\t\tconst body = rest.slice(8);',
    '\t\t\t\t\t\t\tconst slash = body.indexOf("/");',
    '\t\t\t\t\t\t\tif (slash <= 0) return null;',
    '\t\t\t\t\t\t\ttry {',
    '\t\t\t\t\t\t\t\treturn {',
    '\t\t\t\t\t\t\t\t\tsessionId: decodeURIComponent(body.slice(0, slash)),',
    '\t\t\t\t\t\t\t\t\tpath: decodeURIComponent(body.slice(slash + 1))',
    '\t\t\t\t\t\t\t\t};',
    '\t\t\t\t\t\t\t} catch (error) {',
    '\t\t\t\t\t\t\t\treturn null;',
    '\t\t\t\t\t\t\t}',
    '\t\t\t\t\t\t};',
    '\t\t\t\t\t\tconst onCardGesture = (event) => {',
    '\t\t\t\t\t\t\tconst target = event.target;',
    '\t\t\t\t\t\t\tif (!(target instanceof Element)) return;',
    '\t\t\t\t\t\t\tif (target.closest(CARD_SELECTOR) === null) return;',
    '\t\t\t\t\t\t\tconst button = target.closest("button");',
    '\t\t\t\t\t\t\tif (button !== null && button.getAttribute("aria-haspopup") === "menu") return;',
    '\t\t\t\t\t\t\tcardGesture = true;',
    '\t\t\t\t\t\t\twindow.setTimeout(() => { cardGesture = false; }, 0);',
    '\t\t\t\t\t\t};',
    '\t\t\t\t\t\tdocument.addEventListener("click", onCardGesture, true);',
    '\t\t\t\t\t\tconst fiber = ctx.inject(["sidebarRight"], (fctx) => {',
    '\t\t\t\t\t\t\tfctx.effect(() => {',
    '\t\t\t\t\t\t\t\tconst service = fctx.get("sidebarRight");',
    '\t\t\t\t\t\t\t\tif (service === void 0 || service === null) return () => {};',
    '\t\t\t\t\t\t\t\tconst KEY = "openResource";',
    '\t\t\t\t\t\t\t\tconst descriptor = Object.getOwnPropertyDescriptor(service, KEY);',
    '\t\t\t\t\t\t\t\tconst original = service[KEY];',
    '\t\t\t\t\t\t\t\tif (typeof original !== "function") return () => {};',
    '\t\t\t\t\t\t\t\tconst wrapped = function(address, options) {',
    '\t\t\t\t\t\t\t\t\tconst armed = cardGesture;',
    '\t\t\t\t\t\t\t\t\tcardGesture = false;',
    '\t\t\t\t\t\t\t\t\tif (armed) {',
    '\t\t\t\t\t\t\t\t\t\tconst parsed = parseFileAddress(address);',
    '\t\t\t\t\t\t\t\t\t\tconst prefs = sidebarStore.getPrefs();',
    '\t\t\t\t\t\t\t\t\t\tif (parsed !== null && !sidebarStore.getSuspended() && prefs.interceptOpenPath !== false && prefs.tabsEnabled["editor"] !== false && ctx.get("betterSidebar") !== void 0) {',
    '\t\t\t\t\t\t\t\t\t\t\topenSidebarFile(ctx, sidebarStore, parsed.sessionId, parsed.path);',
    '\t\t\t\t\t\t\t\t\t\t\treturn void 0;',
    '\t\t\t\t\t\t\t\t\t\t}',
    '\t\t\t\t\t\t\t\t\t}',
    '\t\t\t\t\t\t\t\t\treturn original.call(this, address, options);',
    '\t\t\t\t\t\t\t\t};',
    '\t\t\t\t\t\t\t\ttry {',
    '\t\t\t\t\t\t\t\t\tObject.defineProperty(service, KEY, { configurable: true, enumerable: false, writable: true, value: wrapped });',
    '\t\t\t\t\t\t\t\t} catch (error) {',
    '\t\t\t\t\t\t\t\t\treturn () => {};',
    '\t\t\t\t\t\t\t\t}',
    '\t\t\t\t\t\t\t\treturn () => {',
    '\t\t\t\t\t\t\t\t\tif (descriptor !== void 0) Object.defineProperty(service, KEY, descriptor);',
    '\t\t\t\t\t\t\t\t\telse Reflect.deleteProperty(service, KEY);',
    '\t\t\t\t\t\t\t\t};',
    '\t\t\t\t\t\t\t}, "dsh-better-sidebar: presented-card open redirect");',
    '\t\t\t\t\t\t});',
    '\t\t\t\t\t\treturn () => {',
    '\t\t\t\t\t\t\tfiber.dispose();',
    '\t\t\t\t\t\t\tdocument.removeEventListener("click", onCardGesture, true);',
    '\t\t\t\t\t\t};',
    '\t\t\t\t\t} catch (error) {',
    '\t\t\t\t\t\tfail("interception", error);',
    '\t\t\t\t\t\treturn () => {};',
    '\t\t\t\t\t}',
    '\t\t\t\t}, "dsh-better-sidebar: presented-card interception");',
  ].join('\n')
  const TO = ANCHOR + '\n' + INJECT
  const results = []
  // 只完整产物带该 apply 段(terminal/editor 天然 no-op,与 [A] 的 isFull 判据一致)
  for (const f of ['client.js', 'client-registry.js']) {
    const file = 'bsr/' + f
    const p = path.join(PLUGINS, 'dsh-better-sidebar', 'lib', f)
    if (!fs.existsSync(p)) continue
    const current = fs.readFileSync(p, 'utf8')
    if (current.includes(PRESENTED_REDIRECT_MARK)) { results.push({ file, ok: true, already: true }); continue }
    // [R93 2026-09-11] 能力判据(上游 0.19.0 已自解):v0.19.0 整块退役了 openpath-intercept
    // —— 旧漏斗 remote.session.openWorkspacePath 的影子被删掉(该串在 0.19.0 产物里 x0),
    // 而插件改为**原生**接管:客户端把聊天区文件打开统一走 ctx.sidebarRight.openResource
    // (dsh-resource://file/…),再注册自己的 editor tab 类型以 extension 优先级认领该地址
    // (压过内置文本预览,并接管内置「文件」页)。⇒ 本家族要达成的目标(卡片「打开」落进
    // better-sidebar 编辑器)已由上游原生提供,属「上游已解」,退化为 skipped:不写盘、
    // 不计 FAIL;上游若回退旧漏斗形态,本家族自动恢复守护。
    if (!current.includes('dsh-better-sidebar: open-path interception')) {
      results.push({ file, ok: true, skipped: true, reason: '上游已原生接管聊天区文件打开(0.19.0+),R92 无需守护' })
      continue
    }
    const { rep, failures } = makeCtx(file)
    const c = rep(current, ANCHOR, TO, 1, 'presented-card-intercept')
    if (failures.length) { results.push({ file, ok: false, failures: [...failures] }); continue }
    fs.writeFileSync(p, c, 'utf8')
    results.push({ file, ok: true, already: false })
  }
  if (!results.length) results.push({ file: 'dsh-better-sidebar', missing: true })
  return results.map((r) => ({ ...r, version: 'local' }))
}

// ---- [R94] 交付文件「正文提及」改道侧边卡片(2026-09-11,用户需求) ----
// 主诉:「修复点击会话中的文件时不是打开侧边卡片而是打开应用选择器」。
// 现象: 收尾消息正文里那个带下划线的文件名 chip(模型按系统提示把改动文件写成 inline code,
//       渲染层再按 fileMentions 把能解析成本轮文件的 token 变成可点按钮)点下去,弹出的是
//       Windows「选择一个应用以打开此 .md 文件」(本机 .md 无默认关联),而不是侧边卡片 ——
//       同一个文件在交付卡片里点「打开」落侧边卡片、在正文里点却弹系统对话框。
// 根因(0.1.5-rc.1 实证): dsh-client-ui-deliverables 客户端 chatFileMentions.forClosing 对两类
//       路径分派了**不同**开法 ——
//         produced (本轮 write/edit 产物) → owner.openFile(path) → chat.openFile
//           → ctx.sidebarRight.openResource("dsh-resource://file/session/<sid>/<path>") → 侧边卡片 ✓
//         presented(present 声明的交付文件) → opener.open(sessionId, seq, index)
//           → POST /api/present.open → host sessionController.openWorkspacePath
//           → openPath → **宿主桌面默认应用**(.md 无关联即弹应用选择器)×
//       交付卡片本体与其「打开」按钮走的是 onPreview → openFile(同一条侧边卡片链),
//       所以跑偏的只有「正文提及」这一处。
// 修法: 正文提及的两类路径**统一** owner.openFile(path);aria-label 同步从 presented.open
//       (「在默认程序中打开 X」)改回 produced.open(「打开 X」),不再与真实行为不符。
//       **不夺显式手势**: 交付卡片「…」菜单里的「用默认应用打开 / 在文件资源管理器中显示」
//       原样保留(那是本插件唯一的系统打开入口,用户主动选才走)。
// 载体纪律: 目标是**核心包**客户端产物(与 [D]/[Q] 同款,落在 npx 缓存的 pnpm-seed 里:不随
//       市场包更新漂移,随 dsh 大版本升级漂移 —— 换 seed 后锚点失配即 FAIL 待人工对位)。
//       ① 自有 MARK 幂等;② 直接读 current、失败不写盘;③ 历史多份 seed 并存:只认「带
//       /api/present.open 的现代形态」,旧形态(0.1.0-rc.5 / 0.1.1 / 0.1.2 时代,连 present.open
//       链都没有)静默 skipped 不算 FAIL;④ 提升层 junction 与 .pnpm 实体是同一份文件,分路径
//       重复命中由 MARK 幂等吸收。
// 生效面: 客户端产物 —— dsh-client-hmr 每 500ms 轮询产物 mtime,改盘后**就地热重载**该模块
//       (实测无需重启 dsh;不生效再刷新页面)。
const PRESENTED_MENTION_MARK = '/* [dsh-desktop] R94 presented-mention-sidebar */'
function patchPresentedMentionSidebar() {
  const FROM = '\t\t\t\t\tconst file = deliveries.get(path);\n' +
    '\t\t\t\t\tif (file === void 0) owner.openFile(path);\n' +
    '\t\t\t\t\telse opener.open(sessionId, file.seq, file.index);\n' +
    '\t\t\t\t}, (path) => t(deliveries.has(path) ? "presented.open" : "produced.open", { name: path }));'
  const TO = '\t\t\t\t\t' + PRESENTED_MENTION_MARK + '\n' +
    '\t\t\t\t\t// [R94] 正文提及的交付文件与产物统一走 openFile(→ sidebarRight.openResource → 侧边卡片);\n' +
    '\t\t\t\t\t//       系统默认应用那条链仍留在交付卡片「…」菜单里(显式手势不夺,见本家族文件头)\n' +
    '\t\t\t\t\towner.openFile(path);\n' +
    '\t\t\t\t}, (path) => t("produced.open", { name: path }));'
  const patchFile = (p, label) => {
    const current = fs.readFileSync(p, 'utf8')
    if (current.includes(PRESENTED_MENTION_MARK)) return { file: label, ok: true, already: true }
    // 旧形态副本(0.1.0-rc.5 / 0.1.1 / 0.1.2 时代)连 present.open 这条链都没有 → 非活体,静默跳过
    if (!current.includes('/api/present.open')) return { file: label, ok: true, skipped: true, reason: '旧形态(无 present.open 链),非活体副本' }
    const { rep, failures } = makeCtx(label)
    const c = rep(current, FROM, TO, 1, 'presented-mention-openFile')
    if (failures.length) return { file: label, ok: false, failures: [...failures] }
    fs.writeFileSync(p, c, 'utf8')
    return { file: label, ok: true, already: false }
  }
  const results = []
  const seen = new Set()
  const add = (p, label) => {
    if (typeof p !== 'string' || !p || seen.has(p)) return
    seen.add(p)
    if (!fs.existsSync(p)) return
    let ver = 'local'
    try { ver = JSON.parse(fs.readFileSync(path.join(path.dirname(path.dirname(p)), 'package.json'), 'utf8')).version } catch {}
    results.push({ ...patchFile(p, label), version: ver })
  }
  const REL = ['@deepseek-ai', 'dsh-client-ui-deliverables', 'lib', 'client.js']
  // O: npx 缓存三层布局(提升层 .pnpm/node_modules、平铺层 node_modules、.pnpm 实体层)
  const npxRoot = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), '.npm-cache'), 'npm-cache', '_npx')
  if (fs.existsSync(npxRoot)) {
    for (const h of fs.readdirSync(npxRoot)) {
      add(path.join(npxRoot, h, 'node_modules', '.pnpm', 'node_modules', ...REL), 'deliverables/client.js@hoist@' + h.slice(0, 6))
      add(path.join(npxRoot, h, 'node_modules', ...REL), 'deliverables/client.js@flat@' + h.slice(0, 6))
      const pnpmDir = path.join(npxRoot, h, 'node_modules', '.pnpm')
      if (!fs.existsSync(pnpmDir)) continue
      for (const d of fs.readdirSync(pnpmDir)) {
        if (!d.startsWith('@deepseek-ai+dsh-client-ui-')) continue
        add(path.join(pnpmDir, d, 'node_modules', ...REL), 'deliverables/client.js@pnpm@' + d.slice(-8))
      }
    }
  }
  // L: 本地 monorepo 构建产物(存在则并入;旧形态会被 skipped 掉)
  for (const lp of ['D:\\deepseek harness\\deepseek-harness\\packages\\client\\ui-deliverables\\lib\\client.js',
    path.join(os.homedir(), 'deepseek-harness', 'packages', 'client', 'ui-deliverables', 'lib', 'client.js')]) {
    add(lp, 'deliverables/client.js@L')
  }
  if (!results.length) results.push({ file: 'ui-deliverables/client.js', missing: true })
  return results
}

// ---- [R95] ui-commands 贡献形状容错(2026-09-11,用户需求后半场) ----
// 症状: 敲 "/" 打开菜单,**系统自带命令整组不见**,只剩「技能」一组(100+ 条)。
// 根因(活体取证): 控制台 `[ui-input-trigger] source "command" candidates failed:
//       TypeError: contribution.description is not a function` —— 客户端 `/` 菜单按
//       **source** 分组(`input-trigger` 的 seedGroups → MenuView,组标题取 `slash.menu`
//       字典的 source 名: command→「指令」/ skill→「技能」)。而 `ui-commands` 的
//       `candidates()` 里对每个客户端贡献做 `description: contribution.description()`
//       —— **按函数调用**。本机 `dsh-file-drop` 的 `/file` 贡献把 description 写成了
//       字符串(旧形状)⇒ 该 source 整批抛错 ⇒「指令」组渲染为空(被 MenuView 的
//       `group.status === "ready" && items.length === 0 → null` 整组不渲染)。
//       **一个插件的形状错误,代价是宿主自带命令全部消失** —— 这正是本家族要拆的耦合。
// 修法: ① description 允许「函数(文档形状)或字符串(历史形状)」,非函数时按字符串渲染并
//       `console.warn` 点名;② `available(session)` 抛错时**只跳过该条**并 `console.error`,
//       不再连坐整组;③ 名字冲突仍保持上游的 fail-loud(`throw`),不吞真实编程错误。
//       (根因侧同步修好: `dsh-file-drop/lib/client.js` 的 description 改回函数。)
// 载体纪律: 与 [R94] 同款 —— 核心包客户端产物、自有 MARK 幂等、失败不写盘、只认锚点在场的
//       副本,历史 seed 静默 skipped;改盘后需**刷新页面**才对用户生效(见 [R94] 注释与手册)。
const COMMAND_CONTRIB_MARK = '/* [dsh-desktop] R95 contribution-shape-guard */'
function patchCommandContributionGuard() {
  const FROM = 'for (const contribution of this.live.contributions.values()) {\n' +
    '\t\t\t\t\tif (!contribution.available(session)) continue;\n' +
    '\t\t\t\t\tif (seen.has(contribution.name)) throw new Error(`ui-commands: contribution /${contribution.name} collides with a host command`);\n' +
    '\t\t\t\t\trows.push({\n' +
    '\t\t\t\t\t\tname: contribution.name,\n' +
    '\t\t\t\t\t\tdescription: contribution.description()\n' +
    '\t\t\t\t\t});\n' +
    '\t\t\t\t}'
  const TO = 'for (const contribution of this.live.contributions.values()) {\n' +
    '\t\t\t\t\t' + COMMAND_CONTRIB_MARK + '\n' +
    '\t\t\t\t\t// [R95] 形状容错:历史字符串 description 照常渲染、available 抛错只跳过本条 —— 见家族文件头\n' +
    '\t\t\t\t\tlet r95Usable = false;\n' +
    '\t\t\t\t\ttry { r95Usable = !!contribution.available(session); }\n' +
    '\t\t\t\t\tcatch (error) { console.error(`[ui-commands] contribution /${contribution.name} availability check threw; skipped`, error); continue; }\n' +
    '\t\t\t\t\tif (!r95Usable) continue;\n' +
    '\t\t\t\t\tif (seen.has(contribution.name)) throw new Error(`ui-commands: contribution /${contribution.name} collides with a host command`);\n' +
    '\t\t\t\t\tconst r95Describe = contribution.description;\n' +
    '\t\t\t\t\tif (typeof r95Describe !== "function") console.warn(`[ui-commands] contribution /${contribution.name} declares a non-function description; rendering it verbatim`);\n' +
    '\t\t\t\t\trows.push({\n' +
    '\t\t\t\t\t\tname: contribution.name,\n' +
    '\t\t\t\t\t\tdescription: typeof r95Describe === "function" ? r95Describe() : String(r95Describe ?? "")\n' +
    '\t\t\t\t\t});\n' +
    '\t\t\t\t}'
  const patchFile = (p, label) => {
    const current = fs.readFileSync(p, 'utf8')
    if (current.includes(COMMAND_CONTRIB_MARK)) return { file: label, ok: true, already: true }
    if (!current.includes(FROM)) return { file: label, ok: true, skipped: true, reason: '该副本无此形状的 contributions 循环(非活体/版本不同)' }
    const { rep, failures } = makeCtx(label)
    const c = rep(current, FROM, TO, 1, 'contribution-shape-guard')
    if (failures.length) return { file: label, ok: false, failures: [...failures] }
    fs.writeFileSync(p, c, 'utf8')
    return { file: label, ok: true, already: false }
  }
  const results = []
  const seen = new Set()
  const add = (p, label) => {
    if (typeof p !== 'string' || !p || seen.has(p)) return
    seen.add(p)
    if (!fs.existsSync(p)) return
    let ver = 'local'
    try { ver = JSON.parse(fs.readFileSync(path.join(path.dirname(path.dirname(p)), 'package.json'), 'utf8')).version } catch {}
    results.push({ ...patchFile(p, label), version: ver })
  }
  const REL = ['@deepseek-ai', 'dsh-client-ui-commands', 'lib', 'client.js']
  const npxRoot = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), '.npm-cache'), 'npm-cache', '_npx')
  if (fs.existsSync(npxRoot)) {
    for (const h of fs.readdirSync(npxRoot)) {
      add(path.join(npxRoot, h, 'node_modules', '.pnpm', 'node_modules', ...REL), 'ui-commands/client.js@hoist@' + h.slice(0, 6))
      add(path.join(npxRoot, h, 'node_modules', ...REL), 'ui-commands/client.js@flat@' + h.slice(0, 6))
      const pnpmDir = path.join(npxRoot, h, 'node_modules', '.pnpm')
      if (!fs.existsSync(pnpmDir)) continue
      for (const d of fs.readdirSync(pnpmDir)) {
        if (!d.startsWith('@deepseek-ai+dsh-client-ui-')) continue
        add(path.join(pnpmDir, d, 'node_modules', ...REL), 'ui-commands/client.js@pnpm@' + d.slice(-8))
      }
    }
  }
  for (const lp of ['D:\\deepseek harness\\deepseek-harness\\packages\\client\\ui-commands\\lib\\client.js',
    path.join(os.homedir(), 'deepseek-harness', 'packages', 'client', 'ui-commands', 'lib', 'client.js')]) {
    add(lp, 'ui-commands/client.js@L')
  }
  if (!results.length) results.push({ file: 'ui-commands/client.js', missing: true })
  return results
}

// ---- [R96] `/` 菜单第三方分组标题本地化(2026-09-11,用户需求①) ----
// 症状: 敲 "/" 打开候选菜单,第三组标题显示**裸源名**「genui」,与「指令」「技能」不一致 ——
//       全菜单唯一一个没本地化的组(源来自市场插件 @changfenhuang/dsh-genui 的 /panel)。
// 根因(活体取证): 组标题 = `ui-input-trigger` 的 MenuView 渲染 `t(group.source)`,其中 `t`
//       绑定命名空间 `slash.menu`;字典查不到该源名就**回落到键本身** —— 框架 locales.js 注释
//       原文: 「the lookup chain returns the key itself, so an unknown source shows its raw
//       name」。而 `slash.menu` 字典由 `ui-input-trigger` **独家**注册
//       (`ctx.locale.register(MENU_NS, { zh, en })`),locale 服务对「同命名空间 + 同语言」是
//       **唯一占用**(重复注册即 throw `locale namespace "slash.menu" already has
//       locale "zh"`)⇒ 插件侧**没有**任何官方途径给自己的源名补标题。
// 上游自身做法: 把**他包**的源名也登记进这张字典 —— 实证: 字典里已有
//       `"subagent": "子智能体"`,而 subagent 源并不属于 input-trigger。本家族沿用同一套路,
//       为 genui 源补 zh/en 标题。
// 边界: 只加键,不动渲染逻辑与其它键;zh/en **同时**补齐(上游注释声明 en 的键集与 zh 完整
//       对齐,单边加键会破坏该不变式);上游哪天自带 genui 标题则本家族让位(见 already 分支)。
//       genui 改名/卸载后,这枚键退化为无害死键。
// 锚点: 用「字典开启行」(`\t\tconst zh = {` / `\t\tconst en = {`)而非某个条目 —— 两代产物
//       实测各命中 1 次(0.1.5 seed 的「指令」版 + 本机 monorepo 的 0.1.2「命令」版),
//       比条目锚点抗版本漂移。
// 载体纪律: 与 [R94]/[R95] 同款 —— 核心包客户端产物、自有 MARK 幂等、失败不写盘、只认锚点
//       在场的副本(历史 seed 静默 skipped);改盘后**需刷新页面**才对用户生效。
const SLASH_TITLE_MARK = '/* [dsh-desktop] R96 slash-menu-group-titles */'
function patchSlashMenuGroupTitles() {
  const TITLE_ZH = 'GenUI 面板'
  const TITLE_EN = 'GenUI panel'
  const FROM_ZH = '\t\tconst zh = {\n'
  const TO_ZH = '\t\tconst zh = {\n' +
    '\t\t\t' + SLASH_TITLE_MARK + '\n' +
    '\t\t\t// [R96] genui 源(= @changfenhuang/dsh-genui 的 /panel 组)标题;上游同款:他包源名也登记在本字典\n' +
    '\t\t\t"genui": "' + TITLE_ZH + '",\n'
  const FROM_EN = '\t\tconst en = {\n'
  const TO_EN = '\t\tconst en = {\n' +
    '\t\t\t"genui": "' + TITLE_EN + '",\n'
  const patchFile = (p, label) => {
    const current = fs.readFileSync(p, 'utf8')
    if (current.includes(SLASH_TITLE_MARK)) return { file: label, ok: true, already: true }
    // 上游哪天自己把 genui 登记进字典 → 本家族让位(不重复插键)
    if (current.includes('"genui": "')) return { file: label, ok: true, already: true, reason: '上游已自带 genui 标题,本家族让位' }
    // 只认「带 slash.menu 字典」的现代形态;没有该字典的历史副本静默 skipped(不算 FAIL)
    if (!current.includes('slash.menu') || !current.includes(FROM_ZH) || !current.includes(FROM_EN)) {
      return { file: label, ok: true, skipped: true, reason: '该副本无 slash.menu 的 zh/en 字典(非活体/版本不同)' }
    }
    const { rep, failures } = makeCtx(label)
    let c = rep(current, FROM_ZH, TO_ZH, 1, 'slash-menu-zh-title')
    c = rep(c, FROM_EN, TO_EN, 1, 'slash-menu-en-title')
    if (failures.length) return { file: label, ok: false, failures: [...failures] }
    fs.writeFileSync(p, c, 'utf8')
    return { file: label, ok: true, already: false }
  }
  const results = []
  const seen = new Set()
  const add = (p, label) => {
    if (typeof p !== 'string' || !p || seen.has(p)) return
    seen.add(p)
    if (!fs.existsSync(p)) return
    let ver = 'local'
    try { ver = JSON.parse(fs.readFileSync(path.join(path.dirname(path.dirname(p)), 'package.json'), 'utf8')).version } catch {}
    results.push({ ...patchFile(p, label), version: ver })
  }
  const REL = ['@deepseek-ai', 'dsh-client-ui-input-trigger', 'lib', 'client.js']
  // O: npx 缓存三层布局(提升层 .pnpm/node_modules、平铺层 node_modules、.pnpm 实体层)
  const npxRoot = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), '.npm-cache'), 'npm-cache', '_npx')
  if (fs.existsSync(npxRoot)) {
    for (const h of fs.readdirSync(npxRoot)) {
      add(path.join(npxRoot, h, 'node_modules', '.pnpm', 'node_modules', ...REL), 'slash-titles/client.js@hoist@' + h.slice(0, 6))
      add(path.join(npxRoot, h, 'node_modules', ...REL), 'slash-titles/client.js@flat@' + h.slice(0, 6))
      const pnpmDir = path.join(npxRoot, h, 'node_modules', '.pnpm')
      if (!fs.existsSync(pnpmDir)) continue
      for (const d of fs.readdirSync(pnpmDir)) {
        if (!d.startsWith('@deepseek-ai+dsh-client-ui-')) continue
        add(path.join(pnpmDir, d, 'node_modules', ...REL), 'slash-titles/client.js@pnpm@' + d.slice(-8))
      }
    }
  }
  // L: 本机 monorepo 构建产物(lib/ 在 .gitignore 内,改动 git-clean;与 [R94]/[R95] 同款)
  for (const lp of ['D:\\deepseek harness\\deepseek-harness\\packages\\client\\ui-input-trigger\\lib\\client.js',
    path.join(os.homedir(), 'deepseek-harness', 'packages', 'client', 'ui-input-trigger', 'lib', 'client.js')]) {
    add(lp, 'slash-titles/client.js@L')
  }
  if (!results.length) results.push({ file: 'ui-input-trigger/client.js', missing: true })
  return results
}

// ---- [R97] `/` 菜单分组标题措辞改写(2026-09-11,用户需求②) ----
// 需求: 把「指令」改成「系统指令」、「技能」改成「技能与能力」(主人接 [R96] 之后选的第二个可选项)。
// 事实: 这两串就是 `slash.menu` 字典里 `command` / `skill` 两枚键的**值**(载体与理由同 [R96] ——
//       组标题 = `t(group.source)`),所以本家族**只改值、不动键集**: 键集是上游声明的不变式
//       (zh 是键集真相源 + en 完整对齐),改键会破坏它。
// 成对: zh/en 两侧同步改(英文侧「Commands」→「System commands」、「Skills」→「Skills &
//       capabilities」),否则英文界面仍是旧措辞 —— 与 [R96] 的成对纪律同源。
// 世代判据(实测两代措辞): 0.1.0/0.1.1 系列是「命令」(27 份历史 seed),0.1.2+ 才改成「指令」
//       (6 份: 0.1.2-alpha.5 ×2 / 0.1.2-rc.1 ×2 / 0.1.5-rc.1 ×2)。本家族只改**目标世代**
//       (`"command": "指令"`),「命令」世代静默 skipped;既非目标措辞又非已知历史措辞 ⇒ FAIL
//       待人工研判(比「锚点没了就 FAIL」温和,又不至于把上游改措辞吞掉)。
// 载体纪律: 同 [R94]/[R95]/[R96] —— 核心包客户端产物、自有 MARK 幂等、失败不写盘、
//       改盘后**需刷新页面**才对用户生效。
const SLASH_WORDING_MARK = '/* [dsh-desktop] R97 slash-menu-title-wording */'
function patchSlashMenuGroupTitleWording() {
  const FROM_ZH = '\t\t\t"command": "指令",\n\t\t\t"skill": "技能",\n'
  const TO_ZH = '\t\t\t' + SLASH_WORDING_MARK + '\n' +
    '\t\t\t// [R97] 组标题措辞(用户需求②):「指令」→「系统指令」、「技能」→「技能与能力」;只改值、键集不动\n' +
    '\t\t\t"command": "系统指令",\n\t\t\t"skill": "技能与能力",\n'
  const FROM_EN = '\t\t\t"command": "Commands",\n\t\t\t"skill": "Skills",\n'
  const TO_EN = '\t\t\t"command": "System commands",\n\t\t\t"skill": "Skills & capabilities",\n'
  const LEGACY_ZH = '"command": "命令",'
  const patchFile = (p, label) => {
    const current = fs.readFileSync(p, 'utf8')
    if (current.includes(SLASH_WORDING_MARK)) return { file: label, ok: true, already: true }
    if (!current.includes('slash.menu') || !current.includes('const zh = {')) {
      return { file: label, ok: true, skipped: true, reason: '该副本无 slash.menu 的 zh 字典(非活体/版本不同)' }
    }
    if (!current.includes(FROM_ZH)) {
      if (current.includes(LEGACY_ZH)) return { file: label, ok: true, skipped: true, reason: '历史世代措辞(0.1.0/0.1.1 的「命令」),本家族不改' }
      return { file: label, ok: false, failures: [`[${label}] slash-menu-zh-wording: 措辞既非目标形态(「指令」)也非已知历史形态(「命令」),待人工研判`] }
    }
    const { rep, failures } = makeCtx(label)
    let c = rep(current, FROM_ZH, TO_ZH, 1, 'slash-menu-zh-wording')
    c = rep(c, FROM_EN, TO_EN, 1, 'slash-menu-en-wording')
    if (failures.length) return { file: label, ok: false, failures: [...failures] }
    fs.writeFileSync(p, c, 'utf8')
    return { file: label, ok: true, already: false }
  }
  const results = []
  const seen = new Set()
  const add = (p, label) => {
    if (typeof p !== 'string' || !p || seen.has(p)) return
    seen.add(p)
    if (!fs.existsSync(p)) return
    let ver = 'local'
    try { ver = JSON.parse(fs.readFileSync(path.join(path.dirname(path.dirname(p)), 'package.json'), 'utf8')).version } catch {}
    results.push({ ...patchFile(p, label), version: ver })
  }
  const REL = ['@deepseek-ai', 'dsh-client-ui-input-trigger', 'lib', 'client.js']
  const npxRoot = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), '.npm-cache'), 'npm-cache', '_npx')
  if (fs.existsSync(npxRoot)) {
    for (const h of fs.readdirSync(npxRoot)) {
      add(path.join(npxRoot, h, 'node_modules', '.pnpm', 'node_modules', ...REL), 'slash-wording/client.js@hoist@' + h.slice(0, 6))
      add(path.join(npxRoot, h, 'node_modules', ...REL), 'slash-wording/client.js@flat@' + h.slice(0, 6))
      const pnpmDir = path.join(npxRoot, h, 'node_modules', '.pnpm')
      if (!fs.existsSync(pnpmDir)) continue
      for (const d of fs.readdirSync(pnpmDir)) {
        if (!d.startsWith('@deepseek-ai+dsh-client-ui-')) continue
        add(path.join(pnpmDir, d, 'node_modules', ...REL), 'slash-wording/client.js@pnpm@' + d.slice(-8))
      }
    }
  }
  for (const lp of ['D:\\deepseek harness\\deepseek-harness\\packages\\client\\ui-input-trigger\\lib\\client.js',
    path.join(os.homedir(), 'deepseek-harness', 'packages', 'client', 'ui-input-trigger', 'lib', 'client.js')]) {
    add(lp, 'slash-wording/client.js@L')
  }
  if (!results.length) results.push({ file: 'ui-input-trigger/client.js', missing: true })
  return results
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
    // ---- [B13 2026-09-12] 会话切换即时拉取(用户需求:历史会话节点与切换会话同时加载) ----
    // 原实现(上游 0.2.3 形态):fetch 效应内「初始 schedule()」与「MO 重拉」走同一条
    // 800ms 防抖 —— 切会话后圆点固定晚 800ms+请求时延才出现,永远比消息内容慢一拍。
    // 本批把「切换触发」与「DOM 变化触发」分流:effect 重跑(=会话切换)那一刻立即发请求,
    // 与服务端读日志、消息列表渲染并行;缓存已有该会话名单时先上屏(切回最近访问的会话
    // 瞬时可见),随后 force 重拉校正(SWR 语义)。800ms 防抖只保留给 MO 签名门控触发的
    // 重拉,流式期行为零变化。
    c = rep(c,
      '\t\t\t\tconst schedule = () => {\n\t\t\t\t\tif (timer !== 0) window.clearTimeout(timer)\n\t\t\t\t\ttimer = window.setTimeout(fetchUsers, 800)\n\t\t\t\t}\n\t\t\t\tschedule()',
      '\t\t\t\tconst schedule = () => {\n\t\t\t\t\tif (timer !== 0) window.clearTimeout(timer)\n\t\t\t\t\ttimer = window.setTimeout(fetchUsers, 800)\n\t\t\t\t}\n\t\t\t\t// [dsh-desktop B13 2026-09-12] 会话切换即时拉取(用户需求:历史节点与切换会话同时\n\t\t\t\t// 加载):800ms 防抖只该作用于 DOM 变化重拉(流式 token/加载历史),不该作用于切换\n\t\t\t\t// 本身——原实现切会话后圆点固定晚 800ms+请求时延,永远比消息内容慢一拍。改为\n\t\t\t\t// effect 重跑(=会话切换)那一刻立即发请求,与服务端读日志、消息列表渲染并行;\n\t\t\t\t// 缓存已有该会话名单时先上屏(切回最近会话瞬时可见),随后 force 重拉校正(SWR);\n\t\t\t\t// 800ms 防抖保留给 MO 签名门控触发的重拉,流式期行为不变。\n\t\t\t\tconst cachedUsers = typeof sessionId === \'string\' && sessionId !== \'\' ? usersCache.get(sessionId) : undefined\n\t\t\t\tif (cachedUsers !== undefined) setRemoteUsers(cachedUsers.map((u) => ({ id: u.id, time: u.time, text: u.text })))\n\t\t\t\tfetchUsers()',
      1, 'switch-immediate-fetch')
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
    // ---- [P2/T2-1 2026-09-11] 静置嗡嗡声根治:摘除「details 避让」3s 量测循环 ----
    // 归因(CDP 静置 10s 帧直方图):11 帧 >18ms、其中 5 次 53-70ms 大帧,周期 ≈3s ——
    // 与本文件 330-345 的 setInterval(measure, 3000) 精确吻合。measure 读
    // getComputedStyle(frame).gridTemplateColumns:该读取本身是样式查询,但此时样式/布局
    // 已被流式 token 的 1s 级重渲染弄脏 ⇒ 每次强制全帧样式重算(空转期零交互却持续掉帧)。
    // 摘除依据(**强于原定 RO 化改造**):measure 的唯一消费者是 rail 内联
    //   style:{right: detailsWidth > 0 ? detailsWidth + 18 : 28}
    // —— 该行已被本家族 [B1] rail-inline 替换为 style:{left:"292px"}(rail 从右缘迁到
    // 聊天区左缘)。⇒ 补丁态下 detailsWidth 是**只写不读的死状态**:3s 回流的全部代价
    // 换零收益。RO 化只是把「死计算」升级成「事件驱动的死计算」,故直接整体摘除。
    // 行为零变化证明:detailsWidth 的全部 3 处引用(声明/写/读)中「读」已在 [B1] 消失,
    // 本批移除「写」(量测块)与「声明」(state),组件对外可观测行为完全不变。
    // [V-F4 影响] 「details 避让宽度」职责随之失效 —— 已由 [B1] + dshvt posOnce 接管:
    // rail 现居左缘,与右侧 details 面板无重叠关系;侧栏开合/窗口缩放的跟贴由 dshvt
    // 的 RO + 兜底 tick 负责(node-nav 侧不再参与定位)。
    c = rep(c,
      '\t\t\t// details 避让\n\t\t\treact.useEffect(() => {\n\t\t\t\tconst measure = () => {\n\t\t\t\t\tconst rail = railRef.current\n\t\t\t\t\tif (rail === null) return\n\t\t\t\t\tconst overlay = rail.closest("[data-shell-overlay]")\n\t\t\t\t\tconst frame = overlay === null ? null : overlay.parentElement\n\t\t\t\t\tif (frame === null) return\n\t\t\t\t\tconst cols = (window.getComputedStyle(frame).gridTemplateColumns || "").split(" ")\n\t\t\t\t\tconst w = parseFloat(cols[2] || "0") || 0\n\t\t\t\t\tsetDetailsWidth((prev) => (prev === w ? prev : w))\n\t\t\t\t}\n\t\t\t\tconst timer = window.setInterval(measure, 3000)\n\t\t\t\tmeasure()\n\t\t\t\treturn () => window.clearInterval(timer)\n\t\t\t}, [])',
      '\t\t\t// [dsh-desktop P2/T2-1 2026-09-11] 原「details 避让」3s 量测循环已整体摘除:\n\t\t\t// 其唯一消费者 rail 内联 style:{right: detailsWidth...} 已由 [B1] rail-inline\n\t\t\t// 改为 left:"292px" ⇒ detailsWidth 只写不读(死状态),3s 一次\n\t\t\t// getComputedStyle(gridTemplateColumns) 在布局被流式重渲染弄脏后强制全帧\n\t\t\t// 样式重算,是「静置每 ~3s 一次 53-70ms 大帧」的直因。摘除后行为零变化。',
      1, 'details-measure-removed')
    // 同批移除随之失去全部引用的 state 声明(死状态清理,避免留半截)
    c = rep(c,
      '\t\t\tconst [detailsWidth, setDetailsWidth] = react.useState(0)\n',
      '',
      1, 'details-width-state-removed')
    // ---- [b159 2026-09-11] 节点渲染双保险批(用户报告:节点错误渲染到工作区顶部
    // deepseek logo 处 + 历史节点显示不出) ----
    // 现象①实证(CDP + 像素级比对用户截图):插件 CSS_TEXT 在未知触发下整体丢失
    // (观测到 display:block/position:static/width:1256px 的退化态),rail 失去
    // fixed 定位 → 退化为文档流元素 → 渲染进 shell.overlay 层顶部(y=0)= 工作区
    // 顶部品牌区(橙棕 active dot + 灰色 line 叠在 deepseek logo 旁,即用户图2)。
    // 本批给插件侧补两道防线:dshvt 必加载面已另给定位骨架兜底(CSS 数组 b159 条目),
    // 这里补「样式自愈」+ CSS_TEXT 内矮视口钳制,与 dshvt 互不依赖。
    c = rep(c,
      '\t\t\t\tconst style = document.createElement("style")\n\t\t\t\tstyle.textContent = CSS_TEXT\n\t\t\t\tdocument.head.appendChild(style)',
      '\t\t\t\tconst style = document.createElement("style")\n\t\t\t\tstyle.textContent = CSS_TEXT\n\t\t\t\tdocument.head.appendChild(style)\n\t\t\t\t// [b159 2026-09-11] 样式自愈:插件 CSS 被外部机制移除(实证:未知触发下 rail\n\t\t\t\t// 失去 fixed 定位、退化为文档流渲染进顶栏品牌区)时,2s 内检查并重新挂载,\n\t\t\t\t// 与 dshvt 必加载面骨架兜底互为双保险。\n\t\t\t\tconst styleGuard = window.setInterval(function () {\n\t\t\t\t\tif (!style.isConnected) document.head.appendChild(style)\n\t\t\t\t}, 2000)',
      1, 'style-self-heal')
    c = rep(c,
      '\t\t\t\treturn () => {\n\t\t\t\t\tdisposeHistory()\n\t\t\t\t\toffSlot()\n\t\t\t\t\tif (style.isConnected) style.remove()',
      '\t\t\t\treturn () => {\n\t\t\t\t\tdisposeHistory()\n\t\t\t\t\toffSlot()\n\t\t\t\t\twindow.clearInterval(styleGuard)\n\t\t\t\t\tif (style.isConnected) style.remove()',
      1, 'style-self-heal-cleanup')
    // 插件 CSS_TEXT 里给 rail 的 top 加矮视口钳制(顶栏 ~90px,rail 半高 ~50px):常规
    // 视口保持 top:50% 居中零变化;窗口过矮时 rail 夹在 [96px, 100vh-120px] 区间,
    // 不再以 50% 直接撞进 deepseek 品牌区。dshvt 侧同款规则互为双保险。
    c = rep(c,
      '@media (prefers-reduced-motion: reduce) {\n  .dsh-node-nav-dot, .dsh-node-nav-preview, .dsh-node-nav-bottom, .dsh-node-nav-miss { transition: none; animation: none; }\n}\n`',
      '@media (prefers-reduced-motion: reduce) {\n  .dsh-node-nav-dot, .dsh-node-nav-preview, .dsh-node-nav-bottom, .dsh-node-nav-miss { transition: none; animation: none; }\n}\n@media (max-height:420px){.dsh-node-nav-rail{top:max(96px,min(50%,calc(100vh - 120px)))!important;transform:none!important}}\n`',
      1, 'rail-short-viewport-clamp')
    return c
  }

  // [Q 2026-09-01] 显式 sentinel=null,绕开 PATCH_MARK 的"已是补丁态"短路——R88 与 R77
  // 共用一条 .bak-left,R77 后 current 已含 PATCH_MARK,默认会跳过;R88 锚点基于 R77 后
  // 状态,必须重打才能落地。PASS:rewrite 在 null sentinel 下必走完整 apply 链,当前 current
  // 是 R77 态时 patched ≠ current,确保写盘。
  return [{ ...rewrite(p, '.bak-left', apply, failures, null), version: ver }]
}

// ---- [b159] dsh-node-nav host 半部 0.1.5 数据源适配守护(2026-09-11) ----
// 用户报告「节点显示不出历史节点」根因:0.1.5(alpha.5+)中 sessions.get().events
// 同步数组已死(storage 迁 SQLite,官方 dsh-session-log-export 已改用 persistence
// 读句柄通道),node-nav 服务端 /api/users 恒回 {users:[]}(实测:带 session- 前缀
// 400、裸 uuid 恒空)→ 客户端永远回退 DOM 扫描 → 压缩会话(manual-compaction 后
// 无 input-message 行)/虚拟列表会话「历史节点显示不出」。
// 适配:读事件改走官方 sessionPersistence.open(id,'read') → handle.read(0) 通道
// (结构与 dsh-session-log-export 的 flushLiveSessionLog+readSessionLogText 同构),
// live 会话先过 sessions.flush 屏障;旧核无该服务时回退旧 sessions.get().events。
// 客户端已剥 session- 前缀,host 侧再剥一层双保险。基底 .bak-b159 = 原版 0.2.3;
// 市场更新覆盖后守护自动重打。生效面 = host,改完需重启 dsh。
function patchNodeNavHost() {
  const p = path.join(PLUGINS, 'dsh-node-nav', 'index.js')
  if (!fs.existsSync(p)) return [{ file: 'dsh-node-nav/index.js', missing: true }]
  let ver = 'unknown'
  try { ver = JSON.parse(fs.readFileSync(path.join(PLUGINS, 'dsh-node-nav', 'package.json'), 'utf8')).version } catch (e) { /* ignore */ }
  const { rep, failures } = makeCtx('node-nav/index.js')
  const apply = (c) => {
    // 插入 readEvents 通道函数(应用函数前)
    c = rep(c,
      'export function apply(ctx) {',
      '/**\n * [b159] 读取会话完整事件日志(0.1.5 适配)。\n * 首选官方 sessionPersistence 读句柄通道(dsh-session-log-export 同款);\n * live 会话先过 flush 屏障读到已提交前缀;旧核无该服务时回退 sessions.get().events。\n * 返回事件数组;会话不存在 / 读取失败返回 undefined(调用方回落空列表)。\n */\nasync function readEvents(ctx, id) {\n\t// [b159 双通道] 会话目录命名随格式换代:0.1.5 新格式目录带 session- 前缀\n\t// (persistence.open 按原样寻址),老格式目录是裸 uuid——先按客户端原始 id 试,\n\t// 打不开再试剥前缀/加前缀的另一形态,新旧格式通吃。\n\tconst persistence = ctx.get(\'sessionPersistence\') || ctx.sessionPersistence\n\tif (persistence !== undefined) {\n\t\tconst candidates = [id, id.indexOf(\'session-\') === 0 ? id.slice(8) : \'session-\' + id]\n\t\tfor (const cand of candidates) {\n\t\t\ttry {\n\t\t\t\t// live 会话先过 flush 屏障:persistence 读的是已落盘的 committed log,\n\t\t\t\t// flush 保证 in-memory 尾部也进入读视野(官方 flushLiveSessionLog 同款)。\n\t\t\t\tconst live = ctx.sessions.get(cand)\n\t\t\t\tif (live !== undefined && typeof ctx.sessions.flush === \'function\') {\n\t\t\t\t\ttry { await ctx.sessions.flush(live) } catch (e) { /* flush 失败不阻塞读盘 */ }\n\t\t\t\t}\n\t\t\t\tconst handle = await persistence.open(cand, \'read\')\n\t\t\t\ttry {\n\t\t\t\t\tconst { events } = await handle.read(0, undefined)\n\t\t\t\t\treturn events\n\t\t\t\t} finally {\n\t\t\t\t\tawait handle.close()\n\t\t\t\t}\n\t\t\t} catch (e) {\n\t\t\t\t// 该候选 id 不存在/打不开 → 试下一个形态\n\t\t\t}\n\t\t}\n\t\treturn undefined\n\t}\n\tconst session = ctx.sessions.get(id)\n\treturn session === undefined ? undefined : (session.events || [])\n}\n\nexport function apply(ctx) {',
      1, 'host-read-events-fn')
    // 读取段改造:剥前缀 + 走 readEvents
    c = rep(c,
      "    const sessionId = url.searchParams.get('sessionId') ?? ''\n    const session = sessionId === '' ? undefined : ctx.sessions.get(sessionId)\n    if (session === undefined) {\n      res.writeHead(200, JSON_HEADERS)\n      res.end(JSON.stringify({ users: [] }))\n      return\n    }\n    const users = []\n    for (const event of session.events) {",
      "    const sessionId = url.searchParams.get('sessionId') ?? ''\n    // [R91/b159] 客户端会话 id 带 session- 前缀,存储层只认裸 uuid(前缀 400)→ 双保险剥离\n    const bareId = sessionId.indexOf('session-') === 0 ? sessionId.slice(8) : sessionId\n    if (bareId === '') {\n      res.writeHead(200, JSON_HEADERS)\n      res.end(JSON.stringify({ users: [] }))\n      return\n    }\n    const events = await readEvents(ctx, bareId)\n    if (events === undefined) {\n      res.writeHead(200, JSON_HEADERS)\n      res.end(JSON.stringify({ users: [] }))\n      return\n    }\n    const users = []\n    for (const event of events) {",
      1, 'host-async-read')
    return c
  }
  return [{ ...rewrite(p, '.bak-b159', apply, failures, null), version: ver }]
}

// ---- [T] @anionex/dsh-turn-rewind alpha.5 适配守护(2026-09-03,问题130) ----
// 上游 0.2.1 lib/settings.js 顶层 named import installSettingsSection/settingsNamespace
// (@deepseek-ai/dsh-settings 0.1.2-alpha.5 已移除)→ 插件市场更新重装覆盖本地适配后,
// loader entry 崩加载拖垮整棵插件树 → dsh web 无法启动(2026-09-03 17:09 实证 5 连败)。
// 本地深适配(批次 88c + 17:51 复发修复,备份 .bak-alpha5-q131)经此段守护,三种形态分流:
//   已适配(哨兵行在场) → already 跳过;官方原版(特征 import 在场) → 重打为注入式注册;
//   其余形态 → 再按「能力」判(批次 144 修订):**不引用 dsh-settings** ⇒ skipped 安全跳过
//   (上游 0.3.5 已自适配);仍引用却是陌生形态 ⇒ FAIL 保留原样不写盘(红色 canary,等人工研判)。
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
    // [批次144 2026-09-10] 守卫判据由「形态」升级为「能力」:只看**还引不引用
    // @deepseek-ai/dsh-settings**。理由:上游 0.3.5 已自行完成同一适配——裸字符串 NS 常量
    // (`TURN_REWIND_SETTINGS_NAMESPACE = 'turn-rewind'`,源码注释明写「DSH 0.1.5 removed the
    // settingsNamespace helper」)+ `ctx.inject(['settings'], …)` + 优先 `provider.installSection(...)`
    // (0.1.5 的 dsh-settings 确有该 API,lib/index.js:327)——正是本段想做的事。
    // 不引用该包 ⇒ 「导入已移除导出 → loader entry 崩加载 → cordis:include 全有或全无拖垮整树」
    // 这条引线**不存在**,守护退化为安全跳过(不再是红色 canary,消除每 45s 的假 FAIL 噪音)。
    // 反之,仍引用该包却是陌生形态(未来半态/新写法)⇒ 保持 FAIL 保留原样不写盘,等人工研判。
    if (!current.includes('@deepseek-ai/dsh-settings')) {
      return [{ file: '@anionex/dsh-turn-rewind/lib/settings.js', version: ver, ok: true, skipped: true, reason: '上游已自适配(不再引用 dsh-settings),无需守护' }]
    }
    return [{ file: '@anionex/dsh-turn-rewind/lib/settings.js', version: ver, ok: false, failures: ['[turn-rewind] settings.js 仍引用 @deepseek-ai/dsh-settings 但形态陌生(上游新版/半态?),保留原样不写盘'] }]
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
    // 2026-09-09 容错:上游 0.8.1→0.8.3 自行移除了 settingsNamespace 顶层导入(不再引用
    // @deepseek-ai/dsh-settings),alpha.5 兼容由上游自己解决——无引用即无崩加载面,
    // 守护退化为安全跳过;仅当文件仍引用 dsh-settings(陌生半态)时才 FAIL 保留原样。
    if (current.includes('@deepseek-ai/dsh-settings')) {
      return [{ file: 'dsh-ego-browser/lib/index.js', version: ver, ok: false, failures: ['[ego-browser] index.js 非官方原版亦非已适配形态(上游新版/半态?),保留原样不写盘'] }]
    }
    return [{ file: 'dsh-ego-browser/lib/index.js', version: ver, ok: true, skipped: true }]
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

// ---- [X] dsh-ego-browser ensureWorker spawn 缺 cwd/env(2026-09-11,批次146) ----
// 与 [T2] **同文件不同语义**,按手册 §2.4「同文件第二家族」形态落笔:自有 MARK 幂等,
// 绝不复用 [T2] 哨兵(否则 [T2] 头部 already 快通道会把本段整个跳掉)。无 .bak 基底:
// 本文件由插件市场整份覆盖,.bak 会陈旧误导;幂等靠「自有 MARK + 上游锚点」双判据。
// 根因(2026-09-11 实证,@deepseek-ai/dsh-subprocess-local):
//   targetEnvironment() 内 `validateNoNullByte('options.cwd', spec.cwd)` 对 undefined 执行
//   `undefined.includes('\0')` → TypeError;而本插件这次 spawn 只给了 argv/stdio/graceMs,
//   既无 cwd 也无 env —— 对比同文件 runEgoScript 的 spawn(cwd+env 齐备,故 ego_* 工具一直正常)。
// 后果:ensureWorker() 恒走 catch 返回 null,异常被 `.catch(() => null)` 静默吞掉(零日志)⇒
//   无 worker 进程、无 ego-cast.json、GET /api/ego/spaces 回 {reason:'no live agent browser'},
//   观测台恒显「暂无活跃浏览器页/没有显示任何画面」。
// 修法:补 `cwd: process.cwd()` + `env: process.env`(与 ego 工具轨同形)。
// 生效方式:host 面 → 改完**必须重启 dsh**(手册 §1.4)。
function patchEgoBrowserWorkerSpawn() {
  const dir = path.join(PLUGINS, 'dsh-ego-browser')
  const p = path.join(dir, 'lib', 'index.js')
  const FILE = 'dsh-ego-browser/lib/index.js(spawn)'
  if (!fs.existsSync(p)) return [{ file: FILE, missing: true }]
  let ver = 'unknown'
  try { ver = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).version } catch (e) { /* ignore */ }
  const { rex, failures } = makeCtx('dsh-ego-browser/index.js(spawn)')
  const current = fs.readFileSync(p, 'utf8')
  const MARK = '[X worker-spawn-cwd 2026-09-11,patches.cjs [X] 段守护]'
  if (current.includes(MARK)) return [{ file: FILE, version: ver, ok: true, already: true }]
  // 缩进用 [ \t]* 通配(上游重排 tab/space 不误报);锚点唯一性由 rex 的 expected=1 兜底
  const RE = /argv: \[\n([ \t]*)process\.execPath,\n[ \t]*WORKER_BIN,\n[ \t]*initCfg\n([ \t]*)\],\n([ \t]*)stdio: \{/
  if (!RE.test(current)) {
    // 机会性判据(手册 §2.7b):上游可能自行补齐 —— 能力已在就安全跳过,不制造假 FAIL
    if (!current.includes('WORKER_BIN')) return [{ file: FILE, version: ver, ok: true, skipped: true, reason: '上游已重写 worker 拉起方式(无 WORKER_BIN 锚)' }]
    if (/WORKER_BIN[\s\S]{0,300}?cwd:/.test(current)) return [{ file: FILE, version: ver, ok: true, skipped: true, reason: '上游已自行补齐 cwd/env' }]
    return [{ file: FILE, version: ver, ok: false, failures: ['[ego-browser] ensureWorker spawn 形态陌生(上游改写?),保留原样待人工研判'] }]
  }
  const c = rex(current, new RegExp(RE.source, 'g'),
    'argv: [\n$1process.execPath,\n$1WORKER_BIN,\n$1initCfg\n$2],\n$3/* ' + MARK + ' */\n$3cwd: process.cwd(),\n$3env: process.env,\n$3stdio: {',
    1, 'worker-spawn-cwd')
  if (failures.length) return [{ file: FILE, version: ver, ok: false, failures: [...failures], kept: true }]
  fs.writeFileSync(p, c, 'utf8')
  return [{ file: FILE, version: ver, ok: true, already: false }]
}

// ---- [Z] dsh-ego-browser ego-cast-worker 观测台 FFmpeg 后端 pid 丢失(2026-09-11,批次146) ----
// 根因(2026-09-11 实证):bin/ego-cast-worker.mjs 的 resolveBrowser() 从 browser.json 读到
//   `{ port, wsUrl, pid, binary, headless, profileDir }`,返回值却只带出 `{ port, wsUrl }` ——
//   state.pid 被丢弃;而 `active = { ...browser, ws, cdp, sessions }` 是 browserPid 的唯一来源
//   ⇒ active.pid 恒 undefined ⇒ FfmpegCaptureBackend 收到 `browserPid: active.pid ?? 0` = 0 ⇒
//   enumerateWindowsForPid(0) 首行 `if (browserPid <= 0) return []` ⇒ resolveCaptureSource 抛
//   「Chrome window not found for browser PID unknown」⇒ 观测台 Windows 侧 FFmpeg 后端
//   **恒回退 CDP**(code=ffmpeg-fallback-cdp),与 FFmpeg 装没装、gfxcapture filter 在不在**毫无关系**。
// 修法:返回值补 `pid: state.pid ?? 0`(读不到时回退 0,与旧行为等价、零副作用)。
// 生效方式:worker 面 → 重启 worker 即生效(host 侧 ensureWorker 收养新 ego-cast.json,不必重启 dsh)。
function patchEgoBrowserCastWorker() {
  const dir = path.join(PLUGINS, 'dsh-ego-browser')
  const p = path.join(dir, 'bin', 'ego-cast-worker.mjs')
  const FILE = 'dsh-ego-browser/bin/ego-cast-worker.mjs'
  if (!fs.existsSync(p)) return [{ file: FILE, missing: true }]
  let ver = 'unknown'
  try { ver = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).version } catch (e) { /* ignore */ }
  const { rex, failures } = makeCtx('dsh-ego-browser/ego-cast-worker.mjs')
  const current = fs.readFileSync(p, 'utf8')
  const MARK = '[Z cast-worker-pid 2026-09-11,patches.cjs [Z] 段守护]'
  if (current.includes(MARK)) return [{ file: FILE, version: ver, ok: true, already: true }]
  const RE = /return wsUrl \? \{\n([ \t]*)port: state\.port \?\? null,\n([ \t]*)wsUrl\n([ \t]*)\} : null;/
  if (!RE.test(current)) {
    if (/return wsUrl \? \{[\s\S]{0,240}?pid:/.test(current)) return [{ file: FILE, version: ver, ok: true, skipped: true, reason: '上游已自行带回 pid' }]
    return [{ file: FILE, version: ver, ok: false, failures: ['[ego-browser] resolveBrowser 返回形态陌生(上游改写?),保留原样待人工研判'] }]
  }
  const c = rex(current, new RegExp(RE.source, 'g'),
    'return wsUrl ? {\n$1port: state.port ?? null,\n$2wsUrl,\n$2/* ' + MARK + ' */ pid: state.pid ?? 0\n$3} : null;',
    1, 'resolveBrowser-pid')
  if (failures.length) return [{ file: FILE, version: ver, ok: false, failures: [...failures], kept: true }]
  fs.writeFileSync(p, c, 'utf8')
  return [{ file: FILE, version: ver, ok: true, already: false }]
}

// ---- [R98] dsh-ego-browser:模型调用浏览器不弹桌面窗口,改侧边卡片观看(2026-09-12,用户需求) ----
// 主人需求:「优化模型调用浏览器时不在单独打开浏览器窗口,改为在侧边卡片打开(DSH-better-sidebar)」。
// 现状:侧边卡片「Agent 浏览器」Tab(mountSidebarTab, better-sidebar 0.19.0 service)本就生效;
// 桌面那个「DeepSeek Harness - Edge」窗口(ego_doctor 实测 headless=false)是 ego 浏览器本体。
// 根因双层:
//   ① runtime 层 bin/ego-browser.mjs 的 envHeadless 判据:
//        hasDisplay = win32 || DISPLAY非空  → Windows 恒 true
//        envHeadless = hasDisplay ? false : !["","0","false","no"].includes(EGO_LINUX_HEADLESS)
//        → Windows 上 EGO_LINUX_HEADLESS 环境变量被整体短路无视,只有 CLI `--headless` 能强制无头;
//   ② 插件层 lib/index.js 的 resolveEgoEnv 只在 isHeadlessDetected (win32 恒 false) 时才注入
//      EGO_LINUX_HEADLESS=1 → Windows 永不注入;而 chromeArgs/egoCliArgs 白名单又 blocked
//      --headless/--no-startup-window(厂家设计:归 EGO_LINUX_HEADLESS 管理)→ 两条路全堵死。
// 修法两刀:① host 面 resolveEgoEnv 对 win32 默认注入 EGO_LINUX_HEADLESS=1(用户显式设过——
//   哪怕是 "0"——则尊重原值,逃生门保留;=== void 0 判据天然实现);
//   ② runtime 面 ego-browser.mjs envHeadless 去掉 hasDisplay 短路(Windows 同样读环境变量)。
// 生效链路:ego-browser.mjs 读 EGO_LINUX_HEADLESS=1 → chrome.mjs launch 加 --headless=new
//   + 指纹剥离 UA(头条系风控)→ 无窗口;画面照常由 CDP screencast/FFmpeg 推流到侧边卡片。
// FFmpeg 配套:无头后 gfxcapture(hwnd) 无窗口可采 → 观察自动回退 CDP(README:保存的 FFmpeg
//   后端失效时本次观察回退 CDP 并展示原因);主人已接受画质略降。settings.yaml 的
//   captureBackend 建议同步改 cdp(见交付说明),避免每次尝试 FFmpeg 失败的噪音。
// client 面文案:「去桌面那个 Chrome 窗口登录/验证」→「在侧边卡片画面中操作」(无头后无窗口可去)。
// 生效方式:host 面 + runtime 面 → 重启 dsh;client 面(文案)→ 刷新页面。
function patchEgoBrowserHeadlessHost() {
  const dir = path.join(PLUGINS, 'dsh-ego-browser')
  const p = path.join(dir, 'lib', 'index.js')
  const FILE = 'dsh-ego-browser/lib/index.js(headless)'
  if (!fs.existsSync(p)) return [{ file: FILE, missing: true }]
  let ver = 'unknown'
  try { ver = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).version } catch (e) { /* ignore */ }
  const { rep, failures } = makeCtx('dsh-ego-browser/index.js(headless)')
  const current = fs.readFileSync(p, 'utf8')
  const MARK = '[R98 host-headless 2026-09-12,patches.cjs [R98] 段守护]'
  if (current.includes(MARK)) return [{ file: FILE, version: ver, ok: true, already: true }]
  const FROM = 'if (env.EGO_LINUX_HEADLESS === void 0 && isHeadlessDetected(platform, env)) env.EGO_LINUX_HEADLESS = "1";'
  if (!current.includes(FROM)) {
    if (current.includes('EGO_LINUX_HEADLESS') && /platform === "win32"\s*\|\|/.test(current)) return [{ file: FILE, version: ver, ok: true, skipped: true, reason: '上游已自行支持 win32 headless 注入' }]
    return [{ file: FILE, version: ver, ok: false, failures: ['[ego-browser] resolveEgoEnv headless 注入形态陌生(上游改写?),保留原样待人工研判'] }]
  }
  const c = rep(current, FROM,
    '// ' + MARK + ' Windows 默认注入 EGO_LINUX_HEADLESS=1(用户显式设过——含 "0"——则尊重原值,逃生门保留):\n' +
    '\t// 配合 runtime 面去短路(见 [R98]),模型调用 ego_* 时浏览器以无头模式跑,桌面不弹窗,\n' +
    '\t// 画面在 better-sidebar「Agent 浏览器」侧边卡片观看。\n' +
    '\tif (env.EGO_LINUX_HEADLESS === void 0 && (isHeadlessDetected(platform, env) || platform === "win32")) env.EGO_LINUX_HEADLESS = "1";',
    1, 'win32-headless-inject')
  if (failures.length) return [{ file: FILE, version: ver, ok: false, failures: [...failures], kept: true }]
  fs.writeFileSync(p, c, 'utf8')
  return [{ file: FILE, version: ver, ok: true, already: false }]
}

function patchEgoBrowserHeadlessRuntime() {
  const dir = path.join(PLUGINS, 'dsh-ego-browser')
  const p = path.join(dir, 'runtime', 'ego-linux', 'bin', 'ego-browser.mjs')
  const FILE = 'dsh-ego-browser/runtime/ego-browser.mjs(headless)'
  if (!fs.existsSync(p)) return [{ file: FILE, missing: true }]
  let ver = 'unknown'
  try { ver = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).version } catch (e) { /* ignore */ }
  const { rep, failures } = makeCtx('dsh-ego-browser/runtime/ego-browser.mjs(headless)')
  const current = fs.readFileSync(p, 'utf8')
  const MARK = '[R98 runtime-headless 2026-09-12,patches.cjs [R98] 段守护]'
  if (current.includes(MARK)) return [{ file: FILE, version: ver, ok: true, already: true }]
  const FROM = '  const envHeadless = hasDisplay\n    ? false\n    : !["", "0", "false", "no"].includes(\n        (process.env.EGO_LINUX_HEADLESS ?? "").toLowerCase(),\n      );'
  if (!current.includes(FROM)) {
    if (current.includes('EGO_LINUX_HEADLESS') && !/envHeadless = hasDisplay/.test(current)) return [{ file: FILE, version: ver, ok: true, skipped: true, reason: '上游已自行放开 win32 envHeadless' }]
    return [{ file: FILE, version: ver, ok: false, failures: ['[ego-browser] runtime envHeadless 形态陌生(上游改写?),保留原样待人工研判'] }]
  }
  const c = rep(current, FROM,
    '  // ' + MARK + ' Windows 同样尊重 EGO_LINUX_HEADLESS:原实现 hasDisplay 对 win32 恒 true\n' +
    '  // → envHeadless 恒 false → 环境变量被整体无视,桌面必弹真实窗口(插件侧注入也无效)。\n' +
    '  // 现在释放短路;显式 "0"/"false"/"no" 仍走有头(逃生门)。\n' +
    '  const envHeadless = !["", "0", "false", "no"].includes(\n' +
    '    (process.env.EGO_LINUX_HEADLESS ?? "").toLowerCase(),\n' +
    '  );',
    1, 'runtime-headless-env')
  if (failures.length) return [{ file: FILE, version: ver, ok: false, failures: [...failures], kept: true }]
  fs.writeFileSync(p, c, 'utf8')
  return [{ file: FILE, version: ver, ok: true, already: false }]
}

function patchEgoBrowserHeadlessCopy() {
  const dir = path.join(PLUGINS, 'dsh-ego-browser')
  const p = path.join(dir, 'lib', 'client.js')
  const FILE = 'dsh-ego-browser/lib/client.js(headless-copy)'
  if (!fs.existsSync(p)) return [{ file: FILE, missing: true }]
  let ver = 'unknown'
  try { ver = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).version } catch (e) { /* ignore */ }
  const { rep, failures } = makeCtx('dsh-ego-browser/client.js(headless-copy)')
  const current = fs.readFileSync(p, 'utf8')
  const MARK = '[R98 headless-copy 2026-09-12,patches.cjs [R98] 段守护]'
  if (current.includes(MARK)) return [{ file: FILE, version: ver, ok: true, already: true }]
  // 浮动面板版(无 better-sidebar 时的回退形态)
  let c = rep(current,
    '需要账号登录时，请到桌面上那个 <b>「ego lite — agent」</b> Chrome 窗口完成登录。',
    '需要账号登录时，请直接在「Agent 浏览器」画面（侧边卡片）中完成登录，画面支持点击与输入。',
    1, 'float-login-copy')
  c = rep(c,
    '<b>⚠️ 检测到人机验证</b> — 请在桌面那个 <b>「ego lite — agent」</b> 浏览器窗口手动完成验证，agent 会继续。',
    '<b>⚠️ 检测到人机验证</b> — 请在「Agent 浏览器」画面（侧边卡片）中手动完成验证（画面支持点击操作），agent 会继续。',
    1, 'float-captcha-copy')
  // 侧边 Tab 版(better-sidebar 形态,JSX 拼接)
  c = rep(c,
    '"需要账号登录时，请到桌面上那个 ", h("b", null, "「ego lite — agent」"), " Chrome 窗口完成登录。"',
    '"需要账号登录时，请直接在侧边卡片「Agent 浏览器」画面中完成登录（画面支持点击与输入）。"',
    1, 'tab-login-copy')
  c = rep(c,
    'h("b", null, "⚠️ 检测到人机验证"), " — 请在桌面那个 ", h("b", null, "「ego lite — agent」"), " 浏览器窗口手动完成验证，agent 会继续。"',
    'h("b", null, "⚠️ 检测到人机验证"), " — 请在侧边卡片「Agent 浏览器」画面中手动完成验证（画面支持点击操作），agent 会继续。"',
    1, 'tab-captcha-copy')
  if (failures.length) return [{ file: FILE, version: ver, ok: false, failures: [...failures], kept: true }]
  c = c + '\n// ' + MARK + '\n'
  fs.writeFileSync(p, c, 'utf8')
  return [{ file: FILE, version: ver, ok: true, already: false }]
}

// ---- [R98b] dsh-ego-browser worker stopSiblingWorkers 误杀 Job runner 父进程(2026-09-12,批次160 测试暴露) ----
// 现象:批次 160 三刀落地后实测 `/api/ego/spaces` 恒回 {reason:"no live agent browser"},
//   ego-cast.json 从未生成;desktop.log 尾行出现 "subprocess-local: Windows Job runner
//   exited with exit code 1 before proving its managed range empty";host 侧 spawn 的
//   worker 进程(pid 21364/17112/26044)全部秒死,而真实终端里直跑 `node ego-cast-worker.mjs`
//   完全正常(port 5920/12279,@@DSH_RESULT@@ ok)。
// 根因(2026-09-12 实证):dsh 0.1.5 的 dsh-subprocess-local 用 **Windows Job runner 包裹
//   一切 spawn**:宿主侧真实进程形态 = `node ...\dsh-subprocess-local\lib\runner.js -- node
//   ...\ego-cast-worker.mjs {initCfg}`(实测 11152 进程命令行逐字证实)。而 worker 的
//   stopSiblingWorkers()(Windows 分支)枚举**所有命令行含 'ego-cast-worker.mjs' 的 node.exe**
//   并 taskkill /PID /T /F —— **runner 进程命令行里恰好也含该字样** → worker 亲手把罩着
//   自己的 runner 父进程(连同自己, /T 杀整棵子树)杀掉 → runner close=1 且从未发直接结果
//   → host 面 launchWindowsJob 报 "Windows Job runner exited with exit code 1 before
//   proving its managed range empty" → ensureWorker 返回 null。终端直跑无 runner 包裹,
//   枚举时只有自己(被 -ne ${self} 排除)所以正常 —— 与全部观测严格一致。
// 为什么批次 146 没炸:该批 dsh 版本尚无 Windows Job 包裹路径(launchWindowsJob),
//   0.1.5 升级引入包裹后 stopSiblingWorkers 的宽匹配即成自杀陷阱。
// 修法:stopSiblingWorkers 的 PowerShell 枚举前先收集**自身祖先进程链**(pid 向上追溯
//   ParentProcessId 至根),过滤条件追加 `-not $anc.ContainsKey([int]$_.ProcessId)` ——
//   runner(父进程)与 dsh 宿主(祖父)全部放行,只杀真正的兄弟残留 worker。零依赖、
//   纯 PowerShell 内完成,不改 worker 网络/服务逻辑。
// 生效方式:worker 面 → 下次 ensureWorker spawn 即生效(不必重启 dsh;host 52s 防护兜底)。
function patchEgoBrowserWorkerSelfKill() {
  const dir = path.join(PLUGINS, 'dsh-ego-browser')
  const p = path.join(dir, 'bin', 'ego-cast-worker.mjs')
  const FILE = 'dsh-ego-browser/bin/ego-cast-worker.mjs(selfkill)'
  if (!fs.existsSync(p)) return [{ file: FILE, missing: true }]
  let ver = 'unknown'
  try { ver = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).version } catch (e) { /* ignore */ }
  const { rep, failures } = makeCtx('dsh-ego-browser/ego-cast-worker.mjs(selfkill)')
  const current = fs.readFileSync(p, 'utf8')
  const MARK = '[R98b worker-selfkill 2026-09-12,patches.cjs [R98] 段守护]'
  if (current.includes(MARK)) return [{ file: FILE, version: ver, ok: true, already: true }]
  const FROM = "const ps = `Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { $_.CommandLine -like '*ego-cast-worker.mjs*' -and $_.ProcessId -ne ${self} } | Select-Object -ExpandProperty ProcessId`;"
  if (!current.includes(FROM)) {
    if (current.includes('stopSiblingWorkers') && current.includes('ancestors')) return [{ file: FILE, version: ver, ok: true, skipped: true, reason: '上游已自行修复 selfkill' }]
    return [{ file: FILE, version: ver, ok: false, failures: ['[ego-browser] stopSiblingWorkers ps 模板形态陌生(上游改写?),保留原样待人工研判'] }]
  }
  const c = rep(current, FROM,
    '// ' + MARK + ' 0.1.5 Windows Job runner 包裹回归:runner 进程命令行含 ego-cast-worker.mjs,\n' +
    '\t// 旧宽匹配会把罩着自己的 runner 父进程 taskkill → 宿主报 Job runner exit 1。\n' +
    '\t// 修法:枚举前收集自身祖先进程链(pid 向上追溯),过滤时放行祖先,只杀兄弟残留 worker。\n' +
    "\tconst ps = `$anc = @{}; $cur = [int]${self}; while ($cur -gt 0 -and -not $anc.ContainsKey([int]$cur)) { $anc[[int]$cur] = $true; $p = Get-CimInstance Win32_Process -Filter \"ProcessId=$cur\" -ErrorAction SilentlyContinue; if ($null -eq $p) { break }; $cur = [int]$p.ParentProcessId }; Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { $_.CommandLine -like '*ego-cast-worker.mjs*' -and $_.ProcessId -ne ${self} -and -not $anc.ContainsKey([int]$_.ProcessId) } | Select-Object -ExpandProperty ProcessId`;",
    1, 'selfkill-ancestors')
  if (failures.length) return [{ file: FILE, version: ver, ok: false, failures: [...failures], kept: true }]
  fs.writeFileSync(p, c, 'utf8')
  return [{ file: FILE, version: ver, ok: true, already: false }]
}

// ---- [R98c] dsh-ego-browser 会话内外链不再被「Agent 浏览器」Tab 认领(2026-09-12,用户需求) ----
// 主人需求:「修复在点击会话中的链接时,会打开侧边卡片的agent浏览器,而不是侧边卡片的浏览器」。
// 根因:better-sidebar 的外链接管路由(client-registry.js link interception)落地时是
//   `const type = urlTargetOf(new URL(url)) ?? "browser"` —— 声明了 urlTarget 的插件 Tab
//   **优先于**内置「浏览器」Tab(better-sidebar 设计如此:内置 browser 恒不声明 urlTarget,
//   以免反向遮蔽插件页)。而 dsh-ego-browser 的 mountSidebarTab 注册 `ego-browser:watch`
//   Tab 时声明 `urlTarget: (url) => http/https 且非文档后缀` —— 认领了几乎所有网页外链 ⇒
//   点击会话里的链接(外链接管开启时)全被塞进「Agent 浏览器」观看屏,而非内置「浏览器」Tab。
// 修法:urlTarget 谓词恒 false(保留注册结构不动,对 matchUrlTarget 等价「不认领」)⇒
//   urlTargetOf 恒 undefined ⇒ 外链回归默认路由 `?? "browser"`:由内置「浏览器」Tab 承接
//   (其是否接管仍由 browserInterceptLinks/Http/Https 三开关与 Tab 启用态决定;Ctrl/Cmd+
//   点击临时放行系统浏览器的既有约定不受影响)。「Agent 浏览器」Tab 回归本职:仅观看/接管
//   agent 的 ego_* 浏览画面,SSE tool-call 自动翻开的原逻辑保留。
// 生效方式:client 面 → 刷新页面(补丁本体由壳启动/手动 node patches.cjs 重放落盘)。
function patchEgoBrowserUrlTargetRelease() {
  const dir = path.join(PLUGINS, 'dsh-ego-browser')
  const p = path.join(dir, 'lib', 'client.js')
  const FILE = 'dsh-ego-browser/lib/client.js(urlTarget-release)'
  if (!fs.existsSync(p)) return [{ file: FILE, missing: true }]
  let ver = 'unknown'
  try { ver = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).version } catch (e) { /* ignore */ }
  const { rep, failures } = makeCtx('dsh-ego-browser/client.js(urlTarget-release)')
  const current = fs.readFileSync(p, 'utf8')
  const MARK = '[R98c urlTarget-release 2026-09-12,patches.cjs [R98c] 段守护]'
  if (current.includes(MARK)) return [{ file: FILE, version: ver, ok: true, already: true }]
  if (!current.includes('urlTarget')) {
    return [{ file: FILE, version: ver, ok: true, skipped: true, reason: '上游已自行移除 urlTarget 认领' }]
  }
  const FROM = 'urlTarget: function(url) {\n\t\t\t\t\treturn /^https?:$/.test(url.protocol) && !/\\.(pdf|txt|md|docx?|xlsx?|pptx?)$/i.test(url.pathname);\n\t\t\t\t},'
  const c = rep(current, FROM,
    '// ' + MARK + ' 恒 false:不再认领外链。better-sidebar 外链路由是 urlTargetOf(url) ?? "browser",\n' +
    '\t\t\t\t// 声明 urlTarget 的插件 Tab 优先于内置「浏览器」Tab —— 此处曾认领一切 http/https 网页,\n' +
    '\t\t\t\t// 致点击会话里的链接被塞进「Agent 浏览器」观看屏。放行后外链回归默认路由:内置「浏览器」\n' +
    '\t\t\t\t// Tab(Ctrl/Cmd+点击临时放行系统浏览器的既有约定不变);「Agent 浏览器」Tab 仍由 SSE\n' +
    '\t\t\t\t// tool-call 自动翻开,观看/接管 agent 浏览的本职不受影响。\n' +
    '\t\t\t\turlTarget: function(url) {\n' +
    '\t\t\t\t\treturn false;\n' +
    '\t\t\t\t},',
    1, 'urlTarget-release')
  if (failures.length) {
    if (/urlTarget:\s*function\(url\)\s*\{\s*\n\s*return false;/.test(current)) return [{ file: FILE, version: ver, ok: true, skipped: true, reason: '上游已自行恒 false' }]
    return [{ file: FILE, version: ver, ok: false, failures: [...failures], kept: true }]
  }
  fs.writeFileSync(p, c, 'utf8')
  return [{ file: FILE, version: ver, ok: true, already: false }]
}

// ---- [Y] 核心 @deepseek-ai/dsh-system-prompt:人设字段改名兼容(persona → personaPrefix) ----
// 根因(2026-09-10 批次143 定谳):0.1.5-rc.1 把部署级人设字段由 `persona` 改名为
// `personaPrefix`(并新增 `personaSuffix`;schema 见 SystemPrompt.Config)。而本部署的
// **写入方全用旧名**:home patch 的 `- id: system-prompt` + `config.persona: |-`、
// 壳 main.js 的 /persona 读写与 canonical 守卫(认 `persona: |-`)、dshvt 人设设置页(走壳 API)。
// 实测(schemastery 不剥未知键):persona 值能进配置对象,但构造器只读 `config.personaPrefix`
// ⇒ 部署级 persona 段落恒为空串 ⇒ 「设置页写人设不生效」(问题 54 家族第三形态)。
// 兼容补丁两刀:①schema 显式声明 legacy 别名(防未来 schemastery 收紧剥键);
// ②前缀段落取值加 legacy 回退(`config.personaPrefix || config.persona || ""`)。
// 只打「新字段形态」的副本(0.1.5+ 种子);旧形态副本(本地 monorepo 源码当前仍是
// `persona:` 形态)天然兼容 → 安全跳过、不写盘、不污染 git 树。
// 上游若再改名,本段锚点失配即 FAIL 保留原样(绝不留半补丁态)。
function patchSystemPromptPersona() {
  const results = []
  const files = []
  const NEW_SCHEMA = 'personaPrefix: z.string().default(""),'
  const NEW_TEXT = 'text: config.personaPrefix ?? ""'
  const LEGACY_SCHEMA = 'persona: z.string().default(""),'
  const PATCHED_TEXT = 'text: config.personaPrefix || config.persona || ""'
  // 1) npx 缓存各版本种子(pnpm 布局)内全部哈希副本
  const npxRoot = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), '.npm-cache'), 'npm-cache', '_npx')
  if (fs.existsSync(npxRoot)) {
    for (const h of fs.readdirSync(npxRoot)) {
      const pnpmRoot = path.join(npxRoot, h, 'node_modules', '.pnpm')
      if (!fs.existsSync(pnpmRoot)) continue
      for (const d of fs.readdirSync(pnpmRoot)) {
        if (!d.startsWith('@deepseek-ai+dsh-system-pro')) continue
        const f = path.join(pnpmRoot, d, 'node_modules', '@deepseek-ai', 'dsh-system-prompt', 'lib', 'index.js')
        if (fs.existsSync(f)) files.push(f)
      }
    }
  }
  // 2) profile 顶层副本(旧布局可能自带一份,存在即一起打)
  const profCopy = path.join(PLUGINS, '@deepseek-ai', 'dsh-system-prompt', 'lib', 'index.js')
  if (fs.existsSync(profCopy)) files.push(profCopy)
  // 3) 本地构建轨 monorepo 源码(当前旧字段形态 → 走 skipped 分支)
  const localCopy = process.env.DSH_LOCAL_SYSTEM_PROMPT
    || ['D:\\deepseek harness\\deepseek-harness\\packages\\core\\system-prompt\\lib\\index.js',
      path.join(os.homedir(), 'deepseek-harness', 'packages', 'core', 'system-prompt', 'lib', 'index.js')]
      .find((f) => fs.existsSync(f))
  if (localCopy) files.push(localCopy)

  for (const p of files) {
    const cur = fs.readFileSync(p, 'utf8')
    if (cur.includes(PATCHED_TEXT)) { results.push({ file: p, ok: true, already: true }); continue }
    if (!cur.includes(NEW_SCHEMA) || !cur.includes(NEW_TEXT)) {
      results.push({ file: p, ok: true, skipped: true, reason: '旧字段形态(persona 仍在),无需兼容补丁' })
      continue
    }
    const { rep, failures } = makeCtx('system-prompt')
    const apply = (c) => {
      let out = c
      if (!out.includes(LEGACY_SCHEMA)) {
        out = rep(out, NEW_SCHEMA, NEW_SCHEMA + '\n\t\t' + LEGACY_SCHEMA, 1, 'legacy-persona-schema')
      }
      out = rep(out, NEW_TEXT, PATCHED_TEXT, 1, 'legacy-persona-prefix')
      return out
    }
    try {
      results.push(rewriteFresh(p, '.bak-persona-alias', apply, failures, PATCH_MARK))
    } catch (e) {
      results.push({ file: p, ok: false, failures: [`[system-prompt] ${e.message}`] })
    }
  }
  if (!files.length) results.push({ file: 'dsh-system-prompt', missing: true })
  return results
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
      // 旧版布局(dsh/config/agent-presets,≤rc.2):存在才扫
      const root = path.join(npxRoot, h, 'node_modules', '@deepseek-ai', 'dsh', 'config', 'agent-presets')
      if (fs.existsSync(root)) {
        for (const name of fs.readdirSync(root)) {
          const f = path.join(root, name, 'agent.cordis.yml')
          if (fs.existsSync(f)) files.push(f)
        }
      }
      // [J2 2026-09-06] pnpm 布局种子(0.1.2-alpha.5 起)内置预设已迁至独立包
      // dsh-agent-presets/presets/*,旧路径 dsh/config/agent-presets 不复存在,
      // 旧扫描对新种子整体落空 → standard/cordis/minimal/ptc 自带 persona 行
      // 在 agent 作用域顶掉部署级人设(问题54 同根因复发:全局人设"时有时无")。
      // 按包名前缀扫 .pnpm 全部哈希副本,兼容官方种子更新与多版本并存。
      // 注意:必须与旧路径互不 continue,两种布局可能各自存在或同时缺失。
      const pnpmRoot = path.join(npxRoot, h, 'node_modules', '.pnpm')
      if (!fs.existsSync(pnpmRoot)) continue
      for (const d of fs.readdirSync(pnpmRoot)) {
        if (!d.startsWith('@deepseek-ai+dsh-agent-pres')) continue
        const pRoot = path.join(pnpmRoot, d, 'node_modules', '@deepseek-ai', 'dsh-agent-presets', 'presets')
        if (!fs.existsSync(pRoot)) continue
        for (const name of fs.readdirSync(pRoot)) {
          const f = path.join(pRoot, name, 'agent.cordis.yml')
          if (fs.existsSync(f)) files.push(f)
        }
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
//   [批次144 2026-09-10 锚点分流] J1/J2 是**当下仍必需**的修复(实证:上游 0.1.11 的
//   client.js 2256 行 add(TEX_CLASS) 仍在 getBoundingClientRect 读循环内、1585 行
//   toggle(HALO_CLASS) 同理)→ 用 rep(缺了就是上游变了、要人工研判)。J3/J4/J5 属
//   **历史遗留/上游可能自解**的适配 → 改用 repOpt:命中就顺手打(上游若回退旧写法,守护
//   自动重打),不命中只记 optional、不算失败。否则三处过时锚点会把整趟 apply 拖死
//   (apply 全趟原子),J1/J2 白丢 —— 这正是批次 144 修的那个「连坐」。
function patchJoiTheme() {
  const p = path.join(PLUGINS, 'dsh-joi-channel-theme', 'lib', 'client.js')
  if (!fs.existsSync(p)) return [{ file: 'dsh-joi-theme', missing: true }]
  const ver = JSON.parse(fs.readFileSync(path.join(PLUGINS, 'dsh-joi-channel-theme', 'package.json'), 'utf8')).version
  const { rep, repOpt, failures, optional } = makeCtx('joi-theme/client.js')

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
    // [批次144] 机会性:0.1.11 上游已把该依赖整个去掉(文件里已无此 require)→ 0 命中只记 optional。
    c = repOpt(c,
      'require("@deepseek-ai/dsh-client-runtime/client")',
      'require("@deepseek-ai/dsh-client-store")',
      'client-store-seed')
    // J4 [批次 94 2026-09-04] alpha.5 品牌区嵌套化:brand > brandIdentity > (brandMark, brandName),
    // [class*=_brand] 子串选择器命中全部 4 层,每层各画一次 --joi-brand-logo + padding-left:98px
    // → 工作区顶部一排重复立绘(用户截图实证)。收窄为品牌区本体,排除 brand* 后代。
    // [批次144] 机会性:上游 0.1.11 自己换成 `brand: "[class*=logoRow] > [class*=_brand]"` 并
    // 隐藏 [data-slot="sidebar.brand.mark"](同一问题的自有解法)→ 本步 0 命中,不再算失败。
    c = repOpt(c,
      'brand: "[class*=_brand]",',
      'brand: "[class*=_brand]:not([class*=_brandMark]):not([class*=_brandName]):not([class*=_brandIdentity])",',
      'brand-selector-narrow')
    // J5 [2026-09-04] alpha.5 品牌区拆双 svg(brandMark=鲸鱼 24px / brandName=字标 156px,
    // viewBox 26 0 156 24)。旧单 svg 时代的 translateX(-27px) + overflow:visible 现在:
    // 鲸鱼 svg 被推到立绘脸上;字标 svg 右缘到 274,压住 logoRow 右下角面板开关(240,44)——
    // 用户截图里的「U 形残影」即开关 panelIcon 从徽章底下探出。新规则:鲸鱼藏(立绘替代);
    // 字标 flex:none 防被 span 压缩致双重缩放,scale(.78) 左缘对齐立绘右缘(114),徽章右缘
    // 235 < 开关 240;overflow:hidden 裁掉 brandName svg viewBox 外的旧鲸鱼(g 在 x0.1-23 < 26)。
    // [批次144] 机会性:上游 0.1.11 改成 JS brandSurgery() + `translateX(-12px)` + 隐藏 mark slot
    // (自有解)→ 本步 0 命中;若上游将来回退旧写法,守护自动重打。
    c = repOpt(c,
      '${SELECTORS.brand} svg { overflow: visible !important; transform: translateX(-27px); }',
      '${SELECTORS.brand} svg { overflow: hidden !important; transform: none; }\n' +
      '${SELECTORS.brand} [class*=_brandMark] svg { display: none !important; }\n' +
      '${SELECTORS.brand} [class*=_brandName] svg { flex: none; overflow: hidden !important; transform: scale(.78); transform-origin: left center; margin-left: -8px; }',
      'brand-two-svg-fit')
    // J6 [P1/C1 2026-09-10] MO 触发限流(leading+trailing 200ms)+ J7 滚动触发补缺。
    // 背景:framed() 只把高频触发合并到下一帧(rAF),流式期间 body mutation 每帧都来,
    //   装饰重算仍 60 次/秒([J] 两阶段后每次 1 次强制回流 + 数次 qSA,长会话下是持续
    //   主线程占用)。装饰锚点(纹理大面/立绘/composer 卡 placeChat 锚 visibleCard)在
    //   流式期间几何稳定,200ms 一拍足够;trailing 保证最后一拍必达,最终状态与不限流
    //   完全一致。J7:装饰原本不监听滚动,长会话离屏 turn 由 dshvt 的 content-visibility
    //   占位(120px 估值),滚入视口后装饰可能停留在占位几何上;补 passive 捕获滚动委托,
    //   经同一限流调度重算,装饰随滚动自愈(scroll 事件不冒泡但捕获可达,document 捕获
    //   委托同 dshvt 模式,视图重挂零重绑)。
    c = rep(c,
      '\t\t\t\tthis.observer = new MutationObserver(() => {\n\t\t\t\t\tthis.loop.schedule();\n\t\t\t\t});\n\t\t\t\tthis.observer.observe(document.body, {\n\t\t\t\t\tchildList: true,\n\t\t\t\t\tsubtree: true,\n\t\t\t\t\tattributes: true,\n\t\t\t\t\tattributeFilter: ["class", "data-ds-dark-theme"]\n\t\t\t\t});\n\t\t\t\twindow.addEventListener("resize", this.loop.schedule);',
      '\t\t\t\t// [P1/C1 2026-09-10] MO 触发限流(leading+trailing 200ms)+滚动触发补缺。\n\t\t\t\t// framed 只把高频触发合并到下一帧,流式期间 body mutation 每帧都来,装饰重算\n\t\t\t\t// 仍 60 次/秒;装饰锚点(纹理大面/立绘/composer 卡)在流式期间几何稳定,\n\t\t\t\t// 200ms 一拍足够,trailing 保证最后一拍必达,最终状态与不限流完全一致。\n\t\t\t\tthis._moLast = 0;\n\t\t\t\tthis._moTrail = void 0;\n\t\t\t\tconst moSchedule = () => {\n\t\t\t\t\tconst now = Date.now();\n\t\t\t\t\tif (now - this._moLast >= 200) {\n\t\t\t\t\t\tthis._moLast = now;\n\t\t\t\t\t\tthis.loop.schedule();\n\t\t\t\t\t\treturn;\n\t\t\t\t\t}\n\t\t\t\t\tclearTimeout(this._moTrail);\n\t\t\t\t\tthis._moTrail = setTimeout(() => {\n\t\t\t\t\t\tthis._moLast = Date.now();\n\t\t\t\t\t\tthis.loop.schedule();\n\t\t\t\t\t}, 200 - (now - this._moLast));\n\t\t\t\t};\n\t\t\t\tthis.observer = new MutationObserver(() => {\n\t\t\t\t\tmoSchedule();\n\t\t\t\t});\n\t\t\t\tthis.observer.observe(document.body, {\n\t\t\t\t\tchildList: true,\n\t\t\t\t\tsubtree: true,\n\t\t\t\t\tattributes: true,\n\t\t\t\t\tattributeFilter: ["class", "data-ds-dark-theme"]\n\t\t\t\t});\n\t\t\t\twindow.addEventListener("resize", this.loop.schedule);\n\t\t\t\t// [P1/C1] 装饰原本不监听滚动:长会话离屏 turn 由 content-visibility 占位,\n\t\t\t\t// 滚入视口后装饰可能停留在占位几何上。passive 捕获委托,滚动经同一限流\n\t\t\t\t// 调度重算,装饰随滚动自愈(document 捕获委托,视图重挂零重绑)。\n\t\t\t\tdocument.addEventListener("scroll", moSchedule, { capture: true, passive: true });',
      1, 'mo-throttle-scroll')
    return c
  }

  return [{ ...rewrite(p, '.bak-q109', apply, failures), version: ver, optionalAnchors: optional.length ? [...optional] : undefined }]
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

// ---- [V2] dsh-vision-router 查看原图浮层 portal(手册 v0.5.2 批次④复发,2026-09-08) ----
//       症状: 会话内联图点击展开后,PresentedImage 灯箱 position:fixed 就地渲染被会话流
//       祖先 content-visibility:auto / contain:style paint 困在单条消息盒内 —— 遮罩只盖
//       一条消息、大图溢出被裁(用户截图实证)。修复 = 浮层 ReactDOM.createPortal(document.body),
//       与官方 ImageLightbox 同法。v2.1.0 结构要点: createPresentation 定义在 patchLoader/
//       factory 之外,factory 作用域的 ReactDOM 必须经调用点显式传入 createPresentation,
//       否则其参数恒 undefined、门控静默走 fallback(旧版 3 锚点脚本对该版本即静默空操作)。
//       幂等: createPresentation(React, ReactDOM) 标记;.bak-portal 基底=pristine。
function patchVisionRouterPortal() {
  const p = path.join(PLUGINS, 'dsh-vision-router', 'lib', 'client-presentation-boundary-main.js')
  if (!fs.existsSync(p)) return [{ file: 'dsh-vision-router/presentation-boundary', missing: true }]
  const ver = JSON.parse(fs.readFileSync(path.join(PLUGINS, 'dsh-vision-router', 'package.json'), 'utf8')).version
  const { rep, failures } = makeCtx('vision-router/presentation-boundary')
  const apply = (c) => {
    if (c.includes('createPresentation(React, ReactDOM)')) return c
    c = rep(c,
      '  function createPresentation(React) {',
      '  function createPresentation(React, ReactDOM) {',
      1, 'portal-sig')
    c = rep(c,
      '            factory: function(require) {\n              var React = require(\'react\');\n              var primitives;',
      '            factory: function(require) {\n              var React = require(\'react\');\n              var ReactDOM;\n              try { ReactDOM = require(\'react-dom\'); } catch (_) { ReactDOM = undefined; }\n              if (!ReactDOM || typeof ReactDOM.createPortal !== \'function\') {\n                try { ReactDOM = require(\'react-dom/client\'); } catch (_) { ReactDOM = undefined; }\n              }\n              var primitives;',
      1, 'portal-factory')
    c = rep(c,
      '              var presentation = createPresentation(React);',
      '              var presentation = createPresentation(React, ReactDOM);',
      1, 'portal-callsite')
    c = rep(c,
      '      );\n      return React.createElement(React.Fragment, null, thumb, overlay);',
      '      );\n      // Chat flow ancestors carry content-visibility/contain(paint), which make\n      // them the containing block for position:fixed descendants — an in-place\n      // overlay gets trapped inside one message\'s box. Portal to document.body,\n      // the same containment escape the stock ImageLightbox uses.\n      var layer = ReactDOM && typeof ReactDOM.createPortal === \'function\'\n        ? ReactDOM.createPortal(overlay, document.body)\n        : overlay;\n      return React.createElement(React.Fragment, null, thumb, layer);',
      1, 'portal-overlay')
    return c
  }
  return [{ ...rewrite(p, '.bak-portal', apply, failures), version: ver }]
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
  const ZH_NEW = '\t\t\t"openDocument": "打开配置文件",\n\t\t\t"openDocument.error": "无法打开配置文件",\n\t\t\t"general.nav": "通用设置",\n\t\t\t"general.page.desc": "常规偏好与系统级入口。",\n\t\t\t"sub.basics": "基础设置",\n\t\t\t"sub.basics.desc": "语言、外观、提示音、文件放入等常规偏好。",\n\t\t\t"sub.experts": "专家",\n\t\t\t"sub.experts.desc": "查看并开关 The Agency 的领域专家。",\n\t\t\t"sub.backup": "备份与迁移",\n\t\t\t"sub.backup.desc": "备份、恢复、导入导出与远程同步 DSH 配置。",\n\t\t\t"sub.vision": "Vision Router",\n\t\t\t"sub.vision.desc": "识图路由、视觉链路与自动识图模型组。",\n\t\t\t"sub.archive": "归档会话管理",\n\t\t\t"sub.archive.desc": "查看已归档会话,恢复到侧栏或彻底删除。"\n\t\t};'
  const EN_OLD = '\t\t\t"openDocument": "Open configuration file",\n\t\t\t"openDocument.error": "Could not open configuration file",\n\t\t\t"general.nav": "General"\n\t\t};'
  const EN_NEW = '\t\t\t"openDocument": "Open configuration file",\n\t\t\t"openDocument.error": "Could not open configuration file",\n\t\t\t"general.nav": "General",\n\t\t\t"general.page.desc": "General preferences and system entries.",\n\t\t\t"sub.basics": "Basics",\n\t\t\t"sub.basics.desc": "Language, appearance, sounds, file drop and other general preferences.",\n\t\t\t"sub.experts": "Experts",\n\t\t\t"sub.experts.desc": "Toggle The Agency domain experts.",\n\t\t\t"sub.backup": "Backup & Migration",\n\t\t\t"sub.backup.desc": "Back up, restore, import and sync the DSH configuration.",\n\t\t\t"sub.vision": "Vision Router",\n\t\t\t"sub.vision.desc": "Vision routing, chains and auto-vision model groups.",\n\t\t\t"sub.archive": "Archived Sessions",\n\t\t\t"sub.archive.desc": "Browse archived sessions, restore them to the sidebar, or delete them for good."\n\t\t};'
  // [K2c v7 2026-09-03] 0.1.2-alpha.5 字典形态:zh/en 字典在 "general.nav" 之后新增
  // connection.* 六键,旧锚点("general.nav" 紧贴字典收尾 })失配 → 整文件被判
  // 「锚点不适配,安全跳过」(skipped:true 静默放行) → HIDE_TOP 从未生效 →
  // 专家/备份与迁移/Vision Router 三顶层入口复现(用户报告 09-03,R48 复发)。
  // 处置:新增 alpha 字典锚点变体,以 "connection.error" 行为右边界,sub 键插入其间。
  // 旧版(≤0.1.1,general.nav 收尾)仍走 legacy 变体,双形态共存。
  const ZH_OLD2 = '\t\t\t"openDocument": "打开配置文件",\n\t\t\t"openDocument.error": "无法打开配置文件",\n\t\t\t"general.nav": "通用设置",\n\t\t\t"connection.error": "连接异常",'
  const ZH_NEW2 = '\t\t\t"openDocument": "打开配置文件",\n\t\t\t"openDocument.error": "无法打开配置文件",\n\t\t\t"general.nav": "通用设置",\n\t\t\t"general.page.desc": "常规偏好与系统级入口。",\n\t\t\t"sub.basics": "基础设置",\n\t\t\t"sub.basics.desc": "语言、外观、提示音、文件放入等常规偏好。",\n\t\t\t"sub.experts": "专家",\n\t\t\t"sub.experts.desc": "查看并开关 The Agency 的领域专家。",\n\t\t\t"sub.backup": "备份与迁移",\n\t\t\t"sub.backup.desc": "备份、恢复、导入导出与远程同步 DSH 配置。",\n\t\t\t"sub.vision": "Vision Router",\n\t\t\t"sub.vision.desc": "识图路由、视觉链路与自动识图模型组。",\n\t\t\t"sub.archive": "归档会话管理",\n\t\t\t"sub.archive.desc": "查看已归档会话,恢复到侧栏或彻底删除。",\n\t\t\t"connection.error": "连接异常",'
  const EN_OLD2 = '\t\t\t"openDocument": "Open configuration file",\n\t\t\t"openDocument.error": "Could not open configuration file",\n\t\t\t"general.nav": "General",\n\t\t\t"connection.error": "Disconnected",'
  const EN_NEW2 = '\t\t\t"openDocument": "Open configuration file",\n\t\t\t"openDocument.error": "Could not open configuration file",\n\t\t\t"general.nav": "General",\n\t\t\t"general.page.desc": "General preferences and system entries.",\n\t\t\t"sub.basics": "Basics",\n\t\t\t"sub.basics.desc": "Language, appearance, sounds, file drop and other general preferences.",\n\t\t\t"sub.experts": "Experts",\n\t\t\t"sub.experts.desc": "Toggle The Agency domain experts.",\n\t\t\t"sub.backup": "Backup & Migration",\n\t\t\t"sub.backup.desc": "Back up, restore, import and sync the DSH configuration.",\n\t\t\t"sub.vision": "Vision Router",\n\t\t\t"sub.vision.desc": "Vision routing, chains and auto-vision model groups.",\n\t\t\t"sub.archive": "Archived Sessions",\n\t\t\t"sub.archive.desc": "Browse archived sessions, restore them to the sidebar, or delete them for good.",\n\t\t\t"connection.error": "Disconnected",'
  const GS_OLD = 'function GeneralSection({ renderSlot }) {\n\t\t\treturn (0, react_jsx_runtime.jsx)("div", {\n\t\t\t\tclassName: GeneralSection_module_css_default.section,\n\t\t\t\tchildren: renderSlot("settings.general.item", {})\n\t\t\t});\n\t\t}'
  const GS_NEW = 'function GeneralSection({ renderSlot, select, t, show }) {\n\t\t\t// [K2c v6 2026-09-01] 通用设置双形态:show==="basics" 渲染原通用设置内容(基础设置子页);否则渲染二级入口卡\n\t\t\tif (show === "basics") {\n\t\t\t\treturn (0, react_jsx_runtime.jsx)("div", {\n\t\t\t\t\tclassName: GeneralSection_module_css_default.section,\n\t\t\t\t\tchildren: renderSlot("settings.general.item", {})\n\t\t\t\t});\n\t\t\t}\n\t\t\tconst entries = select === void 0 || t === void 0 ? [] : [\n\t\t\t\t["sub:basics", t("sub.basics"), t("sub.basics.desc")],\n\t\t\t\t["sub:agency-agents", t("sub.experts"), t("sub.experts.desc")],\n\t\t\t\t["sub:config-manager", t("sub.backup"), t("sub.backup.desc")],\n\t\t\t\t["sub:vision-router", t("sub.vision"), t("sub.vision.desc")],\n\t\t\t\t["sub:archive-manager", t("sub.archive"), t("sub.archive.desc")]\n\t\t\t];\n\t\t\treturn (0, react_jsx_runtime.jsx)("div", {\n\t\t\t\tclassName: GeneralSection_module_css_default.section,\n\t\t\t\tchildren: [(0, react_jsx_runtime.jsx)("div", {\n\t\t\t\t\tclassName: "sGenHead",\n\t\t\t\t\tchildren: [(0, react_jsx_runtime.jsx)("span", {\n\t\t\t\t\t\tclassName: "sGenHeadTitle",\n\t\t\t\t\t\tchildren: t("general.nav")\n\t\t\t\t\t}), (0, react_jsx_runtime.jsx)("span", {\n\t\t\t\t\t\tclassName: "sGenHeadDesc",\n\t\t\t\t\t\tchildren: t("general.page.desc")\n\t\t\t\t\t})]\n\t\t\t\t}), (0, react_jsx_runtime.jsx)("div", {\n\t\t\t\t\tclassName: "sGenSubGrid",\n\t\t\t\t\tchildren: entries.map(([id, label, desc]) => (0, react_jsx_runtime.jsx)("button", {\n\t\t\t\t\t\ttype: "button",\n\t\t\t\t\t\tclassName: "sGenSubCard",\n\t\t\t\t\t\tonClick: () => {\n\t\t\t\t\t\t\tselect(id);\n\t\t\t\t\t\t},\n\t\t\t\t\t\tchildren: [(0, react_jsx_runtime.jsx)("span", {\n\t\t\t\t\t\t\tclassName: "sGenSubCardTitle",\n\t\t\t\t\t\t\tchildren: label\n\t\t\t\t\t\t}), (0, react_jsx_runtime.jsx)("span", {\n\t\t\t\t\t\t\tclassName: "sGenSubCardDesc",\n\t\t\t\t\t\t\tchildren: desc\n\t\t\t\t\t\t}), (0, react_jsx_runtime.jsx)("span", {\n\t\t\t\t\t\t\tclassName: "sGenSubCardGo",\n\t\t\t\t\t\t\tchildren: "›"\n\t\t\t\t\t\t})]\n\t\t\t\t\t}, id))\n\t\t\t\t})]\n\t\t\t});\n\t\t}'
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
  const CSSNEST_INJECT = '\t\tconst cssNest = "button[data-dsh-sub=\\"true\\"]{display:none!important}.sGenHead{display:flex;flex-direction:column;gap:2px;width:100%}.sGenHeadTitle{font-size:15px;font-weight:600;line-height:22px;color:var(--dsw-alias-label-primary)}.sGenHeadDesc{font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}.sGenSubGrid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:30px 0 6px;width:100%}.sGenSubCard{box-sizing:border-box;display:grid;grid-template-columns:1fr auto;column-gap:12px;align-items:center;width:100%;min-height:64px;text-align:left;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:11px 14px;cursor:pointer;color:var(--dsw-alias-label-primary);font-family:inherit;transition:border-color .3s cubic-bezier(.32,.72,0,1),background-color .3s cubic-bezier(.32,.72,0,1)}.sGenSubCard:hover{border-color:#d97757;background:var(--dsw-specific-sidebar-nav-item-hover)}.sGenSubCard:focus-visible{outline:2px solid rgba(217,119,87,.5);outline-offset:2px}.sGenSubCardTitle{grid-column:1;grid-row:1;font-size:14px;font-weight:500;line-height:20px;color:var(--dsw-alias-label-primary);transition:color .3s cubic-bezier(.32,.72,0,1)}.sGenSubCard:hover .sGenSubCardTitle{color:#d97757}.sGenSubCardDesc{grid-column:1;grid-row:2;font-size:12px;line-height:17px;color:var(--dsw-alias-label-secondary)}.sGenSubCardGo{grid-column:2;grid-row:1/3;justify-self:end;color:var(--dsw-alias-label-tertiary);font-size:16px;line-height:1;transition:transform .3s cubic-bezier(.32,.72,0,1),color .3s cubic-bezier(.32,.72,0,1)}.sGenSubCard:hover .sGenSubCardGo{transform:translateX(3px);color:#d97757}@media (prefers-reduced-motion:reduce){.sGenSubCard,.sGenSubCardTitle,.sGenSubCardGo{transition:none!important}.sGenSubCard:hover .sGenSubCardGo{transform:none}}";\n\t\tconst tagIdNest = "@deepseek-ai/dsh-client-ui-settings-general/nesting.module.css";\n\t\tif (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagIdNest) + "]") === null) {\n\t\t\tconst tag = document.createElement("style");\n\t\t\ttag.dataset.plugin = "@deepseek-ai/dsh-client-ui-settings-general";\n\t\t\ttag.dataset.pluginCss = tagIdNest;\n\t\t\ttag.textContent = cssNest;\n\t\t\tdocument.head.appendChild(tag);\n\t\t}\n'
  const ROOTVAR_ANCHOR = '\t\tvar SettingsRoot_module_css_default = {'
  const GENREG_OLD = 'label: () => t("general.nav"),\n\t\t\t\tlocale: NS,\n\t\t\t\tchildren: { "settings.general.item": {'
  const GENREG_NEW = 'label: () => t("general.nav"),\n\t\t\t\tlocale: NS,\n\t\t\t\tinject: () => ({ t }),\n\t\t\t\tchildren: { "settings.general.item": {'
  const BASICS_REG_OLD = '\t\t\t}, GeneralSection));'
  const BASICS_REG_NEW = '\t\t\t}, GeneralSection));'
  // rc.x 缩进漂移(rc.2=内部8tab / rc.5=7tab):整块用缩进无关正则捕获,重打为固定7tab形态
  const ROWS_RE = /rows = ctx\.slots\.entries\("settings\.section"\)\.map\(\(e\) => \(\{\n\t+\/\* v8 ignore next[^\n]*?\*\/\n\t+id: e\.options\.id \?\? "",\n\t+order: e\.options\.order \?\? 0,\n\t+label: \(0, _deepseek_ai_dsh_client_ui_slots\.resolveSlotLabel\)\(e\.options\.label\) \?\? ""\n\t+\}\)\)\.sort\(\(a, b\) => a\.order - b\.order\);/
  const ROWS_NEW = 'rows = (() => {\n\t\t\t\t\t\t\t// [K2a v4] 二级页面:三个顶层入口从导航隐藏(仅经 general 下子行可达);\n\t\t\t\t\t\t\t// 基础设置子行复用 general 条目(sub:basics + show 标记),无独立账本条目。\n\t\t\t\t\t\t\tconst HIDE_TOP = ["agency-agents", "config-manager", "vision-router", "archive-manager"];\n\t\t\t\t\t\t\tconst CHILD_IDS = ["basics", "agency-agents", "config-manager", "vision-router", "archive-manager"];\n\t\t\t\t\t\t\tconst all = ctx.slots.entries("settings.section");\n\t\t\t\t\t\t\tconst flat = all.filter((e) => !HIDE_TOP.includes(e.options.id)).map((e) => ({\n\t\t\t\t\t\t\t\tid: e.options.id ?? "",\n\t\t\t\t\t\t\t\torder: e.options.order ?? 0,\n\t\t\t\t\t\t\t\tlabel: (0, _deepseek_ai_dsh_client_ui_slots.resolveSlotLabel)(e.options.label) ?? ""\n\t\t\t\t\t\t\t})).sort((a, b) => a.order - b.order);\n\t\t\t\t\t\t\tconst childRows = CHILD_IDS.map((id) => {\n\t\t\t\t\t\t\t\tif (id === "basics") return { id: "sub:basics", order: 0, label: t("sub.basics"), child: true };\n\t\t\t\t\t\t\t\tconst e = all.find((cand) => cand.options.id === id);\n\t\t\t\t\t\t\t\treturn { id: "sub:" + id, order: 0, label: e ? ((0, _deepseek_ai_dsh_client_ui_slots.resolveSlotLabel)(e.options.label) ?? "") : id, child: true };\n\t\t\t\t\t\t\t});\n\t\t\t\t\t\t\tconst top = [];\n\t\t\t\t\t\t\tlet attached = false;\n\t\t\t\t\t\t\tfor (const row of flat) {\n\t\t\t\t\t\t\t\ttop.push(row);\n\t\t\t\t\t\t\t\tif (!attached && row.id === "general") {\n\t\t\t\t\t\t\t\t\tfor (const child of childRows) top.push(child);\n\t\t\t\t\t\t\t\t\tattached = true;\n\t\t\t\t\t\t\t\t}\n\t\t\t\t\t\t\t}\n\t\t\t\t\t\t\tif (!attached && childRows.length > 0) for (const child of childRows) top.push(child);\n\t\t\t\t\t\t\treturn top;\n\t\t\t\t\t\t})();'
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
    // [v7 2026-09-03] 字典双形态门:legacy(≤0.1.1,"general.nav" 紧贴字典收尾)与
    // alpha(0.1.2+,"general.nav" 后接 connection.* 六键)任一命中即进入重打。
    // 两者都失配才落入旧修订/跳过分支。
    const dictLegacy = head.includes(ZH_OLD) && head.includes(GS_OLD)
    const dictAlpha = head.includes(ZH_OLD2) && head.includes(GS_OLD)
    if (!dictLegacy && !dictAlpha) {
      if (head.includes('sGenSubGrid') && head.includes('sub:basics') && head.includes('sub:archive-manager')) {
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

// ---- [K12] 通用设置「其它」入口 v8→v9 升级(批次 139,2026-09-10) ----
//       背景: 批次 121 的 v9 增量已不在本文件(历史回退至 v8 形态),0.1.2-rc.1/0.1.5
//       seed 的 settings-general 经 patchSettingsNest 只能到达 v8(5 卡无「其它」)。
//       本家族从 alpha.5 孤本(唯一幸存 v9 权威态,subOther=True)提取全部 v9 形态,
//       以 v8→v9 增量重打;已含 v9 指纹(sub.other+sub:other)则幂等跳过。
//       路径修正: rc.1+ seed 的 pnpm 布局改为 .pnpm 平铺虚拟仓
//       (.pnpm/node_modules/@deepseek-ai/...),顶层 node_modules 无此包 ——
//       patchSettingsNest 的 roots 扫不到新副本,故本家族自带平铺仓 root。
function patchGeneralOtherV9() {
  const results = []
  const npxCache = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'npm-cache', '_npx')
  const roots = []
  if (fs.existsSync(npxCache)) {
    for (const h of fs.readdirSync(npxCache)) {
      roots.push(path.join(npxCache, h, 'node_modules', '.pnpm', 'node_modules', '@deepseek-ai', 'dsh-client-ui-settings-general', 'lib', 'client.js'))
    }
  }
  for (const p of roots) {
    if (!fs.existsSync(p)) continue
    const rest = p.slice(npxCache.length + 1)
    const seed = rest.slice(0, rest.indexOf(path.sep))
    const label = 'general-other-v9/' + seed + '/client.js'
    const head = fs.readFileSync(p, 'utf8')
    const pkgDir = path.dirname(path.dirname(p))
    const ver = (() => { try { return JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8')).version } catch { return '?' } })()
    if (head.includes('sub.other') && head.includes('sub:other')) {
      results.push({ file: label, ok: true, already: true, version: ver })
      continue
    }
    if (!head.includes('sGenSubGrid')) {
      // 非 v8 形态(pristine/未知修订):交给 patchSettingsNest 走它自己的流程
      results.push({ file: label, ok: true, skipped: true, version: ver })
      continue
    }
    const { rep, rex, failures } = makeCtx(label)
    const apply = (c) => {
      // 1) GeneralSection 三形态(basics/other/入口卡)
      c = rep(c,
        'if (show === "basics") {',
        'if (show === "basics" || show === "other") { // [K12 v9] 其它子页同走 general 渲染分支',
        1, 'k12-show-branch')
      c = rep(c,
        'children: renderSlot("settings.general.item", {})',
        'children: renderSlot(show === "other" ? "settings.general.other.item" : "settings.general.item", {})',
        1, 'k12-slot-pick')
      // 2) 入口卡第六张「其它」
      c = rep(c,
        '["sub:archive-manager", t("sub.archive"), t("sub.archive.desc")]',
        '["sub:archive-manager", t("sub.archive"), t("sub.archive.desc")],\n\t\t\t["sub:other", t("sub.other"), t("sub.other.desc")]',
        1, 'k12-entry-card')
      // 3) 字典:zh/en 新增 sub.other 双键 + basics.desc 移除提示音/文件放入
      c = rep(c,
        '"sub.basics.desc": "语言、外观、提示音、文件放入等常规偏好。"',
        '"sub.basics.desc": "语言、外观等常规偏好。"',
        1, 'k12-zh-basics-desc')
      c = rep(c,
        '"sub.basics.desc": "Language, appearance, sounds, file drop and other general preferences."',
        '"sub.basics.desc": "Language, appearance and other general preferences."',
        1, 'k12-en-basics-desc')
      c = rep(c,
        '恢复到侧栏或彻底删除。",',
        '恢复到侧栏或彻底删除。",\n\t\t\t"sub.other": "其它",\n\t\t\t"sub.other.desc": "提示音、文件放入等其它偏好。",',
        1, 'k12-zh-other-keys')
      c = rep(c,
        'delete them for good.",',
        'delete them for good.",\n\t\t\t"sub.other": "Other",\n\t\t\t"sub.other.desc": "Notification sound, file drop and other preferences.",',
        1, 'k12-en-other-keys')
      // 4) 导航 CHILD_IDS + other 虚拟子行
      c = rep(c,
        'const CHILD_IDS = ["basics", "agency-agents", "config-manager", "vision-router", "archive-manager"];',
        'const CHILD_IDS = ["basics", "agency-agents", "config-manager", "vision-router", "archive-manager", "other"];',
        1, 'k12-child-ids')
      c = rep(c,
        'if (id === "basics") return { id: "sub:basics", order: 0, label: t("sub.basics"), child: true };',
        'if (id === "basics") return { id: "sub:basics", order: 0, label: t("sub.basics"), child: true };\n\t\t\t\t\t\t\t\tif (id === "other") return { id: "sub:other", order: 0, label: t("sub.other"), child: true };',
        1, 'k12-child-row')
      // 5) SEL 路由:sub:other → show:"other" + only:"general"
      c = rep(c,
        'show: active === "sub:basics" ? "basics" : active === "sub:skin-assets"',
        'show: active === "sub:basics" ? "basics" : active === "sub:other" ? "other" : active === "sub:skin-assets"',
        1, 'k12-sel-show')
      c = rep(c,
        '{ only: active === "sub:basics" ? "general" : active.indexOf("sub:skin-")',
        '{ only: active === "sub:basics" || active === "sub:other" ? "general" : active.indexOf("sub:skin-")',
        1, 'k12-sel-only')
      // 6) children 声明扩 settings.general.other.item(缩进无关正则)
      c = rex(c,
        /children: \{ "settings\.general\.item": \{\n\t+kind: "list",\n\t+scope: "root"\n\t+\} \}/,
        'children: { "settings.general.item": {\n\t\t\t\t\tkind: "list",\n\t\t\t\t\tscope: "root"\n\t\t\t\t}, "settings.general.other.item": {\n\t\t\t\t\tkind: "list",\n\t\t\t\t\tscope: "root"\n\t\t\t\t} }',
        1, 'k12-other-slot-decl')
      // 7) CSS:其它槽末行边框(沿 v9 形态,置于 cssNest 串首;文件内为 JS 字符串,引号已转义)
      c = rep(c,
        'const cssNest = "button[data-dsh-sub=',
        'const cssNest = "[data-slot=\\"settings.general.other.item\\"]>:last-child{border-bottom:none!important}button[data-dsh-sub=',
        1, 'k12-other-css')
      return c
    }
    // [批次161 2026-09-12] 不传 PATCH_MARK: 哨兵快速通道会把「v8 形态+哨兵」的半补丁态
    // (哨兵由同趟更早的 patchSettingsNest 先写入,或新 seed 展开时带入)误判为「已是补丁态」,
    // v9 增量永不应用 → 「其它」入口/子页缺失(0.1.5-rc.2 实证)。幂等改由函数前部的
    // v9 指纹(sub.other+sub:other)短路负责;apply 全锚点匹配原子写盘,失败 kept 报错。
    results.push({ ...rewriteFresh(p, '.bak-other-v9', apply, failures, null), version: ver })
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
        // 2026-09-09 退役判定:上游 0.2.2 重构建(市场同版本号重发)已自带等价修复——
        // RewindMessagePortals 签名增 useChat(DSH 0.1.2 chat 投影迁移)、readSnapshot =
        // useChat ?? useSession 双通道、nodes 走 useMemo(collectChatNodes) 记忆化、
        // targets 走 samePortalTargets 内容等值复用。旧形态锚点才打,新形态跳过
        // (list-slot-id 与形态无关照打)。
        if (c.includes('const nodes = useSession(snapshot => snapshot.chat?.nodes.values() ?? snapshot.nodes);')) {
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
        }
      }
      return c
    }
    results.push({ ...rewrite(p, '.bak-spiid', apply, failures), version: ver })
  }
  // [问题135 批次100] src 源码同步(仅 turn-rewind;无哨兵历史,首次重放即落地)
  const srcTsx = path.join(PLUGINS, '@anionex', 'dsh-turn-rewind', 'src', 'client', 'index.tsx')
  if (fs.existsSync(srcTsx)) {
    const verSr = JSON.parse(fs.readFileSync(path.join(PLUGINS, '@anionex', 'dsh-turn-rewind', 'package.json'), 'utf8')).version
    // 2026-09-09 与 lib 侧同款退役判定:0.2.2 重构建 src 已自带 useChat 双通道修复,
    // 旧形态锚点不在场即整组跳过(不打标记不写盘,保持源码 pristine)。
    const srcCur = fs.readFileSync(srcTsx, 'utf8')
    if (!srcCur.includes('snapshot => snapshot.chat?.nodes.values() ?? snapshot.nodes')) {
      results.push({ file: 'dsh-turn-rewind/src/client/index.tsx', version: verSr, ok: true, skipped: true })
    } else {
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
      return c
    }
    results.push({ ...rewrite(srcTsx, '.bak-nodes-src', applySrc, fsr), version: verSr })
    }
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

// ---- [P3/T5 2026-09-12] 遗留时钟 document.hidden 门(P2 T2-2 升级执行) ----
// 依据:P3 方案 §一.F7 / §四.A3 —— mnemon-spaces 记忆空间页 1s setSyncClock setState 时钟与
// better-sidebar 通用轮询 hook / 任务轮询 / 相对时间 tick / locate 重试均无 hidden 门,窗口
// 遮挡/最小化期间仍每秒触发 React 重渲染并弄脏布局(与 1s 时钟类重渲染族同源)。加门语义:
// 隐藏期跳过采样,可见后下一拍自动恢复(时钟类显示的是相对时间/状态,500ms~1s 的恢复延迟无感);
// 不动既有早退条件(liveCount===0 / visible prop / isJobLive),不推进任何状态机基线。
function patchMnemonClockGate() {
  const p = path.join(PLUGINS, 'dsh-mnemon-source-memory-spaces', 'lib', 'client.js')
  if (!fs.existsSync(p)) return [{ file: 'dsh-mnemon-source-memory-spaces/lib/client.js', missing: true }]
  const ver = JSON.parse(fs.readFileSync(path.join(PLUGINS, 'dsh-mnemon-source-memory-spaces', 'package.json'), 'utf8')).version
  const { rep, failures } = makeCtx('dsh-mnemon-source-memory-spaces/lib/client.js')
  const apply = (c) => c && rep(c,
    '\n\t\t\t\tconst timer = window.setInterval(() => setSyncClock(Date.now()), 1e3);\n',
    '\n\t\t\t\tconst timer = window.setInterval(() => { if (!document.hidden) setSyncClock(Date.now()); }, 1e3); // [dsh-desktop P3/T5] 隐藏期跳过采样\n',
    1, 'sync-clock-hidden-gate')
  return [{ ...rewrite(p, '.bak-p3clock', apply, failures), version: ver }]
}

function patchBetterSidebarClockGate() {
  const p = path.join(PLUGINS, 'dsh-better-sidebar', 'lib', 'client.js')
  if (!fs.existsSync(p)) return [{ file: 'dsh-better-sidebar/lib/client.js', missing: true }]
  const ver = JSON.parse(fs.readFileSync(path.join(PLUGINS, 'dsh-better-sidebar', 'package.json'), 'utf8')).version
  const { rep, failures } = makeCtx('dsh-better-sidebar/lib/client.js')
  const apply = (c) => {
    if (!c) return c
    c = rep(c,
      '\n\t\t\t\t\tsetNow(Date.now());\n',
      '\n\t\t\t\t\tif (!document.hidden) setNow(Date.now()); // [dsh-desktop P3/T5] 隐藏期跳过采样\n',
      1, 'now-tick-hidden-gate')
    c = rep(c,
      '\n\t\t\t\tconst timer = window.setInterval(() => {\n\t\t\t\t\tload();\n\t\t\t\t}, JOB_POLL_MS);\n',
      '\n\t\t\t\tconst timer = window.setInterval(() => {\n\t\t\t\t\tif (!document.hidden) load(); // [dsh-desktop P3/T5] 隐藏期跳过轮询\n\t\t\t\t}, JOB_POLL_MS);\n',
      1, 'job-poll-hidden-gate')
    c = rep(c,
      '\n\t\t\t\tconst timer = window.setInterval(run, intervalMs);\n',
      '\n\t\t\t\tconst timer = window.setInterval(function () { if (!document.hidden) run(); }, intervalMs); // [dsh-desktop P3/T5] 隐藏期跳过轮询\n',
      1, 'poll-hook-hidden-gate')
    c = rep(c,
      '\n\t\t\t\tconst retry = window.setInterval(locate, 1500);\n',
      '\n\t\t\t\tconst retry = window.setInterval(function () { if (!document.hidden) locate(); }, 1500); // [dsh-desktop P3/T5] 隐藏期跳过量测\n',
      1, 'locate-retry-hidden-gate')
    // [P3/T3-1c 2026-09-12] measureCenter RO 宽度门:黑匣子实证「RO 回调强制回流」为偶发卡顿
    // 主源(366 帧 fsl 4924ms,且与 dshvt rail 定位 RO 同帧交错:A 写脏布局 → B 读 = 强制回流)。
    // bottom 横条定位只依赖 col 横向几何(gBCR.left/right),col 高度变化(会话滚动/流式增高)
    // 不必逐帧重测。宽度门放行首次与宽度变化,高度-only 通知零成本跳过。
    c = rep(c,
      'observer = new ResizeObserver(measureCenter);',
      'let dshBsrColW = -1;\n\t\t\t\t\t\tobserver = new ResizeObserver(function (entries) {\n\t\t\t\t\t\t\tvar dshGo = dshBsrColW < 0;\n\t\t\t\t\t\t\tfor (var di = 0; di < entries.length; di++) {\n\t\t\t\t\t\t\t\tvar dw = entries[di].contentRect ? entries[di].contentRect.width : void 0;\n\t\t\t\t\t\t\t\tif (typeof dw === "number" && (dshBsrColW < 0 || Math.abs(dw - dshBsrColW) > 0.5)) dshGo = true;\n\t\t\t\t\t\t\t\tif (typeof dw === "number") dshBsrColW = dw;\n\t\t\t\t\t\t\t}\n\t\t\t\t\t\t\tif (dshGo) measureCenter(); // [dsh-desktop P3/T3-1c] 宽度门:高度-only 通知跳过重测\n\t\t\t\t\t\t});',
      1, 'measure-center-width-gate')
    return c
  }
  return [{ ...rewrite(p, '.bak-p3clock', apply, failures), version: ver }]
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

// ---- [V] 悬停卡片主题一致(R100,2026-09-12) ----
// 症状: 鼠标悬停侧栏会话行,预览卡标题显示 store 原题(如「优化模型调用浏览器时不在单…」),
//       与行内展示的壳端 LLM 摘要主题(「优化模型调用浏览器改为侧边卡片打开」)双轨不一致,
//       用户感知为「悬停会话主题时卡片显示错误」。
// 根因: R40「摘要即主题」只在壳端 dshvt installSessionSummary 做 DOM 级 textContent 替换
//       (4s 轮询,React 不感知),而 HoverCard(SessionHoverContent)是 React 渲染,标题走
//       displayTitle(node)=node.title(store 原题)——两条轨必然分叉,摘要越准卡片越「错」。
// 修法: 同文件(ui-workspace/lib/client.js)单锚点——displayTitle 优先读壳端发布的
//       window.__dshSessionTopics(sid→清洗摘要,dshvt renderAll 每轮整表重建),命中即返回;
//       全局缺席(纯 Web/旧壳/插件未发布)回落 node.title,行为与上游一致。行标题与悬停卡
//       共用 displayTitle,天然同题;壳端 DOM 替换退化为对齐兜底(cur===sum 不再触发)。
//       copyText 仍取 row.title(原题完整可复用,摘要 ≤20 字有损不适合作为复制语义)。
// 与 [Q]/[S]/[U] 同文件 → sentinel=null 绕快路径 + 自有 V_MARK 幂等(批次 49 教训②预防态);
// replayAll 排在全部 ui-workspace 家族之后(上游重建时先重打旧链,本家族在其上重放,顺序自愈);
// .bak-topic 基底=当前全链补丁态,语义=本家族单独可逆。锚点 L+O 12 文件字节一致(逐一提取比对过)。
function patchSessionTopicHoverCard() {
  const V_MARK = '__dshSessionTopics'
  const FROM = '\t\tfunction displayTitle(node, t) {\n\t\t\treturn node.blank ? t("session.new") : node.title;\n\t\t}'
  const TO = [
    '\t\tfunction displayTitle(node, t) {',
    '\t\t\t// [dsh-desktop] R100: 悬停卡主题一致——行标题被壳端摘要(R40)DOM 替换后,HoverCard 仍渲染',
    '\t\t\t// store 原题。优先读壳发布的 window.__dshSessionTopics(sid→清洗摘要),行/卡同一函数同题;',
    '\t\t\t// 全局缺席(纯 Web/旧壳)回落原题。copyText 仍取原题(完整可复用)。',
    '\t\t\tconst __topic = typeof window !== "undefined" ? window.__dshSessionTopics : void 0;',
    '\t\t\tif (__topic && typeof __topic[node.id] === "string" && __topic[node.id]) return __topic[node.id];',
    '\t\t\treturn node.blank ? t("session.new") : node.title;',
    '\t\t}',
  ].join('\n')
  const makeApply = (rep, failures) => (c) => {
    c = rep(c, FROM, TO, 1, 'topic-displayTitle')
    return c
  }
  const results = []
  // L: 本地 monorepo 构建产物(与 [Q]/[S]/[U] 同款寻址)
  const localFile = ['D:\\deepseek harness\\deepseek-harness\\packages\\client\\ui-workspace\\lib\\client.js',
    path.join(os.homedir(), 'deepseek-harness', 'packages', 'client', 'ui-workspace', 'lib', 'client.js')]
    .find((f) => fs.existsSync(f))
  if (localFile) {
    if (fs.readFileSync(localFile, 'utf8').includes(V_MARK)) {
      results.push({ file: 'ui-workspace/lib/client.js@L', ok: true, already: true, version: 'local' })
    } else {
      const { rep, failures } = makeCtx('ui-workspace/lib/client.js@L')
      results.push({ ...rewrite(localFile, '.bak-topic', makeApply(rep, failures), failures, null), version: 'local' })
    }
  } else {
    results.push({ file: 'ui-workspace/lib/client.js@L', missing: true })
  }
  // O: npx 缓存全部 hash 并存版本——双布局(与 [Q] 同款):平铺顶层 + .pnpm pnpm-seed 实体
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
        if (fs.readFileSync(f, 'utf8').includes(V_MARK)) {
          results.push({ file: 'ui-workspace/lib/client.js@O', ok: true, already: true, version: 'npx-' + h.slice(0, 6) })
          continue
        }
        const { rep, failures } = makeCtx('ui-workspace/lib/client.js@O')
        results.push({ ...rewrite(f, '.bak-topic', makeApply(rep, failures), failures, null), version: 'npx-' + h.slice(0, 6) })
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
const K9_CSS = '.dshSkinEntries{display:flex;flex-direction:column;gap:10px;width:100%;height:100%} .dshSkinEntry{box-sizing:border-box;flex:1 1 0;display:grid;grid-template-columns:1fr auto;column-gap:12px;align-items:center;width:100%;min-height:64px;text-align:left;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:11px 14px;cursor:pointer;color:var(--dsw-alias-label-primary);font-family:inherit;transition:border-color .3s cubic-bezier(.32,.72,0,1),background-color .3s cubic-bezier(.32,.72,0,1)} .dshSkinEntry:hover{border-color:#d97757;background:var(--dsw-specific-sidebar-nav-item-hover)} .dshSkinEntry:focus-visible{outline:2px solid rgba(217,119,87,.5);outline-offset:2px} .dshSkinEntryTitle{grid-column:1;grid-row:1;font-size:14px;font-weight:500;line-height:20px;color:var(--dsw-alias-label-primary);transition:color .3s cubic-bezier(.32,.72,0,1)} .dshSkinEntry:hover .dshSkinEntryTitle{color:#d97757} .dshSkinEntryDesc{grid-column:1;grid-row:2;font-size:12px;line-height:17px;color:var(--dsw-alias-label-secondary)} .dshSkinEntryGo{grid-column:2;grid-row:1/3;justify-self:end;color:var(--dsw-alias-label-tertiary);font-size:16px;line-height:1;transition:transform .3s cubic-bezier(.32,.72,0,1),color .3s cubic-bezier(.32,.72,0,1)} .dshSkinEntry:hover .dshSkinEntryGo{transform:translateX(3px);color:#d97757} .dshSkinBack{align-self:flex-start;display:inline-flex;align-items:center;margin:0 0 6px -6px;padding:4px 10px;background:transparent;border:none;border-radius:8px;color:var(--dsw-alias-label-secondary);font-size:13px;font-family:inherit;cursor:pointer;transition:color .3s cubic-bezier(.32,.72,0,1),background-color .3s cubic-bezier(.32,.72,0,1)} .dshSkinBack:hover{color:#d97757;background:var(--dsw-specific-sidebar-nav-item-hover)} @media (prefers-reduced-motion:reduce){.dshSkinEntry,.dshSkinEntryTitle,.dshSkinEntryGo,.dshSkinBack{transition:none!important}.dshSkinEntry:hover .dshSkinEntryGo{transform:none}}'
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
        'let attached = false;\n\t\t\t\t\t\t\tconst SKIN_SUBS = [["assets", "自定义资产"], ["suit", "换装"]];\n\t\t\t\t\t\t\tconst skinRows = SKIN_SUBS.map((s) => ({ id: "sub:skin-" + s[0], order: 0, label: s[1], child: true }));\n\t\t\t\t\t\t\tlet skinAttached = false;',
        1, 'k9-rows-skinchildren')
      c = rep(c,
        'if (!attached && row.id === "general") {\n\t\t\t\t\t\t\t\t\tfor (const child of childRows) top.push(child);\n\t\t\t\t\t\t\t\t\tattached = true;\n\t\t\t\t\t\t\t\t}',
        'if (!attached && row.id === "general") {\n\t\t\t\t\t\t\t\t\tfor (const child of childRows) top.push(child);\n\t\t\t\t\t\t\t\t\tattached = true;\n\t\t\t\t\t\t\t\t}\n\t\t\t\t\t\t\t\tif (!skinAttached && row.id === "skin") {\n\t\t\t\t\t\t\t\t\tfor (const child of skinRows) top.push(child);\n\t\t\t\t\t\t\t\t\tskinAttached = true;\n\t\t\t\t\t\t\t\t}',
        1, 'k9-rows-skinattach')
      // SEL 路由:sub:skin-* → only "skin" + show 透传(子页在 SkinTab 内分流)
      c = rep(c,
        'show: active === "sub:basics" ? "basics" : void 0',
        'show: active === "sub:basics" ? "basics" : active === "sub:skin-assets" ? "skin-assets" : active === "sub:skin-suit" ? "skin-suit" : void 0',
        1, 'k9-sel-show')
      c = rep(c,
        '{ only: active === "sub:basics" ? "general" : active.indexOf("sub:") === 0 ? active.slice(4) : active }',
        '{ only: active === "sub:basics" ? "general" : active.indexOf("sub:skin-") === 0 ? "skin" : active.indexOf("sub:") === 0 ? active.slice(4) : active }',
        1, 'k9-sel-only')
      return c
    }
    results.push({ ...rewriteFresh(p, '.bak-k9-skin', apply, failures, K9_MARK), version: ver })
  }
  return results
}

// ---- [K10] 皮肤二级页打磨(2026-09-06,用户需求):① 壳端返回胶囊(installSectionBackButtons)
//       感知父分区——由激活子行的最近非子级前驱行取 data-section-id 与文案,皮肤子页显示
//       「‹ 返回皮肤」并跳皮肤分区,K2f 通用子页维持「返回通用设置」不变;② 子页页头去重——
//       移除 K9 本地返回链接(胶囊承担),换装子页不再重复渲染标题(joi 槽自带);③ 主页四卡
//       统一视觉语言——右栏入口卡 hover 抬升+圆形箭头 chip+按压反馈,左栏效果卡(dshEffCard)
//       同边框/圆角/内距语言,vt_page 改 stretch 让双栏等高,右栏补「个性化」分组标题与
//       左栏「当前效果」对齐。
const K10_MARK = '/*dsh-local-patch:k10-skin-subpages*/'
const K10_CSS = '.dshSkinEntries{display:flex;flex-direction:column;gap:10px;width:100%;flex:1 1 auto;min-height:0} .dshSkinEntry{box-sizing:border-box;flex:1 1 0;display:grid;grid-template-columns:1fr auto;column-gap:12px;align-items:center;width:100%;min-height:64px;text-align:left;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l2);border-radius:10px;padding:12px 16px;cursor:pointer;color:var(--dsw-alias-label-primary);font-family:inherit;transition:border-color .25s cubic-bezier(.32,.72,0,1),background-color .25s cubic-bezier(.32,.72,0,1),box-shadow .25s cubic-bezier(.32,.72,0,1),transform .25s cubic-bezier(.32,.72,0,1)} .dshSkinEntry:hover{border-color:rgba(217,119,87,.55);background:var(--dsw-specific-sidebar-nav-item-hover);box-shadow:0 6px 18px rgba(0,0,0,.07);transform:translateY(-1px)} .dshSkinEntry:active{transform:translateY(0);box-shadow:0 2px 6px rgba(0,0,0,.05);transition-duration:.12s} .dshSkinEntry:focus-visible{outline:2px solid rgba(217,119,87,.5);outline-offset:2px} .dshSkinEntryTitle{grid-column:1;grid-row:1;font-size:14px;font-weight:500;line-height:20px;color:var(--dsw-alias-label-primary);transition:color .25s cubic-bezier(.32,.72,0,1)} .dshSkinEntry:hover .dshSkinEntryTitle{color:#d97757} .dshSkinEntryDesc{grid-column:1;grid-row:2;margin-top:2px;font-size:12px;line-height:17px;color:var(--dsw-alias-label-secondary)} .dshSkinEntryGo{grid-column:2;grid-row:1/3;justify-self:end;align-self:center;display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:999px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);font-size:13px;line-height:1;transition:background-color .25s cubic-bezier(.32,.72,0,1),border-color .25s cubic-bezier(.32,.72,0,1),color .25s cubic-bezier(.32,.72,0,1),transform .25s cubic-bezier(.32,.72,0,1)} .dshSkinEntry:hover .dshSkinEntryGo{background:#d97757;border-color:#d97757;color:#fff;transform:translateX(3px)} .dshSkinEntry:active .dshSkinEntryGo{transform:translateX(1px)} .dshEffCard{box-sizing:border-box;background:var(--dsw-alias-bg-layer-2);border-radius:10px;padding:12px 16px;min-height:72px;transition:border-color .25s cubic-bezier(.32,.72,0,1),box-shadow .25s cubic-bezier(.32,.72,0,1)} .dshEffCard:hover{border-color:rgba(217,119,87,.4);box-shadow:0 4px 14px rgba(0,0,0,.05)} .vt_page{align-items:stretch} @media (prefers-reduced-motion:reduce){.dshSkinEntry,.dshSkinEntryTitle,.dshSkinEntryGo,.dshEffCard{transition:none!important}.dshSkinEntry:hover{transform:none}.dshSkinEntry:hover .dshSkinEntryGo{transform:none}}'
function patchSkinSubpagesK10() {
  const results = []
  const p = path.join(PLUGINS, 'dsh-desktop-version-tab', 'lib', 'client.js')
  if (!fs.existsSync(p)) {
    results.push({ file: 'dshvt/client.js@k10', missing: true })
    return results
  }
  const ver = JSON.parse(fs.readFileSync(path.join(PLUGINS, 'dsh-desktop-version-tab', 'package.json'), 'utf8')).version
  const { rep, failures } = makeCtx('dshvt/client.js@k10')
  const apply = (c) => {
    // K10-1 返回胶囊感知父分区(通用子页行为不变,皮肤子页 → 「‹ 返回皮肤」)
    c = rep(c,
      'var target = "";\n\t\t\tif (subActive && document.querySelector(\'button[data-section-id="general"]\')) target = "general";\n\t\t\tif (!target) { if (bar) bar.remove(); return; }\n\t\t\tvar label = "返回通用设置";',
      'var target = "", label = "";\n\t\t\tif (subActive) {\n\t\t\t\tvar dshParent = subActive.previousElementSibling;\n\t\t\t\twhile (dshParent && dshParent.getAttribute && dshParent.getAttribute("data-dsh-sub") === "true") dshParent = dshParent.previousElementSibling;\n\t\t\t\tif (dshParent && dshParent.getAttribute && dshParent.getAttribute("data-section-id")) {\n\t\t\t\t\ttarget = dshParent.getAttribute("data-section-id");\n\t\t\t\t\tlabel = "返回" + (dshParent.textContent || "").trim();\n\t\t\t\t}\n\t\t\t}\n\t\t\tif (!target) { if (bar) bar.remove(); return; }',
      1, 'k10-backpill-parent')
    // K10-2 子页页头去重:本地返回链接移除(胶囊承担);换装子页不再重复标题(joi 槽自带)
    c = rep(c,
      '\t\t// [K9] 二级页面:自定义资产 / 换装(show 由设置壳 sub:skin-* 路由透传;返回走\n\t\t// 「‹ 返回皮肤」或左侧导航「皮肤」行)。\n\t\tif (dshShow === "skin-assets" || dshShow === "skin-suit") {\n\t\t\tvar dshBack = function () { if (dshSelect) dshSelect("skin"); };\n\t\t\tvar dshSubHead = h("div", { className: "vt_head" },\n\t\t\t\th("button", { type: "button", className: "dshSkinBack", onClick: dshBack }, "‹ 返回皮肤"),\n\t\t\t\th("h2", { className: "vt_h2" }, dshShow === "skin-assets" ? "自定义资产" : "换装"),\n\t\t\t\th("p", { className: "vt_intro" }, dshShow === "skin-assets"\n\t\t\t\t\t? "导入 jpg/png/gif 或 mp4/webm 等作为界面背景;点击资产行可设为背景或删除。"\n\t\t\t\t\t: "选一套衣装,房间会跟着换;也可以回到 DeepSeek 原生外观。"));',
      '\t\t// [K10 2026-09-06] 子页页头:返回由壳端返回胶囊承担(installSectionBackButtons,\n\t\t// 皮肤子页显示「‹ 返回皮肤」);换装子页不再重复渲染标题(joi 槽自带标题与说明)。\n\t\tif (dshShow === "skin-assets" || dshShow === "skin-suit") {\n\t\t\tvar dshSubHead = dshShow === "skin-assets" ? h("div", { className: "vt_head" },\n\t\t\t\th("h2", { className: "vt_h2" }, "自定义资产"),\n\t\t\t\th("p", { className: "vt_intro" }, "导入 jpg/png/gif 或 mp4/webm 等作为界面背景;点击资产行可设为背景或删除。")) : null;',
      1, 'k10-subhead-dedupe')
    // K10-3 主页右栏补分组标题(与左栏「当前效果」列对齐)
    c = rep(c,
      'h("div", { className: "vt_group" }, dshEntries),',
      'h("div", { className: "vt_group" }, h("div", { className: "vt_groupTitle" }, "个性化"), dshEntries),',
      1, 'k10-entries-title')
    // K10-4 效果卡标记(dshEffCard:与入口卡统一边框/圆角/内距/hover 语言)
    c = rep(c,
      'var bgRow = h("div", { className: "cm_row" },',
      'var bgRow = h("div", { className: "cm_row dshEffCard" },',
      1, 'k10-bgrow-class')
    c = rep(c,
      'var glassRow = h("div", { className: "cm_row" + (glassDisabled ? " cm_rowOff" : "") },',
      'var glassRow = h("div", { className: "cm_row dshEffCard" + (glassDisabled ? " cm_rowOff" : "") },',
      1, 'k10-glassrow-class')
    // K10-5 样式整体升级(原位替换 K9 注入的样式字面量;.dshSkinBack 随链接移除)
    c = rep(c, JSON.stringify(K9_CSS), JSON.stringify(K10_CSS), 1, 'k10-css-swap')
    return c
  }
  // 哨兵快速通道要求独立哨兵:live 文件已带 K9_MARK,改用 K10_MARK + .bak-k10-skin 二段基底
  results.push({ ...rewriteFresh(p, '.bak-k10-skin', apply, failures, K10_MARK), version: ver })
  return results
}

// ---- 入口 ----
const K11_MARK = '/*dsh-local-patch:k11-skin-subpage-ids*/'
function patchSkinSubpagesK11() {
  const results = []
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
    const label = 'general-k11/' + path.dirname(path.dirname(p)).split(path.sep).slice(-2).join('/') + '/client.js'
    const { rep, failures } = makeCtx(label)
    const apply = (c) => {
      // K11 SKIN_SUBS 值去前缀(批次111 K9 双前缀回归的落盘补遗):线上七副本仍持
      // 14:36 初打的旧值 ["skin-assets",...],与 id 拼成 sub:skin-skin-* 双前缀 →
      // SEL show 恒 void 0、入口卡/子行点击停在皮肤主页。修法=与批次111相同的
      // 值替换;独立哨兵 K11_MARK 防与 K9 重放相互踩踏。
      // 2026-09-09 容错:K9/nest 家族与 K11 做同款值替换(rc.1 seed junction 副本实证
      // 被 K9 先行改值,K11 每次重放空 FAIL)。旧值不在场=新值在场(K9 已达标/上游
      // 自带修复)→ 无事可做返回原样;新旧值皆无=陌生形态,FAIL 保留原样。
      const OLD = '[["skin-assets", "自定义资产"], ["skin-suit", "换装"]]'
      if (!c.includes(OLD)) {
        if (!c.includes('[["assets", "自定义资产"], ["suit", "换装"]]')) {
          failures.push('k11-skinsubs: 旧值新值均不在场(上游新版?),保留原样')
        }
        return c
      }
      c = rep(c,
        OLD,
        '[["assets", "自定义资产"], ["suit", "换装"]]',
        1, 'k11-skinsubs-deprefix')
      return c
    }
    results.push({ ...rewriteFresh(p, '.bak-k11-gen', apply, failures, K11_MARK), version: ver })
  }
  return results
}
// ---- [V] 空白会话重复产生根治(R85,2026-09-10) ----
// 症状(用户问题 2026-09-10 #1): 侧栏「多出的无用会话记录」——同工作区反复出现无标题
//       会话行(显示为文件夹名,如 se'jng'k's / XXX),磁盘累计 110+ 个 0.3KB 空会话;
//       实测同一天内 08-30 21 个、08-31 21 个、09-04 16 个,且多次出现「一分钟内 8 个」的成串。
// 根因: workspaces.connectWorkspace 复用一个 blank 会话的谓词要求 `summary.cwd === workspace.path`,
//       而 sessions.create({ workspaceId }) 的**本地摘要合并不带 cwd**(上游注释自认:
//       "a create's summary lands without cwd until the host frame arrives")。host 全量帧
//       到达前,任何再次 connect(启动策略 startInitialSelection、侧栏「新会话」、工作区组头 +、
//       未分组组头 +、工作区选择器 onPick)都会错过复用扫描 → 再造一个 blank;启动策略失败重试
//       (state 回 'waiting' 再 reconcile)会把成串放大。
// 修法: ① create 调用带 `cwd: workspace.path` —— create() 在 workspaceId 分支**不上 wire**
//       (payload 只放 workspaceId),cwd 仅用于本地摘要合并,host 行为零变化;摘要立即持有
//       cwd,紧随其后的 connect 复用扫描即刻命中。
//       ② 复用谓词对「cwd 尚未到达」的摘要豁免 cwd 相等(仅 void 0/"" 豁免;成员关系
//       workspace.sessionIds 与 archived 仍是硬条件,保持上游「cwd alone 不可信」的语义)。
// 幂等: 自实现 MARK 判 already。本文件已被 [P](patchNewSessionFallback) 的 rewrite 家族占用
//       `.bak-newsess` 基底 —— 同文件第二家族**不得再走 rewrite**,否则互判「上游已更新」污染
//       基底(同 patchHeroNoWorkspaceInert 记载的 2026-09-01 实测教训)。replayAll 顺序放在
//       patchNewSessionFallback 之后(两者锚点区域不同,顺序仅为可读性)。
const BLANK_DEDUP_MARK = '/* [dsh-desktop] R85 blank-dedup'
function patchBlankSessionDup() {
  const REUSE_FROM = '\t\t\t\t\tif (summary !== void 0 && summary.blank && summary.cwd === workspace.path && workspace.sessionIds.includes(summary.id) && !archived.includes(summary.id)) return summary.id;'
  const REUSE_TO = '\t\t\t\t\t/* [dsh-desktop] R85 blank-dedup: cwd 未达(刚 create、host 帧未到)时不再因 cwd 失配漏掉复用,否则同工作区连续 connect 各造一个 blank */\n\t\t\t\t\tif (summary !== void 0 && summary.blank && (summary.cwd === void 0 || summary.cwd === "" || summary.cwd === workspace.path) && workspace.sessionIds.includes(summary.id) && !archived.includes(summary.id)) return summary.id;'
  const CREATE_FROM = '\t\t\t\tconst attempt = this.sessions.create({ workspaceId }).finally(() => {'
  const CREATE_TO = '\t\t\t\t/* [dsh-desktop] R85 blank-dedup: 本地摘要即刻持有 cwd —— create() 在 workspaceId 分支不上 wire(host 行为不变),\n\t\t\t\t   随后的 connect 复用同一 blank 而非再建一个 */\n\t\t\t\tconst attempt = this.sessions.create({ workspaceId, cwd: workspace.path }).finally(() => {'
  const patchFile = (p, label) => {
    const current = fs.readFileSync(p, 'utf8')
    if (current.includes(BLANK_DEDUP_MARK)) return { file: label, ok: true, already: true }
    const { rep, failures } = makeCtx(label)
    let c = rep(current, REUSE_FROM, REUSE_TO, 1, 'blank-reuse-cwd-optional')
    c = rep(c, CREATE_FROM, CREATE_TO, 1, 'blank-create-carries-cwd')
    if (failures.length) return { file: label, ok: false, failures: [...failures] }
    fs.writeFileSync(p, c, 'utf8')
    return { file: label, ok: true, already: false }
  }
  const results = []
  const seen = new Set()
  const add = (p, label) => {
    if (typeof p !== 'string' || !p || seen.has(p)) return
    seen.add(p)
    if (!fs.existsSync(p)) return
    results.push({ ...patchFile(p, label), version: 'runtime' })
  }
  // L: 本地 monorepo 构建产物(与 [P]/[Q]/[S] 同款寻址)
  add('D:\\deepseek harness\\deepseek-harness\\packages\\client\\runtime\\lib\\client.js', 'client-runtime/lib/client.js@L')
  add(path.join(os.homedir(), 'deepseek-harness', 'packages', 'client', 'runtime', 'lib', 'client.js'), 'client-runtime/lib/client.js@L2')
  // devlink 层: profiles/node_modules junction(活体实际解析路径;junction 写入=写 L 同一物理文件,
  // 故第二次经 MARK 判 already,天然幂等)
  add(path.join(os.homedir(), '.dsh', 'profiles', 'node_modules', '@deepseek-ai', 'dsh-client-runtime', 'lib', 'client.js'), 'client-runtime/lib/client.js@devlink')
  // O: npx 缓存全部 hash 并存版本——双布局(平铺顶层 + .pnpm seed 实体)
  const npxRoot = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), '.npm-cache'), 'npm-cache', '_npx')
  if (fs.existsSync(npxRoot)) {
    for (const h of fs.readdirSync(npxRoot)) {
      for (const f of [
        path.join(npxRoot, h, 'node_modules', '@deepseek-ai', 'dsh-client-runtime', 'lib', 'client.js'),
        path.join(npxRoot, h, 'node_modules', '.pnpm', 'node_modules', '@deepseek-ai', 'dsh-client-runtime', 'lib', 'client.js'),
      ]) add(f, 'client-runtime/lib/client.js@O@' + h.slice(0, 6))
    }
  }
  if (!results.length) results.push({ file: 'client-runtime/lib/client.js', missing: true })
  return results
}

// ---- [W] v0 会话格式迁移宽容化(R86,2026-09-10,问题 #2) ----
// 症状(用户问题 2026-09-10 #2): 打开历史会话报
//       `failed to observe session "session-ab9e37f6-…": @deepseek-ai/dsh-session-format-v0-to-v1
//        refuses this format v0 Session: user/message 11 source summary requires notice form;
//        source v0 artifact remains unchanged` → 该会话历史永久加载失败。
// 根因: @deepseek-ai/dsh-session-format-v0-to-v1 的 pluginSourceValue 把「冻结 v0 契约」实现成
//       互斥断言 —— 带 `sections` 必须 form==="snapshot"、带 `summary` 必须 form==="notice"。
//       但释放版 v0 自身写出过 form 非 notice 却携带 summary 的 plugin 源(seq 11,按形态推断为
//       compact 的 snapshot + summary),于是校验器把整个会话判为非法并拒绝迁移(源文件保持不变)。
//       注意 form === void 0 的源本来就在前面 `if (form === void 0) return;` 提前返回,故真凶
//       是「form 有值且 ≠ notice/≠ snapshot」这一支。
// 修法: 只把两条「requires … form」断言改为**同语义校验**(sections 按 snapshot 校验、summary 按
//       notice 校验),即对合法载荷放宽到「任何 form 都可携带」;值类型校验与 literalValue 白名单
//       原样保留,strictly-less-rejecting,无回归面(form 缺失分支不动)。
// 覆盖面: 该检查只存在于 v0-to-v1(v1-to-v2 / v2-to-v3 / session-format / catalog 实证 0 命中),
//       故只需修这一个包。whitelist 之外的 form 仍按原逻辑抛错。
//       **单轨意图声明**: 本家族只落官方 npx 轨(O)—— @deepseek-ai/dsh-session-format-v0-to-v1
//       是 0.1.5 才出现的新包,本地 monorepo(L 轨,rc.5 基座)无此包、也无 session-format 层,
//       audit:patches 的「仅官方轨」告警在此为预期态,不是覆盖缺口。
const V0_LENIENT_MARK = '[dsh-desktop] R86 v0-lenient'
function patchSessionFormatV0Lenient() {
  const SEC_FROM = '\telse if (source["sections"] !== void 0) throw new SessionFormatError(`${label} sections require snapshot form`);'
  const SEC_TO = '\t/* [dsh-desktop] R86 v0-lenient: 释放版 v0 存在 form 非 snapshot 却带 sections 的 plugin 源 —— 按 snapshot 语义校验,而不是拒绝整个会话 */\n\telse if (source["sections"] !== void 0) arrayValue(source["sections"], `${label} sections`, (member, memberLabel) => {\n\t\tconst section = exactRecord(member, memberLabel, ["name", "text"]);\n\t\tnonEmptyString(section["name"], `${memberLabel} name`);\n\t\tstringValue(section["text"], `${memberLabel} text`);\n\t});'
  const SUM_FROM = '\tif (form === "notice") stringValue(source["summary"], `${label} summary`);\n\telse if (source["summary"] !== void 0) throw new SessionFormatError(`${label} summary requires notice form`);'
  const SUM_TO = '\t/* [dsh-desktop] R86 v0-lenient: 释放版 v0 存在 form 非 notice 却携带 summary 的 plugin 源\n\t * (实证 session-ab9e37f6 seq 11 —— 推断为 compact 的 snapshot + summary),冻结版互斥断言\n\t * 会把整个 v0 会话判非法并拒绝迁移 → 历史永久加载失败。放宽为「任何 form 都可携带 summary」,\n\t * 仅保留字符串类型校验;form 缺失分支(上方提前 return)不动。 */\n\tif (source["summary"] !== void 0) stringValue(source["summary"], `${label} summary`);'
  const patchFile = (p, label) => {
    const current = fs.readFileSync(p, 'utf8')
    if (current.includes(V0_LENIENT_MARK)) return { file: label, ok: true, already: true }
    const { rep, failures } = makeCtx(label)
    let c = rep(current, SEC_FROM, SEC_TO, 1, 'v0-sections-any-form')
    c = rep(c, SUM_FROM, SUM_TO, 1, 'v0-summary-any-form')
    if (failures.length) return { file: label, ok: false, failures: [...failures] }
    fs.writeFileSync(p, c, 'utf8')
    return { file: label, ok: true, already: false }
  }
  const results = []
  const seen = new Set()
  const add = (p, label) => {
    if (typeof p !== 'string' || !p || seen.has(p)) return
    seen.add(p)
    if (!fs.existsSync(p)) return
    results.push({ ...patchFile(p, label), version: 'format' })
  }
  // O: npx 缓存——双布局: `_npx/<hash>/node_modules/@deepseek-ai/…`(平铺)与
  //     `_npx/<hash>/node_modules/.pnpm/node_modules/@deepseek-ai/…`(pnpm seed 提升层,
  //     0.1.5-rc.1 实证有 4 个 peer 变体实体,全部覆盖)
  const npxRoot = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), '.npm-cache'), 'npm-cache', '_npx')
  if (fs.existsSync(npxRoot)) {
    for (const h of fs.readdirSync(npxRoot)) {
      add(path.join(npxRoot, h, 'node_modules', '@deepseek-ai', 'dsh-session-format-v0-to-v1', 'lib', 'index.js'), 'session-format-v0-to-v1@O@' + h.slice(0, 6))
      add(path.join(npxRoot, h, 'node_modules', '.pnpm', 'node_modules', '@deepseek-ai', 'dsh-session-format-v0-to-v1', 'lib', 'index.js'), 'session-format-v0-to-v1@O@' + h.slice(0, 6))
      // .pnpm 实体层: 4 个 peer 变体各自持独立副本(提升符号链接指向其中之一)
      const pnpmDir = path.join(npxRoot, h, 'node_modules', '.pnpm')
      if (fs.existsSync(pnpmDir)) {
        for (const d of fs.readdirSync(pnpmDir)) {
          if (!d.startsWith('@deepseek-ai+dsh-session-fo')) continue
          add(path.join(pnpmDir, d, 'node_modules', '@deepseek-ai', 'dsh-session-format-v0-to-v1', 'lib', 'index.js'), 'session-format-v0-to-v1@O@' + d.slice(0, 24))
        }
      }
    }
  }
  if (!results.length) results.push({ file: 'session-format-v0-to-v1', missing: true })
  return results
}

// ---- [M1] 模型选择器:会话已删除时软化 + 自愈(2026-09-11,验证 0.1.5-rc.1) ----
// 症状: 当前所在会话被删掉后(批量清理 / 侧栏删除),在模型选择器里切换模型弹红 toast
//       「模型操作失败：session/not-found: …」;此后该会话任何会话级操作(发消息 / 改推理
//       等级 / fork)全部失败,只有手动刷新页面才恢复(用户报告 2026-09-11,批次 153 取证)。
// 根因: ① 切模型不是本地状态,而是往该会话日志追加 model/selection 事件;服务端
//          dsh-api-session-controller 三级查找(活动 agent → 已挂载会话 → 持久化 resume)
//          全落空即回 session/not-found;
//       ② 客户端把该错误原样塞进 toast —— inject 面孔的
//          `select: (s) => directory.select(s).then(() => true, () => false)` 吞掉异常,
//          settleSelection(false) 再读 directory.store.error 直接 t("error.action");
//       ③ 「当前会话」指针只活在渲染进程内存里,服务端删会话不回推,故渲染层长期持死 id。
// 修法: ① ModelDirectory.select 失败且 code==="session/not-found" 时触发 onSessionGone
//          自愈回调(directoryFor 注入):sessions.clear() 清掉失效的当前选择,布局立刻
//          回到「新建会话」空态 —— 与手动刷新等价,但不必整页重载;
//       ② settleSelection 命中 not-found 改显示专用文案 error.sessionGone(zh/en 双字典),
//          不再把生错误码甩给用户;
//       ③ 自愈挂在 ModelDirectory 上,故 /model 弹窗与 composer 座位两条入口同时受益。
// 单轨声明: 该包只存在于 profile 层(~/.dsh/profiles/node_modules,core runtime 层,
//       junction → 当前轨的 seed / 本地产物),不在 web 插件层也不在 monorepo 源码树,
//       打一次两轨生效 —— 本家族只落 profile 层单根属结构性同步,非覆盖缺口。
//       不落 npx 缓存内那 10 份历史版本副本(36784 / 36889 / 40020 字节,锚点形态不同):
//       它们不是活体,强行覆盖只会引入失配 FAIL。
function patchModelSelectionSessionGone() {
  const p = path.join(os.homedir(), '.dsh', 'profiles', 'node_modules', '@deepseek-ai', 'dsh-client-ui-model-selection', 'lib', 'client.js')
  if (!fs.existsSync(p)) return [{ file: 'model-selection/lib/client.js', missing: true }]
  let ver = 'profile'
  try { ver = JSON.parse(fs.readFileSync(path.join(path.dirname(path.dirname(p)), 'package.json'), 'utf8')).version } catch {}
  const { rep, failures } = makeCtx('model-selection/lib/client.js')
  const apply = (c) => {
    // (a) select 失败分支:识别「会话已删除」并触发自愈
    c = rep(c,
      '\t\t\t\tif (!result.ok) {\n\t\t\t\t\tthis.store.update((s) => {\n\t\t\t\t\t\ts.status = "error";\n\t\t\t\t\t\ts.error = `${result.error.code}: ${result.error.message}`;\n\t\t\t\t\t});\n\t\t\t\t\tthrow new Error(`session.selectModel failed: ${result.error.code}: ${result.error.message}`);\n\t\t\t\t}',
      '\t\t\t\tif (!result.ok) {\n\t\t\t\t\t// [dsh-desktop] M1: 会话已被删除时自愈,不让死会话卡死整条会话级操作链\n\t\t\t\t\tconst sessionGone = result.error.code === "session/not-found";\n\t\t\t\t\tthis.store.update((s) => {\n\t\t\t\t\t\ts.status = "error";\n\t\t\t\t\t\ts.error = `${result.error.code}: ${result.error.message}`;\n\t\t\t\t\t});\n\t\t\t\t\tif (sessionGone && typeof this.onSessionGone === "function") this.onSessionGone();\n\t\t\t\t\tthrow new Error(`session.selectModel failed: ${result.error.code}: ${result.error.message}`);\n\t\t\t\t}',
      1, 'm1-select-gone')
    // (b) onSessionGone 字段声明
    c = rep(c,
      '\t\t\tasync select(selection) {\n\t\t\t\tthis.assertAvailable();',
      '\t\t\t/** [dsh-desktop] M1: 会话已删除时的自愈回调(directoryFor 注入)。 */\n\t\t\tonSessionGone;\n\t\t\tasync select(selection) {\n\t\t\t\tthis.assertAvailable();',
      1, 'm1-field')
    // (c) resolver 注入自愈
    c = rep(c,
      '\t\t\t\tlive.directories.set(sessionId, directory);',
      '\t\t\t\t// [dsh-desktop] M1: 死会话自愈 —— 清掉失效的当前选择,回到「新建会话」空态(等价刷新;sessions.clear 幂等)\n\t\t\t\tdirectory.onSessionGone = () => {\n\t\t\t\t\ttry {\n\t\t\t\t\t\tsessions.clear();\n\t\t\t\t\t} catch {}\n\t\t\t\t};\n\t\t\t\tlive.directories.set(sessionId, directory);',
      1, 'm1-resolver-hook')
    // (d) toast 文案:命中会话已删除时用专用文案
    c = rep(c,
      '\t\t\t\t\t\ttext: t("error.action", { message })',
      '\t\t\t\t\t\ttext: /session\\/not-found/.test(message) ? t("error.sessionGone") : t("error.action", { message })',
      1, 'm1-toast')
    // (e) zh 字典
    c = rep(c,
      '\t\t\t"error.action": "模型操作失败：{message}",',
      '\t\t\t"error.action": "模型操作失败：{message}",\n\t\t\t"error.sessionGone": "当前会话已被删除，已回到新建会话",',
      1, 'm1-zh')
    // (f) en 字典
    c = rep(c,
      '\t\t\t"error.action": "Model operation failed: {message}",',
      '\t\t\t"error.action": "Model operation failed: {message}",\n\t\t\t"error.sessionGone": "This session was deleted - returned to a new session",',
      1, 'm1-en')
    return c
  }
  return [{ ...rewrite(p, '.bak-msel', apply, failures), version: ver }]
}

// [M2 2026-09-11] pi-ai openai-completions: 发送前兼容性矫正(GLM/智谱模板硬约束)。
// 起因:阿里云 MaaS 托管的 ZHIPU/GLM-5.3-Flash 实测(2026-09-11/12,headless 端到端):
//   ① 拒绝连续同角色消息 → 400 {"code":"1214","message":"角色信息不正确"};
//     dsh 插件层天然注入多条 user 消息(运行时上下文快照、技能清单),首回合 3 连 user。
//   ② 不认 OpenAI developer role —— 且这是 dsh-llm-pi-ai 的真 bug:
//     `resolveModelCompat`(packages/llm/llm-pi-ai/src/catalog.ts)对 route 级 compat
//     **只透传 thinkingFormat/supportsReasoningEffort 两个开关**,settings 声明的
//     `supportsDeveloperRole:false`/`supportsStore:false` 被静默丢弃 → 模型落到
//     pi-ai 的 baseURL 侦测(OpenAI 新版默认)→ system 提示词以 developer role + 
//     store:true 上线。deepseek 系第一方模型恰好被端点容忍,GLM 不会。
// 矫正(对其它端点语义等价或仅限 aliyuncs 域):
//   a) developer→system(system 全端点通用);
//   b) 连续同角色 user/assistant(无 tool_calls)合并;
//   c) baseUrl 命中 aliyuncs.com 时剔除 store(OpenAI 专属字段)。
// 落点 = buildParams/onPayload 之后、create 之前(最后一步,覆盖一切上游变换)。
// 单轨声明:pi-ai 为 profile 层核心包(junction → repo apps/cli 嵌套副本 → .pnpm
// 物理单份),全机唯一活体(P 轨双覆盖)。
function patchPiAiMergeConsecutiveMessages() {
  const p = path.join(os.homedir(), '.dsh', 'profiles', 'node_modules', '@earendil-works', 'pi-ai', 'dist', 'api', 'openai-completions.js')
  if (!fs.existsSync(p)) return [{ file: 'pi-ai/dist/api/openai-completions.js', missing: true }]
  let ver = 'profile'
  try { ver = JSON.parse(fs.readFileSync(path.join(path.dirname(path.dirname(path.dirname(p))), 'package.json'), 'utf8')).version } catch {}
  const { rep, failures } = makeCtx('pi-ai/dist/api/openai-completions.js')
  const apply = (c) => c && rep(c,
    `            const nextParams = await options?.onPayload?.(params, model);\n            if (nextParams !== undefined) {\n                params = nextParams;\n            }\n`,
    `            const nextParams = await options?.onPayload?.(params, model);\n            if (nextParams !== undefined) {\n                params = nextParams;\n            }\n            // [dsh-desktop] M2: GLM/智谱模板硬约束矫正(连续同角色 1214;developer role 不认;\n            // aliyuncs 域剔除 OpenAI 专属 store)。详见 patches.cjs 的 M2 注释。\n            {\n                const merged = [];\n                const joinContent = (a, b) => {\n                    const av = a == null ? "" : a;\n                    const bv = b == null ? "" : b;\n                    if (typeof av === "string" && typeof bv === "string") return av ? av + "\\n\\n" + bv : bv;\n                    const pa = Array.isArray(av) ? av : [{ type: "text", text: String(av) }];\n                    const pb = Array.isArray(bv) ? bv : [{ type: "text", text: String(bv) }];\n                    return [...pa, ...pb];\n                };\n                for (const m of params.messages ?? []) {\n                    const prev = merged[merged.length - 1];\n                    const mergeable = prev\n                        && prev.role === m.role\n                        && (m.role === "user" || (m.role === "assistant" && !m.tool_calls && !prev.tool_calls));\n                    if (mergeable) prev.content = joinContent(prev.content, m.content);\n                    else merged.push(m);\n                }\n                for (const m of merged) if (m.role === "developer") m.role = "system";\n                params.messages = merged;\n                try {\n                    if (params.store !== undefined && /(^|\\.)aliyuncs\\.com$/.test(new URL(model.baseUrl || "").hostname)) delete params.store;\n                } catch {}\n                if (process.env.DSH_M2_DEBUG) {\n                    console.error("[M2dbg]", JSON.stringify({\n                        roles: merged.map((m) => m.role),\n                        shapes: merged.map((m) => typeof m.content === "string" ? "s" + m.content.length : "a" + (m.content || []).length),\n                        tools: (params.tools || []).length,\n                        store: params.store,\n                        enable_thinking: params.enable_thinking,\n                    }));\n                }\n            }\n`,
    1, 'm2-compat-block')
  return [{ ...rewrite(p, '.bak-piai', apply, failures), version: ver }]
}

// ---- [R99] ui-layout 右栏(侧边卡片)首开默认宽度 45%→37%(2026-09-12,用户需求) ----
// 需求:「优化侧边卡片初次打开时的尺寸,改为如图的尺寸(不影响后续尺寸手动修改)」。
// 现状: 原生右栏首开默认 = 视口宽的 45%(ui-layout 两处硬编码)。主人截图(2100×1350 物理 px,
//       左栏分隔线 x=419 ⇒ DPR 1.5、视口 1400 CSS px)实测右栏 773 物理 px = 515 CSS ≈ **36.8%**。
// 修法: 两处 .45 → .37 —— ① 常量 RIGHTBAR_DEFAULT_RATIO(openRightbar 的 `rightbar ??=` 种子,
//       即「首开默认」);② AppFrame 渲染回退 `layoutInfo.rightbar ?? viewport * .45`(同语义,
//       同步改免双轨)。**手动拖宽不受影响**:拖拽走 setRightbar 写 layoutInfo.rightbar,
//       ??= 从此不命中;布局 store 不持久化,页面刷新后回到「从未手动调过」态,首开再落新默认。
//       约束面核对:min 300px / max .7×viewport(RIGHTBAR_MAX_RATIO)/ computeColumns 的
//       available=viewport-sidebar-400 收缩 —— .37 在常规窗口宽度下不触界(1400 视口时
//       518px < available 720px)。
// 载体纪律: 与 [R95] 同款 —— 核心包客户端产物、自有 MARK 幂等、失败不写盘、只认锚点在场的
//       副本,历史 seed / 本地 monorepo 旧构建(无右栏代码)天然 skipped;改盘后需**刷新页面**
//       才对用户生效。覆盖面:L 本地 monorepo 构建 + devlink profile junction + O npx 缓存
//       三层(提升/平铺/.pnpm 实体)。
const RIGHTBAR_RATIO_MARK = '/* [dsh-desktop] R99 rightbar-default-ratio'
// GOOD = 修正后的注入形态(块注释正确闭合,const 落在代码区)。
const RIGHTBAR_RATIO_GOOD = RIGHTBAR_RATIO_MARK + ': 首开默认宽度 45%→37%,对齐主人期望尺寸(截图实测 36.8%);\n' +
  '\t\t   手动拖宽走 setRightbar 落 layoutInfo.rightbar,??= 即退场 → 手动尺寸不受影响 */\n' +
  '\t\tconst RIGHTBAR_DEFAULT_RATIO = .37;'
// BROKEN = 首版(TO1 漏了块注释闭合 `*/`)的精确形态 —— 该形态把 const 连同后续 JSDoc 一起
// 吞进注释,活体实证 openRightbar 抛 ReferenceError、右栏打不开(b167 验收抓到)。因 MARK 已
// 在场,普通重放会误判 already → 本家族对 BROKEN 形态做精确匹配自愈,再走 GOOD 的 already 判定。
const RIGHTBAR_RATIO_BROKEN = RIGHTBAR_RATIO_MARK + ' 45%→37%:右栏(侧边卡片)首开默认宽度对齐主人期望尺寸\n' +
  '\t\t// (截图实测 36.8%;手动拖宽走 setRightbar 落 layoutInfo.rightbar,??= 即退场,手动尺寸不受影响)\n' +
  '\t\tconst RIGHTBAR_DEFAULT_RATIO = .37;'
function patchRightbarDefaultRatio() {
  const FROM1 = 'const RIGHTBAR_DEFAULT_RATIO = .45;'
  const FROM2 = 'const rightbarPreference = layoutInfo.rightbar ?? viewport * .45;'
  const TO2 = 'const rightbarPreference = layoutInfo.rightbar ?? viewport * .37; /* [dsh-desktop] R99 与 RIGHTBAR_DEFAULT_RATIO 同步 */'
  const patchFile = (p, label) => {
    const current = fs.readFileSync(p, 'utf8')
    if (current.includes(RIGHTBAR_RATIO_BROKEN)) {
      fs.writeFileSync(p, current.split(RIGHTBAR_RATIO_BROKEN).join(RIGHTBAR_RATIO_GOOD), 'utf8')
      return { file: label, ok: true, already: false, repaired: true }
    }
    if (current.includes(RIGHTBAR_RATIO_GOOD)) return { file: label, ok: true, already: true }
    if (!current.includes('RIGHTBAR_DEFAULT_RATIO')) return { file: label, ok: true, skipped: true, reason: '该副本无右栏宽度逻辑(非活体/版本不同)' }
    const { rep, failures } = makeCtx(label)
    let c = rep(current, FROM1, RIGHTBAR_RATIO_GOOD, 1, 'rightbar-default-ratio-const')
    c = rep(c, FROM2, TO2, 1, 'rightbar-default-ratio-fallback')
    if (failures.length) return { file: label, ok: false, failures: [...failures], kept: true }
    fs.writeFileSync(p, c, 'utf8')
    return { file: label, ok: true, already: false }
  }
  const results = []
  const seen = new Set()
  const add = (p, label) => {
    if (typeof p !== 'string' || !p || seen.has(p)) return
    seen.add(p)
    if (!fs.existsSync(p)) return
    let ver = 'local'
    try { ver = JSON.parse(fs.readFileSync(path.join(path.dirname(path.dirname(p)), 'package.json'), 'utf8')).version } catch {}
    results.push({ ...patchFile(p, label), version: ver })
  }
  const REL = ['@deepseek-ai', 'dsh-client-ui-layout', 'lib', 'client.js']
  // L: 本地 monorepo 构建产物(现构建无右栏代码 → skipped;上游重构建后自动接管)
  add('D:\\deepseek harness\\deepseek-harness\\packages\\client\\ui-layout\\lib\\client.js', 'ui-layout/client.js@L')
  add(path.join(os.homedir(), 'deepseek-harness', 'packages', 'client', 'ui-layout', 'lib', 'client.js'), 'ui-layout/client.js@L2')
  // devlink 层: profiles/node_modules junction(活体实际解析路径;与 O 轨同物理文件,MARK 幂等)
  add(path.join(os.homedir(), '.dsh', 'profiles', 'node_modules', ...REL), 'ui-layout/client.js@devlink')
  // O: npx 缓存三层布局(提升层 .pnpm/node_modules、平铺层 node_modules、.pnpm 实体层)
  const npxRoot = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), '.npm-cache'), 'npm-cache', '_npx')
  if (fs.existsSync(npxRoot)) {
    for (const h of fs.readdirSync(npxRoot)) {
      add(path.join(npxRoot, h, 'node_modules', '.pnpm', 'node_modules', ...REL), 'ui-layout/client.js@hoist@' + h.slice(0, 6))
      add(path.join(npxRoot, h, 'node_modules', ...REL), 'ui-layout/client.js@flat@' + h.slice(0, 6))
      const pnpmDir = path.join(npxRoot, h, 'node_modules', '.pnpm')
      if (!fs.existsSync(pnpmDir)) continue
      for (const d of fs.readdirSync(pnpmDir)) {
        if (!d.startsWith('@deepseek-ai+dsh-client-ui-')) continue
        add(path.join(pnpmDir, d, 'node_modules', ...REL), 'ui-layout/client.js@pnpm@' + d.slice(-8))
      }
    }
  }
  if (!results.length) results.push({ file: 'ui-layout/client.js', missing: true })
  return results
}

// ---- [R101] dsh-better-sidebar 内置「浏览器」Tab 接不住聊天外链(2026-09-12,批次 166 用户复检) ----
// 现象: [R98c] 放行后,点会话里的链接确实改开侧边卡片内置「浏览器」Tab(Tab 标题=域名),但
//       Tab 内部停在「输入网址开始浏览(沙箱模式)」空态 —— 地址栏空、iframe 不加载、不导航。
// 根因(0.19.x 原生右栏迁移半成品,字节级实证):
//   ① service openTab 的 surface 分支把外链装进 params:{title, url} 交宿主 sidebarRight;宿主按
//      kind 复用/新建 Tab(contentId=pageAddress(kind),同 kind 恒同地址)后经 tabDomain.navigate
//      把 params 原样带回;插件侧原生 tab-adapter ensure() **只搬 params.path**(mint 分支 path
//      展开 + 更新分支 path diff),params.url 在全新 mint 分支被整体丢弃、在更新分支只进 meta.url;
//   ② BrowserView 的导航状态是 useState(tab.path) —— 只读初值,后续 tab.path 变化不感知。
//   ⇒ 首开 Tab: path=undefined → 恒空态;同 Tab 复用(第二击): meta.url 无人消费 → 不导航。
//   对照: 底部工作台回退路径(openTab 的 reducer 分支)有 `seed.url → patchTab({path: seed.url})`
//   (isCreation 时,client.js:1450)—— 上游 0.19.0 迁移原生右栏时漏掉了等价物。
// 修法两刀(全落 better-sidebar 自己的产物;宿主 sidebar-right 与 ego-browser 均不动):
//   ① openTab surface 分支: params 额外带 `path: seed.url`(仅 seed.type==="browser")—— 适配器
//      mint/更新两分支对 params.path 的搬运是现成的(编辑器「就地换文件」同款通道);
//   ② BrowserView 补 tab.path 同步 effect: path 变化即 setUrl/setInput/清提示/抬 reloadKey,
//      覆盖复用导航;首开路径 useState 初值已对,effect 等值早退。地址栏手动导航(persist 只写
//      插件自有 store 的 patchTab,不回写原生 record)不会与本 effect 打架。
// 载体: lib/client.js + lib/client-registry.js(双 FULL 产物,两处锚点字节一致;[A] 家族同款覆盖面)。
// 生效方式: client 面 → 刷新页面。
function patchBetterSidebarBrowserLinkNav() {
  const dir = path.join(PLUGINS, 'dsh-better-sidebar')
  const results = []
  if (!fs.existsSync(dir)) return [{ file: 'dsh-better-sidebar(browser-linknav)', missing: true }]
  let ver = 'unknown'
  try { ver = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).version } catch (e) { /* ignore */ }
  const MARK = '[R101 bsr-browser-linknav 2026-09-12,patches.cjs [R101] 段守护]'
  // 刀①: surface 分支 params 补 path
  const A_FROM = '\t\t\t\t\t\t\t...seed.url === void 0 ? {} : { url: seed.url },'
  const A_TO = A_FROM + '\n' +
    '\t\t\t\t\t\t\t// ' + MARK + ' 原生右栏 browser 外链导航:url 须兼作 path 下发 —— 原生 tab-adapter\n' +
    '\t\t\t\t\t\t\t// ensure() 只搬 params.path(BrowserView 只读 tab.path),url 在 mint 分支被丢弃,\n' +
    '\t\t\t\t\t\t\t// 点聊天外链开出的浏览器 Tab 恒空态。对齐底部回退路径既有行为;仅 browser 类。\n' +
    '\t\t\t\t\t\t\t...seed.url === void 0 || seed.type !== "browser" ? {} : { path: seed.url },'
  // 刀②: BrowserView 随 tab.path 同步导航
  const B_FROM = [
    '\t\t\t(0, react.useEffect)(() => {',
    '\t\t\t\tif (url === void 0) return;',
    '\t\t\t\tlet cancelled = false;',
    '\t\t\t\tsetEmbedBlocked(null);',
    '\t\t\t\tsetForceEmbed(false);',
    '\t\t\t\tapi.browserProbe(url).then((probe) => {',
    '\t\t\t\t\tif (!cancelled && embeddabilityOf(probe) === "blocked") setEmbedBlocked(url);',
    '\t\t\t\t}).catch(() => {});',
    '\t\t\t\treturn () => {',
    '\t\t\t\t\tcancelled = true;',
    '\t\t\t\t};',
    '\t\t\t}, [url]);',
  ].join('\n')
  const B_TO = B_FROM + '\n' +
    '\t\t\t// ' + MARK + ' 外链复用导航:同 kind Tab 被宿主复用时,新地址经 tab.path 到达,而本组件\n' +
    '\t\t\t// 的 url 是 useState 只读初值 ⇒ 不导航。随 tab.path 同步导航状态(首开时等值早退)。\n' +
    '\t\t\t(0, react.useEffect)(() => {\n' +
    '\t\t\t\tif (tab.path === void 0 || tab.path === url) return;\n' +
    '\t\t\t\tsetUrl(tab.path);\n' +
    '\t\t\t\tsetInput(tab.path);\n' +
    '\t\t\t\tsetMessage(null);\n' +
    '\t\t\t\tsetEmbedBlocked(null);\n' +
    '\t\t\t\tsetForceEmbed(false);\n' +
    '\t\t\t\tsetReloadKey((key) => key + 1);\n' +
    '\t\t\t}, [tab.path]);'
  for (const f of ['client.js', 'client-registry.js']) {
    const p = path.join(dir, 'lib', f)
    const FILE = 'dsh-better-sidebar/lib/' + f + '(browser-linknav)'
    if (!fs.existsSync(p)) { results.push({ file: FILE, missing: true }); continue }
    const { rep, failures } = makeCtx('bsr/' + f + '(browser-linknav)')
    const current = fs.readFileSync(p, 'utf8')
    if (current.includes(MARK)) { results.push({ file: FILE, version: ver, ok: true, already: true }); continue }
    if (!current.includes('api.browserProbe(url)')) {
      results.push({ file: FILE, version: ver, ok: true, skipped: true, reason: '该副本无内置浏览器模块(版本/入口不同),无需守护' })
      continue
    }
    let c = rep(current, A_FROM, A_TO, 1, 'surface-params-path')
    c = rep(c, B_FROM, B_TO, 1, 'browserview-path-sync')
    if (failures.length) { results.push({ file: FILE, version: ver, ok: false, failures: [...failures], kept: true }); continue }
    fs.writeFileSync(p, c, 'utf8')
    results.push({ file: FILE, version: ver, ok: true, already: false })
  }
  return results
}

// ---- [R102] dsh-better-sidebar「拒绝嵌入」面板退役,配合壳层剥头直连(2026-09-12,用户需求) ----
// 主人需求:「优化侧边卡片在浏览某些网站时提示的拒绝了嵌入请求,改为直接访问」。
// 背景: X-Frame-Options / CSP frame-ancestors 由 Chromium 网络层强制,壳层 main.js [R102] 已对
//   subFrame 响应剥离(见 main.js whenReady)⇒ 内置浏览器 iframe 可直连任意站点真实源站。
// 本刀: better-sidebar 的 embed 探针(api.browserProbe,走 **dsh 服务端** fetch 读上游**原始**
//   响应头)对壳剥离不可见,仍会判 blocked 并弹「拒绝嵌入」面板挡住 iframe ⇒ 不再采信其 blocked
//   判定(embedBlocked 恒不入列,面板与「仍然加载/在浏览器中打开」按钮整体退役;地址栏右侧
//   本就有外开按钮)。过渡期(壳未重打包): 被拒站点 iframe 显示 Chromium「拒绝连接」空白框,
//   重打包重启壳后即真实直连。
// 载体: lib/client.js + lib/client-registry.js(锚点字节一致,api.browserProbe 全文件唯一)。
// 生效方式: client 面 → 刷新页面(面板立即退役;直连生效依赖壳重打包)。
function patchBetterSidebarEmbedAllow() {
  const dir = path.join(PLUGINS, 'dsh-better-sidebar')
  const results = []
  if (!fs.existsSync(dir)) return [{ file: 'dsh-better-sidebar(embed-allow)', missing: true }]
  let ver = 'unknown'
  try { ver = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).version } catch (e) { /* ignore */ }
  const MARK = '[R102 bsr-embed-allow 2026-09-12,patches.cjs [R102] 段守护]'
  const FROM = [
    '\t\t\t\tapi.browserProbe(url).then((probe) => {',
    '\t\t\t\t\tif (!cancelled && embeddabilityOf(probe) === "blocked") setEmbedBlocked(url);',
  ].join('\n')
  const TO = [
    '\t\t\t\tapi.browserProbe(url).then((probe) => {',
    '\t\t\t\t\t// ' + MARK + ' 壳层(main.js [R102])已对 subFrame 剥离 X-Frame-Options/CSP frame-ancestors,',
    '\t\t\t\t\t// 任意站点都可被内置浏览器 iframe 直连 —— 不再采信探针的 blocked 判定(探针走 dsh',
    '\t\t\t\t\t// 服务端 fetch 读上游原始头,对壳剥离不可见),「拒绝嵌入」面板整体退役。旧壳(未重',
    '\t\t\t\t\t// 打包)期间被拒站点显示 Chromium「拒绝连接」空白框,重打包重启壳后即真实直连。',
    '\t\t\t\t\tif (!cancelled && false) setEmbedBlocked(url);',
  ].join('\n')
  for (const f of ['client.js', 'client-registry.js']) {
    const p = path.join(dir, 'lib', f)
    const FILE = 'dsh-better-sidebar/lib/' + f + '(embed-allow)'
    if (!fs.existsSync(p)) { results.push({ file: FILE, missing: true }); continue }
    const { rep, failures } = makeCtx('bsr/' + f + '(embed-allow)')
    const current = fs.readFileSync(p, 'utf8')
    if (current.includes(MARK)) { results.push({ file: FILE, version: ver, ok: true, already: true }); continue }
    if (!current.includes('api.browserProbe(url)')) {
      results.push({ file: FILE, version: ver, ok: true, skipped: true, reason: '该副本无内置浏览器模块(版本/入口不同),无需守护' })
      continue
    }
    const c = rep(current, FROM, TO, 1, 'embed-probe-verdict')
    if (failures.length) { results.push({ file: FILE, version: ver, ok: false, failures: [...failures], kept: true }); continue }
    fs.writeFileSync(p, c, 'utf8')
    results.push({ file: FILE, version: ver, ok: true, already: false })
  }
  return results
}

// ---- [P3/T3-1d 2026-09-12] ui-conversation composer 高度同步 RO 高度门 ----
// 依据:黑匣子 dump RO 归因(RO#1 = seatObserver,观察 composerSeat+scroller):卡片开合/
// 宽度过渡期该 RO 每帧触发,回调内 offsetHeight+clientHeight 两次布局读 + 两次 CSS 变量写,
// 与 dshvt rail RO / better-sidebar measureCenter 同帧交错形成读-写-读强制回流级联
// (366 帧 fsl 4924ms = 偶发卡顿主源)。两个 CSS 变量只承载「高度」语义:contentRect.height
// 未变(宽度-only 变化)时跳过读写,级联即断;高度真变(输入框增行/窗口改高)才读+写,
// 语义与原行为完全一致(首见目标必放行,初始正确性保留)。
// 载体:@deepseek-ai/dsh-client-ui-conversation(lib)全部并存布局 + 本地 monorepo 构建产物。
// 叠加语义:该文件已被多个家族补丁(全局哨兵在场),不能走 rewrite 默认哨兵短路——
// 自治理:自有标记 'P3/T3-1d' 判幂等,锚点失配(上游漂移)即不写盘保持现状。
function patchConversationHeightGate() {
  const ANCHOR_FROM = 'seatObserver.current = new ResizeObserver(() => {\n\t\t\t\t\tscroller.style.setProperty("--dsh-composer-height", `${seat.offsetHeight}px`);\n\t\t\t\t\tscroller.style.setProperty("--dsh-conversation-viewport-height", `${scroller.clientHeight}px`);\n\t\t\t\t});'
  const ANCHOR_TO = 'seatObserver.current = new ResizeObserver((entries) => {\n\t\t\t\t\tvar dshSeatH = seatObserver.current.__dshSeatH, dshViewH = seatObserver.current.__dshViewH;\n\t\t\t\t\tfor (var di = 0; di < entries.length; di++) {\n\t\t\t\t\t\tvar dcr = entries[di].contentRect;\n\t\t\t\t\t\tif (!dcr) continue;\n\t\t\t\t\t\tif (entries[di].target === seat) { if (dshSeatH === void 0 || Math.abs(dcr.height - dshSeatH) > 0.5) { dshSeatH = dcr.height; } }\n\t\t\t\t\t\telse if (entries[di].target === scroller) { if (dshViewH === void 0 || Math.abs(dcr.height - dshViewH) > 0.5) { dshViewH = dcr.height; } }\n\t\t\t\t\t}\n\t\t\t\t\tvar dshSeatGo = dshSeatH !== void 0 && dshSeatH !== seatObserver.current.__dshSeatH;\n\t\t\t\t\tvar dshViewGo = dshViewH !== void 0 && dshViewH !== seatObserver.current.__dshViewH;\n\t\t\t\t\tif (dshSeatGo) { seatObserver.current.__dshSeatH = dshSeatH; scroller.style.setProperty("--dsh-composer-height", `${seat.offsetHeight}px`); }\n\t\t\t\t\tif (dshViewGo) { seatObserver.current.__dshViewH = dshViewH; scroller.style.setProperty("--dsh-conversation-viewport-height", `${scroller.clientHeight}px`); } // [dsh-desktop P3/T3-1d] 高度门:宽度-only 通知跳过读写\n\t\t\t\t});'
  const files = []
  const localConv = ['D:\\deepseek harness\\deepseek-harness\\packages\\client\\ui-conversation\\lib\\client.js',
    path.join(os.homedir(), 'deepseek-harness', 'packages', 'client', 'ui-conversation', 'lib', 'client.js')]
    .find((f) => fs.existsSync(f))
  if (localConv) files.push(localConv)
  const npxRoot = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), '.npm-cache'), 'npm-cache', '_npx')
  if (fs.existsSync(npxRoot)) {
    for (const h of fs.readdirSync(npxRoot)) {
      const nm = path.join(npxRoot, h, 'node_modules')
      if (!fs.existsSync(nm)) continue
      const walk = (d, depth) => {
        if (depth > 6) return
        let es
        try { es = fs.readdirSync(d, { withFileTypes: true }) } catch { return }
        for (const e of es) {
          const fp = path.join(d, e.name)
          if (e.isDirectory()) { if (e.name === '.bin') continue; walk(fp, depth + 1) } else if (e.name === 'client.js' && fp.includes('dsh-client-ui-conversation')) files.push(fp)
        }
      }
      walk(nm, 0)
    }
  }
  if (!files.length) return [{ file: 'ui-conversation/lib/client.js', missing: true }]
  const results = []
  for (const p of files) {
    const label = 'ui-conversation/lib/client.js@' + (p.includes('deepseek-harness') || p.includes('deepseek-harness') ? 'L' : path.basename(path.dirname(path.dirname(path.dirname(p))))).slice(0, 24)
    try {
      const cur = fs.readFileSync(p, 'utf8')
      if (cur.includes('[dsh-desktop P3/T3-1d]')) { results.push({ file: label, ok: true, already: true, version: 'p3hg' }); continue }
      const n = cur.split(ANCHOR_FROM).length - 1
      if (n !== 1) { results.push({ file: label, ok: false, failures: [`${label}: composer-height 锚点 matched ${n}, expected 1(上游漂移,保持现状)`], kept: true }); continue }
      const bak = p + '.bak-p3hg'
      if (!fs.existsSync(bak)) fs.writeFileSync(bak, cur, 'utf8')
      let patched = cur.split(ANCHOR_FROM).join(ANCHOR_TO)
      if (!patched.includes(PATCH_MARK)) patched += '\n' + PATCH_MARK + '\n'
      fs.writeFileSync(p, patched, 'utf8')
      results.push({ file: label, ok: true, already: false, version: 'p3hg' })
    } catch (e) {
      results.push({ file: label, ok: false, failures: [`${label}: ${e.message}`], kept: true })
    }
  }
  return results
}

function replayAll(log = () => {}) {
  const out = { ok: true, items: [] }
  for (const r of [...patchBetterSidebar(), ...patchBetterSidebarBrowserLinkNav(), ...patchBetterSidebarEmbedAllow(), ...patchPresentedCardRedirect(), ...patchPresentedMentionSidebar(), ...patchCommandContributionGuard(), ...patchSlashMenuGroupTitles(), ...patchSlashMenuGroupTitleWording(), ...patchNodeNav(), ...patchNodeNavHost(), ...patchTurnRewind(), ...patchEgoBrowserSettings(), ...patchEgoBrowserWorkerSpawn(), ...patchEgoBrowserCastWorker(), ...patchEgoBrowserWorkerSelfKill(), ...patchEgoBrowserUrlTargetRelease(), ...patchEgoBrowserHeadlessHost(), ...patchEgoBrowserHeadlessRuntime(), ...patchEgoBrowserHeadlessCopy(), ...patchSystemPromptPersona(), ...patchConversation(), ...patchEntrySmooth(), ...patchDshmarket(), ...patchSettingsInfoArch(), ...patchGitGraph(), ...patchPresets(), ...patchProfileSidebarDedup(), ...patchTurnReview(), ...patchJoiTheme(), ...patchVisionRouter(), ...patchVisionRouterPortal(), ...patchMobileGlassSw(), ...patchSettingsNest(), ...patchGeneralOtherV9(), ...patchSkinSubpages(), ...patchSkinSubpagesK10(), ...patchSkinSubpagesK11(), ...patchAgentTeamsTab(), ...patchPluginSettingsItemId(), ...patchMnemonProjection(), ...patchMnemonClockGate(), ...patchBetterSidebarClockGate(), ...patchConversationHeightGate(), ...patchNewSessionFallback(), ...patchWorkspaceNoPickEntry(), ...patchUngroupedGroupBlank(), ...patchSessionDeleteEntry(), ...patchHeroNoWorkspaceInert(), ...patchConversationPlusQuickActions(), ...patchBlankSessionDup(), ...patchSessionFormatV0Lenient(), ...patchModelSelectionSessionGone(), ...patchPiAiMergeConsecutiveMessages(), ...patchSessionTopicHoverCard(), ...patchRightbarDefaultRatio()]) {
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
