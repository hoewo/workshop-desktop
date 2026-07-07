// ===== 模拟数据（拉模型：记录池对 Agent 开放，Agent 自取用，客户端不派发）=====
// 字段：scope none/project，状态 active/completed/archived，origin human/agent，
// 标注 intent/retention/resolution/tags，localProjectId 弱关联
// used = 被 Agent 取用次数（拉模型下记录是被取用资源，非被推送注入）

const records = [
  { id: "r9", origin: "human", scope: "project", localProjectId: "workshop-desktop", title: "便签要改成记录入口，不只是任务", snippet: "常驻置顶快记，落 recordStore，origin=human", meta: { intent: "note", resolution: "open", tags: ["sticky"] }, state: "active", used: 0, when: "刚才", body: "## 便签定位\n便签是常驻置顶的快速记录入口，落 recordStore，origin=human，与记录同源，不再单列数组。" },
  { id: "r10", origin: "human", scope: "none", title: "回头试取用 dogfood 两周", snippet: "看 buildCodexUserInput 补上后是否真省理解", meta: { intent: "note", resolution: "open", tags: ["sticky","direction"] }, state: "active", used: 0, when: "10 分钟前", body: "## dogfood 计划\n补上 buildCodexUserInput 注入后，跑两周看是否真省 Agent 理解成本。" },
  { id: "r1", origin: "human", scope: "project", localProjectId: "workshop-desktop", title: "注入入口是断环，先补 buildCodexUserInput", snippet: "回写出口已建（origin:agent），回流入口零注入。增参 localProjectId + 任务摘要，按 token 预算裁剪结论片段注入。", meta: { intent: "principle", resolution: "decided", tags: ["inject","loop"] }, state: "active", used: 2, when: "今天 10:24", body: "## 断环判断\n回写出口已建（origin:agent），但 buildCodexUserInput 零注入——单向半环。\n## 补法\n增参 localProjectId + 任务摘要，按 token 预算裁剪结论片段注入。\n## 安全\n注入只取脱敏结论片段（脱敏边界由 app server 实现），不返 raw body。" },
  { id: "r2", origin: "agent", scope: "project", localProjectId: "workshop-desktop", fromUsage: 0, title: "Codex 运行完成：注入验证 turn #42", snippet: "已注入 2 条相关记录。结论：补注入逻辑后，turn 首轮未重复解释 D-008 scope guard 边界。", meta: { intent: "execution_summary", resolution: "answered", tags: ["codex-run"] }, state: "active", used: 0, when: "今天 09:50", body: "## 执行结果\nCodex turn #42 完成，注入命中 r1、r4。\n## 判断\n补注入后首轮未重复解释 D-008 scope guard——省理解成本成立（样本=1）。" },
  { id: "r3", origin: "human", scope: "project", localProjectId: "workshop-desktop", title: "MCP 只服务非 Codex Agent，复用 app server", snippet: "守 D-015。Codex 已有 CLI，MCP 唯一独立价值是跨厂商（Claude Code 这类 CLI 直连不了的）。", meta: { intent: "principle", resolution: "open", tags: ["mcp","boundary"] }, state: "active", used: 0, when: "昨天 22:10", body: "## MCP 定位\n只服务非 Codex Agent（Claude Code），复用 app server 服务层。\n## 边界\n守 D-015：CLI 只做命令门面，MCP 只做协议适配。" },
  { id: "r4", origin: "human", scope: "project", localProjectId: "workshop-desktop", title: "确认页架构死锁：agent 按不了门铃", snippet: "AGENTS.md 要求 agent 走 confirmation.request，但 scope guard 让 agent 没手。是死锁必然，不是没人用。", meta: { intent: "principle", resolution: "decided", tags: ["d008","deadlock"] }, state: "active", used: 1, when: "2 天前", body: "## 架构死锁\nAGENTS.md 要求 agent 走 confirmation.request，但 scope guard 让 agent 没手。\n## 处置\n确认页在写收紧模型里仍需要，但死锁要修——修不是屏蔽。" },
  { id: "r5", origin: "agent", scope: "project", localProjectId: "think", title: "记录是思考材料，不是 repo fact", snippet: "D-014 承诺记录不升级类型系统。稳定事实进 repo 必须经文档边界审查。", meta: { intent: "principle", resolution: "decided", tags: ["d014"] }, state: "completed", used: 0, when: "3 天前", body: "## 晋升边界\n记录是思考材料，不是项目事实。只有转任务或经审查才晋升 repo fact。" },
  { id: "r6", origin: "human", scope: "none", title: "碎片：obsidian 把 D4 这道缝也填了", snippet: "vault 是本地 markdown，Agent 通过 MCP 读写。碎片收容+双链+检索全成熟，B 基本判死。", meta: { intent: "discussion", resolution: "obsolete", tags: ["direction"] }, state: "active", used: 0, when: "4 天前", body: "## 碎片收容\nObsidian+插件+MCP 基本覆盖任务外碎片场景。B（极简记录）基本被判死。" },
  { id: "r7", origin: "human", scope: "project", localProjectId: "think", title: "圆桌方向判定：判据延迟是症状", snippet: "用寻找更精密的判据推迟直接使用，因为直接使用会立刻给出真实反馈（可能证伪）。", meta: { intent: "principle", resolution: "decided", tags: ["direction"] }, state: "active", used: 0, when: "5 天前", body: "## 判据延迟\n用寻找更精密的判据推迟直接使用，因为直接使用会立刻给出真实反馈（可能证伪）。" },
  { id: "r8", origin: "agent", scope: "project", localProjectId: "workshop-desktop", title: "buildCodexUserInput 零注入已核实", snippet: "codexPrompt.ts:8-11 函数体只有 return body || title，不收 localProjectId，不查历史。", meta: { intent: "execution_summary", resolution: "answered", tags: ["verify"] }, state: "completed", used: 0, when: "6 天前", body: "## 核实\ncodexPrompt.ts:8-11 函数体只有 return body || title，不收 localProjectId，不查历史。" },
];

