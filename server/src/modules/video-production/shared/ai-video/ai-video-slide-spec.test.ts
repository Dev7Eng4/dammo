import assert from 'node:assert/strict';
import { afterEach, describe, mock, test } from 'node:test';
import { appSettingsService } from '../../../app-settings/app-settings.service.js';
import { slideVisibleDuration } from '../slideshow/slideshow-assembler.js';
import { buildXfadeChain } from '../slideshow/slideshow-transitions.js';
import type { SlideSpec } from '../slideshow/slideshow.types.js';
import { resolveImageTimeline, msToSrtTimestamp } from './ai-video-scene-timing.js';
import { addAudioDeficitHold, buildAiTimelineSlides } from './ai-video-slide-spec.js';
import type { AiVideoScenePrompt } from './ai-video.types.js';

type SceneInput = [start: number, end: number, options?: { image?: boolean; title?: boolean }];

function makeScenes(inputs: SceneInput[]): AiVideoScenePrompt[] {
  return inputs.map(([start, end, options], index) => ({
    prompt: `scene ${index + 1}`,
    startTime: msToSrtTimestamp(start * 1_000),
    endTime: msToSrtTimestamp(end * 1_000),
    ...(options?.title ? { type: 'title' as const, title: 'Heading' } : {}),
    ...(options?.image === false ? {} : { path: `images/scene-${String(index + 1).padStart(3, '0')}.jpg` }),
  }));
}

function setTransitions(enabled: boolean): void {
  const settings = appSettingsService.get();
  mock.method(appSettingsService, 'get', () => ({ ...settings, enableImageTransitions: enabled }));
}

/** When each slide takes over in the composed video: the middle of the crossfade into it, or the hard cut. */
function takeovers(slides: SlideSpec[], transitionsOn: boolean): { starts: number[]; total: number } {
  const durations = slides.map(slideVisibleDuration);
  if (!transitionsOn) {
    const starts: number[] = [];
    let t = 0;
    for (const duration of durations) {
      starts.push(t);
      t += duration;
    }
    return { starts, total: t };
  }
  const chain = buildXfadeChain({
    clipCount: slides.length,
    durations,
    transitions: slides.slice(0, -1).map(slide => ({
      type: slide.transitionToNext ?? 'fade',
      durationSec: slide.transitionDurationSec ?? 1,
    })),
  });
  const fades = [...chain.filter.matchAll(/duration=([\d.]+):offset=(-?[\d.]+)/g)];
  return { starts: [0, ...fades.map(m => Number(m[2]) + Number(m[1]) / 2)], total: chain.totalDuration };
}

function assertClose(actual: number[], expected: number[]): void {
  assert.equal(actual.length, expected.length);
  actual.forEach((value, i) => {
    assert.ok(Math.abs(value - expected[i]!) < 0.01, `slide ${i + 1}: ${value} instead of ${expected[i]}`);
  });
}

afterEach(() => mock.restoreAll());

describe('resolveImageTimeline', () => {
  const starts = (inputs: SceneInput[]) => resolveImageTimeline(makeScenes(inputs)).map(e => [e.index, e.startSec]);

  test('uses the scene starts when scenes follow each other', () => {
    assert.deepEqual(starts([[0, 5], [5, 12], [12, 20]]), [[0, 0], [1, 5], [2, 12]]);
  });

  test('a scene without an image has no entry and its time does not count', () => {
    assert.deepEqual(starts([[0, 20], [15, 30, { image: false }], [20, 40]]), [[0, 0], [2, 20]]);
  });

  test('overlapping scenes meet in the middle of the overlap and later scenes keep their start', () => {
    assert.deepEqual(starts([[0, 20], [10, 30], [30, 40]]), [[0, 0], [1, 15], [2, 30]]);
  });

  test('a scene that starts before the previous one but ends later stays after it', () => {
    assert.deepEqual(starts([[290, 298], [298, 304], [294, 314], [314, 320]]), [[0, 290], [1, 298], [2, 301], [3, 314]]);
  });

  test('scenes whose timestamps went backwards are put back in place', () => {
    assert.deepEqual(starts([[0, 10], [20, 30], [10, 20], [30, 40]]), [[0, 0], [2, 10], [1, 20], [3, 30]]);
  });

  test('two images for the same moment share it', () => {
    assert.deepEqual(starts([[0, 10], [10, 20], [10, 20], [20, 30]]), [[0, 0], [1, 10], [2, 15], [3, 20]]);
  });

  test('an image squeezed to almost nothing is dropped', () => {
    assert.deepEqual(starts([[0, 10], [10, 11.2], [10, 20], [20, 30]]).map(([index]) => index), [0, 2, 3]);
  });

  test('a genuinely short scene is kept', () => {
    assert.deepEqual(starts([[0, 10], [10, 10.5], [10.5, 20]]), [[0, 0], [1, 10], [2, 10.5]]);
  });

  test('a title card keeps its exact range when it overlaps', () => {
    assert.deepEqual(starts([[0, 12], [10, 13, { title: true }], [11, 20]]), [[0, 0], [1, 10], [2, 13]]);
  });
});

