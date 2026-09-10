import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { SrtBlock } from '../../../../../infrastructure/subtitle/srt-utils.js';
import {
  STEP1_PROMPT_INPUT_BUDGET,
  computeStep1MaxTranscriptChars,
  extractDramaStep1Transcript,
} from './drama-segments.js';

function block(index: number, start: string, end: string, text: string): SrtBlock {
  return { index, start, end, text };
}

describe('computeStep1MaxTranscriptChars', () => {
  test('subtracts shell length from budget', () => {
    assert.equal(computeStep1MaxTranscriptChars(7_000), STEP1_PROMPT_INPUT_BUDGET - 7_000);
  });

  test('returns 0 when shell reaches or exceeds budget', () => {
    assert.equal(computeStep1MaxTranscriptChars(STEP1_PROMPT_INPUT_BUDGET), 0);
    assert.equal(computeStep1MaxTranscriptChars(STEP1_PROMPT_INPUT_BUDGET + 500), 0);
  });

  test('treats negative shell length as 0', () => {
    assert.equal(computeStep1MaxTranscriptChars(-10), STEP1_PROMPT_INPUT_BUDGET);
  });
});

describe('extractDramaStep1Transcript', () => {
  test('truncates to maxChars when transcript is longer', () => {
    const longText = 'あ'.repeat(500);
    const blocks = [block(1, '00:00:00,000', '00:00:05,000', longText)];
    const result = extractDramaStep1Transcript(blocks, 100);
    assert.equal(result.length, 100);
  });

  test('keeps full text when under maxChars', () => {
    const blocks = [block(1, '00:00:00,000', '00:00:05,000', 'hello world')];
    assert.equal(extractDramaStep1Transcript(blocks, 1_000), 'hello world');
  });

  test('returns empty when maxChars is 0', () => {
    const blocks = [block(1, '00:00:00,000', '00:00:05,000', 'hello')];
    assert.equal(extractDramaStep1Transcript(blocks, 0), '');
  });

  test('longer shell budget yields shorter transcript cap', () => {
    const longText = 'x'.repeat(40_000);
    const blocks = [block(1, '00:00:00,000', '00:01:00,000', longText)];

    const shortShellMax = computeStep1MaxTranscriptChars(1_000);
    const longShellMax = computeStep1MaxTranscriptChars(10_000);

    assert.ok(shortShellMax > longShellMax);
    assert.equal(extractDramaStep1Transcript(blocks, shortShellMax).length, shortShellMax);
    assert.equal(extractDramaStep1Transcript(blocks, longShellMax).length, longShellMax);
  });
});
