import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  cancelTask,
  clearFinishedTasks,
  enqueueTask as enqueueTaskApi,
  fetchTaskJob,
  fetchTaskJobLogs,
  fetchTaskQueue,
  pauseTaskQueue,
  resumeTaskQueue,
  TASK_QUEUE_STREAM_URL,
} from '../api/taskQueue';
import { useToast } from '../components/ui';
import type {
  AddSourceTaskPayload,
  CreateVideoTaskPayload,
  UploadVideoTaskPayload,
  EnqueueTaskInput,
  TaskJob,
  TaskJobListItem,
  TaskLogEntry,
  TaskStatus,
} from '../types/taskQueue';
import { isActiveTaskStatus, isTerminalTaskStatus, mergeTaskJob } from '../types/taskQueue';

type PopupView = 'open' | 'minimized' | 'closed';

interface TaskCompletionHandler {
  onComplete?: (job: TaskJob) => void;
  onFail?: (job: TaskJob) => void;
}

interface TaskQueueContextValue {
  jobs: TaskJobListItem[];
  paused: boolean;
  popupView: PopupView;
  setPopupView: (view: PopupView) => void;
  liveJobId: string | null;
  setLiveJobId: (id: string | null) => void;
  getJobDetail: (id: string) => TaskJob | null;
  enqueueTask: (input: EnqueueTaskInput, handlers?: TaskCompletionHandler) => Promise<TaskJob>;
  retryJob: (job: TaskJobListItem) => Promise<TaskJob>;
  cancelJob: (id: string) => Promise<void>;
  togglePause: () => Promise<void>;
  clearFinishedJobs: () => Promise<number>;
  refresh: () => Promise<void>;
  refreshJob: (id: string) => Promise<TaskJob>;
  summary: {
    running: number;
    queued: number;
    failed: number;
  };
}

const TaskQueueContext = createContext<TaskQueueContextValue | null>(null);

const POLL_IDLE_MS = 30_000;
const POLL_ACTIVE_MS = 4_000;
const POLL_LIVE_LIST_MS = 5_000;
const POLL_LIVE_LOGS_MS = 1_000;

function sortJobs<T extends { status: TaskStatus; createdAt: string }>(jobs: T[]): T[] {
  const order: Record<TaskStatus, number> = {
    running: 0,
    queued: 1,
    failed: 2,
    completed: 3,
    cancelled: 4,
  };
  return [...jobs].sort((a, b) => {
    const byStatus = order[a.status] - order[b.status];
    if (byStatus !== 0) return byStatus;
    return b.createdAt.localeCompare(a.createdAt);
  });
}

function listItemFromJob(job: TaskJob): TaskJobListItem {
  const { result: _result, logs: _logs, ...item } = job;
  return {
    ...item,
    logCount: job.logs?.length ?? item.logCount ?? 0,
  };
}

function getListIntervalMs(jobs: TaskJobListItem[], liveJobId: string | null): number {
  const hasActive = jobs.some(job => isActiveTaskStatus(job.status));
  if (!hasActive) return POLL_IDLE_MS;
  if (liveJobId) return POLL_LIVE_LIST_MS;
  return POLL_ACTIVE_MS;
}

