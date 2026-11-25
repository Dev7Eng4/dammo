import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { allocateChromeTabs } from './meta-media-workers.js';

describe('allocateChromeTabs', () => {
  test('fills profiles in order up to the tab limit', () => {
    assert.deepEqual(allocateChromeTabs(['a', 'b', 'c'], 12, 5), [
      { profile: 'a', tabs: 5 },
      { profile: 'b', tabs: 5 },
      { profile: 'c', tabs: 2 },
    ]);
  });

  test('never opens more tabs than jobs', () => {
    assert.deepEqual(allocateChromeTabs(['a', 'b'], 3, 5), [{ profile: 'a', tabs: 3 }]);
    assert.deepEqual(allocateChromeTabs(['a'], 0, 5), []);
  });

  test('leaves jobs without a tab when there are too few profiles', () => {
    assert.deepEqual(allocateChromeTabs(['a'], 121, 5), [{ profile: 'a', tabs: 5 }]);
  });
});
