import fs from 'node:fs/promises';
import path from 'node:path';
import { ensureDataDirs, youtubeChannelVideoDir } from '../config/paths.js';
import { hasLegacyVisualMeta, parseVideoMetaContent, type MetaStep3Output } from '../modules/video-production/shared/meta/metadata.types.js';
import { runDirectFlowThumbnail } from '../modules/video-production/shared/thumbnail/direct-flow-thumbnail.js';
import { resolveThumbnailStyleKey } from '../modules/prompts/thumbnail-styles.js';
import { youtubeChannelsRepository } from '../modules/youtube-channels/youtube-channels.repository.js';
import type { ChannelLanguage } from '../modules/youtube-channels/channel-language.js';

const DEFAULT_CHANNEL_ID = '85184f4f-6c28-4c3e-a6a4-985689b51840';
const DEFAULT_YOUTUBE_VIDEO_ID = '9paQm2UbaLc';

const VIDEO_META_FILE = 'video-meta.json';

interface CliOptions {
  channelId: string;
  videoId: string;
  workDir?: string;
  profileId?: string;
  styleKey?: string;
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

    if (arg === '--style-key') {
      options.styleKey = argv[index + 1]?.trim() ?? '';
      if (!options.styleKey) throw new Error('--style-key requires a value');
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
  const raw = JSON.parse(await fs.readFile(videoMetaPath, 'utf8')) as unknown;
  const meta = parseVideoMetaContent(raw);
  if (!hasLegacyVisualMeta(meta)) {
    throw new Error('video-meta.json uses new metadata format without hero_image_prompt — thumbnail script not supported yet');
  }
  return meta;
}

function resolveStyleKey(options: CliOptions) {
  const channel = youtubeChannelsRepository.findById(options.channelId);
  if (!channel) {
    throw new Error(`Channel not found: ${options.channelId}`);
  }

  const styleKey = resolveThumbnailStyleKey(options.styleKey ?? channel.thumbnailStyleKey, channel.language);
  if (!styleKey) {
    throw new Error(`No thumbnail style configured for channel ${options.channelId}`);
  }

  return { channel, styleKey };
}

async function runDirectFlowThumbnailScript(
  metaStep3Output: MetaStep3Output,
  workDir: string,
  language: ChannelLanguage,
  styleKey: string,
  profileId?: string,
): Promise<void> {
  console.log(`\nGenerating thumbnail via Flow (${styleKey})...\n`);

  const result = await runDirectFlowThumbnail(metaStep3Output, language, styleKey, workDir, {
    profileId,
    onProgress: progress => {
      if (progress.status === 'retry') {
        console.log(`  Thumbnail on ${progress.profileName} retry (attempt ${progress.attempt})...`);
        return;
      }
      console.log(`  Thumbnail on ${progress.profileName} (attempt ${progress.attempt})...`);
    },
  });

  const flowDebugPath = path.join(workDir, 'flow-debug.png');
  await fs.unlink(flowDebugPath).catch(() => undefined);

  console.log(`\nDone:`);
  console.log(`  ${result.thumbnailPath}`);
}

async function main() {
  ensureDataDirs();

  const options = parseArgs(process.argv.slice(2));
  const workDir = options.workDir ?? youtubeChannelVideoDir(options.channelId, options.videoId);
  const videoMetaPath = path.join(workDir, VIDEO_META_FILE);

  await assertFileExists(videoMetaPath, 'video meta');

  const { channel, styleKey } = resolveStyleKey(options);

  console.log(`Channel: ${options.channelId}`);
  console.log(`YouTube video id: ${options.videoId}`);
  console.log(`Work dir: ${workDir}`);
  console.log(`Video meta: ${videoMetaPath}`);
  console.log(`Thumbnail style: ${styleKey}`);
  if (options.profileId) {
    console.log(`Flow profile id: ${options.profileId}`);
  }

  const metaStep3Output = await loadMetaStep3FromVideoMeta(workDir);

  await runDirectFlowThumbnailScript(
    metaStep3Output,
    workDir,
    channel.language,
    styleKey,
    options.profileId,
  );
}

main().catch(err => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
