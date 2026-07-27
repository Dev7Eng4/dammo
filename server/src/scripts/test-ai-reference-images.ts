import fs from 'node:fs/promises';
import path from 'node:path';
import { ensureDataDirs, mediaDownloadDir } from '../config/paths.js';
import { promptsSettingsService } from '../modules/prompts/prompts-settings.service.js';
import {
  generateAiSceneSlideImages,
  generateCharacterReferenceImagesFromList,
  IMAGE_REFERENCES_DIRNAME,
  AI_SLIDES_DIRNAME,
  persistAiScenePromptsFile,
  type AiVideoScenePrompt,
} from '../modules/video-production/shared/ai-video/index.js';

const DEFAULT_VIDEO_ID = 'test-ai-reference';
const SCENE_DURATION_SEC = 5;

/**
 * Fixture mẫu (tách riêng):
 * - CHARACTERS_REFERENCES_FIXTURE → image-references/ (Meta single)
 * - SCENES_FIXTURE → images/ với references[] (Meta batch)
 * Sửa tại đây hoặc truyền --input path.json ({ characters, scenes })
 */
const CHARACTERS_REFERENCES_FIXTURE = [
  {
    id: 'char_001',
    name: 'Bà Aiko',
    prompt:
      'Create a highly detailed character reference sheet of a Japanese elderly woman, around 72 years old, kind face, short silver-gray hair, warm brown eyes, gentle smile, healthy appearance, light wrinkles, average build, wearing a simple beige cardigan over a white blouse and dark brown long skirt, comfortable indoor slippers, realistic anatomy, front view, clean neutral background, soft studio lighting, ultra realistic, highly detailed skin texture, natural colors, no text, no watermark, no logo, centered composition, full body.',
  },
  {
    id: 'char_002',
    name: 'Kenji',
    prompt:
      'Create a highly detailed character reference sheet of a Japanese man, around 42 years old, caring son, neat short black hair, clean-shaven, friendly face, wearing a light blue casual shirt, dark navy trousers, wristwatch, average athletic build, realistic anatomy, front view, neutral background, studio lighting, ultra realistic, highly detailed, no text, no watermark, centered full body character.',
  },
  {
    id: 'char_003',
    name: 'Yumi',
    prompt:
      'Create a highly detailed character reference sheet of a Japanese female nutritionist, around 34 years old, long dark hair tied back, professional appearance, wearing a white medical coat over light green clothing, holding a clipboard, warm smile, realistic anatomy, front view, neutral background, studio lighting, ultra realistic, full body, highly detailed, no text, no logo, no watermark.',
  },
];

const SCENES_FIXTURE = [
  {
    name: 'Gia đình dùng bữa sáng',
    references: ['char_001', 'char_002'],
    prompt:
      'A cozy Japanese dining room in the morning, elderly woman and her adult son sitting together enjoying a healthy traditional Japanese breakfast, warm sunlight entering through the window, realistic food, calm family atmosphere, cinematic composition, ultra realistic, highly detailed, no text.',
  },
  {
    name: 'Tư vấn dinh dưỡng',
    references: ['char_001', 'char_003'],
    prompt:
      'Inside a modern nutrition consultation room, the elderly woman discussing healthy eating with a female nutritionist, charts and healthy food samples on the table, friendly conversation, realistic environment, cinematic lighting, ultra realistic, no text.',
  },
  {
    name: 'Mua thực phẩm',
    references: ['char_001', 'char_002'],
    prompt:
      'Japanese supermarket fresh food section, the elderly woman and her son selecting healthy vegetables, fish, and dairy products, clean modern grocery store, realistic shopping baskets, warm lighting, ultra realistic, highly detailed, no text.',
  },
  {
    name: 'Chuẩn bị bữa tối',
    references: ['char_001'],
    prompt:
      'A Japanese home kitchen, elderly woman preparing a healthy dinner, cutting fresh vegetables beside grilled fish and miso soup ingredients, cozy atmosphere, realistic cooking details, cinematic lighting, ultra realistic, no text.',
  },
  {
    name: 'Kiểm tra sức khỏe',
    references: ['char_001', 'char_003'],
    prompt:
      "Modern Japanese clinic, nutritionist checking the elderly woman's health records and discussing healthy lifestyle improvements, bright clean medical office, professional atmosphere, realistic, ultra realistic, highly detailed, no text.",
  },
  {
    name: 'Đi dạo công viên',
    references: ['char_001', 'char_002'],
    prompt:
      'Beautiful Japanese park during golden hour, elderly mother walking with her adult son along a tree-lined pathway, relaxed smiles, autumn leaves, peaceful environment, cinematic composition, warm sunset lighting, ultra realistic, highly detailed, no text.',
  },
];

