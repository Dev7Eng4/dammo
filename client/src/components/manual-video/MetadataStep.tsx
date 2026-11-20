import { Copy, ImageOff, Save } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { fetchManualMetadata, manualThumbnailUrl, saveManualMetadata, type ManualMetadata } from '../../api/manualVideo'
import { useAbortableEffect } from '../../hooks'
import { Button, Input, Textarea, useToast } from '../ui'

interface MetadataStepProps {
  runId: string
  /** Reloads the metadata when the project changes (e.g. a generation finished). */
  reloadKey: string
  disabled: boolean
}

interface Draft {
  title: string
  description: string
  tags: string
}

function toDraft(meta: ManualMetadata): Draft {
  return { title: meta.title, description: meta.description, tags: meta.tags.join(', ') }
}

/** The generated thumbnail plus the YouTube title, description and tags, editable and copyable. */
export function MetadataStep({ runId, reloadKey, disabled }: MetadataStepProps) {
  const { t } = useTranslation('manual')
  const { toast } = useToast()
  const [meta, setMeta] = useState<ManualMetadata | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [saving, setSaving] = useState(false)

  useAbortableEffect(
    async (signal) => {
      const next = await fetchManualMetadata(runId, { signal })
      setMeta(next)
      setDraft(toDraft(next))
    },
    [runId, reloadKey],
  )

  if (!meta || !draft) return <div className="h-24 animate-pulse rounded-lg bg-muted" />

  const hasText = Boolean(meta.title || meta.description || meta.tags.length)
  if (!hasText && !meta.hasThumbnail) return <p className="text-xs text-muted-foreground">{t('metadata.empty')}</p>

  const tags = draft.tags
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean)
  const dirty = draft.title !== meta.title || draft.description !== meta.description || tags.join(',') !== meta.tags.join(',')

  function copy(text: string) {
    void navigator.clipboard.writeText(text).then(
      () => toast.success(t('detail.copied')),
      () => toast.error(text),
    )
  }

  async function save() {
    if (!draft) return
    setSaving(true)
    try {
      const next = await saveManualMetadata(runId, { title: draft.title, description: draft.description, tags })
      setMeta(next)
      setDraft(toDraft(next))
      toast.success(t('metadata.saved'))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  const copyButton = (text: string) => (
    <Button size="sm" variant="ghost" aria-label={t('detail.copy')} disabled={!text} onClick={() => copy(text)}>
      <Copy className="size-3.5" />
    </Button>
  )

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
      <div className="space-y-1.5">
        <span className="section-label">{t('metadata.thumbnail')}</span>
        {meta.hasThumbnail ? (
          <a href={manualThumbnailUrl(runId, meta.thumbnailVersion)} target="_blank" rel="noreferrer">
            <img
              src={manualThumbnailUrl(runId, meta.thumbnailVersion)}
              alt={t('metadata.thumbnail')}
              className="aspect-video w-full rounded-lg border border-border object-cover"
            />
          </a>
        ) : (
          <div className="flex aspect-video w-full flex-col items-center justify-center gap-1 rounded-lg border border-border bg-muted text-xs text-muted-foreground">
            <ImageOff className="size-5" />
            {t('metadata.noThumbnail')}
          </div>
        )}
      </div>

      <div className="space-y-3">
        <label className="block space-y-1.5">
          <span className="flex items-center justify-between">
            <span className="section-label">{t('metadata.title')}</span>
            {copyButton(draft.title)}
          </span>
          <Input
            lang="ja"
            value={draft.title}
            disabled={disabled}
            onChange={(event) => setDraft({ ...draft, title: event.target.value })}
          />
        </label>
        <label className="block space-y-1.5">
          <span className="flex items-center justify-between">
            <span className="section-label">{t('metadata.description')}</span>
            {copyButton(draft.description)}
          </span>
          <Textarea
            lang="ja"
            rows={10}
            value={draft.description}
            disabled={disabled}
            onChange={(event) => setDraft({ ...draft, description: event.target.value })}
          />
        </label>
        <label className="block space-y-1.5">
          <span className="flex items-center justify-between">
            <span className="section-label">{t('metadata.tags')}</span>
            {copyButton(tags.join(', '))}
          </span>
          <Input
            lang="ja"
            value={draft.tags}
            disabled={disabled}
            placeholder={t('metadata.tagsHint')}
            onChange={(event) => setDraft({ ...draft, tags: event.target.value })}
          />
        </label>
        <Button size="sm" disabled={disabled || saving || !dirty} onClick={() => void save()}>
          <Save className="size-4" />
          {t('metadata.save')}
        </Button>
      </div>
    </div>
  )
}
