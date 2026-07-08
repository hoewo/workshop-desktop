// ===== 模拟数据 =====
// 字段：scope none/project，origin human/agent，标注 intent/resolution，localProjectId 弱关联
// 注意：记录本体不存 usage 字段（D-014/D-016/D-009）。
// "被取用 N 次"由 injectLog + fetchLog 派生，展示时实时计算，不污染 PersonalRecordMeta。
// injectLog  = push 路径命中（客户端通过 buildCodexUserInput 把记录塞进编程工具 prompt），数据源 codex-runs/index.json
// fetchLog   = pull 路径取用（编程工具执行任务前通过 record.search 主动检索记录池），数据源 record-searches/index.json

const records = [
  { id: "r9", origin: "human", scope: "project", localProjectId: "workshop-desktop", title: "便签要改成记录入口，不只是任务", snippet: "常驻置顶快记，落 recordStore，origin=human", meta: { intent: "note", resolution: "open" }, when: "刚才", body: "## 便签定位\n便签是常驻置顶的快速记录入口，落 recordStore，origin=human，与记录同源，不再单列数组。" },
  { id: "r10", origin: "human", scope: "none", title: "回头试取用 dogfood 两周", snippet: "看 buildCodexUserInput 补上后是否真省理解", meta: { intent: "note", resolution: "open" }, when: "10 分钟前", body: "## dogfood 计划\n补上 buildCodexUserInput 注入后，跑两周看是否真省 Agent 理解成本。" },
  { id: "r1", origin: "human", scope: "project", localProjectId: "workshop-desktop", title: "注入入口是断环，先补 buildCodexUserInput", snippet: "回写出口已建（origin:agent），回流入口零注入。增参 localProjectId + 任务摘要，按 token 预算裁剪结论片段注入。", meta: { intent: "principle", resolution: "decided" }, when: "今天 10:24", body: "## 断环判断\n回写出口已建（origin:agent），但 buildCodexUserInput 零注入——单向半环。\n## 补法\n增参 localProjectId + 任务摘要，按 token 预算裁剪结论片段注入。\n## 安全\n注入只取脱敏结论片段（脱敏边界由 app server 实现），不返 raw body。" },
  { id: "r2", origin: "agent", scope: "project", localProjectId: "workshop-desktop", fromInject: 0, title: "Codex 运行完成：注入验证 turn #42", snippet: "已注入 2 条相关记录。结论：补注入逻辑后，turn 首轮未重复解释 D-008 scope guard 边界。", meta: { intent: "execution_summary", resolution: "answered" }, when: "今天 09:50", body: "## 执行结果\nCodex turn #42 完成，注入命中 r1、r4。\n## 判断\n补注入后首轮未重复解释 D-008 scope guard——省理解成本成立（样本=1）。" },
  { id: "r3", origin: "human", scope: "project", localProjectId: "workshop-desktop", title: "MCP 只服务非 Codex Agent，复用 app server", snippet: "守 D-015。Codex 已有 CLI，MCP 唯一独立价值是跨厂商（Claude Code 这类 CLI 直连不了的）。", meta: { intent: "principle", resolution: "open" }, when: "昨天 22:10", body: "## MCP 定位\n只服务非 Codex Agent（Claude Code），复用 app server 服务层。\n## 边界\n守 D-015：CLI 只做命令门面，MCP 只做协议适配。" },
  { id: "r4", origin: "human", scope: "project", localProjectId: "workshop-desktop", title: "确认页架构死锁：agent 按不了门铃", snippet: "AGENTS.md 要求 agent 走 confirmation.request，但 scope guard 让 agent 没手。是死锁必然，不是没人用。", meta: { intent: "principle", resolution: "decided" }, when: "2 天前", body: "## 架构死锁\nAGENTS.md 要求 agent 走 confirmation.request，但 scope guard 让 agent 没手。\n## 处置\n确认页在写收紧模型里仍需要，但死锁要修——修不是屏蔽。" },
  { id: "r5", origin: "agent", scope: "project", localProjectId: "think", title: "记录是思考材料，不是 repo fact", snippet: "D-014 承诺记录不升级类型系统。稳定事实进 repo 必须经文档边界审查。", meta: { intent: "principle", resolution: "decided" }, when: "3 天前", body: "## 晋升边界\n记录是思考材料，不是项目事实。只有转任务或经审查才晋升 repo fact。" },
  { id: "r6", origin: "human", scope: "none", title: "碎片：obsidian 把 D4 这道缝也填了", snippet: "vault 是本地 markdown，Agent 通过 MCP 读写。碎片收容+双链+检索全成熟，B 基本判死。", meta: { intent: "discussion", resolution: "obsolete" }, when: "4 天前", body: "## 碎片收容\nObsidian+插件+MCP 基本覆盖任务外碎片场景。B（极简记录）基本被判死。" },
  { id: "r7", origin: "human", scope: "project", localProjectId: "think", title: "圆桌方向判定：判据延迟是症状", snippet: "用寻找更精密的判据推迟直接使用，因为直接使用会立刻给出真实反馈（可能证伪）。", meta: { intent: "principle", resolution: "decided" }, when: "5 天前", body: "## 判据延迟\n用寻找更精密的判据推迟直接使用，因为直接使用会立刻给出真实反馈（可能证伪）。" },
  { id: "r8", origin: "agent", scope: "project", localProjectId: "workshop-desktop", title: "buildCodexUserInput 零注入已核实", snippet: "codexPrompt.ts:8-11 函数体只有 return body || title，不收 localProjectId，不查历史。", meta: { intent: "execution_summary", resolution: "answered" }, when: "6 天前", body: "## 核实\ncodexPrompt.ts:8-11 函数体只有 return body || title，不收 localProjectId，不查历史。" },
];

