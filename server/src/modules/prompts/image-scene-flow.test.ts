import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  findConflictingImageSceneFlowSet,
  findMalformedImageSceneFlowSets,
  selectImageSceneFlow,
} from './image-scene-flow.js';
import type { PromptSet } from './prompts.types.js';

const NICHE = 'nguoi-gia';

function set(
  baseKey: string,
  niche: string,
  refs: boolean[],
  overrides: Partial<PromptSet> = {},
): PromptSet {
  return {
    id: `all:${baseKey}`,
    baseKey,
    language: 'all',
    name: baseKey,
    category: 'image',
    niche,
    createdAt: '',
    updatedAt: '',
    steps: refs.map((ref, index) => ({
      id: `${baseKey}-${index + 1}`,
      key: refs.length === 1 ? baseKey : `${baseKey}_step_${index + 1}`,
      step: index + 1,
      ...(ref ? { useReferenceImage: true } : {}),
    })),
    ...overrides,
  };
}

const allPlain = set('image_scenes', 'all', [false]);
const allRef = set('image_scenes_with_references', 'all', [true, true]);

describe('selectImageSceneFlow', () => {
  test('uses the niche flow when the niche owns one for the mode', () => {
    const nicheRef = set('anh_nguoi_gia', NICHE, [true, true]);
    const flow = selectImageSceneFlow([allPlain, allRef, nicheRef], NICHE, true);
    assert.equal(flow?.setId, nicheRef.id);
    assert.equal(flow?.niche, NICHE);
    assert.deepEqual(flow?.stepKeys, ['anh_nguoi_gia_step_1', 'anh_nguoi_gia_step_2']);
  });

  test('falls back to the all flow of the same mode', () => {
    const nichePlain = set('anh_nguoi_gia', NICHE, [false]);
    const flow = selectImageSceneFlow([allPlain, allRef, nichePlain], NICHE, true);
    assert.equal(flow?.setId, allRef.id);
    assert.equal(flow?.mode, 'reference');
  });

  test('plain mode picks the 1-step flow', () => {
    const flow = selectImageSceneFlow([allRef, allPlain], 'all', false);
    assert.deepEqual(flow?.stepKeys, ['image_scenes']);
  });

  test('skips malformed and non-shared-language sets', () => {
    const malformed = set('bad', NICHE, [false, false]);
    const jaSet = set('ja_only', NICHE, [true, true], { language: 'ja' });
    const flow = selectImageSceneFlow([allRef, malformed, jaSet], NICHE, true);
    assert.equal(flow?.setId, allRef.id);
    assert.deepEqual(findMalformedImageSceneFlowSets([allRef, malformed, jaSet]), [malformed]);
  });

  test('returns null when neither niche nor all has the mode', () => {
    assert.equal(selectImageSceneFlow([allPlain], NICHE, true), null);
  });
});

describe('findConflictingImageSceneFlowSet', () => {
  test('flags another set with the same niche and mode', () => {
    const conflict = findConflictingImageSceneFlowSet([allPlain, allRef], {
      baseKey: 'new_flow',
      niche: 'all',
      useReferenceImage: true,
    });
    assert.equal(conflict?.id, allRef.id);
  });

  test('ignores the set being edited and other niches', () => {
    const sets = [allPlain, allRef, set('anh_nguoi_gia', NICHE, [false])];
    assert.equal(
      findConflictingImageSceneFlowSet(sets, { baseKey: 'image_scenes', niche: 'all', useReferenceImage: false }),
      null,
    );
    assert.equal(
      findConflictingImageSceneFlowSet(sets, { baseKey: 'new_flow', niche: NICHE, useReferenceImage: true }),
      null,
    );
  });
});
