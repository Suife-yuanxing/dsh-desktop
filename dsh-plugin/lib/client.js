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
			".dt_meta{font-size:12px;color:var(--dsw-alias-label-tertiary);line-height:1.7}"
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

		var inject = ["slots", "locale"];

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
		}

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
