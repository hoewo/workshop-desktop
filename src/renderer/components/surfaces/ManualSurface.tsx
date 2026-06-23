import { BookOpenText, Bot, CircleHelp, X } from "lucide-react";
import { useMemo, useState } from "react";
import { manualCategoryLabels, manualRevision, manualSections, type ManualCategory } from "../../content/manual";
import { MarkdownPreview } from "../MarkdownPreview";
import { WorkshopMark } from "../WorkshopMark";

const manualCategories: ManualCategory[] = ["software", "collaboration"];

export function ManualSurface({
  onCloseWindow
}: {
  onCloseWindow: () => void;
}) {
  const [activeSectionId, setActiveSectionId] = useState(manualSections[0]?.id ?? "");
  const activeSection = manualSections.find((section) => section.id === activeSectionId) ?? manualSections[0];
  const sectionGroups = useMemo(
    () =>
      manualCategories.map((category) => ({
        category,
        sections: manualSections.filter((section) => section.category === category)
      })),
    []
  );
  const CategoryIcon = activeSection?.category === "collaboration" ? Bot : BookOpenText;

  return (
    <main className="app-shell manual-shell">
      <header className="manual-topbar">
        <div className="manual-title">
          <WorkshopMark compact />
          <div>
            <div className="eyebrow">Manual</div>
            <h1>使用手册</h1>
          </div>
        </div>
        <div className="manual-actions">
          <button className="icon-button" type="button" onClick={onCloseWindow} title="关闭">
            <X size={17} />
          </button>
        </div>
      </header>

      <section className="manual-layout">
        <nav className="manual-sidebar" aria-label="使用手册目录">
          <div className="manual-sidebar-head">
            <CircleHelp size={16} />
            <span>目录</span>
          </div>
          {sectionGroups.map((group) => (
            <div className="manual-nav-group" key={group.category}>
              <span>{manualCategoryLabels[group.category]}</span>
              {group.sections.map((section) => (
                <button
                  className={section.id === activeSection.id ? "active" : undefined}
                  key={section.id}
                  type="button"
                  onClick={() => setActiveSectionId(section.id)}
                >
                  <strong>{section.title}</strong>
                  <small>{section.summary}</small>
                </button>
              ))}
            </div>
          ))}
        </nav>

        <article className="manual-content">
          <div className="manual-content-kicker">
            <CategoryIcon size={17} />
            <span>{manualCategoryLabels[activeSection.category]}</span>
            <small>版本 {manualRevision}</small>
          </div>
          <div className="manual-content-head">
            <h2>{activeSection.title}</h2>
            <p>{activeSection.summary}</p>
          </div>
          <MarkdownPreview value={activeSection.bodyMarkdown} />
        </article>
      </section>
    </main>
  );
}
