import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { adaptKenBurnsForDuration, buildSlideVideoFilter, resolveKenBurnsAnimationSec } from './ken-burns.js';
import { AUTO_KEN_BURNS_ROTATION, KEN_BURNS_PRESETS } from './slideshow-presets.js';

const BASE = {
  width: 1920,
  height: 1080,
  fps: 30,
  tempScaleFactor: 5,
  fit: 'cover' as const,
  maxKenBurnsAnimationSec: 30,
};

/** zoompan's own expressions contain escaped commas, so anchor on `:d=N:s=`. */
function zoompanDurationOf(filter: string): number {
  const match = /:d=(\d+):s=/.exec(filter);
  assert.ok(match, `no zoompan d= in: ${filter}`);
  return Number(match[1]);
}

describe('buildSlideVideoFilter', () => {
  test('a slide shorter than the animation cap animates end to end', () => {
    const filter = buildSlideVideoFilter({ ...KEN_BURNS_PRESETS.zoomInPanBR }, { ...BASE, durationSec: 8 });

    assert.equal(zoompanDurationOf(filter), 8 * BASE.fps);
    assert.ok(!filter.includes('tpad'), 'short slide should not need a cloned tail');
  });

  test('a long slide animates only up to the cap, then clones the tail', () => {
    const durationSec = 60;
    const filter = buildSlideVideoFilter({ ...KEN_BURNS_PRESETS.panLeft }, { ...BASE, durationSec });
    const animSec = resolveKenBurnsAnimationSec(durationSec, BASE.maxKenBurnsAnimationSec);

    // zoompan renders the animated window only — the other 30s are clones.
    assert.equal(zoompanDurationOf(filter), animSec * BASE.fps);
    assert.match(filter, /tpad=stop_mode=clone:stop_duration=/);

    const stopDuration = Number(/stop_duration=([\d.]+)/.exec(filter)![1]);
    assert.ok(stopDuration >= durationSec - animSec, `tail ${stopDuration} shorter than needed`);
  });

  test('tpad is always preceded by fps so stop_duration is honoured', () => {
    // Without the fps filter, tpad cannot convert seconds into frames after
    // zoompan and silently pads two frames instead of the whole tail.
    for (const durationSec of [45, 60, 120]) {
      const filter = buildSlideVideoFilter({ ...KEN_BURNS_PRESETS.panUp }, { ...BASE, durationSec });
      assert.match(filter, new RegExp(`fps=${BASE.fps},tpad=`), `durationSec=${durationSec}`);
    }
  });

  test('a static slide holds a single frame for the full duration', () => {
    const filter = buildSlideVideoFilter(undefined, { ...BASE, durationSec: 20 });

    assert.ok(!filter.includes('zoompan'), 'static slide needs no zoompan');
    assert.match(filter, new RegExp(`fps=${BASE.fps},tpad=stop_mode=clone:stop_duration=`));
  });

  test('scales the working canvas by the supersample factor', () => {
    const filter = buildSlideVideoFilter({ ...KEN_BURNS_PRESETS.panRight }, { ...BASE, tempScaleFactor: 4, durationSec: 8 });

    assert.match(filter, /scale=7680:4320/);
  });
});

const ADAPT_OPTS = {
  width: 1920,
  height: 1080,
  fps: 30,
  minPxPerFrame: 1.75,
  longSlideLinearSec: 20,
  maxZoom: 1.55,
  focalMin: 0.2,
  focalMax: 0.8,
};

/** The crop is 1/zoom of the frame, so its centre cannot pass half a crop from an edge. */
function reachable(zoom: number): { lo: number; hi: number } {
  const half = 1 / (2 * Math.max(1, zoom));
  return { lo: half, hi: 1 - half };
}

describe('adaptKenBurnsForDuration', () => {
  // A focal point outside the reachable band does not pan further — zoompan
  // pins the crop origin and the slide freezes there. Before this was enforced,
  // panUp/panDown on a 60s slide froze for ~2.6s at each end.
  test('keeps both endpoints inside the reachable focal band', () => {
    for (const tempScaleFactor of [4, 5]) {
      for (const preset of AUTO_KEN_BURNS_ROTATION) {
        for (const animSec of [8, 30]) {
          const adapted = adaptKenBurnsForDuration(KEN_BURNS_PRESETS[preset], animSec, {
            ...ADAPT_OPTS,
            tempScaleFactor,
          });

          const start = reachable(adapted.zoomStart);
          const end = reachable(adapted.zoomEnd);
          const where = `${preset} f=${tempScaleFactor} anim=${animSec}s`;

          for (const axis of ['x', 'y'] as const) {
            assert.ok(
              adapted.from[axis] >= start.lo - 1e-9 && adapted.from[axis] <= start.hi + 1e-9,
              `${where}: from.${axis}=${adapted.from[axis]} outside [${start.lo}, ${start.hi}]`,
            );
            assert.ok(
              adapted.to[axis] >= end.lo - 1e-9 && adapted.to[axis] <= end.hi + 1e-9,
              `${where}: to.${axis}=${adapted.to[axis]} outside [${end.lo}, ${end.hi}]`,
            );
          }
        }
      }
    }
  });

  test('still reaches the minimum crop travel, falling back to zoom', () => {
    for (const tempScaleFactor of [4, 5]) {
      for (const preset of AUTO_KEN_BURNS_ROTATION) {
        const animSec = 30;
        const adapted = adaptKenBurnsForDuration(KEN_BURNS_PRESETS[preset], animSec, {
          ...ADAPT_OPTS,
          tempScaleFactor,
        });

        const frames = Math.max(1, Math.round(ADAPT_OPTS.fps * animSec) - 1);
        const uw = ADAPT_OPTS.width * tempScaleFactor;
        const uh = ADAPT_OPTS.height * tempScaleFactor;
        const pan = Math.hypot((adapted.to.x - adapted.from.x) * uw, (adapted.to.y - adapted.from.y) * uh);
        const zoom = Math.abs(uw / adapted.zoomStart - uw / adapted.zoomEnd);

        assert.ok(
          Math.max(pan, zoom) / frames >= ADAPT_OPTS.minPxPerFrame - 1e-6,
          `${preset} f=${tempScaleFactor}: only ${(Math.max(pan, zoom) / frames).toFixed(3)} px/frame`,
        );
      }
    }
  });

  test('a zoom-in-and-drift preset keeps its drift', () => {
    // Its start sits at zoom 1 where nothing can pan; bounding both endpoints by
    // the tighter of the two zooms would silently flatten it to a pure zoom.
    const adapted = adaptKenBurnsForDuration(KEN_BURNS_PRESETS.zoomInPanBR, 8, {
      ...ADAPT_OPTS,
      tempScaleFactor: 5,
    });

    assert.ok(adapted.to.x > adapted.from.x, `x did not drift: ${adapted.from.x} -> ${adapted.to.x}`);
    assert.ok(adapted.to.y > adapted.from.y, `y did not drift: ${adapted.from.y} -> ${adapted.to.y}`);
  });

  test('switches long slides to linear easing', () => {
    const long = adaptKenBurnsForDuration(KEN_BURNS_PRESETS.zoomInCenter, 25, { ...ADAPT_OPTS, tempScaleFactor: 5 });
    const short = adaptKenBurnsForDuration(KEN_BURNS_PRESETS.zoomInCenter, 8, { ...ADAPT_OPTS, tempScaleFactor: 5 });

    assert.equal(long.easing, 'linear');
    assert.equal(short.easing, 'easeInOut');
  });
});
