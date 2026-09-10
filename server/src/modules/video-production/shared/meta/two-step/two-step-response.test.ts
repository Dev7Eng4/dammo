import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { LlmBrowserResponse } from '../../../../../infrastructure/llm-browser/llm-browser.types.js';
import { parseTwoStepStep1Response, parseTwoStepStep2Response } from './two-step-response.js';

function makeResponse(content: string, codeBlocks: string[] = []): LlmBrowserResponse {
  return {
    provider: 'gpt',
    content,
    codeBlocks,
    elapsedMs: 0,
  };
}

function step2Payload(tags: string[]) {
  return {
    metadata: {
      title: 'Title',
      description: 'Description',
      tags,
    },
    thumbnail: { prompt: 'thumb prompt' },
  };
}

describe('parseTwoStepStep1Response', () => {
  test('accepts arbitrary niche JSON object shapes', () => {
    const storyShape = makeResponse(
      JSON.stringify({
        sub_niche: '修羅場',
        story_framework: { protagonist_or_pov: 'A' },
      }),
    );
    const healthShape = makeResponse(
      JSON.stringify({
        detected_focus: '血圧',
        knowledge_points: ['a', 'b'],
      }),
    );

    const story = parseTwoStepStep1Response(storyShape);
    const health = parseTwoStepStep1Response(healthShape);

    assert.equal(story.ok, true);
    assert.equal(health.ok, true);
    if (story.ok) assert.equal(story.value.sub_niche, '修羅場');
    if (health.ok) assert.equal(health.value.detected_focus, '血圧');
  });

  test('accepts empty JSON object', () => {
    const result = parseTwoStepStep1Response(makeResponse('{}'));
    assert.equal(result.ok, true);
    if (result.ok) assert.deepEqual(result.value, {});
  });

  test('rejects invalid JSON', () => {
    const result = parseTwoStepStep1Response(makeResponse('not json {'));
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.reason, /invalid JSON|no JSON/);
  });

  test('rejects JSON array root', () => {
    const result = parseTwoStepStep1Response(makeResponse('[1, 2, 3]'));
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, 'JSON root is not an object');
  });
});

describe('parseTwoStepStep2Response', () => {
  test('still requires metadata.title', () => {
    const result = parseTwoStepStep2Response(
      makeResponse(
        JSON.stringify({
          metadata: {
            description: 'desc',
            tags: ['a'],
          },
          thumbnail: { prompt: 'thumb prompt' },
        }),
      ),
      false,
    );

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, 'missing required fields');
      assert.ok(result.missingFields?.includes('metadata.title'));
    }
  });

  test('accepts complete metadata package', () => {
    const result = parseTwoStepStep2Response(makeResponse(JSON.stringify(step2Payload(['tag1']))), false);

    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.value.metadata.title, 'Title');
  });

  test('accepts more than 10 tags without capping', () => {
    const tags = Array.from({ length: 13 }, (_, i) => `tag${i + 1}`);
    const result = parseTwoStepStep2Response(makeResponse(JSON.stringify(step2Payload(tags))), false);

    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.value.metadata.tags.length, 13);
  });

  test('rejects empty tags array', () => {
    const result = parseTwoStepStep2Response(makeResponse(JSON.stringify(step2Payload([]))), false);

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, 'missing required fields');
      assert.ok(result.missingFields?.includes('metadata.tags'));
    }
  });
});