const projects = [
  { id: "workshop-desktop", name: "workshop-desktop", workspaceType: "local", localPath: "~/Downloads/project/workshop-desktop", bound: true },
  { id: "think", name: "think (认知圆桌)", workspaceType: "local", localPath: "~/Downloads/think", bound: true },
  { id: "side", name: "side-project", workspaceType: "temporary", localPath: "~/.workshop/workspaces/side", bound: false },
  { id: "web", name: "arc-web", workspaceType: "github", repoUrl: "github.com/zqshi/arc", localPath: "~/.workshop/workspaces/web", bound: true, cloneStatus: "ready" },
];

// Agent 取用日志（拉模型：Agent 主动 record.search 取用，MCP 记录调用）
const usageLog = [
  { turn: 42, when: "今天 09:50", agent: "Codex", query: "注入入口 / D-008 scope guard", fetched: ["r1", "r4"], note: "取用 2 条结论片段", wrote: "r2" },
  { turn: 41, when: "昨天 15:20", agent: "Claude", query: "确认页架构死锁", fetched: ["r4"], note: "取用 1 条" },
  { turn: 40, when: "2 天前", agent: "Codex", query: "buildCodexUserInput 断环", fetched: ["r1"], note: "取用 1 条" },
];

// 便签与记录同源：便签列表是 records 中人记记录的快速视图，不再单列数组（修复 id 双轨导致点击打不开详情的 bug）
let stickyScope = "project";
let stickyProjectId = "workshop-desktop";
let stickyPinned = false;

// 分页：每切片默认显示前 3 条，条数多时点「加载更多」追加；条数 ≤3 的切片不显示按钮
const PAGE_SIZE = 3;
let visibleCount = PAGE_SIZE;

// ===== 筛选状态（个人/项目/任务 作为 scope 筛选维度，不再占导航顶层）=====
let filter = { project: "workshop-desktop", scope: "all", origin: "all", used: false, state: "active" };

