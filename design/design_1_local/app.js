// ===== 方向一 · 人本地基 =====
// 核心改动：omnipresent 快记 / 全文搜索 / 时间倒序 / 全量滚动 / AI活动收悬浮 / 记录生命周期 / 键盘
// 用户语言重命名：取用→AI用过、注入落点→对应文件夹、origin→我记的/AI记的

// ===== 模拟数据 =====
// 给每条加 ts（时间戳，用于排序）和 stale（是否过时）
const records = [
  { id: "r9", origin: "human", scope: "project", localProjectId: "workshop-desktop", title: "便签要改成记录入口，不只是任务", snippet: "常驻置顶快记，落 recordStore，origin=human", meta: { intent: "note", resolution: "open", tags: ["sticky"] }, state: "active", used: 0, ts: Date.parse("2026-06-29T10:30:00"), when: "刚才", body: "## 便签定位\n便签是常驻置顶的快速记录入口，落 recordStore，origin=human，与记录同源，不再单列数组。" },
  { id: "r10", origin: "human", scope: "none", title: "回头试取用 dogfood 两周", snippet: "看 buildCodexUserInput 补上后是否真省理解", meta: { intent: "note", resolution: "open", tags: ["sticky","direction"] }, state: "active", used: 0, ts: Date.parse("2026-06-29T10:20:00"), when: "10 分钟前", body: "## dogfood 计划\n补上 buildCodexUserInput 注入后，跑两周看是否真省 Agent 理解成本。" },
  { id: "r1", origin: "human", scope: "project", localProjectId: "workshop-desktop", title: "注入入口是断环，先补 buildCodexUserInput", snippet: "回写出口已建（origin:agent），回流入口零注入。增参 localProjectId + 任务摘要，按 token 预算裁剪结论片段注入。", meta: { intent: "principle", resolution: "decided", tags: ["inject","loop"] }, state: "active", used: 2, ts: Date.parse("2026-06-29T10:24:00"), when: "今天 10:24", body: "## 断环判断\n回写出口已建（origin:agent），但 buildCodexUserInput 零注入——单向半环。\n## 补法\n增参 localProjectId + 任务摘要，按 token 预算裁剪结论片段注入。\n## 安全\n注入只取脱敏结论片段（脱敏边界由 app server 实现），不返 raw body。" },
  { id: "r2", origin: "agent", scope: "project", localProjectId: "workshop-desktop", fromUsage: 0, title: "Codex 运行完成：注入验证 turn #42", snippet: "已注入 2 条相关记录。结论：补注入逻辑后，turn 首轮未重复解释 D-008 scope guard 边界。", meta: { intent: "execution_summary", resolution: "answered", tags: ["codex-run"] }, state: "active", used: 0, ts: Date.parse("2026-06-29T09:50:00"), when: "今天 09:50", body: "## 执行结果\nCodex turn #42 完成，注入命中 r1、r4。\n## 判断\n补注入后首轮未重复解释 D-008 scope guard——省理解成本成立（样本=1）。" },
  { id: "r3", origin: "human", scope: "project", localProjectId: "workshop-desktop", title: "MCP 只服务非 Codex Agent，复用 app server", snippet: "守 D-015。Codex 已有 CLI，MCP 唯一独立价值是跨厂商（Claude Code 这类 CLI 直连不了的）。", meta: { intent: "principle", resolution: "open", tags: ["mcp","boundary"] }, state: "active", used: 0, ts: Date.parse("2026-06-28T22:10:00"), when: "昨天 22:10", body: "## MCP 定位\n只服务非 Codex Agent（Claude Code），复用 app server 服务层。\n## 边界\n守 D-015：CLI 只做命令门面，MCP 只做协议适配。" },
  { id: "r4", origin: "human", scope: "project", localProjectId: "workshop-desktop", title: "确认页架构死锁：agent 按不了门铃", snippet: "AGENTS.md 要求 agent 走 confirmation.request，但 scope guard 让 agent 没手。是死锁必然，不是没人用。", meta: { intent: "principle", resolution: "decided", tags: ["d008","deadlock"] }, state: "active", used: 1, ts: Date.parse("2026-06-27T14:00:00"), when: "2 天前", body: "## 架构死锁\nAGENTS.md 要求 agent 走 confirmation.request，但 scope guard 让 agent 没手。\n## 处置\n确认页在写收紧模型里仍需要，但死锁要修——修不是屏蔽。" },
  { id: "r5", origin: "agent", scope: "project", localProjectId: "think", title: "记录是思考材料，不是 repo fact", snippet: "D-014 承诺记录不升级类型系统。稳定事实进 repo 必须经文档边界审查。", meta: { intent: "principle", resolution: "decided", tags: ["d014"] }, state: "completed", used: 0, ts: Date.parse("2026-06-26T11:00:00"), when: "3 天前", body: "## 晋升边界\n记录是思考材料，不是项目事实。只有转任务或经审查才晋升 repo fact。" },
  { id: "r6", origin: "human", scope: "none", title: "碎片：obsidian 把 D4 这道缝也填了", snippet: "vault 是本地 markdown，Agent 通过 MCP 读写。碎片收容+双链+检索全成熟，B 基本判死。", meta: { intent: "discussion", resolution: "obsolete", tags: ["direction"] }, state: "active", used: 0, ts: Date.parse("2026-06-25T09:00:00"), when: "4 天前", stale: true, body: "## 碎片收容\nObsidian+插件+MCP 基本覆盖任务外碎片场景。B（极简记录）基本被判死。" },
  { id: "r7", origin: "human", scope: "project", localProjectId: "think", title: "圆桌方向判定：判据延迟是症状", snippet: "用寻找更精密的判据推迟直接使用，因为直接使用会立刻给出真实反馈（可能证伪）。", meta: { intent: "principle", resolution: "decided", tags: ["direction"] }, state: "active", used: 0, ts: Date.parse("2026-06-24T16:00:00"), when: "5 天前", body: "## 判据延迟\n用寻找更精密的判据推迟直接使用，因为直接使用会立刻给出真实反馈（可能证伪）。" },
  { id: "r8", origin: "agent", scope: "project", localProjectId: "workshop-desktop", title: "buildCodexUserInput 零注入已核实", snippet: "codexPrompt.ts:8-11 函数体只有 return body || title，不收 localProjectId，不查历史。", meta: { intent: "execution_summary", resolution: "answered", tags: ["verify"] }, state: "completed", used: 0, ts: Date.parse("2026-06-23T10:00:00"), when: "6 天前", body: "## 核实\ncodexPrompt.ts:8-11 函数体只有 return body || title，不收 localProjectId，不查历史。" },
];

