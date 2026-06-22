import type { SourceChannel, SourceVideoRecord } from '../../source-channels/source-channels.types.js';

export interface SourceCatalog {
  resolveSources(mapping: string): SourceChannel[];
  listVideos(sourceId: string): SourceVideoRecord[];
}
