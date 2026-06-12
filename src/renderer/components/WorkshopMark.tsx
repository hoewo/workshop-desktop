export function WorkshopMark({ compact = false }: { compact?: boolean }) {
  return (
    <span className={`workshop-mark ${compact ? "compact" : ""}`} aria-hidden="true">
      <span className="workshop-mark-sheet">
        <span className="workshop-mark-line primary" />
        <span className="workshop-mark-line secondary" />
        <span className="workshop-mark-line short" />
      </span>
      <span className="workshop-mark-check" />
    </span>
  );
}