// ===== 渲染：项目导航（纯项目列表）=====
function renderProjectNav() {
  const projHtml = projects.map((p) => {
    const count = records.filter((r) => r.localProjectId === p.id && r.state === "active").length;
    let dirLabel, extra = "";
    if (p.workspaceType === "github") {
      dirLabel = p.repoUrl || "未设置仓库";
      const badge = p.cloneStatus === "cloning"
        ? `<span class="ws-clone-badge cloning">克隆中</span>`
        : `<span class="ws-clone-badge ready">已克隆</span>`;
      extra = `<span class="pn-temp-row">${badge}</span>`;
    } else {
      const isTemp = p.workspaceType === "temporary";
      dirLabel = p.localPath || (isTemp ? "临时记录区" : "未绑定目录");
      if (isTemp) extra = `<span class="pn-temp-row"><span class="ws-temp-badge">临时</span><button class="pn-migrate" onclick="event.stopPropagation(); migrateProject('${p.id}')">迁移到目录 ›</button></span>`;
    }
    return `
      <div class="project-nav-item ${p.workspaceType} ${p.id === filter.project ? "active" : ""}" data-project="${p.id}" onclick="selectProject('${p.id}', this)">
        <span class="pn-top">
          <span class="pn-dot"></span>
          <span class="pn-name">${p.name}</span>
          <span class="pn-count">${count}</span>
        </span>
        <span class="pn-dir" title="${dirLabel}">${dirLabel}</span>
        ${extra}
      </div>`;
  }).join("");
  // 个人记录：降为切片入口，不再死区
  const personalCount = records.filter((r) => !r.localProjectId && r.state === "active").length;
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
function filteredRecords() {
  return records.filter((r) => {
    // 个人记录切片：无 localProjectId 的记录（scope=none）
    if (filter.project === "__personal__") {
      if (r.localProjectId) return false;
    } else if (r.localProjectId !== filter.project) return false;
    if (filter.scope !== "all" && r.scope !== filter.scope) return false;
    if (filter.origin !== "all" && r.origin !== filter.origin) return false;
    if (filter.used && r.used === 0) return false;
    if (r.state !== "active") return false;
    return true;
  });
}

function renderRecords() {
  const list = filteredRecords();
  const proj = projects.find((p) => p.id === filter.project) || {};
  document.getElementById("records-title").textContent = `记录池 · ${proj.name || filter.project}`;
  const shown = list.slice(0, visibleCount);
  document.getElementById("records-list").innerHTML = shown.length === 0
    ? `<div class="empty">该切片下暂无记录</div>`
    : shown.map(recordRow).join("");
  const total = list.length;
  document.getElementById("list-count").textContent = `显示 ${shown.length} / ${total} 条`;
  document.getElementById("load-more-btn").style.display = shown.length < total ? "inline-flex" : "none";
}

function recordRow(r) {
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
      ${usedMark(r.used)}
    </div>`;
}

function loadMore() {
  visibleCount += PAGE_SIZE;
  renderRecords();
}

// ===== 筛选交互 =====
function selectProject(id, btn) {
  filter.project = id;
  visibleCount = PAGE_SIZE;
  document.querySelectorAll(".project-nav-item").forEach((b) => b.classList.remove("active"));
  btn.classList.add("active");
  // 不再联动改 stickyProjectId：浏览项目切片不应污染便签写入落点（落点由便签自身 cycle 控制）
  renderRecords();
}

function setOriginFilter(origin, btn) {
  filter.origin = origin;
  visibleCount = PAGE_SIZE;
  document.querySelectorAll("[data-origin]").forEach((b) => b.classList.remove("active"));
  btn.classList.add("active");
  renderRecords();
}

function setScopeFilter(scope, btn) {
  filter.scope = scope;
  visibleCount = PAGE_SIZE;
  document.querySelectorAll("[data-scope]").forEach((b) => b.classList.remove("active"));
  btn.classList.add("active");
  renderRecords();
}

function toggleUsedFilter(btn) {
  filter.used = !filter.used;
  visibleCount = PAGE_SIZE;
  btn.classList.toggle("active", filter.used);
  renderRecords();
}

function clearFilters() {
  filter = { project: filter.project, scope: "all", origin: "all", used: false, state: "active" };
  visibleCount = PAGE_SIZE;
  document.querySelectorAll("[data-origin]").forEach((b) => b.classList.toggle("active", b.dataset.origin === "all"));
  document.querySelectorAll("[data-scope]").forEach((b) => b.classList.toggle("active", b.dataset.scope === "all"));
  document.querySelectorAll("[data-used]").forEach((b) => b.classList.remove("active"));
  renderRecords();
}

// ===== 辅助 =====
function originBadge(origin) { return `<span class="origin-badge ${origin}">${origin === "human" ? "人记" : "机器记"}</span>`; }
function usedMark(n) {
  if (n === 0) return "";
  return `<span class="used-mark"><span class="pulse"></span>被取用 ${n}</span>`;
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
  document.getElementById("detail-title").textContent = r.title;
  document.getElementById("detail-eyebrow").textContent = `Record · ${r.origin === "human" ? "人记" : "机器记"}`;
  document.getElementById("detail-meta").innerHTML = `
    <div class="meta-cell"><span>origin</span><b>${r.origin}</b></div>
    <div class="meta-cell"><span>scope</span><b>${scopeLabel(r.scope)}</b></div>
    <div class="meta-cell"><span>项目</span><b>${recordProjectName(r)}</b></div>
    <div class="meta-cell"><span>状态</span><b>${r.state}</b></div>
    <div class="meta-cell"><span>intent</span><b>${r.meta.intent}</b></div>
    <div class="meta-cell"><span>resolution</span><b>${r.meta.resolution}</b></div>
    <div class="meta-cell"><span>被取用</span><b>${r.used} 次</b></div>
    <div class="meta-cell"><span>时间</span><b>${r.when}</b></div>`;
  const note = document.getElementById("detail-writenote");
  if (note) {
    if (r.origin === "agent") {
      if (r.fromUsage != null) {
        const u = usageLog[r.fromUsage];
        const titles = u.fetched.map((id) => records.find((x) => x.id === id)?.title).filter(Boolean).join("、");
        const fetchedList = u.fetched.map((id) => { const fr = records.find((x) => x.id === id); return fr ? `
            <button class="loop-fetched" onclick="openRecord('${fr.id}')">
              <span class="lf-title">${fr.title}</span>
              <span class="lf-snippet">${fr.snippet}</span>
            </button>` : ""; }).join("");
        note.innerHTML = `<span class="wn-icon">↻</span>这是 <b>${u.agent}</b> 取用后回写的结果摘要（机器记）。它先取用了 ${titles || "相关记录"}，跑完把这轮结论写回记录池。下方就地列出它取用的记录；<button class="loop-link" onclick="openUsageFromRecord(${r.fromUsage})">查看这次取用流 ›</button>
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
// 改写正文：人手动改写直接进入编辑页（agent 写才受 D-011 确认页约束）
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
  r.body = body;
  r.snippet = body.split("\n")[1] || body.slice(0, 50);
  document.getElementById("detail-body").innerHTML = markedBody(r.body);
  closeEditBody();
  renderRecords();
  toast(`已改写「${r.title}」正文`);
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
    meta: { intent: "note", resolution: "open", tags: [] }, state: "active", used: 0, when: "刚刚",
  });
  visibleCount = PAGE_SIZE;
  closeNew();
  renderProjectNav();
  renderRecords();
  updateMetrics();
  toast("记录已创建（origin=human）");
}

