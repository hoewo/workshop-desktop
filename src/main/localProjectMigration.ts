import path from "node:path";
import type { AppConfig, LocalProject } from "../shared/types";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function safeLocalProjectText(value: unknown, fallback = "", maxLength = 120) {
  if (typeof value !== "string") {
    return fallback;
  }

  const text = value.trim();
  if (!text) {
    return fallback;
  }
  return text.length > maxLength ? text.slice(0, maxLength) : text;
}

export function safeLocalProjectId(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const id = value.trim();
  return /^[a-zA-Z0-9_-]+$/.test(id) ? id : null;
}

export function safeLinkedWorkshopProjectId(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.trunc(value) : undefined;
}

function safeIsoTimestamp(value: unknown, fallback: string) {
  if (typeof value !== "string" || Number.isNaN(new Date(value).getTime())) {
    return fallback;
  }
  return value;
}

export function getDirectoryIdentity(directory: string) {
  const trimmed = directory.trim();
  if (!trimmed) {
    return "";
  }

  let normalized = path.normalize(path.resolve(trimmed));
  if (normalized.length > path.parse(normalized).root.length) {
    normalized = normalized.replace(/[\\/]+$/, "");
  }

  return process.platform === "darwin" || process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

export function sanitizeProjectLocalDirectories(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const directories: Record<string, string> = {};
  for (const [projectId, directory] of Object.entries(value)) {
    if (!/^\d+$/.test(projectId) || typeof directory !== "string") {
      continue;
    }
    const trimmed = directory.trim();
    if (trimmed) {
      directories[projectId] = trimmed;
    }
  }
  return directories;
}

function createLegacyLocalProject(projectId: string, localDirectory: string, now: string): LocalProject {
  const linkedWorkshopProjectId = Number(projectId);
  return {
    id: `legacy-workshop-${projectId}`,
    name: `Workshop 项目 ${projectId}`,
    localDirectory,
    linkedWorkshopProjectId,
    createdAt: now,
    updatedAt: now
  };
}

function indexLocalProjects(projects: LocalProject[]) {
  const byLinkedWorkshopProjectId = new Map<number, LocalProject>();
  const byDirectoryIdentity = new Map<string, LocalProject>();

  for (const project of projects) {
    if (project.linkedWorkshopProjectId) {
      byLinkedWorkshopProjectId.set(project.linkedWorkshopProjectId, project);
    }

    const directoryIdentity = project.localDirectory ? getDirectoryIdentity(project.localDirectory) : "";
    if (directoryIdentity) {
      byDirectoryIdentity.set(directoryIdentity, project);
    }
  }

  return { byDirectoryIdentity, byLinkedWorkshopProjectId };
}

function mergeWorkshopProjectLink(project: LocalProject, projectId: number, localDirectory?: string) {
  if (!project.linkedWorkshopProjectId && projectId > 0) {
    project.linkedWorkshopProjectId = projectId;
  }

  if (!project.localDirectory && localDirectory) {
    project.localDirectory = localDirectory;
  }
}

export function sanitizeLocalProjects(value: unknown, projectLocalDirectories: Record<string, string>) {
  const now = new Date().toISOString();
  const projects: LocalProject[] = [];
  const seenIds = new Set<string>();
  const directoryOwners = new Map<string, LocalProject>();

  if (Array.isArray(value)) {
    for (const item of value) {
      if (!isPlainObject(item)) {
        continue;
      }

      const id = safeLocalProjectId(item.id);
      const name = safeLocalProjectText(item.name);
      if (!id || !name || seenIds.has(id)) {
        continue;
      }

      const linkedWorkshopProjectId = safeLinkedWorkshopProjectId(item.linkedWorkshopProjectId);
      const localDirectory = safeLocalProjectText(item.localDirectory, "", 500);
      const directoryIdentity = localDirectory ? getDirectoryIdentity(localDirectory) : "";
      const existingDirectoryOwner = directoryIdentity ? directoryOwners.get(directoryIdentity) : undefined;
      const createdAt = safeIsoTimestamp(item.createdAt, now);
      const updatedAt = safeIsoTimestamp(item.updatedAt, createdAt);
      const linkedWorkshopProjectName = safeLocalProjectText(item.linkedWorkshopProjectName);

      if (existingDirectoryOwner) {
        if (linkedWorkshopProjectId) {
          mergeWorkshopProjectLink(existingDirectoryOwner, linkedWorkshopProjectId);
        }
        projects.push({
          id,
          name,
          ...(linkedWorkshopProjectId ? { linkedWorkshopProjectId } : {}),
          ...(linkedWorkshopProjectName ? { linkedWorkshopProjectName } : {}),
          createdAt,
          updatedAt
        });
      } else {
        const project: LocalProject = {
          id,
          name,
          ...(localDirectory ? { localDirectory } : {}),
          ...(linkedWorkshopProjectId ? { linkedWorkshopProjectId } : {}),
          ...(linkedWorkshopProjectName ? { linkedWorkshopProjectName } : {}),
          createdAt,
          updatedAt
        };
        projects.push(project);
        if (directoryIdentity) {
          directoryOwners.set(directoryIdentity, project);
        }
      }
      seenIds.add(id);
    }
  }

  let indexes = indexLocalProjects(projects);
  for (const [projectId, localDirectory] of Object.entries(projectLocalDirectories)) {
    const linkedWorkshopProjectId = Number(projectId);
    const directoryIdentity = getDirectoryIdentity(localDirectory);
    const linkedProject = indexes.byLinkedWorkshopProjectId.get(linkedWorkshopProjectId);
    if (linkedProject) {
      if (!linkedProject.localDirectory) {
        linkedProject.localDirectory = localDirectory;
        indexes = indexLocalProjects(projects);
      }
      continue;
    }

    const directoryProject = directoryIdentity ? indexes.byDirectoryIdentity.get(directoryIdentity) : undefined;
    if (directoryProject && !directoryProject.linkedWorkshopProjectId) {
      directoryProject.linkedWorkshopProjectId = linkedWorkshopProjectId;
      indexes = indexLocalProjects(projects);
      continue;
    }

    if (directoryProject) {
      continue;
    }

    const id = `legacy-workshop-${projectId}`;
    if (!seenIds.has(id)) {
      projects.push(createLegacyLocalProject(projectId, localDirectory, now));
      seenIds.add(id);
      indexes = indexLocalProjects(projects);
    }
  }

  return projects.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function findLocalProjectByDirectory(projects: LocalProject[], directory: string, exceptProjectId?: string) {
  const directoryIdentity = getDirectoryIdentity(directory);
  if (!directoryIdentity) {
    return undefined;
  }

  return projects.find((project) => {
    if (exceptProjectId && project.id === exceptProjectId) {
      return false;
    }
    return project.localDirectory ? getDirectoryIdentity(project.localDirectory) === directoryIdentity : false;
  });
}

export function findWorkshopProjectDirectoryId(
  projectLocalDirectories: Record<string, string>,
  directory: string,
  exceptProjectId?: number
) {
  const directoryIdentity = getDirectoryIdentity(directory);
  if (!directoryIdentity) {
    return undefined;
  }

  for (const [projectId, localDirectory] of Object.entries(projectLocalDirectories)) {
    const numericProjectId = Number(projectId);
    if (exceptProjectId !== undefined && numericProjectId === exceptProjectId) {
      continue;
    }
    if (getDirectoryIdentity(localDirectory) === directoryIdentity) {
      return numericProjectId;
    }
  }

  return undefined;
}

export function getLocalProjectDirectoryForWorkshopProject(config: Pick<AppConfig, "localProjects" | "projectLocalDirectories">, projectId: number) {
  const localProject = config.localProjects.find((project) => project.linkedWorkshopProjectId === projectId && project.localDirectory);
  return localProject?.localDirectory?.trim() || config.projectLocalDirectories[String(projectId)]?.trim() || "";
}
