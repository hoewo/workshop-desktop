#!/usr/bin/env node
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

function commandName() {
  const override = process.env.WORKSHOP_CLI_COMMAND_NAME?.trim();
  if (override) {
    return path.basename(override);
  }
  const invoked = path.basename(process.argv[1] || "workshop");
  return invoked.endsWith(".mjs") || invoked === "node" ? "workshop" : invoked;
}

function usage(command = commandName()) {
  return `Usage:
  ${command} doctor
  ${command} record create --title "Title" [--body "Markdown"] [--open]
  ${command} record create --title "Title" --body-file ./note.md --project-id 98 --project-name workshop-desktop --open
  ${command} record list [--scope project] [--project-id 98] [--query "keyword"]
  ${command} record get --id <record-id>
  ${command} record open --id <record-id>
  ${command} record annotate --annotations-file ./annotations.json
  ${command} project list
  ${command} task list [--project-id 98] [--state pending,completed]
  ${command} task get --id <task-id> [--project-id 98]
  ${command} context current
  ${command} confirmation open --title "确认标题" --html-file ./confirm.html
  ${command} confirmation request --title "确认标题" --html-file ./confirm.html --action-file ./action.json
  ${command} confirmation status [--id <request-id>]

Options:
  --help                  Show this help.
  --title <text>          Record title. If body has no markdown title, the title is prepended.
  --body <markdown>       Record markdown body.
  --body-file <path>      Read markdown body from a file.
  --scope <none|project|task>
  --status <active|completed|promoted|archived>
  --organization-id <number>
  --project-id <number>
  --project-name <text>
  --task-id <number>
  --task-title <text>
  --id <text|number>
  --state <state[,state]>
  --query <text>
  --limit <number>
  --page-size <number>
  --html <html>           Temporary confirmation HTML.
  --html-file <path>      Read temporary confirmation HTML from a file.
  --action-json <json>    Async confirmation action JSON.
  --action-file <path>    Read async confirmation action JSON from a file.
  --annotations-json <json>
  --annotations-file <path> Annotation JSON. Standard fields: intent, retention, resolution, tags, relatedRecordIds, relatedTaskId.
  --request-id <text>     Async confirmation request ID.
  --width <number>        Temporary confirmation window width.
  --height <number>       Temporary confirmation window height.
  --include-body          Include markdown bodies when listing records.
  --open                  Ask the desktop app to open the created record.
  --json                  Print machine-readable JSON.
`;
}

const USER_DATA_DIR_NAME = "workshop-desktop";
const LEGACY_DEV_USER_DATA_DIR_NAME = "Electron";

function defaultUserDataDir(dirName) {
  const home = os.homedir();
  if (process.platform === "darwin") {
    return path.join(home, "Library", "Application Support", dirName);
  }
  if (process.platform === "win32") {
    return path.join(process.env.APPDATA || path.join(home, "AppData", "Roaming"), dirName);
  }
  return path.join(process.env.XDG_CONFIG_HOME || path.join(home, ".config"), dirName);
}

function userDataDirs() {
  if (process.env.WORKSHOP_DESKTOP_USER_DATA) {
    return [process.env.WORKSHOP_DESKTOP_USER_DATA];
  }

  const stableDir = defaultUserDataDir(USER_DATA_DIR_NAME);
  const legacyDevDir = defaultUserDataDir(LEGACY_DEV_USER_DATA_DIR_NAME);
  return stableDir === legacyDevDir ? [stableDir] : [stableDir, legacyDevDir];
}

function parseArgs(argv) {
  const result = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--") {
      continue;
    }
    if (!arg.startsWith("--")) {
      result._.push(arg);
      continue;
    }

    const key = arg.slice(2);
    if (key === "open" || key === "json" || key === "include-body" || key === "help") {
      result[key] = true;
      continue;
    }

    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for --${key}`);
    }
    result[key] = value;
    index += 1;
  }
  return result;
}

function numberOption(value, name) {
  if (value === undefined) {
    return undefined;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${name} must be a number`);
  }
  return parsed;
}

