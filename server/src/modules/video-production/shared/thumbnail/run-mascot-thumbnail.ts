import fs from 'node:fs/promises';
import path from 'node:path';
import { AppError } from '../../../../shared/http/errors.js';
import { executePromptTemplate } from '../../../prompts/prompts.file-store.js';
import { emitDetailLog } from '../video-log.js';
import { chatForJsonOnSubProfile, type SubProfileJsonChatOptions } from '../sub-profile-json-chat.js';
import { runBrowserImageGeneration, resolveThumbnailImageProvider } from './hero-image.js';
import {
  MASCOT_THUMBNAIL_DIRECTOR_PROMPT_KEY,
  MASCOT_THUMBNAIL_DRAW_ROUNDS,
  MASCOT_THUMBNAIL_JUDGE_PROMPT_KEY,
  THUMBNAIL_CANDIDATES_DIRNAME,
  THUMBNAIL_CANDIDATES_FILENAME,
} from './mascot-thumbnail.constants.js';
import { removeGeminiWatermarkIfEnabled } from './remove-gemini-watermark.js';

const THUMBNAIL_FILENAME = 'thumbnail.jpg';
const DIRECTOR_TIMEOUT_MS = 240_000;
/** The judge also uploads every image before answering. */
const JUDGE_TIMEOUT_MS = 300_000;

const LANGUAGE_LABELS: Record<string, string> = {
  ja: 'Japanese (日本語)',
  ko: 'Korean (한국어)',
  en: 'English',
  es: 'Spanish (Español)',
};

/** Judge criteria weights (sum 1); text correctness is a gate, not a weight. */
const JUDGE_WEIGHTS = { mascotMatch: 0.3, readability: 0.3, curiosity: 0.25, titleFit: 0.15 } as const;

/** One thumbnail idea from the Thumbnail Director. */
export interface MascotThumbnailConcept {
  angle: string;
  hookLines: string[];
  emphasis: string;
  mascotPose: string;
  composition: string;
  prompt: string;
}

/** Thumbnail Judge verdict for one drawn candidate (sub-scores 0-10). */
export interface MascotThumbnailJudgement {
  textCorrect: boolean;
  textIssues: string;
  mascotMatch: number;
  readability: number;
  curiosity: number;
  titleFit: number;
  /** Weighted total 0-10 computed here (the LLM's own ranking is not trusted). */
  score: number;
  reason: string;
}

export interface MascotThumbnailCandidate extends MascotThumbnailConcept {
  /** File name inside `thumbnail-candidates/`; unset when the image failed. */
  file?: string;
  error?: string;
  judgement?: MascotThumbnailJudgement;
}

export interface MascotThumbnailCandidatesFile {
  generatedAt: string;
  /** Candidate file currently copied to thumbnail.jpg. */
  selectedFile: string | null;
  /** Candidate the pipeline picked (judge winner, or the first drawn when judging failed). */
  aiPickedFile?: string | null;
  /** Set when the judge could not score the candidates. */
  judgeError?: string;
  candidates: MascotThumbnailCandidate[];
}

export interface RunMascotThumbnailInput {
  workDir: string;
  language: string;
  title: string;
  /** Description / summary lines the Director reads to find the hook. */
  context: string;
  count: number;
  mascotImagePath: string;
  onLog?: (msg: string) => void;
}

export interface RunMascotThumbnailResult {
  thumbnailPath: string;
  candidatesFile: MascotThumbnailCandidatesFile;
}

function asText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function asScore(value: unknown): number {
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.min(10, Math.max(0, num));
}

function parseJsonList(jsonText: string, key: string): unknown[] {
  let raw: unknown;
  try {
    raw = JSON.parse(jsonText);
  } catch {
    throw new Error('response is not valid JSON');
  }
  if (Array.isArray(raw)) return raw;
  const list = raw && typeof raw === 'object' ? (raw as Record<string, unknown>)[key] : undefined;
  if (!Array.isArray(list)) throw new Error(`missing "${key}" array`);
  return list;
}

