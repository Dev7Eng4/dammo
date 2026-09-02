import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AI_SCENE_PROMPTS_FILENAME,
  assembleReupAiSlideshowVideo,
  type AiVideoScenePrompt,
  type AiVideoScenePromptsFile,
} from '../../modules/video-production/shared/ai-video/index.js';
import type { CaptionStyleKey } from '../../modules/video-production/shared/render-core/caption-styles.js';
import { OUTPUT_VIDEO_BASENAME } from '../../modules/video-production/shared/render-core/output-artifacts.constants.js';
import { formatElapsedMs } from '../../shared/timing/step-timer.js';

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));

const AUDIO_FILE = 'audio.mp3';
const SUBTITLE_FILE = 'transcript.srt';
const SCENES_DIRNAME = 'images';
const SMALL_VIDEO_FILE = 'Vẽ_tranh_video_1.mp4';

const DEFAULT_LANGUAGE = 'ja';
const DEFAULT_CAPTION_STYLE: CaptionStyleKey = 'bizudp_gothic_red_white';

export interface AiVideoTestProps {
  /** Overlay the local small-video PiP (top-left 100×130). Default: true. */
  showSmallVideo?: boolean;
  /** Max scenes to assemble (useful for quick smoke tests). Default: all with images. */
  maxScenes?: number;
}

function parseCliProps(argv: string[]): AiVideoTestProps {
  const props: AiVideoTestProps = { showSmallVideo: true };

  if (argv.includes('--no-small-video') || argv.includes('--no-stock') || argv.includes('--stock=false')) {
    props.showSmallVideo = false;
  }

  const limitArg = argv.find(arg => arg.startsWith('--limit='));
  if (limitArg) {
    const parsed = Number(limitArg.slice('--limit='.length));
    if (Number.isFinite(parsed) && parsed > 0) {
      props.maxScenes = Math.floor(parsed);
    }
  }

  return props;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function assertFileExists(filePath: string, label: string): Promise<void> {
  if (!(await fileExists(filePath))) {
    throw new Error(`Missing ${label}: ${filePath}`);
  }
}

function parseScenePromptsFile(raw: unknown): AiVideoScenePromptsFile {
  if (!raw || typeof raw !== 'object') {
    throw new Error(`Invalid ${AI_SCENE_PROMPTS_FILENAME}: expected object`);
  }

  const record = raw as Record<string, unknown>;
  if (!Array.isArray(record.scenes)) {
    throw new Error(`Invalid ${AI_SCENE_PROMPTS_FILENAME}: missing scenes array`);
  }

  const scenes = record.scenes as AiVideoScenePrompt[];
  return {
    youtubeVideoId: typeof record.youtubeVideoId === 'string' ? record.youtubeVideoId : 'test',
    generatedAt: typeof record.generatedAt === 'string' ? record.generatedAt : new Date().toISOString(),
    sceneCount: typeof record.sceneCount === 'number' ? record.sceneCount : scenes.length,
    scenes,
  };
}

function sceneImageBasename(scene: AiVideoScenePrompt, index: number): string {
  if (scene.path?.trim()) {
    return path.basename(scene.path);
  }
  return `scene-${String(index + 1).padStart(3, '0')}.jpg`;
}

/** Resolve scene image under `images/` (legacy `ai-slides/` paths in JSON are remapped). */
async function resolveSceneImageRelativePath(
  workDir: string,
  scene: AiVideoScenePrompt,
  index: number,
): Promise<string | null> {
  const basename = sceneImageBasename(scene, index);
  const candidates = [
    path.join(SCENES_DIRNAME, basename),
    scene.path?.trim() ?? '',
    path.join('ai-slides', basename),
  ].filter(Boolean);

  for (const relativePath of candidates) {
    if (await fileExists(path.join(workDir, relativePath))) {
      return relativePath.replace(/\\/g, '/');
    }
  }

  return null;
}

async function loadScenes(workDir: string, maxScenes?: number): Promise<AiVideoScenePrompt[]> {
  const promptsPath = path.join(workDir, AI_SCENE_PROMPTS_FILENAME);
  await assertFileExists(promptsPath, 'scene prompts');

  const raw = JSON.parse(await fs.readFile(promptsPath, 'utf8')) as unknown;
  const file = parseScenePromptsFile(raw);
  const loaded: AiVideoScenePrompt[] = [];

  for (let index = 0; index < file.scenes.length; index += 1) {
    const scene = file.scenes[index]!;
    const imagePath = await resolveSceneImageRelativePath(workDir, scene, index);
    if (!imagePath) continue;

    loaded.push({
      ...scene,
      path: imagePath,
    });

    if (maxScenes !== undefined && loaded.length >= maxScenes) break;
  }

  if (loaded.length === 0) {
    throw new Error(
      `No scenes with images found under ${path.join(workDir, SCENES_DIRNAME)} (check ${promptsPath})`,
    );
  }

  return loaded;
}

export async function runAiVideoTest(props: AiVideoTestProps = {}): Promise<string> {
  const showSmallVideo = props.showSmallVideo !== false;
  const workDir = TEST_DIR;
  const audioPath = path.join(workDir, AUDIO_FILE);
  const subtitlePath = path.join(workDir, SUBTITLE_FILE);
  const smallVideoPath = path.join(workDir, SMALL_VIDEO_FILE);
  const scenesDir = path.join(workDir, SCENES_DIRNAME);
  const outputPath = path.join(workDir, `${OUTPUT_VIDEO_BASENAME}.mp4`);

  await assertFileExists(audioPath, 'audio');
  await assertFileExists(subtitlePath, 'subtitle');
  await assertFileExists(scenesDir, 'scenes directory');
  if (showSmallVideo) {
    await assertFileExists(smallVideoPath, 'small video PiP');
  }

  const loadStartedAt = performance.now();
  const scenes = await loadScenes(workDir, props.maxScenes);
  console.log(`Loaded ${scenes.length} scene(s) (${formatElapsedMs(performance.now() - loadStartedAt)})`);

  console.log('AI video test assemble');
  console.log(`Work dir: ${workDir}`);
  console.log(`Audio: ${audioPath}`);
  console.log(`Subtitle: ${subtitlePath}`);
  console.log(`Scene images: ${scenesDir}`);
  console.log(`Scenes: ${scenes.length}${props.maxScenes ? ` (limit ${props.maxScenes})` : ''}`);
  console.log(`Language: ${DEFAULT_LANGUAGE}`);
  console.log(`Caption style: ${DEFAULT_CAPTION_STYLE}`);
  console.log(`Small video PiP: ${showSmallVideo ? smallVideoPath : 'off'}`);
  console.log(`Output: ${outputPath}`);
  console.log('\nAssembling AI slideshow...\n');

  const assembleStartedAt = performance.now();
  const resultPath = await assembleReupAiSlideshowVideo({
    workDir,
    scenes,
    audioPath,
    subtitlePath,
    language: DEFAULT_LANGUAGE,
    captionStyleKey: DEFAULT_CAPTION_STYLE,
    showDisclaim: true,
    ...(showSmallVideo
      ? {
          showSmallVideo: true,
          smallVideoPath,
        }
      : {}),
    onLog: msg => console.log(msg),
  });
  const assembleElapsed = formatElapsedMs(performance.now() - assembleStartedAt);

  console.log(`\nDone → ${resultPath} (assemble ${assembleElapsed})`);
  return resultPath;
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  runAiVideoTest(parseCliProps(process.argv.slice(2))).catch(err => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
