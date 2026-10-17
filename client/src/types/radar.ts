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