function isRecord(item: unknown): item is Record<string, unknown> {
  return Boolean(item) && typeof item === 'object';
}

/** Parse the Director JSON; throws with a short reason when it is unusable. */
export function parseMascotThumbnailConcepts(jsonText: string, count: number): MascotThumbnailConcept[] {
  const concepts = parseJsonList(jsonText, 'candidates')
    .filter(isRecord)
    .map(item => ({
      angle: asText(item.angle),
      hookLines: Array.isArray(item.hook_lines) ? item.hook_lines.map(asText).filter(Boolean) : [],
      emphasis: asText(item.emphasis),
      mascotPose: asText(item.mascot_pose),
      composition: asText(item.composition),
      prompt: asText(item.prompt),
    }))
    .filter(concept => concept.prompt.length > 0);

  if (concepts.length === 0) throw new Error('no candidate has a prompt');
  return concepts.slice(0, count);
}

export function scoreMascotThumbnailJudgement(
  judgement: Pick<MascotThumbnailJudgement, 'mascotMatch' | 'readability' | 'curiosity' | 'titleFit'>,
): number {
  const total =
    judgement.mascotMatch * JUDGE_WEIGHTS.mascotMatch +
    judgement.readability * JUDGE_WEIGHTS.readability +
    judgement.curiosity * JUDGE_WEIGHTS.curiosity +
    judgement.titleFit * JUDGE_WEIGHTS.titleFit;
  return Math.round(total * 10) / 10;
}

/**
 * Parse the Judge JSON into verdicts keyed by 1-based candidate number (as shown to the judge).
 * Throws unless every one of the `count` candidates got a verdict.
 */
export function parseMascotThumbnailJudgements(
  jsonText: string,
  count: number,
): Map<number, MascotThumbnailJudgement> {
  const verdicts = new Map<number, MascotThumbnailJudgement>();
  for (const item of parseJsonList(jsonText, 'results').filter(isRecord)) {
    const candidate = Number(item.candidate);
    if (!Number.isInteger(candidate) || candidate < 1 || candidate > count) continue;
    const scores = {
      mascotMatch: asScore(item.mascot_match),
      readability: asScore(item.readability),
      curiosity: asScore(item.curiosity),
      titleFit: asScore(item.title_fit),
    };
    verdicts.set(candidate, {
      textCorrect: item.text_correct === true,
      textIssues: asText(item.text_issues),
      ...scores,
      score: scoreMascotThumbnailJudgement(scores),
      reason: asText(item.reason),
    });
  }
  if (verdicts.size !== count) {
    throw new Error(`judge scored ${verdicts.size} of ${count} candidate(s)`);
  }
  return verdicts;
}

/**
 * Best drawn candidate: correct text first, then the highest score.
 * Without any judgement the first drawn candidate wins.
 */
export function pickBestMascotThumbnailCandidate(
  candidates: MascotThumbnailCandidate[],
): MascotThumbnailCandidate | undefined {
  const drawn = candidates.filter(candidate => candidate.file);
  const rank = (candidate: MascotThumbnailCandidate) =>
    candidate.judgement ? (candidate.judgement.textCorrect ? 100 : 0) + candidate.judgement.score : -1;
  return drawn.reduce<MascotThumbnailCandidate | undefined>(
    (best, candidate) => (!best || rank(candidate) > rank(best) ? candidate : best),
    undefined,
  );
}

export function resolveThumbnailCandidatesDir(workDir: string): string {
  return path.join(workDir, THUMBNAIL_CANDIDATES_DIRNAME);
}

export async function readMascotThumbnailCandidatesFile(
  workDir: string,
): Promise<MascotThumbnailCandidatesFile | null> {
  try {
    const raw = await fs.readFile(
      path.join(resolveThumbnailCandidatesDir(workDir), THUMBNAIL_CANDIDATES_FILENAME),
      'utf8',
    );
    const parsed = JSON.parse(raw) as MascotThumbnailCandidatesFile;
    return Array.isArray(parsed?.candidates) ? parsed : null;
  } catch {
    return null;
  }
}

