import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  AI_SCENE_PROMPT_CONCURRENCY_MAX,
  AI_SCENE_PROMPT_CONCURRENCY_MIN,
  clampAiScenePromptConcurrency,
} from './ai-video-chrome-profile.js';

describe('clampAiScenePromptConcurrency', () => {
  test('defaults invalid values to fallback', () => {
    assert.equal(clampAiScenePromptConcurrency(undefined, 1), 1);
    assert.equal(clampAiScenePromptConcurrency(Number.NaN, 2), 2);
  });

  test('clamps to 1–8', () => {
    assert.equal(clampAiScenePromptConcurrency(0), AI_SCENE_PROMPT_CONCURRENCY_MIN);
    assert.equal(clampAiScenePromptConcurrency(-3), AI_SCENE_PROMPT_CONCURRENCY_MIN);
    assert.equal(clampAiScenePromptConcurrency(99), AI_SCENE_PROMPT_CONCURRENCY_MAX);
    assert.equal(clampAiScenePromptConcurrency(3.6), 4);
  });
});
