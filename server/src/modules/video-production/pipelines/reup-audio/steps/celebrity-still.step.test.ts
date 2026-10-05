import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { addAudioDeficitHold, buildStillBackgroundSlides } from '../../../shared/ai-video/ai-video-slide-spec.js';
import { CELEBRITY_WISDOM_NICHE_ID } from '../../../shared/meta/metadata.types.js';
import { usesCelebrityStillBackground } from './celebrity-still.step.js';

describe('usesCelebrityStillBackground', () => {
  const base = { reupAudioVideoType: 'ai' as const, niche: CELEBRITY_WISDOM_NICHE_ID };

  test('true only for ai + celebrity-wisdom niche', () => {
    assert.equal(usesCelebrityStillBackground(base), true);
    assert.equal(usesCelebrityStillBackground({ ...base, reupAudioVideoType: 'si' }), false);
    assert.equal(usesCelebrityStillBackground({ ...base, niche: 'all' }), false);
  });
});

describe('buildStillBackgroundSlides', () => {
  const scene = { prompt: '', startTime: '00:00:00,000', endTime: '00:10:00,000', path: 'images/scene-001.jpg' };

  test('one letterboxed static slide stretched over the audio by hold', () => {
    const slides = buildStillBackgroundSlides('/work', [scene]);
    assert.equal(slides.length, 1);
    assert.equal(slides[0]!.fit, 'contain');
    assert.equal(slides[0]!.kenBurns, undefined);

    const held = addAudioDeficitHold(slides, 600);
    assert.ok(Math.abs(held[0]!.durationSec + (held[0]!.holdAfterSec ?? 0) - 600) < 0.01);
  });

  test('throws without an image', () => {
    assert.throws(() => buildStillBackgroundSlides('/work', [{ ...scene, path: undefined }]));
  });
});
