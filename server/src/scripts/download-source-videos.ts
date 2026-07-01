import { ensureDataDirs } from '../config/paths.js';
import { SOURCE_VIDEOS_PER_DOWNLOAD_RUN } from '../modules/source-channels/source-download.constants.js';
import { sourceDownloadService } from '../modules/source-channels/source-download.service.js';
import { pickSourceChannels } from './lib/source-channel-picker.js';
import { printSourceDownloadBatchResult } from './lib/print-source-download-result.js';

async function main() {
  ensureDataDirs();

  const pick = await pickSourceChannels({
    message: 'Chọn source để download video (audio + transcript + thumbnail)',
  });

  if (pick.mode === 'cancelled') {
    console.log('Đã hủy.');
    return;
  }

  console.log(
    `Đang download tối đa ${SOURCE_VIDEOS_PER_DOWNLOAD_RUN} video/source (mới → cũ, tuần tự)...`,
  );

  const results =
    pick.mode === 'all'
      ? await sourceDownloadService.downloadVideosForAllYoutubeSources({
          maxVideos: SOURCE_VIDEOS_PER_DOWNLOAD_RUN,
        })
      : await sourceDownloadService.downloadVideosForSources(pick.sourceIds, {
          maxVideos: SOURCE_VIDEOS_PER_DOWNLOAD_RUN,
        });

  printSourceDownloadBatchResult(results);
}

main().catch(err => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
