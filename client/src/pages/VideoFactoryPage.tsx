import { Factory } from 'lucide-react'
import { PageHeader, PageShell } from '../components/layout'
import { VideoFactoryForm } from '../components/video-factory/VideoFactoryForm'
import { useToast } from '../components/ui'

export function VideoFactoryPage() {
  const { toast } = useToast()

  return (
    <PageShell fullBleed>
      <div className="flex-1 overflow-y-auto">
        <PageHeader
          title="Video Factory"
          subtitle="Cấu hình job render mới và thêm vào hàng đợi"
          icon={Factory}
          className="mb-6"
        />

        <div className="card-surface p-5">
          <VideoFactoryForm
            onQueued={() => toast.success('Video queued for render')}
            onError={(message) => toast.error(message)}
          />
        </div>
      </div>
    </PageShell>
  )
}
