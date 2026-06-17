export type RenderJobStatus = 'running' | 'queued' | 'failed' | 'success';

export type RenderDestination = 'youtube' | 'tiktok' | 'web';

export interface RenderIntegrityCheck {
  label: string;
  ok: boolean;
}

export interface RenderJob {
  id: string;
  projectName: string;
  template: string;
  destination: RenderDestination;
  status: RenderJobStatus;
  progress: number;
  command: string;
  framesDone: number;
  framesTotal: number;
  eta: string;
  speedFps: number;
  destinationPath: string;
  integrityChecks: RenderIntegrityCheck[];
  logs: string[];
  error?: string;
}

export interface VideoFactoryFormValues {
  projectName: string;
  template: string;
  destination: RenderDestination | '';
  datasetPath: string;
  assetsPath: string;
  voiceoverPath: string;
}
