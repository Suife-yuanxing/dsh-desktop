// dsh-desktop 桌面集成插件:设置页的插件管理 tab(启停)与
// 人设/技能(含 MCP)/皮肤/更新四个独立设置区段。
// 与壳(127.0.0.1:30801)通信,读写经壳编排(home patch 热应用/更新/回滚)。
window.__ModuleLoader__.load({
	id: "dsh-desktop-version-tab",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");

		var SHELL_API = "http://127.0.0.1:30801";

		var css = [
			".pm_root{display:flex;flex-direction:column;gap:10px;padding:4px 0}",
			".pm_search{display:flex;align-items:center;gap:8px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:6px 10px}",
			".pm_search input{flex:1;background:transparent;border:none;outline:none;color:var(--dsw-alias-label-primary);font-size:13px}",
			".pm_row{display:flex;align-items:center;justify-content:space-between;gap:10px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:8px 12px}",
			".pm_rowOff{opacity:.62}",
			".pm_left{display:flex;flex-direction:column;gap:2px;min-width:0}",
			".pm_name{font-family:var(--dsw-font-mono);font-size:13px;color:var(--dsw-alias-label-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
			".pm_id{font-size:11px;color:var(--dsw-alias-label-tertiary)}",
			".pm_right{display:flex;align-items:center;gap:8px;flex-shrink:0}",
			".pm_tag{font-size:11px;color:var(--dsw-alias-label-tertiary)}",
			".pm_tagOn{color:#3fb950}.pm_tagOff{color:#f85149}.pm_tagSys{color:#d29922}.pm_tagErr{color:#f85149}",
			".pm_phase{font-size:11px;color:var(--dsw-alias-label-tertiary)}",
			".pm_phaseFailed{color:#f85149}",
			".pm_btn{background:var(--dsw-alias-fill-l2);color:var(--dsw-alias-label-primary);border:1px solid var(--dsw-alias-border-l2);border-radius:6px;padding:3px 12px;font-size:12px;cursor:pointer}",
			".pm_btn:hover{border-color:var(--dsw-alias-label-secondary)}",
			".pm_btnDis{border-color:#da3633;color:#f85149}",
			".pm_list{display:flex;flex-direction:column;gap:6px;max-height:52vh;overflow:auto}",
			".pm_msg{font-size:12px;color:var(--dsw-alias-label-tertiary);min-height:16px;word-break:break-all}",
			".pm_msgOk{color:#3fb950}.pm_msgErr{color:#f85149}",
			".pm_click{cursor:pointer}",
			".pm_detail{font-family:var(--dsw-font-mono);font-size:11px;color:var(--dsw-alias-label-secondary);background:rgba(127,127,127,.08);border-radius:6px;padding:6px 8px;margin-top:4px;word-break:break-all;white-space:pre-wrap}",
			".ps_txt{width:100%;min-height:180px;resize:vertical;background:transparent;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:8px 10px;color:var(--dsw-alias-label-primary);font-family:var(--dsw-font-mono);font-size:12px;line-height:1.6;box-sizing:border-box;outline:none}",
			".ps_txt:focus{border-color:var(--dsw-alias-label-secondary)}",
			".ps_btns{display:flex;gap:8px;align-items:center}",
			".sk_code{background:rgba(127,127,127,.08);border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:8px 10px;font-family:var(--dsw-font-mono);font-size:11px;white-space:pre;overflow:auto;color:var(--dsw-alias-label-secondary);margin:0}",
			".skn_row{display:flex;align-items:center;justify-content:space-between;gap:10px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:8px 12px;cursor:pointer}",
			".skn_row:hover{border-color:var(--dsw-alias-label-secondary)}",
			".skn_cur{border-color:#238636}",
			".sec_h{font-size:13px;font-weight:600;color:var(--dsw-alias-label-primary);margin:10px 0 0}",
			".cm_h2{font-size:13px;font-weight:600;color:var(--dsw-alias-label-primary);margin:14px 0 2px}",
			".cm_row{display:flex;align-items:center;gap:12px;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;padding:10px 14px}",
			".cm_rowOff{opacity:.55}",
			".cm_icon{width:32px;height:32px;border-radius:8px;flex-shrink:0;display:flex;align-items:center;justify-content:center;background:rgba(127,127,127,.12);color:var(--dsw-alias-label-secondary);font-size:14px;font-weight:600}",
			".cm_main{display:flex;flex-direction:column;gap:3px;min-width:0;flex:1}",
			".cm_titleRow{display:flex;align-items:center;gap:8px;min-width:0}",
			".cm_name{font-size:13px;font-weight:500;color:var(--dsw-alias-label-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
			".cm_src{font-size:11px;color:var(--dsw-alias-label-tertiary);background:rgba(127,127,127,.1);border-radius:99px;padding:1px 8px;flex-shrink:0;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
			".cm_desc{font-size:12px;color:var(--dsw-alias-label-secondary);line-height:1.5;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}",
			".cm_side{display:flex;align-items:center;gap:10px;flex-shrink:0}",
			".cm_del{display:flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:7px;border:none;background:transparent;color:var(--dsw-alias-label-tertiary);cursor:pointer;padding:0}",
			".cm_del:hover{background:rgba(248,81,73,.12);color:#f85149}",
			".cm_del svg{width:15px;height:15px;display:block}",
			".cm_sw{position:relative;width:38px;height:22px;border-radius:11px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-fill-l2);cursor:pointer;padding:0;transition:background .18s,border-color .18s;flex-shrink:0}",
			".cm_swDot{position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.25);transition:transform .18s cubic-bezier(.32,.72,0,1)}",
			".cm_swOn{background:#d97757;border-color:#d97757}",
			".cm_swOn .cm_swDot{transform:translateX(18px)}",
			".cm_sw:disabled{opacity:.5;cursor:default}",
			".cm_confirm{display:flex;align-items:center;gap:8px;margin-top:2px;flex-wrap:wrap}",
			".cm_confirmTxt{font-size:12px;color:#f85149}",
			".cm_btnDanger{background:transparent;border:1px solid #da3633;color:#f85149;border-radius:6px;padding:3px 10px;font-size:12px;cursor:pointer}",
			".cm_btnDanger:hover{background:rgba(248,81,73,.1)}",
			".cm_btnGhost{background:transparent;border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);border-radius:6px;padding:3px 10px;font-size:12px;cursor:pointer}",
			".cm_mini{display:flex;align-items:center;gap:8px;border:1px dashed var(--dsw-alias-border-l2);border-radius:8px;padding:6px 12px;font-size:12px;color:var(--dsw-alias-label-secondary)}",
			".cm_miniName{font-size:12px;color:var(--dsw-alias-label-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
			".cm_count{font-size:12px;color:var(--dsw-alias-label-tertiary)}",
			".sk_thumb{width:52px;height:52px;border-radius:8px;object-fit:cover;flex-shrink:0;border:1px solid var(--dsw-alias-border-l2);background:rgba(127,127,127,.08)}",
			".sk_thumbW{width:76px;height:52px}",
			".cm_side input[type=range]{width:110px;accent-color:#d97757;cursor:pointer}",
			// ---- 设置页统一版式(重绘:页头 + 卡片分组 + 行/控件精化) ----
			// [R42] max-width 760→none:面板已统一加宽到 1180px(与插件市场同宽),内容区随宽填充
			// [R43] 宽幅重排版:flex 单列 → 双列网格:页头/跨栏项(vt_span)/消息/按钮行整行,
			// 其余分组卡片两两并排(皮肤页入口卡/效果卡/资产卡);窄屏(<840px)回落单列。
			".vt_page{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;align-items:start;max-width:none}",
			".vt_page>.vt_head,.vt_page>.vt_span,.vt_page>.pm_msg,.vt_page>.ps_btns{grid-column:1/-1}",
			// [R43] 行卡列表两列化(技能/MCP/插件管理/更新行卡):auto-fill 窄屏自动单列
			".vt_2col{display:grid!important;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:8px;align-items:start}",
			".vt_2col>.pm_msg{grid-column:1/-1}",
			"@media (max-width:840px){.vt_page{grid-template-columns:minmax(0,1fr)}}",
			".vt_head{display:flex;flex-direction:column;gap:4px;padding:2px 2px 0}",
			// ---- [问题74] 技能页 Skill/MCP 分段标签:Claude 式胶囊分段控件 ----
			".sk_tabs{display:flex;gap:6px;padding:4px;border-radius:12px;background:var(--dsw-alias-fill-l2);width:max-content}",
			".sk_tab{border:1px solid transparent;background:transparent;border-radius:8px;padding:6px 20px;font-size:13px;font-weight:600;color:var(--dsw-alias-label-secondary);cursor:pointer;transition:background .15s ease,color .15s ease,border-color .15s ease}",
			".sk_tab:hover{color:var(--dsw-alias-label-primary)}",
			".sk_tabOn{background:var(--dsw-alias-bg-module-platform,#fff);border-color:var(--dsw-alias-border-l2);color:#d97757;box-shadow:0 1px 4px rgba(0,0,0,.08)}",
			// ---- [问题79] 插件市场批量下载队列:卡片注入按钮 + 固定队列坞 ----
			".mqAdd{background:transparent;color:var(--dsw-alias-label-secondary);border:1px dashed var(--dsw-alias-border-l2);border-radius:6px;padding:3px 8px;font-size:12px;cursor:pointer;margin-right:6px;transition:border-color .15s,color .15s}",
			".mqAdd:hover{border-color:var(--dsw-alias-label-secondary);color:var(--dsw-alias-label-primary)}",
			".mqAddOn{border-style:solid;border-color:#3fb950;color:#3fb950}",
			".mq_dock{position:fixed;right:18px;bottom:18px;width:336px;z-index:99999;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;background:rgba(255,255,255,.94);background:light-dark(rgba(255,255,255,.94),rgba(23,25,31,.94));backdrop-filter:blur(16px) saturate(1.3);-webkit-backdrop-filter:blur(16px) saturate(1.3);box-shadow:0 8px 30px rgba(0,0,0,.18);font-size:12px;overflow:hidden}",
			".mq_head{display:flex;align-items:center;gap:6px;padding:9px 12px;border-bottom:1px solid var(--dsw-alias-border-l2)}",
			".mq_title{font-weight:600;color:var(--dsw-alias-label-primary);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
			".mq_hbtn{border:none;background:transparent;color:var(--dsw-alias-label-tertiary);cursor:pointer;font-size:11px;padding:2px 6px;border-radius:6px}",
			".mq_hbtn:hover{background:rgba(127,127,127,.12);color:var(--dsw-alias-label-primary)}",
			".mq_list{max-height:38vh;overflow:auto;padding:6px}",
			".mq_item{display:flex;align-items:center;gap:8px;padding:7px 8px;border-radius:8px}",
			".mq_item:hover{background:rgba(127,127,127,.07)}",
			".mq_main{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}",
			".mq_nm{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-primary);font-size:12px}",
			".mq_sub{font-size:11px;color:var(--dsw-alias-label-tertiary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
			".mq_subErr{color:#f85149}",
			".mq_badge{flex-shrink:0;font-size:11px;border-radius:99px;padding:1px 8px;border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);white-space:nowrap}",
			".mq_bWait{color:#d29922;border-color:rgba(210,153,34,.5)}",
			".mq_bRun{color:#58a6ff;border-color:rgba(88,166,255,.5)}",
			".mq_bDone{color:#3fb950;border-color:rgba(63,185,80,.5)}",
			".mq_bFail{color:#f85149;border-color:rgba(248,81,73,.5)}",
			".mq_x{border:none;background:transparent;color:var(--dsw-alias-label-tertiary);cursor:pointer;padding:2px 5px;border-radius:5px;font-size:12px;flex-shrink:0}",
			".mq_x:hover{background:rgba(248,81,73,.12);color:#f85149}",
			".vt_h2{margin:0;font-size:18px;font-weight:600;line-height:26px;color:var(--dsw-alias-label-primary)}",
			".vt_intro{margin:0;font-size:13px;line-height:1.6;color:var(--dsw-alias-label-tertiary)}",
			".vt_card{border:1px solid var(--dsw-alias-border-l2);border-radius:12px;padding:14px 16px;display:flex;flex-direction:column;gap:10px;background:var(--dsw-alias-bg-layer-1)}",
			".vt_group{display:flex;flex-direction:column;gap:8px}",
			".vt_groupTitle{font-size:12px;font-weight:600;color:var(--dsw-alias-label-secondary);padding:0 2px;letter-spacing:.02em}",
			".pm_row,.cm_row{border-radius:10px;transition:border-color .15s ease,background .15s ease}",
			".pm_row:hover,.cm_row:hover{border-color:var(--dsw-alias-label-tertiary)}",
			".pm_btn{border-radius:7px;transition:background .15s,border-color .15s,color .15s}",
			".ps_txt{border-radius:10px;line-height:1.7;transition:border-color .15s,box-shadow .15s}",
			".ps_txt:focus{border-color:#d97757;box-shadow:0 0 0 3px rgba(217,119,87,.14)}",
			// [R46] 操作按钮右对齐(人设保存/技能等表单底部);窄屏回落左对避免溢出
			".ps_btns{justify-content:flex-end}",
			"@media (max-width:840px){.ps_btns{justify-content:flex-start}}",
			".pm_search{border-radius:10px;transition:border-color .15s,box-shadow .15s}",
			".pm_search:focus-within{border-color:#d97757;box-shadow:0 0 0 3px rgba(217,119,87,.12)}",
			// ---- [R20→R47] 动效令牌兜底单一来源(better-sidebar 补丁冲掉时仍有效) ----
			// [R47] 节奏统一 300→240ms ease-out(用户要求 180-250ms);Claude 曲线即强 ease-out,
			// 保留曲线不变只提速,侧栏/中列/entry 全部随令牌同步。
			":root{--dsh-bsr-slide-duration:240ms;--dsh-bsr-slide-ease:cubic-bezier(.32,.72,0,1)}",
			"#root > div[data-slot=\"root\"] > div{transition:grid-template-columns var(--dsh-bsr-slide-duration) var(--dsh-bsr-slide-ease)!important}",
			// ---- [R20] 中栏三视图(任务/SSH/记忆)显隐过渡:与侧栏 300ms 同节奏(此前 .2s 与 frame grid .3s 不一致);
			// translateY 弱化为 4px 减少与 layout 过渡的合成层竞争 ----
			"@keyframes dshVtViewIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}",
			"html[data-dsh-taskboard-active]:not([data-dsh-ssh-active]) [data-dsh-taskboard-view],html[data-dsh-ssh-active]:not([data-dsh-taskboard-active]) [data-dsh-ssh-view],html[data-dsh-mnemon-active]:not([data-dsh-taskboard-active]):not([data-dsh-ssh-active]) [data-dsh-mnemon-view]{animation:dshVtViewIn .3s var(--dsh-bsr-slide-ease);z-index:61!important}",
			// [问题68永久修复] 顶部安全区统一补偿(令牌单一事实来源=壳 TITLEBAR_CONTROLS_CSS):
			// 壳自绘窗口控件 #dsh-desktop-win-controls 是 fixed 右上浮层,凡顶到窗口上沿的
			// 视图(absolute inset:0 或贴顶 header)必须预留安全区,否则其顶栏/按钮钻进控件区。
			// 壳以 insertCSS 发布 --dsh-titlebar-safe(控件高+间隙)/--dsh-titlebar-safe-right
			// (右侧占位+间隙),永与控件几何同版;本层以 max(硬底线,var(…)) 消费——
			// 硬底线兼容无令牌的旧壳(控件 36px 时代),未来控件改几何令牌自动同步。
			// 覆盖面:① 三模块视图(任务看板/SSH/记忆,inset:0 满铺)
			//        ② 聊天页中列 header(标题行右端伸入控件区)
			//        ③ better-sidebar 右侧面板(tabBar y=0 顶天 + toggleCluster 钉在控件正上)
			"html[data-dsh-taskboard-active] [data-dsh-taskboard-view],html[data-dsh-ssh-active] [data-dsh-ssh-view],html[data-dsh-mnemon-active] [data-dsh-mnemon-view]{padding-top:max(44px,var(--dsh-titlebar-safe,44px))!important;box-sizing:border-box!important}",
			// 视图内滚动容器若 height:100% 会被 padding 挤出 → max-height 同步令牌兜底
			"html[data-dsh-taskboard-active] [data-dsh-taskboard-view]>*:first-child,html[data-dsh-ssh-active] [data-dsh-ssh-view]>*:first-child,html[data-dsh-mnemon-active] [data-dsh-mnemon-view]>*:first-child{max-height:calc(100% - max(44px,var(--dsh-titlebar-safe,44px)))!important}",
			// ② 聊天页中列 header:只做水平预留(标题行 y=12-44 与控件垂直同带,但右端
			// 止于 vw-100 后不再与控件 x 区间相交);不动垂直方向保住既有布局与拖拽区
			"header[class*=\"_header\"]{padding-right:max(78px,var(--dsh-titlebar-safe-right,100px))!important}",
			// ③ better-sidebar 右侧面板:面板根顶部内边距使 tabBar/搜索框统一下移出控件区
			// (:has(panelResize 直接子层)精确锁定该面板,不误伤设置面板等 _panel);
			// toggleCluster 原 absolute top:3/right:10 正压在控件上 → 横移到安全线外;
			// [问题93→95] 右距底线公式:驱动令牌已不再发布(钉链废弃内容测量改常量底线),
			// max(…,96px) 恒取 96px——与新建参照页像素一致,两页类型/开闭态/刷新重启恒不变。
			"[class*=\"_panel\"]:has(> [class*=\"panelResize\"]){padding-top:max(44px,var(--dsh-titlebar-safe,44px))!important;box-sizing:border-box!important}",
			"[class*=\"toggleCluster\"]{right:max(var(--dsh-bsr-cluster-right,96px),96px)!important}",
			// ---- [问题2] 侧栏 entry 行(任务看板/SSH/记忆)收起态平滑化:与原生项同节奏 ----
			// 插件自身用 display:none 硬切 label + padding 瞬变,与原生侧栏项的渐变收起不一致。
			"[data-dsh-frame] .entry{transition:padding var(--dsh-bsr-slide-duration) var(--dsh-bsr-slide-ease),width var(--dsh-bsr-slide-duration) var(--dsh-bsr-slide-ease)!important}",
			"[data-dsh-frame] .entryLabel{transition:opacity .25s var(--dsh-bsr-slide-ease)!important}",
			// ---- [R22→R27→问题52→问题58→b13问题2] node-nav 圆点:仅聊天流页面显示 + 贴留白沟 ----
			// 问题52 恒 left:68px 在侧栏展开(280px)时落入侧栏内部与工作区列表重叠;
			// 改由 installSidebarDotSync 按聊天内容区实时左缘 JS 定位(left/transform 留空),
			// CSS 只管可见性;可见性再以 body.dsh-vt-chatflow-on 门控——SSH/记忆/任务看板等
			// 无可见 chat-flow 的页面恒隐藏,不沿用聊天页坐标误显示。
			".dsh-node-nav-rail{transition:opacity .22s ease,visibility .22s ease!important}",
			// [问题45] 空心灰圈风格(用户图2基准):插件基底 background:#fff + box-shadow 白晕
			// 在壁纸上呈白色残影——改透明底 + label-tertiary 令牌描边(深浅色自适应),
			// active 保留橙实心+呼吸光晕维持当前位辨识度。
			".dsh-node-nav-dot{width:8px!important;height:8px!important;background:transparent!important;border:1.5px solid var(--dsw-alias-label-tertiary)!important;box-shadow:none!important;opacity:.6;transition:transform .22s cubic-bezier(.34,1.4,.64,1),background .18s ease,box-shadow .18s ease,border-color .18s ease,opacity .18s ease!important}",
			".dsh-node-nav-dot:hover{opacity:1;transform:scale(1.3)!important;border-color:var(--dsw-alias-label-secondary)!important}",
			".dsh-node-nav-dot-active{opacity:1!important;background:rgba(217,119,87,.98)!important;border-color:#d97757!important;box-shadow:0 0 0 3px rgba(217,119,87,.18),0 0 0 6px rgba(217,119,87,.08)!important;animation:dshVtDotBreath 4s ease-in-out infinite}",
			"@keyframes dshVtDotBreath{0%,100%{box-shadow:0 0 0 3px rgba(217,119,87,.18),0 0 0 6px rgba(217,119,87,.08)}50%{box-shadow:0 0 0 4px rgba(217,119,87,.24),0 0 0 8px rgba(217,119,87,.1)}}",
			".dsh-node-nav-dot-unloaded{opacity:.35!important;border-style:dashed!important}",
			".dsh-node-nav-line{opacity:.3;transition:opacity .2s ease}",
			".dsh-node-nav-rail:hover .dsh-node-nav-line{opacity:.85}",
			".dsh-node-nav-bottom{opacity:.6;background:transparent!important;border-color:var(--dsw-alias-label-tertiary)!important;box-shadow:none!important;transition:transform .22s cubic-bezier(.34,1.4,.64,1),background .18s ease,box-shadow .18s ease,border-color .18s ease,opacity .18s ease!important}",
			".dsh-node-nav-bottom::after{border-color:var(--dsw-alias-label-tertiary)!important}",
			".dsh-node-nav-bottom:hover{opacity:1;background:transparent!important;border-color:#d97757!important}",
			// ---- [问题93] better-sidebar 入口 Claude 风卡片化:双钮包进圆角胶囊卡片 ----
			// (令牌色自适应亮/暗主题;几何定位由 installSidebarEntryPin 驱动,右距写在行内/令牌)
			'[class*="_toggleCluster"]{background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l2);border-radius:10px;box-shadow:0 4px 12px rgba(0,0,0,.10),0 1px 3px rgba(0,0,0,.06);padding:3px;transition:right .3s cubic-bezier(.32,.72,0,1),background .15s ease,border-color .15s ease}',
			'[class*="_toggleCluster"] button{border-radius:7px;transition:background .15s ease}',
			'[class*="_toggleCluster"] button:hover{background:var(--dsw-alias-fill-l2)}',
			// [R27→问题58→b13问题2] 可见性:仅当 body 挂 dsh-vt-chatflow-on(installSidebarDotSync
			// 判定存在可见 [data-chat-flow])时显示;left 不写死——由 railSyncPos 按聊天内容区
			// 实时左缘 JS 定位(含过渡期逐帧跟随)。判定类缺失时安全态=不可见(默认隐藏方向)。
			".dsh-node-nav-rail{opacity:1!important;visibility:visible!important;pointer-events:auto!important}",
			// [b13问题2] 非聊天页门控:SSH/记忆系统/任务看板等页 chat-flow 摘除或 0×0,
			// rail/miss 一并淡出,不沿用聊天页坐标残显(特异性 0,2,1 胜过恒开规则,双 !important 按特异性决胜)
			"body:not(.dsh-vt-chatflow-on) .dsh-node-nav-rail,body:not(.dsh-vt-chatflow-on) .dsh-node-nav-miss{opacity:0!important;visibility:hidden!important;pointer-events:none!important}",
			// ---- [R22] 边界:窄屏隐藏 rail;reduced-motion 全关动效 ----
			"@media (max-width:900px){.dsh-node-nav-rail{display:none!important}}",
			"@media (prefers-reduced-motion:reduce){#root > div[data-slot=\"root\"] > div{transition:none!important}html[data-dsh-taskboard-active] [data-dsh-taskboard-view],html[data-dsh-ssh-active] [data-dsh-ssh-view],html[data-dsh-mnemon-active] [data-dsh-mnemon-view]{animation:none!important}.dsh-node-nav-dot-active{animation:none!important}.dsh-node-nav-dot,.dsh-node-nav-bottom,.dsh-node-nav-rail,.dsh-node-nav-line{transition:none!important}}",
			// ---- [问题1] 设置导航统一入口:隐藏「皮肤中心」「宠物」独立导航项 ----
			// (内容保留可激活,皮肤页入口卡编程 click 隐藏项跳转;data-section-id 由 installSettingsNavPatch 注入)
			"button[data-section-id=\"skin-center\"],button[data-section-id=\"pet\"]{display:none!important}",
			// ---- [R29] 移除聊天框上方 git 分支 chip(分离 HEAD):侧边栏 Git 面板已有同类信息 ----
			// 兜底层:patches.cjs [I] 段已让 BranchChip 不再入 DOM;此规则防插件升级后补丁锚点失配时 chip 复现。
			"[data-gitgraph-chip-anchor]{display:none!important}",
			// ---- [R32] 设置页重构:导航分组标签 + 导航/section 视觉统一 ----
			// 分组标签(通用/对话/外观/扩展/系统):小号大写字距标题,由 installSettingsNavPatch 注入。
			".dsh-vt-nav-group{display:flex;align-items:center;padding:14px 12px 5px 12px;font-size:11px;font-weight:600;letter-spacing:.08em;color:var(--dsw-alias-label-tertiary,#9a9a9a);user-select:none;cursor:default}",
			".dsh-vt-nav-group:first-child{padding-top:6px}",
						// [问题83] 规范序地基:设置导航的显示顺序由 dshvt 规范序(flex order)接管,
						// 与上游 DOM 序解耦——market 注册 order=40 被上游排到 updates 之后(落进
						// 系统组),且第三方 section 注册时机随客户端 bundle 加载竞态浮动。navList
						// 本就是 flex column,此处双保险钉死;未标记项(无 data-section-id)不受影响。
						'[class*="_navList"]:has(> button[data-section-id]){display:flex!important;flex-direction:column!important}',
			// [问题 48→需求修正] 会话摘要直接作为会话主题(标题)展示,不再用副标题行;
			// 保留的 :has 规则仅用于清理旧副标题时的换行复位。
			// 导航项统一:圆角 8 + hover/激活过渡 Claude 曲线(语义后缀 _navCell 稳定,哈希前缀随构建浮动)
			'[class*="_navCell"]{border-radius:8px!important;transition:background .2s cubic-bezier(.32,.72,0,1),color .2s cubic-bezier(.32,.72,0,1)!important}',
			'[class*="_navList"]{gap:2px}',
			// section 内容区卡片统一:settings.section 作用域内常见卡片/行容器圆角与边框节奏
			'[data-slot="settings.section"] [class*="_card"]{border-radius:10px!important}',
			'[data-slot="settings.section"] [class*="_row"]{border-radius:8px!important}',
			// ---- [问题4] 提示词增强按钮已拆出为独立插件 dsh-enhance-prompt(2026-08),样式/组件随之迁出 ----
			// ---- [需求] 目录选择器盘符行(「选择工作区目录」标题/面包屑下方) ----
			".dsh-vt-drives{display:flex;align-items:center;gap:6px;flex-wrap:wrap;padding:2px 2px 4px}",
			".dsh-vt-drive{display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary);font-family:var(--dsw-font-mono);font-size:12px;cursor:pointer;transition:border-color .15s ease,color .15s ease,background .15s ease}",
			".dsh-vt-drive:hover{border-color:var(--dsw-alias-label-tertiary);color:var(--dsw-alias-label-primary)}",
			".dsh-vt-driveActive{border-color:#d97757;color:#d97757}",
			".dsh-vt-drive svg{width:12px;height:12px;display:block;opacity:.75}",
			// ---- [R39→R42] 设置面板统一宽幅:全部区段与插件市场同宽(1180px) ----
			// R39 原仅市场激活时加宽(800px 面板内容区 564px,上游 auto-fill minmax(280px) 只能单列,
			// 加宽后同网格规则自然出 3 列);R42 按需求把其他设置页模块尺寸与市场同步——
			// :has(button[data-section-id]) 在设置面板打开且导航已标记时恒成立(问题40 微任务同步标记),
			// 全部区段统一 min(1180px,96vw),市场↔其他区段切换不再有 800↔1180 跳变。
			// 面板是 overlay flex 子项:flex 项的主轴尺寸由 flex-basis 决定(width 被 flex-basis
			// 盖过——实测 width!important 无效),须双设(问题51)。
			'div[role="dialog"]:has(button[data-section-id]){width:min(1180px,96vw)!important;flex-basis:min(1180px,96vw)!important;flex-shrink:1!important}',
			'div[role="dialog"]:has(button[data-section-id="market"][class*="_active"]) [class*="_grid"]{gap:14px}',
			'div[role="dialog"]:has(button[data-section-id="market"][class*="_active"]) [class*="_card"]{border-radius:14px;transition:border-color .18s ease,box-shadow .18s ease}',
			'div[role="dialog"]:has(button[data-section-id="market"][class*="_active"]) [class*="_card"]:hover{border-color:var(--dsw-alias-label-tertiary);box-shadow:0 6px 18px rgba(0,0,0,.07)}',
			// 社区 tab 列表多列化(patches.cjs 注入的 dshm-cm_* 稳定类;高卡等高对齐)
			'.dshm-cm_list{display:grid!important;grid-template-columns:repeat(auto-fill,minmax(300px,1fr))!important;gap:10px}',
			'.dshm-cm_row{height:100%}',
			// ---- [问题84] 移除重复的"用户插件展示"tab(family-plugins) ----
			// web-ui-all 家族 plugin-manager 子包在「插件」区段注册了 family-plugins tab,
			// 标签与 dshvt 官方「插件管理」tab 同名同位,内容(用户插件清单)被双重覆盖:
			// 启停=插件管理 tab(pluginInventory 全量清单),安装/更新/卸载=插件市场
			// 「已安装」tab(实测同屏具备)——纯冗余展示入口。仅展示层移除(display:none):
			// 不动 loader 注册/插件加载,市场与管理 tab 的启停/卸载链路完整保留。
			// 寻址:React useId 前缀(:rX:)随会话浮动,用 id 后缀锚定;面板同隐防"选中态
			// 持久化后 tab 不见只剩空面板";若家族升级改后缀此规则静默失效(安全降级)。
			'[id$="-tab-family-plugins"]{display:none!important}',
			'.pbvGtq_panel[id$="-panel-family-plugins"]{display:none!important}',
			// ---- [R44] 侧边栏浏览器:右侧滑出面板(地址栏/搜索 + iframe 经壳 /browse 代理) ----
			".dsh-vt-browser{position:fixed;top:44px;right:12px;bottom:12px;width:min(560px,62vw);z-index:59;display:flex;flex-direction:column;border-radius:12px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);box-shadow:0 12px 40px rgba(0,0,0,.28);transform:translateX(106%);opacity:0;pointer-events:none;transition:transform .22s ease-out,opacity .22s ease-out}",
			".dsh-vt-browserOpen{transform:none!important;opacity:1!important;pointer-events:auto!important}",
			".dsh-vt-browser-bar{display:flex;align-items:center;gap:6px;padding:8px 10px;border-bottom:1px solid var(--dsw-alias-border-l2);flex:none}",
			".dsh-vt-browser-btn{display:flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:8px;border:1px solid var(--dsw-alias-border-l2);background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;flex:none;transition:background .15s ease,border-color .15s ease}",
			".dsh-vt-browser-btn:hover{border-color:var(--dsw-alias-label-tertiary);color:var(--dsw-alias-label-primary)}",
			".dsh-vt-browser-btn:disabled{opacity:.4;cursor:default}",
			".dsh-vt-browser-btn svg{width:14px;height:14px;display:block}",
			".dsh-vt-browser-addr{flex:1;min-width:0;height:28px;padding:0 10px;border-radius:8px;border:1px solid var(--dsw-alias-border-l2);background:transparent;color:var(--dsw-alias-label-primary);font-size:12px;outline:none;transition:border-color .15s ease,box-shadow .15s ease}",
			".dsh-vt-browser-addr:focus{border-color:#d97757;box-shadow:0 0 0 3px rgba(217,119,87,.12)}",
			".dsh-vt-browser-frame{flex:1;width:100%;border:none;background:#fff;border-radius:0 0 12px 12px}",
			".dsh-vt-browser-status{flex:none;padding:4px 12px;font-size:11px;color:var(--dsw-alias-label-tertiary);border-top:1px solid var(--dsw-alias-border-l2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
			// 乐观回显气泡 pending 脉冲:明确"发送中"状态,区别于残留元素
			"@keyframes dshVtEchoPulse{0%,100%{opacity:.85}50%{opacity:.55}}",
			// ---- [R43] 非市场区段第三方 section 宽幅重排版 ----
			// 面板加宽到 1180px 后,上游/第三方 section 自带 720/760px 窄幅上限(models/memory/
			// agent-preset/sidebar-card/plugins),内容挤在左侧留大片空白。语义后缀寻址(哈希前缀
			// 随构建浮动,同 R32 navCell 手法);:not(:has(market active)) 排除市场(有专属 3 列排版)。
			(function () {
				var NM = 'div[role="dialog"]:not(:has(button[data-section-id="market"][class*="_active"]))';
				return [
					// 1) section 根解除窄幅上限,随内容区(992px)填充
					NM + ' [data-slot="settings.section"]>[class*="_section"],'
					+ NM + ' [data-slot="settings.section"]>[class*="_page"],'
					+ NM + ' [data-slot="settings.section"]>[class*="_sectionList"]{max-width:none!important}',
					// 2) 通用页行栈两列(行卡自适应;分组盒整行)
					NM + ' [data-slot="settings.general.item"]{display:grid!important;grid-template-columns:repeat(auto-fit,minmax(400px,1fr));gap:10px;align-items:start}',
					NM + ' [data-slot="settings.general.item"]>[class*="_group"]{grid-column:1/-1}',
					// 3) 模型页供应商行卡两列(UL._rows > LI._rowCard)
					NM + ' [class*="_rows"]{display:grid!important;grid-template-columns:repeat(auto-fill,minmax(360px,1fr));gap:10px;align-items:start;list-style:none;margin:0;padding:0}',
					// 4) Agent 预设卡片两列(UL._cards)
					NM + ' [class*="_cards"]{display:grid!important;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:10px;list-style:none;margin:0;padding:0}',
					// 5) Web UI 插件项两列(slot 容器上游 display:contents,改 grid 接管子项)
					NM + ' [data-slot="web-ui.plugin.item"]{display:grid!important;grid-template-columns:repeat(auto-fill,minmax(360px,1fr));gap:10px;align-items:start}',
					// 6) 记忆系统:供应商清单两列 + 选项格随宽出列
					NM + ' [class*="_providerList"]{display:grid!important;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:8px}',
					NM + ' [class*="_choiceGrid"]{grid-template-columns:repeat(auto-fill,minmax(280px,1fr))!important}',
					// 7) 侧边卡片格子随宽出列
					NM + ' [class*="_grid"]{grid-template-columns:repeat(auto-fill,minmax(220px,1fr))!important}'
				].join("");
			})(),
			// ---- [R43] 皮肤中心/宠物页返回按钮(导航项已隐藏,经皮肤页入口卡进入后无路返回) ----
			".vt_backBar{display:inline-flex;align-items:center;gap:6px;width:fit-content;margin:2px 2px 10px;padding:5px 14px;border:1px solid var(--dsw-alias-border-l2);border-radius:99px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);font-size:12px;cursor:pointer;user-select:none;transition:border-color .15s ease,color .15s ease,background .15s ease}",
			".vt_backBar:hover{border-color:#d97757;color:#d97757}",
			".vt_backBar:focus-visible{outline:2px solid rgba(217,119,87,.5);outline-offset:2px}",
			".vt_backBar svg{display:block}",
			// [R47→问题62] 全局过渡统一(180-250ms ease-out)
			// 设置弹窗入场:**禁用 transform 动画**——transform 会创建包含块,曾把
			// absolute 面板钉在 overlay(0,0)(问题62);纯 opacity 淡入保留入场感。
			"@keyframes dshVtDialogIn{from{opacity:0}to{opacity:1}}",
			'div[role="dialog"]{animation:dshVtDialogIn .2s ease-out}',
			"[data-composer-card] div[role=\"dialog\"]{animation:none!important;opacity:1!important}",
			// [问题95] 上下文计量弹层豁免:它也是 div[role="dialog"](在 composer 内),窗口隐藏/
			// 后台态下 dshVtDialogIn 动画冻结在 opacity:0,点圆钮弹层"出现但全透明",
			// 用户表现为位置错位/不显示。显式豁免(动画摘除+强制不透明),不受冻结影响。
			// [问题62] 设置弹窗打开时解除侧栏列裁剪(fixed overlay 被 sidebarCol/frame
			// 的 overflow:hidden 裁得全屏不可见);弹窗打开时侧栏无动画,解除安全。
			'html.dsh-vt-settings-open div[class*="_sidebarCol"],html.dsh-vt-settings-open div[class*="_frame"]{overflow:visible!important}',
			// 设置内模块切换:section 内容挂载时淡入上移(React 切区段卸载旧挂载新,动画仅挂载时播)
			"@keyframes dshVtSectionIn{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:none}}",
			'[data-slot="settings.section"]>*{animation:dshVtSectionIn .2s ease-out}',
			// 皮肤背景层切换淡入(applySkinVisual 换媒体时);弹窗遮罩淡入
			"#dsh-vt-bg-layer{animation:dshVtSectionIn .25s ease-out}",
			// reduced-motion 关闭新增动画
			"@media (prefers-reduced-motion:reduce){div[role=dialog],[data-slot=settings.section]>*,#dsh-vt-bg-layer{animation:none!important}}",
			// ---- [b13问题1/3] 交互与定位兜底(级联最后一道防线) ----
			// 玻璃 ::after 装饰层只能作用于伪元素;若选择器误拼接(或第三方同类注入)把
			// pointer-events:none / position:absolute inset:0 挂到表面本体,设置面板会"透明不可点"、
			// composer 被压扁失联——无论玻璃开关/皮肤/主题何态,此处恒保表面可交互与原生定位。
			'div[role="dialog"][class*="_panel"],[data-composer-card]{pointer-events:auto!important}',
			"[data-composer-card]{position:relative!important;inset:auto!important}"
		].join("");
		var tagId = "dsh-desktop-version-tab/style";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			var tag = document.createElement("style");
			tag.dataset.plugin = "dsh-desktop-version-tab";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}

		function api(path, opts) {
			return fetch(SHELL_API + path, opts).then(function (r) { return r.json(); });
		}

		var NS2 = "dshDesktop.pluginMgr";
		var NS3 = "dshDesktop.persona";
		var NS4 = "dshDesktop.skills";
		var NS6 = "dshDesktop.skin";
		var NS7 = "dshDesktop.update";
		var NS8 = "dshDesktop.webUiPlugins";

		var PHASE_ZH = { pending: "待定", loading: "加载中", active: "运行中", failed: "失败", unloading: "卸载中", unobserved: "未观察" };

		function shortName(moduleName) {
			var s = moduleName || "";
			if (s.charAt(0) === "@") s = s.slice(s.indexOf("/") + 1);
			s = s.replace(/^cordis:/, "").replace(/^cordis-plugin-/, "").replace(/^dsh-(host-|client-)?/, "");
			return s;
		}

		// remote list 的 entryId 是全路径 id("include:<行id>",嵌套更深时继续级联 ":")。
		// home patch 只能寻址组合顶层的行 id:剥掉 "include:" 后,随机 8 位 hex 是
		// 运行时动态挂载的行(timer/hmr watch-only 等),再含 ":" 的是预设/子树内嵌套行,
		// 二者均无稳定行 id 可写,统一不可管理。
		function patchIdOf(entryId) {
			if (typeof entryId !== "string" || entryId.indexOf("include:") !== 0) return null;
			var id = entryId.slice(8);
			if (/^[0-9a-f]{8}$/.test(id)) return null;
			if (id.indexOf(":") >= 0) return null;
			return id;
		}

		// 插件管理 tab(合并原"插件列表"的信息与启停能力):
		// 运行时清单来自 ctx.remote.pluginInventory(host 只读投影),
		// 持久禁用集来自壳 30801(读写 ~/.dsh/cordis.patch.yml,dsh watcher 热应用)。
		// 点击条目展开完整模块名/路径 id/运行状态(吸收只读清单视图)。
		function PluginManagerTab(props) {
			var h = react.createElement;
			var state = react.useState({ status: "loading" });
			var setState = state[1];
			var busy = react.useState(null);
			var setBusy = busy[1];
			var msg = react.useState("");
			var setMsg = msg[1];
			var query = react.useState("");
			var setQuery = query[1];
			var expanded = react.useState(null);

			var load = function () {
				return Promise.all([props.list(), api("/plugins")]).then(function (r) {
					setState({ status: "ready", entries: (r[0] && r[0].entries) || [], shell: r[1] });
				}).catch(function (e) {
					setState({ status: "error", message: String((e && e.message) || e) });
				});
			};
			react.useEffect(function () { load(); }, []);

			var doToggle = function (row, disable) {
				setBusy(row.entryId);
				setMsg((disable ? "正在禁用 " : "正在启用 ") + row.pid + " …");
				api("/plugins/toggle", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ entryId: row.pid, disabled: disable }),
				}).then(function (r) {
					if (!r.ok) { setMsg(r.error || "操作被拒绝"); setBusy(null); return; }
					// 轮询运行时状态翻转(dsh watcher 热应用有延迟);期望 enabled === !disable
					var tries = 0;
					var poll = setInterval(function () {
						tries += 1;
						props.list().then(function (snap) {
							var e = (snap.entries || []).filter(function (x) { return x.entryId === row.entryId; })[0];
							var flipped = e === undefined || e.enabled === !disable;
							if (!flipped && tries < 30) return;
							clearInterval(poll);
							setBusy(null);
							setMsg(flipped ? (disable ? "已禁用 " : "已启用 ") + row.pid : "状态切换较慢,已刷新当前列表");
							load();
						}).catch(function () {
							if (tries >= 30) { clearInterval(poll); setBusy(null); setMsg("状态未知,已刷新当前列表"); load(); }
						});
					}, 500);
				}).catch(function (e) {
					setMsg("请求失败: " + e.message);
					setBusy(null);
				});
			};

			if (state[0].status === "loading") return h("div", { className: "pm_root" }, h("div", { className: "pm_msg" }, "正在读取插件清单…"));
			if (state[0].status === "error") return h("div", { className: "pm_root" },
				h("div", { className: "pm_msg pm_msgErr" }, "读取失败: " + state[0].message),
				h("button", { className: "pm_btn", onClick: function () { setState({ status: "loading" }); load(); } }, "重试"));

			var s = state[0];
			var disabledSet = {};
			(s.shell && s.shell.disabled || []).forEach(function (id) { disabledSet[id] = true; });
			var protectedSet = {};
			(s.shell && s.shell.protected || []).forEach(function (id) { protectedSet[id] = true; });

			var q = query[0].trim().toLowerCase();
			var rows = s.entries.filter(function (e) {
				return !q || (e.moduleName || "").toLowerCase().indexOf(q) >= 0 || (e.entryId || "").toLowerCase().indexOf(q) >= 0;
			}).map(function (e) {
				var pid = patchIdOf(e.entryId);
				var userOff = !!pid && !!disabledSet[pid];
				var isProtected = !!pid && !!protectedSet[pid];
				var systemOff = !e.enabled && !userOff;
				var phase = e.fiberPhase === null || e.fiberPhase === undefined ? "unobserved" : e.fiberPhase;
				var phaseText = PHASE_ZH[phase] || phase;
				var open = expanded[0] === e.entryId;
				var tag, tagCls, btn = null;
				if (userOff) { tag = "已禁用(用户)"; tagCls = "pm_tag pm_tagOff"; }
				else if (systemOff) { tag = "系统禁用"; tagCls = "pm_tag pm_tagSys"; }
				else { tag = "已启用"; tagCls = "pm_tag pm_tagOn"; }
				var row = { entryId: e.entryId, pid: pid };
				if (userOff) btn = h("button", { className: "pm_btn", disabled: busy[0] === e.entryId, onClick: function () { doToggle(row, false); } }, "启用");
				else if (pid && e.enabled && !isProtected) btn = h("button", { className: "pm_btn pm_btnDis", disabled: busy[0] === e.entryId, onClick: function () { doToggle(row, true); } }, "禁用");
				return h("div", { key: e.entryId, className: "pm_row" + (e.enabled ? "" : " pm_rowOff") },
					h("div", { className: "pm_left pm_click", role: "button", tabIndex: 0,
						"aria-expanded": open ? "true" : "false",
						onClick: function () { expanded[1](open ? null : e.entryId); },
						onKeyDown: function (ev) { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); expanded[1](open ? null : e.entryId); } } },
						h("span", { className: "pm_name", title: e.moduleName }, shortName(e.moduleName) + (open ? "" : " ▾")),
						h("span", { className: "pm_id" }, (pid || e.entryId) + (isProtected ? " · 核心" : pid ? "" : " · 子树/动态行")),
						open ? h("div", { className: "pm_detail" },
							"模块: " + (e.moduleName || "-") + "\n路径 id: " + (e.entryId || "-") + "\n状态: " + (e.enabled ? phaseText : tag)) : null),
					h("div", { className: "pm_right" },
						e.enabled && phase !== "unobserved" ? h("span", { className: "pm_phase" + (phase === "failed" ? " pm_phaseFailed" : "") }, phaseText) : null,
						h("span", { className: tagCls }, tag),
						btn));
			});
			if (!rows.length) rows = [h("div", { key: "empty", className: "pm_msg" }, q ? "无匹配插件" : "插件清单为空")];

			var msgCls = "pm_msg" + (msg[0].indexOf("失败") >= 0 || msg[0].indexOf("拒绝") >= 0 ? " pm_msgErr" : msg[0].indexOf("已禁用") === 0 || msg[0].indexOf("已启用") === 0 ? " pm_msgOk" : "");
			return h("div", { className: "pm_root" },
				h("label", { className: "pm_search" },
					h("span", { className: "pm_tag" }, "搜索"),
					h("input", { value: query[0], placeholder: "按名称或 id 过滤", onChange: function (ev) { setQuery(ev.currentTarget.value); } })),
				h("div", { className: "pm_list vt_2col", "aria-busy": busy[0] ? "true" : undefined }, rows),
				h("div", { className: msgCls }, msg[0]),
				h("div", { className: "pm_msg" }, "切换即时生效(写入 ~/.dsh/cordis.patch.yml,由 dsh 热加载,无需重启)。核心插件与系统禁用项不可在此操作;启用 = 恢复组合默认。"));
		}
		
		// ---------- [b20] Web UI 插件统一页(并入「插件」模块的第三个 tab) ----------
		// 家族 bundle(dsh-web-ui-all)的 loader 行 id 恒为 web-ui-* 前缀,以 entryId 前缀
		// 从 pluginInventory 运行时清单中筛出 web UI 插件,合并展示名称/运行状态/
		// 启停管理/入口跳转;启停复用壳 /plugins/toggle(与「插件管理」tab 同一写回链路)。
		// 原「Web UI 插件」独立区段(web-ui-settings 包)保留作为配置表单承载层,
		// 本页「打开设置」即编程跳转过去,双入口不互斥。
		var WEBUI_META = {
			"web-ui-settings": { name: "Web UI 插件组(设置桥)", icon: "桥", section: "webui", desc: "家族插件的配置表单承载与设置命名空间桥(启用开关/配置字段的读写通道)。" },
			"web-ui-plugin-manager": { name: "插件管理(家族组件)", icon: "管", desc: "家族版用户插件清单展示;已由官方「插件管理」tab 与插件市场全覆盖(问题84 隐藏)。" },
			"web-ui-community-plugins": { name: "社区插件清单", icon: "社", section: "market", desc: "社区插件静态索引,已并入「插件市场」社区 tab。" },
			"web-ui-dsh-aionui-panel": { name: "aionui 原生面板", icon: "右", desc: "原生右栏(explorer/preview)组件;已被 noside 规则隐藏,better-sidebar 为唯一右侧表面。" },
			"web-ui-task-board": { name: "任务看板", icon: "任", entry: "侧栏入口", desc: "任务看板视图:从侧栏「任务看板」入口打开;支持任务创建/状态流转/看板列展示。" },
			"web-ui-git-graph": { name: "Git 图谱", icon: "G", entry: "右侧面板", desc: "better-sidebar 右侧面板的 Git 分支图谱页签(聊天框分支 chip 已按 R29 移除)。" },
			"web-ui-remote-web-ui": { name: "远程 Web UI", icon: "远", desc: "远程访问 Web 界面:从侧栏「远程访问」入口获取访问地址。" },
			"web-ui-pet": { name: "宠物", icon: "宠", section: "pet", desc: "桌面精灵宠物:启用/选择宠物、显示与尺寸位置调节、喂食互动。" },
			"web-ui-ssh": { name: "SSH 远程", icon: "S", entry: "侧栏入口", desc: "SSH 远程连接视图:从侧栏「SSH」入口打开,管理远程主机与会话。" },
			"web-ui-describe-image": { name: "图片描述工具", icon: "图", entry: "宿主工具", desc: "describe-image 宿主工具的 Web 接入(工具面,无独立 UI 入口)。" },
			"web-ui-chat-recovery": { name: "聊天恢复", icon: "恢", entry: "聊天区", desc: "会话消息恢复能力(断连/异常后的消息重建,聊天区自动生效)。" },
			"web-ui-liangshen": { name: "量身", icon: "量", desc: "liangshen 家族组件(按模型能力定制提示)。" },
			"web-ui-skill-explorer": { name: "技能中心", icon: "技", desc: "技能浏览入口;已按 53b 用户需求禁用(行 web-ui-skill-explorer disabled)。" },
			"web-ui-desktop-launcher": { name: "桌面快捷方式/启动器", icon: "桌", section: "webui", desc: "创建桌面图标、启动行为与关机确认设置(配置表单在「Web UI 插件」区段)。" },
			"web-ui-skin-center": { name: "皮肤中心", icon: "皮", section: "skin-center", desc: "预置主题皮肤试穿/应用(蓝色幻想/鲸吟/数字雨等);入口卡也在「皮肤」页。" },
			"web-ui-better-sidebar": { name: "better-sidebar(内嵌副本)", icon: "侧", locked: "去重守护:与独立 better-sidebar 争注 /sidebar/api 致启动崩溃(问题53),保持禁用", desc: "聚合包内嵌的 better-sidebar 副本;[E] profile 守护强制禁用,启用会致 dsh 启动崩溃。" },
			"web-ui-compat": { name: "家族聚合包(compat 行)", icon: "聚", locked: "聚合兼容行:启用会重复挂载家族子包,保持禁用", desc: "dsh-web-ui-all 聚合包的兼容挂载行;子包已逐行单独挂载,启用会重复注册。" },
		};
		
		function WebUiPluginsTab(props) {
			var h = react.createElement;
			var state = react.useState({ status: "loading" });
			var setState = state[1];
			var busy = react.useState(null);
			var setBusy = busy[1];
			var msg = react.useState("");
			var setMsg = msg[1];
		
			var load = function () {
				return Promise.all([props.list(), api("/plugins")]).then(function (r) {
					setState({ status: "ready", entries: (r[0] && r[0].entries) || [], shell: r[1] });
				}).catch(function (e) {
					setState({ status: "error", message: String((e && e.message) || e) });
				});
			};
			react.useEffect(function () { load(); }, []);
		
			var gotoSection = function (id) {
				// 延迟一拍再点:在 React 合成事件处理器内同步派发嵌套 click 会被当前
				// 事件批处理吞掉导航态切换(b20 实证:直接调用可切,处理器内同步调不切)。
				window.setTimeout(function () {
					try { var btn = document.querySelector('button[data-section-id="' + id + '"]'); if (btn) btn.click(); } catch (e) { /* 导航未渲染 */ }
				}, 0);
			};
			
			var doToggle = function (row, disable) {
				setBusy(row.pid);
				setMsg((disable ? "正在禁用 " : "正在启用 ") + row.name + " …");
				api("/plugins/toggle", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ entryId: row.pid, disabled: disable }),
				}).then(function (r) {
					if (!r.ok) { setMsg(r.error || "操作被拒绝"); setBusy(null); return; }
					// 轮询运行时状态翻转(dsh watcher 热应用有延迟);期望 enabled === !disable
					var tries = 0;
					var poll = setInterval(function () {
						tries += 1;
						props.list().then(function (snap) {
							var e = (snap.entries || []).filter(function (x) { return x.entryId === row.entryId; })[0];
							var flipped = e === undefined || e.enabled === !disable;
							if (!flipped && tries < 30) return;
							clearInterval(poll);
							setBusy(null);
							setMsg(flipped ? (disable ? "已禁用 " : "已启用 ") + row.name : "状态切换较慢,已刷新当前列表");
							load();
						}).catch(function () {
							if (tries >= 30) { clearInterval(poll); setBusy(null); setMsg("状态未知,已刷新当前列表"); load(); }
						});
					}, 500);
				}).catch(function (e) {
					setMsg("请求失败: " + e.message);
					setBusy(null);
				});
			};
		
			if (state[0].status === "loading") return h("div", { className: "pm_root" }, h("div", { className: "pm_msg" }, "正在读取 Web UI 插件清单…"));
			if (state[0].status === "error") return h("div", { className: "pm_root" },
				h("div", { className: "pm_msg pm_msgErr" }, "读取失败: " + state[0].message),
				h("button", { className: "pm_btn", onClick: function () { setState({ status: "loading" }); load(); } }, "重试"));
		
			var s = state[0];
			var disabledSet = {};
			(s.shell && s.shell.disabled || []).forEach(function (id) { disabledSet[id] = true; });
		
			var rows = s.entries.filter(function (e) {
				return typeof e.entryId === "string" && e.entryId.indexOf("include:web-ui-") === 0;
			}).sort(function (a, b) { return a.entryId < b.entryId ? -1 : 1; }).map(function (e) {
				var pid = e.entryId.slice(8);
				var meta = WEBUI_META[pid] || {};
				var name = meta.name || shortName(e.moduleName);
				var userOff = e.enabled === false && !!disabledSet[pid];
				var systemOff = e.enabled === false && !userOff;
				var running = e.enabled && e.fiberPhase === "active";
				var statusTag = running ? "运行中" : e.enabled ? (PHASE_ZH[e.fiberPhase] || e.fiberPhase || "未观察") : userOff ? "已禁用" : "系统禁用";
				var statusCls = "pm_tag " + (running ? "pm_tagOn" : e.enabled ? "pm_tag" : "pm_tagOff");
				var openBtn = meta.section ? h("span", { className: "pm_btn", role: "button", tabIndex: 0, title: "跳转到对应设置区段",
					// 用 span 而非 button:行本身是 role=button 的点击面,嵌套 <button> 会触发隐式表单
					// 提交 fallback(按钮默认 type=submit),抢焦点/中断后续编程跳转(b20 实证)。
					onClick: function (ev) { ev.stopPropagation(); gotoSection(meta.section); },
					onKeyDown: function (ev) { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); ev.stopPropagation(); gotoSection(meta.section); } }
				}, "打开设置 →")
					: meta.entry ? h("span", { className: "pm_tag" }, meta.entry) : null;
				var toggleBtn = null;
				if (meta.locked) toggleBtn = h("span", { className: "pm_tag pm_tagSys", title: meta.locked }, "受保护");
				else if (userOff) toggleBtn = h("button", { className: "pm_btn", disabled: busy[0] === pid, onClick: function () { doToggle({ pid: pid, entryId: e.entryId, name: name }, false); } }, "启用");
				else if (e.enabled) toggleBtn = h("button", { className: "pm_btn pm_btnDis", disabled: busy[0] === pid, onClick: function () { doToggle({ pid: pid, entryId: e.entryId, name: name }, true); } }, "禁用");
				else toggleBtn = h("button", { className: "pm_btn", disabled: busy[0] === pid, onClick: function () { doToggle({ pid: pid, entryId: e.entryId, name: name }, false); } }, "启用");
				return h("div", { key: e.entryId, className: "cm_row" + (e.enabled ? "" : " pm_rowOff") },
					h("div", { className: "cm_icon" }, meta.icon || name.slice(0, 1)),
					h("div", { className: "cm_main" },
						h("div", { className: "cm_titleRow" },
							h("span", { className: "cm_name" }, name),
							h("span", { className: statusCls }, statusTag)),
						h("div", { className: "cm_desc" }, (meta.desc || "") + " 模块: " + (e.moduleName || "-"))),
					h("div", { className: "cm_side" }, openBtn, toggleBtn));
			});
			if (!rows.length) rows = [h("div", { key: "empty", className: "pm_msg" }, "未发现 web UI 插件(家族 bundle 未挂载?)")];
		
			var msgCls = "pm_msg" + (msg[0].indexOf("失败") >= 0 || msg[0].indexOf("拒绝") >= 0 ? " pm_msgErr" : msg[0].indexOf("已禁用") === 0 || msg[0].indexOf("已启用") === 0 ? " pm_msgOk" : "");
			return h("div", { className: "vt_page" },
				h("div", { className: "vt_head" },
					h("h2", { className: "vt_h2" }, "Web UI 插件"),
					h("p", { className: "vt_intro" }, "dsh-web-ui 家族插件的合并管理页:统一查看名称/运行状态/启停,并从入口打开对应功能。启停即时生效(写入 ~/.dsh/cordis.patch.yml,dsh 热加载);详细配置表单在对应设置区段(点「打开设置」跳转)。")),
				h("div", { className: "pm_list vt_2col", "aria-busy": busy[0] ? "true" : undefined }, rows),
				h("div", { className: msgCls }, msg[0]));
		}

		var inject = ["slots", "locale", "remote", "remote.pluginInventory", "sessions", "workspaces"];

		// ---------- dsh HTTP RPC(POST /api/<method>,ClientRequest 信封,同源) ----------

		function uuid4() {
			if (typeof crypto !== "undefined" && crypto.randomUUID) { try { return crypto.randomUUID(); } catch (e) { /* 非 secure context 走手工 v4 */ } }
			var b = new Uint8Array(16);
			if (typeof crypto !== "undefined" && crypto.getRandomValues) crypto.getRandomValues(b);
			else for (var i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
			b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
			var h = ""; for (var j = 0; j < 16; j++) h += ("0" + b[j].toString(16)).slice(-2);
			return h.slice(0, 8) + "-" + h.slice(8, 12) + "-" + h.slice(12, 16) + "-" + h.slice(16, 20) + "-" + h.slice(20);
		}

		function rpc(method, payload) {
			return fetch("/api/" + method, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ type: "client-request", rpcId: uuid4(), method: method, payload: payload || {} }),
			}).then(function (r) {
				if (!r.ok) throw new Error("HTTP " + r.status);
				return r.json();
			}).then(function (full) {
				if (!full || full.type !== "server-response") throw new Error("bad envelope");
				if (!full.result || !full.result.ok) throw new Error((full.result && full.result.error && full.result.error.message) || "rpc error");
				return full.result.value;
			});
		}

		// ---------- 人设 tab(壳 30801 读写 home patch 的 system-prompt 行) ----------

		function PersonaTab() {
			var h = react.createElement;
			var st = react.useState({ status: "loading" });
			var setSt = st[1];
			var text = react.useState("");
			var setText = text[1];
			var msg = react.useState("");
			var setMsg = msg[1];
			var busy = react.useState(false);
			var setBusy = busy[1];

			var load = function () {
				setSt({ status: "loading" });
				api("/persona").then(function (r) {
					if (r.error) { setSt({ status: "error", message: r.error }); return; }
					setText(r.persona);
					setSt({ status: "ready", isDefault: r.isDefault });
				}).catch(function (e) { setSt({ status: "error", message: String((e && e.message) || e) }); });
			};
			react.useEffect(function () { load(); }, []);

			var save = function (restoreDefault) {
				setBusy(true);
				setMsg(restoreDefault ? "正在恢复默认…" : "正在保存…");
				api("/persona", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ persona: restoreDefault ? "" : text[0] }),
				}).then(function (r) {
					setBusy(false);
					if (!r.ok) { setMsg(r.error || "操作被拒绝"); return; }
					setMsg(restoreDefault || r.isDefault ? "已恢复默认人设。" : "已保存人设。");
					load();
				}).catch(function (e) { setBusy(false); setMsg("请求失败: " + e.message); });
			};

			if (st[0].status === "loading") return h("div", { className: "pm_root" }, h("div", { className: "pm_msg" }, "正在读取人设…"));
			if (st[0].status === "error") return h("div", { className: "pm_root" },
				h("div", { className: "pm_msg pm_msgErr" }, "读取失败: " + st[0].message),
				h("button", { className: "pm_btn", onClick: function () { load(); } }, "重试"));

		var msgCls = "pm_msg" + (msg[0].indexOf("失败") >= 0 || msg[0].indexOf("拒绝") >= 0 ? " pm_msgErr" : msg[0].indexOf("已") === 0 ? " pm_msgOk" : "");
		return h("div", { className: "vt_page" },
			h("div", { className: "vt_head" },
				h("h2", { className: "vt_h2" }, "人设"),
				h("p", { className: "vt_intro" }, "全局人设经 system-prompt 插件注入到每一次新对话。支持变量 {{model}}、{{cwd}}、{{provider}}(严格插值,未知变量会导致请求失败)。")),
			h("div", { className: "vt_card vt_span" },
				h("textarea", {
					className: "ps_txt", value: text[0], spellCheck: false, "aria-label": "全局人设",
					placeholder: "例如:你是一位资深工程师,回答简洁直接,优先给出可执行的方案。",
					onChange: function (ev) { setText(ev.currentTarget.value); },
				}),
				h("div", { className: "ps_btns" },
					h("button", { className: "pm_btn", disabled: busy[0], onClick: function () { save(false); } }, "保存"),
					h("button", { className: "pm_btn", disabled: busy[0], onClick: function () { save(true); } }, "恢复默认"),
					st[0].isDefault ? h("span", { className: "pm_tag" }, "当前为默认") : h("span", { className: "pm_tag pm_tagOff" }, "已自定义")),
				h("div", { className: msgCls }, msg[0])),
			h("div", { className: "pm_msg" }, "保存写入 ~/.dsh/cordis.patch.yml 并由 dsh 热载入(插件随新配置自动重建),下一条消息起即用新人设组装提示词,进行中的对话同样生效;若会话所用 Agent 预设自带人设,则该会话以预设为准。清空后保存等于恢复默认。"));
		}

		// ---------- 技能 tab(壳 30801 扫描 user 级技能目录,启停/删除;runtime 并集补充其他来源) ----------
		// 启停 = 壳把技能条目在 <root> 与 <root>-disabled 间移动(dsh chokidar 热刷新);
		// 删除 = 递归删除条目目录/文件。工作区/内置来源仅只读展示。

		var TRASH_SVG = '<svg viewBox="0 0 16 16" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z"/><path fill-rule="evenodd" d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z"/></svg>';
		var SKILL_SRC_ZH = { "project-dsh": "工作区 .dsh/skills", "project-agents": "工作区 .agents/skills", custom: "自定义目录", bundled: "内置" };

		function SkillSwitch(props) {
			var h = react.createElement;
			return h("button", {
				className: "cm_sw" + (props.on ? " cm_swOn" : ""),
				role: "switch", "aria-checked": props.on ? "true" : "false",
				title: props.title, disabled: props.disabled, onClick: props.onClick,
			}, h("span", { className: "cm_swDot" }));
		}

		function SkillsTab() {
			var h = react.createElement;
			var st = react.useState({ status: "loading" });
			var setSt = st[1];
			var q = react.useState("");
			var busy = react.useState(null);
			var setBusy = busy[1];
			var msg = react.useState("");
			var setMsg = msg[1];
			var confirmDel = react.useState(null);
			var setConfirmDel = confirmDel[1];

			var applyEntries = function (entries) {
				setSt(function (prev) { return { status: "ready", mine: entries || (prev.mine || []), others: prev.others || [] }; });
			};

			var load = function () {
				setSt({ status: "loading" });
				// runtime 并集沿用"最近活跃会话上下文"取法,仅用于展示非 user 级来源
				var runtimeP = rpc("session.list", {}).then(function (v) {
					var items = (v && v.items) || [];
					var sorted = items.slice().sort(function (a, b) { return (b.updatedAt || 0) - (a.updatedAt || 0); });
					var picked = sorted.filter(function (s) { return !s.blank; }).slice(0, 3);
					var blankOne = sorted.filter(function (s) { return s.blank; })[0];
					if (blankOne && picked.length < 4) picked.push(blankOne);
					if (!picked.length) return [];
					return Promise.all(picked.map(function (s) {
						return rpc("skill.list", { sessionId: s.sessionId }).then(function (sv) {
							return (sv && sv.skills) || [];
						}).catch(function () { return []; });
					})).then(function (lists) {
						var byName = {};
						var merged = [];
						lists.forEach(function (list) {
							list.forEach(function (sk) {
								if (!byName[sk.name]) { byName[sk.name] = true; merged.push(sk); }
							});
						});
						return merged;
					});
				}).catch(function () { return []; });
				Promise.all([api("/skills"), runtimeP]).then(function (r) {
					var mine = (r[0] && r[0].entries) || [];
					var mineNames = {};
					mine.forEach(function (s) { mineNames[s.name] = true; });
					var others = (r[1] || []).filter(function (s) { return !mineNames[s.name]; });
					setSt({ status: "ready", mine: mine, others: others });
				}).catch(function (e) { setSt({ status: "error", message: String((e && e.message) || e) }); });
			};
			react.useEffect(function () { load(); }, []);

			var doToggle = function (s) {
				setBusy(s.key); setMsg("");
				api("/skills/toggle", {
					method: "POST", headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ source: s.source, name: s.entryName, disabled: !s.disabled }),
				}).then(function (r) {
					setBusy(null);
					if (!r.ok) { setMsg(r.error || "操作被拒绝"); return; }
					applyEntries(r.entries);
					setMsg(s.disabled ? "已启用 " + s.name : "已禁用 " + s.name);
				}).catch(function (e) { setBusy(null); setMsg("请求失败: " + e.message); });
			};

			var doDelete = function (s) {
				setBusy(s.key); setMsg("正在删除 " + s.name + " …");
				api("/skills/delete", {
					method: "POST", headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ source: s.source, name: s.entryName }),
				}).then(function (r) {
					setBusy(null); setConfirmDel(null);
					if (!r.ok) { setMsg(r.error || "删除被拒绝"); return; }
					applyEntries(r.entries);
					setMsg("已删除 " + s.name);
				}).catch(function (e) { setBusy(null); setConfirmDel(null); setMsg("请求失败: " + e.message); });
			};

			if (st[0].status === "loading") return h("div", { className: "pm_root" }, h("div", { className: "pm_msg" }, "正在读取技能目录…"));
			if (st[0].status === "error") return h("div", { className: "pm_root" },
				h("div", { className: "pm_msg pm_msgErr" }, "读取失败: " + st[0].message),
				h("button", { className: "pm_btn", onClick: function () { load(); } }, "重试"));

			var query = q[0].trim().toLowerCase();
			var mine = st[0].mine.filter(function (s) {
				return !query || (s.name || "").toLowerCase().indexOf(query) >= 0 || (s.description || "").toLowerCase().indexOf(query) >= 0;
			});
			var rows = mine.map(function (s) {
				var confirming = confirmDel[0] === s.key;
				return h("div", { key: s.key, className: "cm_row" + (s.disabled ? " cm_rowOff" : "") },
					h("div", { className: "cm_icon" }, (s.name || "?").charAt(0).toUpperCase()),
					h("div", { className: "cm_main" },
						h("div", { className: "cm_titleRow" },
							h("span", { className: "cm_name", title: s.name }, s.name),
							h("span", { className: "cm_src", title: s.sourceLabel + (s.disabled ? "(已禁用)" : "") }, s.sourceLabel),
							s.modelInvocable ? null : h("span", { className: "cm_src" }, "仅 /命令")),
						h("div", { className: "cm_desc", title: s.description }, s.description || ""),
						confirming ? h("div", { className: "cm_confirm" },
							h("span", { className: "cm_confirmTxt" }, "删除后无法恢复,确认删除 " + s.name + "？"),
							h("button", { className: "cm_btnDanger", disabled: busy[0] === s.key, onClick: function () { doDelete(s); } }, "删除"),
							h("button", { className: "cm_btnGhost", onClick: function () { setConfirmDel(null); } }, "取消")) : null),
					confirming ? null : h("div", { className: "cm_side" },
						h("button", { className: "cm_del", title: "删除", disabled: busy[0] === s.key, onClick: function () { setConfirmDel(s.key); },
							"aria-label": "删除 " + s.name, dangerouslySetInnerHTML: { __html: TRASH_SVG } }),
						h(SkillSwitch, {
							on: !s.disabled, disabled: busy[0] === s.key,
							title: s.disabled ? "启用" : "禁用",
							onClick: function () { doToggle(s); },
						})));
			});
			if (!rows.length) rows = [h("div", { key: "empty", className: "pm_msg" }, query ? "无匹配技能" : "用户技能目录为空。把技能目录(含 SKILL.md)放入 ~/.dsh/skills 即可在此管理。")];

			var otherRows = st[0].others.map(function (s) {
				return h("div", { key: "o-" + s.name, className: "cm_mini" },
					h("span", { className: "cm_miniName", title: s.name }, "/" + s.name),
					h("span", { className: "cm_src" }, SKILL_SRC_ZH[s.source] || s.source || "其他来源"));
			});

		var msgCls = "pm_msg" + (msg[0].indexOf("失败") >= 0 || msg[0].indexOf("拒绝") >= 0 ? " pm_msgErr" : msg[0].indexOf("已") === 0 ? " pm_msgOk" : "");
	return h("div", { className: "vt_group vt_span" },
		h("div", { className: "vt_groupTitle" }, "用户技能"),
		h("label", { className: "pm_search" },
			h("span", { className: "pm_tag" }, "搜索"),
			h("input", { value: q[0], placeholder: "按名称或描述过滤", onChange: function (ev) { q[1](ev.currentTarget.value); } })),
		h("div", { className: "cm_count" }, mine.length + " 个用户技能" + (st[0].others.length ? " · " + st[0].others.length + " 个其他来源" : "")),
		h("div", { className: "pm_list vt_2col" }, rows),
		otherRows.length ? h("div", { className: "cm_h2" }, "其他来源(随工作区/组合自动加载)") : null,
		otherRows.length ? h("div", { className: "pm_list vt_2col" }, otherRows) : null,
			h("div", { className: msgCls }, msg[0]),
			h("div", { className: "pm_msg" }, "开关 = 壳在 ~/.dsh/skills(~/.agents/skills)与其 -disabled 姊妹目录间移动技能,dsh 监听目录热生效,无需重启。"));
		}

		// ---------- MCP tab(inventory 过滤 mcp 行;启停走壳 plugins/toggle,删除仅壳管理的 insert 块) ----------

		var MCP_SNIPPET = [
			"# ~/.dsh/cordis.patch.yml 追加(每个 MCP server 一个条目):",
			"- insert:",
			"    - id: mcp-fetch",
			"      name: '@deepseek-ai/dsh-mcp-client'",
			"      config:",
			"        serverName: fetch",
			"        transport: streamable-http",
			"        url: https://example.com/mcp",
			"# stdio 传输改用: transport: stdio + command/args/env/cwd",
		].join("\n");

		function McpTab(props) {
			var h = react.createElement;
			var st = react.useState({ status: "loading" });
			var setSt = st[1];
			var busy = react.useState(null);
			var setBusy = busy[1];
			var msg = react.useState("");
			var setMsg = msg[1];
			var confirmDel = react.useState(null);
			var setConfirmDel = confirmDel[1];

			var load = function () {
				setSt({ status: "loading" });
				Promise.all([props.list(), api("/plugins"), api("/mcp")]).then(function (r) {
					var entries = ((r[0] && r[0].entries) || []).filter(function (e) { return /mcp/i.test(e.moduleName || "") || /mcp/i.test(e.entryId || ""); });
					var disabledSet = {};
					((r[1] && r[1].disabled) || []).forEach(function (id) { disabledSet[id] = true; });
					var managed = {};
					var cfg = {};
					((r[2] && r[2].managed) || []).forEach(function (m) { managed[m.id] = true; cfg[m.id] = m.config || {}; });
					setSt({ status: "ready", entries: entries, disabledSet: disabledSet, managed: managed, cfg: cfg });
				}).catch(function (e) { setSt({ status: "error", message: String((e && e.message) || e) }); });
			};
			react.useEffect(function () { load(); }, []);

			var doToggle = function (e, pid, disable) {
				setBusy(e.entryId);
				setMsg((disable ? "正在禁用 " : "正在启用 ") + pid + " …");
				api("/plugins/toggle", {
					method: "POST", headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ entryId: pid, disabled: disable }),
				}).then(function (r) {
					if (!r.ok) { setMsg(r.error || "操作被拒绝"); setBusy(null); return; }
					// 轮询运行时状态翻转(dsh watcher 热应用有延迟)
					var tries = 0;
					var poll = setInterval(function () {
						tries += 1;
						props.list().then(function (snap) {
							var row = (snap.entries || []).filter(function (x) { return x.entryId === e.entryId; })[0];
							var flipped = row === undefined || row.enabled === !disable;
							if (!flipped && tries < 30) return;
							clearInterval(poll);
							setBusy(null);
							setMsg(flipped ? (disable ? "已禁用 " : "已启用 ") + pid : "状态切换较慢,已刷新当前列表");
							load();
						}).catch(function () {
							if (tries >= 30) { clearInterval(poll); setBusy(null); setMsg("状态未知,已刷新当前列表"); load(); }
						});
					}, 500);
				}).catch(function (err) { setMsg("请求失败: " + err.message); setBusy(null); });
			};

			var doDelete = function (pid) {
				setBusy(pid);
				setMsg("正在删除 " + pid + " …");
				api("/mcp/delete", {
					method: "POST", headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ id: pid }),
				}).then(function (r) {
					setBusy(null); setConfirmDel(null);
					if (!r.ok) { setMsg(r.error || "删除被拒绝"); return; }
					setMsg("已删除 " + pid + ",正在刷新…");
					load();
				}).catch(function (e) { setBusy(null); setConfirmDel(null); setMsg("请求失败: " + e.message); });
			};

			if (st[0].status === "loading") return h("div", { className: "pm_root" }, h("div", { className: "pm_msg" }, "正在读取 MCP 实例…"));
			if (st[0].status === "error") return h("div", { className: "pm_root" },
				h("div", { className: "pm_msg pm_msgErr" }, "读取失败: " + st[0].message),
				h("button", { className: "pm_btn", onClick: function () { load(); } }, "重试"));

			var s = st[0];
			var rows = s.entries.map(function (e) {
				var pid = patchIdOf(e.entryId);
				var userOff = !!pid && !!s.disabledSet[pid];
				var systemOff = !e.enabled && !userOff;
				var manageable = !!pid && !systemOff;
				var confirming = !!pid && confirmDel[0] === pid;
				var phase = e.fiberPhase === null || e.fiberPhase === undefined ? "unobserved" : e.fiberPhase;
				var cfg = pid ? s.cfg[pid] : null;
				var displayName = pid ? pid.replace(/^mcp-/, "") : shortName(e.moduleName);
				var descParts = [];
				if (cfg) {
					if (cfg.serverName) descParts.push("server: " + cfg.serverName);
					if (cfg.transport) descParts.push(cfg.transport);
					if (cfg.url) descParts.push(cfg.url);
					if (cfg.command) descParts.push(cfg.command + (cfg.args && cfg.args.length ? " " + cfg.args.join(" ") : ""));
				}
				var desc = descParts.length ? descParts.join(" · ") : e.entryId;
				return h("div", { key: e.entryId, className: "cm_row" + (e.enabled ? "" : " cm_rowOff") },
					h("div", { className: "cm_icon" }, "M"),
					h("div", { className: "cm_main" },
						h("div", { className: "cm_titleRow" },
							h("span", { className: "cm_name", title: displayName }, displayName),
							pid ? h("span", { className: "cm_src", title: e.entryId }, "mcp") : h("span", { className: "cm_src", title: e.entryId }, "子树/动态"),
							e.enabled && phase !== "unobserved" ? h("span", { className: "cm_src" + (phase === "failed" ? "" : "") },
								phase === "failed" ? "失败" : PHASE_ZH[phase] || phase) : null,
							userOff ? h("span", { className: "cm_src" }, "已禁用") : systemOff ? h("span", { className: "cm_src" }, "系统禁用") : null),
						h("div", { className: "cm_desc", title: desc }, desc),
						confirming ? h("div", { className: "cm_confirm" },
							h("span", { className: "cm_confirmTxt" }, "将从 cordis.patch.yml 移除 " + pid + ",确认？"),
							h("button", { className: "cm_btnDanger", disabled: busy[0] === pid, onClick: function () { doDelete(pid); } }, "删除"),
							h("button", { className: "cm_btnGhost", onClick: function () { setConfirmDel(null); } }, "取消")) : null),
					h("div", { className: "cm_side" },
						!confirming && s.managed[pid] ? h("button", { className: "cm_del", title: "删除", disabled: busy[0] === e.entryId, onClick: function () { setConfirmDel(pid); },
							"aria-label": "删除 " + displayName, dangerouslySetInnerHTML: { __html: TRASH_SVG } }) : null,
						!confirming && manageable ? h(SkillSwitch, {
							on: !userOff, disabled: busy[0] === e.entryId,
							title: userOff ? "启用" : "禁用",
							onClick: function () { doToggle(e, pid, !userOff); },
						}) : null));
			});
			if (!rows.length) rows = [h("div", { key: "empty", className: "pm_msg" }, "当前组合未挂载任何 MCP 客户端实例。")];

			var msgCls = "pm_msg" + (msg[0].indexOf("失败") >= 0 || msg[0].indexOf("拒绝") >= 0 ? " pm_msgErr" : msg[0].indexOf("已") === 0 || msg[0].indexOf("较慢") >= 0 ? " pm_msgOk" : "");
			return h("div", { className: "pm_root" },
			h("div", { className: "pm_list vt_2col" }, rows),
			h("div", { className: msgCls }, msg[0]),
			h("div", { className: "pm_msg" }, "MCP 客户端(@deepseek-ai/dsh-mcp-client)每个实例连接一个 MCP server 并把工具注册为 mcp__<server>__<tool>。开关写 home patch 热载入;删除仅对本工具写入的条目生效。手动添加示例:"),
				h("pre", { className: "sk_code" }, MCP_SNIPPET),
				h("div", { className: "pm_msg" }, "保存后热载入。要求包可从 dsh 安装或 profile 解析(dsh plugin add);serverName 全局唯一。"));
		}

		// ---------- [问题74] 技能区段双标签容器:Skill 与 MCP 分页展示 ----------
		// 切换即卸载/重挂载对应 tab 组件——数据加载/空态/交互逻辑全部复用原组件,
		// 不混排在同一列表;每次切入重新拉取保证数据新鲜。
		function SkillsMcpSection(props) {
			var h = react.createElement;
			var tab = react.useState("skill");
			var setTab = tab[1];
			var active = tab[0];
			var tabBtn = function (id, label) {
				return h("button", {
					key: id, type: "button", role: "tab",
					"aria-selected": active === id ? "true" : "false",
					className: "sk_tab" + (active === id ? " sk_tabOn" : ""),
					onClick: function () { setTab(id); },
				}, label);
			};
			return h("div", { className: "vt_page" },
				h("div", { className: "vt_head" },
					h("h2", { className: "vt_h2" }, "技能"),
					h("p", { className: "vt_intro" }, "管理本地技能目录与 MCP 服务器连接。启停与删除即时热生效,无需重启服务。")),
				h("div", { className: "sk_tabs vt_span", role: "tablist", "aria-label": "技能与 MCP" },
					tabBtn("skill", "Skill"),
					tabBtn("mcp", "MCP")),
				active === "skill"
					? h(SkillsTab)
					: h("div", { className: "vt_group vt_span" },
						h("div", { className: "vt_groupTitle" }, "MCP 服务器"),
						h(McpTab, { list: props.list })));
		}

		// ---------- 更新 tab(壳 30801:壳更新走 GitHub Releases,dsh 更新走 npm latest) ----------

		function UpdateTab() {
			var h = react.createElement;
			var st = react.useState({ status: "loading" });
			var setSt = st[1];
			var msg = react.useState("");
			var setMsg = msg[1];
			var busy = react.useState(false);
			var setBusy = busy[1];

			var load = function () {
				setSt({ status: "loading" });
				api("/updates/state").then(function (s) {
					setSt({ status: "ready", info: s, check: null });
				}).catch(function (e) { setSt({ status: "error", message: String((e && e.message) || e) }); });
			};
			react.useEffect(function () { load(); }, []);

			var doCheck = function () {
				setBusy(true); setMsg("正在检查更新(壳 GitHub Releases + dsh npm)…");
				api("/updates/check").then(function (c) {
					setBusy(false);
					setSt(function (prev) { return { status: "ready", info: prev.info, check: c }; });
					setMsg("检查完成。");
				}).catch(function (e) { setBusy(false); setMsg("检查失败: " + e.message); });
			};

			var applyDsh = function () {
				setBusy(true); setMsg("正在更新 dsh(预检新版可运行性,失败自动回滚)…");
				api("/updates/apply-dsh", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }).then(function (r) {
					if (!r.ok) { setBusy(false); setMsg(r.error || "更新被拒绝"); return; }
					if (r.note) { setBusy(false); setMsg(r.note); return; }
					// 轮询直到编排结束(切换含预检+重启+回滚)
					var poll = setInterval(function () {
						api("/state").then(function (s) {
							if (s.switching || s.restarting) return;
							clearInterval(poll);
							setBusy(false);
							setMsg("dsh 更新编排结束,当前版本 " + s.dshVersion + "。");
							load();
						}).catch(function () { /* 壳短暂重启,继续轮询 */ });
					}, 2000);
				}).catch(function (e) { setBusy(false); setMsg("请求失败: " + e.message); });
			};

			var applyShell = function () {
				setBusy(true); setMsg("正在请求壳更新…");
				api("/updates/apply-shell", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }).then(function (r) {
					setBusy(false);
					if (!r.ok) { setMsg(r.error || "操作被拒绝"); return; }
					setMsg(r.note || "已开始。");
				}).catch(function (e) { setBusy(false); setMsg("请求失败: " + e.message); });
			};

			if (st[0].status === "loading") return h("div", { className: "pm_root" }, h("div", { className: "pm_msg" }, "正在读取版本状态…"));
			if (st[0].status === "error") return h("div", { className: "pm_root" },
				h("div", { className: "pm_msg pm_msgErr" }, "读取失败: " + st[0].message),
				h("button", { className: "pm_btn", onClick: function () { load(); } }, "重试"));

			var s = st[0].info;
			var c = st[0].check;
			var shellRow = h("div", { className: "pm_row" },
				h("div", { className: "pm_left" },
					h("span", { className: "pm_name" }, "桌面壳(DeepSeek Harness)"),
					h("span", { className: "pm_id" },
						"当前 " + (s.shellVersion || "-")
						+ (c ? (c.shellLatest ? " · 最新 " + c.shellLatest : " · 无版本信息") : "")
						+ (s.portable ? " · 便携版" : s.canSelfUpdate ? " · 安装版" : " · 开发模式"))),
				h("div", { className: "pm_right" },
					c && c.shellUpdateAvailable ? h("span", { className: "pm_tag pm_tagOff" }, "有新版")
						: c && c.shellLatest ? h("span", { className: "pm_tag pm_tagOn" }, "已是最新") : null,
					c && c.shellUpdateAvailable && !s.devShell ? h("button", { className: "pm_btn", disabled: busy[0], onClick: function () { applyShell(); } }, s.portable ? "前往下载" : "下载并安装") : null,
					c && c.shellError ? h("span", { className: "pm_tag pm_tagErr" }, "检查失败") : null));
			var dshRow = h("div", { className: "pm_row" },
				h("div", { className: "pm_left" },
					h("span", { className: "pm_name" }, "dsh 服务(@deepseek-ai/dsh)"),
					h("span", { className: "pm_id" },
						"当前 " + (s.dshVersion || "-")
						+ (c ? (c.dshTracksLatest ? " · 跟踪 latest(每次启动用最新)" : c.dshLatest ? " · npm 最新 " + c.dshLatest : " · npm 查询失败") : ""))),
				h("div", { className: "pm_right" },
					c && c.dshUpdateAvailable ? h("span", { className: "pm_tag pm_tagOff" }, "有新版")
						: c && c.dshLatest ? h("span", { className: "pm_tag pm_tagOn" }, "已是最新") : null,
					c && c.dshUpdateAvailable ? h("button", { className: "pm_btn", disabled: busy[0], onClick: function () { applyDsh(); } }, "更新 dsh") : null,
					c && c.dshError ? h("span", { className: "pm_tag pm_tagErr" }, "检查失败") : null));

		var msgCls = "pm_msg" + (msg[0].indexOf("失败") >= 0 || msg[0].indexOf("拒绝") >= 0 ? " pm_msgErr" : msg[0].indexOf("结束") >= 0 || msg[0].indexOf("完成") >= 0 || msg[0].indexOf("最新") >= 0 ? " pm_msgOk" : "");
		return h("div", { className: "vt_page" },
			h("div", { className: "vt_head" },
				h("h2", { className: "vt_h2" }, "更新"),
				h("p", { className: "vt_intro" }, "桌面壳与 dsh 服务的版本状态与更新通道。")),
			h("div", { className: "vt_group vt_span" },
				h("div", { className: "pm_list vt_2col" }, [shellRow, dshRow])),
			h("div", { className: "ps_btns" },
				h("button", { className: "pm_btn", disabled: busy[0], onClick: function () { doCheck(); } }, "检查更新"),
				h("button", { className: "pm_btn", disabled: busy[0], onClick: function () { api("/updates/open-releases", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }); } }, "打开 Releases 页")),
			c && c.shellNote ? h("div", { className: "pm_msg" }, c.shellNote) : null,
			h("div", { className: msgCls }, msg[0]),
			h("div", { className: "pm_msg" }, "壳更新从 GitHub(Suife-yuanxing/dsh-desktop)Releases 拉取:安装版自动下载并弹窗确认重启,便携版引导手动下载。dsh 更新先预检新版可运行性,失败自动回滚。"));
		}

		// ---------- 皮肤 tab:自定义媒体导入 + Wallpaper Engine 接入 ----------
		// 壳(30801)提供:资产上传 /skin/upload、静态服务 /skin/asset/*、
		// WE 扫描 /skin/wallpapers(Steam 创意工坊 app 431960,video 壁纸可直接应用)。
		// 应用状态持久化在壳 desktop-config.json 的 skin 字段,插件启动时恢复。

		var BG_LAYER_ID = "dsh-desktop-skin-bg";
		var BG_STYLE_ID = "dsh-desktop-skin-style";
		var AUDIO_ID = "dsh-desktop-skin-audio";
		var SKIN_KIND_ZH = { image: "图片", video: "视频", audio: "音频" };

		// [fix] Chromium 省电策略:页面不可见(窗口最小化/被完全遮挡/后台加载)时,
		// "video-only background media" 的 play() 会被 AbortError 拒绝并停在第一帧,
		// 回到前台也不会自动恢复。注册 visibilitychange 重放 + 拒绝后短退避重试。
		var skinMedia = { video: null, audio: null };
				// [R48→b13] 最近一次皮肤状态:主题(深/浅)切换时重算液态玻璃色调。
				// 守卫:html style 属性高频变化(--lg-px/py 鼠标流光逐帧写入),仅当
				// colorScheme 深浅实际翻转才重算,避免每帧重写整段玻璃样式。
				var lastSkinState = null;
				(function watchThemeForGlass() {
					if (typeof document === "undefined") return;
					var isDark = function () {
						try { return (getComputedStyle(document.documentElement).colorScheme || "").indexOf("dark") >= 0; } catch (e) { return false; }
					};
					var lastDark = isDark();
					var mo = new MutationObserver(function () {
						var d = isDark();
						if (d === lastDark) return;
						lastDark = d;
						// [问题72] 壁纸态底板色也主题感知,主题翻转同样需重算(幂等,媒体元素按 src 复用不重启)
						if (lastSkinState) applySkinVisual(lastSkinState);
					});
					mo.observe(document.documentElement, { attributes: true, attributeFilter: ["style", "class"] });
				})();
		function skinPlay(el, tries) {
			if (!el || !el.isConnected) return;
			tries = tries || 0;
			var p = el.play();
			if (p && p.catch) p.catch(function () {
				// 页面不可见时重试必然再被拒(省电暂停),等 visibilitychange 唤醒;
				// 可见但仍拒(数据未就绪等)则短退避重试,上限 5 次。
				if (document.visibilityState !== "visible") return;
				if (tries < 5) setTimeout(function () { skinPlay(el, tries + 1); }, 2000);
			});
		}
		if (typeof document !== "undefined" && !document.getElementById("dsh-desktop-skin-mediatap")) {
			var tap = document.createElement("i");
			tap.id = "dsh-desktop-skin-mediatap";
			tap.style.display = "none";
			document.head.appendChild(tap);
			document.addEventListener("visibilitychange", function () {
				if (document.visibilityState !== "visible") return;
				["video", "audio"].forEach(function (k) {
					var el = skinMedia[k];
					if (el && el.isConnected && el.paused) skinPlay(el);
				});
			});
			// [R28] 拒播兜底:任何 play() 被拒后,用户下一次任意交互(pointerdown)即恢复。
			// 壳已设 autoplayPolicy no-user-gesture-required(正常无此场景),此为策略收紧/异常拒播的保险丝。
			document.addEventListener("pointerdown", function () {
				["video", "audio"].forEach(function (k) {
					var el = skinMedia[k];
					if (el && el.isConnected && el.paused) skinPlay(el);
				});
			}, { capture: true });
		}

		/** [R48→问题59→问题73] Apple 风格液态玻璃——多层折射/透光,严格限定四类表面:
		 *  ① 设置面板 ② 聊天输入框(composer) ③ 侧边栏 ④ 工作区(列表+空态功能卡)。
		 *  其余表面保持原生样式(不再全局染 bg-layer 令牌)。
		 *  视觉分层:折射层(SVG feTurbulence+feDisplacementMap 经 backdrop-filter url()
		 *  透镜式扭曲,不支持时降级纯模糊)+ 半透明主题色调(亮/暗自适应)+ 边缘高光
		 *  (边框+内顶光线+内底暗线)+ 动态光泽(静态对角镜面 + 指针跟踪径向流光)
		 *  + 多层深度(一级表面重折射,工作区二级折射,侧栏玻璃层 z:-1 沉底)。
		 *  包含块防护:侧栏根本体不施加 filter(设置 overlay 为全局 fixed,困块陷阱),
		 *  折射走独立装饰层 .dsh-vt-glasspane;仅无壁纸分支调用。 */
		function glassCss() {
			var dark = false;
			try { dark = (getComputedStyle(document.documentElement).colorScheme || "").indexOf("dark") >= 0; } catch (e) { /* 默认浅色 */ }
			var tint = dark ? "28,30,36" : "255,255,255";
			var edge = dark ? "rgba(255,255,255,.16)" : "rgba(255,255,255,.60)";
			var edgeDim = dark ? "rgba(255,255,255,.07)" : "rgba(255,255,255,.30)";
			var innerShade = dark ? "rgba(0,0,0,.28)" : "rgba(60,70,90,.10)";
			var shadowA = dark ? ".38" : ".16";
			var refr = glassSvgSupported() ? "url(#dsh-lg-refract) " : "";
			// 一级表面:重折射 + 微对比增强玻璃质感;二级(工作区/侧栏底层):轻折射。
			var f1 = refr + "blur(20px) saturate(1.6) brightness(" + (dark ? "0.92" : "1.06") + ") contrast(1.02)";
			var f2 = refr + "blur(12px) saturate(1.4)";
			// 一级表面 = 设置面板 + composer。[问题73] 本版本面板无 role=dialog,
			// 按语义后缀 _panel 寻址(排除 panelBody 内层防双层折射);面板自身即
			// overlay 根,无 fixed 后代,backdrop-filter 无包含块风险(壁纸态同法已验证)。
			var SURF = '[data-composer-card],[class*="_panel"]:not([class*="panelBody"])';
			// [b13问题1/3] ::after 选择器必须逐个展开,伪元素不会自动分派到列表每一项。
			var SURFA = '[data-composer-card]::after,[class*="_panel"]:not([class*="panelBody"])::after';
			// 遮罩边缘化前缀同理逐项展开(html.dsh-lg-mask 只挂首项是选择器拼接陷阱)。
			var MASKA = 'html.dsh-lg-mask [data-composer-card]::after,html.dsh-lg-mask [class*="_panel"]:not([class*="panelBody"])::after';
			var depthShadow = "inset 0 1px 0 " + edge + ",inset 0 -1px 0 " + innerShade + ",0 2px 8px rgba(0,0,0," + (dark ? ".22" : ".08") + "),0 16px 40px rgba(0,0,0," + shadowA + ")";
			return [
				// 氛围渐变垫底(fixed):玻璃纵深的光源;三光斑分层,仅渲染氛围不覆盖任何表面。
				"body{background-image:radial-gradient(55% 45% at 18% 10%, rgba(77,107,254," + (dark ? ".20" : ".12") + "), transparent 62%),radial-gradient(48% 42% at 86% 84%, rgba(103,153,254," + (dark ? ".16" : ".09") + "), transparent 58%),radial-gradient(30% 24% at 55% 40%, rgba(147,197,253," + (dark ? ".08" : ".06") + "), transparent 70%)!important;background-attachment:fixed!important}",
				// 一级表面(设置面板/composer):折射滤镜 + 半透明主题玻璃底 + 张力圆角 + 多层深度影。
				SURF + "{backdrop-filter:" + f1 + "!important;-webkit-backdrop-filter:" + f1 + "!important;background-color:color-mix(in srgb, rgba(" + tint + ",1) " + (dark ? "46%" : "54%") + ", transparent)!important;border:1px solid " + edgeDim + "!important;border-radius:20px!important;box-shadow:" + depthShadow + "!important}",
				// [问题62] 面板定位加固:absolute+inset:0+margin:auto 硬居中,不再依赖
				// overlay flex 或 static 位置(曾被入场动画包含块钉在 (0,0))。
				'[class*="_panel"]:not([class*="panelBody"]){position:absolute!important;inset:0!important;margin:auto!important}',
				// 表面张力凸感 + 静态对角镜面光泽(顶部径向凸光 + 135° 扫光;鼠标流光另走 ::after)
				SURF + "{background-image:radial-gradient(120% 80% at 50% 0%, rgba(255,255,255," + (dark ? ".08" : ".14") + "), transparent 55%),linear-gradient(135deg, rgba(255,255,255," + (dark ? ".05" : ".09") + "), rgba(255,255,255,0) 38%, rgba(255,255,255,0) 62%, rgba(255,255,255," + (dark ? ".03" : ".05") + "))!important}",
				// 指针跟踪边缘高光:视口坐标 radial 在 ::after 内随 --lg-px/py 流动。
				// pointer-events:none;边缘 mask 仅在支持时生效(不支持则高光铺全表面,更柔)。
				SURFA + "{content:'';position:absolute;inset:0;border-radius:inherit;pointer-events:none;background:radial-gradient(260px circle at var(--lg-px,50vw) var(--lg-py,50vh), rgba(255,255,255," + (dark ? ".16" : ".32") + "), transparent 65%)}",
				MASKA + "{-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);mask-composite:exclude;padding:2px}",
				// 侧栏根:不含 backdrop-filter;**不加 isolation/z-index**——任何栈上下文都会
				// 把内部 z:1000 的设置 overlay 困在侧栏绘制顺序内(被中列盖住,问题62)。
				'div[data-slot="sidebar"]>div[class*="_root"]{position:relative!important;background-color:color-mix(in srgb, rgba(' + tint + ',1) ' + (dark ? "44%" : "52%") + ', transparent)!important;background-image:radial-gradient(320px circle at var(--lg-px,50vw) var(--lg-py,50vh), rgba(255,255,255,' + (dark ? ".07" : ".10") + "), transparent 65%),linear-gradient(180deg, rgba(255,255,255," + (dark ? ".04" : ".08") + "), rgba(255,255,255,0) 30%)!important;border:1px solid " + edgeDim + "!important;border-radius:20px!important;box-shadow:" + depthShadow + "!important}",
				// 工作区(表面④):侧栏内二级折射层——叠在玻璃侧栏之上形成 Apple 式
				// 多层透光深度;列表无 fixed 后代,backdrop-filter 安全。轻色调+内顶光。
				'div[data-slot="sidebar.workspaces"]{position:relative!important;backdrop-filter:' + f2 + '!important;-webkit-backdrop-filter:' + f2 + '!important;background-color:color-mix(in srgb, rgba(' + tint + ',1) ' + (dark ? "26%" : "30%") + ', transparent)!important;border-radius:16px;border:1px solid ' + edgeDim + '!important;box-shadow:inset 0 1px 0 ' + edgeDim + '!important}',
				// 工作区空态功能卡(文件/源码/任务/终端/浏览器):玻璃卡片观感;
				// 卡片无定位子树,轻模糊安全。
				'button[class*="paneCard"]{backdrop-filter:' + f2 + '!important;-webkit-backdrop-filter:' + f2 + '!important;background-color:color-mix(in srgb, rgba(' + tint + ',1) ' + (dark ? "34%" : "42%") + ', transparent)!important;border:1px solid ' + edgeDim + '!important;box-shadow:inset 0 1px 0 ' + edgeDim + ',0 6px 18px rgba(0,0,0,' + (dark ? ".24" : ".08") + ')!important}',
				// 二级玻璃层(侧栏):z-index:-1 沉到内容之下(不糊掉侧栏文字,问题62);
				// 只模糊"侧栏背后"的页面氛围层。折射滤镜仅此处与二级表面使用(纯装饰层
				// 无定位子树,无包含块风险)。::after 携带鼠标流光。
				".dsh-vt-glasspane{position:absolute;inset:0;z-index:-1;pointer-events:none;border-radius:inherit;backdrop-filter:" + f2 + ";-webkit-backdrop-filter:" + f2 + ";background:linear-gradient(160deg, rgba(255,255,255," + (dark ? ".06" : ".10") + "), rgba(255,255,255,0) 45%)}",
				".dsh-vt-glasspane::after{content:'';position:absolute;inset:0;border-radius:inherit;background:radial-gradient(300px circle at var(--lg-px,50vw) var(--lg-py,50vh), rgba(255,255,255," + (dark ? ".09" : ".14") + "), transparent 65%)}",
			].join("");
		}

		// [问题59] backdrop-filter 对 SVG url() 滤镜引用的支持探测(一次性):不支持则
		// 折射降级为纯模糊,其余层(流光/深度/张力)不受影响。
		var _glassSvgOk = null;
		function glassSvgSupported() {
			if (_glassSvgOk !== null) return _glassSvgOk;
			_glassSvgOk = false;
			try {
				var t = document.createElement("div");
				t.style.display = "none";
				document.body.appendChild(t);
				t.style.backdropFilter = "url(#dsh-lg-refract) blur(2px)";
				var v = getComputedStyle(t).backdropFilter || getComputedStyle(t).webkitBackdropFilter || "";
				_glassSvgOk = v.indexOf("url") >= 0;
				t.remove();
			} catch (e) { /* 保持降级 */ }
			return _glassSvgOk;
		}

		// [问题59] 折射滤镜 SVG(隐藏):低频噪声驱动的位移图 → 透过玻璃的背景产生
		// 微妙透镜扭曲。scale 6 保持可读性;玻璃关闭/壁纸态移除。
		function syncGlassSvg(enable) {
			if (typeof document === "undefined") return;
			var ex = document.getElementById("dsh-lg-svg");
			if (enable) {
				if (ex) return;
				var s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
				s.id = "dsh-lg-svg";
				s.setAttribute("width", "0"); s.setAttribute("height", "0");
				s.style.cssText = "position:absolute;width:0;height:0;overflow:hidden";
				s.setAttribute("aria-hidden", "true");
				s.innerHTML = '<defs><filter id="dsh-lg-refract" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency="0.007 0.011" numOctaves="2" seed="7" stitchTiles="stitch" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="6" xChannelSelector="R" yChannelSelector="G"/></filter></defs>';
				document.body.appendChild(s);
			} else if (ex) {
				ex.remove();
			}
		}

		// [问题59] 指针跟踪:rAF 节流更新 --lg-px/--lg-py(视口坐标),供玻璃边缘
		// 高光径向渐变用;玻璃关闭时解绑并清变量。单例防重复绑定。
		var _lgTrack = null;
		function syncGlassTracking(enable) {
			if (typeof document === "undefined") return;
			if (enable) {
				if (_lgTrack) return;
				var x = -1, y = -1, raf = 0;
				var onMove = function (e) {
					x = e.clientX; y = e.clientY;
					if (!raf) raf = window.requestAnimationFrame(function () {
						raf = 0;
						document.documentElement.style.setProperty("--lg-px", x + "px");
						document.documentElement.style.setProperty("--lg-py", y + "px");
					});
				};
				document.addEventListener("mousemove", onMove, { passive: true });
				_lgTrack = onMove;
				// mask 边缘化能力探测(一次性):支持才挂 html.dsh-lg-mask
				try {
					var p = document.createElement("div");
					p.style.display = "none"; document.body.appendChild(p);
					p.style.setProperty("mask-composite", "exclude");
					if ((getComputedStyle(p).maskComposite || "").indexOf("exclude") >= 0) document.documentElement.classList.add("dsh-lg-mask");
					p.remove();
				} catch (e) { /* 不边缘化亦可 */ }
			} else if (_lgTrack) {
				document.removeEventListener("mousemove", _lgTrack);
				_lgTrack = null;
				document.documentElement.style.removeProperty("--lg-px");
				document.documentElement.style.removeProperty("--lg-py");
			}
		}

		/** [问题76→问题77] 侧栏氛围渐变(壁纸态):多停靠点主题感知轻纱(上浓下淡),
		 *  托住侧栏内容又透出壁纸。inline 注入胜过白边透明链的 stylesheet !important;
		 *  关闭/非壁纸态清除。侧栏根未挂载时短退避重试(页面启动早期皮肤状态先到)。 */
		function syncSidebarVeil(enable, gradient, tries) {
			if (typeof document === "undefined") return;
			var root = document.querySelector('div[data-slot="sidebar"]>div[class*="_root"]');
			if (!root) {
				tries = tries || 0;
				if (enable && tries < 30) window.setTimeout(function () { syncSidebarVeil(enable, gradient, tries + 1); }, 200);
				return;
			}
			if (enable) {
				root.style.setProperty('background-image', gradient, 'important');
			} else {
				root.style.removeProperty('background-image');
			}
		}

		/** [R48/问题56] 侧栏玻璃层:无壁纸且玻璃开启时,在侧栏根首位插入 absolute 玻璃层
		 *  (backdrop-filter 若直接加在侧栏根会创建包含块,把内部 fixed 设置 overlay 困住);
		 * 关闭/壁纸态移除。侧栏根未挂载时短退避重试。 */
		function syncGlassPane(enable, tries) {
			if (typeof document === "undefined") return;
			var root = document.querySelector('div[data-slot="sidebar"]>div[class*="_root"]');
			if (!root) {
				tries = tries || 0;
				if (enable && tries < 30) window.setTimeout(function () { syncGlassPane(enable, tries + 1); }, 200);
				return;
			}
			var pane = root.querySelector(':scope > .dsh-vt-glasspane');
			if (enable) {
				if (!pane) {
					pane = document.createElement('div');
					pane.className = 'dsh-vt-glasspane';
					root.insertBefore(pane, root.firstChild);
				}
			} else if (pane) {
				pane.remove();
			}
		}

		/** 将皮肤状态渲染为背景层(img/video)+ 透明化样式 + 氛围音频。 */
		function applySkinVisual(state) {
			state = state || {};
			lastSkinState = state;
			var style = document.getElementById(BG_STYLE_ID);
			if (!style) {
				style = document.createElement("style");
				style.id = BG_STYLE_ID;
				document.head.appendChild(style);
			}
			// [b13] 实测本标签曾被外部挂上他插件的 data-plugin 归属标记——清除之,
			// 防他插件卸载清理按 data-plugin 寻址时误删本玻璃/透明化样式。
			style.removeAttribute("data-plugin");
			var hasBg = !!(state.bg && state.bg.url);
			if (hasBg) {
				var dim = typeof state.dim === "number" ? state.dim : 0.45;
				// [问题72→问题76→问题77] 可读性氛围补偿(非包围层):不新增白框/边框/卡片,
				// 主题感知的低透明度多停靠点渐变+两级交互反馈+双层细阴影托住内容。
				var darkBg = false;
				try { darkBg = (getComputedStyle(document.documentElement).colorScheme || "").indexOf("dark") >= 0; } catch (e) { /* 默认浅色 */ }
				// [问题77] 侧栏氛围渐变改 4 停靠点(0/42/78/100%):两端各加一档过渡,
				// 消除 2 停靠点在中段的色阶分界感;整体仍是上浓下淡保住壁纸纵深。
				var veilGrad = darkBg
					? "linear-gradient(180deg,rgba(10,12,18,.32) 0%,rgba(10,12,18,.20) 42%,rgba(10,12,18,.10) 78%,rgba(10,12,18,.06) 100%)"
					: "linear-gradient(180deg,rgba(255,255,255,.26) 0%,rgba(255,255,255,.17) 42%,rgba(255,255,255,.09) 78%,rgba(255,255,255,.05) 100%)";
				// [问题77] 交互反馈拆两级:悬停更柔、选中略深,层次更分明;无边框
				var veilHover = darkBg ? "rgba(255,255,255,.08)" : "rgba(255,255,255,.30)";
				var veilSelected = darkBg ? "rgba(255,255,255,.13)" : "rgba(255,255,255,.38)";
				// 小控件轻纱(列表头/设置入口/功能卡):与悬停同族略浅,静息更安静
				var veilSoft = darkBg ? "rgba(255,255,255,.08)" : "rgba(255,255,255,.24)";
				// [问题77] 关键承载层(输入卡/设置面板):不透明度略降+模糊半径加大,
				// 内容仍清晰而壁纸/玻璃质感更充分透出;饱和度微提补偿磨砂后的灰化
				var veilPanel = darkBg ? "rgba(12,14,20,.46)" : "rgba(255,255,255,.40)";
				var veilBlur = "blur(22px) saturate(1.4)";
				// [问题77] 双层阴影:贴近细影钉住表面+大半径漫射影给纵深,
				// 透明度均低于单层旧值,避免生硬压黑/压白
				var veilShadow = darkBg ? "0 1px 2px rgba(0,0,0,.32),0 10px 30px rgba(0,0,0,.34)" : "0 1px 2px rgba(0,0,0,.05),0 10px 30px rgba(0,0,0,.12)";
				var veilShadowSoft = darkBg ? "0 1px 2px rgba(0,0,0,.22),0 6px 16px rgba(0,0,0,.20)" : "0 1px 2px rgba(0,0,0,.04),0 6px 16px rgba(0,0,0,.08)";
				// [问题77] 文字轻影微调:暗主题改双层细影(偏移收窄+补一档贴身微影),
				// 亮主题白柔光模糊收窄一档,清晰但不产生光晕感
				var veilTextShadow = darkBg ? "0 1px 2px rgba(0,0,0,.45),0 0 1px rgba(0,0,0,.18)" : "0 1px 2px rgba(255,255,255,.45)";
				style.textContent = [
					"#" + BG_LAYER_ID + "{position:fixed;inset:0;z-index:0;pointer-events:none;overflow:hidden}",
					"#" + BG_LAYER_ID + " img,#" + BG_LAYER_ID + " video{width:100%;height:100%;object-fit:cover;display:block}",
					"#" + BG_LAYER_ID + "::after{content:'';position:absolute;inset:0;background:rgba(0,0,0," + dim + ")}",
					// 框架层级透明让背景透出;列内表面(气泡/卡片/输入区)自带背景保证可读。
					// [fix] 原来只透到 depth 4(slot 元素),而侧栏(hHd-Xa_root)与中列
					// (my0TNq_root)的 CSS Modules 包装器在 depth 5 且不透明,壁纸被整屏
					// 盖住"不生效"。哈希类名随 dsh 构建变化,故按 data-slot 结构寻址。
				// [fix] 白边根治:body 自身是白底,皮肤层只是"盖住"它——任何盖不住的
				// 像素(亚像素缝/滚动条轨道/overscroll/img 加载前白闪)都会露白。
				// 皮肤启用期间把 html/body 也透明化,兜底色变成皮肤层本身。
				"html,body{background:transparent!important}",
				"#root{background:transparent!important}",
				"#root>div[data-slot=root]{background:transparent!important}",
				"#root>div[data-slot=root]>div{background:transparent!important}",
				"#root>div[data-slot=root]>div>div{background:transparent!important}",
				// [fix] slot 元素自身(depth 4)与各列内容根(depth 5,含 details 列的
				// 1px 纯白竖条 _root,位于会话区/详情列分界)一并透明——只写
				// sidebar/conversation 两支时 details 列包装器残留白边。
				"#root>div[data-slot=root]>div>div>div{background:transparent!important}",
				"#root>div[data-slot=root]>div>div>div>*{background:transparent!important}",
				'div[data-slot="sidebar"]>*{background:transparent!important}',
				'div[data-slot="conversation"]>*{background:transparent!important}',
					// [fix] 列包装器上的 0.667px 浅色分隔线(如 sidebarCol 右缘 rgba(0,0,0,.04))
				// 在深色壁纸上呈"轻微白边",一并透明化。壳内层级:
				// #root > [data-slot=root] > frame > sidebarCol/conversationCol > [data-slot=*] > 内容
			'#root>div[data-slot=root]>div{border-color:transparent!important}',
			'#root>div[data-slot=root]>div>div{border-color:transparent!important}',
			'#root>div[data-slot=root]>div>div>div{border-color:transparent!important}',
			'#root>div[data-slot=root]>div>div>div>*{border-color:transparent!important}',
			'div[data-slot="sidebar"],div[data-slot="sidebar"]>*{border-color:transparent!important}',
			'div[data-slot="conversation"],div[data-slot="conversation"]>*{border-color:transparent!important}',
				// [fix] 白框根治(第三层):页面底色"渐变渐隐遮罩"走 background-image,
				// background-color 透明链管不到,皮肤启用时褪成白条/白框:
				// 1) 会话视图 composer 底座输入遮罩(transparent → bg-base 36px,sticky z7,
				//    占满中列底部约 150px)——data-composer-seat 是上游契约属性(测试同名寻址),
				//    哈希类名随构建变化不可用。
				// 2) 侧栏工作区列表底部渐隐(transparent → sidebar-fill,24px)——按 slot 锚定
				//    + CSS Modules 语义后缀 _fade(哈希前缀随版本浮动,后缀稳定)。
				// 遮罩本意是把滚动内容融进页面底色;皮肤下底色即壁纸,去掉渐变即融合,
				// 气泡/输入卡等表面自带背景,可读性不受影响。
				'div[data-composer-seat]{background-image:none!important}',
				'div[data-slot="sidebar.workspaces"] [class*="_fade"]{background-image:none!important}',
				// [问题44] 最大化透明:白面的单一来源是 --dsw-* 背景令牌(浅色=bluish-00 纯白/
				// deepseek-50 浅蓝)。令牌寻址不受哈希类名与主题切换影响,把白底源令牌置透明,
				// 一切引用它们的上游表面(消息卡/输入卡/气泡/菜单/侧栏填充/表格/代码块/弹窗)
				// 一并透明,壁纸全透出;可读性由 dim 暗化层兜底。:root 盖浅色定义,
				// body!important 盖深色主题在 body 上的重定义(直接声明胜过继承,须同层!important)。
				":root,body{--dsw-alias-bg-base:transparent!important;--dsw-alias-bg-layer-1:transparent!important;--dsw-alias-bg-layer-2:transparent!important;--dsw-alias-bg-layer-3:transparent!important;--dsw-specific-sidebar-fill:transparent!important;--dsw-specific-menu:transparent!important;--dsw-specific-bubble:transparent!important;--dsw-specific-bubble-highlight:transparent!important;--dsw-alias-button-elevated-fill:transparent!important;--dsw-alias-button-floating-fill:transparent!important}",
				// [问题49] 白块补漏:R33 清单外的白底源令牌——设置页下拉选择器/主题方块
				// (bg-module-platform)、弹层背景(bg-overlay)、多选/ghost 激活/悬停实色
				// (multi-select/ghost-active-fill/hover-solid/floating-hover) 与拖拽白蒙层
				// (mask-drop) 仍是浅色实色,皮肤下呈白块。同法置透明,一切引用面一并盖掉。
				":root,body{--dsw-alias-bg-module-platform:transparent!important;--dsw-alias-bg-multi-select:transparent!important;--dsw-alias-bg-overlay:transparent!important;--dsw-alias-button-ghost-active-fill:transparent!important;--dsw-alias-interactive-bg-hover-solid:transparent!important;--dsw-alias-button-floating-hover:transparent!important;--dsw-alias-bg-mask-drop:transparent!important}",
				// [问题49] 白块补漏(续):活体枚举浅色实色令牌后补入——设置导航激活/悬停
				// (sidebar-nav-item-*)、下拉选择器(specific-selector)、ghost 悬停/暗主键、
				// markdown 引用/代码块横幅/行内码/占位/标签、输入面(input-major/login-input)
				// 与提示块(tip)。排除 label-*-foreground/inverted(前景白字非背景)与
				// static-* 色板(语义色相底色保留,如成功/警告三级色)。
				":root,body{--dsw-specific-sidebar-nav-item-active:transparent!important;--dsw-specific-sidebar-nav-item-hover:transparent!important;--dsw-specific-selector:transparent!important;--dsw-specific-input-major:transparent!important;--dsw-specific-login-input:transparent!important;--dsw-specific-tip:transparent!important;--dsw-alias-button-ghost-active-hover:transparent!important;--dsw-alias-button-primary-dimmed:transparent!important;--dsw-alias-markdown-citation:transparent!important;--dsw-alias-markdown-code-block-banner:transparent!important;--dsw-alias-markdown-code-block:transparent!important;--dsw-alias-markdown-inline-code:transparent!important;--dsw-alias-markdown-placeholder:transparent!important;--dsw-alias-markdown-tag:transparent!important}",
				// 硬编码白底兜底:输入卡不走背景令牌(实测 rgb(255,255,255))。data-composer-card
				// 是上游契约属性(测试同名寻址)。[问题76] 半透明磨砂承载层(无边框):
				// 托住模型选择器/权限标签/按钮群,壁纸从磨砂层透出,不形成白框观感。
				"[data-composer-card]{background:" + veilPanel + "!important;backdrop-filter:" + veilBlur + "!important;-webkit-backdrop-filter:" + veilBlur + "!important;box-shadow:" + veilShadow + "!important}",
				// 硬编码白底兜底(续):代码块/行内代码不走背景令牌(实测 rgb(249,250,251)/rgb(235,238,242))。
				// md-code-block 是上游语义类(非哈希)可稳定寻址;容器留 5% 白底+模糊保代码区可辨,
				// 内部 pre/banner 子层透明避免叠白。
				'.md-code-block{background:rgba(255,255,255,.05)!important;backdrop-filter:blur(2px)}',
				'.md-code-block pre,.md-code-block [class*="_banner"]{background:transparent!important}',
				'[data-chat-flow] code:not(pre code),[data-slot="conversation.chat.node"] code:not(pre code){background:rgba(255,255,255,.08)!important}',
				// ---- [问题76→问题77] 可读性氛围补偿(壁纸态)第三轮精调:多停靠点渐变/两级交互态/双层细影 ----
				// 仅 background/box-shadow/text-shadow/transition,不动布局与皮肤透明链;规则全在本
				// style 标签内,皮肤关闭即整体移除,默认态零影响。选择器用语义后缀(哈希前缀浮动)。
				// 1) 会话行:静息态不加底板;悬停柔反馈、选中略深(两级),底色过渡平滑不闪跳。
				'div[data-slot="sidebar.workspaces"] [class*="sessionRow"]{transition:background-color .18s ease}',
				'div[data-slot="sidebar.workspaces"] [class*="sessionRow"]:hover{background:' + veilHover + '!important;border-radius:inherit}',
				'div[data-slot="sidebar.workspaces"] [class*="sessionRow"][class*="selected"]{background:' + veilSelected + '!important;border-radius:inherit}',
				// 2) 工作区列表头与侧栏底部设置入口:轻纱托控件;入口悬停/键盘焦点加深反馈,无边框。
				'div[data-slot="sidebar.workspaces"] [class*="sectionHeader"]{background:' + veilSoft + '!important;border-radius:10px}',
				'div[data-slot="sidebar"] button[class*="trigger"]{background:' + veilSoft + '!important;border-radius:10px;transition:background-color .18s ease}',
				'div[data-slot="sidebar"] button[class*="trigger"]:hover,div[data-slot="sidebar"] button[class*="trigger"]:focus-visible{background:' + veilHover + '!important}',
				// 3) 侧栏/工作区文字轻影:暗主题双层细影托浅字,亮主题白柔光分离深字(不描边)。
				'div[data-slot="sidebar.workspaces"],div[data-slot="sidebar"] button[class*="trigger"]{text-shadow:' + veilTextShadow + '}',
				// 4) 中栏工作区空态功能卡:轻纱底+双层柔影;悬停底色与阴影同步加深一档,有层次。
				'button[class*="paneCard"]{background:' + veilSoft + '!important;box-shadow:' + veilShadowSoft + '!important;transition:background-color .18s ease,box-shadow .18s ease}',
				'button[class*="paneCard"]:hover{background:' + veilHover + '!important;box-shadow:' + veilShadow + '!important}',
				// 5) 设置面板半透明磨砂承载层:导航/区段/行卡全部托住,壁纸从磨砂透出。
				//    本版本面板无 role=dialog,按语义后缀 _panel 寻址(排除 panelBody 防双层模糊);
				//    面板自身即 overlay 根,无 fixed 后代,backdrop-filter 无包含块风险。
				'[class*="_panel"]:not([class*="panelBody"]){background:' + veilPanel + '!important;backdrop-filter:' + veilBlur + '!important;-webkit-backdrop-filter:' + veilBlur + '!important;box-shadow:' + veilShadow + '!important}',
				].join("");
			} else {
				// [R48→问题71] 无壁纸时:仅当 glass 显式为 true 才应用毛玻璃;
				// 状态缺失/壳不可达/旧壳丢字段一律视为关,杜绝默认自启。
				style.textContent = state.glass === true ? glassCss() : "";
			}
			var layer = document.getElementById(BG_LAYER_ID);
			if (hasBg) {
				if (!layer) { layer = document.createElement("div"); layer.id = BG_LAYER_ID; document.body.prepend(layer); }
				var wantTag = state.bg.kind === "video" ? "VIDEO" : "IMG";
				var media = layer.firstElementChild;
				if (!media || media.tagName !== wantTag) {
					if (media) media.remove();
					if (wantTag === "VIDEO") {
						media = document.createElement("video");
						media.autoplay = true; media.loop = true; media.muted = false; media.playsInline = true;
						media.volume = typeof state.volume === "number" ? state.volume : 0.35;
					} else {
						media = document.createElement("img");
						media.alt = "";
					}
					layer.appendChild(media);
				}
				if (media.getAttribute("src") !== state.bg.url) media.setAttribute("src", state.bg.url);
				if (wantTag === "VIDEO" && typeof state.volume === "number") media.volume = state.volume;
				skinMedia.video = wantTag === "VIDEO" ? media : null;
				if (wantTag === "VIDEO") skinPlay(media);
			} else if (layer) {
				skinMedia.video = null;
				layer.remove();
			}
			// [问题76→问题77] 侧栏氛围渐变:inline 注入(stylesheet 规则会被白边透明链的
			// div[data-slot="sidebar"]>*{background:transparent!important} 盖掉);
			// 皮肤关闭时清除。侧栏未挂载时短退避重试(同 syncGlassPane)。
			syncSidebarVeil(hasBg, hasBg ? veilGrad : null);
			// [R48/问题56→问题71] 侧栏玻璃层:无壁纸且 glass 显式 true 才注入;
			// 其余情况移除(状态缺失默认关,避免壁纸透明化/关闭态残留与默认自启)。
			var glassActive = !hasBg && state.glass === true;
			syncGlassPane(glassActive);
			// [问题59] 液态玻璃配套:折射滤镜 SVG + 指针跟踪高光,随玻璃开关同生共死
			syncGlassSvg(glassActive);
			syncGlassTracking(glassActive);
			var audioEl = document.getElementById(AUDIO_ID);
			if (state.audio && state.audio.url) {
				if (!audioEl) {
					audioEl = document.createElement("audio");
					audioEl.id = AUDIO_ID;
					audioEl.loop = true;
					document.body.appendChild(audioEl);
				}
				if (audioEl.getAttribute("src") !== state.audio.url) audioEl.setAttribute("src", state.audio.url);
				audioEl.volume = typeof state.volume === "number" ? state.volume : 0.35;
				skinMedia.audio = audioEl;
				skinPlay(audioEl);
			} else if (audioEl) {
				skinMedia.audio = null;
				audioEl.remove();
			}
		}

		function fmtSize(n) {
			if (!n) return "0 B";
			if (n < 1024) return n + " B";
			if (n < 1048576) return (n / 1024).toFixed(1) + " KB";
			if (n < 1073741824) return (n / 1048576).toFixed(1) + " MB";
			return (n / 1073741824).toFixed(2) + " GB";
		}

		// ---------- [问题4] 提示词增强已拆出为独立插件 dsh-enhance-prompt(2026-08),
		// EnhancePromptButton 与 conversation.input.right slot 注入不再由 dshvt 提供,避免双挂载 ----------

		function SkinTab(props) {
			var h = react.createElement;
			var st = react.useState({ status: "loading" });
			var setSt = st[1];
			var we = react.useState({ status: "loading" });
			var setWe = we[1];
			var msg = react.useState("");
			var setMsg = msg[1];
			var busy = react.useState(false);
			var setBusy = busy[1];
			var confirmDel = react.useState(null);
			var setConfirmDel = confirmDel[1];
			var fileRef = react.useRef(null);
			// [R19] 皮肤中心安装态:on=已启用 / off=未装或停用 / loading=检测中
			var scPhase = react.useState("loading");
			var setScPhase = scPhase[1];
			react.useEffect(function () {
				if (!props || !props.checkSkinCenter) { setScPhase("unknown"); return; }
				props.checkSkinCenter().then(setScPhase).catch(function () { setScPhase("unknown"); });
			}, []);
			// [问题1] 宠物插件安装态(入口卡显示)
			var petPhase = react.useState("loading");
			var setPetPhase = petPhase[1];
			react.useEffect(function () {
				if (!props || !props.checkPet) { setPetPhase("unknown"); return; }
				props.checkPet().then(setPetPhase).catch(function () { setPetPhase("unknown"); });
			}, []);

			var loadAssets = function () {
				return api("/skin/assets").then(function (r) {
					setSt({ status: "ready", assets: r.assets || [], state: r.state || {} });
					applySkinVisual(r.state);
				}).catch(function (e) { setSt({ status: "error", message: String((e && e.message) || e) }); });
			};
			var loadWallpapers = function () {
				api("/skin/wallpapers").then(function (r) {
					setWe({ status: "ready", installed: !!r.installed, wallpapers: r.wallpapers || [], root: r.root });
				}).catch(function (e) { setWe({ status: "error", message: String((e && e.message) || e) }); });
			};
			react.useEffect(function () { loadAssets(); loadWallpapers(); }, []);

			var patchState = function (patch, done) {
				api("/skin/state", {
					method: "POST", headers: { "Content-Type": "application/json" },
					body: JSON.stringify(patch),
				}).then(function (r) {
					if (!r.ok) { setMsg(r.error || "保存失败"); return; }
					// [问题60] 旧壳(如 Temp 便携版残留)的 setSkinState 会丢弃未知字段
					// (glass),返回 state 不含请求值 → 开关视觉不切换。以请求值并入
					// 返回态(请求即意图),开关/应用立即生效;新壳两者本就一致。
					var merged = Object.assign({}, r.state || {}, patch);
					applySkinVisual(merged);
					setSt(function (prev) { return { status: "ready", assets: prev.assets || [], state: merged }; });
					if (done) done();
				}).catch(function (e) { setMsg("请求失败: " + e.message); });
			};

			var onFile = function (ev) {
				var file = ev.currentTarget.files && ev.currentTarget.files[0];
				ev.currentTarget.value = "";
				if (!file) return;
				setBusy(true);
				setMsg("正在导入 " + file.name + "(" + fmtSize(file.size) + ")…");
				fetch(SHELL_API + "/skin/upload", {
					method: "POST",
					headers: { "Content-Type": "application/octet-stream", "x-filename": encodeURIComponent(file.name) },
					body: file,
				}).then(function (r) { return r.json(); }).then(function (r) {
					setBusy(false);
					if (!r.ok) { setMsg(r.error || "导入被拒绝"); return; }
					setSt(function (prev) { return { status: "ready", assets: r.assets || [], state: prev.state || {} }; });
					setMsg("已导入 " + file.name + "。");
					var kind = (r.assets || []).filter(function (a) { return a.name === file.name; })[0];
					// 图片/视频导入后直接应用为背景,音频导入后待用户手动播放
					if (kind && (kind.kind === "image" || kind.kind === "video")) {
						patchState({ bg: { kind: kind.kind, url: SHELL_API + kind.url, name: kind.name } }, function () { setMsg("已导入并应用为背景: " + file.name); });
					}
				}).catch(function (e) { setBusy(false); setMsg("导入失败: " + e.message); });
			};

			var applyAsset = function (a) {
				if (a.kind === "audio") {
					patchState({ audio: { url: SHELL_API + a.url, name: a.name } }, function () { setMsg("开始循环播放 " + a.name); });
				} else {
					patchState({ bg: { kind: a.kind, url: SHELL_API + a.url, name: a.name } }, function () { setMsg("已应用背景 " + a.name); });
				}
			};

			var applyWallpaper = function (w) {
				patchState({ bg: { kind: "video", url: SHELL_API + w.videoUrl, name: "WE · " + w.title } }, function () { setMsg("已应用 Wallpaper Engine 壁纸: " + w.title); });
			};

			var doDelete = function (a) {
				setBusy(true);
				api("/skin/delete", {
					method: "POST", headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ name: a.name }),
				}).then(function (r) {
					setBusy(false); setConfirmDel(null);
					if (!r.ok) { setMsg(r.error || "删除被拒绝"); return; }
					setSt(function (prev) { return { status: "ready", assets: r.assets || [], state: prev.state || {} }; });
					setMsg("已删除 " + a.name);
				}).catch(function (e) { setBusy(false); setConfirmDel(null); setMsg("请求失败: " + e.message); });
			};

			if (st[0].status === "loading") return h("div", { className: "pm_root" }, h("div", { className: "pm_msg" }, "正在读取皮肤资产…"));
			if (st[0].status === "error") return h("div", { className: "pm_root" },
				h("div", { className: "pm_msg pm_msgErr" }, "读取失败(壳未运行?) " + st[0].message),
				h("button", { className: "pm_btn", onClick: function () { loadAssets(); } }, "重试"));

			var cur = st[0].state || {};
			var assets = st[0].assets || [];

			var bgRow = h("div", { className: "cm_row" },
				h("div", { className: "cm_icon" }, "背"),
				h("div", { className: "cm_main" },
					h("div", { className: "cm_titleRow" },
						h("span", { className: "cm_name" }, cur.bg ? cur.bg.name : "无背景"),
						cur.bg ? h("span", { className: "cm_src" }, SKIN_KIND_ZH[cur.bg.kind] || cur.bg.kind) : h("span", { className: "cm_src" }, "默认")),
					h("div", { className: "cm_desc" }, "遮罩浓度 " + Math.round((cur.dim === undefined ? 0.45 : cur.dim) * 100) + "%(压暗背景保证内容可读)")),
				h("div", { className: "cm_side" },
					h("input", {
						type: "range", min: "0", max: "90", step: "5",
						value: Math.round((cur.dim === undefined ? 0.45 : cur.dim) * 100),
						title: "背景遮罩浓度", "aria-label": "背景遮罩浓度",
						onChange: function (ev) { patchState({ dim: parseInt(ev.currentTarget.value, 10) / 100 }); },
					}),
					cur.bg ? h("button", { className: "pm_btn", onClick: function () { patchState({ bg: null }, function () { setMsg("已恢复默认背景"); }); } }, "关闭背景") : null));

			var audioRow = h("div", { className: "cm_row" },
				h("div", { className: "cm_icon" }, "音"),
				h("div", { className: "cm_main" },
					h("div", { className: "cm_titleRow" },
						h("span", { className: "cm_name" }, cur.audio ? cur.audio.name : "无氛围音频"),
						cur.audio ? h("span", { className: "cm_src" }, "循环") : null),
					h("div", { className: "cm_desc" }, "音量 " + Math.round((cur.volume === undefined ? 0.35 : cur.volume) * 100) + "%")),
				h("div", { className: "cm_side" },
					cur.audio ? h("input", {
						type: "range", min: "0", max: "100", step: "5",
						value: Math.round((cur.volume === undefined ? 0.35 : cur.volume) * 100),
						title: "氛围音频音量", "aria-label": "氛围音频音量",
						onChange: function (ev) { patchState({ volume: parseInt(ev.currentTarget.value, 10) / 100 }); },
					}) : null,
					cur.audio ? h("button", { className: "pm_btn", onClick: function () { patchState({ audio: null }, function () { setMsg("已停止氛围音频"); }); } }, "停止") : null));

			// [R48→问题71] 液态玻璃开关:仅默认官方皮肤(无壁纸)生效;壁纸启用时置灰提示。
			// 默认关(显式 true 才开):避免启动/切模块时状态缺失导致玻璃被误点亮。
			var glassOn = cur.glass === true;
			var glassDisabled = !!cur.bg;
			var glassRow = h("div", { className: "cm_row" + (glassDisabled ? " cm_rowOff" : "") },
				h("div", { className: "cm_icon" }, "玻"),
				h("div", { className: "cm_main" },
					h("div", { className: "cm_titleRow" },
						h("span", { className: "cm_name" }, "液态玻璃效果"),
						h("span", { className: "cm_src" }, "仅官方皮肤")),
					h("div", { className: "cm_desc" }, glassDisabled
						? "当前已启用自定义壁纸——液态玻璃仅在默认官方皮肤下生效,关闭背景后可用。"
						: "聊天输入框/侧边栏/设置面板/工作区面板应用毛玻璃+微折射+半透明层次;关闭则回原生纯色。")),
				h("div", { className: "cm_side" },
					h("button", {
						type: "button",
						className: "cm_sw" + (glassOn && !glassDisabled ? " cm_swOn" : ""),
						disabled: glassDisabled,
						"aria-pressed": glassOn && !glassDisabled,
						"aria-label": "液态玻璃效果开关",
						title: glassDisabled ? "启用自定义壁纸时不可用" : "切换液态玻璃效果",
						onClick: function () { patchState({ glass: !glassOn }, function () { setMsg(!glassOn ? "液态玻璃已开启" : "液态玻璃已关闭,恢复原生样式"); }); },
					}, h("span", { className: "cm_swDot" }))));

			var assetRows = assets.map(function (a) {
				var confirming = confirmDel[0] === a.name;
				var isBg = !!(cur.bg && cur.bg.url && cur.bg.url.indexOf(encodeURIComponent(a.name)) >= 0 && cur.bg.url.indexOf("/skin/asset/") >= 0);
				var isAudio = !!(cur.audio && cur.audio.url && cur.audio.url.indexOf(encodeURIComponent(a.name)) >= 0);
				return h("div", { key: a.name, className: "cm_row" },
					a.kind === "image"
						? h("img", { className: "sk_thumb", src: SHELL_API + a.url, alt: "", loading: "lazy" })
						: h("div", { className: "cm_icon" }, a.kind === "video" ? "▶" : "♪"),
					h("div", { className: "cm_main" },
						h("div", { className: "cm_titleRow" },
							h("span", { className: "cm_name", title: a.name }, a.name),
							h("span", { className: "cm_src" }, SKIN_KIND_ZH[a.kind] + " · " + fmtSize(a.size)),
							isBg ? h("span", { className: "cm_src" }, "当前背景") : null,
							isAudio ? h("span", { className: "cm_src" }, "播放中") : null),
						confirming ? h("div", { className: "cm_confirm" },
							h("span", { className: "cm_confirmTxt" }, "删除文件 " + a.name + "？"),
							h("button", { className: "cm_btnDanger", disabled: busy[0], onClick: function () { doDelete(a); } }, "删除"),
							h("button", { className: "cm_btnGhost", onClick: function () { setConfirmDel(null); } }, "取消")) : null),
					confirming ? null : h("div", { className: "cm_side" },
						h("button", { className: "pm_btn", disabled: busy[0], onClick: function () { applyAsset(a); } },
							a.kind === "audio" ? (isAudio ? "重启" : "播放") : "设为背景"),
						h("button", { className: "cm_del", title: "删除", disabled: busy[0], onClick: function () { setConfirmDel(a.name); },
							"aria-label": "删除 " + a.name, dangerouslySetInnerHTML: { __html: TRASH_SVG } })));
			});
			if (!assetRows.length) assetRows = [h("div", { key: "empty", className: "pm_msg" }, "尚无自定义资产。点击「导入文件」添加 jpg/png/gif、mp4/webm 或 mp3/wav 等。")];

			var weBody;
		if (we[0].status === "loading") weBody = h("div", { className: "pm_msg" }, "正在扫描 Wallpaper Engine 创意工坊…");
		else if (we[0].status === "error") weBody = h("div", { className: "pm_msg pm_msgErr" }, "扫描失败: " + we[0].message);
		else if (!we[0].installed) weBody = h("div", { className: "pm_msg" }, "未检测到 Wallpaper Engine(找不到 Steam 创意工坊目录 steamapps/workshop/content/431960)。安装 WE 并订阅壁纸后重试。");
		else {
			var wps = we[0].wallpapers || [];
			var usable = wps.filter(function (w) { return w.supported; });
			var wRows = usable.map(function (w) {
				var isBg = !!(cur.bg && cur.bg.url && cur.bg.url.indexOf("/skin/we/" + w.id + "/") >= 0);
				return h("div", { key: w.id, className: "cm_row" },
					w.previewUrl ? h("img", { className: "sk_thumb sk_thumbW", src: SHELL_API + w.previewUrl, alt: "", loading: "lazy" }) : h("div", { className: "cm_icon" }, "W"),
					h("div", { className: "cm_main" },
						h("div", { className: "cm_titleRow" },
							h("span", { className: "cm_name", title: w.title }, w.title),
							h("span", { className: "cm_src" }, "video"),
							isBg ? h("span", { className: "cm_src" }, "当前背景") : null),
						h("div", { className: "cm_desc" }, "创意工坊 #" + w.id)),
					h("div", { className: "cm_side" },
						isBg ? h("button", { className: "pm_btn", onClick: function () { patchState({ bg: null }); } }, "关闭") :
							h("button", { className: "pm_btn", disabled: busy[0], onClick: function () { applyWallpaper(w); } }, "应用")));
			});
			// [fix] 不可用条目按真实原因分类展示(scene/web/未下载),不再合并计数误导;
			// 未下载 = 创意工坊条目在但声明的视频文件缺失(下载被清理),Steam 重下即恢复。
			var WE_NA_DESC = {
				scene: "打包格式(scene),暂不支持应用",
				web: "HTML 页面壁纸,暂不支持应用",
				incomplete: "视频文件缺失,在 Steam 中重新下载后可用",
			};
			var others = wps.filter(function (w) { return !w.supported; });
			var oRows = others.map(function (w) {
				// 兼容旧壳数据:incomplete 字段缺失时按 video+不可用 推导为未下载
				var isIncomplete = w.incomplete || (w.type === "video" && !w.supported);
				var why = isIncomplete ? "incomplete" : (w.type === "web" ? "web" : "scene");
				return h("div", { key: w.id, className: "cm_row cm_rowOff" },
					w.previewUrl ? h("img", { className: "sk_thumb sk_thumbW", src: SHELL_API + w.previewUrl, alt: "", loading: "lazy" }) : h("div", { className: "cm_icon" }, "W"),
					h("div", { className: "cm_main" },
						h("div", { className: "cm_titleRow" },
							h("span", { className: "cm_name", title: w.title }, w.title),
							h("span", { className: "cm_src" }, w.type === "web" ? "web" : (isIncomplete ? "未下载" : "scene"))),
						h("div", { className: "cm_desc" }, WE_NA_DESC[why])));
			});
			weBody = h("div", { className: "pm_list" },
				wRows.length ? wRows : [h("div", { key: "we-empty", className: "pm_msg" }, "创意工坊中没有可直接应用的视频壁纸。")],
				oRows.length ? [h("div", { key: "we-na-h", className: "sec_h" }, "暂不支持(" + oRows.length + ")")].concat(oRows) : null);
		}

		var msgCls = "pm_msg" + (msg[0].indexOf("失败") >= 0 || msg[0].indexOf("拒绝") >= 0 ? " pm_msgErr" : msg[0].indexOf("已") === 0 ? " pm_msgOk" : "");
		// [问题1] 编程跳转:click 隐藏的导航项(React useState active,原生 click 可切)
		var gotoSection = function (id) {
			try { var btn = document.querySelector('button[data-section-id="' + id + '"]'); if (btn) btn.click(); } catch (e) { /* 导航未渲染 */ }
		};
		// [R19+问题1] 主题皮肤(皮肤中心)入口卡:点击跳转(导航项已隐藏,单一入口)
		var skinCenterRow = h("div", { className: "cm_row" + (scPhase[0] === "off" ? " cm_rowOff" : ""), onClick: scPhase[0] === "off" ? undefined : function () { gotoSection("skin-center"); }, style: scPhase[0] === "off" ? undefined : { cursor: "pointer" } },
			h("div", { className: "cm_icon" }, "主"),
			h("div", { className: "cm_main" },
				h("div", { className: "cm_titleRow" },
					h("span", { className: "cm_name" }, "主题皮肤(皮肤中心)"),
					scPhase[0] === "on" ? h("span", { className: "cm_src" }, "已安装") :
					scPhase[0] === "off" ? h("span", { className: "cm_src" }, "未启用") : null),
				h("div", { className: "cm_desc" }, scPhase[0] === "off"
					? "未检测到皮肤中心插件。安装 @linxin666/dsh-skins 后可试穿/应用预置主题皮肤。"
					: "主题 = 整体配色方案(蓝色幻想/鲸吟/数字雨等 12 套,支持实时试穿);与本页背景媒体层互补,可叠加使用。")),
			h("div", { className: "cm_side" },
				scPhase[0] === "off" ? null : h("button", { className: "pm_btn", onClick: function (ev) { ev.stopPropagation(); gotoSection("skin-center"); } }, "打开主题皮肤 →")));
		// [问题1] 宠物入口卡:点击跳转到宠物设置(导航项已隐藏,并入本模块)
		var petRow = h("div", { className: "cm_row", onClick: function () { gotoSection("pet"); }, style: { cursor: "pointer" } },
			h("div", { className: "cm_icon" }, "宠"),
			h("div", { className: "cm_main" },
				h("div", { className: "cm_titleRow" },
					h("span", { className: "cm_name" }, "宠物"),
					h("span", { className: "cm_src" }, petPhase[0] === "on" ? "已安装" : petPhase[0] === "off" ? "未启用" : "")),
				h("div", { className: "cm_desc" }, "桌面精灵宠物:启用/选择宠物、显示与尺寸位置调节、喂食互动。")),
			h("div", { className: "cm_side" },
				petPhase[0] === "off" ? null : h("button", { className: "pm_btn", onClick: function (ev) { ev.stopPropagation(); gotoSection("pet"); } }, "打开宠物设置 →")));
		return h("div", { className: "vt_page" },
			h("input", { ref: fileRef, type: "file", style: { display: "none" },
				accept: ".jpg,.jpeg,.png,.gif,.webp,.bmp,.mp4,.webm,.mov,.mkv,.mp3,.wav,.ogg,.flac,.m4a",
				onChange: onFile }),
			h("div", { className: "vt_head" },
				h("h2", { className: "vt_h2" }, "皮肤"),
				h("p", { className: "vt_intro" }, "背景媒体层:导入图片/视频作为界面背景,音频作循环氛围声;也可直接应用 Wallpaper Engine 创意工坊的视频壁纸。主题配色皮肤请使用紧邻的「皮肤中心」。")),
			h("div", { className: "vt_group" },
				h("div", { className: "vt_groupTitle" }, "主题皮肤"),
				skinCenterRow),
			h("div", { className: "vt_group" },
				h("div", { className: "vt_groupTitle" }, "宠物"),
				petRow),
			h("div", { className: "vt_group" },
				h("div", { className: "vt_groupTitle" }, "当前效果"),
				h("div", { className: "pm_list" }, [bgRow, glassRow, audioRow])),
			h("div", { className: "vt_group" },
				h("div", { className: "vt_groupTitle" }, "自定义资产"),
				h("div", { className: "ps_btns" },
					h("button", { className: "pm_btn", disabled: busy[0], onClick: function () { if (fileRef.current) fileRef.current.click(); } }, "导入文件"),
					h("span", { className: "cm_count" }, assets.length + " 个资产")),
				h("div", { className: "pm_list" }, assetRows)),
			h("div", { className: "vt_group vt_span" },
			h("div", { className: "vt_groupTitle" }, "Wallpaper Engine"),
			weBody),
			h("div", { className: msgCls }, msg[0]),
			h("div", { className: "pm_msg" }, "导入的文件保存于 ~/.dsh/desktop-assets/ 并由壳(30801)提供本地静态服务;图片/视频设为背景,音频作循环氛围声。Wallpaper Engine 视频壁纸直接从 Steam 创意工坊目录读取,无需改动 WE 本体。状态持久化在壳配置,新窗口自动恢复。"));
		}

		// ---------- [local] 原生右栏 grid 轨道塌陷 ----------
		// CSS display:none hides content but keeps the fixed tracks of the frame's
		// inline grid-template-columns. When explorer/preview are expanded by dsh,
		// the 260px track survives and leaves a blank strip on the right. This only
		// reproduces inside the packaged shell (Electron), not in a plain browser.
		// Watch the inline style, keep the first two tracks (left sidebar + center),
		// zero out the remaining fixed-pixel tracks; minmax/fr tracks stay as-is.
		// 前提:explorer-col 存在且已被我们的 CSS 隐藏(定制在生效才介入)。

		function splitGridTracks(s) {
			// Both forms accepted: space-separated (React inline serialization) and
			// comma-separated (CSSOM). Whitespace/comma at paren depth 0 splits;
			// minmax()/fit-content() internals stay intact.
			var out = [], cur = "", depth = 0;
			for (var i = 0; i < s.length; i++) {
				var ch = s.charAt(i);
				if (ch === "(") depth += 1;
				else if (ch === ")") depth -= 1;
				if (depth === 0 && (ch === "," || /\s/.test(ch))) {
					if (cur.trim()) out.push(cur.trim());
					cur = "";
				} else cur += ch;
			}
			if (cur.trim()) out.push(cur.trim());
			return out;
		}

		function collapseFrameTracks(frame) {
			var styleAttr = frame.getAttribute("style") || "";
			var m = styleAttr.match(/grid-template-columns:\s*([^;]+);?/);
			if (!m) return;
			var tracks = splitGridTracks(m[1]);
			if (tracks.length < 3) return;
			var changed = false;
			for (var i = 2; i < tracks.length; i++) {
				if (/^-?\d*\.?\d+px$/.test(tracks[i]) && parseFloat(tracks[i]) !== 0) { tracks[i] = "0px"; changed = true; }
			}
			if (changed) frame.style.gridTemplateColumns = tracks.join(" ");
		}

		function installNativeTrackCollapse() {
			if (typeof document === "undefined") return;
			// Hide the leftover explorer drag handle near the collapsed track edge (idempotent).
			if (!document.getElementById("dsh-vt-hide-handles")) {
				var st = document.createElement("style");
				st.id = "dsh-vt-hide-handles";
				st.textContent = ".aionui-explorer-handle,.aionui-preview-handle{display:none!important}";
				document.head.appendChild(st);
			}
			var FRAME_SEL = '#root > div[data-slot="root"] > div';
			var started = false;
			var attach = function () {
				if (started) return;
				var frame = document.querySelector(FRAME_SEL);
				if (!frame) return false;
				var explorer = document.querySelector(".aionui-explorer-col");
				if (!explorer || getComputedStyle(explorer).display !== "none") return false;
				started = true;
				collapseFrameTracks(frame);
				var mo = new MutationObserver(function () { collapseFrameTracks(frame); });
				mo.observe(frame, { attributes: true, attributeFilter: ["style"] });
				// frame 本身被 React 重挂载时重新附着
				var bodyMo = new MutationObserver(function () {
					if (!document.body.contains(frame)) {
						mo.disconnect();
						started = false;
						poll();
					}
				});
				bodyMo.observe(document.body, { childList: true, subtree: true });
				return true;
			};
			var poll = function () {
				if (attach()) return;
				var tries = 0;
				var t = setInterval(function () {
					tries += 1;
					if (attach() || tries > 150) clearInterval(t);
				}, 200);
			};
			poll();
		}

	// ---- [local] 设置导航 data-section-id 注入(问题1:统一入口的前置使能;R32:全量标记+分组) ----
	// SettingsRoot 打进 dsh web Vite 主 bundle,无法 patch;导航 button 无 data-* 标识。
	// 运行时按 label 文本映射注入 data-section-id,CSS 据此隐藏「皮肤中心」「宠物」导航项,
	// 皮肤页入口卡编程 click 隐藏项完成 section 跳转(active 是 useState,原生 click 可切)。
	// [R32] 标记扩展到全部导航项 + 在组首项前注入分组标签(通用/对话/外观/扩展/系统)。
	function installSettingsNavPatch() {
		if (typeof document === "undefined") return;
		// zh/en 双份标签:映射值来自对端插件 locale 注册(skin-center title / pet settings.title)。
		// 英文界面下旧表失配 → 隐藏项永不标记,合并掉的旧导航项永久残留。
		// [R32] 全量表:第三方 section 的导航名(记忆系统/插件市场/Web UI 插件/侧边卡片)按实测文本。
		var LABEL_MAP = {
			"皮肤中心": "skin-center", "宠物": "pet", "Skin Center": "skin-center", "Pet": "pet",
			"通用设置": "general", "General": "general", "General Settings": "general",
			"模型": "models", "Models": "models",
			"人设": "persona", "Persona": "persona",
			"技能": "skills", "Skills": "skills",
			"记忆系统": "memory", "Memory": "memory", "Memory System": "memory",
			"皮肤": "skin", "Skin": "skin",
			"插件": "plugins", "Plugins": "plugins",
			"插件市场": "market", "Market": "market", "Plugin Market": "market",
			"Web UI 插件": "webui", "Web UI Plugins": "webui", "Web UI Plugin": "webui", "Web UI": "webui",
			"Agent 预设": "agent-preset", "Agent Presets": "agent-preset", "Agent Preset": "agent-preset",
			"侧边卡片": "sidebar-card", "Sidebar Card": "sidebar-card", "Sidebar": "sidebar-card",
			"更新": "updates", "Updates": "updates", "Update": "updates",
		};
		// [R32] 导航分组:组 id → 组首项 section-id + 双语标签(插在组首 navCell 之前)
		// [问题83] order 字段:分组标签自身的 flex order(=组首项 order-5),显示序不再靠 DOM 位置
		var NAV_GROUPS = [
			{ id: "general", first: "general", zh: "通用", en: "General", order: 5 },
			{ id: "chat", first: "persona", zh: "对话", en: "Chat", order: 105 },
			{ id: "look", first: "skin", zh: "外观", en: "Appearance", order: 205 },
			{ id: "ext", first: "plugins", zh: "扩展", en: "Extensions", order: 305 },
			{ id: "system", first: "updates", zh: "系统", en: "System", order: 905 },
		];
		// [问题83] 导航规范序(根因修复核心):设置导航的**显示顺序**由本表经 flex order
		// 强制,与上游 DOM 顺序彻底解耦。背景:各插件经 settings.section slot 注册区段,
		// 上游按注册 order/时序排 DOM——dshmarket 声明 order:40 被排到 updates(系统组首)
		// 之后,视觉上落进"系统"分组;且第三方 section 的注册时机随 client bundle 异步
		// 加载竞态浮动,造成偶现错位。flex order 不改 DOM(与 React 调和零冲突)、只改
		// 显示序,幂等且由 MO 自愈链(mark)持续执行,任何时序下收敛到同一规范布局。
		// 值留 10 档间隔便于插入;隐藏项(skin-center/pet/sidebar-card)也各归其组。
		var NAV_ORDER = {
			"general": 10, "models": 20,
			"persona": 110, "skills": 120, "memory": 130,
			"skin": 210, "skin-center": 215, "pet": 220,
			"plugins": 310, "market": 320, "webui": 330, "agent-preset": 340, "sidebar-card": 350,
			"updates": 910,
		};
		var ORDER_FALLBACK = 950; // 未收录的 section:置系统组之后,不扰动已知布局
		var SETTINGS_SLOT_SEL = '[data-slot^="settings."]';
		// [问题46] 模块语义图标:上游 navCell 大多只有同一齿轮图案,按 section-id 换
		// 线条语义图标(16x16,stroke currentColor 深浅色自适应),不改导航顺序。
		// 幂等:data-dsh-icon 标记;React 重渲染还原上游 svg 时 MO mark 会再注入。
		var NAV_ICONS = {
			"general": '<circle cx="8" cy="8" r="2.3"/><path d="M8 1.6v1.7M8 12.7v1.7M1.6 8h1.7M12.7 8h1.7M3.5 3.5l1.2 1.2M11.3 11.3l1.2 1.2M12.5 3.5l-1.2 1.2M4.7 11.3l-1.2 1.2"/>',
			"models": '<path d="M8 1.8 13.8 5v6L8 14.2 2.2 11V5L8 1.8z"/><path d="M2.2 5 8 8.2 13.8 5M8 8.2v6"/>',
			"persona": '<circle cx="8" cy="5.2" r="2.6"/><path d="M2.9 13.6c.6-2.6 2.6-4.1 5.1-4.1s4.5 1.5 5.1 4.1"/>',
			"skills": '<path d="M8.9 1.6 3.4 9h3.5l-.9 5.4L11.6 7H8.1l.8-5.4z"/>',
			"memory": '<ellipse cx="8" cy="3.6" rx="4.8" ry="1.9"/><path d="M3.2 3.6v8.8c0 1 2.1 1.9 4.8 1.9s4.8-.9 4.8-1.9V3.6"/><path d="M3.2 8c0 1 2.1 1.9 4.8 1.9S12.8 9 12.8 8"/>',
			"skin": '<path d="M8 1.8S3.4 6.9 3.4 10a4.6 4.6 0 0 0 9.2 0C12.6 6.9 8 1.8 8 1.8z"/>',
			"plugins": '<path d="M6.1 2.2v2M9.9 2.2v2M4.3 5.6h7.4v1.9a3.7 3.7 0 0 1-3.7 3.7 3.7 3.7 0 0 1-3.7-3.7V5.6z"/><path d="M8 11.2v2.6"/>',
			"market": '<path d="M3.4 5.4h9.2l-.8 7.6a1.5 1.5 0 0 1-1.5 1.4H5.7a1.5 1.5 0 0 1-1.5-1.4l-.8-7.6z"/><path d="M5.8 7.4V4.7a2.2 2.2 0 0 1 4.4 0v2.7"/>',
			"webui": '<rect x="2" y="3" width="12" height="10" rx="1.6"/><path d="M2 6.1h12"/><path d="M4.1 4.5h.01M5.9 4.5h.01"/>',
			"agent-preset": '<path d="M2.6 5h5M11.4 5h2M2.6 11h1.6M8 11h5.4"/><circle cx="9.5" cy="5" r="1.7"/><circle cx="6.1" cy="11" r="1.7"/>',
			"sidebar-card": '<rect x="2" y="2.6" width="12" height="10.8" rx="1.6"/><path d="M6.3 2.6v10.8"/>',
			"updates": '<path d="M8 2.4v7.2M5.1 6.7 8 9.6l2.9-2.9"/><path d="M2.9 11v1.6a1 1 0 0 0 1 1h8.2a1 1 0 0 0 1-1V11"/>',
		};
		var injectNavIcons = function () {
			try {
				var cells = document.querySelectorAll("button[data-section-id]");
				for (var k = 0; k < cells.length; k++) {
					var btn = cells[k];
					var inner = NAV_ICONS[btn.getAttribute("data-section-id")];
					if (!inner) continue;
					var svg = btn.querySelector("svg");
					if (!svg || svg.getAttribute("data-dsh-icon") === "1") continue;
					svg.setAttribute("data-dsh-icon", "1");
					svg.setAttribute("viewBox", "0 0 16 16");
					svg.setAttribute("fill", "none");
					svg.setAttribute("stroke", "currentColor");
					svg.setAttribute("stroke-width", "1.4");
					svg.setAttribute("stroke-linecap", "round");
					svg.setAttribute("stroke-linejoin", "round");
					svg.innerHTML = inner;
				}
			} catch (e) { /* 自愈:下次 DOM 变化再试 */ }
		};
		var navLang = function () {
			try { return (document.documentElement.lang || "zh").toLowerCase().indexOf("zh") === 0 ? "zh" : "en" } catch (e) { return "zh" }
		};
		// [R32] 分组标签注入(幂等:按组判重——旧版"列表内已有任一组标签即整体跳过"
		// 的守卫会在组首项晚到时永久漏注该组标签;问题83 改逐组检查)
		// [问题83] 标签创建时写入 flex order(显示序=规范序,与插入时的 DOM 位置无关)
		var injectGroups = function () {
			try {
				var lists = document.querySelectorAll('[class*="_navList"]');
				for (var li = 0; li < lists.length; li++) {
					var list = lists[li];
					var lang = navLang();
					for (var gi = 0; gi < NAV_GROUPS.length; gi++) {
						var g = NAV_GROUPS[gi];
						var exist = list.querySelector(':scope > .dsh-vt-nav-group[data-group="' + g.id + '"]');
						if (exist) { exist.style.order = String(g.order); continue }
						var firstBtn = list.querySelector('button[data-section-id="' + g.first + '"]');
						if (!firstBtn) continue;
						var label = document.createElement("div");
						label.className = "dsh-vt-nav-group";
						label.setAttribute("data-group", g.id);
						label.textContent = lang === "zh" ? g.zh : g.en;
						label.style.order = String(g.order);
						// 规范序下通用组恒居首,顶部收紧 8px(不再依赖 :first-child——DOM 序不可信)
						if (g.id === "general") label.style.paddingTop = "6px";
						list.insertBefore(label, firstBtn);
					}
				}
			} catch (e) { /* 自愈:下次 DOM 变化再试 */ }
		};
		// [问题83] 规范序执行器:给每个已标记导航项写 flex order(显示序=规范序)。
		// 幂等:inline order 非 React 受管属性,重渲染不清除;元素被替换时 MO 同步 mark 重打。
		// 包装层兼容:子项若非裸 button(上游改版套壳),order 写在 flex 直接子元(包装层)上。
		var enforceNavOrder = function () {
			try {
				var lists = document.querySelectorAll('[class*="_navList"]');
				for (var li = 0; li < lists.length; li++) {
					var kids = lists[li].children;
					for (var ci = 0; ci < kids.length; ci++) {
						var el = kids[ci];
						if (el.classList && el.classList.contains("dsh-vt-nav-group")) continue;
						var btn = el.tagName === "BUTTON" ? el : (el.querySelector ? el.querySelector("button[data-section-id]") : null);
						if (!btn) continue;
						var sid = btn.getAttribute("data-section-id");
						if (!sid) continue;
						el.style.order = String(NAV_ORDER[sid] !== undefined ? NAV_ORDER[sid] : ORDER_FALLBACK);
					}
				}
			} catch (e) { /* 自愈:下次 DOM 变化再试 */ }
		};
		var mark = function () {
			try {
				var buttons = document.querySelectorAll("button");
				for (var i = 0; i < buttons.length; i++) {
					var b = buttons[i];
					if (b.getAttribute("data-section-id")) continue;
					var label = "";
					var spans = b.querySelectorAll("span");
					for (var j = 0; j < spans.length; j++) {
						var t = (spans[j].textContent || "").trim();
						if (t && LABEL_MAP[t]) { label = t; break }
					}
					if (label) b.setAttribute("data-section-id", LABEL_MAP[label]);
				}
				// [R32] 全量标记完成后补分组标签与模块图标;[问题83] 追加规范序执行
				injectGroups();
				enforceNavOrder();
				injectNavIcons();
			} catch (e) { /* 自愈:下次 DOM 变化再试 */ }
		};
		// 变更是否落在设置面板内(面板根含 settings.* slot;新增节点可能是面板子树、
		// 面板自身或其内部重挂载的导航 button)。
		var inSettings = function (n) {
			try {
				if (!n || n.nodeType !== 1) return false;
				if (n.querySelector && n.querySelector(SETTINGS_SLOT_SEL)) return true;
				if (n.matches && n.matches(SETTINGS_SLOT_SEL)) return true;
				if (n.closest && n.closest(SETTINGS_SLOT_SEL)) return true;
			} catch (e) { /* 忽略 */ }
			return false;
		};
		mark();
		var queued = false;
		// 用 setTimeout 而非 rAF:窗口最小化时 Chromium 冻结 rAF,标记会永远不执行(实测踩坑)
		var mo = new MutationObserver(function (mutations) {
			// [fix] 残影根治:设置面板挂载/导航重挂载时同步标记。MO 回调是微任务,
			// 先于绘制——旧方案 200ms 防抖窗口内「皮肤中心/宠物」旧导航项以
			// display:flex 闪显(实测约 220ms;窗口隐藏时定时器节流更久),即合并 UI
			// 后的导航残影。仅对设置面板范围内的变更同步,聊天流等高频变更仍走防抖。
			var sync = false;
			try {
				for (var i = 0; i < mutations.length && !sync; i++) {
					var added = mutations[i].addedNodes;
					for (var j = 0; j < added.length; j++) {
						if (inSettings(added[j])) { sync = true; break }
					}
				}
			} catch (e) { sync = false }
			if (sync) { mark(); return }
			if (queued) return;
			queued = true;
			window.setTimeout(function () { queued = false; mark() }, 200);
		});
		mo.observe(document.body, { childList: true, subtree: true });
	}

	// ---- [local] node-nav 圆点与左侧栏联动 ----
	// [问题93→95 终态] 入口/面板右距统一常量底线守护:
	// 批次 19 曾以测量聊天内容区(flow/composer)右缘驱动右距,但测量基准随页面类型与面板开闭态漂移:
	// 会话页展开面板时 #root margin 收缩后内容在收缩区内重新居中,margin 补偿后仍与新建页不相等
	// (实测:会话页 869+506=1375 ≠ 新建页 1226+0=1226)——两页像素不一致的根因(问题95)。
	// 终态:废弃内容测量,统一窗口右缘常量底线——面板 12px(补丁 [A] right:var(--dsh-bsr-panel-right,12px))、
	// 入口 96px(底线公式 max(var(…,96px),96px)),即新建参照页(图1)的像素位置;
	// 与页面类型/开闭态/刷新/重启/窗口缩放无关,两类页面恒一致。本函数仅清理历史行内/令牌残值。
	function installSidebarEntryPin() {
		if (typeof document === "undefined") return;
		if (window.__dshBsrPinLoop) return; // 热重载/重复 apply 单例守卫
		window.__dshBsrPinLoop = true;
		var clean = function () {
			try {
				var cluster = document.querySelector('[class*="_toggleCluster"]');
				if (cluster && cluster.style.right) cluster.style.removeProperty("right");
				var de = document.documentElement;
				de.style.removeProperty("--dsh-bsr-cluster-right");
				de.style.removeProperty("--dsh-bsr-panel-right");
			} catch (e) { /* 静默:CSS 底线恒生效 */ }
		};
		clean();
		// apply 时入口簇可能尚未挂载;短轮询确保旧驱动的行内残值被清净后退出(常量底线无需持续跟随)
		var tries = 0;
		var iv = window.setInterval(function () {
			tries += 1;
			clean();
			if (document.querySelector('[class*="_toggleCluster"]') || tries > 10) window.clearInterval(iv);
		}, 500);
	}

	// 侧栏展开(首轨 ~280px)时圆点导航紧贴侧栏右缘,视觉上与侧栏重复 → 隐藏;
	// 侧栏收起(首轨 ~56px 窄图标轨)时圆点显示在窄轨右侧(left:68px)。
	// 判定与轨道塌陷同款:盯 frame 的内联 grid-template-columns 第一条轨道。
	function installSidebarDotSync() {
		if (typeof document === "undefined") return;
		var FRAME_SEL = '#root > div[data-slot="root"] > div';
		var started = false;
		var update = function (frame) {
			var s = frame.getAttribute("style") || "";
			var m = s.match(/grid-template-columns:\s*([^;]+)/);
			var open = true;
			if (m) {
				var tracks = splitGridTracks(m[1]);
				var w = parseFloat(tracks[0] || "0");
				open = !(w > 0 && w <= 100);
			}
			document.body.classList.add("dsh-vt-nav-sync");
			document.body.classList.toggle("dsh-vt-sidebar-open", open);
		};
		var attach = function () {
			if (started) return;
			var frame = document.querySelector(FRAME_SEL);
			if (!frame) return false;
			started = true;
			update(frame);
			var mo = new MutationObserver(function () { update(frame); });
			mo.observe(frame, { attributes: true, attributeFilter: ["style"] });
			var bodyMo = new MutationObserver(function () {
				if (!document.body.contains(frame)) {
					mo.disconnect();
					started = false;
					poll();
				}
			});
			bodyMo.observe(document.body, { childList: true, subtree: true });
			return true;
		};
		var poll = function () {
			if (attach()) return;
			var tries = 0;
			var t = setInterval(function () {
				tries += 1;
				if (attach() || tries > 150) clearInterval(t);
			}, 200);
		};
		poll();
		// ---- [问题58→b13问题2/4] rail 位置:贴侧栏与聊天内容区之间的留白沟 ----
		// 恒 left:68px(问题52 方案)在侧栏展开(280px)时落进侧栏与工作区列表重叠。
		// 改按侧栏实时右缘 + 2px 锚定(收起 56→58 / 展开 280→282,16px rail 完整容于沟内,
		// 不与侧栏/工作区列表/内容区重叠);无侧栏时回落贴内容区左缘(flow.left−18)。
		// fixed rail 与 rect 同为视口坐标,缩放/窗口尺寸自动适配;侧栏开合 240ms 过渡期
		// rAF 逐帧跟随,落定即停;无可见 chat-flow(SSH/记忆/任务看板/hero 态)时清空 left
		// 并摘除显示门控类,rail 由 CSS 隐藏,退回 [B] 基底不致重叠。
		var posRaf = 0, posUntil = 0, lastX = -1;
		var flowVisible = function (flow) {
			// 三视图切换时 chat-flow 被摘除为 0×0(offsetParent=null),存在≠可见
			if (!flow || !flow.offsetParent) return false;
			var r = flow.getBoundingClientRect();
			return r.width > 0 && r.height > 0;
		};
		var posOnce = function () {
			var rail = document.querySelector(".dsh-node-nav-rail");
			var flow = document.querySelector('[data-chat-flow=""]');
			var vis = flowVisible(flow);
			// [b13问题2] 可见性门控类:与 CSS 规则 body:not(.dsh-vt-chatflow-on) 呼应
			document.body.classList.toggle("dsh-vt-chatflow-on", vis);
			if (rail && vis) {
				var x = Math.round(flow.getBoundingClientRect().left) - 18;
				var sb = document.querySelector('div[data-slot="sidebar"]>div[class*="_root"]') || document.querySelector('div[data-slot="sidebar"]');
				if (sb) {
					var sbRight = Math.round(sb.getBoundingClientRect().right);
					if (sbRight > 0) x = Math.min(x, sbRight + 2);
				}
				x = Math.max(0, x);
				if (x !== lastX) { lastX = x; rail.style.left = x + "px"; }
			} else if (rail && lastX !== -1) {
				lastX = -1; rail.style.left = "";
			}
		};
		var posLoop = function () {
			var now = Date.now();
			var tick = function () {
				posOnce();
				if (Date.now() < posUntil) posRaf = window.requestAnimationFrame(tick);
				else posRaf = 0;
			};
			if (posRaf) return;
			posUntil = now + 480; // 覆盖 240ms 开合过渡 + 余量
			posRaf = window.requestAnimationFrame(tick);
		};
		posOnce();
		window.addEventListener("resize", posLoop);
		// [b13问题2] 门控类与位置同步走定时器/结构变更通道:窗口隐藏时 rAF 冻结,
		// 仅靠 posLoop 会让视图切换后的显隐门控停在旧态(后台切页残显根因)。
		var syncGate = function () {
			var vis = flowVisible(document.querySelector('[data-chat-flow=""]'));
			document.body.classList.toggle("dsh-vt-chatflow-on", vis);
			if (!vis) posOnce();
		};
		window.setInterval(function () { syncGate(); posOnce(); }, 1200); // React 重渲染/布局变更/后台切页自愈
		new MutationObserver(function () { syncGate(); posLoop(); }).observe(document.body, { childList: true, subtree: true });
	}

	// ---- [问题47] 发送消息乐观回显 ----
	// 上游无乐观渲染:发送后要等后端提交回执气泡才入 DOM(实测:输入框 t+22ms
	// 清空,气泡 t+4156ms 才挂载;新会话首条含建会话+agent 启动,后续消息同样
	// 要等 ~4s 提交往返)。空窗期消息从输入框消失而会话流无反馈 = 用户感知
	// 的"顿一下"。后端时延壳层不可控,用乐观回显补感知:发送后 150ms 内真实
	// 消息行未到则插入临时气泡(同真实气泡底色令牌),真实行挂载即移除;
	// 12s 兜底自清理。纯 DOM 覆盖层,不碰上游提交链路;150ms 快路径门槛
	// 保证提交碰巧很快时零闪显。
	function installSendEcho() {
		if (typeof document === "undefined") return;
		var echoEl = null;
		var timer = 0;
		var awaiting = false;
		var baseline = 0;
		var knownRows = null; // [问题53] 发送时刻的存量行集合:虚拟化列表行数回落时
		// "rows > baseline" 永不成立致回显残留(残影)——改判"出现集合外的新行"。
		var ROW_SEL = "[data-time-hover-root]";
		var hasNewRow = function () {
			var cur = document.querySelectorAll(ROW_SEL);
			if (knownRows) {
				for (var i = 0; i < cur.length; i++) if (!knownRows.has(cur[i])) return true;
				return false;
			}
			return cur.length > baseline;
		};
		var removeEcho = function () {
			if (timer) { window.clearTimeout(timer); timer = 0; }
			if (echoEl && echoEl.parentNode) echoEl.parentNode.removeChild(echoEl);
			echoEl = null;
			knownRows = null; // 释放存量行引用,防长期持有 DOM 节点
		};
		var showEcho = function (text) {
			removeEcho();
			var tries = 0;
			var insert = function () {
				if (!awaiting) return;
				var flow = document.querySelector('[data-chat-flow=""]');
				if (flow) {
					var el = document.createElement("div");
					el.setAttribute("data-dsh-send-echo", "");
					el.style.cssText = "display:flex;justify-content:flex-end;padding:2px 0;";
					var bub = document.createElement("div");
					bub.style.cssText = "max-width:75%;padding:8px 14px;border-radius:14px;background:var(--dsw-specific-bubble,rgba(237,243,254,.92));color:var(--dsw-alias-label-primary);white-space:pre-wrap;word-break:break-word;font-size:14px;line-height:1.6;opacity:.85;animation:dshVtEchoPulse 1.4s ease-in-out infinite;";
					bub.textContent = text.length > 2000 ? text.slice(0, 2000) + "…" : text;
					el.appendChild(bub);
					flow.appendChild(el);
					echoEl = el;
					try { el.scrollIntoView({ block: "end", behavior: "smooth" }); } catch (e) { /* 忽略 */ }
					timer = window.setTimeout(function () { awaiting = false; removeEcho(); }, 12000);
					return;
				}
				tries += 1;
				if (tries <= 40) window.setTimeout(insert, 50); // 新会话 flow 挂载前的等待窗口(2s)
				else awaiting = false;
			};
			insert();
		};
		var draftOf = function () {
			var ta = document.querySelector('[data-composer-card] textarea');
			return ta ? (ta.value || "").trim() : "";
		};
		var armSend = function (text) {
			if (!text) return;
			removeEcho();
			baseline = document.querySelectorAll(ROW_SEL).length;
			knownRows = new Set(document.querySelectorAll(ROW_SEL));
			awaiting = true;
			// 150ms 快路径:热会话提交回执在此之前已到 → 不插回显,零闪显
			window.setTimeout(function () {
				if (!awaiting) return;
				if (hasNewRow()) { awaiting = false; return; }
				showEcho(text);
			}, 150);
		};
		// 真实消息行挂载 → 回显使命完成。空闲期回调早退,开销可忽。
		var mo = new MutationObserver(function () {
			if (!awaiting && !echoEl) return;
			try {
				if (hasNewRow()) {
					awaiting = false;
					removeEcho();
				}
			} catch (e) { /* 忽略 */ }
		});
		mo.observe(document.body, { childList: true, subtree: true });
		document.addEventListener("click", function (ev) {
			var t = ev.target;
			if (!t || !t.closest) return;
			if (t.closest('button[aria-label="发送消息"]')) armSend(draftOf());
		}, true);
		document.addEventListener("keydown", function (ev) {
			if (ev.key !== "Enter" || ev.shiftKey) return;
			if (ev.isComposing || ev.keyCode === 229) return;
			var t = ev.target;
			if (!(t instanceof HTMLTextAreaElement)) return;
			if (t.closest("[data-composer-card]") === null) return;
			armSend(draftOf());
		}, true);
	}

	// ---- [问题48] 会话智能摘要:首轮对话完成后壳端 LLM 生成 ≤20 字摘要,侧栏会话行副标题显示 ----
	// 会话行无 sessionId DOM 锚点 → 用 ctx.sessions.list 的 byId[].title 做 标题→id 映射匹配行。
	// 触发保守:当前会话有用户消息 + 流式结束(发送按钮在位) + 无缓存 → 生成一次;缓存永不重发。
	// 4s 慢轮询兼顾行虚拟化重挂载后的副标题重渲染(幂等)。
	function installSessionSummary(ctx) {
		if (typeof document === "undefined") return;
		if (!ctx || !ctx.sessions || !ctx.sessions.list) return;
		var summaries = {};
		var inflight = {};
		var failed = {}; // sid → 失败时刻;10 分钟内不重试(防空转烧 token)
		var idByTitle = function () {
			var map = {};
			try {
				var snap = ctx.sessions.list.getSnapshot();
				var byId = (snap && snap.byId) || {};
				for (var id in byId) {
					var s = byId[id];
					if (s && s.title) map[s.title] = id;
				}
			} catch (e) { /* store 形状变动自愈 */ }
			return map;
		};
		var renderAll = function () {
			try {
				var map = idByTitle();
				var rows = document.querySelectorAll('div[data-slot="sidebar"] [class*="sessionRow"]');
				for (var i = 0; i < rows.length; i++) {
					var row = rows[i];
					var titleEl = row.querySelector('[class*="_title"]');
					if (!titleEl) continue;
					// [需求] 摘要即主题:直接替换会话标题(旧副标题方案弃用)。
					// 行绑定 sid 持久在 dataset(React 重渲染会丢,丢了由 4s 轮询重新匹配自愈);
					// 标题被替换后 map[DOM文本] 失配,故优先读 dataset 绑定。
					var sid = row.getAttribute("data-dsh-sid") || map[(titleEl.textContent || "").trim()];
					var sum = sid ? summaries[sid] : null;
					// 旧副标题清理(R37 遗留样式行,避免双显示)
					var legacy = row.querySelector("[data-dsh-summary]");
					if (legacy) legacy.parentNode.removeChild(legacy);
					if (sum && sid) {
						row.setAttribute("data-dsh-sid", sid);
						var cur = (titleEl.textContent || "").trim();
						if (cur !== sum) {
							// 原标题存 tooltip 备查(仅首次替换时记,避免把摘要存进 title)
							if (!titleEl.getAttribute("data-dsh-orig")) titleEl.setAttribute("data-dsh-orig", cur);
							titleEl.setAttribute("title", titleEl.getAttribute("data-dsh-orig") || cur);
							titleEl.textContent = sum;
						}
					}
				}
			} catch (e) { /* 自愈:下轮再试 */ }
		};
		var currentSid = function () {
			try { var snap = ctx.sessions.list.getSnapshot(); return (snap && snap.current) || null } catch (e) { return null }
		};
		// 采集首轮内容:首条用户消息 + 前几条非用户消息片段(仅用于摘要输入,不入 UI)
		var collectText = function () {
			var flow = document.querySelector('[data-chat-flow=""]');
			if (!flow) return "";
			var userTxt = "", asstTxt = "";
			var nodes = flow.querySelectorAll('[data-slot="conversation.chat.node"]');
			for (var i = 0; i < nodes.length && i < 6; i++) {
				var nd = nodes[i];
				var t = (nd.textContent || "").trim();
				if (!t) continue;
				var isUser = nd.querySelector('[class*="userBubble"], [class*="userS"]') !== null;
				if (isUser) { if (!userTxt) userTxt = t.slice(0, 400); }
				else if (!asstTxt) asstTxt = t.slice(0, 800);
				if (userTxt && asstTxt) break;
			}
			if (!userTxt) return "";
			return "用户:" + userTxt + (asstTxt ? "\n助手:" + asstTxt : "");
		};
		var maybeGenerate = function () {
			var sid = currentSid();
			if (!sid || summaries[sid] || inflight[sid]) return;
			if (failed[sid] && Date.now() - failed[sid] < 600000) return;
			var flow = document.querySelector('[data-chat-flow=""]');
			if (!flow) return;
			// 有用户消息且流式已结束(发送按钮在位;流式中为停止按钮)
			if (!flow.querySelector('[class*="userBubble"], [class*="userS"]')) return;
			if (!document.querySelector('button[aria-label="发送消息"]')) return;
			var text = collectText();
			if (text.length < 10) return;
			inflight[sid] = true;
			fetch(SHELL_API + "/session-summary", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ sessionId: sid, text: text }),
			}).then(function (r) { return r.json(); }).then(function (j) {
				if (j && j.ok && j.summary) { summaries[sid] = j.summary; renderAll(); }
				else failed[sid] = Date.now();
			}).catch(function () { failed[sid] = Date.now(); }).then(function () { delete inflight[sid]; });
		};
		fetch(SHELL_API + "/session-summaries").then(function (r) { return r.json(); }).then(function (j) {
			if (j && j.ok) { summaries = j.summaries || {}; renderAll(); }
		}).catch(function () {});
		window.setInterval(function () {
			renderAll();
			maybeGenerate();
		}, 4000);
	}

	// ---- [需求] 目录选择器盘符行:「选择工作区目录」对话框标题/面包屑下方增加盘符快捷入口 ----
	// 上游目录浏览器只能从主目录逐级下钻,Windows 下无法直达其他盘——注入盘符行,
	// 点击后复用组件自带的路径编辑器提交链路(点编辑区 → native setter 回填 →
	// Enter 提交 navigate),不碰 React 内部状态;盘符清单由壳 /drives 探测。
	// 1s 轮询自愈:对话框每次打开/React 重渲染都可能丢掉注入行,丢了就重注。
	var DRIVE_SVG = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><rect x="1.5" y="5" width="13" height="7" rx="1.6"/><circle cx="11.4" cy="8.5" r=".9" fill="currentColor" stroke="none"/><path d="M4 8.5h4"/></svg>';
	var pickerDrives = null; // null=未拉取;[]=无盘符(POSIX/壳离线)
	function pickerDialog() {
		var dlgs = document.querySelectorAll('div[role="dialog"]');
		for (var i = 0; i < dlgs.length; i++) {
			var h2 = dlgs[i].querySelector("h2");
			if (h2 && /选择工作区目录|Select Workspace Directory/.test(h2.textContent || "")) return dlgs[i];
		}
		return null;
	}
	function gotoDrive(dlg, drive) {
		var EDIT_SEL = 'button[aria-label="编辑路径"],button[aria-label="Edit path"]';
		var INPUT_SEL = 'input[aria-label="编辑路径"],input[aria-label="Edit path"]';
		var doType = function () {
			var inp = dlg.querySelector(INPUT_SEL);
			if (!inp) return;
			var setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
			setter.call(inp, drive + "\\");
			inp.dispatchEvent(new Event("input", { bubbles: true }));
			// 等 React 把 draft 状态落盘后再提交(离散事件同步刷新,30ms 宽限)
			window.setTimeout(function () {
				inp.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
			}, 30);
		};
		if (dlg.querySelector(INPUT_SEL)) { doType(); return; }
		var editBtn = dlg.querySelector(EDIT_SEL);
		if (!editBtn || editBtn.disabled) return;
		editBtn.click();
		window.setTimeout(doType, 80);
	}
	function renderDriveRow(dlg) {
		if (!pickerDrives || !pickerDrives.length) return;
		var h2 = dlg.querySelector("h2");
		var header = h2 && h2.parentElement;
		if (!header) return;
		// 当前盘符:面包屑首节点在盘外时直接是盘路径(如 C:\);据此高亮
		var firstCrumb = "";
		var crumbBtn = header.querySelector('[role="navigation"] button');
		if (crumbBtn) firstCrumb = (crumbBtn.textContent || "").trim();
		var pathInput = dlg.querySelector('input[aria-label="编辑路径"],input[aria-label="Edit path"]');
		var draft = pathInput ? (pathInput.value || "") : "";
		var cur = ((draft || firstCrumb).match(/^([A-Za-z]):/) || [])[1];
		cur = cur ? cur.toUpperCase() : "";
		var row = dlg.querySelector(".dsh-vt-drives");
		if (!row) {
			row = document.createElement("div");
			row.className = "dsh-vt-drives";
			row.setAttribute("data-dsh-drives", "");
			for (var i = 0; i < pickerDrives.length; i++) {
				(function (d) {
					var b = document.createElement("button");
					b.type = "button";
					b.className = "dsh-vt-drive";
					b.setAttribute("data-drive", d);
					b.title = "跳转到 " + d + "\\";
					b.innerHTML = DRIVE_SVG;
					var t = document.createElement("span");
					t.textContent = d;
					b.appendChild(t);
					b.addEventListener("click", function (ev) { ev.preventDefault(); gotoDrive(dlg, d); });
					row.appendChild(b);
				})(pickerDrives[i]);
			}
			header.appendChild(row);
		}
		var chips = row.querySelectorAll(".dsh-vt-drive");
		for (var j = 0; j < chips.length; j++) {
			var letter = (chips[j].getAttribute("data-drive") || "").replace(":", "").toUpperCase();
			chips[j].classList.toggle("dsh-vt-driveActive", letter === cur);
		}
	}
	function installDrivePicker(ctx) {
		if (typeof document === "undefined") return;
		// 首选:dsh 自带 listDirectory 逐盘符探测(免壳依赖,旧壳也生效);
		// 失败兜底:壳 /drives(需 v0.4.6+ 壳;当前壳无此路由时返错→空列表)。
		var probe = function () {
			try {
				var ws = ctx && ctx.workspaces;
				if (!ws || typeof ws.listDirectory !== "function") return Promise.resolve(null);
				var letters = [];
				for (var i = 65; i <= 90; i++) letters.push(String.fromCharCode(i));
				return Promise.allSettled(letters.map(function (L) {
					return ws.listDirectory(L + ":\\").then(function () { return L + ":"; });
				})).then(function (rs) {
					return rs.filter(function (r) { return r.status === "fulfilled"; }).map(function (r) { return r.value; });
				}).catch(function () { return null; });
			} catch (e) { return Promise.resolve(null); } // inject 守卫拒绝时降级到壳 API
		};
		// 延迟到 apply 之后:避免服务未就绪/注入守卫异常拖垮插件加载
		window.setTimeout(function () {
			probe().then(function (ds) {
				if (ds && ds.length) { pickerDrives = ds; return; }
				if (ds !== null) { pickerDrives = []; return; } // 探测成功但无盘符(POSIX)
				api("/drives").then(function (j) { pickerDrives = (j && j.ok && j.drives) || []; }).catch(function () { pickerDrives = []; });
			});
		}, 2000);
		window.setInterval(function () {
			var dlg = pickerDialog();
			if (dlg) renderDriveRow(dlg);
		}, 1000);
	}

	// ---------- [R44] 侧边栏浏览器 ----------
	// 上游无内置浏览面板。此处注入右侧滑出面板:地址栏(输入 URL 直达/关键词走必应搜索)
	// + iframe 加载壳 /browse 代理(剥离 X-Frame-Options/CSP frame-ancestors,走系统代理),
	// 带前进/后退/刷新/主页与状态栏。入口按钮插到侧栏底部「设置」旁(克隆原生按钮样式),
	// React 重渲染丢失时由轮询自愈重注。Esc 关闭。
	var BROWSER_GLYPH = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="6.2"/><path d="M1.8 8h12.4M8 1.8c-2.4 2.6-2.4 9.8 0 12.4 2.4-2.6 2.4-9.8 0-12.4z"/></svg>';
	function installSidebarBrowser() {
		if (typeof document === "undefined") return;
		var panel = null, frame = null, addr = null, statusEl = null, backBtn = null, fwdBtn = null;
		var hist = [], hidx = -1;
		var toUrl = function (s) {
			s = (s || "").trim();
			if (!s) return null;
			if (/^https?:\/\//i.test(s)) return s;
			// 含点且无空格 → 域名直达;否则作关键词搜索
			if (s.indexOf(" ") < 0 && /^[^\s/]+\.[^\s]{2,}/.test(s)) return "https://" + s;
			// [问题61] 搜索引擎选型实测(均经壳 /browse 代理):
			// - Bing 桌面版:HTML 含 b_results 但嵌入 iframe 后结果区被 JS 门禁隐藏(空白);
			// - DDG:用户网络超时不可达;
			// - 百度:SSR 直出结果(实测 200/1.2MB/含 result 节点),故选百度。
			return "https://www.baidu.com/s?wd=" + encodeURIComponent(s);
		};
		var setStatus = function (t) { if (statusEl) statusEl.textContent = t; };
		var syncNav = function () {
			if (backBtn) backBtn.disabled = hidx <= 0;
			if (fwdBtn) fwdBtn.disabled = hidx >= hist.length - 1;
		};
		var navigate = function (target, push) {
			if (!target || !frame) return;
			if (push !== false) { hist = hist.slice(0, hidx + 1); hist.push(target); hidx = hist.length - 1; }
			if (addr && addr.value !== target) addr.value = target;
			setStatus("加载中… " + target);
			frame.src = SHELL_API + "/browse?url=" + encodeURIComponent(target);
			syncNav();
		};
		var buildPanel = function () {
			if (panel) return;
			panel = document.createElement("div");
			panel.className = "dsh-vt-browser";
			panel.setAttribute("data-dsh-browser", "");
			var bar = document.createElement("div");
			bar.className = "dsh-vt-browser-bar";
			var mkBtn = function (title, svg, fn) {
				var b = document.createElement("button");
				b.type = "button"; b.className = "dsh-vt-browser-btn"; b.title = title;
				b.setAttribute("aria-label", title); b.innerHTML = svg;
				b.addEventListener("click", fn); return b;
			};
			backBtn = mkBtn("后退", '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M10 3 5 8l5 5"/></svg>', function () { if (hidx > 0) { hidx--; navigate(hist[hidx], false); } });
			fwdBtn = mkBtn("前进", '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="m6 3 5 5-5 5"/></svg>', function () { if (hidx < hist.length - 1) { hidx++; navigate(hist[hidx], false); } });
			var reloadBtn = mkBtn("刷新", '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9"/><path d="M13.7 1.8v3h-3"/></svg>', function () { if (hist[hidx]) navigate(hist[hidx], false); });
			var homeBtn = mkBtn("主页", '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="m2.5 8 5.5-5 5.5 5"/><path d="M4 7.5V13h8V7.5"/></svg>', function () { addr.value = ""; addr.focus(); });
			addr = document.createElement("input");
			addr.className = "dsh-vt-browser-addr";
			addr.placeholder = "输入网址或搜索关键词,回车打开";
			addr.spellcheck = false;
			addr.addEventListener("keydown", function (ev) {
				if (ev.key === "Enter") { var u = toUrl(addr.value); if (u) navigate(u); }
				if (ev.key === "Escape") { ev.stopPropagation(); closePanel(); }
			});
			var goBtn = mkBtn("打开", '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8h9M8.5 4.5 12 8l-3.5 3.5"/></svg>', function () { var u = toUrl(addr.value); if (u) navigate(u); });
			var closeBtn = mkBtn("关闭浏览器", '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="m4 4 8 8M12 4l-8 8"/></svg>', closePanel);
			bar.appendChild(backBtn); bar.appendChild(fwdBtn); bar.appendChild(reloadBtn); bar.appendChild(homeBtn);
			bar.appendChild(addr); bar.appendChild(goBtn); bar.appendChild(closeBtn);
			frame = document.createElement("iframe");
			frame.className = "dsh-vt-browser-frame";
			frame.setAttribute("sandbox", "allow-scripts allow-same-origin allow-forms allow-popups");
			frame.addEventListener("load", function () {
				var cur = hist[hidx] || "";
				setStatus(cur ? "已加载 " + cur : "空白页");
			});
			frame.addEventListener("error", function () { setStatus("加载失败"); });
			statusEl = document.createElement("div");
			statusEl.className = "dsh-vt-browser-status";
			statusEl.textContent = "输入网址或关键词开始浏览";
			panel.appendChild(bar); panel.appendChild(frame); panel.appendChild(statusEl);
			document.body.appendChild(panel);
			syncNav();
		};
		var openPanel = function () {
			buildPanel();
			panel.classList.add("dsh-vt-browserOpen");
			window.setTimeout(function () { if (addr) addr.focus(); }, 240);
		};
		var closePanel = function () { if (panel) panel.classList.remove("dsh-vt-browserOpen"); };
		// Esc 全局关闭(面板打开时)
		document.addEventListener("keydown", function (ev) {
			if (ev.key === "Escape" && panel && panel.classList.contains("dsh-vt-browserOpen")) closePanel();
		}, true);
		// [b12c 用户需求] 侧栏「设置」上方的浏览器入口按钮已移除(用户反馈遮挡/不需要)。
		// 面板构建代码保留但不再有入口触发;如需恢复,重建 ensureEntry 注入即可。
	}

	// ---------- [R43] 皮肤中心/宠物页返回按钮 ----------
	// 两个区段的导航项已被隐藏(问题1 统一入口),从「皮肤」页入口卡进入后只能靠导航「皮肤」
	// 返回。此处在激活区段为 skin-center/pet 时,于内容滚动区顶部注入返回胶囊按钮,点击编程
	// 跳回皮肤区段(同 gotoSection 手法)。React 重渲染会移除注入节点 → MO 自愈重注(同 R35 图标)。

	function installSectionBackButtons() {
		if (typeof document === "undefined") return;
		var sync = function () {
			var dlg = document.querySelector('div[role="dialog"]');
			if (!dlg) return;
			var active = dlg.querySelector('[class*="_active"][data-section-id]');
			var sid = active ? active.getAttribute("data-section-id") : "";
			var options = dlg.querySelector('[class*="_options"]');
			if (!options) return;
			var bar = options.querySelector(":scope > [data-dsh-back]");
			var want = (sid === "skin-center" || sid === "pet") && !!document.querySelector('button[data-section-id="skin"]');
			if (!want) { if (bar) bar.remove(); return; }
			if (bar) return;
			bar = document.createElement("div");
			bar.dataset.dshBack = "1";
			bar.className = "vt_backBar";
			bar.setAttribute("role", "button");
			bar.setAttribute("tabindex", "0");
			bar.setAttribute("aria-label", "返回皮肤设置");
			bar.innerHTML = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 3.5 5 8l4.5 4.5"/></svg><span>返回皮肤设置</span>';
			bar.addEventListener("click", function () {
				var btn = document.querySelector('button[data-section-id="skin"]');
				if (btn) btn.click();
			});
			bar.addEventListener("keydown", function (ev) {
				if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); bar.click(); }
			});
			options.insertBefore(bar, options.firstChild);
		};
		// 设置面板范围内的结构变更同步处理(微任务内,先于绘制,同问题40 残影策略)
		var mo = new MutationObserver(function (muts) {
			for (var i = 0; i < muts.length; i++) {
				if (muts[i].type === "childList") { sync(); return; }
			}
		});
		mo.observe(document.body, { childList: true, subtree: true });
		sync();
	}

	// ---------- [问题62] 设置弹窗被侧栏列裁剪的解除 ----------
	// 设置弹窗挂载在侧栏 footArea 内,祖先 sidebarCol/frame 均 overflow:hidden:
	// fixed overlay 虽不被包含块围困,却被祖先裁剪得"加载不出来"(全屏不可见)。
	// 不能传送 DOM(React 卸载时 removeChild 对非亲父节点报错),改在弹窗打开
	// 期间给 html 挂类,CSS 强制解除两列裁剪(弹窗打开时侧栏无动画,安全)。
	function installSettingsOverlayEscape() {
		if (typeof document === "undefined") return;
		// [b19] 残留态看门狗:dialog 已卸载但 overlay 容器(mask+panel)未同步退场时,
		// 残留 mask(fixed z:1000 + backdrop blur)会吞掉整页点击,把侧栏/聊天区全部锁死。
		// 处置:不移除 DOM(尊重 React 管辖,上游重新挂载即自愈),仅用样式把残留容器置为
		// 不可见不拦截;首次发现后留 1.2s 宽限(避开正常退场淡出动画窗口)再定性为残留。
		var strayStyle = null;
		var straySeen = new WeakMap();
		var syncStrays = function (open) {
			var strays = [];
			if (!open) {
				var now = Date.now();
				var overlays = document.querySelectorAll('div[class*="_overlay"]');
				for (var i = 0; i < overlays.length; i++) {
					var o = overlays[i];
					if (!o.classList.length) continue;
					if (!o.querySelector('[class*="_mask"]')) continue;
					var cs = window.getComputedStyle(o);
					if (cs.position !== "fixed" || cs.display === "none" || cs.visibility === "hidden") continue;
					if (!straySeen.has(o)) straySeen.set(o, now);
					if (now - straySeen.get(o) >= 1200) strays.push(o);
				}
			}
			if (strays.length) {
				if (!strayStyle) {
					strayStyle = document.createElement("style");
					strayStyle.setAttribute("data-dsh-style", "overlay-stray-guard");
					document.head.appendChild(strayStyle);
				}
				strayStyle.textContent = strays.map(function (o) {
					return "." + Array.prototype.join.call(o.classList, ".") + "{display:none!important}";
				}).join("\n");
			} else if (strayStyle && strayStyle.textContent) {
				strayStyle.textContent = "";
			}
		};
		var sync = function () {
			// [b12c 加固] 判定放宽为"页内存在任何 role=dialog"(设置是唯一弹窗),
			// 不依赖 overlay 哈希类名匹配;轮询加密到 500ms 防用户点击后首帧未挂类。
			var open = !!document.querySelector('div[role="dialog"]');
			document.documentElement.classList.toggle("dsh-vt-settings-open", open);
			syncStrays(open);
		};
		var mo = new MutationObserver(sync);
		mo.observe(document.body, { childList: true, subtree: true });
		window.setInterval(sync, 500);
		sync();
	}

	// ---- [问题79] 插件市场批量下载队列 ----
	// dshmarket 的 /dsh-market/install 串行互斥(busy 直接 409),且 pnpm 对同一
	// profile 并发写入不安全——故批量下载走客户端串行队列:连续加入多项,
	// 逐项复用市场原生安装接口(注册/热挂载/回滚机制零改动),单项失败不阻断
	// 后续项。队列持久化 localStorage,重载/切页不丢;坞面板挂 body 不依赖弹窗。
	var MQ_LS = "dshvt-mkt-queue-v1";
	var mqItems = [];
	var mqWorking = false;
	var mqPollTimer = null;
	var mqDockEl = null;
	var mqCollapsed = false;

	function mqLoad() {
		try {
			var arr = JSON.parse(localStorage.getItem(MQ_LS) || "[]");
			mqItems = Array.isArray(arr) ? arr : [];
		} catch (e) { mqItems = []; }
		// 上次进行中的项复位为排队(安装是否成功交由市场重复守卫兑底)
		for (var i = 0; i < mqItems.length; i++) {
			var s = mqItems[i].status;
			if (s === "installing" || s === "waiting") { mqItems[i].status = "queued"; mqItems[i].progress = null; }
		}
	}
	function mqPersist() {
		try {
			localStorage.setItem(MQ_LS, JSON.stringify(mqItems.map(function (it) {
				return { name: it.name, url: it.url, status: it.status, error: it.error || null };
			})));
		} catch (e) { /* 存储不可用时队列仅会话内有效 */ }
	}
	function mqStatus() {
		return fetch("/dsh-market/status", { headers: { accept: "application/json" } })
			.then(function (r) { return r.json() }).catch(function () { return null });
	}
	function mqBytes(n) {
		if (typeof n !== "number") return "";
		if (n >= 1048576) return (n / 1048576).toFixed(1) + "MB";
		if (n >= 1024) return (n / 1024).toFixed(0) + "KB";
		return n + "B";
	}
	// 等待市场空闲(不与用户手动安装/上一项收尾撞锁);超时返 false
	function mqWaitIdle(maxMs) {
		var t0 = Date.now();
		return (function poll() {
			return mqStatus().then(function (st) {
				if (st && st.busy === false) return true;
				if (Date.now() - t0 > maxMs) return false;
				return new Promise(function (r) { setTimeout(r, 3000) }).then(poll);
			});
		})();
	}
	function mqStartProgress(item) {
		mqStopProgress();
		mqPollTimer = window.setInterval(function () {
			mqStatus().then(function (st) {
				if (!st || item.status !== "installing") return;
				var parts = [];
				if (st.phase) parts.push(st.phase);
				if (st.currentPackage) parts.push(st.currentPackage);
				if (st.downloaded != null && st.size != null) parts.push(mqBytes(st.downloaded) + "/" + mqBytes(st.size));
				else if (st.done != null && st.total != null) parts.push(st.done + "/" + st.total);
				item.progress = parts.join(" · ") || "下载中…";
				mqRender();
			});
		}, 2000);
	}
	function mqStopProgress() {
		if (mqPollTimer) { window.clearInterval(mqPollTimer); mqPollTimer = null; }
	}
	// 串行 worker:取首个排队项 → 等市场空闲 → 调原生安装接口 → 记录结果 → 下一项。
	// 错误隔离:任何单项结果(含失败)都不阻断后续项。
	function mqTick() {
		if (mqWorking) return;
		var next = null;
		for (var i = 0; i < mqItems.length; i++) { if (mqItems[i].status === "queued") { next = mqItems[i]; break } }
		if (!next) { mqRender(); return; }
		mqWorking = true;
		next.status = "waiting"; next.error = null; next.progress = null;
		mqPersist(); mqRender();
		mqWaitIdle(600000).then(function (idle) {
			if (!idle) {
				next.status = "failed"; next.error = "等待市场空闲超时(10 分钟)";
				mqWorking = false; mqPersist(); mqRender(); mqScheduleNext(2000); return;
			}
			next.status = "installing"; mqRender();
			mqStartProgress(next);
			return fetch("/dsh-market/install", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ url: next.url }),
			}).then(function (res) {
				return res.json().catch(function () { return {} }).then(function (data) {
					return { res: res, data: data || {} };
				});
			}).catch(function (e) { return { res: null, data: {}, netErr: e.message } });
		}).then(function (out) {
			mqStopProgress();
			next.progress = null;
			if (!out) return; // 超时分支已处理
			var res = out.res, data = out.data;
			if (out.netErr) {
				next.status = "failed"; next.error = "网络错误: " + out.netErr;
			} else if (res.ok && data.ok) {
				next.status = "done";
			} else if (data.agentsBusy === true && (next.retries || 0) < 6) {
				// 智能体会话运行中:长退避自动重试,不阻断其他项(其他项同样会撞守卫,
				// 但重试间隔内用户结束会话后队列自然恢复)
				next.retries = (next.retries || 0) + 1;
				next.status = "queued"; next.error = "智能体运行中,稍后自动重试(" + next.retries + "/6)";
				mqWorking = false; mqPersist(); mqRender(); mqScheduleNext(20000); return;
			} else if ((res.status === 409 || data.busy === true) && (next.retries || 0) < 3) {
				next.retries = (next.retries || 0) + 1;
				next.status = "queued"; next.error = "市场忙,稍后重试(" + next.retries + "/3)";
				mqWorking = false; mqPersist(); mqRender(); mqScheduleNext(5000); return;
			} else {
				next.status = "failed";
				next.error = String(data.error || ("HTTP " + (res ? res.status : "?"))).substring(0, 220);
			}
			mqWorking = false; mqPersist(); mqRender(); mqScheduleNext(1200);
		});
	}
	function mqScheduleNext(delay) {
		var has = mqItems.some(function (i) { return i.status === "queued" });
		if (has) window.setTimeout(mqTick, delay || 1200);
	}
	function mqEnqueue(name, url, btn) {
		if (!url) return;
		var flash = function (txt) {
			if (!btn) return;
			btn.textContent = txt; btn.classList.add("mqAddOn");
			window.setTimeout(function () { btn.textContent = "+队列"; btn.classList.remove("mqAddOn") }, 1400);
		};
		var exist = null;
		for (var i = 0; i < mqItems.length; i++) { if (mqItems[i].url === url) { exist = mqItems[i]; break } }
		if (exist) {
			if (exist.status === "failed") { exist.status = "queued"; exist.error = null; exist.retries = 0; mqPersist(); mqRender(); mqScheduleNext(); flash("已重试"); }
			else if (exist.status === "done") flash("已完成");
			else flash("已在队列");
			return;
		}
		mqItems.push({ name: name || url, url: url, status: "queued", retries: 0 });
		mqPersist(); mqRender(); mqScheduleNext(); flash("已加入");
	}
	function mqEsc(s) {
		return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
			return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
		});
	}
	function mqEnsureDock() {
		if (mqDockEl && document.body.contains(mqDockEl)) return;
		mqDockEl = document.createElement("div");
		mqDockEl.className = "mq_dock";
		document.body.appendChild(mqDockEl);
		// 事件委托:重试/移除/清空/折叠
		mqDockEl.addEventListener("click", function (ev) {
			var el = ev.target;
			var act = el && el.getAttribute ? el.getAttribute("data-mq") : null;
			if (!act) return;
			if (act === "toggle") { mqCollapsed = !mqCollapsed; mqRender(); return; }
			if (act === "clear") {
				mqItems = mqItems.filter(function (i) { return i.status !== "done" && i.status !== "failed" });
				mqPersist(); mqRender(); return;
			}
			var idx = parseInt(el.getAttribute("data-idx") || "-1", 10);
			var it = mqItems[idx];
			if (!it) return;
			if (act === "retry" && it.status === "failed") {
				it.status = "queued"; it.error = null; it.retries = 0;
				mqPersist(); mqRender(); mqScheduleNext();
			} else if (act === "remove" && it.status !== "installing" && it.status !== "waiting") {
				mqItems.splice(idx, 1); mqPersist(); mqRender();
			}
		});
	}
	function mqRender() {
		if (!mqDockEl || !document.body.contains(mqDockEl)) mqEnsureDock();
		if (!mqItems.length) { mqDockEl.style.display = "none"; return; }
		mqDockEl.style.display = "";
		var running = mqItems.filter(function (i) { return i.status === "installing" || i.status === "waiting" }).length;
		var pending = mqItems.filter(function (i) { return i.status === "queued" }).length;
		var done = mqItems.filter(function (i) { return i.status === "done" }).length;
		var failed = mqItems.filter(function (i) { return i.status === "failed" }).length;
		var summary = [];
		if (running) summary.push(running + " 进行中");
		if (pending) summary.push(pending + " 排队");
		if (done) summary.push(done + " 完成");
		if (failed) summary.push(failed + " 失败");
		var badge = { queued: ["排队中", ""], waiting: ["等空闲", "mq_bWait"], installing: ["安装中", "mq_bRun"], done: ["已完成", "mq_bDone"], failed: ["失败", "mq_bFail"] };
		var rows = mqItems.map(function (it, idx) {
			var b = badge[it.status] || badge.queued;
			var sub = it.status === "failed" ? (it.error || "安装失败") : it.status === "done" ? "安装完成,可在插件页启用/配置" : it.status === "installing" ? (it.progress || "准备中…") : (it.error || "等待前序完成");
			var actions = "";
			if (it.status === "failed") actions += '<button class="mq_x" data-mq="retry" data-idx="' + idx + '" title="重试">↻</button>';
			if (it.status !== "installing" && it.status !== "waiting") actions += '<button class="mq_x" data-mq="remove" data-idx="' + idx + '" title="移除">✕</button>';
			return '<div class="mq_item"><div class="mq_main"><div class="mq_nm" title="' + mqEsc(it.name) + '">' + mqEsc(it.name) + '</div><div class="mq_sub' + (it.status === "failed" ? " mq_subErr" : "") + '" title="' + mqEsc(sub) + '">' + mqEsc(sub) + '</div></div><span class="mq_badge ' + b[1] + '">' + b[0] + '</span>' + actions + '</div>';
		}).join("");
		mqDockEl.innerHTML = '<div class="mq_head"><span class="mq_title">插件下载队列 · ' + mqEsc(summary.join(" / ")) + '</span>' +
			((done || failed) ? '<button class="mq_hbtn" data-mq="clear">清完成</button>' : '') +
			'<button class="mq_hbtn" data-mq="toggle">' + (mqCollapsed ? "▲" : "▼") + '</button></div>' +
			(mqCollapsed ? '' : '<div class="mq_list">' + rows + '</div>');
	}
	// 从安装按钮所在卡片向上找卡容器(语义后缀 _card,哈希前缀浮动)
	function mqFindCard(el) {
		var p = el;
		while (p && p !== document.body) {
			var cls = String(p.className || "").split(/\s+/);
			for (var i = 0; i < cls.length; i++) { if (/^[A-Za-z0-9]+_card$/.test(cls[i])) return p; }
			p = p.parentElement;
		}
		return null;
	}
	// 市场区段激活时给每个"安装"按钮旁注入"+队列";防抖 MO 兼容搜索/翻页重渲染
	function mqScanDialog() {
		var dlg = document.querySelector('div[role="dialog"]');
		if (!dlg || !dlg.querySelector('button[data-section-id="market"][class*="_active"]')) return;
		var btns = dlg.querySelectorAll('[class*="installBtn"]');
		for (var i = 0; i < btns.length; i++) {
			var b = btns[i];
			var t = (b.textContent || "").trim();
			if (t !== "安装" && t !== "Install") continue;
			var holder = b.closest('[class*="cardAction"]') || b.parentElement;
			if (!holder || holder.querySelector(".mqAdd")) continue;
			var card = mqFindCard(holder);
			var nameEl = card && card.querySelector('[class*="_nm"]');
			var name = (nameEl && (nameEl.getAttribute("title") || nameEl.textContent) || "").trim();
			var srcA = card && card.querySelector('a[class*="_src"]');
			var url = srcA ? srcA.getAttribute("href") : "";
			var add = document.createElement("button");
			add.type = "button";
			add.className = "mqAdd";
			add.textContent = "+队列";
			add.title = "加入批量下载队列(无需逐个等待)";
			(function (nm, u, btn) {
				btn.addEventListener("click", function (ev) { ev.stopPropagation(); mqEnqueue(nm, u, btn); });
			})(name, url, add);
			holder.appendChild(add);
		}
	}
	function installMarketQueue() {
		mqLoad();
		mqEnsureDock();
		mqRender();
		mqScheduleNext(2500); // 恢复上次未完成的队列
		var scanTimer = null;
		var mo = new MutationObserver(function () {
			if (scanTimer) return;
			scanTimer = window.setTimeout(function () { scanTimer = null; mqScanDialog(); }, 350);
		});
		mo.observe(document.body, { childList: true, subtree: true });
	}

	function apply(ctx) {
		// [local] 原生右栏轨道塌陷:display:none 之外的 grid 轨道补偿
		installNativeTrackCollapse();
		// [local] node-nav 圆点:侧栏展开隐藏 / 收起显示(左移窄轨旁)
		installSidebarDotSync();
		// [问题93→95] better-sidebar 入口/面板右距统一常量底线(废弃内容测量,两页类型像素恒一致)
		installSidebarEntryPin();
		// [local] 设置导航 data-section-id 注入(问题1:皮肤/皮肤中心/宠物统一入口)
		installSettingsNavPatch();
		// [问题47] 发送乐观回显:新会话首条 ~4s 后端回执空窗的感知补偿(热会话 150ms 快路径不触发)
		installSendEcho();
		// [问题48] 会话智能摘要:首轮完成后生成副标题显示于侧栏
		installSessionSummary(ctx);
		// [需求] 目录选择器盘符行:工作区目录选择对话框直达盘符
		installDrivePicker(ctx);
		// [R44] 侧边栏浏览器:右侧滑出面板(地址栏/搜索 + iframe 经壳 /browse 代理)
		installSidebarBrowser();
		// [问题62] 设置弹窗打开期间解除侧栏列 overflow:hidden 裁剪
		installSettingsOverlayEscape();
		// [问题79] 插件市场批量下载队列(+队列按钮/进度坞/串行执行/错误隔离)
		installMarketQueue();
		// [R43] 皮肤中心/宠物页返回按钮(内容区顶部胶囊,跳回皮肤区段)
		installSectionBackButtons();
		// [问题4] 提示词增强按钮已迁至独立插件 dsh-enhance-prompt(2026-08),dshvt 不再注入,避免双挂载。
			// 「插件」区段:唯一的"插件管理"tab(合并原只读清单;上游 all tab 行已禁用)
			ctx.effect(() => ctx.locale.register(NS2, {
				zh: { tab: "插件管理" },
				en: { tab: "Manage" },
			}), "dsh-plugin-mgr: dictionaries");
			const t2 = ctx.locale.bind(NS2);
			const list = async () => {
				const result = await ctx.remote.pluginInventory.list();
				if (!result.ok) throw new Error(`pluginInventory.list failed: ${result.error.code}: ${result.error.message}`);
				return result.value;
			};
			ctx.slots.inject("settings.plugins.tab", () => ctx.slots.register({
				name: "settings.plugins.tab",
				id: "manage",
				order: 20,
				label: () => t2("tab"),
				locale: NS2,
			}, function ManagedTabHost() {
				// 经 createElement 交给 React 渲染,保证 PluginManagerTab 内的 hooks 生效
				return react.createElement(PluginManagerTab, { list: list });
			}));

			// [b20] 「插件」区段第三个 tab:Web UI 插件合并管理页(家族 web-ui-* 行统一展示/启停/入口)
			ctx.effect(() => ctx.locale.register(NS8, {
				zh: { tab: "Web UI 插件" },
				en: { tab: "Web UI" },
			}), "dsh-webui-plugins-tab: dictionaries");
			const t8 = ctx.locale.bind(NS8);
			ctx.slots.inject("settings.plugins.tab", () => ctx.slots.register({
				name: "settings.plugins.tab",
				id: "web-ui-plugins",
				order: 30,
				label: () => t8("tab"),
				locale: NS8,
			}, function WebUiPluginsTabHost() {
				return react.createElement(WebUiPluginsTab, { list: list });
			}));

			// ---------- 独立设置模块(settings.section,单页无 tab chrome,同 Agent 预设) ----------

			ctx.effect(() => ctx.locale.register(NS3, {
				zh: { nav: "人设" },
				en: { nav: "Persona" },
			}), "dsh-persona-section: dictionaries");
			const t3 = ctx.locale.bind(NS3);
		ctx.slots.inject("settings.section", () => ctx.slots.register({
			name: "settings.section",
			id: "persona",
			order: 11,
				label: () => t3("nav"),
				locale: NS3,
			}, function PersonaSectionHost() {
				return react.createElement(PersonaTab);
			}));

			ctx.effect(() => ctx.locale.register(NS4, {
				zh: { nav: "技能" },
				en: { nav: "Skills" },
			}), "dsh-skills-section: dictionaries");
			const t4 = ctx.locale.bind(NS4);
		ctx.slots.inject("settings.section", () => ctx.slots.register({
			name: "settings.section",
			id: "skills",
			order: 12,
				label: () => t4("nav"),
				locale: NS4,
		}, function SkillsSectionHost() {
		// [问题74] 技能 + MCP 拆分为同页双标签(Skill/MCP 分页展示,互不混排)
		return react.createElement(SkillsMcpSection, { list: list });
	}));

			ctx.effect(() => ctx.locale.register(NS6, {
				zh: { nav: "皮肤" },
				en: { nav: "Skin" },
			}), "dsh-skin-section: dictionaries");
			const t6 = ctx.locale.bind(NS6);
		// [R19+问题1] 插件安装态检测(皮肤中心/宠物,供「皮肤」页入口卡显示)
		// 用 DOM 探测而非 pluginInventory:home patch 的 disabled 行(ui-skin-center)会误伤运行时判定;
		// 设置面板内导航按钮与 SkinTab 同屏渲染,首轮即命中。
		const checkNavButton = (labelText) => new Promise((resolve) => {
			const probe = (tries) => {
				try {
					const btns = Array.from(document.querySelectorAll("button"));
				 const hit = btns.find((b) => (b.textContent || "").trim() === labelText);
					if (hit) return resolve("on");
				} catch (e) { /* 重试 */ }
				if (tries <= 0) return resolve("off");
				window.setTimeout(() => probe(tries - 1), 300);
			};
			probe(6);
		});
		const checkSkinCenter = () => checkNavButton("皮肤中心");
		const checkPet = () => checkNavButton("宠物");
		ctx.slots.inject("settings.section", () => ctx.slots.register({
			name: "settings.section",
			id: "skin",
			order: 14,
				label: () => t6("nav"),
				locale: NS6,
			}, function SkinSectionHost() {
			return react.createElement(SkinTab, { checkSkinCenter, checkPet });
		}));

			ctx.effect(() => ctx.locale.register(NS7, {
				zh: { nav: "更新" },
				en: { nav: "Update" },
			}), "dsh-update-section: dictionaries");
			const t7 = ctx.locale.bind(NS7);
		ctx.slots.inject("settings.section", () => ctx.slots.register({
			name: "settings.section",
			id: "updates",
			order: 22,
				label: () => t7("nav"),
				locale: NS7,
			}, function UpdateSectionHost() {
				return react.createElement(UpdateTab);
			}));

			// 皮肤:启动时从壳读取持久化状态并恢复背景/氛围音频(壳未运行则静默跳过)
		try { localStorage.removeItem("dshDesktop.skin"); } catch (e) { /* 旧键清理 */ }
		api("/skin/assets").then(function (r) {
			applySkinVisual(r.state);
		}).catch(function () { /* 壳不可用:保持默认 */ });
	}

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
