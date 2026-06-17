import type { HeaderTitleContent } from "../lib/records";

export function WindowHeaderTitle({ title }: { title: HeaderTitleContent }) {
  if (title.variant === "plain") {
    return <h1 className="window-title-main window-title-plain">{title.text}</h1>;
  }

  return (
    <>
      <h1 className="window-title-main">{title.context}</h1>
      <span className="window-title-suffix">· {title.suffix}</span>
    </>
  );
}

export function ProjectDirectorySubtitle({
  localDirectory,
  onClick
}: {
  localDirectory?: string;
  onClick: () => void;
}) {
  const label = localDirectory?.trim() || "未绑定目录，点击绑定";
  return (
    <button
      className={`project-directory-subtitle ${localDirectory ? "bound" : "unbound"}`}
      type="button"
      onClick={onClick}
      title={localDirectory ? `打开 ${localDirectory}` : "绑定本地目录"}
    >
      {label}
    </button>
  );
}
