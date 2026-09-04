import type { CodexRunStatus, Organization, Project, ProjectTag, Task, TaskState } from "../../shared/types";
import type { HeaderTitleContent } from "./records";

export const taskListStates: TaskState[] = [
  "pending",
  "in_progress",
  "pending_review",
  "completed",
  "accepted",
  "cancelled",
  "blocked"
];

export const codexRunStatusLabels: Record<CodexRunStatus, string> = {
  running: "运行中",
  completed: "已完成",
  failed: "失败",
  interrupted: "已中断"
};

export const taskCompleteAnimationMs = 850;

export const stateLabels: Record<TaskState, string> = {
  pending: "待办",
  in_progress: "进行中",
  pending_review: "待评审",
  completed: "已完成",
  accepted: "已验收",
  cancelled: "已取消",
  blocked: "阻塞"
};

export const stateTone: Record<TaskState, string> = {
  pending: "state-pending",
  in_progress: "state-progress",
  pending_review: "state-review",
  completed: "state-done",
  accepted: "state-done",
  cancelled: "state-muted",
  blocked: "state-blocked"
};

export interface EnrichedTask extends Task {
  projectName: string;
  meId?: number;
  isMine: boolean;
  resolvedTags: Array<{ id: number; name: string }>;
}

export interface ProjectTodoGroup {
  project: Project;
  projectName: string;
  tasks: EnrichedTask[];
  count: number;
  latestAt: number;
}

export function isVisibleTask(task: Task) {
  return taskListStates.includes(task.state) && !task.deleted_at;
}

export function getMeId(project: Project, username?: string) {
  const members = project.members ?? [];
  return (
    members.find((member) => member.is_me)?.user_id ??
    (username ? members.find((member) => member.username === username)?.user_id : undefined)
  );
}

export function withOrganization(project: Project, organization?: Organization): Project {
  return organization
    ? {
        ...project,
        organization_id: organization.id,
        organizationName: organization.name
      }
    : project;
}

export function mergeProjects(projectGroups: Project[][]) {
  const byId = new Map<number, Project>();
  for (const project of projectGroups.flat()) {
    byId.set(project.id, project);
  }
  return [...byId.values()];
}

export function getProjectDisplayName(project: Project) {
  return project.name;
}

export function getStickyHeader({
  filteredTaskCount,
  isSingleTaskSticky,
  projectFilter,
  selectedProjectName,
  selectedTask
}: {
  filteredTaskCount: number;
  isSingleTaskSticky: boolean;
  projectFilter: string;
  selectedProjectName?: string;
  selectedTask: EnrichedTask | null;
}): HeaderTitleContent {
  const isProjectSticky = !isSingleTaskSticky && projectFilter !== "all";
  if (isSingleTaskSticky) {
    return { variant: "scoped", context: selectedTask?.projectName || selectedProjectName || "项目", suffix: "任务" };
  }
  if (isProjectSticky) {
    return { variant: "scoped", context: selectedProjectName || "项目", suffix: `任务 ${filteredTaskCount}` };
  }
  return { variant: "plain", text: "全部待办" };
}

export function formatRelative(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const diff = Date.now() - date.getTime();
  const minutes = Math.max(0, Math.round(diff / 60000));

  if (minutes < 1) {
    return "刚刚";
  }
  if (minutes < 60) {
    return `${minutes} 分钟前`;
  }

  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return `${hours} 小时前`;
  }

  return date.toLocaleDateString("zh-CN", {
    month: "2-digit",
    day: "2-digit"
  });
}

export function compareTasks(a: EnrichedTask, b: EnrichedTask) {
  const completionRankA = a.state === "completed" ? 1 : 0;
  const completionRankB = b.state === "completed" ? 1 : 0;
  if (completionRankA !== completionRankB) {
    return completionRankA - completionRankB;
  }

  const priorityA = a.priority ?? 999;
  const priorityB = b.priority ?? 999;
  if (priorityA !== priorityB) {
    return priorityA - priorityB;
  }
  return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
}

export function taskMatchesProjectWorkspaceSearch(task: EnrichedTask, tokens: string[]) {
  if (tokens.length === 0) {
    return true;
  }

  const searchableText = [task.content, task.state, stateLabels[task.state], ...task.resolvedTags.map((tag) => tag.name)]
    .join(" ")
    .toLowerCase();

  return tokens.every((token) => searchableText.includes(token));
}

export function splitTags(tags?: string | null) {
  if (!tags) {
    return [];
  }
  return tags
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

export function getProjectTagDisplayName(name: string) {
  const match = name.trim().match(/^\[([^\]]+)\]\(#[0-9a-fA-F]{6,8}\)$/);
  return match?.[1]?.trim() || name.trim();
}

export function resolveTaskTags(tags: string | null | undefined, projectTags: ProjectTag[]) {
  const tagsById = new Map(projectTags.map((tag) => [tag.id, tag]));
  return splitTags(tags)
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value))
    .map((tagId) => tagsById.get(tagId))
    .filter((tag): tag is ProjectTag => Boolean(tag))
    .map((tag) => ({ id: tag.id, name: getProjectTagDisplayName(tag.name) }));
}
