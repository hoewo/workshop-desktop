export const manualRevision = "2026-09-04.2";

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
    summary: "账号、工作台、托盘面板和常用快捷键。",
    bodyMarkdown: `# 快速开始

Workshop Desktop 是一个轻量个人执行客户端，主要用于查看个人任务、写本地记录、打开任务工作面。

- 启动后会进入工作台；未登录 Workshop 账号时，本地项目和本地记录仍可使用。
- 点击 Dock、应用菜单或 \`Command+Option+W\` 打开工作台。
- 点击菜单栏或托盘图标打开托盘面板。
- 使用 \`Command+Option+N\` 新建个人记录。
- 设置里可以登录或退出 Workshop 账号；登录后可同步远端任务源。
- 工作台项目列表通过“添加项目”选择本地目录并新建本地项目；登录后可在本地项目右键菜单里关联远端任务源，托盘面板免登录显示同一组项目入口。
- 工作台和托盘面板顶部的刷新按钮会重新同步远端项目和任务。
- 设置里可以切换 Dock 图标、全局快捷键、AI 协作和更新。`
  },
  {
    id: "tasks",
    category: "software",
    title: "项目与任务",
    summary: "项目工作区、个人范围任务、状态操作和桌面便签。",
    bodyMarkdown: `# 项目与任务

工作台项目列表同时展示本地项目和拉取到的远端 Workshop 项目；托盘面板保留同一组快速入口。当前个人任务范围是：由你创建，或执行者是你的任务。

- 工作台和托盘面板点击项目行都打开项目工作区；桌面便签从便签入口打开。
- 项目工作区在同一滚动区域内分为“待办”和“记录”，两个分区默认展开并可分别折叠。
- 两类列表都使用单行布局；顶部搜索同时匹配待办内容、状态、标签和记录标题、状态、来源。
- “待办 +”直接打开锁定当前远端项目的创建面；“记录 +”直接打开独立完整记录窗口。
- 标题栏的布局按钮只整理当前项目的工作区和相关详情；个人记录、其他项目和其他屏幕不会被带入。
- 新打开的任务或记录详情会就近出现在来源工作区旁；创建或未保存编辑期间暂停同组整理。
- 未登录、未关联或同步异常时暂停新增待办并显示引导，本地记录仍可查看和新增。
- 本地项目和远端项目都会显示本地目录；未绑定时显示“未绑定目录，点击绑定”，点击目录文字即可绑定或打开目录。
- 任务可以执行开始、完成、阻塞、退回待办等轻量状态操作。
- 完成的任务仍会保留在列表中，归档不是当前桌面端已实现的任务能力。
- 任务列表是定位入口，任务详情和桌面便签窗口才是处理入口。
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
    summary: "本地目录、统一待办与记录工作面。",
    bodyMarkdown: `# 项目工作区

项目工作区围绕一个本地项目展开，在同一窗口中聚合本地记录、本地目录和可选任务源，但不合并任务与记录的数据模型。

- 添加项目会先选择本地目录，项目名默认使用文件夹名。
- 本地项目可在工作台或托盘面板项目行右键菜单里重命名，也可关联、更换或解除远端任务源。
- 未绑定本地目录时，项目工作区会提示“未绑定目录，点击绑定”。
- “待办”和“记录”的完成状态各自沿用原有语义；完成项继续保留，归档或已转任务记录继续隐藏。
- 待办同步失败时保留已有缓存并暂停新增；记录属于本地数据，不受远端同步状态影响。
- 工作台和托盘面板项目行的目录文字就是绑定和打开入口。
- 本地目录是当前设备配置，不是远端项目字段。
- 同一个本地目录只能绑定到一个本地项目；远端项目使用本地项目的目录作为任务源工作区。
- 同一个远端任务源只能关联到一个本地项目；关联后，本地项目名仍由本地项目自己决定。
- 绑定后点击路径可以打开对应文件夹。
- 发送到 Codex 时，桌面端会使用这个目录作为执行工作区。
- Workshop 任务只是可选任务源，不决定本地项目和记录归属。`
  },
  {
    id: "updates",
    category: "software",
    title: "设置与更新",
    summary: "账号、设置项、AI 协作、检查更新和安装更新。",
    bodyMarkdown: `# 设置与更新

设置窗口集中处理 Workshop 账号、Dock 展示、快捷键、AI 协作和应用更新。

- 项目和任务仅在手动点击刷新（托盘菜单或刷新按钮）时同步，不再后台自动刷新。
- 未登录时可以在设置里用邮箱或手机号验证码登录；已登录时可以在设置里退出登录。
- 工作台只显示远端任务源同步状态，账号登录和退出都归设置处理。
- 桌面便签默认置顶会影响新打开的便签和记录窗口。
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
- 工作台和托盘面板会显示最近 Codex 运行状态，包含运行中、已完成、失败和已中断。`
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

Codex 协作遵循最小授权：执行由用户触发，高风险写入必须由你确认。

- 桌面端派发 Codex 时，只注入受限 token。
- 受限 token 可以新增和检索记录，并读取当前运行关联项目的任务上下文。
- Codex 只能提交当前项目的记录归档/恢复或任务创建提议；Workshop 展示可信确认页，你确认后才执行。
- 记录归档会隐藏记录，但保留正文、标注和任务关联，可通过 CLI 恢复；它不会改变远端任务状态。
- 受限 token 不能读取其他项目、直接修改或删除记录/任务、提交任意确认页，或继续派发执行。
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
