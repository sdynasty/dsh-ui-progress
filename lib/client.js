window.__ModuleLoader__.load({
	id: "dsh-ui-progress",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/client/board-model.ts
		/**
		* Resolve the Workspace a Session belongs to, if any.
		* @param items - registry Workspace rows.
		* @param sessionId - Session to locate.
		* @returns the owning Workspace id, or undefined for the ungrouped bucket.
		*/
		function workspaceOfSession(items, sessionId) {
			return items.find((workspace) => workspace.sessionIds.includes(sessionId))?.workspaceId;
		}
		/**
		* Project the board rows from the live snapshots.
		* @param list - Host Session list with live increments.
		* @param statuses - unified per-Session UI status facts.
		* @param workspaces - Workspace registry snapshot supplying the archive set.
		* @param runStarts - observed run-start instants (see run-clock); optional.
		* @returns running and completed-unviewed rows plus the badge counts.
		*/
		function deriveBoard(list, statuses, workspaces, runStarts) {
			const archived = new Set(workspaces.archivedSessionIds);
			const runningChildren = /* @__PURE__ */ new Map();
			for (const summary of Object.values(list.byId)) {
				if (summary.parentId === void 0) continue;
				if (statuses.get(summary.id)?.running ?? summary.running) runningChildren.set(summary.parentId, (runningChildren.get(summary.parentId) ?? 0) + 1);
			}
			const rows = [];
			for (const id of list.ids) {
				const summary = list.byId[id];
				if (summary === void 0 || summary.blank || summary.origin === "subagent") continue;
				if (archived.has(id)) continue;
				const status = statuses.get(id);
				const pendingKind = status?.pendingInteraction?.kind;
				const running = pendingKind !== void 0 || (status?.running ?? summary.running);
				const unread = status?.completionUnread === true;
				if (!running && !unread) continue;
				rows.push({
					id,
					title: summary.displayTitle,
					workspaceId: workspaceOfSession(workspaces.items, id),
					pendingKind,
					running,
					runningSubagents: runningChildren.get(id) ?? 0,
					unread,
					startedAt: running ? runStarts?.get(id) : void 0,
					updatedAt: summary.updatedAt
				});
			}
			const running = rows.filter((row) => row.running).sort((left, right) => {
				const pendingDelta = Number(right.pendingKind !== void 0) - Number(left.pendingKind !== void 0);
				return pendingDelta !== 0 ? pendingDelta : right.updatedAt - left.updatedAt;
			});
			const unreadDone = rows.filter((row) => !row.running && row.unread).sort((left, right) => right.updatedAt - left.updatedAt);
			const pending = running.filter((row) => row.pendingKind !== void 0).length;
			return {
				running,
				unreadDone,
				counts: {
					running: running.length,
					pending,
					unreadDone: unreadDone.length,
					badge: running.length + unreadDone.length
				}
			};
		}
		//#endregion
		//#region src/client/completion-log.ts
		/** localStorage key of the persisted log (versioned with the entry fields). */
		const COMPLETION_LOG_STORAGE_KEY = "dsh.ui-progress.completion-log.v1";
		/** Log bounds: at most 50 entries, none older than 30 days. */
		const MAX_ENTRIES = 50;
		const MAX_AGE_MS = 720 * 60 * 60 * 1e3;
		function isEntry$1(value) {
			if (typeof value !== "object" || value === null) return false;
			const candidate = value;
			return typeof candidate.sessionId === "string" && typeof candidate.completedAt === "number" && typeof candidate.title === "string";
		}
		function readPersisted$1(storage) {
			if (storage === void 0) return [];
			try {
				const parsed = JSON.parse(storage.getItem("dsh.ui-progress.completion-log.v1") ?? "[]");
				return Array.isArray(parsed) ? parsed.filter(isEntry$1) : [];
			} catch (error) {
				console.warn("ui-progress: ignoring unreadable completion log", error);
				return [];
			}
		}
		/**
		* Create the completion log.
		* @param storage - persistence target; defaults to `localStorage` when present.
		* @param now - clock, injectable for tests.
		* @returns the observable source plus the snapshot fold.
		*/
		function createCompletionLog(storage = typeof localStorage === "undefined" ? void 0 : localStorage, now = () => Date.now()) {
			let entries = readPersisted$1(storage);
			let snapshot = { entries };
			const listeners = /* @__PURE__ */ new Set();
			const publish = (next) => {
				entries = next;
				snapshot = { entries };
				if (storage !== void 0) try {
					storage.setItem(COMPLETION_LOG_STORAGE_KEY, JSON.stringify(entries));
				} catch (error) {
					console.warn("ui-progress: could not persist the completion log", error);
				}
				for (const listener of listeners) listener();
			};
			return {
				source: {
					getSnapshot: () => snapshot,
					subscribe: (listener) => {
						listeners.add(listener);
						return () => {
							listeners.delete(listener);
						};
					}
				},
				observe(list, statuses, workspaces) {
					const archived = new Set(workspaces.archivedSessionIds);
					const cutoff = now() - MAX_AGE_MS;
					let next = entries.filter((entry) => entry.completedAt >= cutoff && !archived.has(entry.sessionId) && (list.phase !== "ready" || list.byId[entry.sessionId] !== void 0));
					let changed = next.length !== entries.length;
					const fresh = [];
					for (const id of list.ids) {
						if (archived.has(id)) continue;
						if (statuses.get(id)?.completionUnread !== true) continue;
						const summary = list.byId[id];
						if (summary === void 0 || summary.origin === "subagent") continue;
						const existing = next.find((entry) => entry.sessionId === id);
						if (existing !== void 0 && summary.updatedAt <= existing.completedAt) continue;
						if (existing !== void 0) {
							next = next.filter((entry) => entry.sessionId !== id);
							changed = true;
						}
						fresh.push({
							sessionId: id,
							completedAt: now(),
							title: summary.displayTitle,
							workspaceId: workspaceOfSession(workspaces.items, id)
						});
					}
					if (fresh.length > 0) {
						fresh.sort((left, right) => (list.byId[right.sessionId]?.updatedAt ?? 0) - (list.byId[left.sessionId]?.updatedAt ?? 0));
						next = [...fresh, ...next];
						changed = true;
					}
					if (!changed) return;
					publish(next.slice(0, MAX_ENTRIES));
				}
			};
		}
		//#endregion
		//#region src/client/run-clock.ts
		/** localStorage key of the persisted clock (versioned with the entry shape). */
		const RUN_CLOCK_STORAGE_KEY = "dsh.ui-progress.run-clock.v1";
		function isEntry(value) {
			return Array.isArray(value) && value.length === 2 && typeof value[0] === "string" && typeof value[1] === "number";
		}
		function readPersisted(storage) {
			if (storage === void 0) return [];
			try {
				const parsed = JSON.parse(storage.getItem("dsh.ui-progress.run-clock.v1") ?? "[]");
				return Array.isArray(parsed) ? parsed.filter(isEntry) : [];
			} catch (error) {
				console.warn("ui-progress: ignoring unreadable run clock", error);
				return [];
			}
		}
		/**
		* Create the run-start clock.
		* @param storage - persistence target; defaults to `localStorage` when present.
		* @param now - clock, injectable for tests.
		* @returns the observable source plus the snapshot fold.
		*/
		function createRunClock(storage = typeof localStorage === "undefined" ? void 0 : localStorage, now = () => Date.now()) {
			let entries = new Map(readPersisted(storage));
			const listeners = /* @__PURE__ */ new Set();
			const publish = (next) => {
				entries = next;
				if (storage !== void 0) try {
					storage.setItem(RUN_CLOCK_STORAGE_KEY, JSON.stringify([...next]));
				} catch (error) {
					console.warn("ui-progress: could not persist the run clock", error);
				}
				for (const listener of listeners) listener();
			};
			return {
				source: {
					getSnapshot: () => entries,
					subscribe: (listener) => {
						listeners.add(listener);
						return () => {
							listeners.delete(listener);
						};
					}
				},
				observe(list, statuses) {
					let next;
					const edit = () => {
						next ??= new Map(entries);
						return next;
					};
					for (const id of list.ids) {
						const summary = list.byId[id];
						if (summary === void 0 || summary.blank || summary.origin === "subagent") continue;
						const status = statuses.get(id);
						const running = status?.pendingInteraction !== void 0 || (status?.running ?? summary.running);
						if (running && !entries.has(id) && !next?.has(id)) edit().set(id, now());
						else if (!running && (entries.has(id) || next?.has(id) === true)) edit().delete(id);
					}
					if (list.phase === "ready") {
						for (const id of (next ?? entries).keys()) if (list.byId[id] === void 0) edit().delete(id);
					}
					if (next !== void 0) publish(next);
				}
			};
		}
		//#endregion
		//#region src/client/locales.ts
		/**
		* `progress` namespace dictionaries: the sidebar panel entry, the board page,
		* and the completion-log grouping copy.
		*/
		/** Dictionary namespace owned by this plugin. */
		const NS = "progress";
		/** Simplified Chinese dictionary (the key-set source of truth). */
		const zh = {
			"panel.label": "进度看板",
			"panel.badge.one": "{count} 个会话需要关注",
			"panel.badge.other": "{count} 个会话需要关注",
			"page.title": "进度看板",
			"page.hint": "所有工作空间的会话进度一览",
			"tabs.aria": "会话状态分栏",
			"tabs.all": "全部",
			"tabs.running": "进行中",
			"tabs.done": "已完成",
			"group.running": "进行中",
			"filter.aria": "按工作空间筛选",
			"filter.all": "全部工作空间",
			"filter.ungrouped": "未分组",
			"status.pending.approval": "等待审批",
			"status.pending.question": "等待回答",
			"status.pending.plan-review": "等待计划评审",
			"status.pending.other": "等待处理",
			"meta.subagents.one": "{count} 个子代理运行中",
			"meta.subagents.other": "{count} 个子代理运行中",
			"meta.lastActive.justNow": "刚刚活跃",
			"meta.lastActive.minutes": "{count} 分钟前活跃",
			"meta.lastActive.hours": "{count} 小时前活跃",
			"meta.lastActive.days": "{count} 天前活跃",
			"meta.completedAt.justNow": "刚刚完成",
			"meta.elapsed.justNow": "刚刚启动",
			"meta.elapsed.minutes": "已运行 {count} 分钟",
			"meta.elapsed.hours": "已运行 {count} 小时",
			"meta.elapsed.days": "已运行 {count} 天",
			"meta.completedAt.minutes": "{count} 分钟前完成",
			"meta.completedAt.hours": "{count} 小时前完成",
			"meta.completedAt.days": "{count} 天前完成",
			"group.unread": "未查看",
			"group.recent": "最近完成",
			"done.showMore": "显示更多（{count}）",
			"done.showLess": "收起",
			"empty.running": "当前没有进行中的会话",
			"empty.done": "还没有已完成的会话",
			"empty.all": "暂无进行中或未查看的已完成会话",
			"card.open": "打开会话：{title}"
		};
		/** English dictionary, key-identical to the Chinese source of truth. */
		const en = {
			"panel.label": "Progress",
			"panel.badge.one": "{count} session needs attention",
			"panel.badge.other": "{count} sessions need attention",
			"page.title": "Progress Board",
			"page.hint": "Session progress across every workspace",
			"tabs.aria": "Session status sections",
			"tabs.running": "Running",
			"tabs.done": "Done",
			"tabs.all": "All",
			"group.running": "Running",
			"filter.aria": "Filter by workspace",
			"filter.all": "All workspaces",
			"filter.ungrouped": "Ungrouped",
			"status.pending.approval": "Approval needed",
			"status.pending.question": "Question pending",
			"status.pending.plan-review": "Plan review pending",
			"status.pending.other": "Action needed",
			"meta.subagents.one": "{count} subagent running",
			"meta.subagents.other": "{count} subagents running",
			"meta.lastActive.justNow": "active just now",
			"meta.lastActive.minutes": "active {count}m ago",
			"meta.lastActive.hours": "active {count}h ago",
			"meta.lastActive.days": "active {count}d ago",
			"meta.completedAt.justNow": "completed just now",
			"meta.elapsed.justNow": "just started",
			"meta.elapsed.minutes": "running for {count}m",
			"meta.elapsed.hours": "running for {count}h",
			"meta.elapsed.days": "running for {count}d",
			"meta.completedAt.minutes": "completed {count}m ago",
			"meta.completedAt.hours": "completed {count}h ago",
			"meta.completedAt.days": "completed {count}d ago",
			"group.unread": "Unviewed",
			"group.recent": "Recently completed",
			"done.showMore": "Show more ({count})",
			"done.showLess": "Show less",
			"empty.running": "No sessions are running right now",
			"empty.done": "No completed sessions yet",
			"empty.all": "No running sessions or unviewed completions",
			"card.open": "Open session: {title}"
		};
		//#endregion
		//#region ../../../node_modules/.pnpm/clsx@2.1.1/node_modules/clsx/dist/clsx.mjs
		function r(e) {
			var t, f, n = "";
			if ("string" == typeof e || "number" == typeof e) n += e;
			else if ("object" == typeof e) if (Array.isArray(e)) {
				var o = e.length;
				for (t = 0; t < o; t++) e[t] && (f = r(e[t])) && (n && (n += " "), n += f);
			} else for (f in e) e[f] && (n && (n += " "), n += f);
			return n;
		}
		function clsx() {
			for (var e, t, f = 0, n = "", o = arguments.length; f < o; f++) (e = arguments[f]) && (t = r(e)) && (n && (n += " "), n += t);
			return n;
		}
		//#endregion
		//#region src/client/relative-time.ts
		/**
		* Ticking clock and relative-time formatting for card metadata. The hook is
		* component-internal behavioral state (it subscribes to no external source),
		* so several mounted cards share one interval per card rather than one per
		* timestamp line.
		*/
		/** Re-render the caller every `intervalMs` so relative times stay honest. */
		function useTickingNow(intervalMs = 3e4) {
			const [, bump] = (0, react.useReducer)((tick) => tick + 1, 0);
			(0, react.useEffect)(() => {
				const timer = setInterval(bump, intervalMs);
				return () => {
					clearInterval(timer);
				};
			}, [intervalMs]);
			return () => Date.now();
		}
		/**
		* Break an elapsed duration into a display phrase.
		* @param then - event epoch ms.
		* @param now - viewing epoch ms.
		* @returns the coarsest honest unit: minutes to 59, hours to 23, then days.
		*/
		function relativePhrase(then, now) {
			const elapsed = Math.max(0, now - then);
			const minutes = Math.floor(elapsed / 6e4);
			if (minutes < 1) return { kind: "justNow" };
			if (minutes < 60) return {
				kind: "minutes",
				count: minutes
			};
			const hours = Math.floor(minutes / 60);
			if (hours < 24) return {
				kind: "hours",
				count: hours
			};
			return {
				kind: "days",
				count: Math.floor(hours / 24)
			};
		}
		//#endregion
		//#region \0dsh-css:/Users/henry/Documents/deepseek/deepseek-harness/packages/client/ui-progress/src/client/SessionCard.module.css.mjs
		const css$3 = ".YoU2Ma_card{border:1px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-bg-layer-1);width:100%;color:var(--dsw-alias-label-primary);font:inherit;text-align:left;cursor:pointer;flex-direction:column;gap:6px;padding:10px 12px;display:flex}.YoU2Ma_card:hover{background:var(--dsw-alias-interactive-bg-hover)}.YoU2Ma_card:focus-visible{outline:2px solid var(--dsw-focus-ring-color);outline-offset:1px}.YoU2Ma_unread{border-left:3px solid var(--dsw-alias-state-success-primary)}.YoU2Ma_head{align-items:center;gap:8px;min-width:0;display:flex}.YoU2Ma_dot{flex:none}.YoU2Ma_title{text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0;font-weight:500;overflow:hidden}.YoU2Ma_workspace{text-overflow:ellipsis;white-space:nowrap;max-width:40%;color:var(--dsw-alias-label-tertiary);flex:none;font-size:11px;overflow:hidden}.YoU2Ma_meta{color:var(--dsw-alias-label-tertiary);align-items:center;gap:12px;font-size:11px;display:flex}.YoU2Ma_pending{color:var(--dsw-alias-state-warn-label);font-weight:500}.YoU2Ma_time{margin-left:auto}";
		const tagId$3 = "dsh-ui-progress/SessionCard.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$3) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-ui-progress";
			tag.dataset.pluginCss = tagId$3;
			tag.textContent = css$3;
			document.head.appendChild(tag);
		}
		var SessionCard_module_css_default = {
			"card": "YoU2Ma_card",
			"dot": "YoU2Ma_dot",
			"head": "YoU2Ma_head",
			"meta": "YoU2Ma_meta",
			"pending": "YoU2Ma_pending",
			"time": "YoU2Ma_time",
			"title": "YoU2Ma_title",
			"unread": "YoU2Ma_unread",
			"workspace": "YoU2Ma_workspace"
		};
		//#endregion
		//#region src/client/SessionCard.tsx
		/**
		* Render one Session card.
		* @param props - row facts, Workspace label, copy seat, and the open action.
		* @returns a button row; pending interaction outranks the running spinner.
		*/
		function SessionCard({ row, workspaceLabel, unread, timePrefix, onOpenSession, t }) {
			const now = useTickingNow();
			const dot = row.pendingKind !== void 0 ? "warning" : row.running ? "ongoing" : unread ? "done" : "idle";
			const pendingKey = row.pendingKind === "approval" || row.pendingKind === "question" || row.pendingKind === "plan-review" ? `status.pending.${row.pendingKind}` : "status.pending.other";
			const phrase = relativePhrase(row.startedAt ?? row.updatedAt, now());
			const prefix = row.running && row.startedAt !== void 0 ? "elapsed" : timePrefix;
			const timeLabel = phrase.kind === "justNow" ? t(`meta.${prefix}.justNow`) : t(`meta.${prefix}.${phrase.kind}`, { count: phrase.count });
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
				type: "button",
				className: clsx(SessionCard_module_css_default.card, unread && SessionCard_module_css_default.unread),
				onClick: () => {
					onOpenSession(row.id);
				},
				"aria-label": t("card.open", { title: row.title }),
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
					className: SessionCard_module_css_default.head,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.StateDot, {
							state: dot,
							size: 10,
							className: SessionCard_module_css_default.dot
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: SessionCard_module_css_default.title,
							children: row.title
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: SessionCard_module_css_default.workspace,
							children: workspaceLabel
						})
					]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
					className: SessionCard_module_css_default.meta,
					children: [
						row.pendingKind !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: SessionCard_module_css_default.pending,
							children: t(pendingKey)
						}),
						row.runningSubagents > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t(row.runningSubagents === 1 ? "meta.subagents.one" : "meta.subagents.other", { count: row.runningSubagents }) }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: SessionCard_module_css_default.time,
							children: timeLabel
						})
					]
				})]
			});
		}
		//#endregion
		//#region \0dsh-css:/Users/henry/Documents/deepseek/deepseek-harness/packages/client/ui-progress/src/client/ProgressBoardPage.module.css.mjs
		const css$2 = ".aDviWa_page{flex-direction:column;height:100%;min-height:0;display:flex;overflow:hidden}.aDviWa_header{align-items:baseline;gap:12px;padding:18px 24px 0;display:flex}.aDviWa_title{color:var(--dsw-alias-label-primary);font-size:16px;font-weight:600}.aDviWa_hint{color:var(--dsw-alias-label-tertiary);font-size:12px}.aDviWa_controls{border-bottom:1px solid var(--dsw-alias-border-l1);align-items:center;gap:12px;padding:14px 24px 12px;display:flex}.aDviWa_count{background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);border-radius:8px;margin-left:6px;padding:1px 6px;font-size:10px;font-weight:600}.aDviWa_filter{border:1px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);font:inherit;cursor:pointer;margin-left:auto;padding:4px 8px;font-size:12px}.aDviWa_filter:hover{color:var(--dsw-alias-label-primary)}.aDviWa_filter:focus-visible{outline:2px solid var(--dsw-focus-ring-color);outline-offset:1px}.aDviWa_board{flex:1;min-height:0;padding:16px 24px 24px;overflow-y:auto}.aDviWa_list{flex-direction:column;gap:8px;max-width:720px;display:flex}.aDviWa_group{margin-bottom:18px}.aDviWa_groupTitle{letter-spacing:.04em;color:var(--dsw-alias-label-tertiary);align-items:center;gap:6px;margin:0 0 8px;font-size:11px;font-weight:500;display:flex}.aDviWa_groupCount{font-weight:600}.aDviWa_empty{text-align:center;color:var(--dsw-alias-label-tertiary);padding:48px 0;font-size:12px}.aDviWa_showMore{border:1px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-sm);color:var(--dsw-alias-label-secondary);font:inherit;cursor:pointer;background:0 0;margin-top:8px;padding:4px 10px;font-size:12px}.aDviWa_showMore:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}";
		const tagId$2 = "dsh-ui-progress/ProgressBoardPage.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$2) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-ui-progress";
			tag.dataset.pluginCss = tagId$2;
			tag.textContent = css$2;
			document.head.appendChild(tag);
		}
		var ProgressBoardPage_module_css_default = {
			"board": "aDviWa_board",
			"controls": "aDviWa_controls",
			"count": "aDviWa_count",
			"empty": "aDviWa_empty",
			"filter": "aDviWa_filter",
			"group": "aDviWa_group",
			"groupCount": "aDviWa_groupCount",
			"groupTitle": "aDviWa_groupTitle",
			"header": "aDviWa_header",
			"hint": "aDviWa_hint",
			"list": "aDviWa_list",
			"page": "aDviWa_page",
			"showMore": "aDviWa_showMore",
			"title": "aDviWa_title"
		};
		//#endregion
		//#region src/client/ProgressBoardPage.tsx
		/**
		* Progress board main panel: Running and Done sections over every Workspace,
		* with a Workspace filter shared by both. All live facts arrive through the
		* root framework hooks; the completion history arrives through the injected
		* log the registration observes from `apply`.
		*/
		/** Cards the Done section shows before the Show-more toggle. */
		const RECENT_DEFAULT_COUNT = 10;
		/**
		* Render the progress board.
		* @param props - root Session/Workspace hooks, the completion log, localized copy, and the open action.
		* @returns All/Running/Done sections with a shared Workspace filter; All leads.
		*/
		function ProgressBoardPage(props) {
			const { useSessions, useSessionStatus, useWorkspaces, useCompletionLog, useRunClock, onOpenSession, t } = props;
			const list = useSessions((snapshot) => snapshot);
			const statuses = useSessionStatus((snapshot) => snapshot);
			const workspaces = useWorkspaces((snapshot) => snapshot);
			const log = useCompletionLog((snapshot) => snapshot);
			const runStarts = useRunClock((snapshot) => snapshot);
			const [tab, setTab] = (0, react.useState)("all");
			const [filter, setFilter] = (0, react.useState)("all");
			const board = (0, react.useMemo)(() => deriveBoard(list, statuses, workspaces, runStarts), [
				list,
				statuses,
				workspaces,
				runStarts
			]);
			const inFilter = (workspaceId) => filter === "all" || (filter === "ungrouped" ? workspaceId === void 0 : workspaceId === filter);
			const workspaceTitle = (id) => id === void 0 ? t("filter.ungrouped") : workspaces.items.find((item) => item.workspaceId === id)?.title ?? t("filter.ungrouped");
			const running = board.running.filter((row) => inFilter(row.workspaceId));
			const unreadDone = board.unreadDone.filter((row) => inFilter(row.workspaceId));
			const unreadIds = new Set(board.unreadDone.map((row) => row.id));
			const recent = (0, react.useMemo)(() => {
				const rows = [];
				for (const entry of log.entries) {
					if (unreadIds.has(entry.sessionId) || !inFilter(entry.workspaceId)) continue;
					rows.push({
						id: entry.sessionId,
						title: entry.title,
						workspaceId: entry.workspaceId,
						pendingKind: void 0,
						running: false,
						runningSubagents: 0,
						unread: false,
						startedAt: void 0,
						updatedAt: entry.completedAt
					});
				}
				return rows;
			}, [
				log,
				filter,
				board.unreadDone
			]);
			const [recentExpanded, setRecentExpanded] = (0, react.useState)(false);
			const recentVisible = recentExpanded ? recent : recent.slice(0, RECENT_DEFAULT_COUNT);
			const renderCard = (row, opts) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SessionCard, {
				row,
				workspaceLabel: workspaceTitle(row.workspaceId),
				unread: opts.unread,
				timePrefix: opts.timePrefix,
				onOpenSession,
				t
			}, row.id);
			const runningCards = /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: ProgressBoardPage_module_css_default.list,
				children: running.map((row) => renderCard(row, {
					unread: false,
					timePrefix: "lastActive"
				}))
			});
			const unreadSection = unreadDone.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				className: ProgressBoardPage_module_css_default.group,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("h2", {
					className: ProgressBoardPage_module_css_default.groupTitle,
					children: [t("group.unread"), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: ProgressBoardPage_module_css_default.groupCount,
						children: unreadDone.length
					})]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: ProgressBoardPage_module_css_default.list,
					children: unreadDone.map((row) => renderCard(row, {
						unread: true,
						timePrefix: "completedAt"
					}))
				})]
			});
			const doneSections = /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [unreadSection, recent.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				className: ProgressBoardPage_module_css_default.group,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("h2", {
						className: ProgressBoardPage_module_css_default.groupTitle,
						children: [t("group.recent"), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: ProgressBoardPage_module_css_default.groupCount,
							children: recent.length
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: ProgressBoardPage_module_css_default.list,
						children: recentVisible.map((row) => renderCard(row, {
							unread: false,
							timePrefix: "completedAt"
						}))
					}),
					recent.length > RECENT_DEFAULT_COUNT && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: ProgressBoardPage_module_css_default.showMore,
						onClick: () => {
							setRecentExpanded((expanded) => !expanded);
						},
						children: recentExpanded ? t("done.showLess") : t("done.showMore", { count: recent.length - RECENT_DEFAULT_COUNT })
					})
				]
			})] });
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: ProgressBoardPage_module_css_default.page,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("header", {
						className: ProgressBoardPage_module_css_default.header,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h1", {
							className: ProgressBoardPage_module_css_default.title,
							children: t("page.title")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: ProgressBoardPage_module_css_default.hint,
							children: t("page.hint")
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: ProgressBoardPage_module_css_default.controls,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.SegmentedTabs, {
							label: t("tabs.aria"),
							value: tab,
							onChange: setTab,
							items: [
								{
									value: "all",
									id: "progress-tab-all",
									panelId: "progress-panel-all",
									label: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [t("tabs.all"), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: ProgressBoardPage_module_css_default.count,
										children: board.counts.running + board.counts.unreadDone
									})] })
								},
								{
									value: "running",
									id: "progress-tab-running",
									panelId: "progress-panel-running",
									label: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [t("tabs.running"), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: ProgressBoardPage_module_css_default.count,
										children: board.counts.running
									})] })
								},
								{
									value: "done",
									id: "progress-tab-done",
									panelId: "progress-panel-done",
									label: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [t("tabs.done"), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: ProgressBoardPage_module_css_default.count,
										children: board.counts.unreadDone
									})] })
								}
							]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
							className: ProgressBoardPage_module_css_default.filter,
							"aria-label": t("filter.aria"),
							value: filter,
							onChange: (event) => {
								setFilter(event.target.value);
							},
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
									value: "all",
									children: t("filter.all")
								}),
								workspaces.items.map((item) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
									value: item.workspaceId,
									children: item.title
								}, item.workspaceId)),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
									value: "ungrouped",
									children: t("filter.ungrouped")
								})
							]
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: ProgressBoardPage_module_css_default.board,
						role: "tabpanel",
						id: `progress-panel-${tab}`,
						"aria-labelledby": `progress-tab-${tab}`,
						children: [
							tab === "all" && (running.length === 0 && unreadDone.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: ProgressBoardPage_module_css_default.empty,
								children: t("empty.all")
							}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [running.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
								className: ProgressBoardPage_module_css_default.group,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("h2", {
									className: ProgressBoardPage_module_css_default.groupTitle,
									children: [t("group.running"), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: ProgressBoardPage_module_css_default.groupCount,
										children: running.length
									})]
								}), runningCards]
							}), unreadSection] })),
							tab === "running" && (running.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: ProgressBoardPage_module_css_default.empty,
								children: t("empty.running")
							}) : runningCards),
							tab === "done" && (unreadDone.length === 0 && recent.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: ProgressBoardPage_module_css_default.empty,
								children: t("empty.done")
							}) : doneSections)
						]
					})
				]
			});
		}
		//#endregion
		//#region \0dsh-css:/Users/henry/Documents/deepseek/deepseek-harness/packages/client/ui-progress/src/client/ProgressPanelIcon.module.css.mjs
		const css$1 = ".hU8daq_wrap{line-height:0;display:inline-flex}.hU8daq_badge{background:var(--dsw-alias-state-business-primary);min-width:16px;height:16px;color:var(--dsw-static-neutral-50);text-align:center;pointer-events:none;border-radius:8px;padding:0 5px;font-size:10px;font-weight:600;line-height:16px;position:absolute;top:50%;right:10px;transform:translateY(-50%)}[data-sidebar-collapsed=true] .hU8daq_badge{border-radius:7px;min-width:14px;height:14px;padding:0 4px;font-size:9px;line-height:14px;top:1px;right:1px;transform:none}.hU8daq_badgePending{background:var(--dsw-alias-state-warn-label)}.hU8daq_badgeUnread{background:var(--dsw-alias-state-success-primary)}";
		const tagId$1 = "dsh-ui-progress/ProgressPanelIcon.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$1) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-ui-progress";
			tag.dataset.pluginCss = tagId$1;
			tag.textContent = css$1;
			document.head.appendChild(tag);
		}
		var ProgressPanelIcon_module_css_default = {
			"badge": "hU8daq_badge",
			"badgePending": "hU8daq_badgePending",
			"badgeUnread": "hU8daq_badgeUnread",
			"wrap": "hU8daq_wrap"
		};
		//#endregion
		//#region \0dsh-global-css:/Users/henry/Documents/deepseek/deepseek-harness/packages/client/ui-progress/src/client/row-badge.css.mjs
		const css = "button:has([data-dsh-ui-progress-badge]){position:relative}";
		const tagId = "dsh-ui-progress/row-badge.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-ui-progress";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		//#endregion
		//#region src/client/ProgressPanelIcon.tsx
		/**
		* Sidebar panel entry for the progress board: the gauge glyph plus a badge
		* counting every Session that needs attention — running work (interaction
		* requests included) and unviewed completions. Badge tone escalates from the
		* default accent (work running) to green (unviewed completions waiting) to
		* amber (a Session awaits its user). The expanded row docks the badge at the
		* row's right edge (see row-badge.css); the collapsed rail hugs the glyph
		* instead.
		*/
		/**
		* Render the gauge glyph with the attention badge.
		* @param props - framework icon share plus the root Session/Workspace hooks.
		* @returns the icon, badged while any Session runs or awaits a first view.
		*/
		function ProgressPanelIcon({ size, useSessions, useSessionStatus, useWorkspaces, t }) {
			const { counts } = deriveBoard(useSessions((list) => list), useSessionStatus((snapshot) => snapshot), useWorkspaces((snapshot) => snapshot));
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
				className: ProgressPanelIcon_module_css_default.wrap,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconGaugeOutlineRegular, { size }), counts.badge > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: clsx(ProgressPanelIcon_module_css_default.badge, counts.pending > 0 ? ProgressPanelIcon_module_css_default.badgePending : counts.unreadDone > 0 && ProgressPanelIcon_module_css_default.badgeUnread),
					"data-dsh-ui-progress-badge": "",
					"aria-label": t(counts.badge === 1 ? "panel.badge.one" : "panel.badge.other", { count: counts.badge }),
					children: counts.badge > 99 ? "99+" : counts.badge
				})]
			});
		}
		//#endregion
		//#region src/client/index.ts
		const PANEL_ID = "progress";
		/** Required services: root snapshots, Workspace actions, dictionaries, and the Slot registry. */
		const inject = [
			"slots",
			"locale",
			"sessions",
			"workspaces",
			"uiWorkspace",
			"uiSession"
		];
		/**
		* Register the sidebar entry, the board panel, and the completion observation.
		* @param ctx - browser services used by these contributions.
		*/
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, {
				zh,
				en
			}), "ui-progress: dictionaries");
			const t = ctx.locale.bind(NS);
			const log = createCompletionLog();
			const runClock = createRunClock();
			ctx.effect(() => {
				const sync = () => {
					const sessions = ctx.sessions.list.getSnapshot();
					const statuses = ctx.uiSession.sessionStatus.getSnapshot();
					log.observe(sessions, statuses, ctx.workspaces.list.getSnapshot());
					runClock.observe(sessions, statuses);
				};
				sync();
				const off = [
					ctx.sessions.list.subscribe(sync),
					ctx.uiSession.sessionStatus.subscribe(sync),
					ctx.workspaces.list.subscribe(sync)
				];
				return () => {
					for (const dispose of off) dispose();
				};
			}, "ui-progress: completion observation");
			const onOpenSession = (id) => {
				ctx.uiWorkspace.openSession(id);
			};
			ctx.slots.inject("main", () => ctx.slots.register({
				name: "main",
				key: PANEL_ID,
				locale: NS,
				inject: () => ({
					hooks: {
						completionLog: log.source,
						runClock: runClock.source
					},
					onOpenSession
				})
			}, ProgressBoardPage));
			ctx.slots.inject("sidebar.panellist", () => ctx.slots.register({
				name: "sidebar.panellist",
				id: PANEL_ID,
				order: 20,
				locale: NS,
				label: () => t("panel.label")
			}, ProgressPanelIcon));
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map