function stringOption(value, name) {
  if (value === undefined) {
    throw new Error(`${name} is required`);
  }
  return String(value).trim();
}

function splitOptionList(value) {
  if (!value) {
    return undefined;
  }
  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function formatDate(value) {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }
  return date.toLocaleString("zh-CN", { hour12: false });
}

function truncate(value, maxLength) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > maxLength ? `${text.slice(0, Math.max(0, maxLength - 3))}...` : text;
}

function recordContext(record) {
  if (record.scopeType === "task") {
    return `task:${record.taskId ?? "-"} ${record.taskTitle || ""}`.trim();
  }
  if (record.scopeType === "project") {
    return `project:${record.projectId ?? "-"} ${record.projectName || ""}`.trim();
  }
  return "personal";
}

function printRecords(records, total) {
  if (records.length === 0) {
    console.log("No records.");
    return;
  }

  const hasBody = records.some((record) => typeof record.bodyMarkdown === "string");
  records.forEach((record, index) => {
    console.log(
      [
        record.id,
        `[${record.scopeType}/${record.status}]`,
        truncate(record.title, 54),
        recordContext(record),
        formatDate(record.updatedAt)
      ]
        .filter(Boolean)
        .join("\t")
    );
    if (hasBody) {
      console.log(record.bodyMarkdown || "");
      if (index < records.length - 1) {
        console.log("---");
      }
    }
  });
  if (typeof total === "number" && total > records.length) {
    console.log(`Showing ${records.length} of ${total} records.`);
  }
}

function printProjects(projects, total) {
  if (projects.length === 0) {
    console.log("No projects.");
    return;
  }

  for (const project of projects) {
    console.log([project.id, truncate(project.name, 64), project.organizationName].filter(Boolean).join("\t"));
  }
  if (typeof total === "number" && total > projects.length) {
    console.log(`Showing ${projects.length} of ${total} projects.`);
  }
}

function printTasks(tasks, total) {
  if (tasks.length === 0) {
    console.log("No tasks.");
    return;
  }

  for (const task of tasks) {
    console.log(
      [
        task.id,
        `[${task.state}]`,
        `project:${task.project_id}${task.projectName ? ` ${task.projectName}` : ""}`,
        truncate(task.content, 90),
        formatDate(task.updated_at)
      ]
        .filter(Boolean)
        .join("\t")
    );
  }
  if (typeof total === "number" && total > tasks.length) {
    console.log(`Showing ${tasks.length} of ${total} tasks.`);
  }
}

async function collectTasks(options, pageSizeOverride) {
  const projectId = numberOption(options["project-id"], "--project-id");
  const states = splitOptionList(options.state);
  const pageSize = pageSizeOverride ?? numberOption(options["page-size"], "--page-size");
  if (projectId !== undefined) {
    return rpc("task.list", { projectId, states, pageSize });
  }

  const projectResult = await rpc("project.list", { pageSize: 500 });
  const projects = projectResult.projects || [];
  const taskGroups = await Promise.all(
    projects.map(async (project) => {
      const result = await rpc("task.list", { projectId: project.id, states, pageSize });
      return (result.tasks || []).map((task) => ({ ...task, projectName: project.name }));
    })
  );
  const tasks = taskGroups.flat().sort((first, second) => new Date(second.updated_at).getTime() - new Date(first.updated_at).getTime());
  return { tasks, total: tasks.length };
}

async function readStdinIfAvailable() {
  if (process.stdin.isTTY) {
    return "";
  }

  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function loadJsonOption(options, jsonKey, fileKey, label) {
  const fileValue = options[fileKey] ? await fs.readFile(path.resolve(options[fileKey]), "utf8") : "";
  const raw = options[jsonKey] ?? fileValue;
  if (!raw) {
    return undefined;
  }

  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`${label} JSON is invalid`);
  }
}

