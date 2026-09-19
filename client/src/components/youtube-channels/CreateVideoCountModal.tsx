import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Input, Modal } from '../ui'

const DEFAULT_COUNT = 1
const MIN_COUNT = 1
const MAX_COUNT = 50

interface CreateVideoCountModalProps {
  open: boolean
  onClose: () => void
  onConfirm: (count: number) => void
  description?: string
  title?: string
}

export function CreateVideoCountModal({
  open,
  onClose,
  onConfirm,
  description,
  title,
}: CreateVideoCountModalProps) {
  const { t } = useTranslation('youtube')
  const { t: tCommon } = useTranslation('common')
  const [countText, setCountText] = useState(String(DEFAULT_COUNT))
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setCountText(String(DEFAULT_COUNT))
    setError(null)
  }, [open])

  function handleConfirm() {
    const parsed = Number.parseInt(countText, 10)
    if (!Number.isFinite(parsed) || parsed < MIN_COUNT || parsed > MAX_COUNT) {
      setError(t('createCount.rangeError', { min: MIN_COUNT, max: MAX_COUNT }))
      return
    }
    onConfirm(parsed)
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title ?? t('createCount.titleCreate')}
      className="max-w-sm"
      footer={
        <>
          <Button variant="outlined" size="sm" className="rounded-lg" onClick={onClose}>
            {tCommon('actions.cancel')}
          </Button>
          <Button size="sm" className="rounded-lg" onClick={handleConfirm}>
            {tCommon('actions.confirm')}
          </Button>
        </>
      }
    >
      {description ? <p className="mb-3 text-sm text-neutral-400">{description}</p> : null}
      <label htmlFor="create-video-count" className="mb-1.5 block text-xs font-medium text-neutral-400">
        {t('createCount.label')}
      </label>
      <Input
        id="create-video-count"
        type="number"
        min={MIN_COUNT}
        max={MAX_COUNT}
        step={1}
        value={countText}
        onChange={e => {
          setCountText(e.target.value)
          setError(null)
        }}
        onKeyDown={e => {
          if (e.key === 'Enter') {
            e.preventDefault()
            handleConfirm()
          }
        }}
        className="h-10 rounded-lg text-sm"
        autoFocus
      />
      {error ? <p className="mt-1 text-xs text-danger">{error}</p> : null}
      <p className="mt-2 text-xs text-neutral-500">
        {t('createCount.hint', { min: MIN_COUNT, max: MAX_COUNT })}
      </p>
    </Modal>
  )
}
