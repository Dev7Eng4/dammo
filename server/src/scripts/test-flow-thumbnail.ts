import fs from 'node:fs/promises';
import path from 'node:path';
import { ensureDataDirs, mediaDownloadDir } from '../config/paths.js';
import { runDefaultFlowThumbnail } from '../modules/video-production/shared/thumbnail/default-flow-thumbnail.js';
import type { ChannelLanguage } from '../modules/youtube-channels/channel-language.js';

const DEFAULT_YOUTUBE_VIDEO_ID = 'iP92oFlVIEw';
const DEFAULT_LANGUAGE: ChannelLanguage = 'ja';
const OLD_THUMBNAIL_FILE = 'old-thumbnail.jpg';

interface CliOptions {
  workDir: string;
  referenceImagePaths: string[];
  language: ChannelLanguage;
  profileId?: string;
}

function parseArgs(argv: string[]): CliOptions {
  const defaultWorkDir = mediaDownloadDir('youtube', DEFAULT_YOUTUBE_VIDEO_ID);

  const options: CliOptions = {
    workDir: defaultWorkDir,
    referenceImagePaths: [path.join(defaultWorkDir, OLD_THUMBNAIL_FILE)],
    language: DEFAULT_LANGUAGE,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--work-dir' || arg === '-d') {
      const value = argv[index + 1]?.trim() ?? '';
      if (!value) throw new Error('--work-dir requires a value');
      options.workDir = path.resolve(value);
      options.referenceImagePaths = [path.join(options.workDir, OLD_THUMBNAIL_FILE)];
      index += 1;
      continue;
    }

    if (arg === '--reference-image' || arg === '-r') {
      const value = argv[index + 1]?.trim() ?? '';
      if (!value) throw new Error('--reference-image requires a value');
      options.referenceImagePaths = [path.resolve(value)];
      index += 1;
      continue;
    }

    if (arg === '--language' || arg === '-l') {
      const value = argv[index + 1]?.trim() ?? '';
      if (!value) throw new Error('--language requires a value');
      options.language = value as ChannelLanguage;
      index += 1;
      continue;
    }

    if (arg === '--profile-id') {
      const value = argv[index + 1]?.trim() ?? '';
      if (!value) throw new Error('--profile-id requires a value');
      options.profileId = value;
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

async function main() {
  ensureDataDirs();

  const options = parseArgs(process.argv.slice(2));

  await assertFileExists(options.workDir, 'work dir');
  for (const imagePath of options.referenceImagePaths) {
    await assertFileExists(imagePath, 'reference image (attach file)');
  }

  console.log('Test Flow thumbnail with attach file');
  console.log(`Work dir: ${options.workDir}`);
  console.log(`Reference images: ${options.referenceImagePaths.join(', ')}`);
  console.log(`Language: ${options.language}`);
  if (options.profileId) {
    console.log(`Flow profile id: ${options.profileId}`);
  }
  console.log('\nGenerating thumbnail via Flow (recreate)...\n');

  const result = await runDefaultFlowThumbnail(options.workDir, options.language, {
    referenceImagePaths: options.referenceImagePaths,
    profileId: options.profileId,
    onProgress: progress => {
      if (progress.status === 'retry') {
        console.log(`  Thumbnail on ${progress.profileName} retry (attempt ${progress.attempt})...`);
        return;
      }
      console.log(`  Thumbnail on ${progress.profileName} (attempt ${progress.attempt})...`);
    },
  });

  const flowDebugPath = path.join(options.workDir, 'flow-debug.png');
  await fs.unlink(flowDebugPath).catch(() => undefined);

  console.log('\nDone:');
  console.log(`  ${result.thumbnailPath}`);
}

main().catch(err => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
