export type RadarTier = 'spike' | 'burst' | 'super'

/** Remake gates: nên làm / có thể làm / không nên làm. */
export type RemakeVerdict = 'do' | 'maybe' | 'skip'

export interface RadarItem {
  videoId: string
  title: string
  url: string
  sourceId: string
  sourceName: string
  publishedAt: string
  ageHours: number
  durationSeconds: number
  viewCount: number
  viewsPerHour: number
  expectedViews: number
  ratio: number
  tier: RadarTier
  momentum?: number
  verdict: RemakeVerdict
  verdictReasons: string[]
}

export interface RadarListResponse {
  items: RadarItem[]
  lastScanAt?: string
  quotaUsedToday: number
  quotaCap: number
}

export interface RadarStatus {
  apiKeyConfigured: boolean
  trackedChannels: number
  channelsWithBaseline: number
  trackedVideos: number
  lastScanAt?: string
  quotaUsedToday: number
  quotaCap: number
}

export interface RadarScanResult {
  scannedChannels: number
  skippedChannels: number
  failedChannels: { sourceId: string; error: string }[]
  quotaUsedThisScan: number
  quotaUsedToday: number
  quotaCap: number
  stoppedForQuota: boolean
}

export interface RadarFilters {
  maxAgeHours: number
  minRatio: number
  verdict?: RemakeVerdict
}

/** Hot video found by the jp-psy-trends brain or Claude Code skill, tagged with a K1–K11 cluster. */
export interface TrendRadarItem {
  videoId: string
  title: string
  url: string
  channel: string
  channelId: string
  publishedAt?: string
  ageHours?: number
  minutes: number
  views: number
  viewsPerHour: number
  channelRatio?: number
  heat: number
  cluster?: string
  clusterName?: string
  clusterUnsure: boolean
  subCluster?: string
  format?: string
  /** narrated / manga / real-host / real-vlog / persona */
  sourceType?: string
  sourceTypeName?: string
  /** Real-life vlog or speaks as a real famous person: only the topic may be reused. */
  topicOnly: boolean
  reason: string
  source: 'brain' | 'skill' | 'unknown'
  hits: number
  firstSeenAt: string
  lastSeenAt: string
  verdict: RemakeVerdict
  verdictReasons: string[]
}

export interface TrendClusterCount {
  /** K1–K11, "off" (outside the niche) or "none" (not tagged). */
  id: string
  name: string
  count: number
  topViewsPerHour: number
}

export interface TrendRadarResponse {
  items: TrendRadarItem[]
  clusters: TrendClusterCount[]
  /** Counts per remake verdict, within the selected cluster. */
  verdicts: Record<RemakeVerdict, number>
  total: number
  lastRunAt?: string
}

export interface TrendRadarFilters {
  days: number
  cluster?: string
  verdict?: RemakeVerdict
}
