import { LoaderCircle } from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  AppConfig,
  AppUpdateStatus,
  CodexRunMeta,
  CurrentUserPayload,
  LocalProject,
  Organization,
  OrganizationsPayload,
  PersonalRecord,
  PersonalRecordChangeNotice,
  PersonalRecordMeta,
  PersonalRecordScope,
  PersonalRecordStatus,
  PersonalRecordTarget,
  Project,
  ProjectsPayload,
  Task,
  TaskState,
  TaskStateChangeNotice,
  TasksPayload,
  VerificationCodeType,
  WorkshopCodexSkillStatus,
  WindowFitRequest
} from "../shared/types";
import { manualRevision } from "./content/manual";
import { HomeSurface } from "./components/surfaces/HomeSurface";
import { LoginSurface } from "./components/surfaces/LoginSurface";
import { ManualSurface } from "./components/surfaces/ManualSurface";
import { RecordSurface } from "./components/surfaces/RecordSurface";
import { SettingsSurface } from "./components/surfaces/SettingsSurface";
import { StickyLoginRequiredSurface, StickySurface } from "./components/surfaces/StickySurface";
import { TraySurface } from "./components/surfaces/TraySurface";
import { UpdateSurface } from "./components/surfaces/UpdateSurface";
import { useKeyedCompletionFeedback, useSingleCompletionFeedback } from "./hooks/useCompletionFeedback";
import { useFocusPulse } from "./hooks/useFocusPulse";
import {
  apiData,
  extractList,
  getErrorMessage,
  getInitialProjectFilter,
  getInitialRecordTarget,
  getInitialTaskFilter,
  getProjectLocalDirectory,
  getSurface,
  isLoggedIn,
  normalizeConfig
} from "./lib/appModel";
import {
  compareRecordListItems,
  deriveRecordTitle,
  findTaskRecord,
  getRecordListContext,
  recordCompleteAnimationMs,
  recordMatchesListContext,
  recordMatchesSearch,
  type RecordListContext,
  type RecordMode,
  type RecordSaveStatus
} from "./lib/records";
import {
  compareTasks,
  getMeId,
  getProjectDisplayName,
  getStickyHeader,
  isVisibleTask,
  mergeProjects,
  stateLabels,
  taskListStates,
  taskCompleteAnimationMs,
  withOrganization,
  type EnrichedTask,
  type ProjectTodoGroup
} from "./lib/tasks";
import { readShellContentHeight, readTextareaHeightForFit } from "./lib/windowFit";

