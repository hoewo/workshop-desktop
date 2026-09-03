import { Check, LoaderCircle, Tag, UserRound, X } from "lucide-react";
import { useMemo, useState } from "react";
import type { CreateTaskRequest, Project, ProjectTag } from "../../shared/types";
import { getMeId, getProjectTagDisplayName } from "../lib/tasks";

const preferredSceneTags = ["Bug", "技术方案评审", "需求", "想法"];

function sortProjectTags(tags: ProjectTag[]) {
  return [...tags].sort((first, second) => {
    const firstName = getProjectTagDisplayName(first.name);
    const secondName = getProjectTagDisplayName(second.name);
    const firstRank = preferredSceneTags.indexOf(firstName);
    const secondRank = preferredSceneTags.indexOf(secondName);
    if (firstRank !== secondRank) {
      return (firstRank < 0 ? preferredSceneTags.length : firstRank) - (secondRank < 0 ? preferredSceneTags.length : secondRank);
    }
    return firstName.localeCompare(secondName, "zh-CN");
  });
}

export function TaskComposer({
  busy,
  currentUsername,
  error,
  initialContent,
  initialProjectId,
  lockProject,
  loadingProjectTagIds,
  projects,
  projectTags,
  onCancel,
  onProjectChange,
  onSubmit
}: {
  busy: boolean;
  currentUsername?: string;
  error: string;
  initialContent: string;
  initialProjectId?: number;
  lockProject?: boolean;
  loadingProjectTagIds: Set<number>;
  projects: Project[];
  projectTags: Map<number, ProjectTag[]>;
  onCancel: () => void;
  onProjectChange: (projectId: number) => void;
  onSubmit: (request: CreateTaskRequest) => void;
}) {
  const initialProject = projects.find((project) => project.id === initialProjectId) ?? (lockProject ? undefined : projects[0]);
  const [projectId, setProjectId] = useState<number | undefined>(initialProject?.id);
  const [content, setContent] = useState(initialContent);
  const [executorId, setExecutorId] = useState<number | undefined>(
    initialProject ? getMeId(initialProject, currentUsername) : undefined
  );
  const [tagIds, setTagIds] = useState<number[]>([]);
  const project = projects.find((candidate) => candidate.id === projectId);
  const tags = useMemo(() => sortProjectTags(projectId ? projectTags.get(projectId) ?? [] : []), [projectId, projectTags]);
  const isLoadingTags = projectId ? loadingProjectTagIds.has(projectId) : false;
  const canSubmit = Boolean(project && content.trim() && executorId && !busy);

  function changeProject(nextProjectId: number) {
    const nextProject = projects.find((candidate) => candidate.id === nextProjectId);
    setProjectId(nextProjectId);
    setExecutorId(nextProject ? getMeId(nextProject, currentUsername) : undefined);
    setTagIds([]);
    onProjectChange(nextProjectId);
  }

  function toggleTag(tagId: number) {
    setTagIds((current) => (current.includes(tagId) ? current.filter((candidate) => candidate !== tagId) : [...current, tagId]));
  }

  return (
    <div className="task-composer-backdrop" onMouseDown={(event) => event.target === event.currentTarget && !busy && onCancel()}>
      <section
        className="task-composer-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-composer-title"
        onKeyDown={(event) => {
          if (event.key === "Escape" && !busy) {
            event.preventDefault();
            onCancel();
          }
        }}
      >
        <header>
          <div>
            <span className="eyebrow">Task</span>
            <h2 id="task-composer-title">创建待办</h2>
          </div>
          <button className="icon-button" type="button" onClick={onCancel} disabled={busy} title="关闭">
            <X size={17} />
          </button>
        </header>

        <div className="task-composer-form">
          <label>
            <span>项目</span>
            <select
              value={projectId ?? ""}
              disabled={Boolean(lockProject) || busy}
              onChange={(event) => changeProject(Number(event.target.value))}
            >
              <option value="" disabled>
                选择项目
              </option>
              {projects.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>待办内容</span>
            <textarea
              autoFocus
              value={content}
              maxLength={2000}
              onChange={(event) => setContent(event.target.value)}
              placeholder="明确要完成的事项"
              disabled={busy}
            />
          </label>

          <label>
            <span className="task-composer-label">
              <UserRound size={14} />
              负责人
            </span>
            <select value={executorId ?? ""} onChange={(event) => setExecutorId(Number(event.target.value))} disabled={!project || busy}>
              <option value="" disabled>
                选择负责人
              </option>
              {(project?.members ?? []).map((member) => (
                <option key={member.user_id} value={member.user_id}>
                  {member.username}{member.is_me ? "（我）" : ""}
                </option>
              ))}
            </select>
          </label>

          <fieldset className="task-composer-tags" disabled={!project || busy}>
            <legend>
              <span className="task-composer-label">
                <Tag size={14} />
                标签
              </span>
              <small>可选</small>
            </legend>
            {isLoadingTags ? (
              <p className="task-composer-empty">
                <LoaderCircle className="spin" size={13} />
                正在读取项目标签
              </p>
            ) : tags.length > 0 ? (
              <div className="task-composer-tag-list">
                {tags.map((tag) => {
                  const selected = tagIds.includes(tag.id);
                  return (
                    <button
                      key={tag.id}
                      type="button"
                      className={selected ? "selected" : ""}
                      onClick={() => toggleTag(tag.id)}
                      aria-pressed={selected}
                    >
                      {selected ? <Check size={13} /> : null}
                      {getProjectTagDisplayName(tag.name)}
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="task-composer-empty">当前项目没有可用标签，可直接创建无标签待办。</p>
            )}
          </fieldset>

          {error ? <p className="task-composer-error">{error}</p> : null}
        </div>

        <footer>
          <button type="button" className="secondary-button" onClick={onCancel} disabled={busy}>
            取消
          </button>
          <button
            type="button"
            className="primary-button"
            disabled={!canSubmit}
            onClick={() => {
              if (!project || !executorId) {
                return;
              }
              onSubmit({ projectId: project.id, content: content.trim(), executorId, tagIds, state: "pending" });
            }}
          >
            {busy ? <LoaderCircle className="spin" size={15} /> : <Check size={15} />}
            {busy ? "创建中" : "创建待办"}
          </button>
        </footer>
      </section>
    </div>
  );
}
