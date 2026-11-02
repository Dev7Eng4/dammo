import type { VideoAgentScript } from '../../types/videoAgent'

/** Same gate as the agent (server/src/modules/video-agent/similarity.ts). */
export const SIMILARITY_LIMITS = { gram8: 5, gram15: 0.5 }

export function similarityPasses(script: VideoAgentScript): boolean {
  return script.similarity.every(
    (item) => item.gram8 <= SIMILARITY_LIMITS.gram8 && item.gram15 <= SIMILARITY_LIMITS.gram15,
  )
}
