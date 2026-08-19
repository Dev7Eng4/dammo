import { ensureDataDirs } from '../config/paths.js';
import { contentDownloadService } from '../modules/content-download/content-download.service.js';
import { INPUT_FILE, printResult, readInput } from './lib/read-input.js';

async function main() {
  ensureDataDirs();

  const { url } = await readInput();
  console.log(`Reading URL from ${INPUT_FILE}`);
  console.log(`Downloading audio...`);

  const item = await contentDownloadService.downloadYoutubeAudio({ url });
  printResult('Audio saved', item.path, item.sizeBytes);
}

main().catch(err => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
