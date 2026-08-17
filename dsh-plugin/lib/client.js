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
			".vt_page{display:flex;flex-direction:column;gap:12px;max-width:760px}",
			".vt_head{display:flex;flex-direction:column;gap:4px;padding:2px 2px 0}",
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
			".pm_search{border-radius:10px;transition:border-color .15s,box-shadow .15s}",
			".pm_search:focus-within{border-color:#d97757;box-shadow:0 0 0 3px rgba(217,119,87,.12)}",
			// ---- node-nav 圆点精化 + 侧栏联动(覆盖层,优先级高于插件自身样式) ----
			".dsh-node-nav-rail{transition:left .3s cubic-bezier(.32,.72,0,1),opacity .22s ease,visibility .22s ease!important}",
			".dsh-node-nav-dot{width:7px!important;height:7px!important;border-width:1.5px!important;opacity:.55;transition:transform .22s cubic-bezier(.32,.72,0,1),background .18s ease,box-shadow .18s ease,border-color .18s ease,opacity .18s ease!important}",
			".dsh-node-nav-dot:hover{opacity:1;transform:scale(1.45)!important}",
			".dsh-node-nav-dot-active{opacity:1!important}",
			".dsh-node-nav-dot-unloaded{opacity:.32!important}",
			".dsh-node-nav-line{opacity:.45;transition:opacity .2s ease}",
			".dsh-node-nav-rail:hover .dsh-node-nav-line{opacity:.85}",
			".dsh-node-nav-bottom{opacity:.55;transition:transform .22s cubic-bezier(.32,.72,0,1),background .18s ease,box-shadow .18s ease,border-color .18s ease,opacity .18s ease!important}",
			".dsh-node-nav-bottom:hover{opacity:1}",
			"body.dsh-vt-sidebar-open .dsh-node-nav-rail{opacity:0!important;visibility:hidden!important;pointer-events:none!important}",
			"body.dsh-vt-nav-sync:not(.dsh-vt-sidebar-open) .dsh-node-nav-rail{left:68px!important}",
			"body.dsh-vt-nav-sync:not(.dsh-vt-sidebar-open) .dsh-node-nav-preview{left:92px!important}",
			"body.dsh-vt-nav-sync:not(.dsh-vt-sidebar-open) .dsh-node-nav-miss{left:92px!important}"
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
				h("div", { className: "pm_list", "aria-busy": busy[0] ? "true" : undefined }, rows),
				h("div", { className: msgCls }, msg[0]),
				h("div", { className: "pm_msg" }, "切换即时生效(写入 ~/.dsh/cordis.patch.yml,由 dsh 热加载,无需重启)。核心插件与系统禁用项不可在此操作;启用 = 恢复组合默认。"));
		}

		var inject = ["slots", "locale", "remote", "remote.pluginInventory"];

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
			h("div", { className: "vt_card" },
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
			h("div", { className: "pm_msg" }, "保存写入 ~/.dsh/cordis.patch.yml 并热载入;对新发起的对话生效,进行中的对话不受影响。清空后保存等于恢复默认。"));
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
		return h("div", { className: "vt_group" },
			h("div", { className: "vt_groupTitle" }, "用户技能"),
			h("label", { className: "pm_search" },
				h("span", { className: "pm_tag" }, "搜索"),
				h("input", { value: q[0], placeholder: "按名称或描述过滤", onChange: function (ev) { q[1](ev.currentTarget.value); } })),
			h("div", { className: "cm_count" }, mine.length + " 个用户技能" + (st[0].others.length ? " · " + st[0].others.length + " 个其他来源" : "")),
			h("div", { className: "pm_list" }, rows),
			otherRows.length ? h("div", { className: "cm_h2" }, "其他来源(随工作区/组合自动加载)") : null,
			otherRows.length ? h("div", { className: "pm_list" }, otherRows) : null,
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
				h("div", { className: "pm_list" }, rows),
				h("div", { className: msgCls }, msg[0]),
				h("div", { className: "pm_msg" }, "MCP 客户端(@deepseek-ai/dsh-mcp-client)每个实例连接一个 MCP server 并把工具注册为 mcp__<server>__<tool>。开关写 home patch 热载入;删除仅对本工具写入的条目生效。手动添加示例:"),
				h("pre", { className: "sk_code" }, MCP_SNIPPET),
				h("div", { className: "pm_msg" }, "保存后热载入。要求包可从 dsh 安装或 profile 解析(dsh plugin add);serverName 全局唯一。"));
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
			h("div", { className: "vt_group" },
				h("div", { className: "pm_list" }, [shellRow, dshRow])),
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
		}

		/** 将皮肤状态渲染为背景层(img/video)+ 透明化样式 + 氛围音频。 */
		function applySkinVisual(state) {
			state = state || {};
			var style = document.getElementById(BG_STYLE_ID);
			if (!style) {
				style = document.createElement("style");
				style.id = BG_STYLE_ID;
				document.head.appendChild(style);
			}
			var hasBg = !!(state.bg && state.bg.url);
			if (hasBg) {
				var dim = typeof state.dim === "number" ? state.dim : 0.45;
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
				].join("");
			} else {
				style.textContent = "";
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

		function SkinTab() {
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
					applySkinVisual(r.state);
					setSt(function (prev) { return { status: "ready", assets: prev.assets || [], state: r.state }; });
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
		return h("div", { className: "vt_page" },
			h("input", { ref: fileRef, type: "file", style: { display: "none" },
				accept: ".jpg,.jpeg,.png,.gif,.webp,.bmp,.mp4,.webm,.mov,.mkv,.mp3,.wav,.ogg,.flac,.m4a",
				onChange: onFile }),
			h("div", { className: "vt_head" },
				h("h2", { className: "vt_h2" }, "皮肤"),
				h("p", { className: "vt_intro" }, "导入图片/视频作为界面背景,音频作循环氛围声;也可直接应用 Wallpaper Engine 创意工坊的视频壁纸。")),
			h("div", { className: "vt_group" },
				h("div", { className: "vt_groupTitle" }, "当前效果"),
				h("div", { className: "pm_list" }, [bgRow, audioRow])),
			h("div", { className: "vt_group" },
				h("div", { className: "vt_groupTitle" }, "自定义资产"),
				h("div", { className: "ps_btns" },
					h("button", { className: "pm_btn", disabled: busy[0], onClick: function () { if (fileRef.current) fileRef.current.click(); } }, "导入文件"),
					h("span", { className: "cm_count" }, assets.length + " 个资产")),
				h("div", { className: "pm_list" }, assetRows)),
			h("div", { className: "vt_group" },
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

	// ---- [local] node-nav 圆点与左侧栏联动 ----
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
	}

	function apply(ctx) {
		// [local] 原生右栏轨道塌陷:display:none 之外的 grid 轨道补偿
		installNativeTrackCollapse();
		// [local] node-nav 圆点:侧栏展开隐藏 / 收起显示(左移窄轨旁)
		installSidebarDotSync();
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
		// 技能 + MCP 合并为一页两块(Claude GUI 式卡片排版)
		return react.createElement("div", { className: "vt_page" },
			react.createElement("div", { className: "vt_head" },
				react.createElement("h2", { className: "vt_h2" }, "技能"),
				react.createElement("p", { className: "vt_intro" }, "管理本地技能目录与 MCP 服务器连接。启停与删除即时热生效,无需重启服务。")),
			react.createElement(SkillsTab),
			react.createElement("div", { className: "vt_group" },
				react.createElement("div", { className: "vt_groupTitle" }, "MCP 服务器"),
				react.createElement(McpTab, { list: list })));
	}));

			ctx.effect(() => ctx.locale.register(NS6, {
				zh: { nav: "皮肤" },
				en: { nav: "Skin" },
			}), "dsh-skin-section: dictionaries");
			const t6 = ctx.locale.bind(NS6);
		ctx.slots.inject("settings.section", () => ctx.slots.register({
			name: "settings.section",
			id: "skin",
			order: 14,
				label: () => t6("nav"),
				locale: NS6,
			}, function SkinSectionHost() {
			return react.createElement(SkinTab);
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
