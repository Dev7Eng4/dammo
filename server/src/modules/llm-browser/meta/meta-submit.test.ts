import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { classifyMetaSubmit, composerHoldsPrompt, composerMatchesPrompt } from './meta-submit.js';

const BEFORE = { inputLenBefore: 900, baselineMessages: 0 };

describe('classifyMetaSubmit', () => {
  test('sent: composer emptied and a message appeared', () => {
    assert.equal(classifyMetaSubmit({ ...BEFORE, inputLen: 0, messages: 1, generating: false }), 'sent');
  });

  test('sent: Meta is generating before the message item shows up', () => {
    assert.equal(classifyMetaSubmit({ ...BEFORE, inputLen: 0, messages: 0, generating: true }), 'sent');
  });

  test('sent: an empty composer that reports its placeholder text', () => {
    assert.equal(classifyMetaSubmit({ ...BEFORE, inputLen: 'Ask Meta AI...'.length, messages: 2, generating: false }), 'sent');
  });

  test('pending: Enter was ignored and the prompt is still there', () => {
    assert.equal(classifyMetaSubmit({ ...BEFORE, inputLen: 901, messages: 0, generating: false }), 'pending');
  });

  test('pending: composer emptied but the page went back to an empty chat', () => {
    assert.equal(classifyMetaSubmit({ ...BEFORE, inputLen: 0, messages: 0, generating: false }), 'pending');
  });

  test('hijacked: Meta answered a suggestion chip while the prompt is still in the composer', () => {
    assert.equal(classifyMetaSubmit({ ...BEFORE, inputLen: 900, messages: 2, generating: false }), 'hijacked');
    assert.equal(classifyMetaSubmit({ ...BEFORE, inputLen: 900, messages: 0, generating: true }), 'hijacked');
  });
});

describe('composerMatchesPrompt', () => {
  const prompt = 'Create image 16:9 **Scene**:\na mascot, holding a "planner" – 春の庭';

  test('ignores spacing, line breaks and markdown marks the editor may change', () => {
    assert.equal(composerMatchesPrompt('  Create image 16:9 Scene: a mascot, holding a “planner” – 春の庭 ', prompt), true);
  });

  test('rejects another prompt of the same length', () => {
    assert.equal(composerMatchesPrompt(prompt.replace('mascot', 'person'), prompt), false);
  });

  test('rejects a cut-off prompt and leftovers around it', () => {
    assert.equal(composerMatchesPrompt('Create image 16:9 **Scene**:', prompt), false);
    assert.equal(composerMatchesPrompt(`old draft ${prompt}`, prompt), false);
    assert.equal(composerMatchesPrompt('', prompt), false);
  });
});

describe('composerHoldsPrompt', () => {
  test('an unreadable or empty composer holds nothing', () => {
    assert.equal(composerHoldsPrompt(-1, 900), false);
    assert.equal(composerHoldsPrompt(0, 900), false);
  });

  test('tolerates characters added or collapsed by the editor', () => {
    assert.equal(composerHoldsPrompt(880, 900), true);
    assert.equal(composerHoldsPrompt(910, 900), true);
  });
});
