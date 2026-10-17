import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { computeNextDelayMs } from './radar.scheduler.js';

const HOUR = 3_600_000;
const NOW = Date.parse('2026-10-18T12:00:00Z');

describe('computeNextDelayMs', () => {
  test('waits a minute after boot when there has been no scan', () => {
    assert.equal(computeNextDelayMs(undefined, 4 * HOUR, NOW), 60_000);
    assert.equal(computeNextDelayMs('garbage', 4 * HOUR, NOW), 60_000);
  });

  test('waits out the remainder of the interval after a recent scan', () => {
    const lastScan = new Date(NOW - 1 * HOUR).toISOString();
    assert.equal(computeNextDelayMs(lastScan, 4 * HOUR, NOW), 3 * HOUR);
  });

  test('is never shorter than the boot minimum, even when overdue', () => {
    const lastScan = new Date(NOW - 10 * HOUR).toISOString();
    assert.equal(computeNextDelayMs(lastScan, 4 * HOUR, NOW), 60_000);
  });
});
