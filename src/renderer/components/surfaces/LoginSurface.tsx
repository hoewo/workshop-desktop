import { LoaderCircle, LogIn, WifiOff } from "lucide-react";
import type { FormEvent } from "react";
import type { AppConfig, VerificationCodeType } from "../../../shared/types";
import { AuthFields } from "../AuthFields";
import { WorkshopMark } from "../WorkshopMark";

export function LoginSurface({
  draftConfig,
  error,
  isLoggingIn,
  isSavingConfig,
  isSendingCode,
  loginCode,
  loginCodeType,
  loginReady,
  loginTarget,
  sendCooldown,
  onLogin,
  onSendVerification,
  setDraftConfig,
  setLoginCode,
  setLoginCodeType,
  setLoginTarget
}: {
  draftConfig: AppConfig;
  error: string;
  isLoggingIn: boolean;
  isSavingConfig: boolean;
  isSendingCode: boolean;
  loginCode: string;
  loginCodeType: VerificationCodeType;
  loginReady: boolean;
  loginTarget: string;
  sendCooldown: number;
  onLogin: (event: FormEvent<HTMLFormElement>) => void;
  onSendVerification: () => void;
  setDraftConfig: (config: AppConfig) => void;
  setLoginCode: (value: string) => void;
  setLoginCodeType: (value: VerificationCodeType) => void;
  setLoginTarget: (value: string) => void;
}) {
  return (
    <main className="app-shell login-shell">
      <section className="login-panel">
        <div className="login-mark">
          <WorkshopMark />
        </div>
        <div>
          <div className="eyebrow">Workshop</div>
          <h1>登录</h1>
        </div>
        <form className="login-form" onSubmit={onLogin}>
          <AuthFields draftConfig={draftConfig} setDraftConfig={setDraftConfig} />
          {draftConfig.authMode === "nebula" ? (
            <div className="nebula-login-fields">
              <div className="segmented code-type-switch" aria-label="验证码类型">
                <button
                  type="button"
                  className={loginCodeType === "email" ? "active" : ""}
                  onClick={() => setLoginCodeType("email")}
                >
                  邮箱
                </button>
                <button
                  type="button"
                  className={loginCodeType === "sms" ? "active" : ""}
                  onClick={() => setLoginCodeType("sms")}
                >
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
                  disabled={isSendingCode || isSavingConfig || sendCooldown > 0 || !loginTarget.trim()}
                >
                  {isSendingCode ? <LoaderCircle className="spin" size={16} /> : null}
                  <span>{sendCooldown > 0 ? `${sendCooldown}s` : "发送验证码"}</span>
                </button>
              </div>
            </div>
          ) : null}
          {error ? (
            <div className="notice" role="alert">
              <WifiOff size={16} />
              <span>{error}</span>
            </div>
          ) : null}
          <button className="save-button" type="submit" disabled={isSavingConfig || isLoggingIn || !loginReady}>
            {isSavingConfig || isLoggingIn ? <LoaderCircle className="spin" size={16} /> : <LogIn size={16} />}
            <span>{draftConfig.authMode === "nebula" ? "登录" : "进入待办"}</span>
          </button>
        </form>
      </section>
    </main>
  );
}