type Phase = 'all' | 'characters' | 'scenes';

interface FixtureCharacter {
  id: string;
  name: string;
  description?: string;
  prompt: string;
}

interface FixtureScene {
  name?: string;
  references?: string[];
  prompt: string;
  startTime?: string;
  endTime?: string;
}

interface FixtureInput {
  characters: FixtureCharacter[];
  scenes: FixtureScene[];
}

interface CliOptions {
  workDir: string;
  inputPath?: string;
  phase: Phase;
  videoId: string;
}

function formatSrtTimestamp(totalSec: number): string {
  const clamped = Math.max(0, Math.floor(totalSec));
  const hours = Math.floor(clamped / 3600);
  const minutes = Math.floor((clamped % 3600) / 60);
  const seconds = clamped % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')},000`;
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    workDir: mediaDownloadDir('youtube', DEFAULT_VIDEO_ID),
    phase: 'all',
    videoId: DEFAULT_VIDEO_ID,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--work-dir' || arg === '-d') {
      const value = argv[index + 1]?.trim() ?? '';
      if (!value) throw new Error('--work-dir requires a value');
      options.workDir = path.resolve(value);
      index += 1;
      continue;
    }

    if (arg === '--input' || arg === '-i') {
      const value = argv[index + 1]?.trim() ?? '';
      if (!value) throw new Error('--input requires a value');
      options.inputPath = path.resolve(value);
      index += 1;
      continue;
    }

    if (arg === '--phase') {
      const value = (argv[index + 1]?.trim() ?? '') as Phase;
      if (value !== 'all' && value !== 'characters' && value !== 'scenes') {
        throw new Error('--phase must be one of: all, characters, scenes');
      }
      options.phase = value;
      index += 1;
      continue;
    }

    if (arg === '--video-id') {
      const value = argv[index + 1]?.trim() ?? '';
      if (!value) throw new Error('--video-id requires a value');
      options.videoId = value;
      index += 1;
      continue;
    }

    if (arg.startsWith('-')) {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  return options;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeFixture(raw: unknown): FixtureInput {
  if (!isRecord(raw)) {
    throw new Error('Input JSON must be an object with characters and scenes');
  }

  if (!Array.isArray(raw.characters) || raw.characters.length === 0) {
    throw new Error('Input JSON must include a non-empty characters array');
  }

  if (!Array.isArray(raw.scenes) || raw.scenes.length === 0) {
    throw new Error('Input JSON must include a non-empty scenes array');
  }

  const characters: FixtureCharacter[] = raw.characters.map((item, index) => {
    if (!isRecord(item)) {
      throw new Error(`characters[${index}] must be an object`);
    }
    const id = typeof item.id === 'string' ? item.id.trim() : '';
    const name = typeof item.name === 'string' ? item.name.trim() : '';
    const prompt = typeof item.prompt === 'string' ? item.prompt.trim() : '';
    const description = typeof item.description === 'string' ? item.description.trim() : undefined;
    if (!id || !name || !prompt) {
      throw new Error(`characters[${index}] requires id, name, and prompt`);
    }
    return { id, name, prompt, ...(description ? { description } : {}) };
  });

  const scenes: FixtureScene[] = raw.scenes.map((item, index) => {
    if (!isRecord(item)) {
      throw new Error(`scenes[${index}] must be an object`);
    }
    const prompt = typeof item.prompt === 'string' ? item.prompt.trim() : '';
    if (!prompt) {
      throw new Error(`scenes[${index}] requires prompt`);
    }
    const name = typeof item.name === 'string' ? item.name.trim() : undefined;
    const startTime = typeof item.startTime === 'string' ? item.startTime : undefined;
    const endTime = typeof item.endTime === 'string' ? item.endTime : undefined;
    const references = Array.isArray(item.references)
      ? item.references.filter((ref): ref is string => typeof ref === 'string' && ref.trim().length > 0)
      : undefined;
    return {
      prompt,
      ...(name ? { name } : {}),
      ...(startTime ? { startTime } : {}),
      ...(endTime ? { endTime } : {}),
      ...(references?.length ? { references } : {}),
    };
  });

  return { characters, scenes };
}

function mapScenesToAiPrompts(scenes: FixtureScene[]): AiVideoScenePrompt[] {
  return scenes.map((scene, index) => {
    const startSec = index * SCENE_DURATION_SEC;
    const endSec = startSec + SCENE_DURATION_SEC;
    return {
      prompt: scene.prompt,
      startTime: scene.startTime ?? formatSrtTimestamp(startSec),
      endTime: scene.endTime ?? formatSrtTimestamp(endSec),
      ...(scene.references?.length ? { references: scene.references } : {}),
    };
  });
}

async function loadFixture(inputPath?: string): Promise<FixtureInput> {
  if (!inputPath) {
    return normalizeFixture({
      characters: CHARACTERS_REFERENCES_FIXTURE,
      scenes: SCENES_FIXTURE,
    });
  }
  const raw = JSON.parse(await fs.readFile(inputPath, 'utf8')) as unknown;
  return normalizeFixture(raw);
}

async function main() {
  ensureDataDirs();

  const options = parseArgs(process.argv.slice(2));
  const fixture = await loadFixture(options.inputPath);
  const imageProvider = promptsSettingsService.get().defaultImageProvider;

  await fs.mkdir(options.workDir, { recursive: true });

  console.log('Test AI reference images (no LLM)');
  console.log(`Work dir: ${options.workDir}`);
  console.log(`Video id: ${options.videoId}`);
  console.log(`Phase: ${options.phase}`);
  console.log(`Image provider: ${imageProvider}`);
  console.log(`Characters: ${fixture.characters.length} (metaConcurrency=single)`);
  console.log(`Scenes: ${fixture.scenes.length} (metaConcurrency=batch)`);
  if (options.inputPath) {
    console.log(`Input: ${options.inputPath}`);
  } else {
    console.log('Input: CHARACTERS_REFERENCES_FIXTURE + SCENES_FIXTURE');
  }

  if (imageProvider !== 'meta' && (options.phase === 'all' || options.phase === 'scenes')) {
    console.warn(
      '\n[warn] defaultImageProvider is not "meta". Scene generation will not attach local character reference images (Meta only).\n',
    );
  }

  if (options.phase === 'all' || options.phase === 'characters') {
    console.log(`\n=== Phase 1: character references → ${IMAGE_REFERENCES_DIRNAME}/ (metaConcurrency=single) ===\n`);
    const charResult = await generateCharacterReferenceImagesFromList({
      workDir: options.workDir,
      youtubeVideoId: options.videoId,
      characters: fixture.characters,
      metaConcurrency: 'single',
      onLog: msg => console.log(msg),
    });
    console.log(
      `Characters done → generated=${charResult.generatedCount} skipped=${charResult.skippedCount} failed=${charResult.failedCount}`,
    );
    console.log(`Manifest: ${charResult.filePath}`);
    for (const character of charResult.characters) {
      console.log(`  - ${character.id} (${character.name})${character.path ? ` → ${character.path}` : ' (no image)'}`);
    }
  }

  if (options.phase === 'all' || options.phase === 'scenes') {
    console.log(`\n=== Phase 2: scene images → ${AI_SLIDES_DIRNAME}/ (metaConcurrency=batch) ===\n`);
    const scenes = mapScenesToAiPrompts(fixture.scenes);

    for (let index = 0; index < fixture.scenes.length; index += 1) {
      const label = fixture.scenes[index].name ?? `scene-${String(index + 1).padStart(3, '0')}`;
      const refs = scenes[index].references?.join(', ') ?? '(none)';
      console.log(`  scene-${String(index + 1).padStart(3, '0')}: ${label} | refs=[${refs}]`);
    }

    const promptsPath = await persistAiScenePromptsFile(options.workDir, options.videoId, scenes);
    console.log(`Scene prompts saved → ${promptsPath}`);

    const sceneResult = await generateAiSceneSlideImages({
      workDir: options.workDir,
      youtubeVideoId: options.videoId,
      scenes,
      metaConcurrency: 'batch',
      onLog: msg => console.log(msg),
      onProgress: progress => {
        console.log(
          `[progress] ${progress.sceneName} (${progress.sceneIndex}/${progress.totalScenes}) → ${progress.status}`,
        );
      },
    });

    console.log(
      `Scenes done → generated=${sceneResult.generatedCount} skipped=${sceneResult.skippedCount} failed=${sceneResult.failedCount}`,
    );
    console.log(`Slides dir: ${sceneResult.slidesDir}`);
    for (const imagePath of sceneResult.imagePaths) {
      console.log(`  - ${path.basename(imagePath)}`);
    }
  }

  console.log('\nDone.');
}

main().catch(err => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
