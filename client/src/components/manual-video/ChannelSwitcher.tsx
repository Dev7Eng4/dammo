import { AlertTriangle, Check, Pencil, X } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { setManualChannel } from '../../api/manualVideo'
import { fetchYoutubeChannels } from '../../api/youtubeChannels'
import { useAbortableEffect } from '../../hooks'
import type { VideoAgentRun } from '../../types/videoAgent'
import type { YoutubeChannel } from '../../types/youtubeChannel'
import { Button, Select, useToast } from '../ui'

interface ChannelSwitcherProps {
  run: VideoAgentRun
  disabled: boolean
}

/** The project's target channel, with a warning when it cannot draw scenes and a way to switch it. */
export function ChannelSwitcher({ run, disabled }: ChannelSwitcherProps) {
  const { t } = useTranslation('manual')
  const { toast } = useToast()
  const [channels, setChannels] = useState<YoutubeChannel[] | null>(null)
  const [editing, setEditing] = useState(false)
  const [choice, setChoice] = useState(run.input.channelId)
  const [saving, setSaving] = useState(false)

  useAbortableEffect(async (signal) => {
    const res = await fetchYoutubeChannels('all', 'all', '', 1, 100, { signal })
    setChannels(res.items.filter((channel) => channel.type === 'reup_audio'))
  }, [])

  const current = channels?.find((channel) => channel.id === run.input.channelId)
  const missingStyle = current !== undefined && !current.reupAudioVisualStyleId
  const options = (channels ?? []).map((channel) => ({
    value: channel.id,
    label: channel.reupAudioVisualStyleId ? channel.name : `${channel.name} (${t('form.noVisualStyle')})`,
  }))

  async function save() {
    if (choice === run.input.channelId) {
      setEditing(false)
      return
    }
    if (run.stagesDone.includes('scenes') && !window.confirm(t('channel.scenesConfirm'))) return
    setSaving(true)
    try {
      await setManualChannel(run.id, choice)
      setEditing(false)
      toast.success(t('channel.changed'))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  if (editing) {
    return (
      <span className="flex flex-wrap items-center gap-1.5">
        <Select className="min-w-56" options={options} value={choice} onChange={setChoice} searchable />
        <Button size="sm" disabled={saving} onClick={() => void save()}>
          <Check className="size-3.5" />
          {t('channel.save')}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setChoice(run.input.channelId)
            setEditing(false)
          }}
        >
          <X className="size-3.5" />
        </Button>
      </span>
    )
  }

  return (
    <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
      <span>{run.channelName}</span>
      {missingStyle ? (
        <span className="flex items-center gap-1 text-warning">
          <AlertTriangle className="size-3.5" />
          {t('channel.noStyle')}
        </span>
      ) : null}
      <button
        type="button"
        disabled={disabled || channels === null}
        onClick={() => setEditing(true)}
        className="flex items-center gap-1 rounded px-1 text-info hover:underline disabled:opacity-50"
      >
        <Pencil className="size-3" />
        {t('channel.change')}
      </button>
    </span>
  )
}