async function resolveConnection() {
  const envPort = Number(process.env.WORKSHOP_DESKTOP_SERVER_PORT);
  const envToken = process.env.WORKSHOP_DESKTOP_SERVER_TOKEN?.trim();
  if (Number.isFinite(envPort) && envPort > 0 && envToken) {
    return { port: envPort, token: envToken, source: "env", path: null };
  }

  const connectionPaths = userDataDirs().map((dir) => path.join(dir, "app-server.json"));
  for (const connectionPath of connectionPaths) {
    let connection;
    try {
      connection = JSON.parse(await fs.readFile(connectionPath, "utf8"));
    } catch {
      continue;
    }

    if (!connection?.port || !connection?.token) {
      throw new Error(`Invalid Workshop Desktop app server connection file: ${connectionPath}`);
    }

    return { port: connection.port, token: connection.token, source: "file", path: connectionPath };
  }

  throw new Error(`Workshop Desktop app server is not running or cannot be found at ${connectionPaths.join(" or ")}`);
}

async function loadConnection() {
  const connection = await resolveConnection();
  return { port: connection.port, token: connection.token };
}

async function probeConnection(connection) {
  const startedAt = Date.now();
  let response;
  try {
    response = await fetch(`http://127.0.0.1:${connection.port}/rpc`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${connection.token}`
      },
      body: JSON.stringify({ method: "context.current", params: {} })
    });
  } catch {
    return {
      reachable: false,
      fullAccess: false,
      authScope: "unknown",
      latencyMs: Date.now() - startedAt,
      error: "Cannot reach Workshop Desktop app server."
    };
  }

  const payload = await response.json().catch(() => null);
  const error = payload?.error ? String(payload.error) : "";
  return {
    reachable: true,
    fullAccess: response.ok && payload?.ok === true,
    authScope: response.ok && payload?.ok === true ? "full" : error.includes("只允许 record.create") ? "restricted" : "unknown",
    latencyMs: Date.now() - startedAt,
    statusCode: response.status,
    error: response.ok && payload?.ok === true ? undefined : error || `HTTP ${response.status}`
  };
}

function printDoctor(result) {
  console.log(`Command: ${result.command}`);
  console.log(`Node: ${result.node}`);
  console.log(`Connection source: ${result.connection?.source || "missing"}`);
  if (result.connection?.path) {
    console.log(`Connection file: ${result.connection.path}`);
  }
  if (result.connection?.port) {
    console.log(`App server: 127.0.0.1:${result.connection.port}`);
  }
  console.log(`Reachable: ${result.appServer.reachable ? "yes" : "no"}`);
  console.log(`Auth scope: ${result.appServer.authScope || "unknown"}`);
  if (result.error || result.appServer.error) {
    console.log(`Error: ${result.error || result.appServer.error}`);
  }
}

async function doctor(options) {
  const result = {
    ok: false,
    command: commandName(),
    node: process.version,
    cwd: process.cwd(),
    userDataDirs: userDataDirs(),
    env: {
      hasServerPort: Boolean(process.env.WORKSHOP_DESKTOP_SERVER_PORT),
      hasServerToken: Boolean(process.env.WORKSHOP_DESKTOP_SERVER_TOKEN)
    },
    connection: null,
    appServer: {
      reachable: false,
      fullAccess: false,
      authScope: "unknown"
    }
  };

  try {
    const connection = await resolveConnection();
    result.connection = {
      source: connection.source,
      path: connection.path,
      port: connection.port,
      hasToken: Boolean(connection.token)
    };
    result.appServer = await probeConnection(connection);
    result.ok = result.appServer.reachable === true;
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error);
  }

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  printDoctor(result);
}

async function rpc(method, params) {
  const connection = await loadConnection();
  let response;
  try {
    response = await fetch(`http://127.0.0.1:${connection.port}/rpc`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${connection.token}`
      },
      body: JSON.stringify({ method, params })
    });
  } catch {
    throw new Error(
      `Cannot reach Workshop Desktop app server at 127.0.0.1:${connection.port}. ` +
        "The app may not be running, or its connection info is stale; restart Workshop Desktop and retry."
    );
  }
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.error || `Workshop Desktop app server returned ${response.status}`);
  }
  return payload.result;
}

