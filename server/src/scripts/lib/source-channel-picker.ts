import checkbox from '@inquirer/checkbox';
import { sourceChannelsRepository } from '../../modules/source-channels/source-channels.repository.js';
import type { SourceChannel } from '../../modules/source-channels/source-channels.types.js';

const ALL_VALUE = '__all__';

export type SourceChannelPickResult =
  | { mode: 'all' }
  | { mode: 'selected'; sourceIds: string[] }
  | { mode: 'cancelled' };

export type SourceChannelPickOptions = {
  message?: string;
};

function formatSourceLabel(source: SourceChannel): string {
  return `${source.name} (${source.url})`;
}

export async function pickSourceChannels(
  options: SourceChannelPickOptions = {},
): Promise<SourceChannelPickResult> {
  const youtubeSources = sourceChannelsRepository
    .findAll()
    .filter(source => source.platform === 'youtube');

  if (youtubeSources.length === 0) {
    console.log('Không có YouTube source nào trong hệ thống.');
    return { mode: 'cancelled' };
  }

  const selected = await checkbox({
    message: options.message ?? 'Chọn source để download video',
    instructions: '↑↓ di chuyển · Space chọn · Enter chạy',
    choices: [
      { name: 'All', value: ALL_VALUE },
      ...youtubeSources.map(source => ({
        name: formatSourceLabel(source),
        value: source.id,
      })),
    ],
  });

  if (selected.length === 0) {
    return { mode: 'cancelled' };
  }

  if (selected.includes(ALL_VALUE)) {
    return { mode: 'all' };
  }

  return { mode: 'selected', sourceIds: selected };
}
