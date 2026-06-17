import type { PersonalRecordMeta, PersonalRecordScope, PersonalRecordStatus, PersonalRecordTarget } from "../../shared/types";

export const recordCompleteAnimationMs = 900;

export type RecordMode = "edit" | "preview";
export type RecordSaveStatus = "idle" | "saving" | "saved" | "error";
export type RecordListContext =
  | { scopeType: "none" }
  | {
      scopeType: "project";
      localProjectId?: string;
      projectId?: number;
      projectName?: string;
    };

export type RecordHeaderContext = {
  scopeType: PersonalRecordScope;
  title?: string;
  projectName?: string;
  taskTitle?: string;
};

export type HeaderTitleContent =
  | {
      variant: "plain";
      text: string;
    }
  | {
      variant: "scoped";
      context: string;
      suffix: string;
    };

export const recordStatusLabels: Record<PersonalRecordStatus, string> = {
  active: "进行中",
  completed: "已完成",
  promoted: "已转任务",
  archived: "已归档"
};

function truncateRecordTitle(title: string) {
  return title.length > 48 ? `${title.slice(0, 48)}...` : title;
}

export function deriveRecordTitle(bodyMarkdown: string, fallback = "未命名记录") {
  const firstContentLine = bodyMarkdown
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
  const h1Title = firstContentLine?.match(/^#\s+(.+)$/)?.[1]?.replace(/\s+#+$/, "").trim();
  if (h1Title) {
    return truncateRecordTitle(h1Title);
  }

  const title = (firstContentLine || fallback).replace(/^#{1,6}\s+/, "").replace(/^[-*]\s+/, "").trim();
  return truncateRecordTitle(title || fallback);
}

export function getRecordHeaderTitle(record: RecordHeaderContext | null, isDetail: boolean, recordCount: number): HeaderTitleContent {
  if (!record) {
    return { variant: "plain", text: `个人记录 ${recordCount}` };
  }
  if (record.scopeType === "task") {
    return { variant: "scoped", context: record.projectName || record.taskTitle || "任务", suffix: "备注" };
  }
  if (record.scopeType === "project") {
    return { variant: "scoped", context: record.projectName || "项目", suffix: isDetail ? "记录" : `记录 ${recordCount}` };
  }
  return { variant: "plain", text: isDetail ? "个人记录" : `个人记录 ${recordCount}` };
}

export function getRecordListContext(
  source?: Pick<PersonalRecordMeta, "scopeType" | "localProjectId" | "projectId" | "projectName"> | PersonalRecordTarget | null
): RecordListContext {
  if (source?.scopeType === "project" || source?.scopeType === "task") {
    return {
      scopeType: "project",
      localProjectId: source.localProjectId,
      projectId: source.projectId,
      projectName: source.projectName
    };
  }

  return { scopeType: "none" };
}

export function recordMatchesListContext(record: PersonalRecordMeta, context: RecordListContext) {
  if (context.scopeType === "none") {
    return record.scopeType === "none";
  }

  if (record.scopeType !== "project") {
    return false;
  }

  if (context.localProjectId) {
    return (
      record.localProjectId === context.localProjectId ||
      (!record.localProjectId && typeof context.projectId === "number" && record.projectId === context.projectId) ||
      (!record.localProjectId && Boolean(context.projectName) && record.projectName === context.projectName)
    );
  }

  if (context.projectId !== undefined) {
    return record.projectId === context.projectId;
  }

  if (context.projectName) {
    return record.projectName === context.projectName;
  }

  return true;
}

export function recordMatchesSearch(record: PersonalRecordMeta, tokens: string[]) {
  if (tokens.length === 0) {
    return true;
  }

  const searchableText = [record.title, record.projectName, record.taskTitle, recordStatusLabels[record.status]]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return tokens.every((token) => searchableText.includes(token));
}

export function compareRecordListItems(a: PersonalRecordMeta, b: PersonalRecordMeta) {
  const rankA = a.status === "completed" ? 1 : 0;
  const rankB = b.status === "completed" ? 1 : 0;
  if (rankA !== rankB) {
    return rankA - rankB;
  }

  return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
}

export function findTaskRecord(records: PersonalRecordMeta[], taskId?: number) {
  if (taskId === undefined) {
    return undefined;
  }
  return records.find((record) => record.scopeType === "task" && record.taskId === taskId);
}

export function getRecordListEmptyLabel(context: RecordListContext, hasSearchQuery = false) {
  if (hasSearchQuery) {
    return "没有匹配记录";
  }
  return context.scopeType === "project" ? "还没有项目记录" : "还没有个人记录";
}
