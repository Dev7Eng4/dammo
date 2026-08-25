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
const STOCK_FILE = 'stock.mp4';

const DEFAULT_LANGUAGE = 'ja';
const DEFAULT_CAPTION_STYLE: CaptionStyleKey = 'bizudp_gothic_red_white';

export interface AiVideoTestProps {
  /** Overlay `stock.mp4` as the AI small-video PiP (top-left 100×130). Default: true. */
  stock?: boolean;
}

function parseCliProps(argv: string[]): AiVideoTestProps {
  if (argv.includes('--no-stock') || argv.includes('--stock=false')) {
    return { stock: false };
  }
  return { stock: true };
}

async function assertFileExists(filePath: string, label: string): Promise<void> {
  try {
    await fs.access(filePath);
  } catch {
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

async function loadScenes(workDir: string): Promise<AiVideoScenePrompt[]> {
  const promptsPath = path.join(workDir, AI_SCENE_PROMPTS_FILENAME);
  await assertFileExists(promptsPath, 'scene prompts');

  const raw = JSON.parse(await fs.readFile(promptsPath, 'utf8')) as unknown;
  const file = parseScenePromptsFile(raw);
  const scenes = file.scenes.filter(scene => Boolean(scene.path?.trim()));

  if (scenes.length === 0) {
    throw new Error(`No scenes with image path found in ${promptsPath}`);
  }

  for (const scene of scenes) {
    const imagePath = path.isAbsolute(scene.path!) ? scene.path! : path.join(workDir, scene.path!);
    await assertFileExists(imagePath, `scene image (${scene.path})`);
  }

  return scenes;
}

export async function runAiVideoTest(props: AiVideoTestProps = {}): Promise<string> {
  const useStock = props.stock !== false;
  const workDir = TEST_DIR;
  const audioPath = path.join(workDir, AUDIO_FILE);
  const subtitlePath = path.join(workDir, SUBTITLE_FILE);
  const stockPath = path.join(workDir, STOCK_FILE);
  const outputPath = path.join(workDir, `${OUTPUT_VIDEO_BASENAME}.mp4`);

  await assertFileExists(audioPath, 'audio');
  await assertFileExists(subtitlePath, 'subtitle');
  if (useStock) {
    await assertFileExists(stockPath, 'stock video');
  }

  const loadStartedAt = performance.now();
  const scenes = await loadScenes(workDir);
  console.log(`Loaded scenes (${formatElapsedMs(performance.now() - loadStartedAt)})`);

  console.log('AI video test assemble');
  console.log(`Work dir: ${workDir}`);
  console.log(`Audio: ${audioPath}`);
  console.log(`Subtitle: ${subtitlePath}`);
  console.log(`Scenes: ${scenes.length}`);
  console.log(`Language: ${DEFAULT_LANGUAGE}`);
  console.log(`Caption style: ${DEFAULT_CAPTION_STYLE}`);
  console.log(`Stock PiP: ${useStock ? stockPath : 'off'}`);
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
    ...(useStock
      ? {
          showSmallVideo: true,
          smallVideoPath: stockPath,
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
