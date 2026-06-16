export type RenderJobStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface RenderJob {
  id: string;
  fileName: string;
  inputPath: string;
  outputPath: string;
  status: RenderJobStatus;
  progress: number;
  eta: string;
  preset: string;
  createdAt: string;
  updatedAt: string;
  error?: string;
}

export interface CreateRenderJobInput {
  fileName: string;
  inputPath: string;
  preset?: string;
}
