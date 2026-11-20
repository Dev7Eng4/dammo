import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeEach, describe, test } from 'node:test';

// paths are derived from DATA_DIR at import time, so point it at a temp dir first.
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'content-task-'));
process.env.DATA_DIR = dataDir;
const { paths } = await import('../../config/paths.js');
const { promptsSettingsService } = await import('./prompts-settings.service.js');
const { contentTaskProvider, listContentTaskProfiles, pickContentTaskProfile, pickContentTaskProfiles } =
  await import('./content-task.js');

function writeJson(file: string, value: unknown) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value));
}

function profile(name: string, llmContent: string[]) {
  return { id: name, name, userDataDir: `/tmp/${name}`, createdAt: '2026-01-01T00:00:00.000Z', llmContent };
}

const ids = (items: { id: string }[]) => items.map(item => item.id);

describe('content task settings', () => {
  beforeEach(() => {
    fs.rmSync(paths.promptsSettings, { force: true });
    fs.rmSync(paths.appSettings, { force: true });
    writeJson(paths.chromeProfiles, {
      profiles: [profile('gpt-a', ['chatgpt']), profile('gpt-b', ['chatgpt']), profile('gem', ['gemini'])],
    });
  });

  test('task LLMs follow the content LLM until chosen', () => {
    promptsSettingsService.update({ defaultLlmProvider: 'gemini' });
    assert.equal(contentTaskProvider('scriptRemake'), 'gemini');
    promptsSettingsService.update({ scriptRemakeLlmProvider: 'gpt' });
    assert.equal(contentTaskProvider('scriptRemake'), 'gpt');
    assert.equal(contentTaskProvider('metadata'), 'gemini');
  });

  test('chosen profile comes first; parallel work adds the other ticked profiles', () => {
    promptsSettingsService.update({ scenePromptLlmProvider: 'gpt', scenePromptChromeProfileId: 'gpt-b' });
    assert.equal(pickContentTaskProfile('scenePrompt').id, 'gpt-b');
    assert.deepEqual(ids(pickContentTaskProfiles('scenePrompt', 5)), ['gpt-b', 'gpt-a']);
  });

  test('a chosen profile without the LLM ticked is skipped', () => {
    promptsSettingsService.update({ metadataLlmProvider: 'gpt', metadataChromeProfileId: 'gem' });
    assert.equal(pickContentTaskProfile('metadata').id, 'gpt-a');
    // An explicit provider (e.g. a remake job started with Gemini) picks among that LLM's profiles.
    assert.deepEqual(ids(listContentTaskProfiles('metadata', 'gemini')), ['gem']);
  });

  test('blank or null profile id means automatic', () => {
    promptsSettingsService.update({ contentChromeProfileId: '  gpt-b  ' });
    assert.equal(promptsSettingsService.get().contentChromeProfileId, 'gpt-b');
    promptsSettingsService.update({ contentChromeProfileId: '  ' });
    assert.equal(promptsSettingsService.get().contentChromeProfileId, null);
    promptsSettingsService.update({ contentChromeProfileId: 'gpt-b' });
    promptsSettingsService.update({ defaultLlmProvider: 'gpt' });
    assert.equal(promptsSettingsService.get().contentChromeProfileId, 'gpt-b');
    promptsSettingsService.update({ contentChromeProfileId: null });
    assert.equal(promptsSettingsService.get().contentChromeProfileId, null);
  });

  test('the metadata profile from app settings is carried over and saved here', () => {
    writeJson(paths.appSettings, { metadataChromeProfileId: 'gpt-b' });
    assert.equal(promptsSettingsService.get().metadataChromeProfileId, 'gpt-b');
    // Survives app settings dropping the old field.
    writeJson(paths.appSettings, {});
    assert.equal(promptsSettingsService.get().metadataChromeProfileId, 'gpt-b');
  });

  test('throws NO_LLM_PROFILE when no profile has the task LLM', () => {
    writeJson(paths.chromeProfiles, { profiles: [profile('gem', ['gemini'])] });
    assert.throws(
      () => pickContentTaskProfile('content', 'gpt'),
      (err: unknown) => (err as { code?: string }).code === 'NO_LLM_PROFILE',
    );
  });
});
