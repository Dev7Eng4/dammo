import type { CreateReupVideosBatchResult } from '../../modules/video-production/pipelines/reup-audio/reup-audio.types.js';

export function printBatchResult(result: CreateReupVideosBatchResult): void {
  const created = result.channels.filter((channel) => channel.status === 'created').length;
  const skipped = result.channels.filter((channel) => channel.status === 'skipped').length;
  const failed = result.channels.filter((channel) => channel.status === 'failed').length;

  console.log('');
  console.log(`Hoàn tất: ${created} created, ${skipped} skipped, ${failed} failed`);
  console.log(`Tổng video output: ${result.items.length}`);
  console.log('');

  for (const channel of result.channels) {
    const itemCount = channel.items?.length ?? 0;

    if (channel.status === 'created') {
      console.log(`  [created] ${channel.channelName} (${itemCount} item(s))`);
      for (const item of channel.items ?? []) {
        console.log(`            → ${item.outputPath}`);
      }
      continue;
    }

    if (channel.status === 'skipped') {
      console.log(`  [skipped] ${channel.channelName}: ${channel.reason ?? 'unknown'}`);
      continue;
    }

    console.log(`  [failed]  ${channel.channelName}: ${channel.reason ?? 'unknown'}`);
  }
}
