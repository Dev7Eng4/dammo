import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { postToFacebookPage, uploadFacebookPageVideo } from '../../api/facebookPages'
import { Button, Input, Modal, Textarea, useToast } from '../ui'
import type { FacebookPage } from '../../types/facebookPage'

export type PublishMode = 'post' | 'video'

interface FacebookPublishModalProps {
  page: FacebookPage | null
  mode: PublishMode
  onClose: () => void
  onDone: () => void
}

export function FacebookPublishModal(props: FacebookPublishModalProps) {
  if (!props.page) return null
  return <FacebookPublishForm key={`${props.page.id}:${props.mode}`} {...props} page={props.page} />
}

function FacebookPublishForm({
  page,
  mode,
  onClose,
  onDone,
}: FacebookPublishModalProps & { page: FacebookPage }) {
  const { t } = useTranslation('facebook')
  const { t: tCommon } = useTranslation('common')
  const { toast } = useToast()
  const [text, setText] = useState('')
  const [file, setFile] = useState('')
  const [running, setRunning] = useState(false)

  async function handleSubmit() {
    if (mode === 'post' && !text.trim()) return
    if (mode === 'video' && !file.trim()) return
    setRunning(true)
    try {
      if (mode === 'post') {
        await postToFacebookPage(page.id, { text, imageFile: file.trim() || undefined })
      } else {
        await uploadFacebookPageVideo(page.id, { videoFile: file.trim(), caption: text })
      }
      toast.success(t('publish.done'))
      onDone()
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('publish.error'))
    } finally {
      setRunning(false)
    }
  }

  return (
    <Modal
      open
      onClose={running ? () => undefined : onClose}
      title={mode === 'post' ? t('publish.postTitle') : t('publish.videoTitle')}
      className="max-w-lg"
      footer={
        <>
          <Button variant="outlined" size="sm" onClick={onClose} disabled={running}>
            {tCommon('actions.cancel')}
          </Button>
          <Button size="sm" onClick={() => void handleSubmit()} disabled={running}>
            {running ? t('publish.running') : t('publish.submit')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">{t('publish.hint', { name: page.name })}</p>
        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-muted-foreground">
            {mode === 'post' ? t('publish.text') : t('publish.caption')}
          </span>
          <Textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} />
        </label>
        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-muted-foreground">
            {mode === 'post' ? t('publish.imageFile') : t('publish.videoFile')}
          </span>
          <Input value={file} placeholder="youtube-channels/.../video.mp4" onChange={(e) => setFile(e.target.value)} />
          <p className="text-xs text-muted-foreground">{t('publish.fileHint')}</p>
        </label>
      </div>
    </Modal>
  )
}