const projects = [
  { id: "workshop-desktop", name: "workshop-desktop", localPath: "~/Downloads/project/workshop-desktop", bound: true },
  { id: "think", name: "think (认知圆桌)", localPath: "~/Downloads/think", bound: true },
];

// 注入命中日志（push 路径：Workshop 主动通过 buildCodexUserInput 把记录塞进 Codex prompt）
// 数据源：codex-runs/index.json 运行表（已存在，D-009）
const injectLog = [
  { when: "今天 09:50", agent: "Codex", query: "注入入口 / D-008 scope guard", injected: ["r1", "r4"], note: "注入 2 条结论片段", wrote: "r2", turnId: "#42" },
  { when: "2 天前", agent: "Codex", query: "buildCodexUserInput 断环", injected: ["r1"], note: "注入 1 条", turnId: "#38" },
];

// 取用日志（pull 路径：编程工具执行任务前通过 record.search 主动检索记录池）
// 数据源：record-searches/index.json（由 app server 记录每次 record.search 调用，独立于 codex-runs 运行表）
const fetchLog = [
  { when: "昨天 15:20", agent: "Codex", protocol: "RPC", query: "确认页架构死锁", fetched: ["r4"], note: "取用 1 条" },
];

// 便签与记录同源：便签列表是 records 中人记记录的快速视图，不再单列数组
let stickyScope = "project";
let stickyProjectId = "workshop-desktop";

// ===== 筛选状态（个人/项目 作为 scope 筛选维度，不再占导航顶层）=====
let filter = { project: "workshop-desktop", scope: "all", origin: "all", used: false };

// ===== 渲染：项目导航（纯项目列表 + 个人记录入口）=====
function renderProjectNav() {
  const projHtml = projects.map((p) => {
    const count = records.filter((r) => r.localProjectId === p.id).length;
    return `
      <div class="project-nav-item ${p.id === filter.project ? "active" : ""}" data-project="${p.id}" onclick="selectProject('${p.id}', this)">
        <span class="pn-top">
          <span class="pn-dot"></span>
          <span class="pn-name">${p.name}</span>
          <span class="pn-count">${count}</span>
        </span>
        <span class="pn-dir" title="${p.localPath}">${p.localPath || "未绑定目录"}</span>
      </div>`;
  }).join("");
  const personalCount = records.filter((r) => !r.localProjectId).length;
  const personalHtml = `
    <div class="project-nav-sep"></div>
    <div class="project-nav-item scope-personal ${filter.project === "__personal__" ? "active" : ""}" data-project="__personal__" onclick="selectProject('__personal__', this)">
      <span class="pn-top">
        <span class="pn-dot"></span>
        <span class="pn-name">个人记录</span>
        <span class="pn-count">${personalCount}</span>
      </span>
    </div>`;
  document.getElementById("project-nav-list").innerHTML = projHtml + personalHtml;
}

