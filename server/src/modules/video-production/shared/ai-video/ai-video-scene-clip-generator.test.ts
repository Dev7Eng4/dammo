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
    selectInterleavedScenes(list, s => s.start, s => s.dur, 30, 90, 150).map(s => s.i);

  test('intro clips, then the next clip starts 90-150s after the previous one', () => {
    // 10s scenes: intro = 0,1,2 (start 0-20s). Next window from 20s: 110-170s -> scene 11 (earliest tie).
    // Then 200-260s -> scene 20.
    const list = build(Array.from({ length: 25 }, () => 10));
    assert.deepEqual(pick(list), [0, 1, 2, 11, 20]);
  });

  test('best clip fit wins inside the window', () => {
    const list: S[] = [
      { i: 0, start: 0, dur: 40 },
      { i: 1, start: 95, dur: 15 },
      { i: 2, start: 120, dur: 8 },
      { i: 3, start: 140, dur: 4 },
      { i: 4, start: 160, dur: 8 },
    ];
    // Window 90-150s: scenes 1-3; 8s fits best. Scene 4 (160s) is outside it.
    assert.deepEqual(pick(list), [0, 2]);
  });

  test('when no scene starts in the window, the first one after it is taken', () => {
    const list: S[] = [
      { i: 0, start: 0, dur: 40 },
      { i: 1, start: 40, dur: 200 },
      { i: 2, start: 240, dur: 10 },
    ];
    assert.deepEqual(pick(list), [0, 2]);
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
