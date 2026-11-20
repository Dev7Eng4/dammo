import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { buildSceneMotionPrompt, resolveSceneCameraMotion, selectScenesForVideo } from './ai-video-scene-clip-generator.js';
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
});

describe('buildSceneMotionPrompt', () => {
  test('keeps the scene context but bounds its length', () => {
    const prompt = buildSceneMotionPrompt(`  a   quiet   room ${'x'.repeat(1000)}`);
    assert.match(prompt, /Scene: a quiet room/);
    assert.ok(prompt.length < 1100);
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
