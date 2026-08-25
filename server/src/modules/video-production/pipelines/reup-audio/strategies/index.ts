import type { ReupAudioVideoType } from '../../../../youtube-channels/youtube-channels.types.js';
import { aiStrategy } from './ai.strategy.js';
import { siStrategy } from './si.strategy.js';
import type { VideoTypeStrategy } from './video-type.strategy.js';

export type {
  AssembleReadiness,
  VideoTypeStrategy,
  VisualAssets,
} from './video-type.strategy.js';

export function resolveVideoTypeStrategy(type: ReupAudioVideoType): VideoTypeStrategy {
  return type === 'ai' ? aiStrategy : siStrategy;
}
