import { API_V1 } from './config';
import { fetchJson, withSignal, type FetchOptions } from './http';
import type { RenderDestination, RenderJob, RenderJobStatus } from '../types/videoProduction';

type ApiRenderJobStatus = 'pending' | 'processing' | 'completed' | 'failed';

interface ApiRenderJob {
  id: string;
  fileName: string;
  inputPath: string;
  outputPath: string;
  status: ApiRenderJobStatus;
  progress: number;
  eta: string;
  preset: string;
  createdAt: string;
  updatedAt: string;
  error?: string;
}

function mapStatus(status: ApiRenderJobStatus): RenderJobStatus {
  switch (status) {
    case 'pending':
      return 'queued';
    case 'processing':
      return 'running';
    case 'completed':
      return 'success';
    case 'failed':
      return 'failed';
  }
}

function mapRenderJob(job: ApiRenderJob): RenderJob {
  return {
    id: job.id,
    projectName: job.fileName,
    template: job.preset || 'default',
    destination: 'web' satisfies RenderDestination,
    status: mapStatus(job.status),
    progress: job.progress,
    command: `ffmpeg render ${job.inputPath}`,
    framesDone: 0,
    framesTotal: 0,
    eta: job.eta || '--',
    speedFps: 0,
    destinationPath: job.outputPath,
    integrityChecks: [],
    logs: job.error ? [`[error] ${job.error}`] : [],
    error: job.error,
  };
}

export function fetchRenderJobs(options?: FetchOptions) {
  return fetchJson<ApiRenderJob[]>(`${API_V1}/render-queue`, withSignal(undefined, options)).then(jobs =>
    jobs.map(mapRenderJob),
  );
}

export interface EnqueueRenderJobInput {
  fileName: string;
  inputPath: string;
  preset?: string;
}

export function enqueueRenderJob(input: EnqueueRenderJobInput, options?: FetchOptions) {
  return fetchJson<{ item: ApiRenderJob }>(
    `${API_V1}/render-queue`,
    withSignal(
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      },
      options,
    ),
  ).then(response => mapRenderJob(response.item));
}
