import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  ALL_TRANSITIONS,
  buildXfadeChain,
  buildXfadeTree,
  type ChainTransition,
} from './slideshow-transitions.js';

/** Deterministic pseudo-random so a failure is reproducible from the seed. */
function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
}

function buildCase(clipCount: number, seed: number) {
  const next = seeded(seed);
  const durations = Array.from({ length: clipCount }, () => 0.4 + next() * 40);
  const transitions: ChainTransition[] = Array.from({ length: Math.max(0, clipCount - 1) }, (_, i) => ({
    type: ALL_TRANSITIONS[i % ALL_TRANSITIONS.length],
    durationSec: 1,
  }));
  return { clipCount, durations, transitions };
}

/** Every `offset=` in a filtergraph fragment, in emission order. */
function offsetsOf(filter: string): number[] {
  return [...filter.matchAll(/offset=([\d.]+)/g)].map(match => Number(match[1]));
}

describe('buildXfadeTree', () => {
  test('produces the same total duration as the linear chain', () => {
    for (const clipCount of [1, 2, 3, 4, 5, 7, 8, 9, 16, 17, 33, 94, 200]) {
      const params = buildCase(clipCount, clipCount * 7919);
      const chain = buildXfadeChain(params);
      const tree = buildXfadeTree(params);

      assert.ok(
        Math.abs(chain.totalDuration - tree.totalDuration) < 1e-6,
        `clipCount=${clipCount}: chain=${chain.totalDuration} tree=${tree.totalDuration}`,
      );
    }
  });

  test('uses one xfade per seam, like the chain', () => {
    for (const clipCount of [2, 3, 8, 9, 94]) {
      const params = buildCase(clipCount, clipCount * 104729);
      const chainNodes = (buildXfadeChain(params).filter.match(/xfade=/g) ?? []).length;
      const treeNodes = (buildXfadeTree(params).filter.match(/xfade=/g) ?? []).length;

      assert.equal(treeNodes, clipCount - 1);
      assert.equal(treeNodes, chainNodes);
    }
  });

  test('keeps every seam transition type, in seam order', () => {
    const params = buildCase(9, 31337);
    const tree = buildXfadeTree(params);

    for (const transition of params.transitions) {
      assert.ok(
        tree.filter.includes(`transition=${transition.type}`),
        `missing transition ${transition.type}`,
      );
    }
  });

  test('places the first seam at the same offset as the chain', () => {
    // The first pair is the one merge both shapes perform identically, so it
    // pins the offset convention rather than just the accumulated total.
    const params = buildCase(8, 4242);
    const chainFirst = offsetsOf(buildXfadeChain(params).filter)[0];
    const treeFirst = offsetsOf(buildXfadeTree(params).filter)[0];

    assert.ok(Math.abs(chainFirst - treeFirst) < 1e-6, `chain=${chainFirst} tree=${treeFirst}`);
  });

  test('clamps a transition longer than its neighbouring clips', () => {
    const durations = [0.5, 0.5, 10];
    const transitions: ChainTransition[] = [
      { type: 'fade', durationSec: 5 },
      { type: 'fade', durationSec: 5 },
    ];
    const params = { clipCount: 3, durations, transitions };

    const chain = buildXfadeChain(params);
    const tree = buildXfadeTree(params);

    assert.ok(Math.abs(chain.totalDuration - tree.totalDuration) < 1e-6);
    // 0.5 + 0.5 + 10 minus clamped transitions of 0.5 each.
    assert.ok(Math.abs(tree.totalDuration - 10) < 1e-6, `got ${tree.totalDuration}`);
  });

  test('single clip needs no filter', () => {
    const tree = buildXfadeTree({ clipCount: 1, durations: [7], transitions: [] });

    assert.equal(tree.filter, '');
    assert.equal(tree.outLabel, '0:v');
    assert.equal(tree.totalDuration, 7);
  });

  test('rejects mismatched input lengths', () => {
    assert.throws(() => buildXfadeTree({ clipCount: 3, durations: [1, 2], transitions: [] }));
    assert.throws(() =>
      buildXfadeTree({ clipCount: 3, durations: [1, 2, 3], transitions: [{ type: 'fade', durationSec: 1 }] }),
    );
  });
});
