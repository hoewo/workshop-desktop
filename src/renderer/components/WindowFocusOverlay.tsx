export function WindowFocusOverlay({ focusClass }: { focusClass: string }) {
  if (!focusClass) {
    return null;
  }

  const stateClass = focusClass === "window-selected-focus" ? "is-focused" : "is-idle";

  return <div className={`window-focus-overlay ${stateClass}`} aria-hidden="true" />;
}