// ===== 新建项目弹层（工作区来源：临时 / 本地，参考 arc workspace_type）=====
let newProjectWorkspace = "temporary";
let newProjectDir = ""; // 选中的本地目录名（真实环境为绝对路径 cwd）
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
  const dirRow = document.getElementById("new-project-dir-row");
  if (dirRow) dirRow.style.display = type === "local" ? "" : "none";
  const repoRow = document.getElementById("new-project-repo-row");
  if (repoRow) repoRow.style.display = type === "github" ? "" : "none";
  const hint = document.getElementById("new-project-hint");
  if (hint) hint.textContent = {
    temporary: "自动创建临时记录区（~/.workshop/workspaces/…），之后可迁移到正式项目",
    local: "绑定后作为注入落点（localProjectId + cwd），记录按项目切片",
    github: "后台克隆到 ~/.workshop/workspaces/…，完成后作为注入落点 cwd",
  }[type] || "";
}
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
  const nameInput = document.getElementById("new-project-name").value.trim();
  const id = "p" + projects.length + Date.now().toString().slice(-3);
  if (newProjectWorkspace === "local") {
    if (!newProjectDir) { toast("请选择本地文件夹"); return; }
    const name = nameInput || newProjectDir;
    projects.push({ id, name, workspaceType: "local", localPath: newProjectDir, bound: true });
    filter.project = id;
    visibleCount = PAGE_SIZE;
    closeNewProject();
    renderProjectNav();
    renderRecords();
    toast(`已绑定项目「${name}」`);
  } else if (newProjectWorkspace === "github") {
    const repo = document.getElementById("new-project-repo").value.trim();
    if (!repo) { toast("请填写仓库地址"); return; }
    const name = nameInput || repo.split("/").pop().replace(/\.git$/, "") || repo;
    projects.push({ id, name, workspaceType: "github", repoUrl: repo, localPath: "", bound: false, cloneStatus: "cloning" });
    filter.project = id;
    visibleCount = PAGE_SIZE;
    closeNewProject();
    renderProjectNav();
    renderRecords();
    toast(`正在克隆「${name}」…`);
    // 模拟后台 clone 完成（arc _background_clone：fire-and-forget，完成后设 local_path）
    setTimeout(() => {
      const p = projects.find((x) => x.id === id);
      if (!p) return;
      p.localPath = `~/.workshop/workspaces/${id}`;
      p.bound = true;
      p.cloneStatus = "ready";
      renderProjectNav();
      if (filter.project === id) renderRecords();
      toast(`「${name}」克隆完成，已作为注入落点 cwd`);
    }, 2000);
  } else {
    if (!nameInput) { toast("请填写项目名"); return; }
    projects.push({ id, name: nameInput, workspaceType: "temporary", localPath: `~/.workshop/workspaces/${id}`, bound: false });
    filter.project = id;
    visibleCount = PAGE_SIZE;
    closeNewProject();
    renderProjectNav();
    renderRecords();
    toast(`已创建临时项目「${nameInput}」`);
  }
}
// 临时项目迁移到正式目录（对应 arc migrate_workspace：校验临时态 → 用目录选择器选目标 → 改 localPath + workspaceType）
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
    p.workspaceType = "local";
    p.localPath = dir;
    p.bound = true;
    renderProjectNav();
    toast(`已迁移「${p.name}」到 ${dir}`);
  };
  input.click();
}