export async function writeMascotThumbnailCandidatesFile(
  workDir: string,
  file: MascotThumbnailCandidatesFile,
): Promise<void> {
  const dir = resolveThumbnailCandidatesDir(workDir);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, THUMBNAIL_CANDIDATES_FILENAME), JSON.stringify(file, null, 2), 'utf8');
}

/** Director and Judge chats share one retry loop and error code. */
function chatForJson<T>(options: Omit<SubProfileJsonChatOptions<T>, 'logTag' | 'errorCode'>): Promise<T> {
  return chatForJsonOnSubProfile({ ...options, logTag: '[mascot-thumbnail]', errorCode: 'MASCOT_THUMBNAIL_LLM_FAILED' });
}

async function askDirector(input: RunMascotThumbnailInput, log: (msg: string) => void): Promise<MascotThumbnailConcept[]> {
  const prompt = await executePromptTemplate('all', MASCOT_THUMBNAIL_DIRECTOR_PROMPT_KEY, [
    LANGUAGE_LABELS[input.language] ?? input.language,
    input.title,
    input.context,
    input.count,
  ]);
  return chatForJson({
    label: `Thumbnail Director (${input.count} concept(s))`,
    prompt,
    timeoutMs: DIRECTOR_TIMEOUT_MS,
    parse: jsonText => parseMascotThumbnailConcepts(jsonText, input.count),
    log,
  });
}

/** Score the drawn candidates in place (mascot reference first, then candidates in order). */
async function judgeCandidates(
  input: RunMascotThumbnailInput,
  candidates: MascotThumbnailCandidate[],
  log: (msg: string) => void,
): Promise<void> {
  const candidatesDir = resolveThumbnailCandidatesDir(input.workDir);
  const drawn = candidates.filter(candidate => candidate.file);
  const prompt = await executePromptTemplate('all', MASCOT_THUMBNAIL_JUDGE_PROMPT_KEY, [
    LANGUAGE_LABELS[input.language] ?? input.language,
    input.title,
    JSON.stringify(
      drawn.map((candidate, index) => ({
        candidate: index + 1,
        hook_lines: candidate.hookLines,
        emphasis: candidate.emphasis,
      })),
      null,
      2,
    ),
  ]);

  const verdicts = await chatForJson({
    label: `Thumbnail Judge (${drawn.length} candidate(s))`,
    prompt,
    attachments: [input.mascotImagePath, ...drawn.map(candidate => path.join(candidatesDir, candidate.file!))],
    timeoutMs: JUDGE_TIMEOUT_MS,
    parse: jsonText => parseMascotThumbnailJudgements(jsonText, drawn.length),
    log,
  });

  drawn.forEach((candidate, index) => {
    const judgement = verdicts.get(index + 1)!;
    candidate.judgement = judgement;
    log(
      `[mascot-thumbnail] ${candidate.file}: score ${judgement.score}` +
        (judgement.textCorrect ? '' : ` — text wrong: ${judgement.textIssues || 'yes'}`) +
        (judgement.reason ? ` — ${judgement.reason}` : ''),
    );
  });
}

/**
 * Draw every concept as `candidate-N.jpg`. On a redraw (`previous` set) the files are overwritten
 * and a concept that fails again keeps its previous image.
 */
