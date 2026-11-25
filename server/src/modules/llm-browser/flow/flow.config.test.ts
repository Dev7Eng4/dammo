import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { flowAsbAssetKey, isFlowAsbImageUrl, toFlowOriginalImageUrl } from './flow.config.js';

const TILE_SRC =
  'https://flow.google.com/asb/ANqvLObtZL5OcB-urzoYTno2eTDfCDV8nSoLvLEYJ0dM-JJW6BPhzHOHyf0saF2ZvNdgRY=s1600-rw';

describe('isFlowAsbImageUrl', () => {
  test('accepts grid tile srcs only', () => {
    assert.equal(isFlowAsbImageUrl(TILE_SRC), true);
    assert.equal(isFlowAsbImageUrl('https://flow-content.google/image/abc'), false);
    assert.equal(isFlowAsbImageUrl('https://flow.google.com/project/abc'), false);
    assert.equal(isFlowAsbImageUrl('not a url'), false);
  });
});

describe('flowAsbAssetKey', () => {
  test('a video src and its thumbnail share one key', () => {
    const base = 'https://flow.google.com/asb/ANqvLOaGu3eMgGpN2zmixYkKDtjJGt6T9Vy0Uud39pvM1ciV9PMA';
    assert.equal(flowAsbAssetKey(`${base}=mm,18,15`), flowAsbAssetKey(base));
    assert.equal(flowAsbAssetKey(`${base}=mm,18,15`), '/asb/ANqvLOaGu3eMgGpN2zmixYkKDtjJGt6T9Vy0Uud39pvM1ciV9PMA');
  });

  test('different tokens give different keys', () => {
    assert.notEqual(
      flowAsbAssetKey('https://flow.google.com/asb/AAA=mm,18,15'),
      flowAsbAssetKey('https://flow.google.com/asb/BBB=mm,18,15'),
    );
  });
});

describe('toFlowOriginalImageUrl', () => {
  test('swaps the size/format options for =s0', () => {
    assert.equal(
      toFlowOriginalImageUrl(TILE_SRC),
      'https://flow.google.com/asb/ANqvLObtZL5OcB-urzoYTno2eTDfCDV8nSoLvLEYJ0dM-JJW6BPhzHOHyf0saF2ZvNdgRY=s0',
    );
  });

  test('appends =s0 when the src has no options', () => {
    assert.equal(toFlowOriginalImageUrl('https://flow.google.com/asb/ABC-def_1'), 'https://flow.google.com/asb/ABC-def_1=s0');
  });
});
