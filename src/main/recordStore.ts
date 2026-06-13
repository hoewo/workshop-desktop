import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type {
  AnnotatePersonalRecordRequest,
  PersonalRecord,
  PersonalRecordAnnotation,
  PersonalRecordMeta,
  PersonalRecordOrigin,
  PersonalRecordScope,
  PersonalRecordStatus,
  SavePersonalRecordRequest
} from "../shared/types";

export function normalizeRecordScope(value: unknown): PersonalRecordScope {
  return value === "project" || value === "task" ? value : "none";
}

export function normalizeRecordStatus(value: unknown): PersonalRecordStatus {
  return value === "completed" || value === "promoted" || value === "archived" ? value : "active";
}

function isListedRecordStatus(status: PersonalRecordStatus) {
  return status === "active" || status === "completed";
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

function normalizeRecordAnnotation(value: unknown, existing?: PersonalRecordAnnotation): PersonalRecordAnnotation | null {
  const source = isPlainObject(value) ? value : {};
  const namespace = safeText(source.namespace, 80) ?? existing?.namespace;
  if (!namespace) {
    return null;
  }

  const now = new Date().toISOString();
  const createdAt = safeTimestamp(source.createdAt, existing?.createdAt ?? now);
  const updatedAt = safeTimestamp(source.updatedAt, now);
  const aiTitle = safeText(source.aiTitle, 160) ?? undefined;
  const type = safeText(source.type, 80) ?? undefined;
  const summary = safeText(source.summary, 800) ?? undefined;
  const status = safeText(source.status, 80) ?? undefined;
  const confidence = safeConfidence(source.confidence);

  return {
    namespace,
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
    const meta: PersonalRecordMeta = {
      id,
      title: deriveRecordTitle(bodyMarkdown, fallbackTitle),
      scopeType,
      status: normalizeRecordStatus(nextRequest.status ?? existing?.status),
      origin: existing?.origin ?? requestedOrigin,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      ...(promotedTaskId ? { promotedTaskId } : existing?.promotedTaskId ? { promotedTaskId: existing.promotedTaskId } : {}),
      ...(existing?.annotations?.length ? { annotations: existing.annotations } : {}),
      ...(scopeType === "project" || scopeType === "task" ? { projectId, projectName } : {}),
      ...(scopeType === "task" ? { taskId, taskTitle } : {})
    };
    const nextRecords = [meta, ...records.filter((record) => record.id !== id)];
    await writeFileAtomic(this.recordBodyPath(id), bodyMarkdown);
    await this.writeRecordIndex(nextRecords);
    return { ...meta, bodyMarkdown };
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
