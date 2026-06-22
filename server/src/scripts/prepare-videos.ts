import { ensureDataDirs } from '../config/paths.js';
import { videoProductionService } from '../modules/video-production/video-production.service.js';
import { pickReupChannels } from './lib/reup-channel-picker.js';
import { printBatchResult } from './lib/print-batch-result.js';

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
      ? await videoProductionService.prepareVideosForAllReupChannels()
      : await videoProductionService.prepareVideosForChannels(pick.channelIds);

  printBatchResult(result);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
