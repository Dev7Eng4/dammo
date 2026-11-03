import fs from 'node:fs/promises';
import path from 'node:path';
import { youtubeChannelDir } from '../../../../config/paths.js';
import { executePromptTemplate } from '../../../prompts/prompts.file-store.js';
import { chatForJsonOnSubProfile } from '../sub-profile-json-chat.js';
import { resolveChannelMascotImagePath, resolveChannelMascotSheetPath } from './ai-video-channel-mascots.js';
import { MASCOT_PROFILE_PROMPT_KEY } from './ai-video.constants.js';

/**
 * Channel mascot profile: what the scene-prompt LLM needs to know about the mascot (it never sees the image).
 * Written once by a vision LLM from `mascot.*` (+ `mascot-sheet.*`) and cached in `<channel dir>/mascot-profile.json`;
 * the cache is rebuilt whenever either image changes.
 */
export const CHANNEL_MASCOT_PROFILE_FILENAME = 'mascot-profile.json';

/** Every identity phrase contains this word; scene prompts use it only for scenes that show the mascot. */
export const MASCOT_KEYWORD = 'mascot';

const PROFILE_TIMEOUT_MS = 300_000;
const MAX_EXPRESSIONS = 12;
const MAX_POSES = 12;
const MAX_EFFECTS = 8;
const MAX_AVOID = 12;

export interface MascotExpression {
  /** Emotion in plain English, e.g. "angry". */
  emotion: string;
  /** How this mascot shows it, e.g. "slanted brows, open red mouth". */
  look: string;
}

export interface MascotProfile {
  /** Short English Base Identity used verbatim in every scene prompt that shows the mascot. */
  identityPhrase: string;
  /** English art style derived from the mascot; replaces the channel visual style for scene images. */
  styleRule: string;
  expressions: MascotExpression[];
  poses: string[];
  effects: string[];
  /** Things that break the mascot (e.g. "fingers", "nose", "realistic humans"). */
  avoid: string[];
  /** How other people in a scene are drawn so they fit the mascot world. */
  supportingCastRule: string;
}

interface StoredMascotProfile {
  /** Fingerprint of the source images; a mismatch means the mascot changed. */
  source: string;
  generatedAt: string;
  profile: MascotProfile;
}

/** Used when the profile LLM fails; scene prompts still revolve around the mascot, just with less detail. */
export const FALLBACK_MASCOT_PROFILE: MascotProfile = {
  identityPhrase: 'the channel mascot character from the reference image',
  styleRule:
    'simple clean illustration in exactly the same art style as the mascot reference image (same line art, colors and shading), plain uncluttered background',
  expressions: [],
  poses: [],
  effects: [],
  avoid: ['realistic humans', 'photorealism', 'character sheet', 'multiple poses of the same character'],
  supportingCastRule:
    'Other people are simple characters of the same design family as the mascot, told apart by one accessory or clothing color.',
};

