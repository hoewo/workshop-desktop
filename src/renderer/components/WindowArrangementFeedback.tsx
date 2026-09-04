import { PanelsTopLeft } from "lucide-react";

export function WindowArrangementFeedback({ message }: { message: string }) {
  if (!message) {
    return null;
  }

  return (
    <div className="window-arrangement-feedback" role="status" aria-live="polite">
      <PanelsTopLeft size={13} />
      <span>{message}</span>
    </div>
  );
}
