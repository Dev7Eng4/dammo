import { Factory } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { PageHeader, PageShell } from '../components/layout'
import { VideoFactoryForm } from '../components/video-factory/VideoFactoryForm'
import { useToast } from '../components/ui'

export function VideoFactoryPage() {
  const { t } = useTranslation('factory')
  const { toast } = useToast()

  return (
    <PageShell fullBleed>
      <div className="flex-1 overflow-y-auto">
        <PageHeader
          title={t('videoFactory.page.title')}
          subtitle={t('videoFactory.page.subtitle')}
          icon={Factory}
          className="mb-6"
        />

        <div className="card-surface p-5">
          <VideoFactoryForm
            onQueued={() => toast.success(t('videoFactory.page.queued'))}
            onError={(message) => toast.error(message)}
          />
        </div>
      </div>
    </PageShell>
  )
}
