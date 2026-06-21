import { AppError } from '../../shared/http/errors.js';
import { taskQueueRepository } from './task-queue.repository.js';
import type {
  EnqueueTaskInput,
  TaskJob,
  TaskJobLogsResponse,
  TaskJobSummary,
  TaskQueueListResponse,
} from './task-queue.types.js';
import type { z } from 'zod';
import type { enqueueTaskSchema } from './task-queue.schema.js';

type EnqueueBody = z.infer<typeof enqueueTaskSchema>;
export type TaskQueueListView = 'full' | 'summary';

function buildEnqueueInput(body: EnqueueBody): EnqueueTaskInput {
  if (body.type === 'add_source') {
    return {
      type: 'add_source',
      title: body.title ?? `Importing: ${body.payload.url}`,
      subtitle: body.subtitle ?? body.payload.purpose,
      payload: body.payload,
    };
  }

  const name = body.payload.channelName ?? body.payload.channelHandle ?? body.payload.channelId;
  return {
    type: 'create_video',
    title: body.title ?? `Creating video: ${name}`,
    subtitle: body.subtitle ?? body.payload.channelHandle,
    payload: body.payload,
  };
}

export class TaskQueueService {
  list(view: TaskQueueListView = 'full'): TaskQueueListResponse {
    if (view === 'summary') {
      return {
        items: taskQueueRepository.listSummaries(),
        paused: taskQueueRepository.isPaused(),
      };
    }
    return {
      items: taskQueueRepository.listAll(),
      paused: taskQueueRepository.isPaused(),
    };
  }

  getById(id: string): TaskJob {
    const job = taskQueueRepository.findById(id);
    if (!job) throw new AppError('Task not found', 404, 'NOT_FOUND');
    return job;
  }

  getLogs(id: string, after = 0): TaskJobLogsResponse {
    this.getById(id);
    return taskQueueRepository.getLogs(id, after);
  }

  enqueue(body: EnqueueBody): TaskJob {
    return taskQueueRepository.create(buildEnqueueInput(body));
  }

  cancel(id: string): TaskJob {
    const job = this.getById(id);
    if (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') {
      throw new AppError('Task cannot be cancelled', 400, 'INVALID_STATE');
    }
    if (job.status === 'running') {
      throw new AppError('Running tasks cannot be cancelled yet', 400, 'TASK_RUNNING');
    }
    const updated = taskQueueRepository.setStatus(id, 'cancelled');
    if (!updated) throw new AppError('Task not found', 404, 'NOT_FOUND');
    return updated;
  }

  pause(): { paused: boolean } {
    taskQueueRepository.setPaused(true);
    return { paused: true };
  }

  resume(): { paused: boolean } {
    taskQueueRepository.setPaused(false);
    return { paused: false };
  }

  listSummariesForStream(): TaskJobSummary[] {
    return taskQueueRepository.listSummaries();
  }

  clearFinished(): { removed: number; ids: string[] } {
    return taskQueueRepository.clearFinished();
  }
}

export const taskQueueService = new TaskQueueService();