// ===== 导出弹层 =====
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
  closeExport();
  toast(`已复制 ${list.length} 条记录到剪贴板`);
}

// ===== 刷新 =====
function refreshRecords() {
  const btn = document.getElementById("refresh-btn");
  btn.classList.add("spin");
  setTimeout(() => {
    btn.classList.remove("spin");
    toast("记录池已同步");
  }, 800);
}

// ===== Agent 取用日志（拉模型）=====
function recordProjectName(r) {
  if (!r) return "未知项目";
  if (r.scope === "none") return "个人记录";
  const p = projects.find((x) => x.id === r.localProjectId);
  return p ? p.name : r.localProjectId || "未知项目";
}

// ===== 最近一次闭环（把原状态条 + 取用流面板合成一条线，0 新增功能）=====
function renderRecentLoop() {
  const latest = usageLog[0];
  const flowEl = document.getElementById("rl-flow");
  const metaEl = document.getElementById("rl-meta");
  const entryText = document.getElementById("usage-entry-text");
  if (!latest) {
    flowEl.innerHTML = `<div class="rl-empty">暂无取用</div>`;
    metaEl.textContent = ""; if (entryText) entryText.textContent = "取用 · 暂无";
    return;
  }
  const recs = latest.fetched.map((id) => records.find((r) => r.id === id)).filter(Boolean);
  const wrote = latest.wrote ? records.find((r) => r.id === latest.wrote) : null;
  // 头部 meta = 原状态条那行信息（turn / agent / 时间）
  metaEl.innerHTML = `<b>turn #${latest.turn}</b> · ${latest.agent} · ${latest.when}`;
  if (entryText) entryText.textContent = `最近：${latest.agent} 取用 ${recs.length} 条 · ${latest.when}`;
  // 一条线：取用 → turn → 写回，任一节点可点跳转
  flowEl.innerHTML = `
    <div class="rl-stage" onclick="void(0)">
      <div class="rl-stage-label">取用 ${recs.length} 条</div>
      <div class="rl-stage-body">${recs.map((r) => `<button class="rl-rec" onclick="openRecord('${r.id}')" title="${r.title}">${r.title}</button>`).join("")}</div>
    </div>
    <div class="rl-arrow">→</div>
    <div class="rl-stage rl-stage-run">
      <div class="rl-stage-label">运行</div>
      <div class="rl-stage-body"><span class="rl-turn">turn #${latest.turn}</span><span class="rl-query">${latest.query}</span></div>
    </div>
    <div class="rl-arrow">→</div>
    <div class="rl-stage ${wrote ? "" : "rl-empty-stage"}">
      <div class="rl-stage-label">${wrote ? "写回 1 条" : "无写回"}</div>
      <div class="rl-stage-body">${wrote ? `<button class="rl-rec rl-wrote" onclick="openRecord('${wrote.id}')" title="${wrote.title}">↻ ${wrote.title}</button>` : "—"}</div>
    </div>`;
}
function toggleLoopHistory() {
  const h = document.getElementById("rl-history");
  const chev = document.getElementById("rl-chev");
  const open = h.style.display === "none";
  h.style.display = open ? "block" : "none";
  chev.textContent = open ? "▴" : "▾";
  if (open) renderLoopHistory();
}
function renderLoopHistory() {
  // 历史 = 原取用流时间线（数据不变，只是收进可展开区）
  document.getElementById("rl-history").innerHTML = usageLog.map((h) => {
    const recs = h.fetched.map((id) => records.find((r) => r.id === id)).filter(Boolean);
    return `
      <div class="inject-line usage-item">
        <div class="when">${h.when}</div>
        <div class="what">
          <div class="from-record">${h.agent} 自取用 ${h.fetched.length} 条 · turn #${h.turn}</div>
          <div class="to-run">查询：${h.query}</div>
          <div class="usage-records">${recs.map((r) => `<button class="usage-record-link" onclick="openRecord('${r.id}')">${r.title}</button>`).join("")}</div>
          ${h.wrote ? (() => { const w = records.find((r) => r.id === h.wrote); return w ? `<button class="loop-link" onclick="openRecord('${h.wrote}')">↻ 回写：${w.title}</button>` : ""; })() : ""}
        </div>
        <div class="saving">${h.note}</div>
      </div>`;
  }).join("");
}
function scrollToRecentLoop() {
  const el = document.getElementById("recent-loop");
  if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
}
function openUsageFromRecord(idx) {
  // 从详情页「查看这次取用流」跳来：展开历史并高亮第 idx 条
  const h = document.getElementById("rl-history");
  if (h.style.display === "none") toggleLoopHistory();
  const target = h.querySelectorAll(".usage-item")[idx];
  if (target) { target.classList.add("highlight"); target.scrollIntoView({ behavior: "smooth", block: "center" }); setTimeout(() => target.classList.remove("highlight"), 2600); }
  toast(`已定位到这次取用（第 ${idx + 1} 条）`);
}
// metric 数字即筛选入口（复用已有筛选，不加功能）
function metricFilter(kind) {
  if (kind === "all") { setOriginFilter("all", document.querySelector('[data-origin="all"]')); }
  else if (kind === "human") { setOriginFilter("human", document.querySelector('[data-origin="human"]')); }
  else if (kind === "agent") { setOriginFilter("agent", document.querySelector('[data-origin="agent"]')); }
  else if (kind === "used") { if (!filter.used) toggleUsedFilter(document.querySelector('[data-used="used"]')); }
  toast("已按指标筛选");
}

