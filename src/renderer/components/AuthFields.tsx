import type { AppConfig } from "../../shared/types";

export function AuthFields({
  draftConfig,
  setDraftConfig
}: {
  draftConfig: AppConfig;
  setDraftConfig: (config: AppConfig) => void;
}) {
  return (
    <>
      <label>
        <span>基础地址</span>
        <input
          value={draftConfig.baseUrl}
          onChange={(event) => setDraftConfig({ ...draftConfig, baseUrl: event.target.value })}
          placeholder="https://api.feitianchengzi.com"
        />
      </label>
      <label>
        <span>服务名</span>
        <input
          value={draftConfig.serviceName}
          onChange={(event) => setDraftConfig({ ...draftConfig, serviceName: event.target.value })}
          placeholder="workshop"
        />
      </label>

      <div className="auth-switch">
        <button
          type="button"
          className={draftConfig.authMode === "nebula" ? "active" : ""}
          onClick={() => setDraftConfig({ ...draftConfig, authMode: "nebula" })}
        >
          NebulaAuth
        </button>
        <button
          type="button"
          className={draftConfig.authMode === "bearer" ? "active" : ""}
          onClick={() => setDraftConfig({ ...draftConfig, authMode: "bearer" })}
        >
          Bearer Token
        </button>
        <button
          type="button"
          className={draftConfig.authMode === "debugHeaders" ? "active" : ""}
          onClick={() => setDraftConfig({ ...draftConfig, authMode: "debugHeaders" })}
        >
          本地 Header
        </button>
      </div>

      {draftConfig.authMode === "bearer" ? (
        <label>
          <span>访问令牌</span>
          <input
            value={draftConfig.accessToken}
            onChange={(event) => setDraftConfig({ ...draftConfig, accessToken: event.target.value })}
            type="password"
            placeholder="Bearer token"
          />
        </label>
      ) : draftConfig.authMode === "debugHeaders" ? (
        <div className="debug-fields">
          <label>
            <span>用户 UUID</span>
            <input
              value={draftConfig.userId}
              onChange={(event) => setDraftConfig({ ...draftConfig, userId: event.target.value })}
            />
          </label>
          <label>
            <span>用户名</span>
            <input
              value={draftConfig.username}
              onChange={(event) => setDraftConfig({ ...draftConfig, username: event.target.value })}
            />
          </label>
          <label>
            <span>App ID</span>
            <input
              value={draftConfig.appId}
              onChange={(event) => setDraftConfig({ ...draftConfig, appId: event.target.value })}
            />
          </label>
          <label>
            <span>Session ID</span>
            <input
              value={draftConfig.sessionId}
              onChange={(event) => setDraftConfig({ ...draftConfig, sessionId: event.target.value })}
            />
          </label>
        </div>
      ) : null}
    </>
  );
}
