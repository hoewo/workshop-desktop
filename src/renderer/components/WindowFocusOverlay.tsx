export function WindowFocusOverlay({ focusClass }: { focusClass: string }) {
  if (!focusClass) {
    return null;
  }

  const stateClass =
    focusClass === "window-selected-focus"
      ? "is-selected-focused"
      : focusClass === "window-selected-idle"
        ? "is-selected-idle"
        : "is-unselected";

  return <div className={`window-focus-overlay ${stateClass}`} aria-hidden="true" />;
}