// ===== 记录便签 =====
function renderSticky() {
  const list = document.getElementById("sticky-list");
  // 便签 = records 中人记记录的快速视图（同源），按当前 scope 切片，取最近 6 条
  const scoped = records.filter((r) => r.origin === "human" && r.scope === stickyScope && r.state === "active").slice(0, 6);
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
  records.unshift({ id: newId, origin: "human", scope: stickyScope, localProjectId: stickyScope === "project" ? stickyProjectId : undefined, title, snippet, body: text, meta: { intent: "note", resolution: "open", tags: ["sticky"] }, state: "active", used: 0, when: "刚刚" });
  ta.value = "";
  renderSticky();
  renderProjectNav();
  renderRecords();
  updateMetrics();
  toast("便签已记录（origin=human）");
}
function togglePin() {
  stickyPinned = !stickyPinned;
  settings.stickyPin = stickyPinned;
  const btn = document.getElementById("pin-btn");
  btn.classList.toggle("active-icon", stickyPinned);
  btn.textContent = stickyPinned ? "📍" : "📌";
  toast(stickyPinned ? "便签已常驻置顶" : "已取消置顶");
}
function updateMetrics() {
  document.getElementById("m-total").textContent = records.filter((r) => r.state === "active").length;
  document.getElementById("m-human").textContent = records.filter((r) => r.origin === "human" && r.state === "active").length;
  document.getElementById("m-agent").textContent = records.filter((r) => r.origin === "agent" && r.state === "active").length;
  document.getElementById("m-inject").textContent = records.filter((r) => r.used > 0).length;
}
function toggleSticky() {
  if (stickyPinned) { toast("便签已置顶常驻，先在设置取消置顶再关闭"); return; }
  const s = document.getElementById("sticky");
  s.style.display = s.style.display === "none" ? "block" : "none";
}
function toggleStickyCollapse() { document.getElementById("sticky-body").classList.toggle("collapsed"); }

