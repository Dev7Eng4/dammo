import { ensureDataDirs } from '../config/paths.js';
import { listUploadJobs } from '../modules/youtube-upload/upload-jobs.js';
import { youtubeUploadService } from '../modules/youtube-upload/youtube-upload.service.js';
import { youtubeChannelsRepository } from '../modules/youtube-channels/youtube-channels.repository.js';
import { pickReupChannels } from './lib/reup-channel-picker.js';

function listReupChannelIds(): string[] {
  return youtubeChannelsRepository
    .findAll()
    .filter(ch => ch.type === 'reup_audio' || ch.type === 'reup_video' || ch.type === 'reup')
    .map(ch => ch.id);
}

function logEligibleUploadJobs(channelIds: string[]): void {
  for (const channelId of channelIds) {
    const channel = youtubeChannelsRepository.findById(channelId);
    const jobs = listUploadJobs(channelId, {
      allowOldThumbnail: !channel?.thumbnailStyleKey?.trim(),
    });
    const label = channel ? `${channel.name} (${channel.handle})` : channelId;
    console.log(`  ${label}: ${jobs.length} video(s) ready to upload`);
  }
}

async function main() {
  ensureDataDirs();

  const pick = await pickReupChannels({ message: 'Chọn kênh để upload video' });
  if (pick.mode === 'cancelled') {
    console.log('Đã hủy.');
    return;
  }

  const channelIds = pick.mode === 'all' ? listReupChannelIds() : pick.channelIds;

  console.log('Video sẵn sàng upload:');
  logEligibleUploadJobs(channelIds);

  console.log('Đang upload video lên YouTube qua GPM...');

  const result = await youtubeUploadService.uploadChannels(channelIds);

  for (const item of result.results) {
    if (item.ok && item.result) {
      console.log(
        `✓ ${item.channelId}: uploaded ${item.result.uploadedSuccessful}/${item.result.uploaded} video(s)`,
      );
    } else {
      console.error(`✗ ${item.channelId}: ${item.error ?? 'Upload failed'}`);
    }
  }
}

main().catch(err => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
