/** Watch-hour thresholds for level 1..10; level 10 = 4000h (YPP requirement). */
export const LEVEL_THRESHOLDS = [0, 10, 50, 100, 250, 500, 1000, 2000, 3000, 4000]
export const YPP_HOURS = 4000
export const YPP_SUBSCRIBERS = 1000

export function levelFor(hours: number): number {
  let level = 1
  LEVEL_THRESHOLDS.forEach((threshold, index) => {
    if (hours >= threshold) level = index + 1
  })
  return level
}

export function levelColor(level: number): string {
  if (level >= 10) return 'var(--color-primary-500)'
  if (level >= 6) return 'var(--color-info)'
  if (level >= 4) return '#a78bfa'
  return 'var(--color-success)'
}

export function formatNumber(value: number): string {
  return value.toLocaleString('vi-VN', { maximumFractionDigits: 1 })
}

/** Compact count: 1.2K, 3.4M. */
export function formatCompact(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`
  return String(value)
}

/** Overall YPP progress (0–100): the slower of the two requirements. */
export function yppPercent(hours: number, subscribers: number): number {
  return Math.min(100, Math.min(hours / YPP_HOURS, subscribers / YPP_SUBSCRIBERS) * 100)
}