// ===== 设置 =====
let settings = { defaultScope: "project", usageExpand: false, stickyPin: false };
let account = { loggedIn: true, name: "qiushi", server: "app server" };
function renderAccount() {
  const el = document.getElementById("settings-account");
  if (!el) return;
  if (account.loggedIn) {
    el.innerHTML = `
      <div class="account-id">
        <span class="account-avatar">${account.name.slice(0, 1).toUpperCase()}</span>
        <div>
          <div class="account-name">${account.name}</div>
          <div class="account-status"><span class="dot on"></span>已登录 · 连接 ${account.server}（记录可被 Agent 取用）</div>
        </div>
      </div>
      <button class="btn sm ghost danger" onclick="logout()">退出登录</button>`;
  } else {
    el.innerHTML = `
      <div class="account-id">
        <span class="account-avatar off">?</span>
        <div>
          <div class="account-name">未登录</div>
          <div class="account-status"><span class="dot"></span>登录后可同步记录、启用 Agent 取用</div>
        </div>
      </div>
      <button class="btn sm primary" onclick="login()">登录</button>`;
  }
}
function logout() {
  account.loggedIn = false;
  renderAccount();
  toast("已退出登录");
}
function login() {
  account.loggedIn = true;
  renderAccount();
  toast("已登录");
}
function openSettings() {
  document.querySelectorAll("#settings-default-scope .chip").forEach((b) => b.classList.toggle("active", b.dataset.ds === settings.defaultScope));
  const ue = document.getElementById("settings-usage-expand");
  ue.classList.toggle("on", settings.usageExpand); ue.textContent = settings.usageExpand ? "开" : "关";
  const sp = document.getElementById("settings-sticky-pin");
  sp.classList.toggle("on", settings.stickyPin); sp.textContent = settings.stickyPin ? "开" : "关";
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
  if (id === "settings-usage-expand") settings.usageExpand = on;
  if (id === "settings-sticky-pin") settings.stickyPin = on;
  applySettings();
}
// 应用设置：取用流默认展开 / 便签默认置顶 真生效（之前只存状态不应用）
function applySettings() {
  // 「取用流默认展开」现在控制最近闭环下方的「历史取用」
  if (settings.usageExpand) {
    const h = document.getElementById("rl-history");
    if (h && h.style.display === "none") toggleLoopHistory();
  }
  const pinBtn = document.getElementById("pin-btn");
  if (pinBtn) {
    stickyPinned = settings.stickyPin;
    pinBtn.classList.toggle("active-icon", stickyPinned);
    pinBtn.textContent = stickyPinned ? "📍" : "📌";
  }
}
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

// 便签拖动
(function () {
  const sticky = document.getElementById("sticky");
  const drag = document.getElementById("sticky-drag");
  let dragging = false, ox = 0, oy = 0;
  drag.addEventListener("mousedown", (e) => { if (e.target.closest("button")) return; dragging = true; const rect = sticky.getBoundingClientRect(); ox = e.clientX - rect.left; oy = e.clientY - rect.top; sticky.style.transition = "none"; });
  document.addEventListener("mousemove", (e) => { if (!dragging) return; sticky.style.left = (e.clientX - ox) + "px"; sticky.style.top = (e.clientY - oy) + "px"; sticky.style.right = "auto"; });
  document.addEventListener("mouseup", () => { dragging = false; sticky.style.transition = ""; });
})();

// ===== 初始化 =====
renderProjectNav();
renderRecords();
renderRecentLoop();
renderSticky();
updateMetrics();
updateStickyProjectBtn();
applySettings();
