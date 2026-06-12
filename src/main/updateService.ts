import { app } from "electron";
import log from "electron-log";
import { autoUpdater } from "electron-updater";
import type { AppUpdateStatus } from "../shared/types";

function sanitizeVersion(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function sanitizeMessage(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 500) : undefined;
}

export class AppUpdateService {
  private configured = false;
  private checking = false;
  private status: AppUpdateStatus = {
    phase: "idle",
    currentVersion: app.getVersion(),
    message: "可以检查更新"
  };

  constructor(private readonly onStatus: (status: AppUpdateStatus) => void) {}

  getStatus() {
    return { ...this.status };
  }

  async initialize() {
    await this.configure();
    if (!app.isPackaged) {
      this.setStatus({
        phase: "disabled",
        currentVersion: app.getVersion(),
        message: "开发模式不检查更新"
      });
      return;
    }

    this.setStatus({
      phase: "idle",
      currentVersion: app.getVersion(),
      message: "可以检查更新"
    });
  }

  async checkForUpdates() {
    await this.configure();
    if (!app.isPackaged) {
      this.setStatus({
        phase: "disabled",
        currentVersion: app.getVersion(),
        message: "开发模式不检查更新"
      });
      return this.getStatus();
    }

    if (this.checking || this.status.phase === "downloading") {
      return this.getStatus();
    }

    this.checking = true;
    try {
      await autoUpdater.checkForUpdates();
    } catch (error) {
      this.setStatus({
        phase: "error",
        currentVersion: app.getVersion(),
        message: error instanceof Error ? error.message : "检查更新失败",
        checkedAt: new Date().toISOString()
      });
    } finally {
      this.checking = false;
    }

    return this.getStatus();
  }

  installDownloadedUpdate() {
    if (this.status.phase !== "downloaded") {
      throw new Error("没有已下载的更新");
    }

    autoUpdater.quitAndInstall(false, true);
  }

  private async configure() {
    if (this.configured) {
      return;
    }
    this.configured = true;

    log.transports.file.level = "info";
    autoUpdater.logger = log;
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = false;
    autoUpdater.allowPrerelease = false;

    autoUpdater.on("checking-for-update", () => {
      this.setStatus({
        phase: "checking",
        currentVersion: app.getVersion(),
        message: "正在检查更新"
      });
    });

    autoUpdater.on("update-available", (info) => {
      this.setStatus({
        phase: "available",
        currentVersion: app.getVersion(),
        availableVersion: sanitizeVersion(info.version),
        message: "发现新版本，开始下载",
        checkedAt: new Date().toISOString()
      });
    });

    autoUpdater.on("update-not-available", (info) => {
      this.setStatus({
        phase: "not_available",
        currentVersion: app.getVersion(),
        availableVersion: sanitizeVersion(info.version),
        message: "已是最新版本",
        checkedAt: new Date().toISOString()
      });
    });

    autoUpdater.on("download-progress", (progress) => {
      this.setStatus({
        phase: "downloading",
        currentVersion: app.getVersion(),
        availableVersion: this.status.availableVersion,
        percent: Number.isFinite(progress.percent) ? progress.percent : undefined,
        transferred: Number.isFinite(progress.transferred) ? progress.transferred : undefined,
        total: Number.isFinite(progress.total) ? progress.total : undefined,
        bytesPerSecond: Number.isFinite(progress.bytesPerSecond) ? progress.bytesPerSecond : undefined,
        message: "正在下载更新",
        checkedAt: this.status.checkedAt
      });
    });

    autoUpdater.on("update-downloaded", (info) => {
      this.setStatus({
        phase: "downloaded",
        currentVersion: app.getVersion(),
        availableVersion: sanitizeVersion(info.version),
        message: "更新已下载，重启后生效",
        checkedAt: this.status.checkedAt,
        downloadedAt: new Date().toISOString()
      });
    });

    autoUpdater.on("error", (error) => {
      this.setStatus({
        phase: "error",
        currentVersion: app.getVersion(),
        availableVersion: this.status.availableVersion,
        message: sanitizeMessage(error.message) ?? "更新失败",
        checkedAt: new Date().toISOString()
      });
    });
  }

  private setStatus(status: AppUpdateStatus) {
    this.status = status;
    this.onStatus(this.getStatus());
  }
}
