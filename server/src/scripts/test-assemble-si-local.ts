import fs from 'node:fs/promises';
import path from 'node:path';
import { ensureDataDirs, mediaDownloadDir, paths } from '../config/paths.js';
import type { FfmpegProgress } from '../infrastructure/ffmpeg/ffmpeg-runner.js';
import { assembleReupSiVideo } from '../modules/video-production/shared/si-video/si-video-assembler.js';

const DEFAULT_LANGUAGE = 'ja';

function logFfmpegProgress(label: string, p: FfmpegProgress): void {
  const parts = [
    `[ffmpeg:${label}] ${p.progress}%`,
    p.time && `time=${p.time}`,
    p.bitrate && `bitrate=${p.bitrate}`,
    p.speed && `speed=${p.speed}`,
    p.fps !== undefined && `fps=${p.fps}`,
    p.eta && `eta=${p.eta}`,
    p.size && `size=${p.size}`,
  ].filter(Boolean);
  process.stdout.write(`\r${parts.join(' | ')}`);
  if (p.progress >= 100) process.stdout.write('\n');
}

interface CliOptions {
  workDir: string;
  language: string;
  audioPath?: string;
  subtitlePath?: string;
  centerImagePath?: string;
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    workDir: mediaDownloadDir('youtube', 'test'),
    language: DEFAULT_LANGUAGE,
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

    if (arg === '--language' || arg === '-l') {
      options.language = argv[index + 1]?.trim() ?? '';
      if (!options.language) throw new Error('--language requires a value');
      index += 1;
      continue;
    }

    if (arg === '--audio') {
      const value = argv[index + 1]?.trim() ?? '';
      if (!value) throw new Error('--audio requires a value');
      options.audioPath = path.resolve(value);
      index += 1;
      continue;
    }

    if (arg === '--subtitle') {
      const value = argv[index + 1]?.trim() ?? '';
      if (!value) throw new Error('--subtitle requires a value');
      options.subtitlePath = path.resolve(value);
      index += 1;
      continue;
    }

    if (arg === '--center-image') {
      const value = argv[index + 1]?.trim() ?? '';
      if (!value) throw new Error('--center-image requires a value');
      options.centerImagePath = path.resolve(value);
      index += 1;
      continue;
    }

    if (arg.startsWith('-')) {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  return options;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/** Resolve asset by preferred names first, then by extension fallback. */
async function discoverFile(
  workDir: string,
  entries: string[],
  preferredNames: string[],
  extensions: string[],
): Promise<string | null> {
  for (const name of preferredNames) {
    const candidate = path.join(workDir, name);
    if (await fileExists(candidate)) return candidate;
  }

  const fallback = entries.find(entry =>
    extensions.some(ext => entry.toLowerCase().endsWith(ext)),
  );
  return fallback ? path.join(workDir, fallback) : null;
}

async function main() {
  ensureDataDirs();

  const options = parseArgs(process.argv.slice(2));
  const { workDir } = options;

  let entries: string[] = [];
  try {
    entries = (await fs.readdir(workDir)).sort();
  } catch {
    throw new Error(`Work dir not found: ${workDir}`);
  }

  const audioPath =
    options.audioPath ?? (await discoverFile(workDir, entries, ['audio.mp3'], ['.mp3']));
  const subtitlePath =
    options.subtitlePath ??
    (await discoverFile(
      workDir,
      entries,
      ['transcript.srt', `transcript.${options.language}.srt`, 'transcript-updated.srt'],
      ['.srt'],
    ));
  const centerImagePath =
    options.centerImagePath ??
    (await discoverFile(workDir, entries, ['background.jpg', 'thumbnail.jpg'], []));

  const missing: string[] = [];
  if (!audioPath) missing.push('audio (.mp3)');
  if (!subtitlePath) missing.push('subtitle (.srt)');
  if (!centerImagePath) missing.push('center image (background.jpg / thumbnail.jpg)');

  if (missing.length > 0) {
    console.error(`Missing required input(s): ${missing.join(', ')}`);
    console.error(`\nFiles found in ${workDir}:`);
    for (const entry of entries) {
      console.error(`  - ${entry}`);
    }
    throw new Error('Cannot assemble SI video without required inputs');
  }

  console.log('Test assemble SI video with LOCAL stock');
  console.log(`Work dir: ${workDir}`);
  console.log(`Audio: ${audioPath}`);
  console.log(`Subtitle: ${subtitlePath}`);
  console.log(`Center image: ${centerImagePath}`);
  console.log(`Language: ${options.language}`);
  console.log(`Local stock dir: ${paths.siLocalStockDir} (cần ít nhất 1 file .mp4)`);
  console.log(`Output: ${path.join(workDir, 'video.mp4')}`);
  console.log('\nAssembling SI video...\n');

  const outputPath = await assembleReupSiVideo({
    workDir,
    audioPath: audioPath!,
    subtitlePath: subtitlePath!,
    centerImagePath: centerImagePath!,
    backgroundFootageMode: 'local',
    language: options.language,
    onLog: msg => console.log(msg),
    onFfmpegProgress: p => logFfmpegProgress('merge', p),
  });

  console.log(`\nDone → ${outputPath}`);
}

main().catch(err => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
