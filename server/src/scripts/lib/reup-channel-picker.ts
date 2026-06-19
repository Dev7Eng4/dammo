import checkbox from '@inquirer/checkbox';
import { youtubeChannelsRepository } from '../../modules/youtube-channels/youtube-channels.repository.js';
import type { StoredYoutubeChannelType } from '../../modules/youtube-channels/youtube-channels.types.js';

const ALL_VALUE = '__all__';

export type ReupChannelPickResult =
  | { mode: 'all' }
  | { mode: 'selected'; channelIds: string[] }
  | { mode: 'cancelled' };

function isReupChannelType(type: StoredYoutubeChannelType): boolean {
  return type === 'reup_audio' || type === 'reup_video' || type === 'reup';
}

export async function pickReupChannels(): Promise<ReupChannelPickResult> {
  const reupChannels = youtubeChannelsRepository
    .findAll()
    .filter((channel) => isReupChannelType(channel.type));

  if (reupChannels.length === 0) {
    console.log('Không có reup channel nào trong hệ thống.');
    return { mode: 'cancelled' };
  }

  const selected = await checkbox({
    message: 'Chọn kênh để tạo video',
    instructions: '↑↓ di chuyển · Space chọn · Enter chạy',
    choices: [
      { name: 'All', value: ALL_VALUE },
      ...reupChannels.map((channel) => ({
        name: `${channel.name} (${channel.handle})`,
        value: channel.id,
      })),
    ],
  });

  if (selected.length === 0) {
    return { mode: 'cancelled' };
  }

  if (selected.includes(ALL_VALUE)) {
    return { mode: 'all' };
  }

  return { mode: 'selected', channelIds: selected };
}
