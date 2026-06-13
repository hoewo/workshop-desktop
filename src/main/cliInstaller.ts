import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export interface WorkshopCliInstallResult {
  supported: boolean;
  installed: boolean;
  binDir: string;
  commandPaths: string[];
  cliScriptPath: string;
  appExecutablePath: string;
  shellProfilePath?: string;
  pathConfigured: boolean;
  error?: string;
}

function singleQuote(value: string) {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function defaultCliBinDir() {
  const override = process.env.WORKSHOP_DESKTOP_CLI_BIN_DIR?.trim();
  return override || path.join(os.homedir(), ".local", "bin");
}

function shellProfilePath() {
  const home = os.homedir();
  const shell = process.env.SHELL || os.userInfo().shell || "";
  if (shell.includes("bash")) {
    return path.join(home, ".bash_profile");
  }
  if (shell.includes("zsh") || process.platform === "darwin") {
    return path.join(home, ".zshenv");
  }
  return path.join(home, ".profile");
}

function pathSnippet(binDir: string) {
  const home = os.homedir();
  const displayPath = binDir.startsWith(`${home}${path.sep}`) ? `$HOME/${path.relative(home, binDir)}` : binDir;
  return [
    "",
    "# >>> Workshop Desktop CLI >>>",
    `case ":$PATH:" in *":${displayPath}:"*) ;; *) export PATH="${displayPath}:$PATH" ;; esac`,
    "# <<< Workshop Desktop CLI <<<",
    ""
  ].join("\n");
}

async function ensurePathConfigured(binDir: string) {
  if (process.platform === "win32") {
    return { configured: false, profilePath: undefined };
  }

  const profilePath = shellProfilePath();
  const existing = await fs.readFile(profilePath, "utf8").catch(() => "");
  if (existing.includes("Workshop Desktop CLI") || existing.includes(binDir)) {
    return { configured: true, profilePath };
  }

  await fs.mkdir(path.dirname(profilePath), { recursive: true });
  await fs.appendFile(profilePath, pathSnippet(binDir), "utf8");
  return { configured: true, profilePath };
}

function createShim(appExecutablePath: string, cliScriptPath: string) {
  return `#!/usr/bin/env bash
set -euo pipefail

APP_EXEC=${singleQuote(appExecutablePath)}
CLI_SCRIPT=${singleQuote(cliScriptPath)}
COMMAND_NAME="$(basename "$0")"

if [ ! -x "$APP_EXEC" ]; then
  echo "Workshop Desktop app executable not found: $APP_EXEC" >&2
  exit 1
fi

if [ ! -f "$CLI_SCRIPT" ]; then
  echo "Workshop Desktop CLI script not found: $CLI_SCRIPT" >&2
  exit 1
fi

exec env WORKSHOP_CLI_COMMAND_NAME="$COMMAND_NAME" ELECTRON_RUN_AS_NODE=1 "$APP_EXEC" "$CLI_SCRIPT" "$@"
`;
}

export async function ensureWorkshopCliInstalled({
  appExecutablePath,
  cliScriptPath
}: {
  appExecutablePath: string;
  cliScriptPath: string;
}): Promise<WorkshopCliInstallResult> {
  const binDir = defaultCliBinDir();
  const commandPaths = [path.join(binDir, "workshop"), path.join(binDir, "workshop-desktop")];
  const baseResult = {
    supported: process.platform !== "win32",
    installed: false,
    binDir,
    commandPaths,
    cliScriptPath,
    appExecutablePath,
    pathConfigured: false
  };

  if (process.platform === "win32") {
    return { ...baseResult, error: "Automatic CLI installation is not supported on Windows yet." };
  }

  try {
    await fs.mkdir(binDir, { recursive: true });
    await fs.access(cliScriptPath);

    await Promise.all(
      commandPaths.map(async (commandPath) => {
        await fs.writeFile(commandPath, createShim(appExecutablePath, cliScriptPath), {
          encoding: "utf8",
          mode: 0o755
        });
        await fs.chmod(commandPath, 0o755);
      })
    );

    const pathResult = await ensurePathConfigured(binDir);
    return {
      ...baseResult,
      installed: true,
      pathConfigured: pathResult.configured,
      shellProfilePath: pathResult.profilePath
    };
  } catch (error) {
    return {
      ...baseResult,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}
