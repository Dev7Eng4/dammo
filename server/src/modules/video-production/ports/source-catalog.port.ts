import type { SourceChannel, SourceVideoRecord } from '../../source-channels/source-channels.types.js';

export interface SourceCatalog {
  resolveSources(sourceIds: string[]): SourceChannel[];
  listVideos(sourceId: string): SourceVideoRecord[];
}