export function TaskQueueProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast();
  const [jobs, setJobs] = useState<TaskJobListItem[]>([]);
  const [paused, setPaused] = useState(false);
  const [popupView, setPopupView] = useState<PopupView>('closed');
  const [liveJobId, setLiveJobId] = useState<string | null>(null);
  const [detailVersion, setDetailVersion] = useState(0);

  const handlersRef = useRef<Map<string, TaskCompletionHandler>>(new Map());
  const notifiedRef = useRef<Set<string>>(new Set());
  const jobDetailsRef = useRef<Map<string, TaskJob>>(new Map());
  const logOffsetsRef = useRef<Map<string, number>>(new Map());
  const sseConnectedRef = useRef(false);
  const listTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const liveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tabVisibleRef = useRef(!document.hidden);
  const jobsRef = useRef(jobs);
  const liveJobIdRef = useRef(liveJobId);
  const toastRef = useRef(toast);

  jobsRef.current = jobs;
  liveJobIdRef.current = liveJobId;
  toastRef.current = toast;

  const bumpDetail = useCallback(() => setDetailVersion(v => v + 1), []);

  const clearPollTimers = useCallback(() => {
    if (listTimerRef.current) {
      clearTimeout(listTimerRef.current);
      listTimerRef.current = null;
    }
    if (liveTimerRef.current) {
      clearTimeout(liveTimerRef.current);
      liveTimerRef.current = null;
    }
  }, []);

  const handleTerminalJob = useCallback((job: TaskJobListItem) => {
    if (!isTerminalTaskStatus(job.status)) return;
    if (notifiedRef.current.has(job.id)) return;
    notifiedRef.current.add(job.id);

    const handlers = handlersRef.current.get(job.id);
    const merged = mergeTaskJob(job, jobDetailsRef.current.get(job.id) ?? null);

    if (job.status === 'completed') {
      if (job.type === 'add_source') {
        toastRef.current.success(`Source "${job.title.replace(/^Importing:\s*/, '')}" added successfully`);
      } else if (job.type === 'create_video') {
        toastRef.current.success(job.videoId ? `Created video from ${job.videoId}` : 'Video created successfully');
      } else if (job.type === 'upload_video') {
        toastRef.current.success('YouTube upload completed');
      } else if (job.type === 'download_source') {
        toastRef.current.success('Source videos downloaded');
      }
      handlers?.onComplete?.(merged);
    } else if (job.status === 'failed') {
      if (handlers?.onFail) {
        handlers.onFail(merged);
      } else {
        toastRef.current.error(job.error ?? 'Task failed');
      }
    }
    handlersRef.current.delete(job.id);
  }, []);

  const applyListItem = useCallback((item: TaskJobListItem) => {
    setJobs(current => sortJobs(current.map(job => (job.id === item.id ? item : job))));
  }, []);

  const applyFullJob = useCallback(
    (job: TaskJob) => {
      jobDetailsRef.current.set(job.id, job);
      logOffsetsRef.current.set(job.id, job.logs?.length ?? 0);
      setJobs(current =>
        sortJobs(
          current.some(entry => entry.id === job.id)
            ? current.map(entry => (entry.id === job.id ? listItemFromJob(job) : entry))
            : [listItemFromJob(job), ...current],
        ),
      );
      bumpDetail();
    },
    [bumpDetail],
  );

  const appendLogEntry = useCallback(
    (jobId: string, entry: TaskLogEntry, total: number) => {
      const existing = jobDetailsRef.current.get(jobId);
      const listItem = jobsRef.current.find(job => job.id === jobId);

      if (existing) {
        const logs = [...(existing.logs ?? []), entry].slice(-300);
        jobDetailsRef.current.set(jobId, { ...existing, logs, updatedAt: new Date().toISOString() });
      } else if (listItem) {
        jobDetailsRef.current.set(jobId, { ...listItem, logs: [entry] });
      }

      logOffsetsRef.current.set(jobId, total);
      setJobs(current => current.map(job => (job.id === jobId ? { ...job, logCount: total, updatedAt: new Date().toISOString() } : job)));
      bumpDetail();
    },
    [bumpDetail],
  );

  const removeJobsByIds = useCallback(
    (ids: string[]) => {
      if (ids.length === 0) return;
      const idSet = new Set(ids);
      setJobs(current => current.filter(job => !idSet.has(job.id)));
      for (const id of ids) {
        jobDetailsRef.current.delete(id);
        logOffsetsRef.current.delete(id);
        handlersRef.current.delete(id);
        notifiedRef.current.delete(id);
      }
      setLiveJobId(current => (current && idSet.has(current) ? null : current));
      bumpDetail();
    },
    [bumpDetail],
  );

  const pollList = useCallback(async () => {
    const data = await fetchTaskQueue({ view: 'summary' });
    setJobs(sortJobs(data.items));
    setPaused(data.paused);
    for (const job of data.items) {
      handleTerminalJob(job);
    }
  }, [handleTerminalJob]);

  const refresh = useCallback(async () => {
    await pollList();
  }, [pollList]);

  const refreshJob = useCallback(
    async (id: string) => {
      const { item } = await fetchTaskJob(id);
      applyFullJob(item);
      handleTerminalJob(listItemFromJob(item));
      return item;
    },
    [applyFullJob, handleTerminalJob],
  );

  const handleTerminalJobRef = useRef(handleTerminalJob);
  const applyListItemRef = useRef(applyListItem);
  const appendLogEntryRef = useRef(appendLogEntry);
  const refreshJobRef = useRef(refreshJob);
  const removeJobsByIdsRef = useRef(removeJobsByIds);
  handleTerminalJobRef.current = handleTerminalJob;
  applyListItemRef.current = applyListItem;
  appendLogEntryRef.current = appendLogEntry;
  refreshJobRef.current = refreshJob;
  removeJobsByIdsRef.current = removeJobsByIds;

  const pollLiveLogs = useCallback(async () => {
    const currentLiveJobId = liveJobIdRef.current;
    if (!currentLiveJobId) return;

    const job = jobsRef.current.find(entry => entry.id === currentLiveJobId);
    if (!job || job.type !== 'create_video' || job.status !== 'running') return;

    const after = logOffsetsRef.current.get(currentLiveJobId) ?? job.logCount ?? 0;
    const data = await fetchTaskJobLogs(currentLiveJobId, after);
    if (data.logs.length === 0) {
      logOffsetsRef.current.set(currentLiveJobId, data.total);
      return;
    }

    const existing = jobDetailsRef.current.get(currentLiveJobId);
    const baseLogs = existing?.logs ?? [];
    const mergedLogs = [...baseLogs, ...data.logs].slice(-300);
    jobDetailsRef.current.set(currentLiveJobId, {
      ...mergeTaskJob(job, existing ?? null),
      logs: mergedLogs,
    });
    logOffsetsRef.current.set(currentLiveJobId, data.total);
    setJobs(current =>
      current.map(entry =>
        entry.id === currentLiveJobId ? { ...entry, logCount: data.total, updatedAt: new Date().toISOString() } : entry,
      ),
    );
    bumpDetail();
  }, [bumpDetail]);

  const scheduleListPollRef = useRef<() => void>(() => undefined);
  const scheduleLivePollRef = useRef<() => void>(() => undefined);

  scheduleListPollRef.current = () => {
    if (listTimerRef.current) clearTimeout(listTimerRef.current);
    if (!tabVisibleRef.current || sseConnectedRef.current) return;

    listTimerRef.current = setTimeout(
      () => {
        void pollList()
          .catch(() => undefined)
          .finally(() => scheduleListPollRef.current());
      },
      getListIntervalMs(jobsRef.current, liveJobIdRef.current),
    );
  };

  scheduleLivePollRef.current = () => {
    if (liveTimerRef.current) clearTimeout(liveTimerRef.current);
    if (!tabVisibleRef.current || !liveJobIdRef.current || sseConnectedRef.current) return;

    const job = jobsRef.current.find(entry => entry.id === liveJobIdRef.current);
    if (!job || job.type !== 'create_video' || job.status !== 'running') return;

    liveTimerRef.current = setTimeout(() => {
      void pollLiveLogs()
        .catch(() => undefined)
        .finally(() => scheduleLivePollRef.current());
    }, POLL_LIVE_LOGS_MS);
  };

  useEffect(() => {
    void pollList().catch(() => undefined);
    scheduleListPollRef.current();
    return clearPollTimers;
  }, [clearPollTimers, pollList]);

  useEffect(() => {
    scheduleLivePollRef.current();
  }, [liveJobId, jobs]);

  useEffect(() => {
    const onVisibility = () => {
      tabVisibleRef.current = !document.hidden;
      if (document.hidden) {
        clearPollTimers();
        return;
      }
      void pollList().catch(() => undefined);
      scheduleListPollRef.current();
      scheduleLivePollRef.current();
    };

    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [clearPollTimers, pollList]);

  useEffect(() => {
    const source = new EventSource(TASK_QUEUE_STREAM_URL);

    const onOpen = () => {
      sseConnectedRef.current = true;
      clearPollTimers();
    };

    const onSnapshot = (event: MessageEvent<string>) => {
      try {
        const data = JSON.parse(event.data) as { items: TaskJobListItem[]; paused: boolean };
        sseConnectedRef.current = true;
        setJobs(sortJobs(data.items));
        setPaused(data.paused);
        for (const job of data.items) handleTerminalJobRef.current(job);
      } catch {
        /* ignore malformed snapshot */
      }
    };

    const onJobUpdated = (event: MessageEvent<string>) => {
      try {
        const data = JSON.parse(event.data) as { job: TaskJobListItem };
        sseConnectedRef.current = true;
        applyListItemRef.current(data.job);
        handleTerminalJobRef.current(data.job);
        if (data.job.id === liveJobIdRef.current && isTerminalTaskStatus(data.job.status)) {
          void refreshJobRef.current(data.job.id).catch(() => undefined);
        }
      } catch {
        /* ignore malformed event */
      }
    };

    const onLogAppended = (event: MessageEvent<string>) => {
      try {
        const data = JSON.parse(event.data) as {
          jobId: string;
          entry: TaskLogEntry;
          total: number;
        };
        sseConnectedRef.current = true;
        if (data.jobId === liveJobIdRef.current || jobDetailsRef.current.has(data.jobId)) {
          appendLogEntryRef.current(data.jobId, data.entry, data.total);
        } else {
          setJobs(current =>
            current.map(job => (job.id === data.jobId ? { ...job, logCount: data.total, updatedAt: new Date().toISOString() } : job)),
          );
        }
      } catch {
        /* ignore malformed event */
      }
    };

    const onJobsCleared = (event: MessageEvent<string>) => {
      try {
        const data = JSON.parse(event.data) as { ids: string[] };
        sseConnectedRef.current = true;
        removeJobsByIdsRef.current(data.ids);
      } catch {
        /* ignore malformed event */
      }
    };

    const onError = () => {
      if (source.readyState === EventSource.CLOSED) {
        sseConnectedRef.current = false;
        scheduleListPollRef.current();
        scheduleLivePollRef.current();
      }
    };

    source.addEventListener('open', onOpen);
    source.addEventListener('snapshot', onSnapshot);
    source.addEventListener('job_updated', onJobUpdated);
    source.addEventListener('log_appended', onLogAppended);
    source.addEventListener('jobs_cleared', onJobsCleared);
    source.onerror = onError;

    return () => {
      sseConnectedRef.current = false;
      source.removeEventListener('open', onOpen);
      source.removeEventListener('snapshot', onSnapshot);
      source.removeEventListener('job_updated', onJobUpdated);
      source.removeEventListener('log_appended', onLogAppended);
      source.removeEventListener('jobs_cleared', onJobsCleared);
      source.onerror = null;
      source.close();
    };
  }, [clearPollTimers]);

  useEffect(() => {
    if (!liveJobId) return;
    const job = jobs.find(entry => entry.id === liveJobId);
    if (!job || (job.type !== 'create_video' && job.type !== 'upload_video' && job.type !== 'download_source')) return;

    if (!jobDetailsRef.current.has(liveJobId) || (job.logCount ?? 0) > (jobDetailsRef.current.get(liveJobId)?.logs?.length ?? 0)) {
      void refreshJob(liveJobId).catch(() => undefined);
    }
  }, [liveJobId, jobs, refreshJob]);

  const getJobDetail = useCallback(
    (id: string): TaskJob | null => {
      const item = jobs.find(job => job.id === id);
      if (!item) return jobDetailsRef.current.get(id) ?? null;
      return mergeTaskJob(item, jobDetailsRef.current.get(id) ?? null);
    },
    // detailVersion forces recompute when logs mutate in ref
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [jobs, detailVersion],
  );

  const enqueueTask = useCallback(
    async (input: EnqueueTaskInput, handlers?: TaskCompletionHandler) => {
      try {
        const { item } = await enqueueTaskApi(input);
        if (handlers) handlersRef.current.set(item.id, handlers);
        applyFullJob(item);
        setPopupView('open');
        void refresh();
        return item;
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to enqueue task');
        throw err;
      }
    },
    [applyFullJob, refresh, toast],
  );

  const retryJob = useCallback(
    async (job: TaskJobListItem) => {
      if (job.type === 'add_source') {
        return enqueueTask({
          type: 'add_source',
          title: job.title,
          subtitle: job.subtitle,
          payload: job.payload as AddSourceTaskPayload,
        });
      }
      if (job.type === 'upload_video') {
        return enqueueTask({
          type: 'upload_video',
          title: job.title,
          subtitle: job.subtitle,
          payload: job.payload as UploadVideoTaskPayload,
        });
      }
      return enqueueTask({
        type: 'create_video',
        title: job.title,
        subtitle: job.subtitle,
        payload: job.payload as CreateVideoTaskPayload,
      });
    },
    [enqueueTask],
  );

  const cancelJob = useCallback(
    async (id: string) => {
      const { item } = await cancelTask(id);
      applyFullJob(item);
    },
    [applyFullJob],
  );

  const togglePause = useCallback(async () => {
    const result = paused ? await resumeTaskQueue() : await pauseTaskQueue();
    setPaused(result.paused);
    toast.success(result.paused ? 'Task queue paused' : 'Task queue resumed');
    await refresh();
  }, [paused, refresh, toast]);

  const clearFinishedJobs = useCallback(async () => {
    try {
      const { removed, ids } = await clearFinishedTasks();
      removeJobsByIds(ids);
      if (removed > 0) {
        toast.success(`Cleared ${removed} finished job${removed === 1 ? '' : 's'}`);
      }
      return removed;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to clear finished jobs');
      throw err;
    }
  }, [removeJobsByIds, toast]);

  const summary = useMemo(
    () => ({
      running: jobs.filter(job => job.status === 'running').length,
      queued: jobs.filter(job => job.status === 'queued').length,
      failed: jobs.filter(job => job.status === 'failed').length,
    }),
    [jobs],
  );

  const value = useMemo(
    () => ({
      jobs,
      paused,
      popupView,
      setPopupView,
      liveJobId,
      setLiveJobId,
      getJobDetail,
      enqueueTask,
      retryJob,
      cancelJob,
      togglePause,
      clearFinishedJobs,
      refresh,
      refreshJob,
      summary,
    }),
    [
      jobs,
      paused,
      popupView,
      liveJobId,
      getJobDetail,
      enqueueTask,
      retryJob,
      cancelJob,
      togglePause,
      clearFinishedJobs,
      refresh,
      refreshJob,
      summary,
    ],
  );

  return <TaskQueueContext.Provider value={value}>{children}</TaskQueueContext.Provider>;
}

export function useTaskQueue(): TaskQueueContextValue {
  const ctx = useContext(TaskQueueContext);
  if (!ctx) throw new Error('useTaskQueue must be used within TaskQueueProvider');
  return ctx;
}
