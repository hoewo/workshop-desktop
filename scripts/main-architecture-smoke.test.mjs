import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const require = createRequire(import.meta.url);
const { CodexAppServerClient } = require("../dist/main/codexAppServer.js");
const { buildCodexUserInput } = require("../dist/main/codexPrompt.js");
const { PersonalRecordStore } = require("../dist/main/recordStore.js");
const { WorkshopApiService } = require("../dist/main/workshopApiService.js");

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
    dailyRefreshEnabled: false,
    dailyRefreshTime: "09:00",
    stickyAlwaysOnTop: true,
    showDockIcon: true,
    globalShortcutEnabled: true,
    projectLocalDirectories: {},
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
  assert.match(mainBundle, /confirmation:confirm/);
  assert.match(mainBundle, /当前 token 只允许 record\.create，不能调用 confirmation\.open/);
  assert.match(confirmationPreload, /workshopConfirmation/);
  assert.match(confirmationPreload, /confirmation:cancel/);
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

    await store.save({
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

    await store.delete(first.id);
    assert.equal(await store.get(first.id), null);
    assert.equal((await store.listVisible()).length, 0);
  });
});

test("WorkshopApiService builds allowlisted task requests", async (t) => {
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
    pageSize: 999
  });

  assert.equal(response.ok, true);
  assert.equal(calls.length, 1);
  const url = new URL(calls[0].url);
  assert.equal(`${url.origin}${url.pathname}`, "https://api.example.test/workshop/v1/user/tasks");
  assert.equal(url.searchParams.get("project_id"), "42");
  assert.deepEqual(url.searchParams.getAll("state"), ["pending", "completed"]);
  assert.equal(url.searchParams.get("page_size"), "500");
  assert.equal(calls[0].options.method, "GET");
  assert.equal(calls[0].options.headers.Authorization, "Bearer access-token");
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

test("WorkshopApiService validates task creation before network calls", (t) => {
  const { calls, service } = mockWorkshopApi(t, () =>
    jsonResponse({
      success: true,
      code: "OK"
    })
  );

  assert.throws(() => service.createTask({ projectId: 42, content: "   " }), /任务内容不能为空/);
  assert.equal(calls.length, 0);
});
