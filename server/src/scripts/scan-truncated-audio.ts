import fs from 'node:fs/promises';
import path from 'node:path';
import { paths } from '../config/paths.js';
import {
  assertMediaFileComplete,
  formatClockDuration,
  getDecodedAudioDurationSeconds,
  getMediaDurationSeconds,
} from '../infrastructure/ffmpeg/ffmpeg-probe.js';

const AUDIO_FILE = 'audio.mp3';

/**
 * The signature left by youtubei.js stopping after its first 10 MiB slice:
 * `&range=0-10485760` is inclusive, so the payload is one byte over 10 MiB.
 */
const YOUTUBEI_FIRST_CHUNK_BYTES = 10 * 1024 * 1024 + 1;

interface Finding {
  filePath: string;
  sizeBytes: number;
  headerSec: number;
  decodedSec: number;
  reason: string;
}

async function listDirs(parent: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(parent, { withFileTypes: true });
    return entries.filter(e => e.isDirectory()).map(e => path.join(parent, e.name));
  } catch {
    return [];
  }
}

/** Every `<root>/<ownerId>/videos/<videoId>/audio.mp3` under the given roots. */
async function collectAudioFiles(roots: string[]): Promise<string[]> {
  const found: string[] = [];

  for (const root of roots) {
    for (const ownerDir of await listDirs(root)) {
      for (const videoDir of await listDirs(path.join(ownerDir, 'videos'))) {
        const candidate = path.join(videoDir, AUDIO_FILE);
        try {
          await fs.access(candidate);
          found.push(candidate);
        } catch {
          // video folder without audio, nothing to check
        }
      }
    }
  }

  return found;
}

async function inspect(filePath: string): Promise<Finding | null> {
  const { size } = await fs.stat(filePath);

  const reasons: string[] = [];

  try {
    await assertMediaFileComplete(filePath, { label: path.basename(filePath) });
  } catch (err) {
    reasons.push(err instanceof Error ? err.message : 'không kiểm tra được');
  }

  if (size === YOUTUBEI_FIRST_CHUNK_BYTES) {
    reasons.push(`đúng ${YOUTUBEI_FIRST_CHUNK_BYTES} byte — dừng sau 1 chunk của youtubei.js`);
  }

  if (reasons.length === 0) return null;

  return {
    filePath,
    sizeBytes: size,
    headerSec: await getMediaDurationSeconds(filePath),
    decodedSec: await getDecodedAudioDurationSeconds(filePath),
    reason: reasons.join(' · '),
  };
}

async function main() {
  const files = await collectAudioFiles([paths.youtubeChannelsDir, paths.sourcesDir]);
  console.log(`Quét ${files.length} file ${AUDIO_FILE}...\n`);

  const findings: Finding[] = [];
  for (let i = 0; i < files.length; i++) {
    const filePath = files[i]!;
    if (process.stdout.isTTY) process.stdout.write(`\r  [${i + 1}/${files.length}]`);
    const finding = await inspect(filePath);
    if (finding) findings.push(finding);
  }
  if (process.stdout.isTTY) process.stdout.write('\r');

  if (findings.length === 0) {
    console.log('Không có file nào bị cắt.');
    return;
  }

  console.log(`Phát hiện ${findings.length} file có vấn đề:\n`);
  for (const f of findings) {
    console.log(`  ${path.relative(paths.dataDir, f.filePath)}`);
    console.log(
      `    ${f.sizeBytes} byte · header ${formatClockDuration(f.headerSec)} · thực tế ${formatClockDuration(f.decodedSec)}`,
    );
    console.log(`    ${f.reason}`);
  }

  console.log('\nTải lại các video trên trước khi ghép.');
  process.exitCode = 1;
}

main().catch(err => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
