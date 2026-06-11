#!/usr/bin/env node
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

function usage() {
  return `Usage:
  node scripts/workshop-desktop-cli.mjs record create --title "Title" [--body "Markdown"] [--open]
  node scripts/workshop-desktop-cli.mjs record create --title "Title" --body-file ./note.md --project-id 98 --project-name workshop-desktop --open

Options:
  --title <text>          Record title. If body has no markdown title, the title is prepended.
  --body <markdown>       Record markdown body.
  --body-file <path>      Read markdown body from a file.
  --scope <none|project|task>
  --project-id <number>
  --project-name <text>
  --task-id <number>
  --task-title <text>
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
    if (key === "open" || key === "json") {
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

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const [resource, action] = options._;

  if (resource === "record" && action === "create") {
    await createRecord(options);
    return;
  }

  console.log(usage());
  process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
