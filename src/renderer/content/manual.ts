export const manualRevision = "2026-06-13.3";

export type ManualCategory = "software" | "collaboration";

export interface ManualSection {
  id: string;
  category: ManualCategory;
  title: string;
  summary: string;
  bodyMarkdown: string;
}

export const manualCategoryLabels: Record<ManualCategory, string> = {
  software: "软件使用",
  collaboration: "Codex 协作"
};

export const manualSections: ManualSection[] = [
  {
    id: "start",
    category: "software",
    title: "快速开始",
    summary: "登录、打开面板、刷新和常用快捷键。",
    bodyMarkdown: `# 快速开始

Workshop Desktop 是一个轻量个人执行客户端，主要用于查看个人任务、写本地记录、打开任务工作面。

- 启动后如果没有有效登录配置，会先进入登录面板。
- 点击菜单栏或托盘图标打开待办面板。
- 使用 \`Command+Option+W\` 打开待办面板，使用 \`Command+Option+N\` 新建个人记录。
- 面板顶部的刷新按钮会重新同步项目和任务。
- 设置里可以切换 Dock 图标、每日刷新时间和全局快捷键。`
  },
  {
    id: "tasks",
    category: "software",
    title: "项目与任务",
    summary: "个人范围任务、状态操作和任务便签。",
    bodyMarkdown: `# 项目与任务

主面板按项目聚合当前用户相关的任务。当前个人范围是：由你创建，或执行者是你的任务。

- 点击项目行打开项目任务便签。
- 任务可以执行开始、完成、阻塞、退回待办等轻量状态操作。
- 完成的任务仍会保留在列表中，归档不是当前桌面端已实现的任务能力。
- 任务列表是定位入口，任务详情和便签窗口才是处理入口。
- 任务标题在列表中会紧凑展示，完整内容在详情里查看。`
  },
  {
    id: "records",
    category: "software",
    title: "个人记录",
    summary: "个人、项目、任务三类记录的用途和边界。",
    bodyMarkdown: `# 个人记录

个人记录是本机 markdown 记录，用于捕捉想法、执行结果和项目上下文，不是远端 Workshop 任务。

- 个人记录不绑定项目或任务，适合临时想法。
- 项目记录绑定项目，一个项目可以有多条 active 记录。
- 任务记录绑定任务，每个任务最多一条 active 任务记录。
- 记录完成后仍显示；转为任务或归档后从列表隐藏。
- AI 通过本地 bridge 创建的记录会标记为 agent 来源，仍需要人工确认后才能晋升为任务或 repo 事实。`
  },
  {
    id: "workspace",
    category: "software",
    title: "项目工作区",
    summary: "本地目录绑定、项目记录面和任务工作面。",
    bodyMarkdown: `# 项目工作区

项目工作区围绕一个 Workshop 项目展开，通常包括任务便签、项目记录和本地目录。

- 未绑定本地目录时，项目任务列表和项目记录列表会提示绑定。
- 本地目录是当前设备配置，不是远端项目字段。
- 绑定后点击路径可以打开对应文件夹。
- 发送到 Codex 时，桌面端会使用这个目录作为执行工作区。
- 打开项目工作区时，可以同时打开项目任务面和相关项目记录面。`
  },
  {
    id: "updates",
    category: "software",
    title: "设置与更新",
    summary: "设置项、AI 协作、检查更新和安装更新。",
    bodyMarkdown: `# 设置与更新

设置窗口集中处理账号连接、刷新节奏、Dock 展示、快捷键、AI 协作和应用更新。

- 每日定时更新会在指定时间刷新项目和任务。
- 便签默认置顶会影响新打开的便签和记录窗口。
- AI 协作区块可以安装或更新 Workshop Codex skill；新开的 Codex 线程会读取新 skill。
- macOS 发布版可以从设置或应用菜单检查更新。
- 新版本下载完成后，需要手动点击重启安装。
- 发布版启动时会自动安装用户级 \`workshop\` 和 \`workshop-desktop\` CLI，供本机 AI/CLI 连接正在运行的桌面端。
- 开发模式不会执行真实自动更新。`
  },
  {
    id: "codex-skill",
    category: "collaboration",
    title: "安装协作 Skill",
    summary: "让 Codex 理解 Workshop 协作规则。",
    bodyMarkdown: `# 安装协作 Skill

Workshop Codex skill 是给 Codex 读取的协作说明，不在桌面端内部执行。

- 发布版首次启动会提示安装 Workshop Codex skill。
- 设置里的 AI 协作区块可以检查、安装或更新这个 skill。
- skill 默认安装到 \`~/.codex/skills/workshop-codex-collaboration\`。
- 如果已有不同版本，桌面端会先备份旧版本再安装内置版本。
- 安装后需要打开新的 Codex 线程，新的线程才会自动发现 skill。`
  },
  {
    id: "codex-send",
    category: "collaboration",
    title: "发送到 Codex",
    summary: "从任务或记录触发本地 Codex 执行。",
    bodyMarkdown: `# 发送到 Codex

发送到 Codex 是一个执行动作，不会自动创建新任务，也不会把记录变成已接受事实。

- 发送前需要项目已经绑定本地目录。
- 任务详情发送前会先保存任务备注。
- 项目记录或任务记录发送前会先保存记录正文。
- 没有项目上下文的个人记录不能直接发送到 Codex。
- 主面板底部会显示最近 Codex 运行状态，包含运行中、已完成、失败和已中断。`
  },
  {
    id: "codex-loop",
    category: "collaboration",
    title: "协作闭环",
    summary: "从想法、记录、任务到执行回写的推荐路径。",
    bodyMarkdown: `# 协作闭环

推荐把 Workshop 当成任务和执行入口，把 Codex 当成本地实现者，把记录当成可读沉淀。

- 想法未稳定时，先写个人记录或项目记录。
- 需要明确执行时，由你把记录转为 Workshop 任务。
- 需要 Codex 处理时，从任务或项目/任务记录发送。
- Codex 完成后，可以通过 app server 新增一条短记录，保留结论、影响和下一步。
- 本机命令行优先使用 \`workshop\`；它会通过 app server 调用桌面端，不直接写内部数据文件。
- 只有当内容被人工整理进 repo 文档，或转为 Workshop 任务后，它才进入正式事实或执行体系。`
  },
  {
    id: "codex-boundary",
    category: "collaboration",
    title: "边界与安全",
    summary: "AI 回写、任务创建和 repo 文档的边界。",
    bodyMarkdown: `# 边界与安全

Codex 协作遵循最小授权：执行由用户触发，回写默认只能新增记录。

- 桌面端派发 Codex 时，只注入受限 token。
- 受限 token 只允许 \`record.create\`，不能读取记录、创建任务或继续派发执行。
- Codex 默认不编辑、删除或改写用户已有记录。
- Codex 默认不创建 Workshop 任务，任务创建应由用户确认。
- 个人记录不是 repo fact；代码和经过审查的 repo 文档才是当前项目事实。`
  },
  {
    id: "codex-writing",
    category: "collaboration",
    title: "回写记录建议",
    summary: "Codex 任务完成后写什么、写多长。",
    bodyMarkdown: `# 回写记录建议

Codex 回写面向人类后续阅读，不是完整执行日志。

- 默认写 3-6 行短记录。
- 优先保留结论、影响和下一步。
- 不默认保留完整对话、推理过程、测试日志或代码细节。
- 重要决策、多方案取舍或复杂边界可以写长一些，但结论仍要放在前面。
- 如果桌面端没有运行，CLI 写入失败后应停止，不要直接写内部数据文件。`
  }
];