export default function App() {
  const surface = useMemo(getSurface, []);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [draftConfig, setDraftConfig] = useState<AppConfig | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<EnrichedTask[]>([]);
  const [projectFilter] = useState(getInitialProjectFilter);
  const [taskFilter] = useState(getInitialTaskFilter);
  const [isLoading, setIsLoading] = useState(false);
  const [loginCodeType, setLoginCodeType] = useState<VerificationCodeType>("email");
  const [loginTarget, setLoginTarget] = useState("");
  const [loginCode, setLoginCode] = useState("");
  const [isSendingCode, setIsSendingCode] = useState(false);
  const [sendCooldown, setSendCooldown] = useState(0);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [busyTaskId, setBusyTaskId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [taskMessage, setTaskMessage] = useState("");
  const [hoveredProjectId, setHoveredProjectId] = useState<number | null>(null);
  const [recordTarget] = useState(getInitialRecordTarget);
  const [records, setRecords] = useState<PersonalRecordMeta[]>([]);
  const [codexRuns, setCodexRuns] = useState<CodexRunMeta[]>([]);
  const [updateStatus, setUpdateStatus] = useState<AppUpdateStatus | null>(null);
  const [workshopSkillStatus, setWorkshopSkillStatus] = useState<WorkshopCodexSkillStatus | null>(null);
  const [isInstallingWorkshopSkill, setIsInstallingWorkshopSkill] = useState(false);
  const [isCreatingLocalProject, setIsCreatingLocalProject] = useState(false);
  const [renameLocalProjectTarget, setRenameLocalProjectTarget] = useState<LocalProject | null>(null);
  const [renameLocalProjectName, setRenameLocalProjectName] = useState("");
  const [isRenamingLocalProject, setIsRenamingLocalProject] = useState(false);
  const [isRemoteLoginOpen, setIsRemoteLoginOpen] = useState(false);

  useEffect(() => {
    if (surface !== "tray" && surface !== "home") {
      return undefined;
    }

    let cancelled = false;
    window.workshopDesktop
      .listCodexRuns()
      .then((runs) => {
        if (!cancelled) {
          setCodexRuns(runs);
        }
      })
      .catch(() => undefined);
    const unsubscribe = window.workshopDesktop.onCodexRunsChanged((runs) => setCodexRuns(runs));
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [surface]);

  useEffect(() => {
    if (surface !== "tray" && surface !== "home" && surface !== "settings" && surface !== "update") {
      return undefined;
    }

    let cancelled = false;
    window.workshopDesktop
      .getUpdateStatus()
      .then((status) => {
        if (!cancelled) {
          setUpdateStatus(status);
        }
      })
      .catch(() => undefined);
    const unsubscribe = window.workshopDesktop.onUpdateStatus((status) => setUpdateStatus(status));
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [surface]);

  useEffect(() => {
    if (surface !== "settings") {
      return;
    }

    let cancelled = false;
    window.workshopDesktop
      .getWorkshopCodexSkillStatus()
      .then((status) => {
        if (!cancelled) {
          setWorkshopSkillStatus(status);
        }
      })
      .catch((nextError) => {
        if (!cancelled) {
          setWorkshopSkillStatus(null);
          setError(nextError instanceof Error ? nextError.message : "读取 Workshop Codex skill 状态失败");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [surface]);

  useEffect(() => {
    if (surface !== "manual" || !config || config.lastSeenManualRevision === manualRevision) {
      return;
    }

    void saveConfig({ ...config, lastSeenManualRevision: manualRevision }).catch(() => undefined);
  }, [config, surface]);

  const [recordsLoaded, setRecordsLoaded] = useState(false);
  const [activeRecord, setActiveRecord] = useState<PersonalRecord | null>(null);
  const [recordListContext, setRecordListContext] = useState<RecordListContext>(() => getRecordListContext(recordTarget));
  const [recordBody, setRecordBody] = useState("");
  const [recordMode, setRecordMode] = useState<RecordMode>("edit");
  const [recordDirty, setRecordDirty] = useState(false);
  const [recordSaveStatus, setRecordSaveStatus] = useState<RecordSaveStatus>("idle");
  const [recordMessage, setRecordMessage] = useState("");
  const [recordScopePickerOpen, setRecordScopePickerOpen] = useState(false);
  const [recordProjectQuery, setRecordProjectQuery] = useState("");
  const [recordSearchQuery, setRecordSearchQuery] = useState("");
  const [recordSearchOpen, setRecordSearchOpen] = useState(false);
  const [stickyListCollapsed, setStickyListCollapsed] = useState(false);
  const [recordListCollapsed, setRecordListCollapsed] = useState(false);
  const [taskNoteBody, setTaskNoteBody] = useState("");
  const [taskNoteDirty, setTaskNoteDirty] = useState(false);
  const { focusPulseVisible, triggerFocusPulse } = useFocusPulse();
  const isNoteSurface = surface === "sticky" || surface === "record";
  const [isWindowSelected, setIsWindowSelected] = useState(isNoteSurface);
  const [isWindowFocused, setIsWindowFocused] = useState(() => (typeof document === "undefined" ? true : document.hasFocus()));
  const {
    completingIds: completingTaskIds,
    clearCompletionFeedback: clearTaskCompletionFeedback,
    markCompletionFeedback: markTaskCompletionFeedback
  } = useKeyedCompletionFeedback<number>(taskCompleteAnimationMs);
  const {
    completingId: recordCompletingId,
    clearCompletionFeedback: clearRecordCompletionFeedback,
    markCompletionFeedback: markRecordCompletionFeedback
  } = useSingleCompletionFeedback(recordCompleteAnimationMs);
  const recordSaveTimerRef = useRef<number | null>(null);
  const recordEditorRef = useRef<HTMLTextAreaElement | null>(null);
  const recordSearchInputRef = useRef<HTMLInputElement | null>(null);
  const taskNoteSaveTimerRef = useRef<number | null>(null);
  const arrangementHeightTimerRef = useRef<number | null>(null);
  const arrangementMaxHeightRef = useRef<number | null>(null);
  const lastWindowFitRef = useRef("");
  const activeRecordRef = useRef<PersonalRecord | null>(null);
  const recordBodyRef = useRef("");
  const recordDirtyRef = useRef(false);
  const taskNoteBodyRef = useRef("");
  const taskNoteDirtyRef = useRef(false);
  const recordSaveInFlightRef = useRef<Promise<PersonalRecord | null> | null>(null);
  const recordSaveQueuedRef = useRef(false);
  const isSingleTaskSticky = surface === "sticky" && taskFilter !== "all";

  useEffect(() => {
    activeRecordRef.current = activeRecord;
  }, [activeRecord]);

  useEffect(() => {
    recordBodyRef.current = recordBody;
  }, [recordBody]);

  useEffect(() => {
    recordDirtyRef.current = recordDirty;
  }, [recordDirty]);

  useEffect(() => {
    taskNoteBodyRef.current = taskNoteBody;
  }, [taskNoteBody]);

  useEffect(() => {
    taskNoteDirtyRef.current = taskNoteDirty;
  }, [taskNoteDirty]);

  useEffect(() => {
    return () => {
      if (arrangementHeightTimerRef.current !== null) {
        window.clearTimeout(arrangementHeightTimerRef.current);
      }
    };
  }, []);

  useEffect(() => window.workshopDesktop.onFocusPulse(triggerFocusPulse), [triggerFocusPulse]);

  useEffect(() => {
    if (!isNoteSurface) {
      return undefined;
    }

    const handleFocus = () => setIsWindowFocused(true);
    const handleBlur = () => setIsWindowFocused(false);
    window.addEventListener("focus", handleFocus);
    window.addEventListener("blur", handleBlur);
    setIsWindowFocused(document.hasFocus());
    return () => {
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("blur", handleBlur);
    };
  }, [isNoteSurface]);

  useEffect(() => {
    if (!isNoteSurface) {
      return undefined;
    }

    return window.workshopDesktop.onWindowFocusState((notice) => {
      setIsWindowSelected(notice.selected);
    });
  }, [isNoteSurface]);

  useEffect(
    () =>
      window.workshopDesktop.onWindowArrangement((notice) => {
        if (typeof notice.maxHeight === "number" && Number.isFinite(notice.maxHeight) && notice.maxHeight > 0) {
          arrangementMaxHeightRef.current = notice.maxHeight;
          lastWindowFitRef.current = "";
          if (arrangementHeightTimerRef.current !== null) {
            window.clearTimeout(arrangementHeightTimerRef.current);
          }
          arrangementHeightTimerRef.current = window.setTimeout(() => {
            arrangementHeightTimerRef.current = null;
            arrangementMaxHeightRef.current = null;
            lastWindowFitRef.current = "";
          }, 1400);
        }

        if (notice.compactList) {
          if (surface === "sticky" && !isSingleTaskSticky) {
            setStickyListCollapsed(true);
          }
          if (surface === "record" && !activeRecordRef.current) {
            setRecordListCollapsed(true);
          }
        }
      }),
    [isSingleTaskSticky, surface]
  );

  const loadData = useCallback(async () => {
    if (!config || !isLoggedIn(config)) {
      setProjects([]);
      setTasks([]);
      return;
    }

    setIsLoading(true);
    setError("");
    setTaskMessage("");

    try {
      const currentUser = await apiData<CurrentUserPayload>(window.workshopDesktop.getCurrentUser()).catch(() => null);
      const standaloneProjectPayload = await apiData<ProjectsPayload | Project[]>(
        window.workshopDesktop.listProjects({ pageSize: 200 })
      );
      const standaloneProjects = extractList<Project>(standaloneProjectPayload, "projects");
      const organizationsPayload = await apiData<OrganizationsPayload | Organization[]>(window.workshopDesktop.listOrganizations());
      const organizations = extractList<Organization>(organizationsPayload, "organizations");
      const organizationProjectGroups = await Promise.all(
        organizations.map(async (organization) => {
          const payload = await apiData<ProjectsPayload | Project[]>(
            window.workshopDesktop.listProjects({
              organizationId: organization.id,
              pageSize: 200
            })
          );
          return extractList<Project>(payload, "projects").map((project) => withOrganization(project, organization));
        })
      );
      const nextProjects = mergeProjects([standaloneProjects, ...organizationProjectGroups]);
      setProjects(nextProjects);

      const taskGroups = await Promise.all(
        nextProjects.map(async (project) => {
          const payload = await apiData<TasksPayload | Task[]>(
            window.workshopDesktop.listTasks({
              projectId: project.id,
              states: taskListStates,
              pageSize: 200
            })
          );

          const meId = getMeId(project, currentUser?.username || config.username);
          const projectLabel = getProjectDisplayName(project);
          return extractList<Task>(payload, "tasks").map<EnrichedTask>((task) => ({
            ...task,
            projectName: projectLabel,
            meId,
            isMine: task.creator_id === meId || task.executor_id === meId
          }));
        })
      );

      setTasks(taskGroups.flat().sort(compareTasks));
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "同步失败");
    } finally {
      setIsLoading(false);
    }
  }, [config]);

  const applyTaskStateChange = useCallback(
    (notice: TaskStateChangeNotice, options?: { refreshAfterComplete?: boolean }) => {
      const now = new Date().toISOString();
      setTasks((currentTasks) =>
        currentTasks
          .map((task) =>
            task.id === notice.id
              ? {
                  ...task,
                  state: notice.state,
                  updated_at: notice.updatedAt || now,
                  completion_at: notice.state === "completed" ? notice.completionAt || task.completion_at || now : task.completion_at
                }
              : task
          )
          .sort(compareTasks)
      );

      if (notice.state === "completed") {
        markTaskCompletionFeedback(notice.id, options?.refreshAfterComplete ? () => void loadData() : undefined);
        return;
      }

      clearTaskCompletionFeedback(notice.id);
    },
    [clearTaskCompletionFeedback, loadData, markTaskCompletionFeedback]
  );

  const loadRecords = useCallback(async () => {
    const nextRecords = await window.workshopDesktop.listPersonalRecords();
    setRecords(nextRecords);
    setRecordsLoaded(true);
    return nextRecords;
  }, []);

  const startRecordDraft = useCallback((target?: PersonalRecordTarget) => {
    const scopeType: PersonalRecordScope = target?.scopeType === "project" || target?.scopeType === "task" ? target.scopeType : "none";
    const now = new Date().toISOString();
    const draft: PersonalRecord = {
      id: "",
      title: scopeType === "task" ? target?.taskTitle || "任务备注" : scopeType === "project" ? target?.projectName || "项目想法" : "个人记录",
      scopeType,
      status: "active",
      createdAt: now,
      updatedAt: now,
      bodyMarkdown: "",
      ...(scopeType === "project" || scopeType === "task"
        ? { localProjectId: target?.localProjectId, projectId: target?.projectId, projectName: target?.projectName }
        : {}),
      ...(scopeType === "task" ? { taskId: target?.taskId, taskTitle: target?.taskTitle } : {})
    };
    activeRecordRef.current = draft;
    recordBodyRef.current = "";
    recordDirtyRef.current = false;
    setActiveRecord(draft);
    setRecordListContext(getRecordListContext(draft));
    setRecordBody("");
    setRecordDirty(false);
    setRecordSaveStatus("idle");
    setRecordMessage("");
    setRecordMode("edit");
  }, []);

  const openRecordById = useCallback(async (id: string) => {
    const record = await window.workshopDesktop.getPersonalRecord(id);
    if (!record) {
      setRecordMessage("记录不存在");
      return;
    }
    activeRecordRef.current = record;
    recordBodyRef.current = record.bodyMarkdown;
    recordDirtyRef.current = false;
    setActiveRecord(record);
    setRecordListContext(getRecordListContext(record));
    setRecordBody(record.bodyMarkdown);
    setRecordDirty(false);
    setRecordSaveStatus("saved");
    setRecordMessage("");
    setRecordMode("edit");
  }, []);

  const refreshActiveRecordFromNotice = useCallback(async (notice: PersonalRecordChangeNotice | null) => {
    const activeRecordId = activeRecordRef.current?.id;
    if (!notice?.id || !activeRecordId || notice.id !== activeRecordId) {
      return;
    }

    if (notice.deleted) {
      activeRecordRef.current = null;
      recordBodyRef.current = "";
      recordDirtyRef.current = false;
      setActiveRecord(null);
      setRecordBody("");
      setRecordDirty(false);
      setRecordSaveStatus("idle");
      setRecordMessage("记录已删除");
      return;
    }

    if (recordDirtyRef.current || recordSaveInFlightRef.current) {
      setRecordMessage("记录已在其他窗口更新，当前有未保存编辑，暂未自动刷新");
      return;
    }

    const record = await window.workshopDesktop.getPersonalRecord(notice.id);
    if (!record || activeRecordRef.current?.id !== notice.id || recordDirtyRef.current || recordSaveInFlightRef.current) {
      return;
    }

    activeRecordRef.current = record;
    recordBodyRef.current = record.bodyMarkdown;
    recordDirtyRef.current = false;
    setActiveRecord(record);
    setRecordListContext(getRecordListContext(record));
    setRecordBody(record.bodyMarkdown);
    setRecordDirty(false);
    setRecordSaveStatus("saved");
    setRecordMessage("");
  }, []);

  const saveRecordNow = useCallback(async () => {
    recordSaveQueuedRef.current = true;

    if (recordSaveInFlightRef.current) {
      return recordSaveInFlightRef.current;
    }

    const saveTask = (async () => {
      let lastSaved: PersonalRecord | null = null;
      let shouldReloadRecords = false;

      while (recordSaveQueuedRef.current) {
        recordSaveQueuedRef.current = false;

        const recordToSave = activeRecordRef.current;
        const bodyToSave = recordBodyRef.current;
        const shouldPersist = Boolean(recordDirtyRef.current || !recordToSave?.id);

        if (!recordToSave || (!recordToSave.id && !bodyToSave.trim())) {
          recordDirtyRef.current = false;
          setRecordDirty(false);
          lastSaved = null;
          continue;
        }

        if (!shouldPersist) {
          lastSaved = recordToSave;
          continue;
        }

        setRecordSaveStatus("saving");

        try {
          const saved = await window.workshopDesktop.savePersonalRecord({
            id: recordToSave.id || undefined,
            bodyMarkdown: bodyToSave,
            scopeType: recordToSave.scopeType,
            status: recordToSave.status,
            localProjectId: recordToSave.localProjectId,
            projectId: recordToSave.projectId,
            projectName: recordToSave.projectName,
            taskId: recordToSave.taskId,
            taskTitle: recordToSave.taskTitle,
            promotedTaskId: recordToSave.promotedTaskId
          });

          const latestRecord = activeRecordRef.current;
          const latestBody = recordBodyRef.current;
          const sameRecord =
            latestRecord &&
            (recordToSave.id ? latestRecord.id === recordToSave.id : latestRecord === recordToSave || latestRecord.id === saved.id);

          lastSaved = saved;
          shouldReloadRecords = true;

          if (!sameRecord || !latestRecord) {
            continue;
          }

          if (latestBody !== bodyToSave || latestRecord !== recordToSave) {
            const nextRecord = {
              ...latestRecord,
              id: latestRecord.id || saved.id,
              createdAt: latestRecord.createdAt || saved.createdAt,
              updatedAt: saved.updatedAt,
              bodyMarkdown: latestBody
            };
            activeRecordRef.current = nextRecord;
            recordDirtyRef.current = true;
            setActiveRecord(nextRecord);
            setRecordDirty(true);
            recordSaveQueuedRef.current = true;
            continue;
          }

          activeRecordRef.current = saved;
          recordBodyRef.current = saved.bodyMarkdown;
          recordDirtyRef.current = false;
          setActiveRecord(saved);
          setRecordBody(saved.bodyMarkdown);
          setRecordDirty(false);
          setRecordSaveStatus("saved");
          setRecordMessage("");
        } catch (nextError) {
          recordSaveQueuedRef.current = false;
          recordDirtyRef.current = true;
          setRecordDirty(true);
          setRecordSaveStatus("error");
          setRecordMessage(nextError instanceof Error ? nextError.message : "保存失败");
          return null;
        }
      }

      if (shouldReloadRecords) {
        void loadRecords().catch(() => undefined);
      }

      return lastSaved;
    })();

    recordSaveInFlightRef.current = saveTask;

    try {
      return await saveTask;
    } finally {
      if (recordSaveInFlightRef.current === saveTask) {
        recordSaveInFlightRef.current = null;
      }
    }
  }, [loadRecords]);

  const closeRecordWindow = useCallback(async () => {
    if (recordDirtyRef.current) {
      await saveRecordNow();
    }
    await window.workshopDesktop.closeWindow();
  }, [saveRecordNow]);

  useEffect(() => {
    window.workshopDesktop.getConfig().then((nextConfig) => {
      setConfig(nextConfig);
      setDraftConfig(nextConfig);
    });
  }, []);

  useEffect(
    () =>
      window.workshopDesktop.onConfigChanged((nextConfig) => {
        setConfig(nextConfig);
        setDraftConfig(nextConfig);
      }),
    []
  );

  useEffect(() => {
    void loadRecords().then((nextRecords) => {
      if (surface !== "record") {
        return;
      }

      if (recordTarget.draft) {
        startRecordDraft(recordTarget);
        return;
      }

      if (recordTarget.noteId) {
        void openRecordById(recordTarget.noteId);
        return;
      }

      if (recordTarget.scopeType === "task") {
        const existingTaskRecord = findTaskRecord(nextRecords, recordTarget.taskId);
        if (existingTaskRecord) {
          void openRecordById(existingTaskRecord.id);
          return;
        }
        startRecordDraft(recordTarget);
        return;
      }

      if (recordTarget.scopeType === "project") {
        const hasProjectRecords = nextRecords.some((record) => recordMatchesListContext(record, getRecordListContext(recordTarget)));
        if (!hasProjectRecords) {
          startRecordDraft(recordTarget);
        }
      }
    });
  }, [loadRecords, openRecordById, recordTarget, startRecordDraft, surface]);

  useEffect(
    () =>
      window.workshopDesktop.onRecordsChanged((notice: PersonalRecordChangeNotice | null) => {
        void refreshActiveRecordFromNotice(notice);

        if (notice?.status === "completed") {
          markRecordCompletionFeedback(notice.id, () => void loadRecords());
          return;
        }

        clearRecordCompletionFeedback();
        void loadRecords();
      }),
    [clearRecordCompletionFeedback, loadRecords, markRecordCompletionFeedback, refreshActiveRecordFromNotice]
  );

  useEffect(() => {
    if (config && isLoggedIn(config)) {
      void loadData();
    }
  }, [config, loadData]);

  useEffect(
    () =>
      window.workshopDesktop.onRefresh((event) => {
        if (event?.task) {
          applyTaskStateChange(event.task, { refreshAfterComplete: event.task.state === "completed" });
          if (event.task.state !== "completed") {
            void loadData();
          }
          return;
        }

        void loadData();
      }),
    [applyTaskStateChange, loadData]
  );

  useEffect(() => {
    if (surface !== "record" || !recordDirty) {
      return undefined;
    }

    if (recordSaveTimerRef.current) {
      window.clearTimeout(recordSaveTimerRef.current);
    }

    recordSaveTimerRef.current = window.setTimeout(() => {
      recordSaveTimerRef.current = null;
      void saveRecordNow();
    }, 500);

    return () => {
      if (recordSaveTimerRef.current) {
        window.clearTimeout(recordSaveTimerRef.current);
        recordSaveTimerRef.current = null;
      }
    };
  }, [recordDirty, recordBody, saveRecordNow, surface]);

  useEffect(() => {
    if (surface !== "record" || recordMode !== "edit") {
      return;
    }

    const editor = recordEditorRef.current;
    if (!editor) {
      return;
    }

    const nextHeight = readTextareaHeightForFit(editor, 520);
    editor.style.minHeight = "";
    editor.style.height = `${nextHeight}px`;
    editor.style.overflowY = "auto";
  }, [activeRecord?.id, recordBody, recordMode, surface]);

  useEffect(() => {
    if (surface !== "record" || activeRecord || !recordSearchOpen) {
      return;
    }

    recordSearchInputRef.current?.focus();
  }, [activeRecord, recordSearchOpen, surface]);

  useEffect(() => {
    if (surface !== "sticky" && surface !== "record") {
      return undefined;
    }

    const isRecordDetail = surface === "record" && Boolean(activeRecord);
    const isDetailWindow = (surface === "sticky" && isSingleTaskSticky) || isRecordDetail;
    const isCollapsedList =
      (surface === "sticky" && stickyListCollapsed && !isSingleTaskSticky) || (surface === "record" && recordListCollapsed && !activeRecord);
    const fixedMinHeight = isCollapsedList ? 56 : 112;
    const detailMinHeight = surface === "sticky" && isSingleTaskSticky ? 132 : 188;
    const baseMaxHeight = isCollapsedList ? 56 : surface === "sticky" ? (isSingleTaskSticky ? 640 : 720) : isRecordDetail ? 680 : 720;
    let animationFrame: number | null = null;

    function requestWindowFit() {
      if (animationFrame !== null) {
        window.cancelAnimationFrame(animationFrame);
      }

      animationFrame = window.requestAnimationFrame(() => {
        animationFrame = null;
        const contentHeight = readShellContentHeight();
        const minHeight = isDetailWindow ? Math.min(detailMinHeight, baseMaxHeight) : fixedMinHeight;
        const maxHeight = arrangementMaxHeightRef.current
          ? Math.min(baseMaxHeight, Math.max(minHeight, arrangementMaxHeightRef.current))
          : baseMaxHeight;
        const request: WindowFitRequest = {
          height: contentHeight,
          minWidth: surface === "record" ? 320 : 300,
          minHeight,
          maxHeight
        };
        const requestKey = JSON.stringify(request);
        if (requestKey === lastWindowFitRef.current) {
          return;
        }
        lastWindowFitRef.current = requestKey;
        void window.workshopDesktop.fitWindowContent(request);
      });
    }

    requestWindowFit();
    window.addEventListener("resize", requestWindowFit);

    return () => {
      if (animationFrame !== null) {
        window.cancelAnimationFrame(animationFrame);
      }
      window.removeEventListener("resize", requestWindowFit);
    };
  }, [
    activeRecord,
    error,
    isLoading,
    isSingleTaskSticky,
    recordBody,
    recordMessage,
    recordMode,
    recordListCollapsed,
    recordSearchOpen,
    recordSearchQuery,
    records,
    stickyListCollapsed,
    surface,
    taskNoteBody,
    tasks
  ]);

  useEffect(() => {
    if (sendCooldown <= 0) {
      return undefined;
    }

    const timer = window.setTimeout(() => setSendCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [sendCooldown]);

  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      if (!task.isMine || (!isVisibleTask(task) && !completingTaskIds.has(task.id))) {
        return false;
      }

      if (projectFilter !== "all" && task.project_id !== Number(projectFilter)) {
        return false;
      }

      if (taskFilter !== "all" && task.id !== Number(taskFilter)) {
        return false;
      }

      return true;
    });
  }, [completingTaskIds, projectFilter, taskFilter, tasks]);

  const projectTodoGroups = useMemo<ProjectTodoGroup[]>(() => {
    return projects
      .map((project) => {
        const projectTasks = tasks
          .filter((task) => task.isMine && (isVisibleTask(task) || completingTaskIds.has(task.id)) && task.project_id === project.id)
          .sort(compareTasks);
        return {
          project,
          projectName: getProjectDisplayName(project),
          tasks: projectTasks,
          count: projectTasks.length,
          latestAt: projectTasks[0] ? new Date(projectTasks[0].updated_at).getTime() : 0
        };
      })
      .sort((a, b) => {
        if (a.count !== b.count) {
          return b.count - a.count;
        }
        if (a.latestAt !== b.latestAt) {
          return b.latestAt - a.latestAt;
        }
        return a.projectName.localeCompare(b.projectName, "zh-CN");
      });
  }, [completingTaskIds, projects, tasks]);
  const recentTasks = useMemo(
    () => tasks.filter((task) => task.isMine && (isVisibleTask(task) || completingTaskIds.has(task.id))).sort(compareTasks),
    [completingTaskIds, tasks]
  );

  const selectedProjectName = useMemo(() => {
    if (projectFilter === "all") {
      return "";
    }
    const selectedProject = projects.find((project) => project.id === Number(projectFilter));
    return selectedProject ? getProjectDisplayName(selectedProject) : "";
  }, [projectFilter, projects]);
  const recordProjectCandidates = useMemo(() => {
    const query = recordProjectQuery.trim().toLowerCase();
    return projects
      .map((project) => ({ project, projectName: getProjectDisplayName(project) }))
      .filter(({ projectName }) => !query || projectName.toLowerCase().includes(query))
      .slice(0, 8);
  }, [projects, recordProjectQuery]);
  const contextualRecords = useMemo(
    () => records.filter((record) => recordMatchesListContext(record, recordListContext)),
    [records, recordListContext]
  );
  const recordSearchTokens = useMemo(
    () => recordSearchQuery.trim().toLowerCase().split(/\s+/).filter(Boolean),
    [recordSearchQuery]
  );
  const visibleRecords = useMemo(
    () => contextualRecords.filter((record) => recordMatchesSearch(record, recordSearchTokens)).sort(compareRecordListItems),
    [contextualRecords, recordSearchTokens]
  );
  const hasRecordSearchQuery = recordSearchTokens.length > 0;
  useEffect(() => {
    if (surface === "record" && recordsLoaded && !activeRecord && contextualRecords.length === 0) {
      setRecordListCollapsed(true);
    }
  }, [activeRecord, contextualRecords.length, recordListContext, recordsLoaded, surface]);

  const taskRecordsByTaskId = useMemo(() => {
    const byTaskId = new Map<number, PersonalRecordMeta>();
    for (const record of records) {
      if (record.scopeType === "task" && typeof record.taskId === "number" && !byTaskId.has(record.taskId)) {
        byTaskId.set(record.taskId, record);
      }
    }
    return byTaskId;
  }, [records]);
  const projectRecordCounts = useMemo(() => {
    const counts = new Map<number, number>();
    for (const record of records) {
      if (record.scopeType === "project" && typeof record.projectId === "number") {
        counts.set(record.projectId, (counts.get(record.projectId) ?? 0) + 1);
      }
    }
    return counts;
  }, [records]);
  const localProjectRecordCounts = useMemo(() => {
    const counts = new Map<string, number>();
    if (!config) {
      return counts;
    }

    for (const project of config.localProjects) {
      const count = records.filter((record) => {
        if (record.scopeType !== "project") {
          return false;
        }
        if (record.localProjectId) {
          return record.localProjectId === project.id;
        }
        if (project.linkedWorkshopProjectId && record.projectId === project.linkedWorkshopProjectId) {
          return true;
        }
        return Boolean(record.projectName && record.projectName === project.name);
      }).length;
      if (count > 0) {
        counts.set(project.id, count);
      }
    }

    return counts;
  }, [config, records]);
  const selectedTask = isSingleTaskSticky ? filteredTasks[0] : null;
  const selectedTaskRecord = selectedTask ? taskRecordsByTaskId.get(selectedTask.id) : undefined;
  const canExtractTasks = surface === "sticky" && projectFilter !== "all" && taskFilter === "all";

  useEffect(() => {
    if (!selectedTask) {
      taskNoteBodyRef.current = "";
      taskNoteDirtyRef.current = false;
      setTaskNoteBody("");
      setTaskNoteDirty(false);
      return undefined;
    }

    if (!selectedTaskRecord) {
      taskNoteBodyRef.current = "";
      taskNoteDirtyRef.current = false;
      setTaskNoteBody("");
      setTaskNoteDirty(false);
      return undefined;
    }

    let isCancelled = false;
    void window.workshopDesktop.getPersonalRecord(selectedTaskRecord.id).then((record) => {
      if (!isCancelled && !taskNoteDirtyRef.current) {
        const nextBody = record?.bodyMarkdown ?? "";
        taskNoteBodyRef.current = nextBody;
        taskNoteDirtyRef.current = false;
        setTaskNoteBody(nextBody);
        setTaskNoteDirty(false);
      }
    });

    return () => {
      isCancelled = true;
    };
  }, [selectedTask, selectedTaskRecord]);

  const saveTaskNoteNow = useCallback(async () => {
    if (!selectedTask) {
      return;
    }

    const bodyMarkdown = taskNoteBodyRef.current;
    if (!selectedTaskRecord && !bodyMarkdown.trim()) {
      taskNoteDirtyRef.current = false;
      setTaskNoteDirty(false);
      return;
    }

    await window.workshopDesktop.savePersonalRecord({
      id: selectedTaskRecord?.id,
      bodyMarkdown,
      scopeType: "task",
      status: selectedTaskRecord?.status ?? "active",
      projectId: selectedTask.project_id,
      projectName: selectedTask.projectName,
      taskId: selectedTask.id,
      taskTitle: selectedTask.content
    });
    taskNoteDirtyRef.current = false;
    setTaskNoteDirty(false);
    await loadRecords();
  }, [loadRecords, selectedTask, selectedTaskRecord]);

  useEffect(() => {
    if (!taskNoteDirty || !selectedTask) {
      return undefined;
    }

    if (taskNoteSaveTimerRef.current) {
      window.clearTimeout(taskNoteSaveTimerRef.current);
    }

    taskNoteSaveTimerRef.current = window.setTimeout(() => {
      taskNoteSaveTimerRef.current = null;
      void saveTaskNoteNow();
    }, 500);

    return () => {
      if (taskNoteSaveTimerRef.current) {
        window.clearTimeout(taskNoteSaveTimerRef.current);
        taskNoteSaveTimerRef.current = null;
      }
    };
  }, [saveTaskNoteNow, selectedTask, taskNoteBody, taskNoteDirty]);

  async function closeStickyWindow() {
    if (taskNoteSaveTimerRef.current) {
      window.clearTimeout(taskNoteSaveTimerRef.current);
      taskNoteSaveTimerRef.current = null;
    }
    if (taskNoteDirtyRef.current) {
      await saveTaskNoteNow();
    }
    await window.workshopDesktop.closeSticky();
  }

  async function sendTaskToCodex(task: EnrichedTask) {
    setError("");
    setTaskMessage("");

    try {
      if (taskNoteSaveTimerRef.current) {
        window.clearTimeout(taskNoteSaveTimerRef.current);
        taskNoteSaveTimerRef.current = null;
      }
      if (taskNoteDirtyRef.current) {
        await saveTaskNoteNow();
      }

      const sendResult = await window.workshopDesktop.sendToCodex({
        kind: "task",
        projectId: task.project_id,
        projectName: task.projectName,
        taskId: task.id,
        title: task.content,
        bodyMarkdown: taskNoteBodyRef.current
      });
      setTaskMessage(sendResult.backend === "app-server" ? "已启动 Codex 执行，可在 Codex app 查看" : "后台执行已启动");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "发送失败");
    }
  }

  function handleTaskArchive() {
    setError("");
    setTaskMessage("任务归档暂未实现，当前不会隐藏任务");
  }

  useEffect(() => {
    if (surface !== "sticky") {
      return undefined;
    }

    const listener = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        void closeStickyWindow();
      }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [surface, saveTaskNoteNow]);

  function showProjectTaskPreview(group: ProjectTodoGroup, anchor: DOMRect) {
    setHoveredProjectId(group.project.id);
    void window.workshopDesktop.showTaskPreview({
      count: group.count,
      anchor: {
        x: anchor.x,
        y: anchor.y,
        width: anchor.width,
        height: anchor.height
      },
      tasks: group.tasks.slice(0, 8).map((task) => ({
        id: task.id,
        projectId: task.project_id,
        content: task.content,
        state: task.state,
        stateLabel: stateLabels[task.state]
      }))
    });
  }

  function hideProjectTaskPreview() {
    void window.workshopDesktop.hideTaskPreview();
  }

  function extractTaskToSticky(task: EnrichedTask, position: { x: number; y: number }) {
    void window.workshopDesktop.openSticky({
      projectId: task.project_id,
      taskId: task.id,
      x: position.x,
      y: position.y
    });
  }

  function openTaskDetail(task: EnrichedTask) {
    void window.workshopDesktop.openSticky({
      projectId: task.project_id,
      taskId: task.id
    });
  }

  function openProjectRecord(group: ProjectTodoGroup) {
    void window.workshopDesktop.openPersonalRecord({
      scopeType: "project",
      projectId: group.project.id,
      projectName: group.projectName
    });
  }

  function openLocalProjectRecord(project: LocalProject) {
    void window.workshopDesktop.openPersonalRecord({
      scopeType: "project",
      localProjectId: project.id,
      projectId: project.linkedWorkshopProjectId,
      projectName: project.name
    });
  }

  function getRecordDraftTargetFromContext(): PersonalRecordTarget | undefined {
    if (activeRecord?.scopeType === "project" || activeRecord?.scopeType === "task") {
      return {
        scopeType: activeRecord.scopeType,
        localProjectId: activeRecord.localProjectId,
        projectId: activeRecord.projectId,
        projectName: activeRecord.projectName,
        taskId: activeRecord.taskId,
        taskTitle: activeRecord.taskTitle
      };
    }

    if (recordListContext.scopeType === "project") {
      return {
        scopeType: "project",
        localProjectId: recordListContext.localProjectId,
        projectId: recordListContext.projectId,
        projectName: recordListContext.projectName
      };
    }

    return undefined;
  }

  async function handleNewRecord() {
    const draftTarget = getRecordDraftTargetFromContext();
    if (activeRecordRef.current && recordDirtyRef.current) {
      const saved = await saveRecordNow();
      if (!saved && recordDirtyRef.current) {
        return;
      }
    }

    void window.workshopDesktop.openPersonalRecord({
      ...draftTarget,
      draft: true
    });
  }

  async function saveRecordScope(nextRecord: PersonalRecord) {
    const latestBody = recordBodyRef.current;
    const nextActiveRecord = { ...nextRecord, bodyMarkdown: latestBody, status: "active" as const };
    activeRecordRef.current = nextActiveRecord;
    setActiveRecord(nextActiveRecord);
    setRecordListContext(getRecordListContext(nextActiveRecord));
    setRecordScopePickerOpen(false);
    setRecordProjectQuery("");
    setRecordSaveStatus("idle");

    if (!nextRecord.id && !latestBody.trim()) {
      recordDirtyRef.current = false;
      setRecordDirty(false);
      return;
    }

    recordDirtyRef.current = true;
    setRecordDirty(true);
    await saveRecordNow();
  }

  async function assignRecordToProject(project: Project, projectName: string) {
    const now = new Date().toISOString();
    const baseRecord = activeRecordRef.current ?? {
      id: "",
      title: "项目想法",
      scopeType: "none" as PersonalRecordScope,
      status: "active" as const,
      createdAt: now,
      updatedAt: now,
      bodyMarkdown: ""
    };
    await saveRecordScope({
      ...baseRecord,
      status: "active",
      scopeType: "project",
      localProjectId: undefined,
      projectId: project.id,
      projectName,
      taskId: undefined,
      taskTitle: undefined,
      updatedAt: now,
      bodyMarkdown: recordBodyRef.current
    });
  }

  async function deleteActiveRecord() {
    const initialRecord = activeRecordRef.current;
    const deleteLabel = initialRecord?.scopeType === "task" ? "删除这条备注？" : "删除这条记录？";
    if (initialRecord?.id && !window.confirm(deleteLabel)) {
      return;
    }

    if (recordSaveTimerRef.current) {
      window.clearTimeout(recordSaveTimerRef.current);
      recordSaveTimerRef.current = null;
    }
    recordSaveQueuedRef.current = false;
    if (recordSaveInFlightRef.current) {
      await recordSaveInFlightRef.current;
    }
    const recordToDelete = activeRecordRef.current ?? initialRecord;
    if (!recordToDelete?.id) {
      await window.workshopDesktop.closeWindow();
      return;
    }

    await window.workshopDesktop.deletePersonalRecord(recordToDelete.id);
    await window.workshopDesktop.closeWindow();
  }

  async function saveRecordWithStatus(record: PersonalRecord, status: PersonalRecordStatus) {
    return window.workshopDesktop.savePersonalRecord({
      id: record.id || undefined,
      bodyMarkdown: record.bodyMarkdown,
      scopeType: record.scopeType,
      status,
      localProjectId: record.localProjectId,
      projectId: record.projectId,
      projectName: record.projectName,
      taskId: record.taskId,
      taskTitle: record.taskTitle,
      promotedTaskId: record.promotedTaskId
    });
  }

  async function completeRecord(record: PersonalRecordMeta) {
    setRecordMessage("");

    try {
      const fullRecord = await window.workshopDesktop.getPersonalRecord(record.id);
      if (!fullRecord) {
        clearRecordCompletionFeedback();
        await loadRecords();
        return;
      }

      const nextStatus: PersonalRecordStatus = record.status === "completed" ? "active" : "completed";
      if (nextStatus === "completed") {
        markRecordCompletionFeedback(record.id, () => void loadRecords());
      } else {
        clearRecordCompletionFeedback();
      }

      await saveRecordWithStatus(fullRecord, nextStatus);
      if (nextStatus === "active") {
        await loadRecords();
      }
    } catch (nextError) {
      clearRecordCompletionFeedback();
      setRecordMessage(nextError instanceof Error ? nextError.message : "完成失败");
    }
  }

  async function completeActiveRecord() {
    const initialRecord = activeRecordRef.current;
    if (!initialRecord) {
      return;
    }

    setRecordMessage("");

    try {
      if (recordSaveTimerRef.current) {
        window.clearTimeout(recordSaveTimerRef.current);
        recordSaveTimerRef.current = null;
      }

      if (recordSaveInFlightRef.current) {
        const saved = await recordSaveInFlightRef.current;
        if (!saved && recordDirtyRef.current) {
          clearRecordCompletionFeedback();
          return;
        }
      }

      const recordToComplete = activeRecordRef.current ?? initialRecord;
      const bodyToComplete = recordBodyRef.current;
      const nextStatus: PersonalRecordStatus = recordToComplete.status === "completed" ? "active" : "completed";
      if (!recordToComplete.id && !bodyToComplete.trim()) {
        clearRecordCompletionFeedback();
        await window.workshopDesktop.closeWindow();
        return;
      }

      if (nextStatus === "completed") {
        markRecordCompletionFeedback(recordToComplete.id || "active-record");
      } else {
        clearRecordCompletionFeedback();
      }

      const saved = await saveRecordWithStatus({
        ...recordToComplete,
        bodyMarkdown: bodyToComplete,
        status: nextStatus
      }, nextStatus);
      activeRecordRef.current = saved;
      recordBodyRef.current = saved.bodyMarkdown;
      recordDirtyRef.current = false;
      setActiveRecord(saved);
      setRecordBody(saved.bodyMarkdown);
      setRecordDirty(false);
      setRecordSaveStatus("saved");
      setRecordMessage("");
      if (nextStatus === "completed") {
        markRecordCompletionFeedback(saved.id, () => void loadRecords());
      } else {
        await loadRecords();
      }
    } catch (nextError) {
      clearRecordCompletionFeedback();
      setRecordMessage(nextError instanceof Error ? nextError.message : "完成失败");
    }
  }

  async function archiveRecord(record: PersonalRecordMeta) {
    setRecordMessage("");

    try {
      const fullRecord = await window.workshopDesktop.getPersonalRecord(record.id);
      if (!fullRecord) {
        await loadRecords();
        return;
      }

      await saveRecordWithStatus(fullRecord, "archived");
      await loadRecords();
    } catch (nextError) {
      setRecordMessage(nextError instanceof Error ? nextError.message : "归档失败");
    }
  }

  async function archiveActiveRecord() {
    const initialRecord = activeRecordRef.current;
    if (!initialRecord) {
      return;
    }

    setRecordMessage("");
    try {
      if (recordSaveTimerRef.current) {
        window.clearTimeout(recordSaveTimerRef.current);
        recordSaveTimerRef.current = null;
      }

      if (recordSaveInFlightRef.current) {
        const saved = await recordSaveInFlightRef.current;
        if (!saved && recordDirtyRef.current) {
          return;
        }
      }

      const recordToArchive = activeRecordRef.current ?? initialRecord;
      const bodyToArchive = recordBodyRef.current;
      if (!recordToArchive.id && !bodyToArchive.trim()) {
        await window.workshopDesktop.closeWindow();
        return;
      }

      await saveRecordWithStatus({
        ...recordToArchive,
        bodyMarkdown: bodyToArchive,
        status: "archived"
      }, "archived");
      await loadRecords();
      await window.workshopDesktop.closeWindow();
    } catch (nextError) {
      setRecordMessage(nextError instanceof Error ? nextError.message : "归档失败");
    }
  }

  async function createTaskFromRecord() {
    const saved = recordDirtyRef.current ? await saveRecordNow() : activeRecordRef.current;
    if (!saved?.projectId) {
      setRecordMessage("需要先关联项目");
      return;
    }

    setRecordMessage("");
    try {
      const createdTask = await apiData<Task>(window.workshopDesktop.createTask({
        projectId: saved.projectId,
        content: deriveRecordTitle(recordBodyRef.current, saved.title)
      }));
      if (saved.id) {
        await window.workshopDesktop.savePersonalRecord({
          id: saved.id,
          bodyMarkdown: saved.bodyMarkdown,
          scopeType: saved.scopeType,
          status: "promoted",
          localProjectId: saved.localProjectId,
          projectId: saved.projectId,
          projectName: saved.projectName,
          taskId: saved.taskId,
          taskTitle: saved.taskTitle,
          promotedTaskId: createdTask.id
        });
      }

      const now = new Date().toISOString();
      await window.workshopDesktop.notifyTaskChanged({
        id: createdTask.id,
        projectId: createdTask.project_id,
        state: createdTask.state,
        updatedAt: createdTask.updated_at || now,
        completionAt: createdTask.completion_at ?? null
      });

      setRecordMessage("");
      await loadRecords();
      await window.workshopDesktop.openSticky({
        projectId: createdTask.project_id,
        taskId: createdTask.id
      });
      await window.workshopDesktop.closeWindow();
    } catch (nextError) {
      setRecordMessage(nextError instanceof Error ? nextError.message : "转任务失败");
    }
  }

  async function sendActiveRecordToCodex() {
    const initialRecord = activeRecordRef.current;
    if (!initialRecord) {
      return;
    }

    setRecordMessage("");
    try {
      if (recordSaveTimerRef.current) {
        window.clearTimeout(recordSaveTimerRef.current);
        recordSaveTimerRef.current = null;
      }

      const saved = recordDirtyRef.current || !initialRecord.id ? await saveRecordNow() : initialRecord;
      if (!saved) {
        setRecordMessage("记录为空");
        return;
      }
      if (!saved.projectId) {
        setRecordMessage("需要先关联项目");
        return;
      }

      const sendResult = await window.workshopDesktop.sendToCodex({
        kind: "record",
        projectId: saved.projectId,
        projectName: saved.projectName,
        recordId: saved.id,
        title: deriveRecordTitle(recordBodyRef.current, saved.title),
        bodyMarkdown: recordBodyRef.current
      });
      setRecordMessage(sendResult.backend === "app-server" ? "已启动 Codex 执行，可在 Codex app 查看" : "后台执行已启动");
    } catch (nextError) {
      setRecordMessage(nextError instanceof Error ? nextError.message : "发送失败");
    }
  }

  async function saveConfig(nextConfig: AppConfig) {
    setIsSavingConfig(true);
    try {
      const saved = await window.workshopDesktop.saveConfig(normalizeConfig(nextConfig));
      setConfig(saved);
      setDraftConfig(saved);
      return saved;
    } finally {
      setIsSavingConfig(false);
    }
  }

  async function handleProjectDirectoryClick(projectId: number, source: "sticky" | "record") {
    const localDirectory = getProjectLocalDirectory(config, projectId);
    if (source === "sticky") {
      setError("");
      setTaskMessage("");
    } else {
      setRecordMessage("");
    }

    try {
      if (localDirectory) {
        await window.workshopDesktop.openProjectLocalDirectory(projectId);
        return;
      }

      const saved = await window.workshopDesktop.bindProjectLocalDirectory(projectId);
      if (saved) {
        setConfig(saved);
        setDraftConfig(saved);
      }
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : "本地目录操作失败";
      if (source === "sticky") {
        setError(message);
      } else {
        setRecordMessage(message);
      }
    }
  }

  async function handleLocalProjectDirectoryClick(localProjectId: string) {
    const project = config?.localProjects.find((item) => item.id === localProjectId);
    if (!project) {
      setError("本地项目不存在");
      return;
    }

    try {
      if (project.localDirectory) {
        await window.workshopDesktop.openLocalProjectDirectory(localProjectId);
        return;
      }

      const saved = await window.workshopDesktop.bindLocalProjectDirectory(localProjectId);
      if (saved) {
        setConfig(saved);
        setDraftConfig(saved);
      }
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "本地目录操作失败");
    }
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draftConfig) {
      return;
    }

    setError("");
    setIsLoggingIn(true);

    try {
      await saveConfig({ ...draftConfig, authMode: "nebula" });
      const response = await window.workshopDesktop.loginWithCode({
        codeType: loginCodeType,
        target: loginTarget.trim(),
        code: loginCode.trim()
      });

      if (!response.ok) {
        throw new Error(response.error || getErrorMessage(response.body, "登录失败"));
      }

      const loggedInConfig = await window.workshopDesktop.getConfig();
      setConfig(loggedInConfig);
      setDraftConfig(loggedInConfig);
      setLoginCode("");
      setIsRemoteLoginOpen(false);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "登录失败");
    } finally {
      setIsLoggingIn(false);
    }
  }

  async function handleSendVerification() {
    if (!draftConfig) {
      return;
    }

    const target = loginTarget.trim();
    if (!target) {
      setError(loginCodeType === "email" ? "请先填写邮箱" : "请先填写手机号");
      return;
    }

    setIsSendingCode(true);
    setError("");

    try {
      await saveConfig({ ...draftConfig, authMode: "nebula" });
      const response = await window.workshopDesktop.sendVerification({
        codeType: loginCodeType,
        target
      });

      if (!response.ok) {
        throw new Error(response.error || getErrorMessage(response.body, "验证码发送失败"));
      }

      setSendCooldown(60);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "验证码发送失败");
    } finally {
      setIsSendingCode(false);
    }
  }

  async function updateTaskState(task: EnrichedTask, state: TaskState) {
    setBusyTaskId(task.id);
    setError("");
    setTaskMessage("");

    try {
      const updatedTask = await apiData<Task>(window.workshopDesktop.updateTask({ taskId: task.id, state }));
      const now = new Date().toISOString();
      const notice: TaskStateChangeNotice = {
        id: task.id,
        projectId: task.project_id,
        state: updatedTask?.state ?? state,
        updatedAt: updatedTask?.updated_at ?? now,
        completionAt: (updatedTask?.state ?? state) === "completed" ? updatedTask?.completion_at ?? task.completion_at ?? now : task.completion_at ?? null
      };

      applyTaskStateChange(notice, { refreshAfterComplete: notice.state === "completed" });
      await window.workshopDesktop.notifyTaskChanged(notice);

      if (notice.state !== "completed") {
        await loadData();
      }
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "更新失败");
    } finally {
      setBusyTaskId(null);
    }
  }

  async function handleSaveConfig(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draftConfig) {
      return;
    }

    setError("");
    try {
      await saveConfig(draftConfig);
      if (surface === "settings") {
        await window.workshopDesktop.closeWindow();
      }
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "保存失败");
    }
  }

  async function handleLogout() {
    if (!config) {
      return;
    }

    const saved =
      config.authMode === "nebula"
        ? await window.workshopDesktop.logoutAuth()
        : await window.workshopDesktop.saveConfig({
            ...config,
            accessToken: "",
            refreshToken: "",
            accessTokenExpiresAt: 0,
            refreshTokenExpiresAt: 0,
            userId: "",
            username: "",
            sessionId: ""
          });
    setConfig(saved);
    setDraftConfig(saved);
    setProjects([]);
    setTasks([]);
    setIsRemoteLoginOpen(false);
    if (surface === "settings") {
      await window.workshopDesktop.closeWindow();
    }
  }

  async function handleCheckForUpdates() {
    try {
      const status = await window.workshopDesktop.checkForUpdates();
      setUpdateStatus(status);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "检查更新失败");
    }
  }

  async function handleInstallUpdate() {
    try {
      await window.workshopDesktop.installUpdate();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "安装更新失败");
    }
  }

  async function handleInstallWorkshopSkill() {
    try {
      setIsInstallingWorkshopSkill(true);
      const status = await window.workshopDesktop.installWorkshopCodexSkill();
      setWorkshopSkillStatus(status);
      if (status.error || !status.upToDate) {
        setError(status.error || "Workshop Codex skill 安装未完成");
      } else {
        setError("");
      }
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "安装 Workshop Codex skill 失败");
    } finally {
      setIsInstallingWorkshopSkill(false);
    }
  }

  async function handleStickyAlwaysOnTop(enabled: boolean) {
    const saved = await window.workshopDesktop.setStickyAlwaysOnTop(enabled);
    setConfig(saved);
    setDraftConfig(saved);
  }

  function deriveProjectNameFromDirectory(directory: string) {
    const normalized = directory.trim().replace(/[\\/]+$/, "");
    const parts = normalized.split(/[\\/]/).filter(Boolean);
    return parts.at(-1) || "";
  }

  async function handleCreateLocalProject() {
    try {
      setIsCreatingLocalProject(true);
      const directory = await window.workshopDesktop.chooseLocalProjectDirectory();
      if (!directory) {
        return;
      }

      const name = deriveProjectNameFromDirectory(directory);
      if (!name) {
        throw new Error("本地项目需要名称");
      }

      await window.workshopDesktop.createLocalProject({ name, localDirectory: directory });
      const saved = await window.workshopDesktop.getConfig();
      setConfig(saved);
      setDraftConfig(saved);
      setError("");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "创建本地项目失败");
    } finally {
      setIsCreatingLocalProject(false);
    }
  }

  function openRenameLocalProject(project: LocalProject) {
    setError("");
    setRenameLocalProjectTarget(project);
    setRenameLocalProjectName(project.name);
  }

  function closeRenameLocalProject() {
    if (isRenamingLocalProject) {
      return;
    }

    setRenameLocalProjectTarget(null);
    setRenameLocalProjectName("");
  }

  async function handleRenameLocalProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const target = renameLocalProjectTarget;
    const name = renameLocalProjectName.trim();
    if (!target || !name) {
      return;
    }

    try {
      setIsRenamingLocalProject(true);
      await window.workshopDesktop.renameLocalProject({ id: target.id, name });
      const saved = await window.workshopDesktop.getConfig();
      setConfig(saved);
      setDraftConfig(saved);
      setRenameLocalProjectTarget(null);
      setRenameLocalProjectName("");
      setError("");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "重命名本地项目失败");
    } finally {
      setIsRenamingLocalProject(false);
    }
  }

  async function handleArrangeStickyWindows() {
    await window.workshopDesktop.arrangeStickyWindows();
  }

  const loginReady = Boolean(draftConfig && loginTarget.trim() && loginCode.trim());
  const renameLocalProjectNameTrimmed = renameLocalProjectName.trim();
  const renameLocalProjectDialog = renameLocalProjectTarget ? (
    <div className="project-rename-backdrop">
      <section className="project-rename-sheet" role="dialog" aria-modal="true" aria-labelledby="project-rename-title">
        <form className="project-rename-form" onSubmit={(event) => void handleRenameLocalProject(event)}>
          <header>
            <div>
              <span className="eyebrow">Local Project</span>
              <h2 id="project-rename-title">重命名项目</h2>
            </div>
          </header>
          <label>
            <span>项目名称</span>
            <input
              autoFocus
              value={renameLocalProjectName}
              onChange={(event) => setRenameLocalProjectName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  closeRenameLocalProject();
                }
              }}
            />
          </label>
          <div className="project-rename-actions">
            <button type="button" className="secondary-button" onClick={closeRenameLocalProject} disabled={isRenamingLocalProject}>
              取消
            </button>
            <button
              type="submit"
              disabled={
                isRenamingLocalProject ||
                !renameLocalProjectNameTrimmed ||
                renameLocalProjectNameTrimmed === renameLocalProjectTarget.name
              }
            >
              {isRenamingLocalProject ? "保存中" : "保存"}
            </button>
          </div>
        </form>
      </section>
    </div>
  ) : null;

  if (!config || !draftConfig) {
    return (
      <main className="app-shell loading-shell">
        <LoaderCircle className="spin" size={22} />
      </main>
    );
  }

  const noteWindowFocusClass = !isNoteSurface
    ? ""
    : isWindowSelected
      ? isWindowFocused
        ? "window-selected-focus"
        : "window-selected-idle"
      : "window-unselected-idle";

  if (surface === "settings") {
    return (
      <SettingsSurface
        draftConfig={draftConfig}
        error={error}
        isRemoteConnected={isLoggedIn(config)}
        isSavingConfig={isSavingConfig}
        isInstallingWorkshopSkill={isInstallingWorkshopSkill}
        updateStatus={updateStatus}
        workshopSkillStatus={workshopSkillStatus}
        onCheckForUpdates={() => void handleCheckForUpdates()}
        onCloseWindow={() => void window.workshopDesktop.closeWindow()}
        onInstallUpdate={() => void handleInstallUpdate()}
        onInstallWorkshopSkill={() => void handleInstallWorkshopSkill()}
        onOpenManual={() => void window.workshopDesktop.openManual()}
        onLogout={() => void handleLogout()}
        onSaveConfig={(event) => void handleSaveConfig(event)}
        setDraftConfig={setDraftConfig}
      />
    );
  }

  if (surface === "manual") {
    return (
      <ManualSurface
        onCloseWindow={() => void window.workshopDesktop.closeWindow()}
        onOpenSettings={() => void window.workshopDesktop.openSettings()}
      />
    );
  }

  if (surface === "record") {
    const activeRecordCompletionId = activeRecord?.id || "active-record";
    const isActiveRecordCompleting = Boolean(activeRecord && recordCompletingId === activeRecordCompletionId);
    const isRecordSearchExpanded = recordSearchOpen || hasRecordSearchQuery;

    return (
      <RecordSurface
        activeRecord={activeRecord}
        archiveActiveRecord={() => void archiveActiveRecord()}
        archiveRecord={(record) => void archiveRecord(record)}
        assignRecordToProject={(project, projectName) => void assignRecordToProject(project, projectName)}
        closeRecordWindow={() => void closeRecordWindow()}
        completeActiveRecord={() => void completeActiveRecord()}
        completeRecord={(record) => void completeRecord(record)}
        config={config}
        createTaskFromRecord={() => void createTaskFromRecord()}
        deleteActiveRecord={() => void deleteActiveRecord()}
        focusPulseVisible={focusPulseVisible}
        handleArrangeStickyWindows={() => void handleArrangeStickyWindows()}
        handleNewRecord={() => void handleNewRecord()}
        handleLocalProjectDirectoryClick={(localProjectId) => void handleLocalProjectDirectoryClick(localProjectId)}
        handleProjectDirectoryClick={(projectId) => void handleProjectDirectoryClick(projectId, "record")}
        handleStickyAlwaysOnTop={(enabled) => void handleStickyAlwaysOnTop(enabled)}
        hasRecordSearchQuery={hasRecordSearchQuery}
        isActiveRecordCompleting={isActiveRecordCompleting}
        isRecordSearchExpanded={isRecordSearchExpanded}
        onRecordBodyChange={(nextBody) => {
          recordBodyRef.current = nextBody;
          recordDirtyRef.current = true;
          setRecordBody(nextBody);
          setRecordDirty(true);
          setRecordSaveStatus("idle");
        }}
        recordBody={recordBody}
        recordCompletingId={recordCompletingId}
        recordEditorRef={recordEditorRef}
        recordListCollapsed={recordListCollapsed}
        recordListContext={recordListContext}
        recordMessage={recordMessage}
        recordMode={recordMode}
        recordProjectCandidates={recordProjectCandidates}
        recordProjectQuery={recordProjectQuery}
        recordSaveStatus={recordSaveStatus}
        recordScopePickerOpen={recordScopePickerOpen}
        recordSearchInputRef={recordSearchInputRef}
        recordSearchQuery={recordSearchQuery}
        saveRecordNow={() => void saveRecordNow()}
        sendActiveRecordToCodex={() => void sendActiveRecordToCodex()}
        setRecordListCollapsed={setRecordListCollapsed}
        setRecordMode={setRecordMode}
        setRecordProjectQuery={setRecordProjectQuery}
        setRecordScopePickerOpen={setRecordScopePickerOpen}
        setRecordSearchOpen={setRecordSearchOpen}
        setRecordSearchQuery={setRecordSearchQuery}
        visibleRecords={visibleRecords}
        windowFocusClass={noteWindowFocusClass}
      />
    );
  }

  if (surface === "update") {
    return (
      <UpdateSurface
        updateStatus={updateStatus}
        onCheckForUpdates={() => void handleCheckForUpdates()}
        onInstallUpdate={() => void handleInstallUpdate()}
        onCloseWindow={() => void window.workshopDesktop.closeWindow()}
      />
    );
  }

  if (!isLoggedIn(config) && surface !== "home" && surface !== "tray") {
    if (surface === "sticky") {
      return (
        <StickyLoginRequiredSurface
          closeStickyWindow={() => void closeStickyWindow()}
          focusPulseVisible={focusPulseVisible}
          handleArrangeStickyWindows={() => void handleArrangeStickyWindows()}
          isSingleTaskSticky={isSingleTaskSticky}
          windowFocusClass={noteWindowFocusClass}
        />
      );
    }

    return (
      <LoginSurface
        error={error}
        isLoggingIn={isLoggingIn}
        isSavingConfig={isSavingConfig}
        isSendingCode={isSendingCode}
        loginCode={loginCode}
        loginCodeType={loginCodeType}
        loginReady={loginReady}
        loginTarget={loginTarget}
        sendCooldown={sendCooldown}
        onLogin={(event) => void handleLogin(event)}
        onSendVerification={() => void handleSendVerification()}
        setLoginCode={setLoginCode}
        setLoginCodeType={setLoginCodeType}
        setLoginTarget={setLoginTarget}
      />
    );
  }

  if (surface === "home") {
    return (
      <>
        <HomeSurface
          codexRuns={codexRuns}
          error={error}
          hasManualUpdate={config.lastSeenManualRevision !== manualRevision}
          isLoading={isLoading}
          isRemoteConnected={isLoggedIn(config)}
          isRemoteLoginOpen={isRemoteLoginOpen}
          isLoggingIn={isLoggingIn}
          isSendingCode={isSendingCode}
          localProjects={config.localProjects}
          loginCode={loginCode}
          loginCodeType={loginCodeType}
          loginReady={loginReady}
          loginTarget={loginTarget}
          localProjectRecordCounts={localProjectRecordCounts}
          projectRecordCounts={projectRecordCounts}
          projectLocalDirectories={config.projectLocalDirectories}
          projectTodoGroups={projectTodoGroups}
          recentTasks={recentTasks}
          sendCooldown={sendCooldown}
          updateStatus={updateStatus}
          isCreatingLocalProject={isCreatingLocalProject}
          loadData={() => void loadData()}
          hideProjectTaskPreview={hideProjectTaskPreview}
          onLogin={(event) => void handleLogin(event)}
          onLogout={() => void handleLogout()}
          onOpenManual={() => void window.workshopDesktop.openManual()}
          onOpenCreateLocalProject={() => void handleCreateLocalProject()}
          onOpenPersonalRecords={() => void window.workshopDesktop.openPersonalRecord()}
          onOpenRemoteLogin={() => {
            setError("");
            setIsRemoteLoginOpen(true);
          }}
          onOpenSettings={() => void window.workshopDesktop.openSettings()}
          onOpenSticky={() => void window.workshopDesktop.openSticky()}
          onCloseRemoteLogin={() => setIsRemoteLoginOpen(false)}
          onLocalProjectDirectoryClick={(localProjectId) => void handleLocalProjectDirectoryClick(localProjectId)}
          onLocalProjectRecord={openLocalProjectRecord}
          onProjectHover={showProjectTaskPreview}
          onProjectRecord={openProjectRecord}
          onRemoteProjectDirectoryClick={(projectId) => void handleProjectDirectoryClick(projectId, "sticky")}
          onRenameLocalProject={openRenameLocalProject}
          onSendVerification={() => void handleSendVerification()}
          setLoginCode={setLoginCode}
          setLoginCodeType={setLoginCodeType}
          setLoginTarget={setLoginTarget}
          onTaskOpen={openTaskDetail}
        />
        {renameLocalProjectDialog}
      </>
    );
  }

  if (surface === "sticky") {
    const isStickyContentCollapsed = stickyListCollapsed && !isSingleTaskSticky;
    const stickyHeader = getStickyHeader({
      filteredTaskCount: filteredTasks.length,
      isSingleTaskSticky,
      projectFilter,
      selectedProjectName,
      selectedTask
    });
    const stickyProjectId = !isSingleTaskSticky && projectFilter !== "all" ? Number(projectFilter) : undefined;

    return (
      <StickySurface
        busyTaskId={busyTaskId}
        canExtractTasks={canExtractTasks}
        closeStickyWindow={() => void closeStickyWindow()}
        completingTaskIds={completingTaskIds}
        config={config}
        error={error}
        extractTaskToSticky={extractTaskToSticky}
        filteredTasks={filteredTasks}
        focusPulseVisible={focusPulseVisible}
        handleArrangeStickyWindows={() => void handleArrangeStickyWindows()}
        handleProjectDirectoryClick={(projectId) => void handleProjectDirectoryClick(projectId, "sticky")}
        handleStickyAlwaysOnTop={(enabled) => void handleStickyAlwaysOnTop(enabled)}
        isLoading={isLoading}
        isSingleTaskSticky={isSingleTaskSticky}
        isStickyContentCollapsed={isStickyContentCollapsed}
        onOpenProjectRecord={() =>
          void window.workshopDesktop.openPersonalRecord({
            scopeType: "project",
            projectId: Number(projectFilter),
            projectName: selectedProjectName
          })
        }
        onTaskArchive={() => handleTaskArchive()}
        openTaskDetail={openTaskDetail}
        saveTaskNoteNow={() => void saveTaskNoteNow()}
        selectedProjectName={selectedProjectName}
        selectedTask={selectedTask}
        setStickyListCollapsed={setStickyListCollapsed}
        stickyHeader={stickyHeader}
        stickyListCollapsed={stickyListCollapsed}
        stickyProjectId={stickyProjectId}
        taskMessage={taskMessage}
        taskNoteBody={taskNoteBody}
        updateTaskNoteBody={(body) => {
          taskNoteBodyRef.current = body;
          taskNoteDirtyRef.current = true;
          setTaskNoteBody(body);
          setTaskNoteDirty(true);
        }}
        updateTaskState={(nextTask, state) => void updateTaskState(nextTask, state)}
        sendTaskToCodex={(task) => void sendTaskToCodex(task)}
        windowFocusClass={noteWindowFocusClass}
      />
    );
  }

  return (
    <>
      <TraySurface
        codexRuns={codexRuns}
        error={error}
        hoveredProjectId={hoveredProjectId}
        isLoading={isLoading}
        localProjects={config.localProjects}
        localProjectRecordCounts={localProjectRecordCounts}
        projectRecordCounts={projectRecordCounts}
        projectLocalDirectories={config.projectLocalDirectories}
        projectTodoGroups={projectTodoGroups}
        updateStatus={updateStatus}
        hasManualUpdate={config.lastSeenManualRevision !== manualRevision}
        hideProjectTaskPreview={hideProjectTaskPreview}
        loadData={() => void loadData()}
        onLocalProjectDirectoryClick={(localProjectId) => void handleLocalProjectDirectoryClick(localProjectId)}
        onLocalProjectRecord={openLocalProjectRecord}
        onOpenHome={() => void window.workshopDesktop.openHome()}
        onOpenManual={() => void window.workshopDesktop.openManual()}
        onOpenSettings={() => void window.workshopDesktop.openSettings()}
        onProjectHover={showProjectTaskPreview}
        onRemoteProjectDirectoryClick={(projectId) => void handleProjectDirectoryClick(projectId, "sticky")}
        onProjectRecord={openProjectRecord}
        onRenameLocalProject={openRenameLocalProject}
      />
      {renameLocalProjectDialog}
    </>
  );
}
