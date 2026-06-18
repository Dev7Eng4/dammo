import { useEffect, useMemo, useState } from 'react';
import { TaskJobCard } from '../components/task-queue/TaskJobCard';
import { TaskJobLiveOutputPanel } from '../components/task-queue/TaskJobLiveOutputPanel';
import { TaskQueuePageToolbar } from '../components/task-queue/TaskQueuePageToolbar';
import { useToast } from '../components/ui';
import { useDebouncedValue, useTaskQueue } from '../hooks';
import { matchesTaskSearch } from '../utils/taskQueue';
import type { TaskJobListItem } from '../types/taskQueue';

const SEARCH_DEBOUNCE_MS = 300;

function findAutoSelectJobId(jobs: TaskJobListItem[]): string | null {
  return jobs.find((job) => job.type === 'create_video' && job.status === 'running')?.id ?? null;
}

export function TaskQueuePage() {
  const { toast } = useToast();
  const {
    jobs,
    summary,
    cancelJob,
    retryJob,
    togglePause,
    paused,
    refresh,
    setLiveJobId,
    getJobDetail,
  } = useTaskQueue();
  const [search, setSearch] = useState('');
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const debouncedSearch = useDebouncedValue(search, SEARCH_DEBOUNCE_MS);

  const activeCount = summary.running + summary.queued;

  const filteredJobs = useMemo(
    () => jobs.filter((job) => matchesTaskSearch(job, debouncedSearch)),
    [jobs, debouncedSearch],
  );

  const selectedJob = useMemo(
    () => (selectedJobId ? getJobDetail(selectedJobId) : null),
    [getJobDetail, selectedJobId],
  );

  useEffect(() => {
    if (selectedJobId) return;
    const autoId = findAutoSelectJobId(jobs);
    if (autoId) setSelectedJobId(autoId);
  }, [jobs, selectedJobId]);

  useEffect(() => {
    if (!selectedJobId) {
      setLiveJobId(null);
      return;
    }
    const job = jobs.find((entry) => entry.id === selectedJobId);
    if (job?.type === 'create_video' && job.status === 'running') {
      setLiveJobId(selectedJobId);
      return;
    }
    setLiveJobId(null);
  }, [jobs, selectedJobId, setLiveJobId]);

  async function handleCopyPath(path: string) {
    try {
      await navigator.clipboard.writeText(path);
      toast.success('Output path copied to clipboard');
    } catch {
      toast.error('Failed to copy path');
    }
  }

  function handleSelectJob(job: TaskJobListItem) {
    if (job.type !== 'create_video') return;
    setSelectedJobId(job.id);
  }

  function handleClosePanel() {
    setSelectedJobId(null);
    setLiveJobId(null);
  }

  return (
    <div className="-m-6 flex h-[calc(100svh-3.5rem)] flex-col lg:flex-row">
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto p-6">
          <TaskQueuePageToolbar
            activeCount={activeCount}
            totalCount={jobs.length}
            search={search}
            paused={paused}
            onSearchChange={setSearch}
            onRefresh={() => void refresh()}
            onTogglePause={() => void togglePause()}
          />

          <div className="mt-6 space-y-3">
            {filteredJobs.length === 0 ? (
              <div className="card-surface rounded-2xl px-5 py-12 text-center">
                <p className="text-sm text-neutral-500">
                  {jobs.length === 0 ? 'No tasks in queue yet' : 'No jobs match your search'}
                </p>
              </div>
            ) : (
              filteredJobs.map((job) => (
                <TaskJobCard
                  key={job.id}
                  job={job}
                  selected={job.id === selectedJobId}
                  onSelect={handleSelectJob}
                  onCancel={(id) => void cancelJob(id)}
                  onRetry={(item) => void retryJob(item)}
                  onCopyPath={(path) => void handleCopyPath(path)}
                />
              ))
            )}
          </div>
        </div>
      </div>

      {selectedJob && selectedJob.type === 'create_video' ? (
        <>
          <button
            type="button"
            aria-label="Close live output panel"
            onClick={handleClosePanel}
            className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          />
          <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-sm lg:static lg:z-auto lg:max-w-none">
            <TaskJobLiveOutputPanel job={selectedJob} onClose={handleClosePanel} />
          </div>
        </>
      ) : null}
    </div>
  );
}
