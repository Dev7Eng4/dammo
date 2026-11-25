import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  buildSceneMotionPrompt,
  resolveSceneCameraMotion,
  selectInterleavedScenes,
  selectScenesForVideo,
} from './ai-video-scene-clip-generator.js';
import type { AiVideoScenePrompt } from './ai-video.types.js';

function scene(startTime: string, withImage = true): AiVideoScenePrompt {
  return {
    prompt: 'p',
    startTime,
    endTime: '00:10:00,000',
    ...(withImage ? { path: 'images/x.jpg' } : {}),
  };
}

describe('selectScenesForVideo', () => {
  const scenes = [
    scene('00:00:00,000'),
    scene('00:00:20,000'),
    scene('00:00:40,000'),
    scene('00:01:00,000', false),
  ];

  test('full mode picks every scene that has an image', () => {
    assert.deepEqual(selectScenesForVideo(scenes, 'full'), [0, 1, 2]);
  });

  test('intro mode only picks scenes that start inside the intro window', () => {
    assert.deepEqual(selectScenesForVideo(scenes, 'intro', 30), [0, 1]);
  });

  test('interleaved mode keeps the intro clips and skips scenes without an image', () => {
    assert.deepEqual(selectScenesForVideo(scenes, 'interleaved', 30), [0, 1]);
  });
});

describe('selectInterleavedScenes', () => {
  type S = { i: number; start: number; dur: number };
  const build = (durations: number[]): S[] => {
    let start = 0;
    return durations.map((dur, i) => {
      const s = { i, start, dur };
      start += dur;
      return s;
    });
  };
  const pick = (list: S[]) =>
    selectInterleavedScenes(list, s => s.start, s => s.dur, 30, 4, 6).map(s => s.i);

  test('intro clips, then one clip after every 4-6 images, best clip fit wins', () => {
    // Scenes 0-2 start inside the 30s intro.
    const list = build([10, 10, 10, 12, 12, 12, 12, 15, 8, 5, 12, 12, 12, 12, 3, 9, 12, 12]);
    // After intro (0-2): candidates 7,8,9 -> 8 (8s fits exactly). Then 13,14,15 -> 15 (9s).
    assert.deepEqual(pick(list), [0, 1, 2, 8, 15]);
  });

  test('ties keep the earliest candidate, so the gap stays at the minimum', () => {
    const list = build([40, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10]);
    assert.deepEqual(pick(list), [0, 5, 10]);
  });

  test('a tail shorter than the minimum gap gets no clip', () => {
    assert.deepEqual(pick(build([40, 10, 10, 10])), [0]);
  });
});

describe('buildSceneMotionPrompt', () => {
  test('keeps the scene context but bounds its length', () => {
    const prompt = buildSceneMotionPrompt(`  a   quiet   room ${'x'.repeat(1000)}`);
    assert.match(prompt, /Scene: a quiet room/);
    assert.ok(prompt.length < 1100);
  });

  test('uses the scene motion when one was written for it', () => {
    const prompt = buildSceneMotionPrompt('an old woman at a window', '  she turns   toward the window and smiles, curtains sway. ');
    assert.match(prompt, /^Animate this illustration: she turns toward the window and smiles, curtains sway\. /);
    assert.doesNotMatch(prompt, /expressions, gestures, small body movement/);
    assert.match(prompt, /No cuts, no text/);
    assert.match(prompt, /Scene: an old woman at a window/);
  });

  test('falls back to the generic motion without one', () => {
    assert.match(buildSceneMotionPrompt('a room', '  '), /expressions, gestures, small body movement/);
  });
});

describe('scene camera motion', () => {
  test('close and medium shots keep the camera still', () => {
    assert.equal(resolveSceneCameraMotion('the mascot, close-up of its face, crying'), 'static');
    assert.equal(resolveSceneCameraMotion('the mascot sitting at a table, medium shot'), 'static');
    assert.equal(resolveSceneCameraMotion('the mascot waving'), 'static');
    assert.match(buildSceneMotionPrompt('the mascot, close-up'), /no zoom/);
  });

  test('wide shots get only a slight push-in', () => {
    assert.equal(resolveSceneCameraMotion('the mascot on a veranda, wide shot, autumn'), 'gentle_push_in');
    assert.equal(resolveSceneCameraMotion('establishing shot of a small town'), 'gentle_push_in');
    assert.match(buildSceneMotionPrompt('the mascot, wide shot'), /barely noticeable slow drift forward/);
  });
});
