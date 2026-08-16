// dsh-desktop 版本切换 tab:注入 Web UI Settings → Plugins 区段。
// 与壳(127.0.0.1:30801)通信,复用壳的预检/回滚/重启编排。
window.__ModuleLoader__.load({
	id: "dsh-desktop-version-tab",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");

		var NS = "dshDesktop.versionTab";
		var SHELL_API = "http://127.0.0.1:30801";

		var css = [
			".dt_root{display:flex;flex-direction:column;gap:10px;padding:4px 0}",
			".dt_row{display:flex;align-items:center;justify-content:space-between;gap:10px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:10px 12px}",
			".dt_rowCur{border-color:#238636}",
			".dt_rowBusy{opacity:.5;pointer-events:none}",
			".dt_name{font-family:var(--dsw-font-mono);font-size:13px;color:var(--dsw-alias-label-primary)}",
			".dt_tag{font-size:11px;color:var(--dsw-alias-label-tertiary)}",
			".dt_tagCur{color:#3fb950}",
			".dt_btn{background:var(--dsw-alias-fill-l2);color:var(--dsw-alias-label-primary);border:1px solid var(--dsw-alias-border-l2);border-radius:6px;padding:4px 12px;font-size:12px;cursor:pointer}",
			".dt_btn:hover{border-color:var(--dsw-alias-label-secondary)}",
			".dt_msg{font-size:12px;color:var(--dsw-alias-label-tertiary);min-height:16px;word-break:break-all}",
			".dt_msgOk{color:#3fb950}.dt_msgErr{color:#f85149}",
			".dt_meta{font-size:12px;color:var(--dsw-alias-label-tertiary);line-height:1.7}",
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
			".pm_tagOn{color:#3fb950}.pm_tagOff{color:#f85149}.pm_tagSys{color:#d29922}",
			".pm_phase{font-size:11px;color:var(--dsw-alias-label-tertiary)}",
			".pm_phaseFailed{color:#f85149}",
			".pm_btn{background:var(--dsw-alias-fill-l2);color:var(--dsw-alias-label-primary);border:1px solid var(--dsw-alias-border-l2);border-radius:6px;padding:3px 12px;font-size:12px;cursor:pointer}",
			".pm_btn:hover{border-color:var(--dsw-alias-label-secondary)}",
			".pm_btnDis{border-color:#da3633;color:#f85149}",
			".pm_list{display:flex;flex-direction:column;gap:6px;max-height:52vh;overflow:auto}",
			".pm_msg{font-size:12px;color:var(--dsw-alias-label-tertiary);min-height:16px;word-break:break-all}",
			".pm_msgOk{color:#3fb950}.pm_msgErr{color:#f85149}"
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

		function VersionTab() {
			var state = react.useState(null);
			var setState = state[1];
			var busy = react.useState(false);
			var setBusy = busy[1];
			var msg = react.useState("");
			var setMsg = msg[1];

			var load = function () {
				return api("/state").then(function (s) {
					setState(s);
				}).catch(function (e) {
					setState({ error: "无法连接桌面壳: " + e.message });
				});
			};
			react.useEffect(function () { load(); }, []);

			var doSwitch = function (v) {
				setBusy(true);
				setMsg("正在验证 " + v + " …(首次需下载依赖)");
				api("/switch", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ version: v }),
				}).then(function (r) {
					if (!r.accepted) { setMsg(r.error || "切换被拒绝"); setBusy(false); return; }
					setMsg("已请求切换到 " + v + ",完成后页面将自动刷新。");
					// 轮询壳状态,切换结束(成功或回滚)后刷新视图
					var poll = setInterval(function () {
						api("/state").then(function (s) {
							if (!s.switching) {
								clearInterval(poll);
								load();
								setBusy(false);
							}
						}).catch(function () { /* 壳短暂重启,继续轮询 */ });
					}, 2000);
				}).catch(function (e) {
					setMsg("请求失败: " + e.message);
					setBusy(false);
				});
			};

			var h = react.createElement;
			if (!state[0]) return h("div", { className: "dt_root" }, h("div", { className: "dt_meta" }, "正在读取版本信息…"));
			var s = state[0];
			if (s.error) return h("div", { className: "dt_root" },
				h("div", { className: "dt_msg dt_msgErr" }, s.error),
				h("div", { className: "dt_meta" }, "请确认通过 DeepSeek Harness 桌面版启动,或刷新重试。"));

			var rows = (s.availableVersions || []).map(function (v) {
				var cur = v === s.dshVersion;
				return h("div", {
					key: v,
					className: "dt_row" + (cur ? " dt_rowCur" : "") + (busy[0] ? " dt_rowBusy" : ""),
				},
					h("span", { className: "dt_name" }, v),
					cur
						? h("span", { className: "dt_tag dt_tagCur" }, "当前使用")
						: h("button", { className: "dt_btn", onClick: function () { doSwitch(v); } }, "切换"));
			});
			if (!rows.length) rows = [h("div", { key: "empty", className: "dt_meta" }, "暂无可用版本(仅展示 npm 公开发布后的版本)")];

			var msgCls = "dt_msg" + (msg[0].indexOf("失败") >= 0 || msg[0].indexOf("拒绝") >= 0 ? " dt_msgErr" : msg[0].indexOf("已切换") >= 0 ? " dt_msgOk" : "");
			return h("div", { className: "dt_root" },
				rows,
				h("div", { className: msgCls }, msg[0]),
				h("div", { className: "dt_meta" },
					"壳版本 " + (s.shellVersion || "-") + " · 切换前自动验证,失败自动回滚 · 服务重启后本页可能需要刷新"));
		}

		var NS2 = "dshDesktop.pluginMgr";

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

		// 插件管理 tab:运行时清单来自 ctx.remote.pluginInventory(host 只读投影),
		// 持久禁用集来自壳 30801(读写 ~/.dsh/cordis.patch.yml,dsh watcher 热应用)。
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
				var tag, tagCls, btn = null;
				if (userOff) { tag = "已禁用(用户)"; tagCls = "pm_tag pm_tagOff"; }
				else if (systemOff) { tag = "系统禁用"; tagCls = "pm_tag pm_tagSys"; }
				else { tag = "已启用"; tagCls = "pm_tag pm_tagOn"; }
				var row = { entryId: e.entryId, pid: pid };
				if (userOff) btn = h("button", { className: "pm_btn", disabled: busy[0] === e.entryId, onClick: function () { doToggle(row, false); } }, "启用");
				else if (pid && e.enabled && !isProtected) btn = h("button", { className: "pm_btn pm_btnDis", disabled: busy[0] === e.entryId, onClick: function () { doToggle(row, true); } }, "禁用");
				return h("div", { key: e.entryId, className: "pm_row" + (e.enabled ? "" : " pm_rowOff") },
					h("div", { className: "pm_left" },
						h("span", { className: "pm_name", title: e.moduleName }, shortName(e.moduleName)),
						h("span", { className: "pm_id" }, (pid || e.entryId) + (isProtected ? " · 核心" : pid ? "" : " · 子树/动态行"))),
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

		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, {
				zh: { tab: "dsh 版本" },
				en: { tab: "dsh Version" },
			}), "dsh-version-tab: dictionaries");
			const t = ctx.locale.bind(NS);
			ctx.slots.inject("settings.plugins.tab", () => ctx.slots.register({
				name: "settings.plugins.tab",
				id: "dsh-version",
				order: 30,
				label: () => t("tab"),
				locale: NS,
			}, VersionTab));

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
			}, function ManagedTab() {
				// 经 createElement 交给 React 渲染,保证 PluginManagerTab 内的 hooks 生效
				return react.createElement(PluginManagerTab, { list: list });
			}));
		}

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
