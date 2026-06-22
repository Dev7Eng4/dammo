import { sourceVideosRepository } from '../../source-channels/source-videos.repository.js';
import type { SourceChannel } from '../../source-channels/source-channels.types.js';
import { resolveSourceChannelsByIds } from '../../youtube-channels/youtube-channel-sources.js';
import type { SourceCatalog } from '../ports/source-catalog.port.js';

export const sourceCatalogAdapter: SourceCatalog = {
  resolveSources(sourceIds: string[]): SourceChannel[] {
    return resolveSourceChannelsByIds(sourceIds);
  },

  listVideos(sourceId: string) {
    const store = sourceVideosRepository.read(sourceId);
    return store?.videos ?? [];
  },
};
