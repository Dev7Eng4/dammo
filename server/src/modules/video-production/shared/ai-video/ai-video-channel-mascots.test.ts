import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';

let dataDir = '';
let mascots: typeof import('./ai-video-channel-mascots.js');

before(async () => {
  dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dammo-mascots-'));
  process.env.DATA_DIR = dataDir;
  mascots = await import('./ai-video-channel-mascots.js');
});

after(async () => {
  await fs.rm(dataDir, { recursive: true, force: true });
});

async function makeWorkDir(name: string): Promise<string> {
  const workDir = path.join(dataDir, 'work', name);
  await fs.mkdir(path.join(workDir, 'image-references'), { recursive: true });
  return workDir;
}

async function exists(filePath: string): Promise<boolean> {
  return fs
    .access(filePath)
    .then(() => true)
    .catch(() => false);
}

describe('channel mascot store', () => {
  test('is a no-op when the channel has no mascots folder', async () => {
    const workDir = await makeWorkDir('off');
    const input = { channelId: 'ch-off', workDir, characterIds: ['haru'] };

    assert.deepEqual(await mascots.seedImageReferencesFromChannelMascots(input), []);
    await fs.writeFile(path.join(workDir, 'image-references', 'haru.jpg'), 'img');
    assert.deepEqual(await mascots.promoteImageReferencesToChannelMascots(input), []);
    assert.equal(await mascots.saveChannelMascotImage('ch-off', 'haru', { buffer: Buffer.from('x'), extension: '.png' }), false);
    assert.equal(await exists(mascots.resolveChannelMascotsDir('ch-off')), false);
  });

  test('promotes generated images, then seeds them into the next video', async () => {
    await fs.mkdir(mascots.resolveChannelMascotsDir('ch-on'), { recursive: true });

    const first = await makeWorkDir('first');
    await fs.writeFile(path.join(first, 'image-references', 'haru.jpg'), 'haru-v1');
    const promoted = await mascots.promoteImageReferencesToChannelMascots({
      channelId: 'ch-on',
      workDir: first,
      characterIds: ['haru', 'gen'],
    });
    assert.deepEqual(promoted, ['haru']);

    const second = await makeWorkDir('second');
    const seeded = await mascots.seedImageReferencesFromChannelMascots({
      channelId: 'ch-on',
      workDir: second,
      characterIds: ['haru', 'gen'],
    });
    assert.deepEqual(seeded, ['haru']);
    assert.equal(await fs.readFile(path.join(second, 'image-references', 'haru.jpg'), 'utf8'), 'haru-v1');
  });

  test('does not overwrite an image already present in the video or in the store', async () => {
    const workDir = await makeWorkDir('keep');
    await fs.writeFile(path.join(workDir, 'image-references', 'haru.jpg'), 'custom-for-this-video');

    const seeded = await mascots.seedImageReferencesFromChannelMascots({
      channelId: 'ch-on',
      workDir,
      characterIds: ['haru'],
    });
    assert.deepEqual(seeded, []);
    assert.equal(await fs.readFile(path.join(workDir, 'image-references', 'haru.jpg'), 'utf8'), 'custom-for-this-video');

    const promoted = await mascots.promoteImageReferencesToChannelMascots({
      channelId: 'ch-on',
      workDir,
      characterIds: ['haru'],
    });
    assert.deepEqual(promoted, []);
  });

  test('saveChannelMascotImage replaces the stored file even with another extension', async () => {
    const saved = await mascots.saveChannelMascotImage('ch-on', 'Haru', { buffer: Buffer.from('haru-v2'), extension: '.png' });
    assert.equal(saved, true);

    const dir = mascots.resolveChannelMascotsDir('ch-on');
    assert.equal(await exists(path.join(dir, 'haru.jpg')), false);
    assert.equal(await fs.readFile(path.join(dir, 'haru.png'), 'utf8'), 'haru-v2');

    const workDir = await makeWorkDir('after-save');
    await mascots.seedImageReferencesFromChannelMascots({ channelId: 'ch-on', workDir, characterIds: ['haru'] });
    assert.equal(await fs.readFile(path.join(workDir, 'image-references', 'haru.png'), 'utf8'), 'haru-v2');
  });
});
