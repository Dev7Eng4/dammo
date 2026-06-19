import { ensureDataDirs } from '../config/paths.js';
import { reupVideoCreatorService } from '../modules/youtube-channels/reup-video-creator.service.js';
import { pickReupChannels } from './lib/reup-channel-picker.js';
import { printBatchResult } from './lib/print-batch-result.js';

async function main() {
  ensureDataDirs();

  const pick = await pickReupChannels();
  if (pick.mode === 'cancelled') {
    console.log('Đã hủy.');
    return;
  }

  console.log('Đang tạo video...');

  const result =
    pick.mode === 'all'
      ? await reupVideoCreatorService.createVideosForAllReupChannels()
      : await reupVideoCreatorService.createVideosForChannels(pick.channelIds);

  printBatchResult(result);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
