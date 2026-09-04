import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type {
  AnnotatePersonalRecordRequest,
  PersonalRecord,
  PersonalRecordAnnotation,
  PersonalRecordAnnotationIntent,
  PersonalRecordAnnotationResolution,
  PersonalRecordAnnotationRetention,
  PersonalRecordMeta,
  PersonalRecordOrigin,
  PersonalRecordScope,
  PersonalRecordStatusChangeTarget,
  PersonalRecordStatus,
  SavePersonalRecordRequest
} from "../shared/types";

export function normalizeRecordScope(value: unknown): PersonalRecordScope {
  return value === "project" || value === "task" ? value : "none";
}

export function normalizeRecordStatus(value: unknown): PersonalRecordStatus {
  return value === "completed" || value === "promoted" || value === "archived" ? value : "active";
}

function isListedRecordStatus(status: PersonalRecordStatus): status is "active" | "completed" {
  return status === "active" || status === "completed";
}

function normalizeArchivedFromStatus(value: unknown): "active" | "completed" | undefined {
  return value === "completed" ? "completed" : value === "active" ? "active" : undefined;
}

function normalizeRecordId(id: string) {
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
    throw new Error("记录 ID 无效");
  }
  return id;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function safeText(value: unknown, maxLength = 120) {
  if (typeof value !== "string") {
    return null;
  }

  const text = value.trim();
  return text && text.length <= maxLength ? text : null;
}

function safeTimestamp(value: unknown, fallback: string) {
  const text = safeText(value, 40);
  if (!text) {
    return fallback;
  }

  return Number.isNaN(new Date(text).getTime()) ? fallback : text;
}

function safeConfidence(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }
  return Math.min(Math.max(value, 0), 1);
}

const recordAnnotationIntents: PersonalRecordAnnotationIntent[] = ["task", "question", "discussion", "principle", "execution_summary", "note"];
const recordAnnotationRetentions: PersonalRecordAnnotationRetention[] = ["temp", "keep", "candidate", "archived"];
const recordAnnotationResolutions: PersonalRecordAnnotationResolution[] = ["open", "answered", "decided", "converted", "obsolete"];

function safeEnum<T extends string>(value: unknown, allowed: readonly T[]) {
  return typeof value === "string" && allowed.includes(value as T) ? (value as T) : undefined;
}

function safeTextList(value: unknown, maxItems: number, maxItemLength: number) {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const seen = new Set<string>();
  for (const item of value) {
    const text = safeText(item, maxItemLength);
    if (text) {
      seen.add(text);
    }
    if (seen.size >= maxItems) {
      break;
    }
  }

  const items = [...seen];
  return items.length > 0 ? items : undefined;
}

function safeRecordIdList(value: unknown) {
  const items = safeTextList(value, 50, 120)?.filter((id) => /^[a-zA-Z0-9_-]+$/.test(id));
  return items && items.length > 0 ? items : undefined;
}

function safeLocalProjectId(value: unknown) {
  const text = safeText(value, 120);
  return text && /^[a-zA-Z0-9_-]+$/.test(text) ? text : undefined;
}

function safePositiveInteger(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.trunc(value) : undefined;
}

function normalizeRecordAnnotation(value: unknown, existing?: PersonalRecordAnnotation): PersonalRecordAnnotation | null {
  const source = isPlainObject(value) ? value : {};
  const namespace = safeText(source.namespace, 80) ?? existing?.namespace;
  if (!namespace) {
    return null;
  }

  const now = new Date().toISOString();
  const createdAt = safeTimestamp(source.createdAt, existing?.createdAt ?? now);
  const updatedAt = safeTimestamp(source.updatedAt, now);
  const intent = safeEnum(source.intent, recordAnnotationIntents);
  const retention = safeEnum(source.retention, recordAnnotationRetentions);
  const resolution = safeEnum(source.resolution, recordAnnotationResolutions);
  const tags = safeTextList(source.tags, 20, 50);
  const relatedRecordIds = safeRecordIdList(source.relatedRecordIds);
  const relatedTaskId = safePositiveInteger(source.relatedTaskId);
  const aiTitle = safeText(source.aiTitle, 160) ?? undefined;
  const type = safeText(source.type, 80) ?? undefined;
  const summary = safeText(source.summary, 800) ?? undefined;
  const status = safeText(source.status, 80) ?? undefined;
  const confidence = safeConfidence(source.confidence);

  return {
    namespace,
    ...(intent ? { intent } : {}),
    ...(retention ? { retention } : {}),
    ...(resolution ? { resolution } : {}),
    ...(tags ? { tags } : {}),
    ...(relatedRecordIds ? { relatedRecordIds } : {}),
    ...(relatedTaskId !== undefined ? { relatedTaskId } : {}),
    ...(aiTitle ? { aiTitle } : {}),
    ...(type ? { type } : {}),
    ...(summary ? { summary } : {}),
    ...(status ? { status } : {}),
    ...(confidence !== undefined ? { confidence } : {}),
    createdAt,
    updatedAt
  };
}

