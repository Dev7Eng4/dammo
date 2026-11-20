import { ImageOff } from 'lucide-react'
import { useState } from 'react'
import { cn } from '../../lib/cn'

/** Small thumbnail of a prepared/created channel video, with a placeholder when there is none. */
export function ChannelVideoThumb({ url, className }: { url: string | null; className?: string }) {
  const [failed, setFailed] = useState(false)
  return (
    <div className={cn('aspect-video w-28 shrink-0 overflow-hidden rounded-md bg-muted', className)}>
      {url && !failed ? (
        <img src={url} alt="" loading="lazy" className="size-full object-cover" onError={() => setFailed(true)} />
      ) : (
        <div className="flex size-full items-center justify-center text-muted-foreground">
          <ImageOff className="size-4" aria-hidden="true" />
        </div>
      )}
    </div>
  )
}
