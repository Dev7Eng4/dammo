import { ensureDataDirs } from '../config/paths.js';
import { videoProductionService } from '../modules/video-production/video-production.service.js';
import { pickReupChannels } from './lib/reup-channel-picker.js';
import { printBatchResult } from './lib/print-batch-result.js';

/** Số video tối đa được prepare cho mỗi channel trong một lần chạy script */
const DEFAULT_MAX_VIDEOS_PER_CHANNEL = 10;

async function main() {
  ensureDataDirs();

  const pick = await pickReupChannels({ message: 'Chọn kênh để prepare video (không tạo video, chỉ tải assets)' });
  if (pick.mode === 'cancelled') {
    console.log('Đã hủy.');
    return;
  }

  console.log('Đang prepare video (thumbnail, metadata,... — bỏ qua bước render video)...');

  const result =
    pick.mode === 'all'
      ? await videoProductionService.prepareVideosForAllReupChannels({ maxVideosPerChannel: DEFAULT_MAX_VIDEOS_PER_CHANNEL })
      : await videoProductionService.prepareVideosForChannels(pick.channelIds, { maxVideosPerChannel: DEFAULT_MAX_VIDEOS_PER_CHANNEL });

  printBatchResult(result);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

