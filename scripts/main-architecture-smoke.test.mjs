import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";

const require = createRequire(import.meta.url);
const { CodexAppServerClient } = require("../dist/main/codexAppServer.js");
const { buildCodexUserInput } = require("../dist/main/codexPrompt.js");
const {
  getLocalProjectDirectoryForWorkshopProject,
  sanitizeLocalProjects
} = require("../dist/main/localProjectMigration.js");
const { normalizeCodexFailureMessage, summarizeCodexFailureForDisplay } = require("../dist/shared/codexErrors.js");
const { PersonalRecordStore } = require("../dist/main/recordStore.js");
const { WorkshopApiService } = require("../dist/main/workshopApiService.js");
const execFileAsync = promisify(execFile);

function baseConfig(overrides = {}) {
  return {
    baseUrl: "https://api.example.test",
    serviceName: "workshop",
    authMode: "nebula",
    accessToken: "access-token",
    refreshToken: "refresh-token",
    tokenType: "Bearer",
    accessTokenExpiresAt: Date.now() + 60 * 60_000,
    refreshTokenExpiresAt: Date.now() + 24 * 60 * 60_000,
    userId: "",
    username: "",
    appId: "workshop-desktop",
    sessionId: "",
    stickyAlwaysOnTop: true,
    showDockIcon: true,
    globalShortcutEnabled: true,
    lastSeenManualRevision: "",
    lastSeenSkillInstallPromptVersion: "",
    projectLocalDirectories: {},
    localProjects: [],
    ...overrides
  };
}

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body)
  };
}

function mockWorkshopApi(t, fetchHandler, configOverrides = {}) {
  const originalFetch = globalThis.fetch;
  const calls = [];
  const saves = [];
  let config = baseConfig(configOverrides);

  globalThis.fetch = async (url, options = {}) => {
    const call = {
      url: String(url),
      options
    };
    calls.push(call);
    return fetchHandler(call);
  };

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const service = new WorkshopApiService({
    readConfig: async () => config,
    saveConfig: async (next) => {
      config = { ...config, ...next };
      saves.push(config);
      return config;
    }
  });

  return {
    calls,
    saves,
    service,
    getConfig: () => config
  };
}

function createCodexClientForNotificationTest() {
  return new CodexAppServerClient({
    resolveExecutable: async () => "codex",
    buildEnvironment: () => ({}),
    clientVersion: "test",
    log: () => undefined
  });
}

test("buildCodexUserInput sends body without prepending the title", () => {
  assert.equal(
    buildCodexUserInput({
      title: "Short title",
      bodyMarkdown: "Full task or record body"
    }),
    "Full task or record body"
  );
  assert.equal(buildCodexUserInput({ title: "Short title", bodyMarkdown: "  \n  " }), "Short title");
  assert.equal(buildCodexUserInput({ title: "Short title" }), "Short title");
});

test("temporary confirmation bridge stays on the app-server boundary", async () => {
  const [mainBundle, confirmationPreload] = await Promise.all([
    readFile(path.join(process.cwd(), "dist/main/main.js"), "utf8"),
    readFile(path.join(process.cwd(), "dist/main/confirmationPreload.js"), "utf8")
  ]);

  assert.match(mainBundle, /confirmation\.open/);
  assert.match(mainBundle, /confirmation\.request/);
  assert.match(mainBundle, /confirmation\.status/);
  assert.match(mainBundle, /context\.current/);
  assert.match(mainBundle, /record\.open/);
  assert.match(mainBundle, /record\.annotate/);
  assert.match(mainBundle, /record\.updateBody/);
  assert.match(mainBundle, /task\.creationContext/);
  assert.match(mainBundle, /task\.create\.request/);
  assert.match(mainBundle, /task-created/);
  assert.match(mainBundle, /assertAgentProjectScope/);
  assert.match(mainBundle, /confirmation-requests/);
  assert.match(mainBundle, /confirmation:confirm/);
  assert.match(mainBundle, /当前受限 token 无权调用 confirmation\.open/);
  assert.match(mainBundle, /当前受限 token 无权调用 confirmation\.request/);
  assert.match(mainBundle, /当前受限 token 无权调用 context\.current/);
  assert.match(mainBundle, /当前受限 token 无权调用 record\.open/);
  assert.match(mainBundle, /当前受限 token 无权调用 record\.annotate/);
  assert.match(confirmationPreload, /workshopConfirmation/);
  assert.match(confirmationPreload, /confirmation:cancel/);
});

