import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, test } from 'node:test';
import { applyClipSpans, sceneClipLengthSec, sceneClipWindowSec } from './ai-video-clip-span.js';
import type { AiVideoScenePrompt } from './ai-video.types.js';

const at = (sec: number) => `00:00:${String(Math.floor(sec)).padStart(2, '0')},${String(Math.round((sec % 1) * 1000)).padStart(3, '0')}`;

function scenes(): AiVideoScenePrompt[] {
  // 0–4.9, 4.9–7.7, 7.7–11, 11–17
  return [
    { prompt: 'a', startTime: at(0), endTime: at(4.9), path: 'images/scene-001.jpg' },
    { prompt: 'b', startTime: at(4.9), endTime: at(7.7), path: 'images/scene-002.jpg' },
    { prompt: 'c', startTime: at(7.7), endTime: at(11), path: 'images/scene-003.jpg' },
    { prompt: 'd', startTime: at(11), endTime: at(17), path: 'images/scene-004.jpg' },
  ];
}

describe('clip window and length', () => {
  test('window runs to the start of the first scene after the span', () => {
    const list = scenes();
    assert.equal(sceneClipWindowSec(list, 0), 4.9);
    list[0]!.clipSpan = 2;
    assert.equal(Math.round(sceneClipWindowSec(list, 0) * 10) / 10, 7.7);
    assert.equal(Math.round(sceneClipWindowSec(list, 0, 1.1) * 100) / 100, 7);
  });

  test('span is cut at the end of the list', () => {
    const list = scenes();
    list[3]!.clipSpan = 3;
    assert.equal(sceneClipWindowSec(list, 3), 6);
  });

  test('length rounds up and stays in the Flow slider range', () => {
    assert.equal(sceneClipLengthSec(7.7), 8);
    assert.equal(sceneClipLengthSec(7.2), 7);
    assert.equal(sceneClipLengthSec(1.5), 3);
    assert.equal(sceneClipLengthSec(14), 10);
  });
});

describe('applyClipSpans', () => {
  test('covers the spanned scenes only while the clip file exists', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'clip-span-'));
    try {
      const list = scenes();
      list[0]!.clipSpan = 2;
      list[0]!.videoPath = 'videos/scene-001.mp4';

      const withoutClip = applyClipSpans(dir, list);
      assert.equal(withoutClip[1]!.path, 'images/scene-002.jpg');
      assert.equal(withoutClip[0]!.endTime, at(4.9));

      fs.mkdirSync(path.join(dir, 'videos'));
      fs.writeFileSync(path.join(dir, 'videos', 'scene-001.mp4'), 'x');
      const withClip = applyClipSpans(dir, list);
      assert.equal(withClip[0]!.endTime, at(7.7));
      assert.equal(withClip[1]!.path, undefined);
      assert.equal(withClip[2]!.path, 'images/scene-003.jpg');
      // The input is left untouched.
      assert.equal(list[1]!.path, 'images/scene-002.jpg');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
