import { useMemo, useState } from 'react';
import { fetchRenderJobs } from '../api/renderQueue';
import { RenderJobDetailPanel } from '../components/render-queue/RenderJobDetailPanel';
import { RenderQueueTable } from '../components/render-queue/RenderQueueTable';
import { RenderQueueToolbar } from '../components/render-queue/RenderQueueToolbar';
import { useAbortableEffect } from '../hooks';
import type { RenderJob } from '../types/videoProduction';

function findInitialSelectedId(jobs: RenderJob[]): string | null {
  return jobs.find((job) => job.status === 'running')?.id ?? jobs[0]?.id ?? null;
}

export function RenderQueuePage() {
  const [jobs, setJobs] = useState<RenderJob[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useAbortableEffect(async (signal) => {
    setLoading(true);
    setError(null);

    try {
      const nextJobs = await fetchRenderJobs({ signal });
      setJobs(nextJobs);
      setSelectedId((current) =>
        current && nextJobs.some((job) => job.id === current) ? current : findInitialSelectedId(nextJobs),
      );
    } catch (err) {
      if (signal.aborted) return;
      setError(err instanceof Error ? err.message : 'Failed to load render queue');
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, []);

  const selectedJob = useMemo(
    () => jobs.find((job) => job.id === selectedId) ?? null,
    [jobs, selectedId],
  );

  function handleClosePanel() {
    setSelectedId(null);
  }

  if (error) {
    return (
      <div className="card-surface m-6 p-6 text-center">
        <p className="text-danger">{error}</p>
      </div>
    );
  }

  return (
    <div className="-m-6 flex h-svh flex-col lg:flex-row">
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto p-6">
          <div className="border-b border-border pb-4">
            <RenderQueueToolbar actionsDisabled />
          </div>

          <div className="mt-4 card-surface px-5 pt-3 pb-4">
            {loading ? (
              <p className="py-8 text-center text-sm text-neutral-400">Loading render jobs...</p>
            ) : jobs.length === 0 ? (
              <p className="py-8 text-center text-sm text-neutral-400">No render jobs in queue.</p>
            ) : (
              <RenderQueueTable jobs={jobs} selectedId={selectedId} onSelect={setSelectedId} />
            )}
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
              onCancelRender={() => undefined}
              onOpenProject={() => undefined}
              onViewOutput={() => undefined}
            />
          </div>
        </>
      ) : null}
    </div>
  );
}
