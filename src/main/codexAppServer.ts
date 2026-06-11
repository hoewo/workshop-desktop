import { spawn, type ChildProcess } from "node:child_process";

// codex app-server JSON-RPC 客户端（JSONL over stdio）。
// 协议参考 `codex app-server generate-ts` 输出；当前按 CLI 0.133.0 验证。
// 一次发送 = 一个 thread + 一个 turn；thread 落盘在 ~/.codex/sessions，
// cwd 必须使用项目绑定目录，否则线程不会出现在 Codex app 对应项目下。

interface JsonRpcMessage {
  jsonrpc?: string;
  id?: number | string;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { code?: number; message?: string };
}

export interface CodexTurnEvents {
  onAgentMessage: (text: string) => void;
  onCompleted: (status: "completed" | "failed", detail?: string) => void;
}

export interface CodexAppServerOptions {
  resolveExecutable: () => Promise<string>;
  buildEnvironment: () => NodeJS.ProcessEnv;
  clientVersion: string;
  log: (message: string) => void;
}

interface PendingRequest {
  method: string;
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
}

const REQUEST_TIMEOUT_MS = 30_000;

export class CodexAppServerClient {
  private child: ChildProcess | null = null;
  private startup: Promise<void> | null = null;
  private nextId = 1;
  private buffer = "";
  private pending = new Map<number, PendingRequest>();
  private activeTurns = new Map<string, CodexTurnEvents>();

  constructor(private readonly options: CodexAppServerOptions) {}

  async startTurn(input: { cwd: string; prompt: string; events: CodexTurnEvents }): Promise<{ threadId: string; turnId: string }> {
    await this.ensureStarted();

    const thread = (await this.request("thread/start", {
      cwd: input.cwd,
      approvalPolicy: "never",
      sandbox: "workspace-write",
      threadSource: "user"
    })) as { thread?: { id?: string } };
    const threadId = thread?.thread?.id;
    if (!threadId) {
      throw new Error("codex app-server 未返回 threadId");
    }

    this.activeTurns.set(threadId, input.events);
    try {
      const turn = (await this.request("turn/start", {
        threadId,
        input: [{ type: "text", text: input.prompt, text_elements: [] }]
      })) as { turn?: { id?: string } };
      return { threadId, turnId: turn?.turn?.id ?? "" };
    } catch (error) {
      this.activeTurns.delete(threadId);
      throw error;
    }
  }

  stop() {
    this.child?.kill();
    this.resetState("codex app-server 已停止");
  }

  private async ensureStarted() {
    if (this.child && !this.child.killed) {
      await this.startup;
      return;
    }

    this.startup = this.spawnAndInitialize();
    await this.startup;
  }

  private async spawnAndInitialize() {
    const executable = await this.options.resolveExecutable();
    const child = spawn(executable, ["app-server"], {
      env: this.options.buildEnvironment(),
      stdio: ["pipe", "pipe", "ignore"]
    });
    this.child = child;
    this.buffer = "";

    child.stdout?.on("data", (data: Buffer) => this.consume(data.toString()));
    child.once("error", (error) => {
      this.options.log(`codex app-server 启动失败：${error.message}`);
      this.resetState(`codex app-server 启动失败：${error.message}`);
    });
    child.once("exit", (code) => {
      this.options.log(`codex app-server 进程退出，code=${String(code)}`);
      this.resetState("codex app-server 进程退出");
    });

    await new Promise<void>((resolve, reject) => {
      child.once("spawn", () => resolve());
      child.once("error", (error) => reject(error));
    });

    await this.request("initialize", {
      clientInfo: { name: "workshop-desktop", title: "Workshop Desktop", version: this.options.clientVersion },
      capabilities: null
    });
    this.notify("initialized");
  }

  private resetState(reason: string) {
    const pending = [...this.pending.values()];
    this.pending.clear();
    for (const entry of pending) {
      entry.reject(new Error(`${entry.method}: ${reason}`));
    }

    const turns = [...this.activeTurns.values()];
    this.activeTurns.clear();
    for (const events of turns) {
      events.onCompleted("failed", reason);
    }

    this.child = null;
    this.startup = null;
  }

