import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  isMetaProfileQuotaExhausted,
  markMetaProfileQuotaExhausted,
  matchesMetaQuotaExhausted,
  META_QUOTA_COOLDOWN_MS,
} from './meta-quota.js';

describe('matchesMetaQuotaExhausted', () => {
  test('detects the upgrade / limit card', () => {
    assert.equal(
      matchesMetaQuotaExhausted('Upgrade to create more images You reached your limit. Get Meta One Core'),
      true,
    );
  });

  test('detects the assistant quota reply', () => {
    assert.equal(
      matchesMetaQuotaExhausted(
        'My image generation quota is temporarily exhausted for this request, so I can’t render that',
      ),
      true,
    );
  });

  test('ignores a normal generation reply', () => {
    assert.equal(matchesMetaQuotaExhausted('Here is your image of a mascot on a balance scale.'), false);
  });
});

describe('profile quota cooldown', () => {
  test('profile is skipped until the cooldown ends', () => {
    const now = 1_000_000;
    markMetaProfileQuotaExhausted('profile-a', now);
    assert.equal(isMetaProfileQuotaExhausted('profile-a', now + 1), true);
    assert.equal(isMetaProfileQuotaExhausted('profile-b', now + 1), false);
    assert.equal(isMetaProfileQuotaExhausted('profile-a', now + META_QUOTA_COOLDOWN_MS), false);
  });
});
