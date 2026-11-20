import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeEach, describe, test } from 'node:test';

// paths are derived from DATA_DIR at import time, so point it at a temp dir first.
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chrome-profiles-'));
process.env.DATA_DIR = dataDir;
const { paths } = await import('../../config/paths.js');
const { chromeProfilesService, contentLlmForProvider } = await import('./chrome-profiles.service.js');

function profile(name: string, extra: Record<string, unknown> = {}) {
  return { id: name, name, userDataDir: `/tmp/${name}`, createdAt: '2026-01-01T00:00:00.000Z', ...extra };
}

function seed(profiles: Record<string, unknown>[]) {
  fs.mkdirSync(path.dirname(paths.chromeProfiles), { recursive: true });
  fs.writeFileSync(paths.chromeProfiles, JSON.stringify({ profiles }));
}

const ids = (items: { id: string }[]) => items.map(item => item.id);

describe('picking Chrome profiles by ticked LLM', () => {
  beforeEach(() => {
    seed([
      profile('b-chat', { llmContent: ['chatgpt', 'gemini'] }),
      profile('a-chat', { llmContent: ['chatgpt'] }),
      profile('flow-old', { llmImage: ['flow'], llmVideo: ['flow'], usageOrder: 5 }),
      profile('flow-new', { llmImage: ['flow', 'meta'] }),
      profile('flow-mid', { llmImage: ['flow'], usageOrder: 2 }),
      // Legacy data: a single string and the old role field.
      profile('legacy', { llmContent: 'gemini', role: 'main' }),
    ]);
  });

  test('filters by capability and LLM; chat profiles are in name order', () => {
    assert.deepEqual(ids(chromeProfilesService.listProfilesForLlm('content', 'chatgpt')), ['a-chat', 'b-chat']);
    assert.deepEqual(ids(chromeProfilesService.listProfilesForLlm('content', 'gemini')), ['b-chat', 'legacy']);
    assert.deepEqual(ids(chromeProfilesService.listProfilesForLlm('image', 'meta')), ['flow-new']);
    assert.deepEqual(ids(chromeProfilesService.listProfilesForLlm('video', 'flow')), ['flow-old']);
    assert.deepEqual(chromeProfilesService.listProfilesForLlm('content', 'claude'), []);
  });

  test('Flow profiles follow usageOrder: unnumbered first, then higher first', () => {
    assert.deepEqual(ids(chromeProfilesService.listProfilesForLlm('image', 'flow')), ['flow-new', 'flow-old', 'flow-mid']);
    assert.deepEqual(
      ids(chromeProfilesService.listProfilesForLlm('image', 'flow', { excludeIds: ['flow-new'] })),
      ['flow-old', 'flow-mid'],
    );
  });

  test('maps the text provider and clamps the count to what exists', () => {
    assert.equal(contentLlmForProvider('gpt'), 'chatgpt');
    assert.equal(chromeProfilesService.requireProfileForLlm('content', 'chatgpt').id, 'a-chat');
    assert.deepEqual(ids(chromeProfilesService.pickProfilesForLlm('content', 'gemini', 8)), ['b-chat', 'legacy']);
    assert.deepEqual(ids(chromeProfilesService.pickProfilesForLlm('content', 'chatgpt', 1)), ['a-chat']);
  });

  test('throws NO_LLM_PROFILE when no profile has the LLM ticked', () => {
    assert.throws(
      () => chromeProfilesService.requireProfileForLlm('content', 'claude'),
      (err: unknown) => (err as { code?: string }).code === 'NO_LLM_PROFILE',
    );
  });

  test('legacy role field is dropped and a single string becomes a list', () => {
    const legacy = chromeProfilesService.getById('legacy');
    assert.deepEqual(legacy.llmContent, ['gemini']);
    assert.equal('role' in legacy, false);
  });

  test('a Flow quota hit gives the profile the next usageOrder after every Flow profile', () => {
    const updated = chromeProfilesService.markFlowProfileLimited('flow-mid');
    assert.equal(updated.usageOrder, 6);
    // Unnumbered (never limited) stays first; among numbered, higher comes first (existing order rule).
    assert.deepEqual(ids(chromeProfilesService.listProfilesForLlm('image', 'flow')), ['flow-new', 'flow-mid', 'flow-old']);
  });
});