function oneLine(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function stringList(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(oneLine).filter(Boolean).slice(0, max);
}

export function parseMascotProfile(jsonText: string): MascotProfile {
  let raw: unknown;
  try {
    raw = JSON.parse(jsonText);
  } catch {
    throw new Error('Mascot profile is not valid JSON');
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('Mascot profile must be a JSON object');
  }
  const data = raw as Record<string, unknown>;

  let identityPhrase = oneLine(data.identity_phrase);
  const styleRule = oneLine(data.style_rule);
  if (!identityPhrase) throw new Error('Mascot profile has no identity_phrase');
  if (!styleRule) throw new Error('Mascot profile has no style_rule');
  // Scene prompts are matched on this word to know which scenes show the mascot.
  if (!new RegExp(`\\b${MASCOT_KEYWORD}\\b`, 'i').test(identityPhrase)) {
    identityPhrase = `${identityPhrase} (the ${MASCOT_KEYWORD})`;
  }

  const expressions = Array.isArray(data.expressions)
    ? data.expressions
        .map(item => {
          const entry = (item ?? {}) as Record<string, unknown>;
          return { emotion: oneLine(entry.emotion), look: oneLine(entry.look) };
        })
        .filter(item => item.emotion && item.look)
        .slice(0, MAX_EXPRESSIONS)
    : [];

  return {
    identityPhrase,
    styleRule,
    expressions,
    poses: stringList(data.poses, MAX_POSES),
    effects: stringList(data.effects, MAX_EFFECTS),
    avoid: stringList(data.avoid, MAX_AVOID),
    supportingCastRule: oneLine(data.supporting_cast_rule) || FALLBACK_MASCOT_PROFILE.supportingCastRule,
  };
}

/** True when a scene prompt shows the mascot (identity phrases always contain the keyword). */
export function scenePromptShowsMascot(prompt: string): boolean {
  return new RegExp(`\\b${MASCOT_KEYWORD}\\b`, 'i').test(prompt);
}

function resolveProfilePath(channelId: string): string {
  return path.join(youtubeChannelDir(channelId), CHANNEL_MASCOT_PROFILE_FILENAME);
}

async function fingerprint(filePaths: Array<string | undefined>): Promise<string> {
  const parts: string[] = [];
  for (const filePath of filePaths) {
    if (!filePath) continue;
    const stat = await fs.stat(filePath);
    parts.push(`${path.basename(filePath)}:${stat.size}:${Math.round(stat.mtimeMs)}`);
  }
  return parts.join('|');
}

async function readStored(channelId: string): Promise<StoredMascotProfile | null> {
  try {
    const stored = JSON.parse(await fs.readFile(resolveProfilePath(channelId), 'utf8')) as StoredMascotProfile;
    return stored?.profile?.identityPhrase ? stored : null;
  } catch {
    return null;
  }
}

const inFlight = new Map<string, Promise<MascotProfile | undefined>>();

/**
 * Profile for a channel with a mascot image (undefined without one). Generates and caches it when missing or stale;
 * when the LLM fails the fallback profile is returned (not cached, so the next video tries again).
 */
export function ensureChannelMascotProfile(
  channelId: string | undefined,
  log: (msg: string) => void,
): Promise<MascotProfile | undefined> {
  const id = channelId?.trim();
  if (!id) return Promise.resolve(undefined);
  const running = inFlight.get(id);
  if (running) return running;
  const task = buildChannelMascotProfile(id, log).finally(() => inFlight.delete(id));
  inFlight.set(id, task);
  return task;
}

async function buildChannelMascotProfile(channelId: string, log: (msg: string) => void): Promise<MascotProfile | undefined> {
  const mascotPath = await resolveChannelMascotImagePath(channelId);
  if (!mascotPath) return undefined;
  const sheetPath = await resolveChannelMascotSheetPath(channelId);
  const source = await fingerprint([mascotPath, sheetPath]);

  const stored = await readStored(channelId);
  if (stored?.source === source) {
    log('[mascot-profile] Using cached mascot profile');
    return stored.profile;
  }

  try {
    const prompt = await executePromptTemplate('all', MASCOT_PROFILE_PROMPT_KEY, [Boolean(sheetPath)]);
    const profile = await chatForJsonOnSubProfile({
      logTag: '[mascot-profile]',
      label: 'Mascot profile',
      prompt,
      attachments: sheetPath ? [mascotPath, sheetPath] : [mascotPath],
      timeoutMs: PROFILE_TIMEOUT_MS,
      parse: parseMascotProfile,
      log,
      errorCode: 'MASCOT_PROFILE_FAILED',
    });
    const record: StoredMascotProfile = { source, generatedAt: new Date().toISOString(), profile };
    await fs.writeFile(resolveProfilePath(channelId), `${JSON.stringify(record, null, 2)}\n`, 'utf8');
    log(`[mascot-profile] Saved → ${CHANNEL_MASCOT_PROFILE_FILENAME} (identity: "${profile.identityPhrase}")`);
    return profile;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log(`[mascot-profile] WARNING: could not build the mascot profile (${message}) — using the generic mascot rules`);
    return FALLBACK_MASCOT_PROFILE;
  }
}

/** Below this share of image scenes showing the mascot, the chunk is asked again. */
const MIN_MASCOT_SCENE_SHARE = 0.5;
/** The share check only runs on chunks with at least this many image scenes. */
const MIN_SCENES_FOR_SHARE_CHECK = 4;
/** Style words that pull the image away from the mascot's drawing style. */
const OFF_STYLE_RE = /\b(photo-?realistic|photorealism|hyper-?realistic|ultra-?realistic|realistic (?:man|woman|person|people|human)s?|8k|trending on artstation|cinematic photo|dslr)\b/i;

/** People words: in a mascot channel the mascot plays every person, so these need the mascot in the same prompt. */
const PERSON_RE = /\b(?:man|men|woman|women|person|people|boy|girl|child|children|kid|kids|grandfather|grandmother|grandpa|grandma|husband|wife|businessman|doctor|nurse|teenager)\b/i;

/** Reason a mascot-channel scene chunk should be regenerated, or null when it is usable. */
export function findMascotScenePromptIssue(scenes: Array<{ type?: string; prompt: string }>): string | null {
  const imageScenes = scenes.filter(scene => scene.type !== 'title');
  if (imageScenes.length === 0) return null;

  const offStyle = imageScenes.find(scene => OFF_STYLE_RE.test(scene.prompt));
  if (offStyle) {
    return `scene prompt uses off-style wording "${OFF_STYLE_RE.exec(offStyle.prompt)?.[0]}"`;
  }

  const personOnly = imageScenes.find(scene => PERSON_RE.test(scene.prompt) && !scenePromptShowsMascot(scene.prompt));
  if (personOnly) {
    return `scene shows a "${PERSON_RE.exec(personOnly.prompt)?.[0]}" but not the mascot`;
  }

  const withMascot = imageScenes.filter(scene => scenePromptShowsMascot(scene.prompt)).length;
  if (withMascot === 0 && imageScenes.length >= 2) {
    return `no scene shows the mascot (0/${imageScenes.length})`;
  }
  if (imageScenes.length >= MIN_SCENES_FOR_SHARE_CHECK && withMascot / imageScenes.length < MIN_MASCOT_SCENE_SHARE) {
    return `only ${withMascot}/${imageScenes.length} scenes show the mascot`;
  }
  return null;
}