describe('buildAiTimelineSlides', () => {
  for (const transitionsOn of [true, false]) {
    describe(`transitions ${transitionsOn ? 'on' : 'off'}`, () => {
      const build = (inputs: SceneInput[]) => {
        setTransitions(transitionsOn);
        return buildAiTimelineSlides('/work', makeScenes(inputs));
      };

      test('every image takes over at its own start, also after 120 scenes', () => {
        const inputs: SceneInput[] = Array.from({ length: 120 }, (_, i) => [i * 7, i * 7 + 7]);
        const { starts, total } = takeovers(build(inputs), transitionsOn);
        assertClose(starts, inputs.map(([start]) => start));
        assert.ok(total >= 120 * 7 - 0.01);
      });

      test('gaps, missing images and overlaps do not move later images', () => {
        const slides = build([[0.8, 5], [6, 12], [12, 20], [17, 30, { image: false }], [20, 40], [35, 50], [53, 60]]);
        assertClose(takeovers(slides, transitionsOn).starts, [0, 6, 12, 20, 37.5, 53]);
      });

      test('very short scenes still line up', () => {
        const slides = build([[0, 0.4], [0.4, 0.9], [0.9, 6], [6, 6.3], [6.3, 12]]);
        assertClose(takeovers(slides, transitionsOn).starts, [0, 0.4, 0.9, 6, 6.3]);
      });

      test('clips keep their scene duration so cached clips stay valid; only overlapped ones shrink', () => {
        const slides = build([[0, 5], [5, 12], [12, 40], [20, 50]]);
        assert.deepEqual(slides.slice(0, 2).map(slide => slide.durationSec), [5, 7]);
        assert.ok(slides[2]!.durationSec < 28);
        assert.ok(slides.every(slide => (slide.holdBeforeSec ?? 0) >= 0 && (slide.holdAfterSec ?? 0) >= 0));
      });

      test('the first image covers the time before its own start', () => {
        const slides = build([[0, 3, { image: false }], [3, 10], [10, 20]]);
        assert.equal(slides[0]!.holdBeforeSec, 3);
        assertClose(takeovers(slides, transitionsOn).starts, [0, 10]);
      });

      test('the audio deficit only extends the last image', () => {
        const slides = addAudioDeficitHold(build([[0, 5], [5, 12], [12, 20]]), 30);
        const { starts, total } = takeovers(slides, transitionsOn);
        assertClose(starts, [0, 5, 12]);
        assert.ok(Math.abs(total - 30) < 0.01);
      });
    });
  }
});

describe('video clips', () => {
  test('a video clip cuts straight in and out; only image to image keeps its transition', async () => {
    const fs = await import('node:fs');
    const os = await import('node:os');
    const path = await import('node:path');
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'slide-spec-'));
    try {
      fs.mkdirSync(path.join(workDir, 'clips'));
      for (const name of ['scene-001', 'scene-002', 'scene-005']) {
        fs.writeFileSync(path.join(workDir, 'clips', `${name}.mp4`), '');
      }
      setTransitions(true);
      const scenes = makeScenes([[0, 5], [5, 10], [10, 15], [15, 20], [20, 25]]);
      scenes[0]!.videoPath = 'clips/scene-001.mp4';
      scenes[1]!.videoPath = 'clips/scene-002.mp4';
      scenes[2]!.videoPath = 'clips/missing.mp4';
      scenes[4]!.videoPath = 'clips/scene-005.mp4';
      const slides = buildAiTimelineSlides(workDir, scenes);

      assert.equal(slides[0]!.transitionDurationSec, 0, 'clip → clip');
      assert.equal(slides[0]!.transitionToNext, undefined);
      assert.equal(slides[1]!.transitionDurationSec, 0, 'clip → image');
      assert.ok((slides[2]!.transitionDurationSec ?? 0) > 0, 'image → image (a missing clip file counts as an image)');
      assert.equal(slides[3]!.transitionDurationSec, 0, 'image → clip');

      const durations = slides.map(slideVisibleDuration);
      const chain = buildXfadeChain({
        clipCount: slides.length,
        durations,
        transitions: slides.slice(0, -1).map(slide => ({
          type: slide.transitionToNext ?? 'fade',
          durationSec: slide.transitionDurationSec ?? 1,
        })),
      });
      assert.match(chain.filter, /\[tb0\]\[tb1\]concat=n=2:v=1:a=0\[xf0\];\[xf0\]\[tb2\]concat=n=2:v=1:a=0\[xf1\];\[xf1\]\[tb3\]xfade=[^;]+\[xf2\];\[xf2\]\[tb4\]concat=/);
      assert.ok(Math.abs(chain.totalDuration - 25) < 0.01, `total ${chain.totalDuration}`);
    } finally {
      fs.rmSync(workDir, { recursive: true, force: true });
    }
  });
});
