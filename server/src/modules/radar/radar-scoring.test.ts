import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { parseIsoDuration, uploadsPlaylistId } from '../../infrastructure/youtube/youtube-data-api.js';
import {
  classifyTier,
  computeChannelBaseline,
  expectedViewsAtAge,
  median,
  viewShareAtAge,
} from './radar-scoring.js';

describe('view share curve', () => {
  test('is monotonic and capped at 1', () => {
    let previous = -1;
    for (const days of [0, 0.5, 1, 2, 3, 5, 7, 10, 14, 21, 28, 45, 60, 120]) {
      const share = viewShareAtAge(days);
      assert.ok(share >= previous, `share dropped at ${days}d`);
      assert.ok(share <= 1);
      previous = share;
    }
    assert.equal(viewShareAtAge(120), 1);
  });

  test('interpolates between knots', () => {
    assert.equal(viewShareAtAge(1), 0.25);
    assert.ok(Math.abs(viewShareAtAge(1.5) - 0.315) < 1e-9);
  });
});

describe('channel baseline', () => {
  test('needs enough mature videos', () => {
    const young = Array.from({ length: 10 }, () => ({ views: 1000, ageDays: 3 }));
    assert.equal(computeChannelBaseline(young), null);
    const few = Array.from({ length: 4 }, () => ({ views: 1000, ageDays: 60 }));
    assert.equal(computeChannelBaseline(few), null);
  });

  test('uses the median, so one viral video does not move it', () => {
    const videos = [10_000, 12_000, 9_000, 11_000, 10_500, 5_000_000].map(views => ({ views, ageDays: 90 }));
    const baseline = computeChannelBaseline(videos);
    assert.ok(baseline);
    assert.equal(baseline.matureCount, 6);
    assert.ok(baseline.baselineViews < 20_000);
  });

  test('normalises for age before taking the median', () => {
    const videos = Array.from({ length: 5 }, () => ({ views: 9_200, ageDays: 28 }));
    const baseline = computeChannelBaseline(videos);
    assert.ok(baseline);
    assert.ok(Math.abs(baseline.baselineViews - 10_000) < 1);
  });
});

describe('scoring', () => {
  test('expected views grow with age', () => {
    assert.ok(expectedViewsAtAge(10_000, 1) < expectedViewsAtAge(10_000, 7));
  });

  test('classifies tiers at the thresholds', () => {
    assert.equal(classifyTier(2.9), null);
    assert.equal(classifyTier(3), 'spike');
    assert.equal(classifyTier(8), 'burst');
    assert.equal(classifyTier(20), 'super');
  });

  test('median handles even and empty input', () => {
    assert.equal(median([]), 0);
    assert.equal(median([1, 3]), 2);
  });
});

describe('youtube data api helpers', () => {
  test('parses ISO 8601 durations', () => {
    assert.equal(parseIsoDuration('PT45S'), 45);
    assert.equal(parseIsoDuration('PT12M30S'), 750);
    assert.equal(parseIsoDuration('PT1H2M3S'), 3723);
    assert.equal(parseIsoDuration('P1DT1H'), 90_000);
    assert.equal(parseIsoDuration(undefined), 0);
  });

  test('derives the uploads playlist id', () => {
    assert.equal(uploadsPlaylistId('UCabcdefghijklmnopqrstuv'), 'UUabcdefghijklmnopqrstuv');
    assert.equal(uploadsPlaylistId('not-a-channel-id'), null);
  });
});
