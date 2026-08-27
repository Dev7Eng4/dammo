import { AppError } from '../../shared/http/errors.js';
import { taskQueueRepository } from './task-queue.repository.js';
import {
  buildCreateVideoStages,
  CREATE_VIDEO_STAGE_IDS,
  type TaskErrorDetails,
} from './task-queue.types.js';

export function toTaskErrorDetails(err: unknown): TaskErrorDetails | undefined {
  if (!(err instanceof AppError)) return undefined;
  const details = err.details ?? {};
  const missingFields = Array.isArray(details.missingFields)
    ? details.missingFields.filter((item): item is string => typeof item === 'string')
    : undefined;
  return {
    ...(err.code ? { code: err.code } : {}),
    ...(details.step !== undefined ? { step: details.step as string | number } : {}),
    ...(typeof details.attempt === 'number' ? { attempt: details.attempt } : {}),
    ...(typeof details.reason === 'string' ? { reason: details.reason } : {}),
    ...(missingFields?.length ? { missingFields } : {}),
    ...(typeof details.snippet === 'string' ? { snippet: details.snippet } : {}),
    ...(typeof details.responsePath === 'string' ? { responsePath: details.responsePath } : {}),
    ...(typeof details.context === 'string' ? { context: details.context } : {}),
  };
}

export function errorMessageFromUnknown(err: unknown, fallback = 'Task failed'): string {
  if (err instanceof AppError) return err.message;
  if (err instanceof Error) return err.message;
  return fallback;
}

export function initCreateVideoStages(
  taskJobId: string,
  options?: { copyingAssets?: boolean; includeUpdateTranscript?: boolean },
): void {
  const stages = buildCreateVideoStages(options);
  taskQueueRepository.initStages(taskJobId, stages);
}

export function startCreateVideoStage(taskJobId: string | undefined, stageId: string): void {
  if (!taskJobId) return;
  taskQueueRepository.startStage(taskJobId, stageId);
}

export function completeCreateVideoStage(taskJobId: string | undefined, stageId: string): void {
  if (!taskJobId) return;
  taskQueueRepository.completeStage(taskJobId, stageId);
}

export function skipCreateVideoStage(taskJobId: string | undefined, stageId: string): void {
  if (!taskJobId) return;
  taskQueueRepository.skipStage(taskJobId, stageId);
}

export function failCreateVideoStage(taskJobId: string | undefined, stageId: string, err: unknown): void {
  if (!taskJobId) return;
  const message = errorMessageFromUnknown(err, 'Stage failed');
  const details = toTaskErrorDetails(err);
  taskQueueRepository.failStage(taskJobId, stageId, message, details);

  taskQueueRepository.appendLogMessage(taskJobId, 'err', message);
  if (details?.missingFields?.length) {
    taskQueueRepository.appendLogMessage(taskJobId, 'err', `Missing fields: ${details.missingFields.join(', ')}`);
  }
  if (details?.snippet) {
    taskQueueRepository.appendLogMessage(taskJobId, 'err', `Response snippet: ${details.snippet}`);
  }
  if (details?.responsePath) {
    taskQueueRepository.appendLogMessage(taskJobId, 'err', `LLM response saved: ${details.responsePath}`);
  }
}

export { CREATE_VIDEO_STAGE_IDS };
