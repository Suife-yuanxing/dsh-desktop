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
			".pm_tagOn{color:#3fb950}.pm_tagOff{color:#f85149}.pm_tagSys{color:#d29922}.pm_tagErr{color:#f85149}",
			".pm_phase{font-size:11px;color:var(--dsw-alias-label-tertiary)}",
			".pm_phaseFailed{color:#f85149}",
			".pm_btn{background:var(--dsw-alias-fill-l2);color:var(--dsw-alias-label-primary);border:1px solid var(--dsw-alias-border-l2);border-radius:6px;padding:3px 12px;font-size:12px;cursor:pointer}",
			".pm_btn:hover{border-color:var(--dsw-alias-label-secondary)}",
			".pm_btnDis{border-color:#da3633;color:#f85149}",
			".pm_list{display:flex;flex-direction:column;gap:6px;max-height:52vh;overflow:auto}",
			".pm_msg{font-size:12px;color:var(--dsw-alias-label-tertiary);min-height:16px;word-break:break-all}",
			".pm_msgOk{color:#3fb950}.pm_msgErr{color:#f85149}",
			".ps_txt{width:100%;min-height:180px;resize:vertical;background:transparent;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:8px 10px;color:var(--dsw-alias-label-primary);font-family:var(--dsw-font-mono);font-size:12px;line-height:1.6;box-sizing:border-box;outline:none}",
			".ps_txt:focus{border-color:var(--dsw-alias-label-secondary)}",
			".ps_btns{display:flex;gap:8px;align-items:center}",
			".sk_code{background:rgba(127,127,127,.08);border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:8px 10px;font-family:var(--dsw-font-mono);font-size:11px;white-space:pre;overflow:auto;color:var(--dsw-alias-label-secondary);margin:0}",
			".skn_row{display:flex;align-items:center;justify-content:space-between;gap:10px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:8px 12px;cursor:pointer}",
			".skn_row:hover{border-color:var(--dsw-alias-label-secondary)}",
			".skn_cur{border-color:#238636}"
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
		var NS3 = "dshDesktop.persona";
		var NS4 = "dshDesktop.skills";
		var NS5 = "dshDesktop.mcp";
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

		var inject = ["slots", "locale", "remote", "remote.pluginInventory", "theme"];

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
			return h("div", { className: "pm_root" },
				h("div", { className: "pm_msg" }, "全局人设经 system-prompt 插件注入。支持变量 {{model}}、{{cwd}}、{{provider}}(严格插值,未知变量会导致请求失败)。"),
				h("textarea", {
					className: "ps_txt", value: text[0], spellCheck: false, "aria-label": "全局人设",
					onChange: function (ev) { setText(ev.currentTarget.value); },
				}),
				h("div", { className: "ps_btns" },
					h("button", { className: "pm_btn", disabled: busy[0], onClick: function () { save(false); } }, "保存"),
					h("button", { className: "pm_btn", disabled: busy[0], onClick: function () { save(true); } }, "恢复默认"),
					st[0].isDefault ? h("span", { className: "pm_tag" }, "当前为默认") : h("span", { className: "pm_tag pm_tagOff" }, "已自定义")),
				h("div", { className: msgCls }, msg[0]),
				h("div", { className: "pm_msg" }, "保存写入 ~/.dsh/cordis.patch.yml 并热载入;对新发起的对话生效,进行中的对话不受影响。清空后保存等于恢复默认。"));
		}

		// ---------- 技能 tab(session.list 取上下文 → skill.list 列目录) ----------

		function SkillsTab() {
			var h = react.createElement;
			var st = react.useState({ status: "loading" });
			var setSt = st[1];
			var q = react.useState("");

			var load = function () {
				setSt({ status: "loading" });
				rpc("session.list", {}).then(function (v) {
					var items = (v && v.items) || [];
					var usable = items.filter(function (s) { return !s.blank; })[0] || items[0];
					if (!usable) { setSt({ status: "no-session" }); return; }
					return rpc("skill.list", { sessionId: usable.sessionId }).then(function (sv) {
						setSt({ status: "ready", skills: (sv && sv.skills) || [] });
					});
				}).catch(function (e) { setSt({ status: "error", message: String((e && e.message) || e) }); });
			};
			react.useEffect(function () { load(); }, []);

			if (st[0].status === "loading") return h("div", { className: "pm_root" }, h("div", { className: "pm_msg" }, "正在读取技能目录…"));
			if (st[0].status === "error") return h("div", { className: "pm_root" },
				h("div", { className: "pm_msg pm_msgErr" }, "读取失败: " + st[0].message),
				h("button", { className: "pm_btn", onClick: function () { load(); } }, "重试"));
			if (st[0].status === "no-session") return h("div", { className: "pm_root" },
				h("div", { className: "pm_msg" }, "暂无可用会话。技能目录与会话上下文绑定,请先创建一个会话再查看。"));

			var query = q[0].trim().toLowerCase();
			var rows = st[0].skills.filter(function (s) {
				return !query || (s.name || "").toLowerCase().indexOf(query) >= 0 || (s.description || "").toLowerCase().indexOf(query) >= 0;
			}).map(function (s) {
				return h("div", { key: s.name, className: "pm_row" },
					h("div", { className: "pm_left" },
						h("span", { className: "pm_name", title: s.name }, "/" + s.name),
						h("span", { className: "pm_id" }, s.description || ""),
						s.whenToUse ? h("span", { className: "pm_id" }, s.whenToUse) : null),
					h("div", { className: "pm_right" },
						h("span", { className: s.modelInvocable ? "pm_tag pm_tagOn" : "pm_tag pm_tagSys" }, s.modelInvocable ? "模型可调" : "仅 /命令")));
			});
			if (!rows.length) rows = [h("div", { key: "empty", className: "pm_msg" }, query ? "无匹配技能" : "当前会话上下文无技能(技能来自 ~/.dsh/skills 与工作区技能目录,文件系统管理)")];

			return h("div", { className: "pm_root" },
				h("label", { className: "pm_search" },
					h("span", { className: "pm_tag" }, "搜索"),
					h("input", { value: q[0], placeholder: "按名称或描述过滤", onChange: function (ev) { q[1](ev.currentTarget.value); } })),
				h("div", { className: "pm_msg" }, "共 " + st[0].skills.length + " 个技能(按首个可用会话的上下文列出)。"),
				h("div", { className: "pm_list" }, rows),
				h("div", { className: "pm_msg" }, "技能为文件系统管理(~/.dsh/skills 与工作区技能目录),上游暂无启停 API;此处为目录视图。"));
		}

		// ---------- MCP tab(inventory 过滤 mcp 行 + 配置指引) ----------

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

			var load = function () {
				setSt({ status: "loading" });
				props.list().then(function (snap) {
					setSt({ status: "ready", entries: (snap.entries || []).filter(function (e) { return /mcp/i.test(e.moduleName || "") || /mcp/i.test(e.entryId || ""); }) });
				}).catch(function (e) { setSt({ status: "error", message: String((e && e.message) || e) }); });
			};
			react.useEffect(function () { load(); }, []);

			if (st[0].status === "loading") return h("div", { className: "pm_root" }, h("div", { className: "pm_msg" }, "正在读取 MCP 实例…"));
			if (st[0].status === "error") return h("div", { className: "pm_root" },
				h("div", { className: "pm_msg pm_msgErr" }, "读取失败: " + st[0].message),
				h("button", { className: "pm_btn", onClick: function () { load(); } }, "重试"));

			var rows = st[0].entries.map(function (e) {
				var phase = e.fiberPhase === null || e.fiberPhase === undefined ? "unobserved" : e.fiberPhase;
				return h("div", { key: e.entryId, className: "pm_row" + (e.enabled ? "" : " pm_rowOff") },
					h("div", { className: "pm_left" },
						h("span", { className: "pm_name", title: e.moduleName }, shortName(e.moduleName)),
						h("span", { className: "pm_id" }, e.entryId)),
					h("div", { className: "pm_right" },
						e.enabled ? h("span", { className: "pm_phase" + (phase === "failed" ? " pm_phaseFailed" : "") }, PHASE_ZH[phase] || phase) : null,
						h("span", { className: e.enabled ? "pm_tag pm_tagOn" : "pm_tag pm_tagOff" }, e.enabled ? "已启用" : "已禁用")));
			});
			if (!rows.length) rows = [h("div", { key: "empty", className: "pm_msg" }, "当前组合未挂载任何 MCP 客户端实例。")];

			return h("div", { className: "pm_root" },
				h("div", { className: "pm_list" }, rows),
				h("div", { className: "pm_msg" }, "MCP 客户端(@deepseek-ai/dsh-mcp-client)经 composition 配置,每个实例连接一个 MCP server 并把工具注册为 mcp__<server>__<tool>:"),
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
			return h("div", { className: "pm_root" },
				h("div", { className: "pm_list" }, [shellRow, dshRow]),
				h("div", { className: "ps_btns" },
					h("button", { className: "pm_btn", disabled: busy[0], onClick: function () { doCheck(); } }, "检查更新"),
					h("button", { className: "pm_btn", disabled: busy[0], onClick: function () { api("/updates/open-releases", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }); } }, "打开 Releases 页")),
				c && c.shellNote ? h("div", { className: "pm_msg" }, c.shellNote) : null,
				h("div", { className: msgCls }, msg[0]),
				h("div", { className: "pm_msg" }, "壳更新从 GitHub(Suife-yuanxing/dsh-desktop)Releases 拉取:安装版自动下载并弹窗确认重启,便携版引导手动下载。dsh 更新先预检新版可运行性,失败自动回滚。"));
		}

		// ---------- 皮肤 tab(注册表 + ctx.theme.overrideTokens 官方覆盖层) ----------

		var SKIN_SOURCE = "dsh-desktop-skin";
		var SKINS = [
			{ id: "default", label: "默认", desc: "上游原生配色", tokens: null },
			{ id: "amber", label: "琥珀", desc: "业务强调色 → 琥珀", tokens: { "--dsw-alias-state-business-primary": { light: "#b45309", dark: "#f59e0b" } } },
			{ id: "violet", label: "紫罗兰", desc: "业务强调色 → 紫", tokens: { "--dsw-alias-state-business-primary": { light: "#6d28d9", dark: "#a78bfa" } } },
		];

		var skinDisposer = null;

		function currentSkinId() {
			try {
				var id = localStorage.getItem("dshDesktop.skin");
				if (id && SKINS.some(function (s) { return s.id === id; })) return id;
			} catch (e) { /* localStorage 不可用 */ }
			return "default";
		}

		function applySkinById(ctx, id) {
			var skin = SKINS.filter(function (s) { return s.id === id; })[0] || SKINS[0];
			if (skinDisposer) { try { skinDisposer(); } catch (e) { /* 已失效 */ } skinDisposer = null; }
			if (skin.tokens && ctx.theme && typeof ctx.theme.overrideTokens === "function") {
				try { skinDisposer = ctx.theme.overrideTokens(SKIN_SOURCE, skin.tokens); } catch (e) { /* 皮肤层失败不阻塞 */ }
			}
			try { localStorage.setItem("dshDesktop.skin", skin.id); } catch (e) { /* 忽略 */ }
		}

		function SkinTab(props) {
			var h = react.createElement;
			var sel = react.useState(props.current);
			var rows = SKINS.map(function (s) {
				var cur = sel[0] === s.id;
				return h("div", {
					key: s.id,
					className: "skn_row" + (cur ? " skn_cur" : ""),
					role: "radio", "aria-checked": cur ? "true" : "false", tabIndex: 0,
					onClick: function () { if (!cur) { sel[1](s.id); props.onSelect(s.id); } },
					onKeyDown: function (ev) { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); if (!cur) { sel[1](s.id); props.onSelect(s.id); } } },
				},
					h("div", { className: "pm_left" },
						h("span", { className: "pm_name" }, s.label),
						h("span", { className: "pm_id" }, s.desc)),
					h("div", { className: "pm_right" }, cur ? h("span", { className: "pm_tag pm_tagOn" }, "使用中") : null));
			});
			return h("div", { className: "pm_root", role: "radiogroup", "aria-label": "皮肤选择" },
				h("div", { className: "pm_list" }, rows),
				h("div", { className: "pm_msg" }, "皮肤经官方 theme.overrideTokens 覆盖层实现,浅色/深色自动适配,选择保存在本浏览器。皮肤内容暂定为强调色方案,后续扩充。"));
		}

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

			ctx.effect(() => ctx.locale.register(NS3, {
				zh: { tab: "人设" },
				en: { tab: "Persona" },
			}), "dsh-persona-tab: dictionaries");
			const t3 = ctx.locale.bind(NS3);
			ctx.slots.inject("settings.plugins.tab", () => ctx.slots.register({
				name: "settings.plugins.tab",
				id: "persona",
				order: 40,
				label: () => t3("tab"),
				locale: NS3,
			}, function PersonaTabHost() {
				return react.createElement(PersonaTab);
			}));

			ctx.effect(() => ctx.locale.register(NS4, {
				zh: { tab: "技能" },
				en: { tab: "Skills" },
			}), "dsh-skills-tab: dictionaries");
			const t4 = ctx.locale.bind(NS4);
			ctx.slots.inject("settings.plugins.tab", () => ctx.slots.register({
				name: "settings.plugins.tab",
				id: "skills",
				order: 50,
				label: () => t4("tab"),
				locale: NS4,
			}, function SkillsTabHost() {
				return react.createElement(SkillsTab);
			}));

			ctx.effect(() => ctx.locale.register(NS5, {
				zh: { tab: "MCP" },
				en: { tab: "MCP" },
			}), "dsh-mcp-tab: dictionaries");
			const t5 = ctx.locale.bind(NS5);
			ctx.slots.inject("settings.plugins.tab", () => ctx.slots.register({
				name: "settings.plugins.tab",
				id: "mcp",
				order: 60,
				label: () => t5("tab"),
				locale: NS5,
			}, function McpTabHost() {
				return react.createElement(McpTab, { list: list });
			}));

			ctx.effect(() => ctx.locale.register(NS6, {
				zh: { tab: "皮肤" },
				en: { tab: "Skin" },
			}), "dsh-skin-tab: dictionaries");
			const t6 = ctx.locale.bind(NS6);
			ctx.slots.inject("settings.plugins.tab", () => ctx.slots.register({
				name: "settings.plugins.tab",
				id: "skin",
				order: 70,
				label: () => t6("tab"),
				locale: NS6,
			}, function SkinTabHost() {
				return react.createElement(SkinTab, {
					current: currentSkinId(),
					onSelect: function (id) { applySkinById(ctx, id); },
				});
			}));

			ctx.effect(() => ctx.locale.register(NS7, {
				zh: { tab: "更新" },
				en: { tab: "Update" },
			}), "dsh-update-tab: dictionaries");
			const t7 = ctx.locale.bind(NS7);
			ctx.slots.inject("settings.plugins.tab", () => ctx.slots.register({
				name: "settings.plugins.tab",
				id: "updates",
				order: 80,
				label: () => t7("tab"),
				locale: NS7,
			}, function UpdateTabHost() {
				return react.createElement(UpdateTab);
			}));

			// 皮肤:启动时恢复上次选择(官方 overrideTokens 覆盖层,随浅/深色自动重算)
			applySkinById(ctx, currentSkinId());
		}

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
