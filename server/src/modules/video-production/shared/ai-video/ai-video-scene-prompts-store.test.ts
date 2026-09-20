import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { findOverlappingScenes } from './ai-video-scene-prompts-store.js';
import type { AiVideoScenePrompt } from './ai-video.types.js';

function scene(startTime: string, endTime: string): AiVideoScenePrompt {
  return { prompt: `${startTime} → ${endTime}`, startTime, endTime };
}

describe('findOverlappingScenes', () => {
  test('returns nothing for a monotonically increasing timeline', () => {
    const scenes = [
      scene('00:00:00,000', '00:00:08,000'),
      scene('00:00:08,000', '00:00:19,500'),
      scene('00:00:19,500', '00:00:31,000'),
    ];

    assert.deepEqual(findOverlappingScenes(scenes), []);
  });

  test('flags a chunk duplicated from an earlier range', () => {
    const scenes = [
      scene('00:18:32,679', '00:18:50,360'),
      scene('00:18:50,360', '00:19:14,039'),
      // Same range repeated — the stale-response signature.
      scene('00:18:32,679', '00:18:50,360'),
      scene('00:18:50,360', '00:19:14,039'),
    ];

    const overlaps = findOverlappingScenes(scenes);

    assert.equal(overlaps.length, 1);
    assert.deepEqual(overlaps[0], {
      index: 2,
      startTime: '00:18:32,679',
      previousEndTime: '00:19:14,039',
    });
  });

  test('reports every scene that steps backwards', () => {
    const scenes = [
      scene('00:00:10,000', '00:00:20,000'),
      scene('00:00:05,000', '00:00:15,000'),
      scene('00:00:15,000', '00:00:25,000'),
      scene('00:00:01,000', '00:00:09,000'),
    ];

    assert.deepEqual(
      findOverlappingScenes(scenes).map(overlap => overlap.index),
      [1, 3],
    );
  });

  test('handles empty and single-scene input', () => {
    assert.deepEqual(findOverlappingScenes([]), []);
    assert.deepEqual(findOverlappingScenes([scene('00:00:00,000', '00:00:05,000')]), []);
  });
});