const projects = [
  { id: "workshop-desktop", name: "workshop-desktop", workspaceType: "local", localPath: "~/Downloads/project/workshop-desktop", bound: true },
  { id: "think", name: "think (认知圆桌)", workspaceType: "local", localPath: "~/Downloads/think", bound: true },
  { id: "side", name: "side-project", workspaceType: "temporary", localPath: "~/.workshop/workspaces/side", bound: false },
  { id: "web", name: "arc-web", workspaceType: "github", repoUrl: "github.com/zqshi/arc", localPath: "~/.workshop/workspaces/web", bound: true, cloneStatus: "ready" },
];

// AI 运行记录（拉模型：Agent 自取用，客户端不派发）
const usageLog = [
  { when: "今天 09:50", agent: "Codex", query: "注入入口 / D-008 scope guard", fetched: ["r1", "r4"], note: "取用 2 条结论片段", wrote: "r2" },
  { when: "昨天 15:20", agent: "Claude", query: "确认页架构死锁", fetched: ["r4"], note: "取用 1 条" },
  { when: "2 天前", agent: "Codex", query: "buildCodexUserInput 断环", fetched: ["r1"], note: "取用 1 条" },
];

// ===== 状态 =====
let filter = { project: "workshop-desktop", scope: "all", origin: "all", used: false, state: "active", q: "", showStale: false };
const PAGE_SIZE = 20; // 全量滚动加载（数据量级不需要 3 条分页）
let visibleCount = PAGE_SIZE;
let activeProjectId = "workshop-desktop"; // omnipresent 快记的归属（桌面应用知当前前台 cwd）

// ===== 渲染：项目导航 =====
function renderProjectNav() {
  const projHtml = projects.map((p) => {
    const count = records.filter((r) => r.localProjectId === p.id && r.state === "active").length;
    let dirLabel, extra = "";
    if (p.workspaceType === "github") {
      dirLabel = p.repoUrl || "未设置仓库";
      const badge = p.cloneStatus === "cloning" ? `<span class="ws-clone-badge cloning">克隆中</span>` : `<span class="ws-clone-badge ready">已克隆</span>`;
      extra = `<span class="pn-temp-row">${badge}</span>`;
    } else {
      const isTemp = p.workspaceType === "temporary";
      dirLabel = p.localPath || (isTemp ? "临时记录区" : "未绑定目录");
      if (isTemp) extra = `<span class="pn-temp-row"><span class="ws-temp-badge">临时</span><button class="pn-migrate" onclick="event.stopPropagation(); migrateProject('${p.id}')">迁移到目录 ›</button></span>`;
    }
    return `
      <div class="project-nav-item ${p.workspaceType} ${p.id === filter.project ? "active" : ""}" data-project="${p.id}" onclick="selectProject('${p.id}', this)">
        <span class="pn-top"><span class="pn-dot"></span><span class="pn-name">${p.name}</span><span class="pn-count">${count}</span></span>
        <span class="pn-dir" title="${dirLabel}">${dirLabel}</span>${extra}
      </div>`;
  }).join("");
  const personalCount = records.filter((r) => !r.localProjectId && r.state === "active").length;
  const personalHtml = `
    <div class="project-nav-sep"></div>
    <div class="project-nav-item scope-personal ${filter.project === "__personal__" ? "active" : ""}" data-project="__personal__" onclick="selectProject('__personal__', this)">
      <span class="pn-top"><span class="pn-dot"></span><span class="pn-name">个人记录</span><span class="pn-count">${personalCount}</span></span>
    </div>`;
  document.getElementById("project-nav-list").innerHTML = projHtml + personalHtml;
}

