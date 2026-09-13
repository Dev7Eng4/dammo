import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  beginPhase,
  countEvent,
  currentTimeline,
  RunTimeline,
  runWithTimeline,
  timedPhase,
} from './run-timeline.js';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

describe('RunTimeline', () => {
  test('reports every group that recorded a span', async () => {
    const timeline = new RunTimeline('x');
    await timeline.measure('download', 'audio', () => sleep(20));
    await timeline.measure('assemble', 'compose', () => sleep(20));

    const report = timeline.report();
    assert.match(report, /download/);
    assert.match(report, /assemble/);
  });

  test('aggregates repeats of the same name into one line', async () => {
    const timeline = new RunTimeline('x');
    for (let i = 0; i < 3; i += 1) {
      await timeline.measure('scene images', 'flow batch', () => sleep(10));
    }

    const lines = timeline.report().split('\n').filter(line => line.includes('flow batch'));
    assert.equal(lines.length, 1, timeline.report());
    assert.match(lines[0], /3x/);
  });

  test('separates wall time from summed time when work overlaps', async () => {
    const timeline = new RunTimeline('x');
    // Three spans of ~60ms started together occupy ~60ms of clock, not ~180ms.
    await Promise.all([
      timeline.measure('scene prompts', 'LLM', () => sleep(60)),
      timeline.measure('scene prompts', 'LLM', () => sleep(60)),
      timeline.measure('scene prompts', 'LLM', () => sleep(60)),
    ]);

    const report = timeline.report();
    assert.match(report, /song song x[23]\.\d/, report);
  });

  test('does not flag sequential work as parallel', async () => {
    const timeline = new RunTimeline('x');
    for (let i = 0; i < 3; i += 1) {
      await timeline.measure('scene prompts', 'LLM', () => sleep(20));
    }

    assert.ok(!timeline.report().includes('song song'), timeline.report());
  });

  test('records a failed span and keeps timing it', async () => {
    const timeline = new RunTimeline('x');
    await assert.rejects(
      timeline.measure('assemble', 'compose', async () => {
        await sleep(10);
        throw new Error('boom');
      }),
    );

    assert.match(timeline.report(), /1 lỗi/);
  });

  test('an unfinished span still appears, measured up to now', async () => {
    const timeline = new RunTimeline('x');
    timeline.begin('stuck', 'never ends');
    await sleep(20);

    assert.match(timeline.report(), /stuck/);
  });

  test('counters are reported', () => {
    const timeline = new RunTimeline('x');
    timeline.count('clip cache hit', 4);
    timeline.count('clip cache hit');

    assert.match(timeline.report(), /clip cache hit=5/);
  });
});

describe('ambient timeline', () => {
  test('timedPhase records onto the active timeline', async () => {
    const timeline = new RunTimeline('x');
    await runWithTimeline(timeline, async () => {
      await timedPhase('scene images', 'flow batch', () => sleep(10));
    });

    assert.match(timeline.report(), /flow batch/);
  });

  test('nested async calls still see the timeline', async () => {
    const timeline = new RunTimeline('x');
    const deep = async () => {
      await sleep(1);
      await timedPhase('deep', 'work', () => sleep(5));
    };

    await runWithTimeline(timeline, async () => {
      await Promise.all([deep(), deep()]);
    });

    assert.match(timeline.report(), /deep/);
  });

  test('helpers are inert with no timeline active', async () => {
    assert.equal(currentTimeline(), undefined);
    assert.equal(await timedPhase('g', 'n', async () => 7), 7);
    assert.doesNotThrow(() => countEvent('nothing'));
    assert.doesNotThrow(() => beginPhase('g', 'n')());
  });

  test('a span that outlives its group is closed only once', () => {
    const timeline = new RunTimeline('x');
    const end = timeline.begin('g', 'n');
    end();
    const first = timeline.report();
    end(true);

    // The second call must not reopen or re-mark the span as failed.
    assert.ok(!timeline.report().includes('lỗi'), first);
  });
});

describe('nested instrumentation', () => {
  test('a wrapper around its own children is not reported as parallelism', async () => {
    const timeline = new RunTimeline('x');

    // A phase wrapper that contains the loop it measures — the shape produced
    // by instrumenting both `prepareSlideshow` and the clips inside it.
    await timeline.measure('assemble', 'phase', async () => {
      for (let i = 0; i < 3; i += 1) {
        await timeline.measure('assemble', 'clip', () => sleep(15));
      }
    });

    assert.ok(!timeline.report().includes('song song'), timeline.report());
  });

  test('parallel children under a wrapper are still detected', async () => {
    const timeline = new RunTimeline('x');

    await timeline.measure('assemble', 'phase', async () => {
      await Promise.all([
        timeline.measure('assemble', 'clip', () => sleep(60)),
        timeline.measure('assemble', 'clip', () => sleep(60)),
        timeline.measure('assemble', 'clip', () => sleep(60)),
      ]);
    });

    assert.match(timeline.report(), /song song x[23]\.\d/, timeline.report());
  });
});
