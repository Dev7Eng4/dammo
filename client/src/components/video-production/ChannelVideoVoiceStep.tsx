import { Mic } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchVoicevoxStatus } from '../../api/videoAgent';
import { fetchVoiceSettings } from '../../api/voice';
import {
  fetchChannelVideoScript,
  productionAudioUrl,
  startChannelVideoVoice,
  type ChannelVideoScript,
} from '../../api/videoProduction';
import { useAbortableEffect } from '../../hooks';
import type { VoicevoxStatus } from '../../types/videoAgent';
import type { VoicevoxVoicePreset } from '../../types/voice';
import { Button, Select, useToast } from '../ui';
import { ReadingChecksPanel } from './ReadingChecksPanel';

const SPEED_OPTIONS = ['0.8', '0.9', '0.95', '1', '1.05', '1.1', '1.2'];
const POLL_MS = 2000;
const PRESET_PREFIX = 'preset:';
const SPEAKER_PREFIX = 'speaker:';

/** Speed as shown in the select: at most two decimals, no trailing zeros. */
function speedText(value: number): string {
  return String(Number(value.toFixed(2)));
}

/** "青山龍星 — ノーマル (#13)" → "青山龍星", to skip repeating the speaker when the preset name already says it. */
function speakerBase(speakerName: string): string {
  return speakerName.split(/\s+[—-]\s+/)[0]?.trim() ?? '';
}

function formatDuration(sec?: number): string {
  if (!sec) return '';
  return `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`;
}

interface ChannelVideoVoiceStepProps {
  channelId: string;
  videoId: string;
  /** Remake channels read their script with VOICEVOX; others only play the source audio. */
  remake: boolean;
  /** Called after a narration finished, so the transcript and scenes can be reloaded. */
  onVoiced?: () => void;
}