// ===== 渲染：记录池（搜索 + 时间倒序 + 全量滚动）=====
function filteredRecords() {
  const q = filter.q.trim().toLowerCase();
  return records
    .filter((r) => {
      if (filter.project === "__personal__") { if (r.localProjectId) return false; }
      else if (r.localProjectId !== filter.project) return false;
      if (filter.origin !== "all" && r.origin !== filter.origin) return false;
      if (filter.used && r.used === 0) return false;
      if (r.state !== "active") return false;
      // 过时记录：默认隐藏，开启 showStale 才显示
      if (r.stale && !filter.showStale) return false;
      // 全文搜索：标题 + 正文 + 标签
      if (q) {
        const hay = (r.title + " " + r.body + " " + (r.meta.tags || []).join(" ") + " " + r.snippet).toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    })
    .sort((a, b) => b.ts - a.ts); // 时间倒序
}

function renderRecords() {
  const list = filteredRecords();
  const proj = projects.find((p) => p.id === filter.project) || {};
  document.getElementById("records-title").textContent = `记录池 · ${proj.name || filter.project}`;
  const shown = list.slice(0, visibleCount);
  document.getElementById("records-list").innerHTML = shown.length === 0
    ? `<div class="empty">${filter.q ? "没搜到匹配记录，换个关键词" : "该切片下暂无记录，记一笔试试"}</div>`
    : shown.map(recordRow).join("");
  const total = list.length;
  document.getElementById("list-count").textContent = `显示 ${shown.length} / ${total} 条`;
  document.getElementById("load-more-btn").style.display = shown.length < total ? "inline-flex" : "none";
}

function recordRow(r) {
  const staleTag = r.stale ? `<span class="tag stale-tag">已过时</span>` : "";
  return `
    <div class="record-row" onclick="openRecord('${r.id}')">
      ${originBadge(r.origin)}
      <div class="record-body">
        <div class="record-title">${r.title}</div>
        <div class="record-snippet">${r.snippet}</div>
        <div class="record-meta">
          <span class="scope">${scopeLabel(r.scope)}</span><span>${r.when}</span>
          <span class="tag">${r.meta.intent}</span><span class="tag">${r.meta.resolution}</span>${staleTag}
        </div>
      </div>
      ${usedMark(r.used)}
    </div>`;
}

function loadMore() { visibleCount += PAGE_SIZE; renderRecords(); }

// ===== omnipresent 快记 =====
function cycleQuickProject() {
  const bound = projects.filter((p) => p.bound);
  if (bound.length === 0) return;
  const idx = bound.findIndex((p) => p.id === activeProjectId);
  activeProjectId = bound[(idx + 1) % bound.length].id;
  updateQuickTarget();
}
function updateQuickTarget() {
  const p = projects.find((x) => x.id === activeProjectId);
  const el = document.getElementById("qc-target");
  if (el) el.textContent = p ? p.name : activeProjectId;
  const sub = document.getElementById("current-proj-sub");
  if (sub) sub.textContent = `记录 · ${p ? p.name : activeProjectId}`;
}
function saveQuickNote(text) {
  const title = text.split("\n")[0].slice(0, 40);
  const snippet = text.split("\n")[1] || "（短记录）";
  const newId = "r" + (records.length + 1) + "s" + (records.length);
  records.unshift({
    id: newId, origin: "human", scope: "project", localProjectId: activeProjectId,
    title, snippet, body: text, meta: { intent: "note", resolution: "open", tags: ["sticky"] },
    state: "active", used: 0, ts: Date.now(), when: "刚刚",
  });
  renderProjectNav(); renderRecords();
  toast(`已记到 ${projects.find((p) => p.id === activeProjectId)?.name || ""}`);
}
function openQuickAdvanced() {
  const text = document.getElementById("quick-input").value.trim();
  document.getElementById("quick-advanced-text").value = text;
  document.getElementById("quick-advanced-scope").innerHTML = ["project", "none"].map((s) =>
    `<button class="chip ${s === "project" ? "active" : ""}" data-qa="${s}" onclick="setQuickAdvancedScope('${s}', this)">${scopeLabel(s)}</button>`).join("");
  document.getElementById("quick-advanced-project").innerHTML = projects.filter((p) => p.bound).map((p) =>
    `<option value="${p.id}" ${p.id === activeProjectId ? "selected" : ""}>${p.name}</option>`).join("");
  document.getElementById("quick-advanced").style.display = "flex";
  document.getElementById("quick-input").value = "";
}
let quickAdvancedScope = "project";
function setQuickAdvancedScope(s, btn) {
  quickAdvancedScope = s;
  document.querySelectorAll("[data-qa]").forEach((b) => b.classList.remove("active"));
  btn.classList.add("active");
}
function closeQuickAdvanced() { document.getElementById("quick-advanced").style.display = "none"; }
function saveQuickAdvanced() {
  const text = document.getElementById("quick-advanced-text").value.trim();
  if (!text) { toast("请输入内容"); return; }
  const projId = quickAdvancedScope === "project" ? document.getElementById("quick-advanced-project").value : undefined;
  const title = text.split("\n")[0].slice(0, 40);
  records.unshift({
    id: "r" + (records.length + 1) + "a" + (records.length), origin: "human", scope: quickAdvancedScope, localProjectId: projId,
    title, snippet: text.split("\n")[1] || "（短记录）", body: text, meta: { intent: "note", resolution: "open", tags: ["sticky"] },
    state: "active", used: 0, ts: Date.now(), when: "刚刚",
  });
  closeQuickAdvanced(); renderProjectNav(); renderRecords();
  toast("已记录");
}

// ===== 搜索 =====
function onSearch(v) {
  filter.q = v;
  visibleCount = PAGE_SIZE;
  document.getElementById("search-clear").style.display = v ? "inline-flex" : "none";
  renderRecords();
}
function clearSearch() {
  document.getElementById("search-input").value = "";
  onSearch("");
}
function focusSearch() { document.getElementById("search-input").focus(); }

// ===== 筛选交互 =====
function selectProject(id, btn) {
  filter.project = id; activeProjectId = id === "__personal__" ? activeProjectId : id;
  visibleCount = PAGE_SIZE;
  document.querySelectorAll(".project-nav-item").forEach((b) => b.classList.remove("active"));
  btn.classList.add("active");
  updateQuickTarget(); renderRecords();
}
function setOriginFilter(origin, btn) {
  filter.origin = origin; visibleCount = PAGE_SIZE;
  document.querySelectorAll("[data-origin]").forEach((b) => b.classList.remove("active"));
  btn.classList.add("active"); renderRecords();
}
function toggleUsedFilter(btn) {
  filter.used = !filter.used; visibleCount = PAGE_SIZE;
  btn.classList.toggle("active", filter.used); renderRecords();
}
function toggleStale(btn) {
  filter.showStale = !filter.showStale; visibleCount = PAGE_SIZE;
  btn.textContent = filter.showStale ? "开" : "关";
  btn.classList.toggle("on", filter.showStale);
  renderRecords();
}
function clearFilters() {
  filter = { project: filter.project, scope: "all", origin: "all", used: false, state: "active", q: "", showStale: false };
  visibleCount = PAGE_SIZE;
  document.getElementById("search-input").value = "";
  document.getElementById("search-clear").style.display = "none";
  document.querySelectorAll("[data-origin]").forEach((b) => b.classList.toggle("active", b.dataset.origin === "all"));
  document.querySelectorAll("[data-used]").forEach((b) => b.classList.remove("active"));
  const sb = document.getElementById("show-stale-btn"); sb.textContent = "关"; sb.classList.remove("on");
  renderRecords();
}

// ===== 辅助 =====
function originBadge(origin) { return `<span class="origin-badge ${origin}">${origin === "human" ? "人记" : "AI 记"}</span>`; }
function usedMark(n) {
  if (n === 0) return "";
  return `<span class="used-mark"><span class="pulse"></span>AI 用过 ${n}</span>`;
}
function scopeLabel(scope) { return { none: "个人", project: "项目" }[scope] || scope; }
function markedBody(body) {
  return body.split("\n").map((line) => {
    if (line.startsWith("## ")) return `<h3>${line.slice(3)}</h3>`;
    if (line.trim() === "") return "";
    return `<p>${line}</p>`;
  }).join("");
}
function bodyDigest(body) {
  const lines = body.split("\n").map((l) => l.trim()).filter(Boolean);
  const segs = [];
  for (let i = 0; i < lines.length; i++) { if (lines[i].startsWith("## ") && i + 1 < lines.length) segs.push(lines[i + 1]); }
  const picked = segs.length ? segs : lines.slice(0, 2);
  return picked.map((s) => `<p>${s}</p>`).join("");
}

// ===== 记录详情 =====
let currentDetailId = null;
function openRecord(id) {
  const r = records.find((x) => x.id === id);
  if (!r) return;
  currentDetailId = id;
  document.getElementById("detail-title").textContent = r.title;
  document.getElementById("detail-eyebrow").textContent = `${r.origin === "human" ? "我记的" : "AI 记的"} · ${scopeLabel(r.scope)}`;
  // 顶部一行叙事，替代原 8 格 meta
  const staleStr = r.stale ? " · 已过时" : "";
  document.getElementById("detail-narrative").innerHTML =
    `<span class="nv-origin ${r.origin}">${r.origin === "human" ? "我记的" : "AI 记的"}</span>` +
    `<span class="nv-sep">·</span><span>${recordProjectName(r)}</span>` +
    `<span class="nv-sep">·</span><span>${r.when}</span>` +
    (r.used > 0 ? `<span class="nv-sep">·</span><span class="nv-used">AI 用过 ${r.used} 次</span>` : "") +
    `<span class="nv-sep">·</span><span class="nv-meta">${r.meta.intent} · ${r.meta.resolution}${staleStr}</span>`;
  const note = document.getElementById("detail-writenote");
  if (note) {
    if (r.origin === "agent") {
      if (r.fromUsage != null) {
        const u = usageLog[r.fromUsage];
        const titles = u.fetched.map((id) => records.find((x) => x.id === id)?.title).filter(Boolean).join("、");
        const fetchedList = u.fetched.map((id) => { const fr = records.find((x) => x.id === id); return fr ? `
          <button class="loop-fetched" onclick="openRecord('${fr.id}')"><span class="lf-title">${fr.title}</span><span class="lf-snippet">${fr.snippet}</span></button>` : ""; }).join("");
        note.innerHTML = `<span class="wn-icon">↻</span>这是 <b>${u.agent}</b> 用过你的记录后写回的结果。它先用了 ${titles || "相关记录"}，跑完把这轮结论写回。下方就地列出它用过的记录；<button class="loop-link" onclick="openUsageFromRecord(${r.fromUsage})">查看这次取用流 ›</button><div class="loop-fetched-list">${fetchedList}</div>`;
      } else {
        note.innerHTML = `<span class="wn-icon">↻</span>这是 AI 执行后写回的结果，区别于你记的思考材料。`;
      }
      note.style.display = "block";
    } else { note.style.display = "none"; }
  }
  document.getElementById("detail-body").innerHTML = markedBody(r.body);
  const staleBtn = document.getElementById("detail-toggle-stale");
  if (staleBtn) { staleBtn.textContent = r.stale ? "取消过时标记" : "标记过时"; }
  document.getElementById("detail-modal").style.display = "flex";
}
function closeDetail() { document.getElementById("detail-modal").style.display = "none"; currentDetailId = null; }
function toggleRecordStale() {
  const r = records.find((x) => x.id === currentDetailId);
  if (!r) return;
  r.stale = !r.stale;
  const btn = document.getElementById("detail-toggle-stale");
  btn.textContent = r.stale ? "取消过时标记" : "标记过时";
  renderRecords(); renderProjectNav();
  toast(r.stale ? "已标记过时（默认从主列表隐藏，仍可搜到）" : "已取消过时标记");
}
function openEditBody() {
  const r = records.find((x) => x.id === currentDetailId);
  if (!r) return;
  document.getElementById("edit-record-title").textContent = r.title;
  document.getElementById("edit-body").value = r.body || "";
  document.getElementById("edit-modal").style.display = "flex";
}
function closeEditBody() { document.getElementById("edit-modal").style.display = "none"; }
function saveEditBody() {
  const r = records.find((x) => x.id === currentDetailId);
  if (!r) return;
  const body = document.getElementById("edit-body").value;
  r.body = body; r.snippet = body.split("\n")[1] || body.slice(0, 50);
  document.getElementById("detail-body").innerHTML = markedBody(r.body);
  closeEditBody(); renderRecords();
  toast(`已改写「${r.title}」正文`);
}

// ===== 新建记录 =====
let newScope = "project";
function openNew() {
  document.getElementById("new-title").value = "";
  document.getElementById("new-body").value = "";
  newScope = "project";
  document.getElementById("new-scope-chips").innerHTML = ["project", "none"].map((s) =>
    `<button class="chip ${s === newScope ? "active" : ""}" data-ns="${s}" onclick="setNewScope('${s}', this)">${scopeLabel(s)}</button>`).join("");
  document.getElementById("new-project").innerHTML = projects.filter((p) => p.bound).map((p) =>
    `<option value="${p.id}" ${p.id === filter.project ? "selected" : ""}>${p.name}</option>`).join("");
  document.getElementById("new-modal").style.display = "flex";
}
function setNewScope(s, btn) { newScope = s; document.querySelectorAll("[data-ns]").forEach((b) => b.classList.remove("active")); btn.classList.add("active"); }
function closeNew() { document.getElementById("new-modal").style.display = "none"; }
function createRecord() {
  const title = document.getElementById("new-title").value.trim();
  if (!title) { toast("请填写标题"); return; }
  const body = document.getElementById("new-body").value.trim();
  const projId = newScope === "project" ? document.getElementById("new-project").value : undefined;
  records.unshift({
    id: "r" + (records.length + 1) + Date.now().toString().slice(-3), origin: "human", scope: newScope, localProjectId: projId,
    title, snippet: body.split("\n")[1] || body.slice(0, 50), body: body || title,
    meta: { intent: "note", resolution: "open", tags: [] }, state: "active", used: 0, ts: Date.now(), when: "刚刚",
  });
  visibleCount = PAGE_SIZE; closeNew(); renderProjectNav(); renderRecords();
  toast("记录已创建");
}

// ===== 新建项目 =====
let newProjectWorkspace = "temporary";
let newProjectDir = "";
function openNewProject() {
  document.getElementById("new-project-name").value = "";
  const dirInput = document.getElementById("new-project-dir-input");
  if (dirInput) dirInput.value = "";
  newProjectDir = "";
  const label = document.getElementById("new-project-dir-label");
  if (label) { label.textContent = "未选择"; label.classList.add("empty"); }
  const repoInput = document.getElementById("new-project-repo");
  if (repoInput) repoInput.value = "";
  const tokenInput = document.getElementById("new-project-token");
  if (tokenInput) tokenInput.value = "";
  newProjectWorkspace = "temporary";
  setNewProjectWorkspace("temporary");
  document.getElementById("new-project-modal").style.display = "flex";
}
function closeNewProject() { document.getElementById("new-project-modal").style.display = "none"; }
function setNewProjectWorkspace(type) {
  newProjectWorkspace = type;
  document.querySelectorAll(".workspace-option").forEach((b) => b.classList.toggle("active", b.dataset.ws === type));
  document.getElementById("new-project-dir-row").style.display = type === "local" ? "" : "none";
  document.getElementById("new-project-repo-row").style.display = type === "github" ? "" : "none";
  document.getElementById("new-project-hint").textContent = {
    temporary: "自动创建临时记录区（~/.workshop/workspaces/…），之后可迁移到正式项目",
    local: "绑定后作为记录切片维度（localProjectId + cwd）",
    github: "后台克隆到 ~/.workshop/workspaces/…，完成后作为注入落点 cwd",
  }[type] || "";
}
function onFolderPicked(input) {
  const f = input.files && input.files[0];
  const rel = f && f.webkitRelativePath ? f.webkitRelativePath.split("/")[0] : "";
  newProjectDir = rel || (f ? f.name : "");
  const label = document.getElementById("new-project-dir-label");
  if (label) { label.textContent = newProjectDir ? `已选：${newProjectDir}` : "未选择"; label.classList.toggle("empty", !newProjectDir); }
}
function createProject() {
  const nameInput = document.getElementById("new-project-name").value.trim();
  const id = "p" + projects.length + Date.now().toString().slice(-3);
  if (newProjectWorkspace === "local") {
    if (!newProjectDir) { toast("请选择本地文件夹"); return; }
    const name = nameInput || newProjectDir;
    projects.push({ id, name, workspaceType: "local", localPath: newProjectDir, bound: true });
    filter.project = id; activeProjectId = id; visibleCount = PAGE_SIZE;
    closeNewProject(); renderProjectNav(); renderRecords(); updateQuickTarget();
    toast(`已绑定项目「${name}」`);
  } else if (newProjectWorkspace === "github") {
    const repo = document.getElementById("new-project-repo").value.trim();
    if (!repo) { toast("请填写仓库地址"); return; }
    const name = nameInput || repo.split("/").pop().replace(/\.git$/, "") || repo;
    projects.push({ id, name, workspaceType: "github", repoUrl: repo, localPath: "", bound: false, cloneStatus: "cloning" });
    filter.project = id; activeProjectId = id; visibleCount = PAGE_SIZE;
    closeNewProject(); renderProjectNav(); renderRecords(); updateQuickTarget();
    toast(`正在克隆「${name}」…`);
    setTimeout(() => {
      const p = projects.find((x) => x.id === id);
      if (!p) return;
      p.localPath = `~/.workshop/workspaces/${id}`; p.bound = true; p.cloneStatus = "ready";
      renderProjectNav(); if (filter.project === id) renderRecords();
      toast(`「${name}」克隆完成，已作为对应文件夹`);
    }, 2000);
  } else {
    if (!nameInput) { toast("请填写项目名"); return; }
    projects.push({ id, name: nameInput, workspaceType: "temporary", localPath: `~/.workshop/workspaces/${id}`, bound: false });
    filter.project = id; activeProjectId = id; visibleCount = PAGE_SIZE;
    closeNewProject(); renderProjectNav(); renderRecords(); updateQuickTarget();
    toast(`已创建临时项目「${nameInput}」`);
  }
}
function migrateProject(id) {
  const p = projects.find((x) => x.id === id);
  if (!p) return;
  if (p.workspaceType !== "temporary") { toast("非临时项目，无需迁移"); return; }
  const input = document.createElement("input");
  input.type = "file"; input.webkitdirectory = true; input.directory = true; input.multiple = true;
  input.onchange = () => {
    const f = input.files && input.files[0];
    const rel = f && f.webkitRelativePath ? f.webkitRelativePath.split("/")[0] : "";
    const dir = rel || (f ? f.name : "");
    if (!dir) { toast("未选择目标目录"); return; }
    p.workspaceType = "local"; p.localPath = dir; p.bound = true;
    renderProjectNav(); toast(`已迁移「${p.name}」到 ${dir}`);
  };
  input.click();
}

// ===== 导出 =====
function openExport() {
  const list = filteredRecords();
  document.getElementById("export-body").innerHTML = list.length === 0
    ? `<div class="empty">当前切片无记录</div>`
    : `<div class="export-preview">${list.map((r) => `## ${r.title}\n${r.body}`).join("\n\n")}</div>`;
  document.getElementById("export-modal").style.display = "flex";
}
function closeExport() { document.getElementById("export-modal").style.display = "none"; }
function doExport() {
  const list = filteredRecords();
  const md = list.map((r) => `## ${r.title}\n${r.body}`).join("\n\n---\n\n");
  if (navigator.clipboard) navigator.clipboard.writeText(md);
  closeExport(); toast(`已复制 ${list.length} 条记录到剪贴板`);
}

// ===== AI 活动悬浮 =====
function recordProjectName(r) {
  if (!r) return "未知项目";
  if (r.scope === "none") return "个人记录";
  const p = projects.find((x) => x.id === r.localProjectId);
  return p ? p.name : r.localProjectId || "未知项目";
}
function renderAiActivity() {
  // 上次运行摘要
  const latest = usageLog[0];
  const runEl = document.getElementById("aa-run");
  if (latest) {
    const wroteLink = latest.wrote ? (() => { const w = records.find((r) => r.id === latest.wrote); return w ? ` → 写回 <a class="aa-link" onclick="openRecord('${w.id}')">${w.title}</a>` : ""; })() : "";
    runEl.innerHTML = `<div class="aa-run-line"><b>${latest.agent}</b> 用过 ${latest.fetched.length} 条记录${wroteLink}</div><div class="aa-run-time">${latest.when} · ${latest.note}</div>`;
  } else {
    runEl.innerHTML = `<div class="aa-run-line">暂无运行</div>`;
  }
  // 取用流
  document.getElementById("usage-timeline").innerHTML = usageLog.map((h) => {
    const recs = h.fetched.map((id) => records.find((r) => r.id === id)).filter(Boolean);
    return `
      <div class="inject-line usage-item">
        <div class="when">${h.when}</div>
        <div class="what">
          <div class="from-record">${h.agent} 用过 ${h.fetched.length} 条</div>
          <div class="to-run">查询：${h.query}</div>
          <div class="usage-records">${recs.map((r) => `<button class="usage-record-link" onclick="openRecord('${r.id}')">${r.title}</button>`).join("")}</div>
          ${h.wrote ? (() => { const w = records.find((r) => r.id === h.wrote); return w ? `<button class="loop-link" onclick="openRecord('${h.wrote}')">↻ 写回：${w.title}</button><div class="loop-digest">${bodyDigest(w.body)}</div>` : ""; })() : ""}
        </div>
        <div class="saving">${h.note}</div>
      </div>`;
  }).join("");
  // 角标计数 = 最近取用条数
  const countEl = document.getElementById("ai-activity-count");
  if (countEl) countEl.textContent = usageLog.length;
}
function toggleAiActivity() {
  const body = document.getElementById("ai-activity-body");
  const chev = document.getElementById("ai-activity-chev");
  const open = body.style.display === "none";
  body.style.display = open ? "block" : "none";
  chev.textContent = open ? "▾" : "▴";
  // 展开后清红点
  if (open) document.getElementById("ai-activity-dot").classList.remove("has-new");
}
function openUsageFromRecord(idx) {
  const body = document.getElementById("ai-activity-body");
  if (body.style.display === "none") toggleAiActivity();
  const target = document.querySelectorAll(".usage-item")[idx];
  if (target) { target.classList.add("highlight"); target.scrollIntoView({ behavior: "smooth", block: "center" }); setTimeout(() => target.classList.remove("highlight"), 2600); }
  toast(`已定位到这次取用（第 ${idx + 1} 条）`);
}

// ===== 设置 =====
let settings = { defaultScope: "project", showStale: false };
let account = { loggedIn: true, name: "qiushi", server: "app server" };
function renderAccount() {
  const el = document.getElementById("settings-account");
  if (!el) return;
  if (account.loggedIn) {
    el.innerHTML = `<div class="account-id"><span class="account-avatar">${account.name.slice(0,1).toUpperCase()}</span><div><div class="account-name">${account.name}</div><div class="account-status"><span class="dot on"></span>已登录 · 连接 ${account.server}</div></div></div><button class="btn sm ghost danger" onclick="logout()">退出登录</button>`;
  } else {
    el.innerHTML = `<div class="account-id"><span class="account-avatar off">?</span><div><div class="account-name">未登录</div><div class="account-status"><span class="dot"></span>登录后可同步记录、启用 AI 取用</div></div></div><button class="btn sm primary" onclick="login()">登录</button>`;
  }
}
function logout() { account.loggedIn = false; renderAccount(); toast("已退出登录"); }
function login() { account.loggedIn = true; renderAccount(); toast("已登录"); }
function openSettings() {
  document.querySelectorAll("#settings-default-scope .chip").forEach((b) => b.classList.toggle("active", b.dataset.ds === settings.defaultScope));
  const ss = document.getElementById("settings-show-stale");
  ss.classList.toggle("on", settings.showStale); ss.textContent = settings.showStale ? "开" : "关";
  renderAccount();
  document.getElementById("settings-modal").style.display = "flex";
}
function closeSettings() { document.getElementById("settings-modal").style.display = "none"; }
function setSettingDefaultScope(s, btn) {
  settings.defaultScope = s;
  document.querySelectorAll("#settings-default-scope .chip").forEach((b) => b.classList.toggle("active", b.dataset.ds === s));
}
function toggleSettingSwitch(id, btn) {
  const on = btn.classList.toggle("on");
  btn.textContent = on ? "开" : "关";
  if (id === "settings-show-stale") {
    settings.showStale = on;
    filter.showStale = on; visibleCount = PAGE_SIZE;
    const sb = document.getElementById("show-stale-btn"); sb.textContent = on ? "开" : "关"; sb.classList.toggle("on", on);
    renderRecords();
  }
}
function openSanitizeRules() { toast("脱敏规则配置为本期预留入口，将在 app server 取用出口实现"); }

// ===== toast =====
let toastTimer = null;
function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg; t.style.display = "block";
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.style.display = "none"; }, 2200);
}