// ===== 渲染：记录池（按筛选切片）=====
// ===== 派生：usage 统计（不存进记录本体，实时从 injectLog + fetchLog 计算）=====
// 返回某条记录被注入/取用的总次数及来源分类
function deriveUsage(recordId) {
  let injectCount = 0, fetchCount = 0;
  const injects = [], fetches = [];
  injectLog.forEach((h, idx) => {
    if (h.injected.includes(recordId)) { injectCount++; injects.push({ ...h, idx, type: "inject" }); }
  });
  fetchLog.forEach((h, idx) => {
    if (h.fetched.includes(recordId)) { fetchCount++; fetches.push({ ...h, idx, type: "fetch" }); }
  });
  return { total: injectCount + fetchCount, injectCount, fetchCount, injects, fetches };
}

function filteredRecords() {
  return records.filter((r) => {
    if (filter.project === "__personal__") {
      if (r.localProjectId) return false;
    } else if (r.localProjectId !== filter.project) return false;
    if (filter.scope !== "all" && r.scope !== filter.scope) return false;
    if (filter.origin !== "all" && r.origin !== filter.origin) return false;
    if (filter.used && deriveUsage(r.id).total === 0) return false;
    return true;
  });
}

function renderRecords() {
  const list = filteredRecords();
  const proj = projects.find((p) => p.id === filter.project) || {};
  document.getElementById("records-title").textContent = `记录池 · ${proj.name || (filter.project === "__personal__" ? "个人记录" : filter.project)}`;
  document.getElementById("records-list").innerHTML = list.length === 0
    ? `<div class="empty">该切片下暂无记录</div>`
    : list.map(recordRow).join("");
}

function recordRow(r) {
  const usage = deriveUsage(r.id);
  return `
    <div class="record-row" onclick="openRecord('${r.id}')">
      ${originBadge(r.origin)}
      <div class="record-body">
        <div class="record-title">${r.title}</div>
        <div class="record-snippet">${r.snippet}</div>
        <div class="record-meta">
          <span class="scope">${scopeLabel(r.scope)}</span>
          <span>${r.when}</span>
          <span class="tag">${r.meta.intent}</span>
          <span class="tag">${r.meta.resolution}</span>
        </div>
      </div>
      ${usedMark(usage)}
    </div>`;
}

// ===== 筛选交互 =====
function selectProject(id, btn) {
  filter.project = id;
  document.querySelectorAll(".project-nav-item").forEach((b) => b.classList.remove("active"));
  btn.classList.add("active");
  // 不联动改 stickyProjectId：浏览项目切片不应污染便签写入落点
  renderRecords();
}

function setOriginFilter(origin, btn) {
  filter.origin = origin;
  document.querySelectorAll("[data-origin]").forEach((b) => b.classList.remove("active"));
  btn.classList.add("active");
  renderRecords();
}

function setScopeFilter(scope, btn) {
  filter.scope = scope;
  document.querySelectorAll("[data-scope]").forEach((b) => b.classList.remove("active"));
  btn.classList.add("active");
  renderRecords();
}

function toggleUsedFilter(btn) {
  filter.used = !filter.used;
  btn.classList.toggle("active", filter.used);
  renderRecords();
}

function clearFilters() {
  filter = { project: filter.project, scope: "all", origin: "all", used: false };
  document.querySelectorAll("[data-origin]").forEach((b) => b.classList.toggle("active", b.dataset.origin === "all"));
  document.querySelectorAll("[data-scope]").forEach((b) => b.classList.toggle("active", b.dataset.scope === "all"));
  document.querySelectorAll("[data-used]").forEach((b) => b.classList.remove("active"));
  renderRecords();
}

// ===== 辅助 =====
function originBadge(origin) { return `<span class="origin-badge ${origin}">${origin === "human" ? "人记" : "机器记"}</span>`; }
// 区分注入命中（push，绿色）和取用（pull，蓝色，预留阶段）
function usedMark(usage) {
  if (usage.total === 0) return "";
  const parts = [];
  if (usage.injectCount > 0) parts.push(`<span class="used-mark inject"><span class="pulse"></span>注入 ${usage.injectCount}</span>`);
  if (usage.fetchCount > 0) parts.push(`<span class="used-mark fetch"><span class="pulse"></span>取用 ${usage.fetchCount}</span>`);
  return `<span class="used-marks">${parts.join("")}</span>`;
}
function scopeLabel(scope) { return { none: "个人", project: "项目" }[scope] || scope; }
function markedBody(body) {
  return body.split("\n").map((line) => {
    if (line.startsWith("## ")) return `<h3>${line.slice(3)}</h3>`;
    if (line.trim() === "") return "";
    return `<p>${line}</p>`;
  }).join("");
}
// 回写结论摘要：取每个 ## 段落首行拼成可读摘要；无段则取前两行
function bodyDigest(body) {
  const lines = body.split("\n").map((l) => l.trim()).filter(Boolean);
  const segs = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith("## ") && i + 1 < lines.length) segs.push(lines[i + 1]);
  }
  const picked = segs.length ? segs : lines.slice(0, 2);
  return picked.map((s) => `<p>${s}</p>`).join("");
}

