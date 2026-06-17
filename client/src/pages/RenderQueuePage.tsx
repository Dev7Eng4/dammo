import { useMemo, useState } from 'react';
import { mockRenderJobs } from '../data/mockRenderJobs';
import { RenderJobDetailPanel } from '../components/render-queue/RenderJobDetailPanel';
import { RenderQueueTable } from '../components/render-queue/RenderQueueTable';
import { RenderQueueToolbar } from '../components/render-queue/RenderQueueToolbar';
import { useToast } from '../components/ui';
import type { RenderJob } from '../types/videoProduction';

function findInitialSelectedId(jobs: RenderJob[]): string | null {
  return jobs.find((job) => job.status === 'running')?.id ?? jobs[0]?.id ?? null;
}

export function RenderQueuePage() {
  const { toast } = useToast();
  const [jobs, setJobs] = useState<RenderJob[]>(mockRenderJobs);
  const [selectedId, setSelectedId] = useState<string | null>(() => findInitialSelectedId(mockRenderJobs));
  const [queuePaused, setQueuePaused] = useState(false);

  const selectedJob = useMemo(
    () => jobs.find((job) => job.id === selectedId) ?? null,
    [jobs, selectedId],
  );

  function handleStartQueue() {
    toast.success(queuePaused ? 'Queue resumed (mock)' : 'Queue started (mock)');
    setQueuePaused(false);
  }

  function handlePauseQueue() {
    setQueuePaused((paused) => {
      toast.success(paused ? 'Queue resumed (mock)' : 'Queue paused (mock)');
      return !paused;
    });
  }

  function handleClearCompleted() {
    const nextJobs = jobs.filter((job) => job.status !== 'success');
    setJobs(nextJobs);
    setSelectedId((current) => (current && nextJobs.some((job) => job.id === current) ? current : findInitialSelectedId(nextJobs)));
    toast.success('Completed jobs cleared (mock)');
  }

  function handleRetryFailed() {
    setJobs((current) =>
      current.map((job) =>
        job.status === 'failed'
          ? { ...job, status: 'queued' as const, progress: 0, framesDone: 0, error: undefined }
          : job,
      ),
    );
    toast.success('Failed jobs re-queued (mock)');
  }

  function handleOpenRendersFolder() {
    toast.success('Open renders folder (mock)');
  }

  function handleCancelRender() {
    if (!selectedJob) return;
    setJobs((current) => current.filter((job) => job.id !== selectedJob.id));
    setSelectedId((current) => (current === selectedJob.id ? null : current));
    toast.success(`Cancelled ${selectedJob.id} (mock)`);
  }

  function handleOpenProject() {
    toast.success('Open project (mock)');
  }

  function handleViewOutput() {
    toast.success('View output (mock)');
  }

  function handleClosePanel() {
    setSelectedId(null);
  }

  return (
    <div className="-m-6 flex h-[calc(100svh-3.5rem)] flex-col lg:flex-row">
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto p-6">
          <div className="border-b border-border pb-4">
            <RenderQueueToolbar
              queuePaused={queuePaused}
              onStartQueue={handleStartQueue}
              onPauseQueue={handlePauseQueue}
              onClearCompleted={handleClearCompleted}
              onRetryFailed={handleRetryFailed}
              onOpenRendersFolder={handleOpenRendersFolder}
            />
          </div>

          <div className="mt-4 card-surface px-5 pt-3 pb-4">
            <RenderQueueTable jobs={jobs} selectedId={selectedId} onSelect={setSelectedId} />
          </div>
        </div>
      </div>

      {selectedJob ? (
        <>
          <button
            type="button"
            aria-label="Close detail panel"
            onClick={handleClosePanel}
            className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          />
          <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-sm lg:static lg:z-auto lg:max-w-none">
            <RenderJobDetailPanel
              job={selectedJob}
              onClose={handleClosePanel}
              onCancelRender={handleCancelRender}
              onOpenProject={handleOpenProject}
              onViewOutput={handleViewOutput}
            />
          </div>
        </>
      ) : null}
    </div>
  );
}