async function createRecord(options) {
  const bodyFromFile = options["body-file"] ? await fs.readFile(path.resolve(options["body-file"]), "utf8") : "";
  const stdinBody = options.body || bodyFromFile ? "" : await readStdinIfAvailable();
  const result = await rpc("record.create", {
    title: options.title,
    bodyMarkdown: options.body ?? (bodyFromFile || stdinBody),
    scopeType: options.scope || (options["project-id"] ? "project" : "none"),
    projectId: numberOption(options["project-id"], "--project-id"),
    projectName: options["project-name"],
    taskId: numberOption(options["task-id"], "--task-id"),
    taskTitle: options["task-title"],
    open: options.open === true
  });

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`Created record ${result.record.id}: ${result.record.title}`);
}

async function listRecords(options) {
  const result = await rpc("record.list", {
    scopeType: options.scope,
    status: options.status,
    projectId: numberOption(options["project-id"], "--project-id"),
    taskId: numberOption(options["task-id"], "--task-id"),
    query: options.query,
    limit: numberOption(options.limit, "--limit"),
    includeBody: options["include-body"] === true
  });

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  printRecords(result.records || [], result.total);
}

async function getRecord(options) {
  const result = await rpc("record.get", {
    id: stringOption(options.id, "--id")
  });

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (!result.record) {
    throw new Error(`Record not found: ${options.id}`);
  }

  console.log(result.record.bodyMarkdown || `# ${result.record.title}`);
}

async function openRecord(options) {
  const result = await rpc("record.open", {
    id: stringOption(options.id, "--id")
  });

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`Opened record ${result.record.id}: ${result.record.title}`);
}

async function annotateRecords(options) {
  const annotationsFromFile = options["annotations-file"] ? await fs.readFile(path.resolve(options["annotations-file"]), "utf8") : "";
  const stdinAnnotations = options["annotations-json"] || annotationsFromFile ? "" : await readStdinIfAvailable();
  const raw = options["annotations-json"] ?? (annotationsFromFile || stdinAnnotations);
  if (!raw.trim()) {
    throw new Error("--annotations-json, --annotations-file, or stdin JSON is required");
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("annotations JSON is invalid");
  }
  const annotations = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.annotations) ? parsed.annotations : parsed?.id ? [parsed] : [];
  if (annotations.length === 0) {
    throw new Error("annotations JSON must contain an array, { annotations: [...] }, or one annotation object");
  }

  const result = await rpc("record.annotate", { annotations });
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`Annotated ${result.total ?? result.records?.length ?? annotations.length} records.`);
}

async function listProjects(options) {
  const result = await rpc("project.list", {
    organizationId: numberOption(options["organization-id"], "--organization-id"),
    pageSize: numberOption(options["page-size"], "--page-size")
  });

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  printProjects(result.projects || [], result.total);
}

async function listTasks(options) {
  const result = await collectTasks(options);

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  printTasks(result.tasks || [], result.total);
}

async function getTask(options) {
  const taskId = numberOption(options.id, "--id");
  if (taskId === undefined) {
    throw new Error("--id is required");
  }
  const result = await collectTasks(options, numberOption(options["page-size"], "--page-size") ?? 500);
  const task = (result.tasks || []).find((candidate) => candidate.id === taskId);

  if (options.json) {
    console.log(JSON.stringify({ task: task ?? null }, null, 2));
    return;
  }

  if (!task) {
    throw new Error(`Task not found: ${taskId}`);
  }

  console.log([task.id, `[${task.state}]`, `project:${task.project_id}`, formatDate(task.updated_at)].join("\t"));
  console.log(task.content || "");
}

async function getCurrentContext(options) {
  const result = await rpc("context.current", {});
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  const context = result.context || { kind: "none" };
  const parts = [
    context.kind || "none",
    context.surface ? `surface:${context.surface}` : "",
    context.projectId ? `project:${context.projectId}` : "",
    context.projectName || "",
    context.taskId ? `task:${context.taskId}` : "",
    context.taskTitle || "",
    context.recordId ? `record:${context.recordId}` : "",
    context.focusedAt ? formatDate(context.focusedAt) : "",
    context.stale ? "stale" : ""
  ].filter(Boolean);
  console.log(parts.join("\t") || "none");
}

