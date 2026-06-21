import fs from 'node:fs/promises';
import path from 'node:path';
import { ensureDataDirs, youtubeChannelVideoDir } from '../config/paths.js';
import { runThumbnailVisualGeneration } from '../modules/youtube-channels/reup-hero-image.js';
import type { MetaStep3Output, MetaStep3PersistedOutput } from '../modules/youtube-channels/reup-metadata.types.js';
import { renderThumbnailHorizontalFlowCompositeToPath } from '../modules/youtube-channels/reup-thumbnail-composite.js';
import { runThumbnailHorizontal } from '../modules/youtube-channels/reup-thumbnail-horizontal.js';

const DEFAULT_CHANNEL_ID = '85184f4f-6c28-4c3e-a6a4-985689b51840';
const DEFAULT_YOUTUBE_VIDEO_ID = '9paQm2UbaLc';

const VIDEO_META_FILE = 'video-meta.json';
const THUMBNAIL_FILE = 'thumbnail.jpg';
const THUMBNAIL_VISUAL_FILE = 'thumbnail_visual.jpg';
const THUMBNAIL_PLAN_FILE = 'thumbnail-horizontal-plan.json';

interface CliOptions {
  channelId: string;
  videoId: string;
  workDir?: string;
  profileId?: string;
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    channelId: DEFAULT_CHANNEL_ID,
    videoId: DEFAULT_YOUTUBE_VIDEO_ID,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--channel-id' || arg === '-c') {
      options.channelId = argv[index + 1]?.trim() ?? '';
      if (!options.channelId) throw new Error('--channel-id requires a value');
      index += 1;
      continue;
    }

    if (arg === '--video-id' || arg === '-v') {
      options.videoId = argv[index + 1]?.trim() ?? '';
      if (!options.videoId) throw new Error('--video-id requires a value');
      index += 1;
      continue;
    }

    if (arg === '--work-dir' || arg === '-d') {
      options.workDir = path.resolve(argv[index + 1] ?? '');
      if (!argv[index + 1]) throw new Error('--work-dir requires a value');
      index += 1;
      continue;
    }

    if (arg === '--profile-id') {
      options.profileId = argv[index + 1]?.trim() ?? '';
      if (!options.profileId) throw new Error('--profile-id requires a value');
      index += 1;
      continue;
    }

    if (arg.startsWith('-')) {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  return options;
}

async function assertFileExists(filePath: string, label: string): Promise<void> {
  try {
    await fs.access(filePath);
  } catch {
    throw new Error(`Missing ${label}: ${filePath}`);
  }
}

async function loadMetaStep3FromVideoMeta(workDir: string): Promise<MetaStep3Output> {
  const videoMetaPath = path.join(workDir, VIDEO_META_FILE);
  const raw = JSON.parse(await fs.readFile(videoMetaPath, 'utf8')) as MetaStep3PersistedOutput;

  if (!raw.result || typeof raw.result !== 'object') {
    throw new Error(`Invalid ${VIDEO_META_FILE}: missing result field`);
  }

  return raw.result;
}

async function main() {
  ensureDataDirs();

  const options = parseArgs(process.argv.slice(2));
  const workDir = options.workDir ?? youtubeChannelVideoDir(options.channelId, options.videoId);
  const videoMetaPath = path.join(workDir, VIDEO_META_FILE);

  await assertFileExists(videoMetaPath, 'video meta');

  console.log(`Channel: ${options.channelId}`);
  console.log(`YouTube video id: ${options.videoId}`);
  console.log(`Work dir: ${workDir}`);
  console.log(`Video meta: ${videoMetaPath}`);
  if (options.profileId) {
    console.log(`Flow profile id: ${options.profileId}`);
  }

  const metaStep3Output = await loadMetaStep3FromVideoMeta(workDir);

  console.log('\nStep 1/3: Horizontal thumbnail LLM (3 prompts)...\n');

  const thumbnailHorizontalOutput = await runThumbnailHorizontal(metaStep3Output, {
    onProgress: progress => {
      const stepLabel = `step ${progress.step}/3`;
      if (progress.status === 'retry') {
        console.log(`  Thumbnail ${stepLabel} on ${progress.profileName} retry (attempt ${progress.attempt})...`);
        return;
      }
      console.log(`  Thumbnail ${stepLabel} on ${progress.profileName} (attempt ${progress.attempt})...`);
    },
  });

  const planPath = path.join(workDir, THUMBNAIL_PLAN_FILE);
  await fs.writeFile(planPath, `${JSON.stringify(thumbnailHorizontalOutput.plan, null, 2)}\n`, 'utf8');
  console.log(`\nPlan saved → ${planPath}`);

  console.log('\nStep 2/3: Generating thumbnail visual with Google Flow...\n');

  const thumbnailVisualResult = await runThumbnailVisualGeneration(
    workDir,
    {
      visualPrompt: thumbnailHorizontalOutput.plan.visualPrompt,
      negativePrompt: thumbnailHorizontalOutput.plan.negativePrompt,
    },
    {
      profileId: options.profileId,
      onProgress: progress => {
        if (progress.status === 'retry') {
          console.log(`  Thumbnail visual on ${progress.profileName} retry (attempt ${progress.attempt})...`);
          return;
        }
        console.log(`  Thumbnail visual on ${progress.profileName} (attempt ${progress.attempt})...`);
      },
    },
  );

  const flowDebugPath = path.join(workDir, 'flow-debug.png');
  await fs.unlink(flowDebugPath).catch(() => undefined);

  console.log(`\nThumbnail visual saved → ${thumbnailVisualResult.thumbnailVisualPath}`);

  console.log('\nStep 3/3: Compositing horizontal thumbnail (canvas)...\n');

  const thumbnailPath = path.join(workDir, THUMBNAIL_FILE);
  const compositePath = await renderThumbnailHorizontalFlowCompositeToPath({
    backgroundImagePath: thumbnailVisualResult.thumbnailVisualPath,
    flowLayout: {
      thumbnail_copy: thumbnailHorizontalOutput.plan.thumbnailCopy,
      color_strategy: thumbnailHorizontalOutput.plan.colorStrategy,
    },
    outPath: thumbnailPath,
  });

  console.log(`\nDone:`);
  console.log(`  ${path.join(workDir, THUMBNAIL_VISUAL_FILE)}`);
  console.log(`  ${compositePath}`);
}

main().catch(err => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