// ===== 记录详情弹层 =====
let currentDetailId = null;
function openRecord(id) {
  const r = records.find((x) => x.id === id);
  if (!r) return;
  currentDetailId = id;
  const usage = deriveUsage(id);
  document.getElementById("detail-title").textContent = r.title;
  document.getElementById("detail-eyebrow").textContent = `Record · ${r.origin === "human" ? "人记" : "机器记"}`;
  // 派生展示：被注入命中 / 被取用 分开标注，不混进记录本体
  const usageCell = usage.total === 0
    ? `<div class="meta-cell"><span>遥测</span><b>未命中</b></div>`
    : `<div class="meta-cell"><span>遥测</span><b>注入 ${usage.injectCount} · 取用 ${usage.fetchCount}</b></div>`;
  document.getElementById("detail-meta").innerHTML = `
    <div class="meta-cell"><span>origin</span><b>${r.origin}</b></div>
    <div class="meta-cell"><span>scope</span><b>${scopeLabel(r.scope)}</b></div>
    <div class="meta-cell"><span>项目</span><b>${recordProjectName(r)}</b></div>
    <div class="meta-cell"><span>intent</span><b>${r.meta.intent}</b></div>
    <div class="meta-cell"><span>resolution</span><b>${r.meta.resolution}</b></div>
    ${usageCell}
    <div class="meta-cell"><span>时间</span><b>${r.when}</b></div>`;
  const note = document.getElementById("detail-writenote");
  if (note) {
    if (r.origin === "agent") {
      if (r.fromInject != null) {
        const u = injectLog[r.fromInject];
        const titles = u.injected.map((id) => records.find((x) => x.id === id)?.title).filter(Boolean).join("、");
        const fetchedList = u.injected.map((id) => { const fr = records.find((x) => x.id === id); return fr ? `
            <button class="loop-fetched" onclick="openRecord('${fr.id}')">
              <span class="lf-title">${fr.title}</span>
              <span class="lf-snippet">${fr.snippet}</span>
            </button>` : ""; }).join("");
        note.innerHTML = `<span class="wn-icon">↻</span>这是 <b>${u.agent}</b> 被注入这些记录后回写的结果摘要（机器记）。它运行时被注入了 ${titles || "相关记录"}的结论片段，跑完把这轮结论写回记录池。下方就地列出被注入的记录；<button class="loop-link" onclick="openInjectFromRecord(${r.fromInject})">查看这次注入命中 ›</button>
          <div class="loop-fetched-list">${fetchedList}</div>`;
      } else {
        note.innerHTML = `<span class="wn-icon">↻</span>这是 Agent 执行后回写的结果摘要（机器记），区别于人记的思考材料。`;
      }
      note.style.display = "block";
    } else {
      note.style.display = "none";
    }
  }
  document.getElementById("detail-body").innerHTML = markedBody(r.body);
  document.getElementById("detail-modal").style.display = "flex";
}
function closeDetail() {
  document.getElementById("detail-modal").style.display = "none";
  currentDetailId = null;
}

// ===== 新建记录弹层 =====
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
function setNewScope(s, btn) {
  newScope = s;
  document.querySelectorAll("[data-ns]").forEach((b) => b.classList.remove("active"));
  btn.classList.add("active");
}
function closeNew() { document.getElementById("new-modal").style.display = "none"; }
function createRecord() {
  const title = document.getElementById("new-title").value.trim();
  if (!title) { toast("请填写标题"); return; }
  const body = document.getElementById("new-body").value.trim();
  const projId = newScope === "project" ? document.getElementById("new-project").value : undefined;
  const newId = "r" + (records.length + 1) + Date.now().toString().slice(-3);
  records.unshift({
    id: newId, origin: "human", scope: newScope, localProjectId: projId,
    title, snippet: body.split("\n")[1] || body.slice(0, 50), body: body || title,
    meta: { intent: "note", resolution: "open" }, when: "刚刚",
  });
  closeNew();
  renderProjectNav();
  renderRecords();
  updateMetrics();
  toast("记录已创建（origin=human）");
}

