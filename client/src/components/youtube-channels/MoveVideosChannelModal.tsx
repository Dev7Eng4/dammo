import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { isAbortError } from '../../api/http'
import { fetchYoutubeChannels } from '../../api/youtubeChannels'
import type { YoutubeChannel } from '../../types/youtubeChannel'
import { Button, Modal, Select } from '../ui'

const selectTriggerClass = 'h-10 w-full min-w-0 rounded-lg px-3 py-0'

interface MoveVideosChannelModalProps {
  open: boolean
  currentChannelId: string
  videoCount: number
  onClose: () => void
  onSave: (channel: YoutubeChannel) => void
}

export function MoveVideosChannelModal({
  open,
  currentChannelId,
  videoCount,
  onClose,
  onSave,
}: MoveVideosChannelModalProps) {
  const { t } = useTranslation('youtube')
  const { t: tCommon } = useTranslation('common')
  const [channels, setChannels] = useState<YoutubeChannel[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState('')

  useEffect(() => {
    if (!open) {
      setChannels([])
      setError(null)
      setSelectedId('')
      setLoading(false)
      return
    }

    const controller = new AbortController()
    setLoading(true)
    setError(null)
    setSelectedId('')

    void fetchYoutubeChannels('all', 'all', '', 1, 100, { signal: controller.signal })
      .then(data => {
        setChannels(data.items.filter(channel => channel.id !== currentChannelId && channel.status !== 'deleted'))
      })
      .catch(err => {
        if (isAbortError(err)) return
        setChannels([])
        setError(err instanceof Error ? err.message : t('moveVideos.loadError'))
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
  }, [open, currentChannelId, t])

  const options = useMemo(
    () =>
      channels.map(channel => ({
        value: channel.id,
        label: channel.handle ? `${channel.name} (${channel.handle})` : channel.name,
      })),
    [channels],
  )
  const selected = channels.find(channel => channel.id === selectedId) ?? null
  const selectDisabled = loading || Boolean(error) || channels.length === 0

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('moveVideos.selectModalTitle')}
      className="max-w-md"
      footer={
        <>
          <Button variant="outlined" size="sm" className="rounded-lg" onClick={onClose}>
            {tCommon('actions.cancel')}
          </Button>
          <Button
            size="sm"
            className="rounded-lg"
            disabled={!selected}
            onClick={() => {
              if (selected) onSave(selected)
            }}
          >
            {tCommon('actions.save')}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-neutral-300">{t('moveVideos.selectBody', { count: videoCount })}</p>

        {error ? <p className="text-sm text-red-400">{error}</p> : null}

        {!error && channels.length === 0 && !loading ? (
          <p className="text-sm text-neutral-500">{t('moveVideos.emptyChannels')}</p>
        ) : (
          <Select
            options={options}
            value={selectedId}
            onChange={setSelectedId}
            searchable
            searchPlaceholder={t('moveVideos.searchPlaceholder')}
            placeholder={
              loading ? tCommon('actions.loading') : t('moveVideos.selectPlaceholder')
            }
            disabled={selectDisabled}
            className="w-full"
            triggerClassName={selectTriggerClass}
          />
        )}
      </div>
    </Modal>
  )
}
