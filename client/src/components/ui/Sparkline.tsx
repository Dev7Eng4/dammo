import { useId } from 'react'

interface SparklineProps {
  values: number[]
  className?: string
  width?: number
  height?: number
}

export function Sparkline({ values, className, width = 96, height = 32 }: SparklineProps) {
  const gradientId = useId()
  if (values.length < 2) return null

  const min = Math.min(...values)
  const range = Math.max(...values) - min || 1
  const pad = 2
  const step = (width - pad * 2) / (values.length - 1)
  const points = values.map((v, i) => [
    pad + i * step,
    height - pad - ((v - min) / range) * (height - pad * 2),
  ])
  const line = points.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ')
  const area = `${line} L${points[points.length - 1][0].toFixed(1)} ${height} L${pad} ${height} Z`

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.35" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradientId})`} />
      <path d={line} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}
