import { Rocket, X } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { createVideoAgentRun } from '../../api/videoAgent'
import { fetchYoutubeChannels } from '../../api/youtubeChannels'
import { useAbortableEffect } from '../../hooks'
import type { YoutubeChannel } from '../../types/youtubeChannel'
import type { VideoAgentRun, VoicevoxStatus } from '../../types/videoAgent'
import { Button, Input, Select, Switch, Textarea, useToast } from '../ui'

const SPEED_OPTIONS = ['0.9', '1', '1.1', '1.2']

interface NewRunFormProps {
  voicevox: VoicevoxStatus | null
  onCreated: (run: VideoAgentRun) => void
  onClose: () => void
}

export function NewRunForm({ voicevox, onCreated, onClose }: NewRunFormProps) {
  const { t } = useTranslation('agent')
  const { toast } = useToast()
  const [channels, setChannels] = useState<YoutubeChannel[]>([])
  const [sources, setSources] = useState('')
  const [channelId, setChannelId] = useState('')
  const [speaker, setSpeaker] = useState('')
  const [speed, setSpeed] = useState('1')
  const [notes, setNotes] = useState('')
  const [requireApproval, setRequireApproval] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  useAbortableEffect(async (signal) => {
    const res = await fetchYoutubeChannels('all', 'all', '', 1, 100, { signal })
    setChannels(res.items.filter((channel) => channel.type === 'reup_audio'))
  }, [])

  const channelOptions = channels.map((channel) => ({
    value: channel.id,
    label: channel.reupAudioVisualStyleId ? channel.name : `${channel.name} (${t('form.noVisualStyle')})`,
  }))

  const speakerOptions = useMemo(
    () =>
      (voicevox?.speakers ?? []).flatMap((s) =>
        s.styles.map((style) => ({ value: String(style.id), label: `${s.name} · ${style.name} (#${style.id})` })),
      ),
    [voicevox],
  )

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const sourceUrls = sources
      .split(/\s+/)
      .map((line) => line.trim())
      .filter((line) => /youtu\.?be/.test(line))
    if (sourceUrls.length === 0) {
      toast.error(t('form.invalidSources'))
      return
    }
    setSubmitting(true)
    try {
      const run = await createVideoAgentRun({
        sourceUrls,
        channelId,
        notes: notes.trim() || undefined,
        voicevoxSpeaker: speaker ? Number(speaker) : undefined,
        speedScale: Number(speed),
        requireApproval,
      })
      toast.success(t('form.created'))
      onCreated(run)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form className="card-surface space-y-4 p-5" onSubmit={(event) => void handleSubmit(event)}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-foreground">{t('form.title')}</h2>
        <Button variant="ghost" size="sm" onClick={onClose} aria-label={t('form.cancel')}>
          <X className="size-4" />
        </Button>
      </div>

      <label className="block space-y-1.5">
        <span className="section-label">{t('form.sources')}</span>
        <Textarea
          rows={4}
          value={sources}
          onChange={(event) => setSources(event.target.value)}
          placeholder="https://www.youtube.com/watch?v=..."
          className="font-mono text-xs"
        />
        <span className="block text-[11px] text-muted-foreground">{t('form.sourcesHint')}</span>
      </label>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="block space-y-1.5">
          <span className="section-label">{t('form.channel')}</span>
          <Select
            options={channelOptions}
            value={channelId}
            onChange={setChannelId}
            placeholder={t('form.channelPlaceholder')}
            searchable
          />
        </label>
        <div className="space-y-1.5">
          <span className="section-label">{t('form.length')}</span>
          <p className="rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground">
            {t('form.lengthValue')}
          </p>
          <p className="text-[11px] text-muted-foreground">{t('form.lengthHint')}</p>
        </div>
        <label className="block space-y-1.5">
          <span className="section-label">{t('form.voice')}</span>
          {voicevox?.available ? (
            <Select
              options={speakerOptions}
              value={speaker || String(voicevox.defaultSpeaker)}
              onChange={setSpeaker}
              searchable
            />
          ) : (
            <Input disabled value={t('form.voiceUnavailable', { id: voicevox?.defaultSpeaker ?? '?' })} />
          )}
        </label>
        <label className="block space-y-1.5">
          <span className="section-label">{t('form.speed')}</span>
          <Select
            options={SPEED_OPTIONS.map((value) => ({ value, label: `×${value}` }))}
            value={speed}
            onChange={setSpeed}
          />
        </label>
      </div>

      <label className="block space-y-1.5">
        <span className="section-label">{t('form.notes')}</span>
        <Textarea
          rows={3}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder={t('form.notesPlaceholder')}
        />
      </label>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-3">
          <Switch checked={requireApproval} onCheckedChange={setRequireApproval} aria-label={t('form.approval')} />
          <span>
            <span className="block text-sm text-foreground">{t('form.approval')}</span>
            <span className="block text-[11px] text-muted-foreground">{t('form.approvalHint')}</span>
          </span>
        </label>
        <Button type="submit" disabled={submitting || !channelId}>
          <Rocket className="size-4" />
          {submitting ? t('form.submitting') : t('form.submit')}
        </Button>
      </div>
    </form>
  )
}
