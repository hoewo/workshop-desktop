import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { WorkshopCodexSkillStatus } from "../shared/types";

export const WORKSHOP_CODEX_SKILL_NAME = "workshop-codex-collaboration";

function defaultCodexSkillsDir() {
  const override = process.env.WORKSHOP_DESKTOP_CODEX_SKILLS_DIR?.trim();
  if (override) {
    return override;
  }

  const codexHome = process.env.CODEX_HOME?.trim() || path.join(os.homedir(), ".codex");
  return path.join(codexHome, "skills");
}

function targetSkillDir() {
  return path.join(defaultCodexSkillsDir(), WORKSHOP_CODEX_SKILL_NAME);
}

async function pathExists(filePath: string) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function listDirectoryFiles(rootDir: string, dir = rootDir): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        return listDirectoryFiles(rootDir, fullPath);
      }
      if (!entry.isFile()) {
        return [];
      }
      return [path.relative(rootDir, fullPath).split(path.sep).join("/")];
    })
  );
  return files.flat().sort();
}

async function hashDirectory(rootDir: string) {
  if (!(await pathExists(rootDir))) {
    return undefined;
  }

  const files = await listDirectoryFiles(rootDir);
  const hash = crypto.createHash("sha256");
  for (const file of files) {
    const absolutePath = path.join(rootDir, file);
    hash.update(file);
    hash.update("\0");
    hash.update(await fs.readFile(absolutePath));
    hash.update("\0");
  }
  return hash.digest("hex");
}

function readableVersion(hash?: string) {
  return hash ? hash.slice(0, 12) : undefined;
}

function timestampSuffix() {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "").replace("T", "-");
}

export async function getWorkshopCodexSkillStatus(sourceDir: string): Promise<WorkshopCodexSkillStatus> {
  const targetDir = targetSkillDir();
  const [sourceHash, targetHash] = await Promise.all([hashDirectory(sourceDir), hashDirectory(targetDir)]);
  const installed = Boolean(targetHash);
  const bundled = Boolean(sourceHash);

  return {
    skillName: WORKSHOP_CODEX_SKILL_NAME,
    bundled,
    installed,
    upToDate: Boolean(sourceHash && targetHash && sourceHash === targetHash),
    sourceDir,
    targetDir,
    sourceHash,
    installedHash: targetHash,
    version: readableVersion(sourceHash)
  };
}

export async function installWorkshopCodexSkill(sourceDir: string): Promise<WorkshopCodexSkillStatus> {
  const before = await getWorkshopCodexSkillStatus(sourceDir);
  if (!before.bundled) {
    return { ...before, error: `内置 skill 不存在：${sourceDir}` };
  }

  if (before.upToDate) {
    return before;
  }

  let backupDir: string | undefined;
  try {
    await fs.mkdir(path.dirname(before.targetDir), { recursive: true });

    if (before.installed) {
      backupDir = path.join(path.dirname(before.targetDir), `${WORKSHOP_CODEX_SKILL_NAME}.backup-${timestampSuffix()}`);
      await fs.rm(backupDir, { recursive: true, force: true });
      await fs.rename(before.targetDir, backupDir);
    }

    await fs.cp(sourceDir, before.targetDir, { recursive: true, force: true });
    return { ...(await getWorkshopCodexSkillStatus(sourceDir)), backupDir, installedAt: new Date().toISOString() };
  } catch (error) {
    return {
      ...(await getWorkshopCodexSkillStatus(sourceDir)),
      backupDir,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}
