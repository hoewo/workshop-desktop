import { Link, Pencil, Unlink } from "lucide-react";
import { useEffect } from "react";
import type { LocalProject } from "../../shared/types";

export interface LocalProjectContextMenuState {
  project: LocalProject;
  x: number;
  y: number;
}

export function LocalProjectContextMenu({
  menu,
  onClose,
  onLinkRemote,
  onUnlinkRemote,
  onRename
}: {
  menu: LocalProjectContextMenuState | null;
  onClose: () => void;
  onLinkRemote: (project: LocalProject) => void;
  onUnlinkRemote: (project: LocalProject) => void;
  onRename: (project: LocalProject) => void;
}) {
  useEffect(() => {
    if (!menu) {
      return undefined;
    }

    function closeFromKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("pointerdown", onClose);
    window.addEventListener("blur", onClose);
    window.addEventListener("keydown", closeFromKey);
    return () => {
      window.removeEventListener("pointerdown", onClose);
      window.removeEventListener("blur", onClose);
      window.removeEventListener("keydown", closeFromKey);
    };
  }, [menu, onClose]);

  if (!menu) {
    return null;
  }

  const left = Math.max(8, Math.min(menu.x, window.innerWidth - 204));
  const top = Math.max(8, Math.min(menu.y, window.innerHeight - (menu.project.linkedWorkshopProjectId ? 112 : 76)));

  return (
    <div
      className="local-project-context-menu"
      role="menu"
      style={{ left, top }}
      onContextMenu={(event) => event.preventDefault()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          onRename(menu.project);
          onClose();
        }}
      >
        <Pencil size={14} />
        <span>重命名</span>
      </button>
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          onLinkRemote(menu.project);
          onClose();
        }}
      >
        <Link size={14} />
        <span>{menu.project.linkedWorkshopProjectId ? "更换远端任务源" : "关联远端任务源"}</span>
      </button>
      {menu.project.linkedWorkshopProjectId ? (
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            onUnlinkRemote(menu.project);
            onClose();
          }}
        >
          <Unlink size={14} />
          <span>解除远端关联</span>
        </button>
      ) : null}
    </div>
  );
}
