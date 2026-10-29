import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { LlmBrowserResponse } from '../../../llm-browser/core/types.js';
import { selectScenesForVideo } from './ai-video-scene-clip-generator.js';
import { tryParseAiVideoSceneResponse } from './ai-video-scene-response.js';
import { buildAiTimedSlides } from './ai-video-slide-spec.js';
import {
  buildOutsideTitleCardsExpr,
  buildTitleCardAss,
  resolveTitleCardRanges,
  stripSrtCuesOnTitleCards,
  wrapTitleLines,
} from './ai-video-title-card.js';
import type { AiVideoScenePrompt } from './ai-video.types.js';

function llmResponse(payload: unknown): LlmBrowserResponse {
  return { provider: 'gemini', content: JSON.stringify(payload), codeBlocks: [], elapsedMs: 0 };
}

const imageScene: AiVideoScenePrompt = {
  prompt: 'p',
  startTime: '00:00:00,000',
  endTime: '00:00:05,000',
  path: 'images/scene-001.jpg',
};
const titleScene: AiVideoScenePrompt = {
  type: 'title',
  title: 'その1　口ぐせ',
  prompt: '',
  startTime: '00:00:05,000',
  endTime: '00:00:08,000',
  path: 'images/scene-002.jpg',
};

describe('tryParseAiVideoSceneResponse with title scenes', () => {
  test('accepts a title object without prompt next to image scenes', () => {
    const scenes = tryParseAiVideoSceneResponse(
      llmResponse([
        { prompt: 'a', references: ['x'], startTime: '00:00:00,000', endTime: '00:00:05,000' },
        { type: 'title', title: ' その1 ', startTime: '00:00:05,000', endTime: '00:00:08,000' },
      ]),
      { requireReferences: true },
    );
    assert.ok(scenes);
    assert.deepEqual(scenes[1], {
      type: 'title',
      title: 'その1',
      prompt: '',
      startTime: '00:00:05,000',
      endTime: '00:00:08,000',
      references: [],
    });
  });

  test('rejects a title object with empty title', () => {
    const scenes = tryParseAiVideoSceneResponse(
      llmResponse([{ type: 'title', title: ' ', startTime: '00:00:05,000', endTime: '00:00:08,000' }]),
    );
    assert.equal(scenes, null);
  });
});

describe('title card layout', () => {
  test('short Japanese heading stays on one line', () => {
    assert.deepEqual(wrapTitleLines('その1　口ぐせ', 15), ['その1　口ぐせ']);
  });

  test('long heading breaks after punctuation and never starts a line with it', () => {
    const lines = wrapTitleLines('定年後に家族との距離が、少しずつ離れていく本当の理由', 15);
    assert.deepEqual(lines, ['定年後に家族との距離が、', '少しずつ離れていく本当の理由']);
    const hardBreak = wrapTitleLines('定年後に家族との距離が少しず、つ', 15);
    assert.deepEqual(hardBreak, ['定年後に家族との距離が少しず、', 'つ']);
  });

  test('ASS escapes override braces in the heading', () => {
    const ass = buildTitleCardAss('{bad}\\title', 'Noto Serif JP');
    assert.ok(ass.includes('｛bad｝＼title'));
  });
});

describe('title scenes in the slideshow', () => {
  test('title card slides have no Ken Burns, image slides keep it', () => {
    const slides = buildAiTimedSlides('/work', [imageScene, titleScene]);
    assert.ok(slides[0]!.kenBurns);
    assert.equal(slides[1]!.kenBurns, undefined);
  });

  test('title scenes never become Flow video clips', () => {
    assert.deepEqual(selectScenesForVideo([imageScene, titleScene], 'full'), [0]);
  });

  test('captions on a title card are dropped and re-indexed', () => {
    const srt = [
      '1\n00:00:01,000 --> 00:00:04,000\n本文',
      '2\n00:00:05,100 --> 00:00:07,800\nその1、口ぐせ',
      '3\n00:00:08,000 --> 00:00:10,000\n続き',
    ].join('\n\n');
    const ranges = resolveTitleCardRanges([imageScene, titleScene]);
    assert.deepEqual(ranges, [{ startSec: 5, endSec: 8 }]);
    assert.equal(
      stripSrtCuesOnTitleCards(srt, ranges),
      '1\n00:00:01,000 --> 00:00:04,000\n本文\n\n2\n00:00:08,000 --> 00:00:10,000\n続き\n',
    );
    assert.equal(buildOutsideTitleCardsExpr(ranges), 'not(between(t,5.000,8.000))');
  });

  test('title scene without a rendered card is not treated as a card', () => {
    const { path: _path, ...withoutImage } = titleScene;
    assert.deepEqual(resolveTitleCardRanges([withoutImage]), []);
  });
});