test("Workshop CLI lists tasks across projects without concurrent request bursts", async () => {
  let activeTaskRequests = 0;
  let maxActiveTaskRequests = 0;
  const server = createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => {
      const rpc = JSON.parse(body);
      if (rpc.method === "project.list") {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(
          JSON.stringify({
            ok: true,
            result: {
              projects: [
                { id: 1, name: "First" },
                { id: 2, name: "Second" },
                { id: 3, name: "Third" }
              ]
            }
          })
        );
        return;
      }

      activeTaskRequests += 1;
      maxActiveTaskRequests = Math.max(maxActiveTaskRequests, activeTaskRequests);
      setTimeout(() => {
        activeTaskRequests -= 1;
        response.writeHead(200, { "content-type": "application/json" });
        response.end(
          JSON.stringify({
            ok: true,
            result: {
              tasks: [
                {
                  id: rpc.params.projectId,
                  project_id: rpc.params.projectId,
                  state: "pending",
                  content: `Task ${rpc.params.projectId}`,
                  updated_at: "2026-09-03T00:00:00Z"
                }
              ],
              total: 1
            }
          })
        );
      }, 15);
    });
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });

  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const { stdout } = await execFileAsync(process.execPath, ["scripts/workshop-desktop-cli.mjs", "task", "list", "--json"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        WORKSHOP_DESKTOP_SERVER_PORT: String(address.port),
        WORKSHOP_DESKTOP_SERVER_TOKEN: "test-token"
      }
    });
    assert.equal(maxActiveTaskRequests, 1);
    assert.deepEqual(
      JSON.parse(stdout).tasks.map((task) => task.id),
      [1, 2, 3]
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("Workshop CLI resolves task assignee and optional tags before requesting confirmation", async () => {
  const calls = [];
  const server = createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => {
      const rpc = JSON.parse(body);
      calls.push({ authorization: request.headers.authorization, rpc });
      const result =
        rpc.method === "task.creationContext"
          ? {
              project: {
                id: 98,
                name: "workshop-desktop",
                members: [{ user_id: 7, username: "Ada", role: "member", is_me: true }]
              },
              currentUserId: 7,
              tags: [
                { id: 3, project_id: 98, name: "Bug", created_at: "", updated_at: "" },
                { id: 5, project_id: 98, name: "需求", created_at: "", updated_at: "" }
              ]
            }
          : { request: { requestId: "request-1", status: "pending" }, proposal: rpc.params };
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ ok: true, result }));
    });
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });

  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const { stdout } = await execFileAsync(
      process.execPath,
      [
        "scripts/workshop-desktop-cli.mjs",
        "task",
        "create",
        "修复登录",
        "--project-id",
        "98",
        "--assignee",
        "me",
        "--tags",
        "Bug,需求",
        "--json"
      ],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          WORKSHOP_DESKTOP_SERVER_PORT: String(address.port),
          WORKSHOP_DESKTOP_SERVER_TOKEN: "test-token"
        }
      }
    );

    assert.equal(calls.length, 2);
    assert.equal(calls[0].authorization, "Bearer test-token");
    assert.equal(calls[0].rpc.method, "task.creationContext");
    assert.deepEqual(calls[1].rpc, {
      method: "task.create.request",
      params: {
        projectId: 98,
        content: "修复登录",
        executorId: 7,
        tagIds: [3, 5],
        state: "pending"
      }
    });
    assert.equal(JSON.parse(stdout).request.requestId, "request-1");

    const { stdout: untaggedStdout } = await execFileAsync(
      process.execPath,
      [
        "scripts/workshop-desktop-cli.mjs",
        "task",
        "create",
        "整理验收反馈",
        "--project-id",
        "98",
        "--assignee",
        "me",
        "--json"
      ],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          WORKSHOP_DESKTOP_SERVER_PORT: String(address.port),
          WORKSHOP_DESKTOP_SERVER_TOKEN: "test-token"
        }
      }
    );
    assert.equal(calls.length, 4);
    assert.equal(calls[2].rpc.method, "task.creationContext");
    assert.deepEqual(calls[3].rpc, {
      method: "task.create.request",
      params: {
        projectId: 98,
        content: "整理验收反馈",
        executorId: 7,
        tagIds: [],
        state: "pending"
      }
    });
    assert.equal(JSON.parse(untaggedStdout).request.requestId, "request-1");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("packaged app carries and auto-installs the Workshop CLI shim", async () => {
  const [mainBundle, cliInstallerBundle, skillInstallerBundle, packageJsonRaw, bundledSkillRaw, bundledSkillMetadataRaw] = await Promise.all([
    readFile(path.join(process.cwd(), "dist/main/main.js"), "utf8"),
    readFile(path.join(process.cwd(), "dist/main/cliInstaller.js"), "utf8"),
    readFile(path.join(process.cwd(), "dist/main/skillInstaller.js"), "utf8"),
    readFile(path.join(process.cwd(), "package.json"), "utf8"),
    readFile(path.join(process.cwd(), "resources/skills/workshop-codex-collaboration/SKILL.md"), "utf8"),
    readFile(path.join(process.cwd(), "resources/skills/workshop-codex-collaboration/agents/openai.yaml"), "utf8")
  ]);
  const packageJson = JSON.parse(packageJsonRaw);

  assert.match(mainBundle, /ensureWorkshopCliInstalled/);
  assert.match(mainBundle, /workshop-desktop-cli\.mjs/);
  assert.match(mainBundle, /workshopSkill:getStatus/);
  assert.match(mainBundle, /workshopSkill:install/);
  assert.match(mainBundle, /workshop-codex-collaboration/);
  assert.match(cliInstallerBundle, /ELECTRON_RUN_AS_NODE/);
  assert.match(cliInstallerBundle, /workshop-desktop/);
  assert.match(cliInstallerBundle, /\.rm\(commandPath/);
  assert.match(skillInstallerBundle, /WORKSHOP_CODEX_SKILL_NAME/);
  assert.match(skillInstallerBundle, /backup-/);
  assert.match(bundledSkillRaw, /Workshop \+ Codex 跨项目协作/);
  assert.match(bundledSkillMetadataRaw, /安装 Workshop 并管理跨 repo 协作/);
  assert.deepEqual(packageJson.bin, {
    workshop: "scripts/workshop-desktop-cli.mjs",
    "workshop-desktop": "scripts/workshop-desktop-cli.mjs"
  });
  assert.equal(
    packageJson.build.extraResources.some(
      (resource) => resource.from === "scripts/workshop-desktop-cli.mjs" && resource.to === "cli/workshop-desktop-cli.mjs"
    ),
    true
  );
  assert.equal(
    packageJson.build.extraResources.some(
      (resource) =>
        resource.from === "resources/skills/workshop-codex-collaboration" &&
        resource.to === "skills/workshop-codex-collaboration"
    ),
    true
  );
});

test("app startup opens the workbench home regardless of login state", async () => {
  const mainBundle = await readFile(path.join(process.cwd(), "dist/main/main.js"), "utf8");

  assert.match(mainBundle, /setTimeout\(\(\) => showHomeWindow\(\), 400\)/);
  assert.doesNotMatch(mainBundle, /if \(!hasValidLogin\(config\)\)/);
});

test("note window arrangement stays inside the current work context", async () => {
  const [mainSource, appSource, workspaceSource] = await Promise.all([
    readFile(path.join(process.cwd(), "src/main/main.ts"), "utf8"),
    readFile(path.join(process.cwd(), "src/renderer/App.tsx"), "utf8"),
    readFile(path.join(process.cwd(), "src/renderer/components/surfaces/ProjectWorkspaceSurface.tsx"), "utf8")
  ]);

  assert.match(mainSource, /local-project:\$\{normalizedLocalProjectId\}/);
  assert.match(mainSource, /items\.filter\(\(item\) => item\.groupKey === sourceItem\.groupKey\)/);
  assert.doesNotMatch(mainSource, /item\.column === "personal-record" \|\| item\.projectId === sourceItem\.projectId/);
  assert.match(mainSource, /protectedItems\.length > 0/);
  assert.match(mainSource, /win\.on\("will-move"/);
  assert.match(mainSource, /win\.on\("will-resize"/);
  assert.match(mainSource, /positionNoteWindowNearSource/);
  assert.match(appSource, /workspaceSearchCollapseSnapshotRef/);
  assert.doesNotMatch(appSource, /setWorkspaceTasksCollapsed\(true\)/);
  assert.doesNotMatch(appSource, /setWorkspaceRecordsCollapsed\(true\)/);
  assert.match(workspaceSource, /整理当前项目窗口/);
  assert.match(workspaceSource, /PanelsTopLeft/);
});

test("CodexAppServerClient handles streaming deltas and terminal statuses", () => {
  const client = createCodexClientForNotificationTest();
  const messages = [];
  const completions = [];
  const events = {
    onAgentMessage: (text) => messages.push(text),
    onCompleted: (status, detail) => completions.push({ status, detail })
  };

  client.activeTurns.set("thread-1", { events, agentMessageDeltas: new Map() });
  client.handleNotification("item/agentMessage/delta", {
    threadId: "thread-1",
    turnId: "turn-1",
    itemId: "item-1",
    delta: "hel"
  });
  client.handleNotification("item/agentMessage/delta", {
    threadId: "thread-1",
    turnId: "turn-1",
    itemId: "item-1",
    delta: "lo"
  });
  client.handleNotification("item/completed", {
    threadId: "thread-1",
    turnId: "turn-1",
    item: { type: "agentMessage", id: "item-1", text: "hello final" }
  });
  client.handleNotification("turn/completed", {
    threadId: "thread-1",
    turn: { status: "completed", error: null }
  });

  assert.deepEqual(messages, ["hel", "hello", "hello final"]);
  assert.deepEqual(completions, [{ status: "completed", detail: undefined }]);
  assert.equal(client.activeTurns.has("thread-1"), false);

  client.activeTurns.set("thread-2", { events, agentMessageDeltas: new Map() });
  client.handleNotification("turn/completed", {
    threadId: "thread-2",
    turn: { status: "interrupted", error: { message: "user stopped" } }
  });

  assert.deepEqual(completions.at(-1), { status: "interrupted", detail: "user stopped" });
  assert.equal(client.activeTurns.has("thread-2"), false);
});

test("Codex rate-limit errors are normalized for users", () => {
  assert.equal(
    normalizeCodexFailureMessage("turn/start: RATE_LIMIT_EXCEEDED"),
    "Codex 请求被限流（RATE_LIMIT_EXCEEDED），请稍后再试。"
  );
  assert.equal(summarizeCodexFailureForDisplay("HTTP 429 Too Many Requests"), "限流，稍后重试");
  assert.equal(normalizeCodexFailureMessage("codex app-server 未运行"), "codex app-server 未运行");
});

test("local project migration merges legacy Workshop directory bindings by directory", () => {
  const directory = path.join(os.tmpdir(), "workshop-desktop");
  const projects = sanitizeLocalProjects(
    [
      {
        id: "local-workshop",
        name: "workshop-desktop",
        localDirectory: directory,
        createdAt: "2026-06-17T00:00:00.000Z",
        updatedAt: "2026-06-17T00:00:00.000Z"
      }
    ],
    { 98: directory }
  );

  assert.equal(projects.length, 1);
  assert.equal(projects[0].id, "local-workshop");
  assert.equal(projects[0].linkedWorkshopProjectId, 98);
  assert.equal(
    getLocalProjectDirectoryForWorkshopProject({ localProjects: projects, projectLocalDirectories: { 98: directory } }, 98),
    directory
  );
});

test("local project migration creates one legacy project when no local match exists", () => {
  const directory = path.join(os.tmpdir(), "legacy-workshop-98");
  const projects = sanitizeLocalProjects([], { 98: directory });

  assert.equal(projects.length, 1);
  assert.equal(projects[0].id, "legacy-workshop-98");
  assert.equal(projects[0].localDirectory, directory);
  assert.equal(projects[0].linkedWorkshopProjectId, 98);
});

async function withTempUserData(fn) {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "workshop-record-store-"));
  try {
    return await fn(tempDir);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

test("PersonalRecordStore serializes concurrent record writes", async () => {
  await withTempUserData(async (userDataPath) => {
    const store = new PersonalRecordStore(() => userDataPath);
    const [first, second] = await Promise.all([
      store.save({
        bodyMarkdown: "# First",
        scopeType: "task",
        projectId: 98,
        projectName: "workshop-desktop",
        taskId: 1,
        taskTitle: "First task",
        origin: "human"
      }),
      store.save({
        bodyMarkdown: "# Second",
        scopeType: "project",
        projectId: 98,
        projectName: "workshop-desktop",
        origin: "agent"
      })
    ]);

    const records = await store.listVisible();
    assert.equal(records.length, 2);
    assert.deepEqual(new Set(records.map((record) => record.id)), new Set([first.id, second.id]));

    const recordsDir = path.join(userDataPath, "personal-records");
    const files = await readdir(recordsDir);
    assert.equal(files.some((fileName) => fileName.endsWith(".tmp")), false);

    const index = JSON.parse(await readFile(path.join(recordsDir, "index.json"), "utf8"));
    assert.equal(index.records.length, 2);
  });
});

test("PersonalRecordStore keeps one visible record per task and preserves origin", async () => {
  await withTempUserData(async (userDataPath) => {
    const store = new PersonalRecordStore(() => userDataPath);
    const first = await store.save({
      bodyMarkdown: "# Original",
      scopeType: "task",
      projectId: 98,
      projectName: "workshop-desktop",
      taskId: 7,
      taskTitle: "Task",
      origin: "human"
    });
    const second = await store.save({
      bodyMarkdown: "# Updated",
      scopeType: "task",
      projectId: 98,
      projectName: "workshop-desktop",
      taskId: 7,
      taskTitle: "Task",
      origin: "agent"
    });

    assert.equal(second.id, first.id);
    assert.equal(second.origin, "human");
    assert.equal(second.title, "Updated");

    const loaded = await store.get(first.id);
    assert.equal(loaded?.bodyMarkdown, "# Updated");
    assert.equal((await store.listVisible()).length, 1);

    await store.save({
      id: first.id,
      bodyMarkdown: "# Completed",
      scopeType: "task",
      status: "completed",
      projectId: 98,
      projectName: "workshop-desktop",
      taskId: 7,
      taskTitle: "Task",
      origin: "agent"
    });
    assert.equal((await store.listVisible()).length, 1);

    await store.save({
      id: first.id,
      bodyMarkdown: "# Promoted",
      scopeType: "task",
      status: "promoted",
      projectId: 98,
      projectName: "workshop-desktop",
      taskId: 7,
      taskTitle: "Task",
      promotedTaskId: 70,
      origin: "agent"
    });
    assert.equal((await store.listVisible()).length, 0);
    const promoted = await store.get(first.id);
    assert.equal(promoted?.status, "promoted");
    assert.equal(promoted?.promotedTaskId, 70);

    const fresh = await store.save({
      bodyMarkdown: "# Fresh note",
      scopeType: "task",
      projectId: 98,
      projectName: "workshop-desktop",
      taskId: 7,
      taskTitle: "Task",
      origin: "agent"
    });
    assert.notEqual(fresh.id, first.id);
    assert.equal((await store.listVisible()).length, 1);

    const archived = await store.save({
      id: fresh.id,
      bodyMarkdown: "# Archived",
      scopeType: "task",
      status: "archived",
      projectId: 98,
      projectName: "workshop-desktop",
      taskId: 7,
      taskTitle: "Task",
      origin: "agent"
    });
    assert.equal((await store.listVisible()).length, 0);

    const annotated = await store.annotate({
      id: fresh.id,
      annotation: {
        namespace: "codex.archive整理",
        intent: "execution_summary",
        retention: "archived",
        resolution: "obsolete",
        tags: ["bugfix", "bugfix", "verification", "x".repeat(51)],
        relatedRecordIds: [first.id, "bad id!"],
        relatedTaskId: 7,
        confidence: 0.91
      }
    });
    assert.equal(annotated.updatedAt, archived.updatedAt);
    assert.equal(annotated.annotations?.[0]?.namespace, "codex.archive整理");
    assert.equal(annotated.annotations?.[0]?.intent, "execution_summary");
    assert.equal(annotated.annotations?.[0]?.retention, "archived");
    assert.equal(annotated.annotations?.[0]?.resolution, "obsolete");
    assert.deepEqual(annotated.annotations?.[0]?.tags, ["bugfix", "verification"]);
    assert.deepEqual(annotated.annotations?.[0]?.relatedRecordIds, [first.id]);
    assert.equal(annotated.annotations?.[0]?.relatedTaskId, 7);
    assert.equal(annotated.annotations?.[0]?.confidence, 0.91);
    assert.equal((await store.listVisible()).length, 0);
    const annotatedBody = await store.get(fresh.id);
    assert.equal(annotatedBody?.bodyMarkdown, "# Archived");
    assert.equal(annotatedBody?.annotations?.[0]?.intent, "execution_summary");

    await store.delete(first.id);
    assert.equal(await store.get(first.id), null);
    assert.equal((await store.listVisible()).length, 0);
  });
});

test("WorkshopApiService builds allowlisted task and tag requests", async (t) => {
  const { calls, service } = mockWorkshopApi(t, () =>
    jsonResponse({
      success: true,
      code: "OK",
      data: {
        tasks: []
      }
    })
  );

  const response = await service.listTasks({
    projectId: 42,
    states: ["pending", "completed"],
    query: "login",
    executorIds: [7],
    tagIds: [3, 5],
    pageSize: 999
  });

  assert.equal(response.ok, true);
  assert.equal(calls.length, 1);
  const url = new URL(calls[0].url);
  assert.equal(`${url.origin}${url.pathname}`, "https://api.example.test/workshop/v1/user/tasks");
  assert.equal(url.searchParams.get("project_id"), "42");
  assert.deepEqual(url.searchParams.getAll("state"), ["pending", "completed"]);
  assert.equal(url.searchParams.get("search_key"), "login");
  assert.deepEqual(url.searchParams.getAll("executor_id"), ["7"]);
  assert.deepEqual(url.searchParams.getAll("tags"), ["3", "5"]);
  assert.equal(url.searchParams.get("page_size"), "500");
  assert.equal(calls[0].options.method, "GET");
  assert.equal(calls[0].options.headers.Authorization, "Bearer access-token");

  await service.listProjectTags({ projectId: 42, pageSize: 120 });
  const tagUrl = new URL(calls[1].url);
  assert.equal(`${tagUrl.origin}${tagUrl.pathname}`, "https://api.example.test/workshop/v1/user/projects/42/tags");
  assert.equal(tagUrl.searchParams.get("page_size"), "120");
});

test("WorkshopApiService refreshes Nebula token before user requests", async (t) => {
  const { calls, saves, service } = mockWorkshopApi(
    t,
    (call) => {
      const url = new URL(call.url);
      if (url.pathname === "/auth-server/v1/public/refresh_token") {
        return jsonResponse({
          success: true,
          code: "OK",
          data: {
            access_token: "fresh-access",
            refresh_token: "fresh-refresh",
            expires_in: 3600,
            refresh_expires_in: 7200
          }
        });
      }

      return jsonResponse({
        success: true,
        code: "OK",
        data: {
          user: {
            username: "Ada"
          }
        }
      });
    },
    {
      accessTokenExpiresAt: Date.now() + 1000
    }
  );

  const response = await service.getCurrentUser();

  assert.equal(response.ok, true);
  assert.equal(calls.length, 2);
  assert.equal(new URL(calls[0].url).pathname, "/auth-server/v1/public/refresh_token");
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    refresh_token: "refresh-token"
  });
  assert.equal(new URL(calls[1].url).pathname, "/workshop/v1/user/users");
  assert.equal(calls[1].options.headers.Authorization, "Bearer fresh-access");
  assert.equal(saves[0].accessToken, "fresh-access");
  assert.equal(saves[0].refreshToken, "fresh-refresh");
});

test("WorkshopApiService validates and serializes task creation", async (t) => {
  const { calls, service } = mockWorkshopApi(t, () =>
    jsonResponse({
      success: true,
      code: "OK"
    })
  );

  assert.throws(() => service.createTask({ projectId: 42, content: "   " }), /任务内容不能为空/);
  assert.throws(
    () => service.createTask({ projectId: 42, content: "Fix login", executorId: 0, tagIds: [3] }),
    /负责人 无效/
  );
  assert.equal(calls.length, 0);

  const untaggedResponse = await service.createTask({
    projectId: 42,
    content: " Fix login without tags ",
    executorId: 7,
    tagIds: []
  });
  assert.equal(untaggedResponse.ok, true);
  assert.equal(calls.length, 1);
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    project_id: 42,
    content: "Fix login without tags",
    executor_id: 7,
    state: "pending"
  });

  const response = await service.createTask({
    projectId: 42,
    content: " Fix login ",
    executorId: 7,
    tagIds: [3, 5, 3],
    state: "pending"
  });
  assert.equal(response.ok, true);
  assert.equal(calls.length, 2);
  assert.deepEqual(JSON.parse(calls[1].options.body), {
    project_id: 42,
    content: "Fix login",
    executor_id: 7,
    tags: "3,5",
    state: "pending"
  });
});