// ===== 键盘 =====
document.addEventListener("keydown", (e) => {
  // ESC 关闭最上层 modal
  if (e.key === "Escape") {
    const masks = [...document.querySelectorAll(".modal-mask")].filter((m) => m.style.display === "flex");
    if (masks.length) { masks[masks.length - 1].style.display = "none"; return; }
  }
  const inField = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
  // ⌘K 搜索 / ⌘N 新建
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); focusSearch(); return; }
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "n") { e.preventDefault(); openNew(); return; }
  if (inField) return;
  // j/k 浏览记录
  if (e.key === "j" || e.key === "k") {
    const rows = [...document.querySelectorAll(".record-row")];
    if (!rows.length) return;
    const cur = document.activeElement.closest(".record-row");
    let idx = rows.indexOf(cur);
    idx = e.key === "j" ? (idx < 0 ? 0 : Math.min(idx + 1, rows.length - 1)) : (idx <= 0 ? 0 : idx - 1);
    rows[idx].focus(); rows[idx].scrollIntoView({ block: "nearest" });
  }
});

// 顶栏快记：回车保存，⌘↵ 多行，⇧↵ 切归属
document.addEventListener("DOMContentLoaded", () => {
  const qi = document.getElementById("quick-input");
  if (qi) {
    qi.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        const text = qi.value.trim();
        if (!text) return;
        saveQuickNote(text); qi.value = "";
      } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault(); openQuickAdvanced();
      } else if (e.key === "Enter" && e.shiftKey) {
        e.preventDefault(); cycleQuickProject();
      }
    });
  }
});

// ===== 初始化 =====
renderProjectNav();
renderRecords();
renderAiActivity();
updateQuickTarget();
