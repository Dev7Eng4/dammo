import fs from 'node:fs/promises';
import { ensureDataDirs } from '../config/paths.js';
import { cleanSrt } from '../infrastructure/subtitle/clean-srt.js';
import { contentDownloadService } from '../modules/content-download/content-download.service.js';
import { INPUT_FILE, printResult, readInput } from './lib/read-input.js';

async function main() {
  ensureDataDirs();

  const { url, language } = await readInput();
  console.log(`Reading URL from ${INPUT_FILE}`);
  console.log(`Downloading transcript (language: ${language})...`);

  const item = await contentDownloadService.downloadYoutubeTranscript({ url, language });
  printResult('Transcript saved', item.path, item.sizeBytes);

  console.log('Cleaning transcript → SRT...');
  const srtPath = await cleanSrt(item.path);
  const srtStat = await fs.stat(srtPath);
  printResult('SRT cleaned', srtPath, srtStat.size);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
