import { taskQueueRepository } from '../../../task-queue/task-queue.repository.js';

/**
 * Thin wrapper over task-queue logging so steps never have to branch on whether
 * a taskJobId exists. When there is no job the logger is a no-op.
 */
export interface TaskLogger {
  /** False when nothing is recorded; use to skip building expensive progress callbacks. */
  readonly enabled: boolean;
  info(msg: string): void;
  ok(msg: string): void;
  err(msg: string): void;
}

const NOOP_LOGGER: TaskLogger = {
  enabled: false,
  info: () => undefined,
  ok: () => undefined,
  err: () => undefined,
};

export function createTaskLogger(taskJobId?: string): TaskLogger {
  if (!taskJobId) return NOOP_LOGGER;

  return {
    enabled: true,
    info: msg => taskQueueRepository.appendLogMessage(taskJobId, 'info', msg),
    ok: msg => taskQueueRepository.appendLogMessage(taskJobId, 'ok', msg),
    err: msg => taskQueueRepository.appendLogMessage(taskJobId, 'err', msg),
  };
}

/** Console-backed logger for CLI scripts that reuse pipeline steps/strategies. */
export function createConsoleTaskLogger(indent = '      '): TaskLogger {
  return {
    enabled: true,
    info: msg => console.log(`${indent}${msg}`),
    ok: msg => console.log(`${indent}${msg}`),
    err: msg => console.log(`${indent}${msg}`),
  };
}
