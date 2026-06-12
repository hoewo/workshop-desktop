#!/usr/bin/env node
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

function usage() {
  return `Usage:
  node scripts/workshop-desktop-cli.mjs record create --title "Title" [--body "Markdown"] [--open]
  node scripts/workshop-desktop-cli.mjs record create --title "Title" --body-file ./note.md --project-id 98 --project-name workshop-desktop --open
  node scripts/workshop-desktop-cli.mjs record list [--scope project] [--project-id 98] [--query "keyword"]
  node scripts/workshop-desktop-cli.mjs record get --id <record-id>
  node scripts/workshop-desktop-cli.mjs project list
  node scripts/workshop-desktop-cli.mjs task list [--project-id 98] [--state pending,completed]
  node scripts/workshop-desktop-cli.mjs task get --id <task-id> [--project-id 98]

Options:
  --title <text>          Record title. If body has no markdown title, the title is prepended.
  --body <markdown>       Record markdown body.
  --body-file <path>      Read markdown body from a file.
  --scope <none|project|task>
  --status <active|completed|promoted>
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
  --include-body          Include markdown bodies when listing records.
  --open                  Ask the desktop app to open the created record.
  --json                  Print the raw JSON response.
`;
}

function userDataDir() {
  const home = os.homedir();
  if (process.env.WORKSHOP_DESKTOP_USER_DATA) {
    return process.env.WORKSHOP_DESKTOP_USER_DATA;
  }

  if (process.platform === "darwin") {
    return path.join(home, "Library", "Application Support", "workshop-desktop");
  }
  if (process.platform === "win32") {
    return path.join(process.env.APPDATA || path.join(home, "AppData", "Roaming"), "workshop-desktop");
  }
  return path.join(process.env.XDG_CONFIG_HOME || path.join(home, ".config"), "workshop-desktop");
}

function parseArgs(argv) {
  const result = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) {
      result._.push(arg);
      continue;
    }

    const key = arg.slice(2);
    if (key === "open" || key === "json" || key === "include-body") {
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

async function loadConnection() {
  const envPort = Number(process.env.WORKSHOP_DESKTOP_SERVER_PORT);
  const envToken = process.env.WORKSHOP_DESKTOP_SERVER_TOKEN?.trim();
  if (Number.isFinite(envPort) && envPort > 0 && envToken) {
    return { port: envPort, token: envToken };
  }

  const connectionPath = path.join(userDataDir(), "app-server.json");
  let connection;
  try {
    connection = JSON.parse(await fs.readFile(connectionPath, "utf8"));
  } catch {
    throw new Error(`Workshop Desktop app server is not running or cannot be found at ${connectionPath}`);
  }

  if (!connection?.port || !connection?.token) {
    throw new Error(`Invalid Workshop Desktop app server connection file: ${connectionPath}`);
  }

  return connection;
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

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const [resource, action] = options._;

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

  console.log(usage());
  process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