function normalizeRecordAnnotations(value: unknown) {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const byNamespace = new Map<string, PersonalRecordAnnotation>();
  for (const item of value) {
    const annotation = normalizeRecordAnnotation(item);
    if (annotation) {
      byNamespace.set(annotation.namespace, annotation);
    }
  }
  const annotations = [...byNamespace.values()];
  return annotations.length > 0 ? annotations : undefined;
}

function truncateRecordTitle(title: string) {
  return title.length > 48 ? `${title.slice(0, 48)}...` : title;
}

function deriveRecordTitle(bodyMarkdown: string, fallback?: string) {
  const firstContentLine = bodyMarkdown
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
  const h1Title = firstContentLine?.match(/^#\s+(.+)$/)?.[1]?.replace(/\s+#+$/, "").trim();
  if (h1Title) {
    return truncateRecordTitle(h1Title);
  }

  const title = (firstContentLine || fallback || "未命名记录")
    .replace(/^#{1,6}\s+/, "")
    .replace(/^[-*]\s+/, "")
    .trim();
  return truncateRecordTitle(title || fallback || "未命名记录");
}

async function writeFileAtomic(filePath: string, contents: string) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${Date.now().toString(36)}-${randomUUID().slice(0, 8)}.tmp`;
  try {
    await fs.writeFile(tempPath, contents, "utf8");
    await fs.rename(tempPath, filePath);
  } catch (error) {
    await fs.unlink(tempPath).catch(() => undefined);
    throw error;
  }
}

export class PersonalRecordStore {
  private writeQueue: Promise<unknown> = Promise.resolve();

  constructor(private readonly getUserDataPath: () => string) {}

  async listVisible() {
    const records = await this.readRecordIndexAfterWrites();
    return records.filter((record) => isListedRecordStatus(record.status));
  }

  async listAll() {
    return this.readRecordIndexAfterWrites();
  }

  async get(id: string): Promise<PersonalRecord | null> {
    await this.waitForPendingWrites();
    const safeId = normalizeRecordId(id);
    const records = await this.readRecordIndex();
    const meta = records.find((record) => record.id === safeId);
    if (!meta) {
      return null;
    }

    let bodyMarkdown = "";
    try {
      bodyMarkdown = await fs.readFile(this.recordBodyPath(safeId), "utf8");
    } catch {
      bodyMarkdown = "";
    }

    return { ...meta, bodyMarkdown };
  }

  save(request: SavePersonalRecordRequest): Promise<PersonalRecord> {
    return this.enqueueWrite(() => this.saveNow(request));
  }

  annotate(request: AnnotatePersonalRecordRequest): Promise<PersonalRecordMeta> {
    return this.enqueueWrite(() => this.annotateNow(request));
  }

  archiveProjectRecords(projectId: number, targets: PersonalRecordStatusChangeTarget[]): Promise<PersonalRecordMeta[]> {
    return this.enqueueWrite(() => this.changeProjectArchiveStatusNow(projectId, targets, "archive"));
  }

  restoreProjectRecords(projectId: number, targets: PersonalRecordStatusChangeTarget[]): Promise<PersonalRecordMeta[]> {
    return this.enqueueWrite(() => this.changeProjectArchiveStatusNow(projectId, targets, "restore"));
  }

  delete(id: string): Promise<string> {
    return this.enqueueWrite(async () => {
      const safeId = normalizeRecordId(id);
      const records = await this.readRecordIndex();
      await this.writeRecordIndex(records.filter((record) => record.id !== safeId));
      await fs.unlink(this.recordBodyPath(safeId)).catch(() => undefined);
      return safeId;
    });
  }

  private recordsDirPath() {
    return path.join(this.getUserDataPath(), "personal-records");
  }

  private recordsIndexPath() {
    return path.join(this.recordsDirPath(), "index.json");
  }

  private recordBodyPath(id: string) {
    return path.join(this.recordsDirPath(), `${normalizeRecordId(id)}.md`);
  }

  private async waitForPendingWrites() {
    await this.writeQueue.catch(() => undefined);
  }

  private async readRecordIndexAfterWrites() {
    await this.waitForPendingWrites();
    return this.readRecordIndex();
  }

  private async readRecordIndex(): Promise<PersonalRecordMeta[]> {
    try {
      const raw = await fs.readFile(this.recordsIndexPath(), "utf8");
      const parsed = JSON.parse(raw) as { records?: PersonalRecordMeta[] } | PersonalRecordMeta[];
      const records = Array.isArray(parsed) ? parsed : parsed.records;
      return Array.isArray(records)
        ? records
            .filter((record) => record.id && record.title)
            .map((record) => ({
              ...record,
              scopeType: normalizeRecordScope(record.scopeType),
              status: normalizeRecordStatus(record.status),
              archivedFromStatus:
                normalizeRecordStatus(record.status) === "archived" ? normalizeArchivedFromStatus(record.archivedFromStatus) : undefined,
              localProjectId: safeLocalProjectId(record.localProjectId),
              annotations: normalizeRecordAnnotations(record.annotations)
            }))
            .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        : [];
    } catch {
      return [];
    }
  }

  private async writeRecordIndex(records: PersonalRecordMeta[]) {
    const sorted = [...records].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    await writeFileAtomic(this.recordsIndexPath(), JSON.stringify({ records: sorted }, null, 2));
  }

  private enqueueWrite<T>(write: () => Promise<T>): Promise<T> {
    const next = this.writeQueue.then(write, write);
    this.writeQueue = next.catch(() => undefined);
    return next;
  }

  private async saveNow(request: SavePersonalRecordRequest): Promise<PersonalRecord> {
    const nextRequest: Record<string, unknown> = isPlainObject(request) ? request : {};
    const bodyMarkdown = typeof nextRequest.bodyMarkdown === "string" ? nextRequest.bodyMarkdown : "";
    const localProjectId = safeLocalProjectId(nextRequest.localProjectId);
    const projectId = typeof nextRequest.projectId === "number" && Number.isFinite(nextRequest.projectId) ? nextRequest.projectId : undefined;
    const projectName = safeText(nextRequest.projectName) ?? undefined;
    const taskId = typeof nextRequest.taskId === "number" && Number.isFinite(nextRequest.taskId) ? nextRequest.taskId : undefined;
    const taskTitle = safeText(nextRequest.taskTitle) ?? undefined;
    const promotedTaskId =
      typeof nextRequest.promotedTaskId === "number" && Number.isFinite(nextRequest.promotedTaskId)
        ? nextRequest.promotedTaskId
        : undefined;
    const records = await this.readRecordIndex();
    const scopeType = normalizeRecordScope(nextRequest.scopeType);
    const existingTaskRecord =
      !nextRequest.id && scopeType === "task" && typeof taskId === "number"
        ? records.find((record) => isListedRecordStatus(record.status) && record.scopeType === "task" && record.taskId === taskId)
        : undefined;
    const requestId = safeText(nextRequest.id, 80);
    const id = requestId
      ? normalizeRecordId(requestId)
      : existingTaskRecord?.id ?? `${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
    const existing = records.find((record) => record.id === id);
    const now = new Date().toISOString();
    const fallbackTitle = taskTitle || projectName;
    // origin 跟随创建者，后续编辑不改变来源。
    const requestedOrigin: PersonalRecordOrigin = nextRequest.origin === "agent" ? "agent" : "human";
    const status = normalizeRecordStatus(nextRequest.status ?? existing?.status);
    const existingStatus = existing?.status ?? "active";
    const archivedFromStatus =
      status === "archived"
        ? isListedRecordStatus(existingStatus)
          ? existingStatus
          : normalizeArchivedFromStatus(existing?.archivedFromStatus) ?? "active"
        : undefined;
    const meta: PersonalRecordMeta = {
      id,
      title: deriveRecordTitle(bodyMarkdown, fallbackTitle),
      scopeType,
      status,
      ...(archivedFromStatus ? { archivedFromStatus } : {}),
      origin: existing?.origin ?? requestedOrigin,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      ...(promotedTaskId ? { promotedTaskId } : existing?.promotedTaskId ? { promotedTaskId: existing.promotedTaskId } : {}),
      ...(existing?.annotations?.length ? { annotations: existing.annotations } : {}),
      ...(scopeType === "project" || scopeType === "task" ? { localProjectId, projectId, projectName } : {}),
      ...(scopeType === "task" ? { taskId, taskTitle } : {})
    };
    const nextRecords = [meta, ...records.filter((record) => record.id !== id)];
    await writeFileAtomic(this.recordBodyPath(id), bodyMarkdown);
    await this.writeRecordIndex(nextRecords);
    return { ...meta, bodyMarkdown };
  }

  private async changeProjectArchiveStatusNow(
    projectId: number,
    targets: PersonalRecordStatusChangeTarget[],
    mode: "archive" | "restore"
  ): Promise<PersonalRecordMeta[]> {
    if (!Number.isInteger(projectId) || projectId <= 0) {
      throw new Error("项目 ID 无效");
    }
    if (!Array.isArray(targets) || targets.length === 0 || targets.length > 50) {
      throw new Error("记录状态变更每次需要选择 1-50 条记录");
    }

    const normalizedTargets = targets.map((target) => ({
      id: normalizeRecordId(target.id),
      expectedUpdatedAt: safeTimestamp(target.expectedUpdatedAt, "")
    }));
    if (new Set(normalizedTargets.map((target) => target.id)).size !== normalizedTargets.length) {
      throw new Error("记录状态变更不能包含重复 ID");
    }
    if (normalizedTargets.some((target) => !target.expectedUpdatedAt)) {
      throw new Error("记录状态变更缺少有效的 expectedUpdatedAt");
    }

    const records = await this.readRecordIndex();
    const recordsById = new Map(records.map((record) => [record.id, record]));
    for (const target of normalizedTargets) {
      const record = recordsById.get(target.id);
      if (!record) {
        throw new Error(`记录不存在：${target.id}`);
      }
      if (record.projectId !== projectId) {
        throw new Error(`记录不属于项目 ${projectId}：${target.id}`);
      }
      if (record.updatedAt !== target.expectedUpdatedAt) {
        throw new Error(`记录已在确认后发生变化，请重新提交：${record.title}`);
      }
      if (mode === "archive" && !isListedRecordStatus(record.status)) {
        throw new Error(`记录当前不可归档：${record.title}（${record.status}）`);
      }
      if (mode === "restore" && record.status !== "archived") {
        throw new Error(`记录当前不可恢复：${record.title}（${record.status}）`);
      }
    }

    const now = new Date().toISOString();
    const targetIds = new Set(normalizedTargets.map((target) => target.id));
    const changed: PersonalRecordMeta[] = [];
    const nextRecords = records.map((record) => {
      if (!targetIds.has(record.id)) {
        return record;
      }
      const next: PersonalRecordMeta =
        mode === "archive"
          ? { ...record, status: "archived", archivedFromStatus: record.status as "active" | "completed", updatedAt: now }
          : {
              ...record,
              status: normalizeArchivedFromStatus(record.archivedFromStatus) ?? "active",
              archivedFromStatus: undefined,
              updatedAt: now
            };
      changed.push(next);
      return next;
    });
    await this.writeRecordIndex(nextRecords);
    return changed;
  }

  private async annotateNow(request: AnnotatePersonalRecordRequest): Promise<PersonalRecordMeta> {
    const requestId = safeText(request.id, 80);
    if (!requestId) {
      throw new Error("record.annotate 需要记录 ID");
    }

    const safeId = normalizeRecordId(requestId);
    const records = await this.readRecordIndex();
    const existing = records.find((record) => record.id === safeId);
    if (!existing) {
      throw new Error(`记录不存在：${safeId}`);
    }

    const currentAnnotations = existing.annotations ?? [];
    const current = currentAnnotations.find((annotation) => annotation.namespace === request.annotation.namespace);
    const nextAnnotation = normalizeRecordAnnotation(request.annotation, current);
    if (!nextAnnotation) {
      throw new Error("record.annotate 需要 annotation.namespace");
    }

    const meta: PersonalRecordMeta = {
      ...existing,
      annotations: [nextAnnotation, ...currentAnnotations.filter((annotation) => annotation.namespace !== nextAnnotation.namespace)]
    };
    await this.writeRecordIndex([meta, ...records.filter((record) => record.id !== safeId)]);
    return meta;
  }
}
