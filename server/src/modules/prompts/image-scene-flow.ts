import type { PromptSet } from './prompts.types.js';

/**
 * Scene-image prompt flows (category `image`, language `all`).
 *
 * Each niche (and `all`) may own at most one flow per mode:
 * - `plain`: 1 step, `useReferenceImage` off → scene prompts.
 * - `reference`: 2 steps, `useReferenceImage` on → step 1 character design, step 2 scene prompts.
 */
export type ImageSceneFlowMode = 'plain' | 'reference';

/** Scene-image flows are shared across every channel language. */
export const IMAGE_SCENE_FLOW_LANGUAGE = 'all';

export interface ImageSceneFlow {
  mode: ImageSceneFlowMode;
  setId: string;
  setName: string;
  /** Niche of the set actually used (`all` when the channel niche fell back). */
  niche: string;
  /** Step keys ordered by step: 1 key for `plain`, 2 for `reference`. */
  stepKeys: string[];
}

export function imageSceneFlowModeOf(useReferenceImage: boolean | undefined): ImageSceneFlowMode {
  return useReferenceImage === true ? 'reference' : 'plain';
}

function isImageSceneFlowCandidate(set: PromptSet): boolean {
  return set.category === 'image' && set.language === IMAGE_SCENE_FLOW_LANGUAGE;
}

/** Mode of a well-formed flow set, or null when the step count / flags do not match either mode. */
export function classifyImageSceneFlowSet(set: PromptSet): ImageSceneFlowMode | null {
  if (!isImageSceneFlowCandidate(set)) return null;
  const refs = set.steps.map((step) => step.useReferenceImage === true);
  if (refs.length === 1 && !refs[0]) return 'plain';
  if (refs.length === 2 && refs.every(Boolean)) return 'reference';
  return null;
}

function toFlow(set: PromptSet, mode: ImageSceneFlowMode): ImageSceneFlow {
  return {
    mode,
    setId: set.id,
    setName: set.name,
    niche: set.niche || 'all',
    stepKeys: [...set.steps].sort((a, b) => a.step - b.step).map((step) => step.key),
  };
}

function findFlowForNiche(
  sets: PromptSet[],
  niche: string,
  mode: ImageSceneFlowMode,
): ImageSceneFlow | null {
  const set = sets.find(
    (item) => (item.niche || 'all') === niche && classifyImageSceneFlowSet(item) === mode,
  );
  return set ? toFlow(set, mode) : null;
}

/** Channel niche flow first, then the `all` flow of the same mode. */
export function selectImageSceneFlow(
  sets: PromptSet[],
  niche: string | undefined,
  useReferenceImage: boolean | undefined,
): ImageSceneFlow | null {
  const mode = imageSceneFlowModeOf(useReferenceImage);
  const nicheId = niche?.trim() || 'all';
  if (nicheId !== 'all') {
    const own = findFlowForNiche(sets, nicheId, mode);
    if (own) return own;
  }
  return findFlowForNiche(sets, 'all', mode);
}

/** Candidate sets whose shape matches neither mode (skipped by `selectImageSceneFlow`). */
export function findMalformedImageSceneFlowSets(sets: PromptSet[]): PromptSet[] {
  return sets.filter((set) => isImageSceneFlowCandidate(set) && classifyImageSceneFlowSet(set) === null);
}

/**
 * Another set (different baseKey) already owning the same niche + mode.
 * Mode of an existing set is read from its first step so half-saved sets still count.
 */
export function findConflictingImageSceneFlowSet(
  sets: PromptSet[],
  input: { baseKey: string; niche: string; useReferenceImage: boolean | undefined },
): PromptSet | null {
  const mode = imageSceneFlowModeOf(input.useReferenceImage);
  const niche = input.niche || 'all';
  return (
    sets.find((set) => {
      if (!isImageSceneFlowCandidate(set) || set.baseKey === input.baseKey) return false;
      if ((set.niche || 'all') !== niche) return false;
      const first = [...set.steps].sort((a, b) => a.step - b.step)[0];
      return imageSceneFlowModeOf(first?.useReferenceImage) === mode;
    }) ?? null
  );
}
