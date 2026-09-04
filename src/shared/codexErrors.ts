import type { CodexRunMeta } from "./types";

const RATE_LIMIT_PATTERNS = [
  /RATE_LIMIT_EXCEEDED/i,
  /\brate[_\s-]?limit(?:ed| exceeded)?\b/i,
  /\btoo many requests\b/i,
  /\bHTTP\s*429\b/i,
  /\b429\b.*\b(limit|requests)\b/i
];

export function isCodexRateLimitMessage(message: string) {
  return RATE_LIMIT_PATTERNS.some((pattern) => pattern.test(message));
}

export function normalizeCodexFailureMessage(message: string | undefined, fallback = "Codex 执行失败") {
  const trimmed = message?.trim() ?? "";
  if (!trimmed) {
    return fallback;
  }
  if (isCodexRateLimitMessage(trimmed)) {
    return "Codex 请求被限流（RATE_LIMIT_EXCEEDED），请稍后再试。";
  }
  return trimmed;
}

export function summarizeCodexFailureForDisplay(message: string | undefined) {
  const normalized = normalizeCodexFailureMessage(message, "");
  if (!normalized) {
    return "";
  }
  if (isCodexRateLimitMessage(normalized)) {
    return "限流，稍后重试";
  }
  return normalized.length > 28 ? `${normalized.slice(0, 28)}...` : normalized;
}

export function formatCodexRunStatusMessage(run: CodexRunMeta | undefined) {
  if (!run) {
    return "";
  }
  if (run.status === "running") {
    return "Codex 执行中，可在 Codex app 查看";
  }
  if (run.status === "completed") {
    return "Codex 执行已完成";
  }
  if (run.status === "failed") {
    return `Codex 执行失败：${normalizeCodexFailureMessage(run.lastMessage || "执行失败")}`;
  }
  return "Codex 执行已中断";
}
