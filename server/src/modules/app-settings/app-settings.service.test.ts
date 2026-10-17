import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, test } from 'node:test';

// paths.appSettings is derived from DATA_DIR at import time, so point it at a temp dir first.
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'app-settings-'));
process.env.DATA_DIR = dataDir;
const { appSettingsService, DEFAULT_REMOVE_GEMINI_WATERMARK_PROMPT } = await import('./app-settings.service.js');

describe('remove Gemini watermark settings', () => {
  test('defaults to off with the standard prompt', () => {
    const settings = appSettingsService.get();
    assert.equal(settings.removeGeminiWatermark, false);
    assert.equal(settings.removeGeminiWatermarkPrompt, DEFAULT_REMOVE_GEMINI_WATERMARK_PROMPT);
  });

  test('persists the toggle and a custom prompt', () => {
    appSettingsService.update({ removeGeminiWatermark: true, removeGeminiWatermarkPrompt: '  Remove the star  ' });
    const settings = appSettingsService.get();
    assert.equal(settings.removeGeminiWatermark, true);
    assert.equal(settings.removeGeminiWatermarkPrompt, 'Remove the star');
  });

  test('a blank prompt falls back to the default and other settings are untouched', () => {
    appSettingsService.update({ removeGeminiWatermarkPrompt: '   ' });
    const settings = appSettingsService.get();
    assert.equal(settings.removeGeminiWatermarkPrompt, DEFAULT_REMOVE_GEMINI_WATERMARK_PROMPT);
    assert.equal(settings.removeGeminiWatermark, true);
    assert.equal(settings.taskQueueConcurrency, 1);
  });
});
