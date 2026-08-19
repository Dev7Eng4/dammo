import { Readable } from 'stream';
import fs from 'node:fs';
import { ensureDataDirs, mediaDownloadDir } from '../config/paths.js';
import { downloadYoutubeVideoWithYoutubei } from '../infrastructure/youtube/youtubei/youtubei-video-downloader.js';
import { contentDownloadService } from '../modules/content-download/content-download.service.js';
import { INPUT_FILE, printResult, readInput } from './lib/read-input.js';

import { Innertube } from 'youtubei.js';

async function main() {
  // ensureDataDirs();

  // const { url } = await readInput();
  // console.log(`Reading URL from ${INPUT_FILE}`);
  // console.log(`Downloading video (720p MP4)...`);

  const innertube = await Innertube.create();

  const stream = await innertube.download('SPNkZ8Lw1so', {
    type: 'video+audio',
    client: 'ANDROID',
  });

  const nodeStream = Readable.fromWeb(stream as any);
  const fileStream = fs.createWriteStream('video.mp4');

  nodeStream.pipe(fileStream);

  fileStream.on('finish', () => {
    console.log('Video saved');
  });
  fileStream.on('error', err => {
    console.error(err);
  });
  console.log(stream);
}

main().catch(err => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