  private consume(chunk: string) {
    this.buffer += chunk;
    let index;
    while ((index = this.buffer.indexOf("\n")) >= 0) {
      const line = this.buffer.slice(0, index).trim();
      this.buffer = this.buffer.slice(index + 1);
      if (!line) {
        continue;
      }
      try {
        this.dispatch(JSON.parse(line) as JsonRpcMessage);
      } catch {
        this.options.log(`codex app-server 非 JSON 输出：${line.slice(0, 160)}`);
      }
    }
  }

  private dispatch(message: JsonRpcMessage) {
    if (message.id !== undefined && (message.result !== undefined || message.error !== undefined)) {
      const entry = this.pending.get(Number(message.id));
      if (entry) {
        this.pending.delete(Number(message.id));
        if (message.error) {
          entry.reject(new Error(`${entry.method}: ${message.error.message ?? JSON.stringify(message.error)}`));
        } else {
          entry.resolve(message.result);
        }
      }
      return;
    }

    if (message.id !== undefined && message.method) {
      // server -> client 请求（审批等）。approvalPolicy never 下不应出现；兜底拒绝防止 turn 挂起。
      this.options.log(`已自动拒绝 codex 审批请求：${message.method}`);
      this.send({ jsonrpc: "2.0", id: message.id, error: { code: -32601, message: "workshop-desktop: approvals are not supported" } });
      const threadId = this.threadIdOf(message.params);
      if (threadId) {
        this.activeTurns.get(threadId)?.onAgentMessage(`已自动拒绝审批请求：${message.method}`);
      }
      return;
    }

    if (message.method) {
      this.handleNotification(message.method, message.params);
    }
  }

  private handleNotification(method: string, params: unknown) {
    const threadId = this.threadIdOf(params);
    if (!threadId) {
      return;
    }
    const events = this.activeTurns.get(threadId);
    if (!events) {
      return;
    }

    if (method === "item/completed") {
      const item = (params as { item?: { type?: string; text?: string } }).item;
      if (item?.type === "agentMessage" && typeof item.text === "string" && item.text.trim()) {
        events.onAgentMessage(item.text.trim());
      }
      return;
    }

    if (method === "turn/completed") {
      const turn = (params as { turn?: { status?: string; error?: { message?: string } | null } }).turn;
      this.activeTurns.delete(threadId);
      if (turn?.status === "completed") {
        events.onCompleted("completed");
      } else {
        events.onCompleted("failed", turn?.error?.message ?? `turn 状态：${turn?.status ?? "unknown"}`);
      }
      return;
    }

    if (method === "error") {
      const detail = (params as { error?: { message?: string }; message?: string });
      this.activeTurns.delete(threadId);
      events.onCompleted("failed", detail.error?.message ?? detail.message ?? "codex 返回错误");
    }
  }

  private threadIdOf(params: unknown): string | null {
    if (!params || typeof params !== "object") {
      return null;
    }
    const threadId = (params as { threadId?: unknown }).threadId;
    return typeof threadId === "string" ? threadId : null;
  }

  private request(method: string, params?: unknown) {
    const child = this.child;
    if (!child || child.killed) {
      return Promise.reject(new Error(`${method}: codex app-server 未运行`));
    }

    const id = this.nextId++;
    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.pending.delete(id)) {
          reject(new Error(`${method}: codex app-server ${REQUEST_TIMEOUT_MS / 1000}s 内未响应`));
        }
      }, REQUEST_TIMEOUT_MS);
      this.pending.set(id, {
        method,
        resolve: (result) => {
          clearTimeout(timer);
          resolve(result);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        }
      });
      this.send({ jsonrpc: "2.0", id, method, params });
    });
  }

  private notify(method: string, params?: unknown) {
    this.send(params === undefined ? { jsonrpc: "2.0", method } : { jsonrpc: "2.0", method, params });
  }

  private send(message: JsonRpcMessage) {
    this.child?.stdin?.write(JSON.stringify(message) + "\n");
  }
}
