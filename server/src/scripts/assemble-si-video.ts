import fs from 'node:fs/promises';
import path from 'node:path';
import { ensureDataDirs, youtubeChannelVideoDir } from '../config/paths.js';
import { assembleReupSiVideo } from '../modules/youtube-channels/reup-si-video-assembler.js';

const DEFAULT_CHANNEL_ID = '85184f4f-6c28-4c3e-a6a4-985689b51840';
const DEFAULT_YOUTUBE_VIDEO_ID = '9paQm2UbaLc';
const DEFAULT_BACKGROUND_FOOTAGE_SOURCE_ID = 'ebd3f9fb-e859-4d13-b79e-de88edf697e9';
const DEFAULT_LANGUAGE = 'ja';

const AUDIO_FILE = 'audio.mp3';
const SUBTITLE_FILE = 'transcript.srt';
const CENTER_IMAGE_FILE = 'background.jpg';

interface CliOptions {
  channelId: string;
  videoId: string;
  workDir?: string;
  backgroundFootageSourceId: string;
  language: string;
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    channelId: DEFAULT_CHANNEL_ID,
    videoId: DEFAULT_YOUTUBE_VIDEO_ID,
    backgroundFootageSourceId: DEFAULT_BACKGROUND_FOOTAGE_SOURCE_ID,
    language: DEFAULT_LANGUAGE,
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

    if (arg === '--background-footage-source-id') {
      options.backgroundFootageSourceId = argv[index + 1]?.trim() ?? '';
      if (!options.backgroundFootageSourceId) {
        throw new Error('--background-footage-source-id requires a value');
      }
      index += 1;
      continue;
    }

    if (arg === '--language' || arg === '-l') {
      options.language = argv[index + 1]?.trim() ?? '';
      if (!options.language) throw new Error('--language requires a value');
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
  const workDir =
    options.workDir ?? youtubeChannelVideoDir(options.channelId, options.videoId);
  const audioPath = path.join(workDir, AUDIO_FILE);
  const subtitlePath = path.join(workDir, SUBTITLE_FILE);
  const centerImagePath = path.join(workDir, CENTER_IMAGE_FILE);

  await assertFileExists(audioPath, 'audio');
  await assertFileExists(subtitlePath, 'subtitle');
  await assertFileExists(centerImagePath, 'center image');

  console.log(`Channel: ${options.channelId}`);
  console.log(`YouTube video id: ${options.videoId}`);
  console.log(`Work dir: ${workDir}`);
  console.log(`Audio: ${audioPath}`);
  console.log(`Subtitle: ${subtitlePath}`);
  console.log(`Center image: ${centerImagePath}`);
  console.log(`Background footage source: ${options.backgroundFootageSourceId}`);
  console.log(`Language: ${options.language}`);
  console.log('\nAssembling SI video...\n');

  const outputPath = await assembleReupSiVideo({
    workDir,
    audioPath,
    subtitlePath,
    centerImagePath,
    backgroundFootageSourceId: options.backgroundFootageSourceId,
    language: options.language,
    onLog: msg => console.log(msg),
  });

  console.log(`\nDone → ${outputPath}`);
}

main().catch(err => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
