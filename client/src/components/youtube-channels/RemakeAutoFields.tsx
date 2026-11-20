import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Controller, type Control } from 'react-hook-form';
import { fetchRemakePromptSets, type RemakePromptSet } from '../../api/scriptRemake';
import { fetchVoiceSettings } from '../../api/voice';
import { useAbortableEffect } from '../../hooks';
import type { AddYoutubeChannelFormValues } from '../../types/youtubeChannel';
import type { VoicevoxVoicePreset } from '../../types/voice';
import { Select } from '../ui';

const SPEEDS = ['0.8', '0.9', '1', '1.1', '1.2', '1.3'];

interface RemakeAutoFieldsProps {
  control: Control<AddYoutubeChannelFormValues>;
  enabled: boolean;
  disabled: boolean;
  /** Edit mode: puts prompt sets made for this channel's niche first. */
  channelId?: string;
  selectTriggerClass: string;
}

/**
 * Remake channels: what "Chuẩn bị video" / "Tạo video" does before metadata and scenes — remake the
 * source transcript into a new script and read it with VOICEVOX. Empty choices follow Settings.
 */
export function RemakeAutoFields({ control, enabled, disabled, channelId, selectTriggerClass }: RemakeAutoFieldsProps) {
  const { t } = useTranslation('youtube');
  const [promptSets, setPromptSets] = useState<RemakePromptSet[]>([]);
  const [voices, setVoices] = useState<VoicevoxVoicePreset[]>([]);
  const [defaultVoiceName, setDefaultVoiceName] = useState<string | null>(null);

  useAbortableEffect(
    async signal => {
      const [sets, voice] = await Promise.allSettled([
        fetchRemakePromptSets('ja', { signal }, channelId),
        fetchVoiceSettings({ signal }),
      ]);
      if (signal.aborted) return;
      if (sets.status === 'fulfilled') setPromptSets(sets.value.items);
      if (voice.status === 'fulfilled') {
        const { presets, defaultPresetId, effectiveDefaultSpeaker } = voice.value.item.voicevox;
        setVoices(presets);
        setDefaultVoiceName(presets.find(p => p.id === defaultPresetId)?.name ?? `speaker ${effectiveDefaultSpeaker}`);
      }
    },
    [channelId],
  );

  const providerOptions = [
    { value: '', label: t('form.remakeAuto.providerDefault') },
    { value: 'gpt', label: 'ChatGPT' },
    { value: 'gemini', label: 'Gemini' },
    { value: 'claude', label: 'Claude' },
  ];
  const promptSetOptions = [
    { value: '', label: t('form.remakeAuto.promptSetDefault', { name: promptSets[0]?.name ?? '—' }) },
    ...promptSets.map(set => ({ value: set.id, label: set.name })),
  ];
  const voiceOptions = [
    { value: '', label: t('form.remakeAuto.voiceDefault', { name: defaultVoiceName ?? '—' }) },
    ...voices.map(voice => ({ value: voice.id, label: `${voice.name} · ${voice.speakerName}` })),
  ];
  const speedOptions = SPEEDS.map(speed => ({ value: speed, label: `×${speed}` }));
  const off = disabled || !enabled;

  return (
    <div className='min-w-0 space-y-3 rounded-lg border border-border p-3 sm:col-span-2 lg:col-span-3'>
      <Controller
        name='remakeAutoEnabled'
        control={control}
        render={({ field }) => (
          <label htmlFor='remake-auto-enabled' className='flex cursor-pointer items-start gap-2 text-sm text-neutral-200'>
            <input
              id='remake-auto-enabled'
              type='checkbox'
              checked={field.value}
              onChange={e => field.onChange(e.target.checked)}
              onBlur={field.onBlur}
              disabled={disabled}
              className='mt-0.5 h-4 w-4 rounded border-neutral-600 bg-neutral-900'
            />
            <span>
              <span className='font-medium'>{t('form.remakeAuto.label')}</span>
              <span className='block text-[11px] text-muted-foreground'>{t('form.remakeAuto.hint')}</span>
            </span>
          </label>
        )}
      />
      <div className='grid gap-3 sm:grid-cols-2 lg:grid-cols-4'>
        <label className='min-w-0 space-y-1 text-xs text-muted-foreground'>
          <span>{t('form.remakeAuto.provider')}</span>
          <Controller
            name='remakeProvider'
            control={control}
            render={({ field }) => (
              <Select options={providerOptions} value={field.value} onChange={field.onChange} disabled={off} className='w-full' triggerClassName={selectTriggerClass} />
            )}
          />
        </label>
        <label className='min-w-0 space-y-1 text-xs text-muted-foreground'>
          <span>{t('form.remakeAuto.promptSet')}</span>
          <Controller
            name='remakePromptSetId'
            control={control}
            render={({ field }) => (
              <Select options={promptSetOptions} value={field.value} onChange={field.onChange} disabled={off} className='w-full' triggerClassName={selectTriggerClass} />
            )}
          />
        </label>
        <label className='min-w-0 space-y-1 text-xs text-muted-foreground'>
          <span>{t('form.remakeAuto.voice')}</span>
          <Controller
            name='remakeVoicePresetId'
            control={control}
            render={({ field }) => (
              <Select options={voiceOptions} value={field.value} onChange={field.onChange} disabled={off} className='w-full' triggerClassName={selectTriggerClass} />
            )}
          />
        </label>
        <label className='min-w-0 space-y-1 text-xs text-muted-foreground'>
          <span>{t('form.remakeAuto.speed')}</span>
          <Controller
            name='remakeSpeedScale'
            control={control}
            render={({ field }) => (
              <Select options={speedOptions} value={field.value} onChange={field.onChange} disabled={off} className='w-full' triggerClassName={selectTriggerClass} />
            )}
          />
        </label>
      </div>
    </div>
  );
}
