import { FolderPlus, X } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { createManualProject } from '../../api/manualVideo'
import { fetchYoutubeChannels } from '../../api/youtubeChannels'
import { useAbortableEffect } from '../../hooks'
import type { VideoAgentRun, VoicevoxStatus } from '../../types/videoAgent'
import type { YoutubeChannel } from '../../types/youtubeChannel'
import { Button, Input, Select, Textarea, useToast } from '../ui'
import { VoicePreviewButton } from './VoicePreviewButton'

const SPEED_OPTIONS = ['0.9', '1', '1.1', '1.2']

interface NewProjectFormProps {
  voicevox: VoicevoxStatus | null
  onCreated: (run: VideoAgentRun) => void
  onClose: () => void
}

export function NewProjectForm({ voicevox, onCreated, onClose }: NewProjectFormProps) {
  const { t } = useTranslation('manual')
  const { toast } = useToast()
  const [channels, setChannels] = useState<YoutubeChannel[]>([])
  const [sources, setSources] = useState('')
  const [channelId, setChannelId] = useState('')
  const [speaker, setSpeaker] = useState('')
  const [speed, setSpeed] = useState('1')
  const [notes, setNotes] = useState('')
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
      const run = await createManualProject({
        sourceUrls,
        channelId,
        notes: notes.trim() || undefined,
        voicevoxSpeaker: speaker ? Number(speaker) : undefined,
        speedScale: Number(speed),
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
        <Button variant="ghost" size="sm" onClick={onClose} aria-label={t('form.close')}>
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
        <label className="block space-y-1.5">
          <span className="section-label">{t('form.speed')}</span>
          <Select
            options={SPEED_OPTIONS.map((value) => ({ value, label: `×${value}` }))}
            value={speed}
            onChange={setSpeed}
          />
        </label>
        <label className="block space-y-1.5 md:col-span-2">
          <span className="section-label">{t('form.voice')}</span>
          {voicevox?.available ? (
            <div className="flex items-center gap-2">
              <Select
                className="min-w-0 flex-1"
                options={speakerOptions}
                value={speaker || String(voicevox.defaultSpeaker)}
                onChange={setSpeaker}
                searchable
              />
              <VoicePreviewButton speaker={Number(speaker || voicevox.defaultSpeaker)} speed={Number(speed)} />
            </div>
          ) : (
            <Input disabled value={t('form.voiceUnavailable', { id: voicevox?.defaultSpeaker ?? '?' })} />
          )}
        </label>
      </div>

      <label className="block space-y-1.5">
        <span className="section-label">{t('form.notes')}</span>
        <Textarea
          rows={2}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder={t('form.notesPlaceholder')}
        />
      </label>

      <div className="flex justify-end">
        <Button type="submit" disabled={submitting || !channelId}>
          <FolderPlus className="size-4" />
          {submitting ? t('form.submitting') : t('form.submit')}
        </Button>
      </div>
    </form>
  )
}
