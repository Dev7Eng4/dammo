import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { escapeStrayQuotes } from './meta-response.js';

describe('escapeStrayQuotes', () => {
  test('repairs quotes used inside a string value', () => {
    const broken = '{"thumbnail": {"prompt": "Top text \'"怒った瞬間にバレる"\' in white, bottom "あなたは"", "format": "K4-P1"}}';
    const parsed = JSON.parse(escapeStrayQuotes(broken));
    assert.equal(parsed.thumbnail.format, 'K4-P1');
    assert.match(parsed.thumbnail.prompt, /怒った瞬間にバレる/);
  });

  test('leaves valid JSON unchanged', () => {
    const valid = '{"a": "x \\"y\\" z", "b": ["c", "d"], "e": {"f": 1}}';
    assert.equal(escapeStrayQuotes(valid), valid);
  });

  test('repairs the format_name copied with quotes from an old format title', () => {
    const broken = '{"format_name": "Hành vi + "実はこんな人です"", "look": "x"}';
    assert.deepEqual(JSON.parse(escapeStrayQuotes(broken)), { format_name: 'Hành vi + "実はこんな人です"', look: 'x' });
  });
});
