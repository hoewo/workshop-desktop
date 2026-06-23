import { AlertTriangle, Bot, BookOpenText, CalendarClock, CheckCircle2, Download, LoaderCircle, LogIn, LogOut, X } from "lucide-react";
import type { FormEvent } from "react";
import type { AppConfig, AppUpdateStatus, VerificationCodeType, WorkshopCodexSkillStatus } from "../../../shared/types";
import { UpdateStatusPanel } from "../UpdateStatusPanel";

export function SettingsSurface({
  draftConfig,
  error,
  isRemoteConnected,
  isLoggingIn,
  isSavingConfig,
  isSendingCode,
  isInstallingWorkshopSkill,
  loginCode,
  loginCodeType,
  loginReady,
  loginTarget,
  sendCooldown,
  updateStatus,
  workshopSkillStatus,
  onCheckForUpdates,
  onCloseWindow,
  onInstallUpdate,
  onInstallWorkshopSkill,
  onLogin,
  onOpenManual,
  onLogout,
  onSaveConfig,
  onSendVerification,
  setLoginCode,
  setLoginCodeType,
  setLoginTarget,
  setDraftConfig
}: {
  draftConfig: AppConfig;
  error: string;
  isRemoteConnected: boolean;
  isLoggingIn: boolean;
  isSavingConfig: boolean;
  isSendingCode: boolean;
  isInstallingWorkshopSkill: boolean;
  loginCode: string;
  loginCodeType: VerificationCodeType;
  loginReady: boolean;
  loginTarget: string;
  sendCooldown: number;
  updateStatus: AppUpdateStatus | null;
  workshopSkillStatus: WorkshopCodexSkillStatus | null;
  onCheckForUpdates: () => void;
  onCloseWindow: () => void;
  onInstallUpdate: () => void;
  onInstallWorkshopSkill: () => void;
  onLogin: (event: FormEvent<HTMLFormElement>) => void;
  onOpenManual: () => void;
  onLogout: () => void;
  onSaveConfig: (event: FormEvent<HTMLFormElement>) => void;
  onSendVerification: () => void;
  setLoginCode: (value: string) => void;
  setLoginCodeType: (value: VerificationCodeType) => void;
  setLoginTarget: (value: string) => void;
  setDraftConfig: (config: AppConfig) => void;
}) {
  return (
    <main className="app-shell settings-shell">
      <section className="settings-panel" aria-label="设置">
        <header>
          <div>
            <div className="eyebrow">Settings</div>
            <h2>设置</h2>
          </div>
          <button className="icon-button" type="button" onClick={onCloseWindow} title="关闭">
            <X size={17} />
          </button>
        </header>

        {error ? (
          <div className="notice" role="alert">
            <AlertTriangle size={15} />
            <span>{error}</span>
          </div>
        ) : null}

        <section className={`settings-account-block ${isRemoteConnected ? "connected" : "disconnected"}`} aria-label="Workshop 账号">
          <div className="settings-account-copy">
            <span>Workshop 账号</span>
            <strong>{isRemoteConnected ? draftConfig.username || draftConfig.userId || "已登录" : "未登录"}</strong>
            <small>{isRemoteConnected ? "登录状态只影响远端任务同步，本地项目和记录可继续离线使用。" : "登录后可以同步远端任务源。"}</small>
          </div>
          {isRemoteConnected ? (
            <button className="logout-button settings-account-action" type="button" onClick={onLogout}>
              <LogOut size={16} />
              <span>退出登录</span>
            </button>
          ) : null}
        </section>

        {!isRemoteConnected ? (
          <form className="settings-account-login login-form" onSubmit={onLogin}>
            <div className="nebula-login-fields">
              <div className="segmented code-type-switch" aria-label="验证码类型">
                <button
                  type="button"
                  className={loginCodeType === "email" ? "active" : ""}
                  onClick={() => setLoginCodeType("email")}
                >
                  邮箱
                </button>
                <button type="button" className={loginCodeType === "sms" ? "active" : ""} onClick={() => setLoginCodeType("sms")}>
                  手机号
                </button>
              </div>
              <label>
                <span>{loginCodeType === "email" ? "邮箱" : "手机号"}</span>
                <input
                  value={loginTarget}
                  onChange={(event) => setLoginTarget(event.target.value)}
                  type={loginCodeType === "email" ? "email" : "tel"}
                  autoComplete={loginCodeType === "email" ? "email" : "tel"}
                  placeholder={loginCodeType === "email" ? "your-email@example.com" : "13800138000"}
                />
              </label>
              <div className="verification-row">
                <label>
                  <span>验证码</span>
                  <input
                    value={loginCode}
                    onChange={(event) => setLoginCode(event.target.value)}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder="6 位验证码"
                  />
                </label>
                <button
                  className="secondary-button code-button"
                  type="button"
                  onClick={onSendVerification}
                  disabled={isSavingConfig || isSendingCode || isLoggingIn || sendCooldown > 0 || !loginTarget.trim()}
                >
                  {isSendingCode ? <LoaderCircle className="spin" size={16} /> : null}
                  <span>{sendCooldown > 0 ? `${sendCooldown}s` : "发送验证码"}</span>
                </button>
              </div>
            </div>

            <button className="save-button" type="submit" disabled={isSavingConfig || isLoggingIn || !loginReady}>
              {isLoggingIn ? <LoaderCircle className="spin" size={16} /> : <LogIn size={16} />}
              <span>登录账号</span>
            </button>
          </form>
        ) : null}

        <form className="settings-config-form" onSubmit={onSaveConfig}>
          <label className="toggle-line">
            <input
              type="checkbox"
              checked={draftConfig.stickyAlwaysOnTop}
              onChange={(event) => setDraftConfig({ ...draftConfig, stickyAlwaysOnTop: event.target.checked })}
            />
            <span>便签默认置顶</span>
          </label>

          <label className="toggle-line">
            <input
              type="checkbox"
              checked={draftConfig.showDockIcon}
              onChange={(event) => setDraftConfig({ ...draftConfig, showDockIcon: event.target.checked })}
            />
            <span>显示 Dock 图标</span>
          </label>

          <label className="toggle-line">
            <input
              type="checkbox"
              checked={draftConfig.globalShortcutEnabled}
              onChange={(event) => setDraftConfig({ ...draftConfig, globalShortcutEnabled: event.target.checked })}
            />
            <span>打开工作台快捷键 Command+Option+W</span>
          </label>

          <UpdateStatusPanel status={updateStatus} onCheckForUpdates={onCheckForUpdates} onInstallUpdate={onInstallUpdate} />

          <div className={`skill-status-block ${getSkillStatusClass(workshopSkillStatus)}`}>
            <div className="skill-status-copy">
              <span>AI 协作</span>
              <strong>{getSkillStatusLabel(workshopSkillStatus)}</strong>
              <small>{getSkillStatusDescription(workshopSkillStatus)}</small>
              {workshopSkillStatus?.backupDir ? <small>已备份旧版本：{workshopSkillStatus.backupDir}</small> : null}
            </div>
            <button
              className="secondary-button skill-action-button"
              type="button"
              onClick={onInstallWorkshopSkill}
              disabled={isInstallingWorkshopSkill || workshopSkillStatus?.bundled === false}
            >
              {isInstallingWorkshopSkill ? (
                <LoaderCircle className="spin" size={15} />
              ) : workshopSkillStatus?.upToDate ? (
                <CheckCircle2 size={15} />
              ) : workshopSkillStatus?.installed ? (
                <Download size={15} />
              ) : (
                <Bot size={15} />
              )}
              <span>{getSkillActionLabel(workshopSkillStatus, isInstallingWorkshopSkill)}</span>
            </button>
          </div>

          <button className="secondary-button settings-manual-button" type="button" onClick={onOpenManual}>
            <BookOpenText size={16} />
            <span>打开使用手册</span>
          </button>

          <button className="save-button" type="submit" disabled={isSavingConfig}>
            {isSavingConfig ? <LoaderCircle className="spin" size={16} /> : <CalendarClock size={16} />}
            <span>保存设置</span>
          </button>
        </form>
      </section>
    </main>
  );
}