// ===== 新建项目弹层（绑定本地目录作为注入落点 cwd）=====
let newProjectDir = ""; // 选中的本地目录名（真实环境为绝对路径 cwd）
function openNewProject() {
  document.getElementById("new-project-name").value = "";
  const dirInput = document.getElementById("new-project-dir-input");
  if (dirInput) dirInput.value = "";
  newProjectDir = "";
  const label = document.getElementById("new-project-dir-label");
  if (label) { label.textContent = "未选择"; label.classList.add("empty"); }
  document.getElementById("new-project-modal").style.display = "flex";
}
function closeNewProject() { document.getElementById("new-project-modal").style.display = "none"; }
// 目录选择器回调：webkitdirectory 下 files[0].webkitRelativePath = "目录名/子/文件"，取首段
function onFolderPicked(input) {
  const f = input.files && input.files[0];
  const rel = f && f.webkitRelativePath ? f.webkitRelativePath.split("/")[0] : "";
  newProjectDir = rel || (f ? f.name : "");
  const label = document.getElementById("new-project-dir-label");
  if (label) {
    label.textContent = newProjectDir ? `已选：${newProjectDir}` : "未选择";
    label.classList.toggle("empty", !newProjectDir);
  }
}
function createProject() {
  if (!newProjectDir) { toast("请选择本地文件夹"); return; }
  const nameInput = document.getElementById("new-project-name").value.trim();
  const name = nameInput || newProjectDir;
  const id = "p" + projects.length + Date.now().toString().slice(-3);
  projects.push({ id, name, localPath: newProjectDir, bound: true });
  filter.project = id;
  closeNewProject();
  renderProjectNav();
  renderRecords();
  toast(`已绑定项目「${name}」`);
}

// ===== Agent 遥测（注入命中 push / 取用 pull）=====
function recordProjectName(r) {
  if (!r) return "未知项目";
  if (r.scope === "none") return "个人记录";
  const p = projects.find((x) => x.id === r.localProjectId);
  return p ? p.name : r.localProjectId || "未知项目";
}

let currentUsageTab = "inject"; // inject | fetch
function renderInjectLog() {
  const html = injectLog.map((h) => {
    const recs = h.injected.map((id) => records.find((r) => r.id === id)).filter(Boolean);
    const projNames = [...new Set(recs.map(recordProjectName))];
    return `
      <div class="inject-line usage-item">
        <div class="when">${h.when}</div>
        <div class="what">
          <div class="from-record">${h.agent} turn ${h.turnId || ""} 被注入 ${h.injected.length} 条</div>
          <div class="to-run">触发：${h.query}</div>
          <div class="usage-proj">${projNames.map((n) => `<span class="proj-tag">${n}</span>`).join("")}</div>
          <div class="usage-records">
            ${recs.map((r) => `<button class="usage-record-link" onclick="openRecord('${r.id}')">${r.title}</button>`).join("")}
          </div>
          ${h.wrote ? (() => { const w = records.find((r) => r.id === h.wrote); return w ? `
            <button class="loop-link" onclick="openRecord('${h.wrote}')">↻ 回写：${w.title}</button>
            <div class="loop-digest">${bodyDigest(w.body)}</div>` : ""; })() : ""}
        </div>
        <div class="saving">${h.note}</div>
      </div>`;
  }).join("");
  return html || `<div class="empty" style="padding:var(--space-6)">暂无注入命中记录</div>`;
}

function renderFetchLog() {
  if (fetchLog.length === 0) {
    return `<div class="empty" style="padding:var(--space-6)">暂无取用记录</div>`;
  }
  return fetchLog.map((h) => {
    const recs = h.fetched.map((id) => records.find((r) => r.id === id)).filter(Boolean);
    const projNames = [...new Set(recs.map(recordProjectName))];
    const protoTag = h.protocol === "MCP"
      ? `<span class="proto-tag mcp">MCP</span>`
      : `<span class="proto-tag rpc">RPC</span>`;
    return `
      <div class="inject-line usage-item">
        <div class="when">${h.when}</div>
        <div class="what">
          <div class="from-record">${protoTag} ${h.agent} 主动取用 ${h.fetched.length} 条</div>
          <div class="to-run">查询：${h.query}</div>
          <div class="usage-proj">${projNames.map((n) => `<span class="proj-tag">${n}</span>`).join("")}</div>
          <div class="usage-records">
            ${recs.map((r) => `<button class="usage-record-link" onclick="openRecord('${r.id}')">${r.title}</button>`).join("")}
          </div>
        </div>
        <div class="saving">${h.note}</div>
      </div>`;
  }).join("");
}

