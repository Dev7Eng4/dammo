import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, test } from 'node:test';
import { resolveFixedAudioSpeed } from '../../../youtube-channels/youtube-channels.types.js';
import { AUDIO_SPEED_MAX, AUDIO_SPEED_MIN } from '../render-core/canvas.constants.js';
import { loadAiRenderConfig, resolveAiRenderConfig, resolveAiRenderConfigPath } from './ai-render-config.js';

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-render-config-'));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

test('only remake channels have a fixed audio speed', () => {
  assert.equal(resolveFixedAudioSpeed('remake_video'), 1);
  assert.equal(resolveFixedAudioSpeed('reup_audio'), undefined);
  assert.equal(resolveFixedAudioSpeed(undefined), undefined);
});

describe('resolveAiRenderConfig', () => {
  test('picks a random slow-down once and keeps it', async () => {
    const first = await resolveAiRenderConfig(dir, { kenBurns: true });
    assert.ok(first.audioSpeed >= AUDIO_SPEED_MIN && first.audioSpeed <= AUDIO_SPEED_MAX);
    assert.deepEqual(await resolveAiRenderConfig(dir, { kenBurns: true }), first);
  });

  test('creates the config at the fixed speed', async () => {
    await resolveAiRenderConfig(dir, { kenBurns: false, fixedAudioSpeed: 1 });
    assert.equal((await loadAiRenderConfig(dir)).audioSpeed, 1);
  });

  test('the fixed speed replaces a speed saved earlier and keeps the other fields', async () => {
    const saved = { audioSpeed: 0.955, createdAt: '2026-11-21T12:41:45.001Z', kenBurns: true };
    fs.writeFileSync(resolveAiRenderConfigPath(dir), JSON.stringify(saved));
    const resolved = await resolveAiRenderConfig(dir, { kenBurns: false, fixedAudioSpeed: 1 });
    assert.deepEqual(resolved, { ...saved, audioSpeed: 1 });
    assert.deepEqual(await loadAiRenderConfig(dir), { ...saved, audioSpeed: 1 });
  });
});
