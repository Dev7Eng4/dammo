import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { getLlmProviderConfig } from './text.config.js';

describe('claude usage limit text', () => {
  const pattern = getLlmProviderConfig('claude').usageLimitPattern!;

  test('matches "out of messages" banners', () => {
    for (const line of [
      'You are out of free messages until 4 PM',
      'Message limit reached for Claude Opus until 6 PM.',
      "You've hit your weekly limit",
      "You've reached your usage limit. Your limit resets Monday.",
      'Usage limit reached — resets at 5:00 PM',
    ]) {
      assert.ok(pattern.test(line), line);
    }
  });

  test('ignores the usage warning and normal page text', () => {
    for (const line of [
      'You’ve used 90% of your weekly limit',
      "You've used 75% of your session limit",
      'Get more usage',
      'Claude is AI and can make mistakes.',
      '沈黙が来たら、さっきの話題に戻ればいい',
    ]) {
      assert.equal(pattern.test(line), false, line);
    }
  });
});
