/**
 * Job indexes shared by the Meta workers.
 *
 * A worker that finds no pending job keeps waiting while other jobs are still running, because a
 * running job can come back (its profile ran out of quota, its image could not be saved) and must
 * be picked up by a worker that still can.
 */
export class MetaJobQueue {
  private readonly pending: number[];
  private readonly finished = new Set<number>();
  private readonly waiters: Array<(jobIndex: number | undefined) => void> = [];
  private inFlight = 0;
  private notifyDrained: () => void = () => undefined;
  /** Resolves when every job is finished. */
  readonly drained: Promise<void>;

  constructor(private readonly total: number) {
    this.pending = Array.from({ length: total }, (_, index) => index);
    this.drained = new Promise(resolve => {
      this.notifyDrained = resolve;
    });
    if (total === 0) this.notifyDrained();
  }

  get isDrained(): boolean {
    return this.finished.size >= this.total;
  }

  /** Jobs nobody has finished (yet), in order. */
  unfinished(): number[] {
    return Array.from({ length: this.total }, (_, index) => index).filter(index => !this.finished.has(index));
  }

  /** Next job to run, or undefined when no job is left to run or to wait for. */
  async take(): Promise<number | undefined> {
    const jobIndex = this.pending.shift();
    if (jobIndex !== undefined) {
      this.inFlight += 1;
      return jobIndex;
    }
    if (this.inFlight === 0) return undefined;
    return new Promise(resolve => {
      this.waiters.push(resolve);
    });
  }

  /** The job is over: done or failed for good. */
  finish(jobIndex: number): void {
    this.finished.add(jobIndex);
    this.inFlight -= 1;
    if (this.isDrained) this.notifyDrained();
    this.releaseWaitersWhenIdle();
  }

  /** Hand a taken job back; it runs before the jobs that were not started yet. */
  requeue(jobIndex: number): void {
    const waiter = this.waiters.shift();
    if (waiter) {
      // Still in flight, just on another worker.
      waiter(jobIndex);
      return;
    }
    this.inFlight -= 1;
    this.pending.unshift(jobIndex);
  }

  private releaseWaitersWhenIdle(): void {
    if (this.inFlight > 0) return;
    for (const waiter of this.waiters.splice(0)) waiter(undefined);
  }
}
