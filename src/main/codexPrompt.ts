export interface CodexPromptInput {
  title: string;
  bodyMarkdown?: string;
}

// 派发不包装：turn 输入只有用户内容。规则（回写通道、文档纪律）和项目 ID
// 由目标项目的 AGENTS.md 声明；运行与任务/记录的关联由运行状态表持有。
export function buildCodexUserInput(request: CodexPromptInput) {
  const body = request.bodyMarkdown?.trim() ?? "";
  return body || request.title;
}