async function openConfirmation(options) {
  const htmlFromFile = options["html-file"] ? await fs.readFile(path.resolve(options["html-file"]), "utf8") : "";
  const stdinHtml = options.html || htmlFromFile ? "" : await readStdinIfAvailable();
  const html = options.html ?? (htmlFromFile || stdinHtml);
  if (!html.trim()) {
    throw new Error("--html, --html-file, or stdin HTML is required");
  }

  const result = await rpc("confirmation.open", {
    title: options.title,
    html,
    width: numberOption(options.width, "--width"),
    height: numberOption(options.height, "--height")
  });

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(result.confirmed ? "Confirmed." : `Not confirmed: ${result.reason || "cancelled"}`);
}

async function requestConfirmation(options) {
  const htmlFromFile = options["html-file"] ? await fs.readFile(path.resolve(options["html-file"]), "utf8") : "";
  const stdinHtml = options.html || htmlFromFile ? "" : await readStdinIfAvailable();
  const html = options.html ?? (htmlFromFile || stdinHtml);
  if (!html.trim()) {
    throw new Error("--html, --html-file, or stdin HTML is required");
  }

  const action = await loadJsonOption(options, "action-json", "action-file", "action");
  const result = await rpc("confirmation.request", {
    title: options.title,
    html,
    width: numberOption(options.width, "--width"),
    height: numberOption(options.height, "--height"),
    ...(action ? { action } : {})
  });

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  const request = result.request;
  console.log(`Requested confirmation ${request.requestId}: ${request.status}${request.actionType ? ` (${request.actionType})` : ""}`);
}

async function getConfirmationStatus(options) {
  const result = await rpc("confirmation.status", {
    requestId: options["request-id"] || options.id,
    limit: numberOption(options.limit, "--limit")
  });

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (result.request !== undefined) {
    if (!result.request) {
      console.log("Confirmation request not found.");
      return;
    }
    const request = result.request;
    console.log(
      [
        request.requestId,
        `[${request.status}]`,
        request.actionType || "",
        request.title,
        formatDate(request.completedAt || request.createdAt),
        request.error || ""
      ]
        .filter(Boolean)
        .join("\t")
    );
    return;
  }

  const requests = result.requests || [];
  if (requests.length === 0) {
    console.log("No confirmation requests.");
    return;
  }
  for (const request of requests) {
    console.log(
      [
        request.requestId,
        `[${request.status}]`,
        request.actionType || "",
        truncate(request.title, 72),
        formatDate(request.completedAt || request.createdAt),
        request.error || ""
      ]
        .filter(Boolean)
        .join("\t")
    );
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const [resource, action] = options._;

  if (options.help === true || resource === "help") {
    console.log(usage());
    return;
  }

  if (resource === "doctor") {
    await doctor(options);
    return;
  }

  if (resource === "record" && action === "create") {
    await createRecord(options);
    return;
  }

  if (resource === "record" && action === "list") {
    await listRecords(options);
    return;
  }

  if (resource === "record" && action === "get") {
    await getRecord(options);
    return;
  }

  if (resource === "record" && action === "open") {
    await openRecord(options);
    return;
  }

  if (resource === "record" && action === "annotate") {
    await annotateRecords(options);
    return;
  }

  if (resource === "project" && action === "list") {
    await listProjects(options);
    return;
  }

  if (resource === "task" && action === "list") {
    await listTasks(options);
    return;
  }

  if (resource === "task" && action === "get") {
    await getTask(options);
    return;
  }

  if (resource === "context" && action === "current") {
    await getCurrentContext(options);
    return;
  }

  if (resource === "confirmation" && action === "open") {
    await openConfirmation(options);
    return;
  }

  if (resource === "confirmation" && action === "request") {
    await requestConfirmation(options);
    return;
  }

  if (resource === "confirmation" && action === "status") {
    await getConfirmationStatus(options);
    return;
  }

  console.log(usage());
  process.exitCode = 1;
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  if (process.argv.includes("--json")) {
    console.error(JSON.stringify({ ok: false, error: message }, null, 2));
  } else {
    console.error(message);
  }
  process.exitCode = 1;
});