async function drawCandidates(
  input: RunMascotThumbnailInput,
  concepts: MascotThumbnailConcept[],
  log: (msg: string) => void,
  previous?: MascotThumbnailCandidate[],
): Promise<MascotThumbnailCandidate[]> {
  const candidatesDir = resolveThumbnailCandidatesDir(input.workDir);
  if (!previous) await fs.rm(candidatesDir, { recursive: true, force: true });
  await fs.mkdir(candidatesDir, { recursive: true });

  log(
    `[mascot-thumbnail] Drawing ${concepts.length} candidate(s) via ${resolveThumbnailImageProvider()} with the mascot reference...`,
  );
  const candidates: MascotThumbnailCandidate[] = [];
  for (const [index, concept] of concepts.entries()) {
    const fileName = `candidate-${index + 1}.jpg`;
    try {
      await runBrowserImageGeneration(concept.prompt, candidatesDir, {
        fileName,
        referenceImagePaths: [input.mascotImagePath],
      });
      candidates.push({ ...concept, file: fileName });
      log(`[mascot-thumbnail] candidate ${index + 1}/${concepts.length} (${concept.angle || 'concept'}) saved`);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      const kept = previous?.[index];
      candidates.push(kept?.file ? kept : { ...concept, error: reason });
      log(
        `[mascot-thumbnail] candidate ${index + 1}/${concepts.length} failed: ${reason}` +
          (kept?.file ? ' (keeping the previous image)' : ''),
      );
    }
  }
  return candidates;
}

/**
 * Mascot thumbnail: the Director (LLM) designs N different thumbnails, each is drawn with the channel
 * mascot as reference into `thumbnail-candidates/`, the Judge (LLM with images) scores them, and the
 * best one becomes thumbnail.jpg. When no candidate has correct text, everything is drawn once more.
 * Another candidate can be picked later from the video popup.
 */
export async function runMascotThumbnail(input: RunMascotThumbnailInput): Promise<RunMascotThumbnailResult> {
  const log = (msg: string) => emitDetailLog(msg, input.onLog);
  const concepts = await askDirector(input, log);

  let candidates: MascotThumbnailCandidate[] = [];
  let judgeError: string | undefined;
  for (let round = 1; round <= MASCOT_THUMBNAIL_DRAW_ROUNDS; round += 1) {
    if (round > 1) log(`[mascot-thumbnail] No candidate has correct text → drawing again (round ${round})`);
    candidates = await drawCandidates(input, concepts, log, round > 1 ? candidates : undefined);
    if (!candidates.some(candidate => candidate.file)) break;

    try {
      await judgeCandidates(input, candidates, log);
      judgeError = undefined;
    } catch (err) {
      // Without scores there is nothing to compare: keep this round and fall back to the first drawn.
      judgeError = err instanceof Error ? err.message : String(err);
      log(`[mascot-thumbnail] Judge failed, using the first drawn candidate: ${judgeError}`);
      break;
    }
    if (candidates.some(candidate => candidate.judgement?.textCorrect)) break;
  }

  const picked = pickBestMascotThumbnailCandidate(candidates);
  const generatedAt = new Date().toISOString();
  if (!picked?.file) {
    await writeMascotThumbnailCandidatesFile(input.workDir, {
      generatedAt,
      selectedFile: null,
      aiPickedFile: null,
      candidates,
    });
    throw new AppError('No mascot thumbnail candidate could be drawn', 502, 'MASCOT_THUMBNAIL_EMPTY');
  }

  log(
    `[mascot-thumbnail] Picked ${picked.file}` +
      (picked.judgement ? ` (score ${picked.judgement.score}${picked.judgement.textCorrect ? '' : ', text not verified'})` : ''),
  );
  const thumbnailPath = path.join(input.workDir, THUMBNAIL_FILENAME);
  await fs.copyFile(path.join(resolveThumbnailCandidatesDir(input.workDir), picked.file), thumbnailPath);
  await removeGeminiWatermarkIfEnabled(thumbnailPath);

  const candidatesFile: MascotThumbnailCandidatesFile = {
    generatedAt,
    selectedFile: picked.file,
    aiPickedFile: picked.file,
    ...(judgeError ? { judgeError } : {}),
    candidates,
  };
  await writeMascotThumbnailCandidatesFile(input.workDir, candidatesFile);
  return { thumbnailPath, candidatesFile };
}
