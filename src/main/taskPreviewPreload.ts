import { contextBridge, ipcRenderer } from "electron";

function normalizeTaskTarget(projectId: unknown, taskId: unknown) {
  if (
    typeof projectId !== "number" ||
    !Number.isFinite(projectId) ||
    projectId <= 0 ||
    typeof taskId !== "number" ||
    !Number.isFinite(taskId) ||
    taskId <= 0
  ) {
    return null;
  }

  return {
    projectId: Math.trunc(projectId),
    taskId: Math.trunc(taskId)
  };
}

contextBridge.exposeInMainWorld("workshopTaskPreview", {
  keep: () => ipcRenderer.invoke("taskPreview:keep"),
  hide: () => ipcRenderer.invoke("taskPreview:hide"),
  openTask: (projectId: unknown, taskId: unknown) => {
    const target = normalizeTaskTarget(projectId, taskId);
    return target ? ipcRenderer.invoke("sticky:open", target) : Promise.resolve();
  }
});