function getSkillStatusLabel(status: WorkshopCodexSkillStatus | null) {
  if (!status) {
    return "检查中";
  }
  if (!status.bundled) {
    return "内置资源缺失";
  }
  if (status.upToDate) {
    return "Skill 已安装";
  }
  if (status.installed) {
    return "Skill 可更新";
  }
  return "Skill 未安装";
}

function getSkillStatusDescription(status: WorkshopCodexSkillStatus | null) {
  if (!status) {
    return "正在检查本机 Codex skill 目录。";
  }
  if (status.error) {
    return status.error;
  }
  if (!status.bundled) {
    return "当前应用包没有携带 Workshop Codex skill。";
  }
  if (status.upToDate) {
    return `已安装到 ${status.targetDir}`;
  }
  if (status.installed) {
    return `安装到 ${status.targetDir}，更新前会备份旧版本。`;
  }
  return `安装到 ${status.targetDir}，新开的 Codex 线程会自动发现。`;
}

function getSkillActionLabel(status: WorkshopCodexSkillStatus | null, busy: boolean) {
  if (busy) {
    return "安装中";
  }
  if (status?.upToDate) {
    return "重新安装";
  }
  if (status?.installed) {
    return "更新 Skill";
  }
  return "安装 Skill";
}

function getSkillStatusClass(status: WorkshopCodexSkillStatus | null) {
  if (!status) {
    return "skill-checking";
  }
  if (status.error || !status.bundled) {
    return "skill-error";
  }
  if (status.upToDate) {
    return "skill-ready";
  }
  return "skill-action-needed";
}
