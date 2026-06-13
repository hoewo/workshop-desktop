import { Archive, Check } from "lucide-react";
import type { MouseEvent } from "react";

type ListCellActionClick = (event: MouseEvent<HTMLButtonElement>) => void;

export function ListCellCompleteButton({
  done,
  disabled = false,
  title,
  onClick
}: {
  done: boolean;
  disabled?: boolean;
  title: string;
  onClick: ListCellActionClick;
}) {
  return (
    <button
      className={`list-cell-complete-button ${done ? "done" : ""}`}
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
    >
      <Check size={18} strokeWidth={3} />
    </button>
  );
}

export function ListCellArchiveButton({
  disabled = false,
  title = "归档",
  onClick
}: {
  disabled?: boolean;
  title?: string;
  onClick: ListCellActionClick;
}) {
  return (
    <button
      className="list-cell-archive-button"
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
    >
      <Archive size={14} />
    </button>
  );
}