function renderUsageLog() {
  document.getElementById("usage-timeline").innerHTML =
    currentUsageTab === "inject" ? renderInjectLog() : renderFetchLog();
  updateUsageEntry();
}

function switchUsageTab(tab) {
  currentUsageTab = tab;
  document.querySelectorAll(".usage-tab").forEach((b) => b.classList.remove("active"));
  document.querySelector(`.usage-tab[data-tab="${tab}"]`)?.classList.add("active");
  renderUsageLog();
}

function updateUsageEntry() {
  const text = document.getElementById("usage-entry-text");
  const injectCount = injectLog.length;
  const fetchCount = fetchLog.length;
  if (injectCount === 0 && fetchCount === 0) {
    text.textContent = "遥测 · 暂无";
  } else {
    const parts = [];
    if (injectCount > 0) parts.push(`注入 ${injectCount}`);
    if (fetchCount > 0) parts.push(`取用 ${fetchCount}`);
    text.textContent = `遥测 · ${parts.join(" · ")}`;
  }
  // 更新 tab 角标
  const ic = document.getElementById("tab-inject-count");
  const fc = document.getElementById("tab-fetch-count");
  if (ic) ic.textContent = injectCount;
  if (fc) fc.textContent = fetchCount;
}

function toggleUsagePanel() {
  const p = document.getElementById("usage-panel");
  p.style.display = p.style.display === "none" ? "block" : "none";
}
function openInjectFromRecord(idx) {
  currentUsageTab = "inject";
  document.querySelectorAll(".usage-tab").forEach((b) => b.classList.remove("active"));
  document.querySelector('.usage-tab[data-tab="inject"]')?.classList.add("active");
  const p = document.getElementById("usage-panel");
  if (p.style.display === "none") p.style.display = "block";
  renderUsageLog();
  const target = p.querySelectorAll(".usage-item")[idx];
  if (target) {
    target.classList.add("highlight");
    target.scrollIntoView({ behavior: "smooth", block: "center" });
    setTimeout(() => target.classList.remove("highlight"), 2600);
  }
  toast(`已定位到这次注入命中（注入流第 ${idx + 1} 条）`);
}

