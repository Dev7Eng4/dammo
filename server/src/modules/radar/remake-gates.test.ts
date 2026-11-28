import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { evaluateRemakeGates, viewFloorAtAge } from './remake-gates.js';

const strong = { minutes: 18, ageHours: 40, views: 60_000, ratio: 12, cluster: 'K2' };

describe('remake gates', () => {
  test('a fresh, strong, in-window video is a "do"', () => {
    assert.equal(evaluateRemakeGates(strong).verdict, 'do');
  });

  test('skips videos outside 10–35 minutes', () => {
    assert.equal(evaluateRemakeGates({ ...strong, minutes: 9.5 }).verdict, 'skip');
    assert.equal(evaluateRemakeGates({ ...strong, minutes: 36 }).verdict, 'skip');
    assert.equal(evaluateRemakeGates({ ...strong, minutes: 10 }).verdict, 'do');
    assert.equal(evaluateRemakeGates({ ...strong, minutes: 35 }).verdict, 'do');
  });

  test('skips off-niche videos', () => {
    const result = evaluateRemakeGates({ ...strong, cluster: 'off' });
    assert.equal(result.verdict, 'skip');
    assert.match(result.reasons.join(), /lạc ngách/);
  });

  test('skips when real views are under the age-scaled floor, measured at capture age', () => {
    const floor = viewFloorAtAge(22);
    assert.equal(evaluateRemakeGates({ ...strong, ageHours: 22, views: floor - 1 }).verdict, 'skip');
    // Old capture: judged at the age the views were measured, not today's age.
    assert.equal(
      evaluateRemakeGates({ ...strong, ageHours: 100, measuredAgeHours: 22, views: floor + 1 }).verdict,
      'maybe',
    );
  });

  test('downgrades to "maybe" when weak, stale, stalled, unsure or topic-only', () => {
    assert.equal(evaluateRemakeGates({ ...strong, ratio: 4 }).verdict, 'maybe');
    assert.equal(evaluateRemakeGates({ ...strong, ageHours: 90 }).verdict, 'maybe');
    assert.equal(evaluateRemakeGates({ ...strong, momentum: 0.1 }).verdict, 'maybe');
    assert.equal(evaluateRemakeGates({ ...strong, clusterUnsure: true }).verdict, 'maybe');
    assert.equal(evaluateRemakeGates({ ...strong, topicOnly: true }).verdict, 'maybe');
    assert.equal(evaluateRemakeGates({ ...strong, minutes: undefined }).verdict, 'maybe');
  });

  test('heat stands in for the ratio only when the ratio is unknown', () => {
    assert.equal(evaluateRemakeGates({ ...strong, ratio: undefined, heat: 85 }).verdict, 'do');
    assert.equal(evaluateRemakeGates({ ...strong, ratio: undefined, heat: 60 }).verdict, 'maybe');
    assert.equal(evaluateRemakeGates({ ...strong, ratio: 4, heat: 95 }).verdict, 'maybe');
  });
});
