import { type ImgHTMLAttributes, type ReactNode, useState } from 'react'
import { cn } from '../../lib/cn'

const roundedStyles = {
  none: 'rounded-none',
  sm: 'rounded-lg',
  md: 'rounded-xl',
  lg: 'rounded-2xl',
  full: 'rounded-full',
} as const

const fitStyles = {
  cover: 'object-cover',
  contain: 'object-contain',
  fill: 'object-fill',
} as const

export type ImageRounded = keyof typeof roundedStyles
export type ImageFit = keyof typeof fitStyles

export interface ImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> {
  src?: string | null
  alt: string
  fallback?: ReactNode
  rounded?: ImageRounded
  fit?: ImageFit
  aspectRatio?: 'square' | 'video' | 'wide' | 'auto'
  showSkeleton?: boolean
}

const aspectStyles = {
  square: 'aspect-square',
  video: 'aspect-video',
  wide: 'aspect-[21/9]',
  auto: '',
} as const

export function Image({
  src,
  alt,
  fallback,
  rounded = 'md',
  fit = 'cover',
  aspectRatio = 'auto',
  showSkeleton = true,
  className,
  onLoad,
  onError,
  ...props
}: ImageProps) {
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>(() =>
    src ? 'loading' : 'error',
  )

  const isLoading = status === 'loading' && showSkeleton
  const hasError = status === 'error' || !src

  return (
    <div
      className={cn(
        'relative overflow-hidden bg-surface-elevated',
        aspectStyles[aspectRatio],
        roundedStyles[rounded],
        className,
      )}
    >
      {isLoading ? (
        <div className="absolute inset-0 animate-pulse bg-neutral-800" aria-hidden="true" />
      ) : null}

      {hasError ? (
        <div className="flex size-full min-h-24 items-center justify-center bg-neutral-900 text-neutral-500">
          {fallback ?? (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              className="size-8"
              aria-hidden="true"
            >
              <rect x="3" y="5" width="18" height="14" rx="2" />
              <circle cx="9" cy="10" r="1.5" />
              <path d="m3 17 5-5 4 4 3-3 6 6" />
            </svg>
          )}
        </div>
      ) : (
        <img
          src={src}
          alt={alt}
          className={cn(
            'size-full',
            fitStyles[fit],
            status === 'loaded' ? 'opacity-100' : 'opacity-0',
            'transition-opacity duration-300',
          )}
          onLoad={(event) => {
            setStatus('loaded')
            onLoad?.(event)
          }}
          onError={(event) => {
            setStatus('error')
            onError?.(event)
          }}
          {...props}
        />
      )}
    </div>
  )
}