// ===== 记录便签 =====
function renderSticky() {
  const list = document.getElementById("sticky-list");
  // 便签 = records 中人记记录的快速视图（同源），按当前 scope 切片，取最近 6 条
  const scoped = records.filter((r) => r.origin === "human" && r.scope === stickyScope).slice(0, 6);
  list.innerHTML = scoped.length === 0
    ? `<div class="empty" style="padding:var(--space-5)">暂无${scopeLabel(stickyScope)}便签</div>`
    : scoped.map((n) => `
      <div class="sticky-item" onclick="openRecord('${n.id}')">
        <div class="si-title">${n.title}</div>
        <div class="si-snippet">${n.snippet}</div>
        <div class="si-meta"><span>${scopeLabel(n.scope)}</span><span>${n.when}</span></div>
      </div>`).join("");
}
function setStickyScope(scope, btn) {
  stickyScope = scope;
  document.querySelectorAll(".sticky-scope button").forEach((b) => b.classList.remove("active"));
  btn.classList.add("active");
  renderSticky();
}
function cycleStickyProject() {
  const bound = projects.filter((p) => p.bound);
  if (bound.length === 0) return;
  const idx = bound.findIndex((p) => p.id === stickyProjectId);
  stickyProjectId = bound[(idx + 1) % bound.length].id;
  updateStickyProjectBtn();
}
function updateStickyProjectBtn() {
  const p = projects.find((x) => x.id === stickyProjectId);
  const btn = document.getElementById("sticky-project-btn");
  if (btn) btn.textContent = p ? p.name : stickyProjectId;
}
function saveStickyNote() {
  const ta = document.getElementById("sticky-textarea");
  const text = ta.value.trim();
  if (!text) return;
  const title = text.split("\n")[0].slice(0, 40);
  const snippet = text.split("\n")[1] || "（短记录）";
  const newId = "r" + (records.length + 1) + "s" + Date.now().toString().slice(-3);
  records.unshift({ id: newId, origin: "human", scope: stickyScope, localProjectId: stickyScope === "project" ? stickyProjectId : undefined, title, snippet, body: text, meta: { intent: "note", resolution: "open" }, when: "刚刚" });
  ta.value = "";
  renderSticky();
  renderProjectNav();
  renderRecords();
  updateMetrics();
  toast("便签已记录（origin=human）");
}
function updateMetrics() {
  document.getElementById("m-total").textContent = records.length;
  document.getElementById("m-human").textContent = records.filter((r) => r.origin === "human").length;
  document.getElementById("m-agent").textContent = records.filter((r) => r.origin === "agent").length;
  document.getElementById("m-inject").textContent = records.filter((r) => deriveUsage(r.id).total > 0).length;
}
function toggleSticky() {
  const s = document.getElementById("sticky");
  const toggleBtn = document.getElementById("sticky-toggle-btn");
  const visible = s.style.display !== "none";

  if (visible) {
    // 退出：隐藏 + 重置状态
    s.style.display = "none";
    s.style.left = "";
    s.style.top = "";
    s.style.right = "32px"; // 复位到默认位置
    // 重置折叠
    const body = document.getElementById("sticky-body");
    const collapseBtn = document.getElementById("sticky-collapse-btn");
    body.classList.remove("collapsed");
    if (collapseBtn) {
      collapseBtn.textContent = "▾";
      collapseBtn.title = "折叠";
    }
    // 清空输入框
    const textarea = document.getElementById("sticky-textarea");
    if (textarea) textarea.value = "";
    // 更新顶栏按钮状态
    if (toggleBtn) toggleBtn.title = "打开便签";
  } else {
    // 打开
    s.style.display = "block";
    if (toggleBtn) toggleBtn.title = "关闭便签";
    // 聚焦输入框
    setTimeout(() => {
      const textarea = document.getElementById("sticky-textarea");
      if (textarea) textarea.focus();
    }, 50);
  }
}

// 便签折叠：只留标题栏，body 收起
function toggleStickyCollapse() {
  const body = document.getElementById("sticky-body");
  const btn = document.getElementById("sticky-collapse-btn");
  const collapsed = body.classList.toggle("collapsed");
  btn.textContent = collapsed ? "▸" : "▾";
  btn.title = collapsed ? "展开" : "折叠";
}

// 便签拖拽
(function initStickyDrag() {
  const sticky = document.getElementById("sticky");
  const titlebar = document.getElementById("sticky-titlebar");
  if (!sticky || !titlebar) return;
  let dragging = false;
  let offsetX = 0, offsetY = 0;

  titlebar.addEventListener("mousedown", (e) => {
    // 点按钮时不触发拖拽
    if (e.target.closest("button")) return;
    dragging = true;
    const rect = sticky.getBoundingClientRect();
    offsetX = e.clientX - rect.left;
    offsetY = e.clientY - rect.top;
    sticky.style.right = "auto";
    document.body.style.userSelect = "none";
  });

  document.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    let x = e.clientX - offsetX;
    let y = e.clientY - offsetY;
    // 不超出视口
    const maxX = window.innerWidth - 60;
    const maxY = window.innerHeight - 40;
    x = Math.max(0, Math.min(x, maxX));
    y = Math.max(0, Math.min(y, maxY));
    sticky.style.left = x + "px";
    sticky.style.top = y + "px";
  });

  document.addEventListener("mouseup", () => {
    if (!dragging) return;
    dragging = false;
    document.body.style.userSelect = "";
  });
})();

// ===== 设置（MVP 仅脱敏规则预留入口）=====
function openSettings() {
  document.getElementById("settings-modal").style.display = "flex";
}
function closeSettings() { document.getElementById("settings-modal").style.display = "none"; }
function openSanitizeRules() {
  toast("脱敏规则配置为本期预留入口，将在 app server 取用出口实现");
}

// ===== toast =====
let toastTimer = null;
function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.style.display = "block";
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.style.display = "none"; }, 2200);
}

// ===== 初始化 =====
renderProjectNav();
renderRecords();
renderUsageLog();
renderSticky();
updateMetrics();
updateStickyProjectBtn();
