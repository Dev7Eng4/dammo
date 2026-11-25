import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, test } from 'node:test';
import { findFinalVideoMp4, renderFinalVideoMp4 } from './video-output-file.js';

let dir: string;

function writeMp4(name: string, size: number, ageSec: number): string {
  const filePath = path.join(dir, name);
  fs.writeFileSync(filePath, Buffer.alloc(size));
  const at = new Date(Date.now() - ageSec * 1_000);
  fs.utimesSync(filePath, at, at);
  return filePath;
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'video-output-file-'));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('findFinalVideoMp4', () => {
  test('prefers the newest render even when the old one is larger', () => {
    writeMp4('old title.mp4', 500, 3_600);
    const fresh = writeMp4('new title.mp4', 100, 0);
    assert.equal(findFinalVideoMp4(dir), fresh);
  });

  test('ignores intermediates and a render still in progress', () => {
    const final = writeMp4('title.mp4', 100, 3_600);
    writeMp4('stock_raw.mp4', 900, 0);
    writeMp4('rendering_output.mp4', 900, 0);
    assert.equal(findFinalVideoMp4(dir), final);
  });
});

describe('renderFinalVideoMp4', () => {
  const render = (size: number) => async (basename: string) => {
    fs.writeFileSync(path.join(dir, `${basename}.mp4`), Buffer.alloc(size));
    return path.join(dir, `${basename}.mp4`);
  };

  test('replaces the previous video when the title changed', async () => {
    writeMp4('old title.mp4', 500, 3_600);
    const result = await renderFinalVideoMp4(dir, 'new title', render(100));
    assert.equal(result, path.join(dir, 'new title.mp4'));
    assert.deepEqual(fs.readdirSync(dir), ['new title.mp4']);
  });

  test('overwrites in place when the title is unchanged, even while the old file is being read', async () => {
    const old = writeMp4('title.mp4', 500, 3_600);
    const reader = fs.openSync(old, 'r');
    try {
      await renderFinalVideoMp4(dir, 'title', render(100));
    } finally {
      fs.closeSync(reader);
    }
    assert.deepEqual(fs.readdirSync(dir), ['title.mp4']);
    assert.equal(fs.statSync(old).size, 100);
  });

  test('keeps the previous video when the render fails', async () => {
    const old = writeMp4('old title.mp4', 500, 3_600);
    await assert.rejects(
      renderFinalVideoMp4(dir, 'new title', async basename => {
        fs.writeFileSync(path.join(dir, `${basename}.mp4`), Buffer.alloc(10));
        throw new Error('ffmpeg failed');
      }),
      /ffmpeg failed/,
    );
    assert.deepEqual(fs.readdirSync(dir), ['old title.mp4']);
    assert.equal(findFinalVideoMp4(dir), old);
  });
});
