import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("workshopConfirmation", {
  confirm: (payload?: unknown) => ipcRenderer.invoke("confirmation:confirm", payload),
  cancel: (payload?: unknown) => ipcRenderer.invoke("confirmation:cancel", payload)
});
