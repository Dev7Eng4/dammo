import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { MetaJobQueue } from './meta-job-queue.js';

describe('MetaJobQueue', () => {
  test('hands out jobs in order, then undefined once all are finished', async () => {
    const queue = new MetaJobQueue(2);
    assert.equal(await queue.take(), 0);
    assert.equal(await queue.take(), 1);
    queue.finish(0);
    queue.finish(1);
    assert.equal(await queue.take(), undefined);
    assert.equal(queue.isDrained, true);
    await queue.drained;
  });

  test('an idle worker picks up a job handed back by an exhausted profile', async () => {
    const queue = new MetaJobQueue(2);
    const exhausted = await queue.take();
    const other = await queue.take();
    queue.finish(other!);
    const idle = queue.take();
    queue.requeue(exhausted!);
    assert.equal(await idle, exhausted);
    queue.finish(exhausted!);
    assert.equal(queue.isDrained, true);
  });

  test('a handed-back job goes before jobs that were not started', async () => {
    const queue = new MetaJobQueue(3);
    const first = await queue.take();
    queue.requeue(first!);
    assert.equal(await queue.take(), first);
    assert.equal(await queue.take(), 1);
  });

  test('idle workers are released when the last running job finishes', async () => {
    const queue = new MetaJobQueue(1);
    await queue.take();
    const idle = [queue.take(), queue.take()];
    queue.finish(0);
    assert.deepEqual(await Promise.all(idle), [undefined, undefined]);
  });

  test('a job handed back with no idle worker stays available for workers opened later', async () => {
    const queue = new MetaJobQueue(1);
    const job = await queue.take();
    queue.requeue(job!);
    assert.deepEqual(queue.unfinished(), [0]);
    assert.equal(queue.isDrained, false);
    assert.equal(await queue.take(), 0);
  });

  test('every worker that gives up passes the job on, and nobody waits forever', async () => {
    const queue = new MetaJobQueue(1);
    const job = await queue.take();
    const waiting = [queue.take(), queue.take()];
    queue.requeue(job!);
    assert.equal(await waiting[0], 0);
    queue.requeue(0);
    assert.equal(await waiting[1], 0);
    queue.requeue(0);
    assert.deepEqual(queue.unfinished(), [0]);
  });

  test('an empty queue is drained at once', async () => {
    const queue = new MetaJobQueue(0);
    await queue.drained;
    assert.equal(await queue.take(), undefined);
  });
});
