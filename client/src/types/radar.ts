export type RadarTier = 'spike' | 'burst' | 'super'

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
  reason: string
  source: 'brain' | 'skill' | 'unknown'
  hits: number
  firstSeenAt: string
  lastSeenAt: string
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
  total: number
  lastRunAt?: string
}

export interface TrendRadarFilters {
  days: number
  cluster?: string
}
