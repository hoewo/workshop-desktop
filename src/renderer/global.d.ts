import type { DesktopBridge } from "../shared/types";

declare global {
  interface Window {
    workshopDesktop: DesktopBridge;
  }
}

export {};