export function ChannelVideoVoiceStep({ channelId, videoId, remake, onVoiced }: ChannelVideoVoiceStepProps) {
  const { t } = useTranslation('manual');
  const { toast } = useToast();
  const [script, setScript] = useState<ChannelVideoScript | null>(null);
  const [voicevox, setVoicevox] = useState<VoicevoxStatus | null>(null);
  const [presets, setPresets] = useState<VoicevoxVoicePreset[] | null>(null);
  const [defaultPresetId, setDefaultPresetId] = useState<string | null>(null);
  /** `preset:<id>` for a saved voice, `speaker:<styleId>` for a bare VOICEVOX speaker. */
  const [choice, setChoice] = useState('');
  /** For a saved voice: the reading speed itself (prefilled from the voice). For a bare speaker: ×speed. */
  const [speed, setSpeed] = useState('1');
  const [busy, setBusy] = useState(false);
  const initializedFor = useRef('');

  useAbortableEffect(
    async (signal) => {
      initializedFor.current = '';
      setScript(null);
      setScript(await fetchChannelVideoScript(channelId, videoId, { signal }));
    },
    [channelId, videoId],
  );

  useAbortableEffect(
    async (signal) => {
      if (!remake) return;
      const [status, settings] = await Promise.all([
        fetchVoicevoxStatus({ signal }),
        fetchVoiceSettings({ signal }).catch(() => null),
      ]);
      setVoicevox(status);
      setPresets(settings?.item.voicevox.presets ?? []);
      setDefaultPresetId(settings?.item.voicevox.defaultPresetId ?? null);
    },
    [remake],
  );

  /** Default saved voice first, the rest in the order of Settings. */
  const orderedPresets = useMemo(() => {
    const list = presets ?? [];
    const first = list.find((p) => p.id === defaultPresetId);
    return first ? [first, ...list.filter((p) => p !== first)] : list;
  }, [presets, defaultPresetId]);

  // Pick the voice once the video and the voice list are known: the voice this video was read with,
  // else the default saved voice, else the engine's default speaker.
  useEffect(() => {
    const key = `${channelId}/${videoId}`;
    if (!remake || !script || !voicevox || presets === null || initializedFor.current === key) return;
    initializedFor.current = key;
    const used = script.voice;
    const usedPreset = used?.presetId ? orderedPresets.find((p) => p.id === used.presetId) : undefined;
    if (used && usedPreset) {
      setChoice(PRESET_PREFIX + usedPreset.id);
      setSpeed(speedText(usedPreset.speedScale * used.speedScale));
    } else if (used) {
      setChoice(SPEAKER_PREFIX + used.speaker);
      setSpeed(speedText(used.speedScale));
    } else if (orderedPresets[0]) {
      setChoice(PRESET_PREFIX + orderedPresets[0].id);
      setSpeed(speedText(orderedPresets[0].speedScale));
    } else {
      setChoice(SPEAKER_PREFIX + voicevox.defaultSpeaker);
      setSpeed('1');
    }
  }, [remake, script, voicevox, presets, orderedPresets, channelId, videoId]);

  const selectedPreset = choice.startsWith(PRESET_PREFIX)
    ? orderedPresets.find((p) => p.id === choice.slice(PRESET_PREFIX.length))
    : undefined;

  const running = script?.voiceJob?.status === 'running';
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => {
      void fetchChannelVideoScript(channelId, videoId)
        .then((next) => {
          setScript(next);
          if (next.voiceJob?.status === 'done') {
            toast.success(t('channelVideo.voice.done'));
            onVoiced?.();
          } else if (next.voiceJob?.status === 'failed') {
            toast.error(next.voiceJob.error ?? t('channelVideo.voice.failed'));
          }
        })
        .catch(() => undefined);
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [running, channelId, videoId, onVoiced, t, toast]);

  const voiceOptions = useMemo(() => {
    const saved = orderedPresets.map((p) => {
      const base = speakerBase(p.speakerName);
      const parts = [p.name];
      if (!base || !p.name.includes(base)) parts.push(p.speakerName);
      parts.push(`×${speedText(p.speedScale)}`);
      const mark = p.id === defaultPresetId ? ` (${t('channelVideo.voice.defaultMark')})` : '';
      return { value: PRESET_PREFIX + p.id, label: parts.join(' · ') + mark, group: t('channelVideo.voice.groupPresets') };
    });
    const speakers = (voicevox?.speakers ?? []).flatMap((s) =>
      s.styles.map((style) => ({
        value: SPEAKER_PREFIX + style.id,
        label: `${s.name} · ${style.name} (#${style.id})`,
        ...(saved.length ? { group: t('channelVideo.voice.groupSpeakers') } : {}),
      })),
    );
    return [...saved, ...speakers];
  }, [orderedPresets, defaultPresetId, voicevox, t]);

  const speedOptions = useMemo(() => {
    const values = new Set(SPEED_OPTIONS);
    if (selectedPreset) values.add(speedText(selectedPreset.speedScale));
    if (speed) values.add(speed);
    return [...values].sort((a, b) => Number(a) - Number(b)).map((value) => ({ value, label: `×${value}` }));
  }, [selectedPreset, speed]);

  function changeVoice(next: string) {
    setChoice(next);
    const preset = next.startsWith(PRESET_PREFIX)
      ? orderedPresets.find((p) => p.id === next.slice(PRESET_PREFIX.length))
      : undefined;
    // A saved voice brings its own speed; a bare speaker starts at ×1.
    setSpeed(preset ? speedText(preset.speedScale) : '1');
  }

  async function run() {
    setBusy(true);
    try {
      // The server multiplies the saved voice's own speed by speedScale: send the ratio to the speed shown here.
      const body = selectedPreset
        ? {
            presetId: selectedPreset.id,
            speaker: selectedPreset.speaker,
            speedScale: Number((Number(speed) / selectedPreset.speedScale).toFixed(4)),
          }
        : { speaker: Number(choice.slice(SPEAKER_PREFIX.length)), speedScale: Number(speed) };
      setScript(await startChannelVideoVoice(channelId, videoId, body));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const audioVersion = script?.voice?.at ?? '';
  const hasScript = Boolean(script?.text.trim());

  return (
    <div className="space-y-4 px-4 py-4">
      {remake ? (
        <div className="space-y-3 rounded-lg border border-border p-3">
          <div>
            <p className="text-sm font-semibold text-foreground">{t('channelVideo.voice.title')}</p>
            <p className="text-xs text-muted-foreground">{t('channelVideo.voice.hint')}</p>
          </div>
          {voicevox && !voicevox.available ? (
            <p className="text-xs text-danger">{t('step.voice.unavailable', { url: voicevox.url })}</p>
          ) : null}
          <div className="grid gap-3 md:grid-cols-3">
            <label className="space-y-1.5 md:col-span-2">
              <span className="section-label">{t('form.voice')}</span>
              <Select options={voiceOptions} value={choice} onChange={changeVoice} searchable disabled={running} />
            </label>
            <label className="space-y-1.5">
              <span className="section-label">{t('form.speed')}</span>
              <Select
                options={speedOptions}
                value={speed}
                onChange={setSpeed}
                disabled={running}
              />
            </label>
          </div>
          {selectedPreset ? (
            <p className="text-xs text-muted-foreground">
              {t('channelVideo.voice.presetInfo', {
                speaker: selectedPreset.speakerName,
                pitch: selectedPreset.pitchScale,
                intonation: selectedPreset.intonationScale,
                volume: selectedPreset.volumeScale,
                pause: selectedPreset.pauseLengthScale,
                speed: `×${speedText(selectedPreset.speedScale)}`,
              })}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" disabled={busy || running || !hasScript || !voicevox?.available || !choice} onClick={() => void run()}>
              <Mic className="size-4" />
              {running
                ? t('channelVideo.voice.running', { progress: script?.voiceJob?.progress ?? '' })
                : script?.voice
                  ? t('step.voice.again')
                  : t('step.voice.run')}
            </Button>
            {!hasScript ? <span className="text-xs text-muted-foreground">{t('channelVideo.voice.needScript')}</span> : null}
          </div>
          {script?.voiceJob?.status === 'failed' ? <p className="text-xs text-danger">{script.voiceJob.error}</p> : null}
          {script?.voiceJob?.status === 'done' && script.voiceJob.notice ? (
            <p className="text-xs text-foreground">{script.voiceJob.notice}</p>
          ) : null}
          {script?.scenesStale ? (
            <p className="text-xs text-warning">
              {t('channelVideo.voice.scenesStale', { percent: script.scenesStale.matchedPercent })}
            </p>
          ) : script?.voice ? (
            <p className="text-xs text-muted-foreground">{t('channelVideo.voice.rescenes')}</p>
          ) : null}
        </div>
      ) : null}

      {remake && script?.readingChecks?.length ? <ReadingChecksPanel checks={script.readingChecks} /> : null}

      <div className="space-y-1.5">
        <span className="section-label">
          {remake && script?.voice
            ? t('channelVideo.voice.narration', { duration: formatDuration(script.voice.durationSec) })
            : t('channelVideo.voice.source')}
        </span>
        <audio
          key={audioVersion}
          className="w-full"
          controls
          preload="metadata"
          src={productionAudioUrl(channelId, videoId, audioVersion)}
        />
        {remake && script?.sourceReplaced ? (
          <p className="text-xs text-muted-foreground">{t('channelVideo.voice.sourceKept')}</p>
        ) : null}
      </div>
    </div>
  );
}
