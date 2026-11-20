import { Mic } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchVoicevoxStatus } from '../../api/videoAgent';
import {
  fetchChannelVideoScript,
  productionAudioUrl,
  startChannelVideoVoice,
  type ChannelVideoScript,
} from '../../api/videoProduction';
import { useAbortableEffect } from '../../hooks';
import type { VoicevoxStatus } from '../../types/videoAgent';
import { Button, Select, useToast } from '../ui';

const SPEED_OPTIONS = ['0.9', '1', '1.1', '1.2'];
const POLL_MS = 2000;

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
  const [speaker, setSpeaker] = useState('');
  const [speed, setSpeed] = useState('1');
  const [busy, setBusy] = useState(false);

  useAbortableEffect(
    async (signal) => {
      const next = await fetchChannelVideoScript(channelId, videoId, { signal });
      setScript(next);
      if (next.voice) {
        setSpeaker(String(next.voice.speaker));
        setSpeed(String(next.voice.speedScale));
      }
    },
    [channelId, videoId],
  );

  useAbortableEffect(
    async (signal) => {
      if (!remake) return;
      const status = await fetchVoicevoxStatus({ signal });
      setVoicevox(status);
      setSpeaker((current) => current || String(status.defaultSpeaker));
    },
    [remake],
  );

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

  const speakerOptions = useMemo(
    () =>
      (voicevox?.speakers ?? []).flatMap((s) =>
        s.styles.map((style) => ({ value: String(style.id), label: `${s.name} · ${style.name} (#${style.id})` })),
      ),
    [voicevox],
  );

  async function run() {
    setBusy(true);
    try {
      setScript(await startChannelVideoVoice(channelId, videoId, { speaker: Number(speaker), speedScale: Number(speed) }));
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
              <Select options={speakerOptions} value={speaker} onChange={setSpeaker} searchable disabled={running} />
            </label>
            <label className="space-y-1.5">
              <span className="section-label">{t('form.speed')}</span>
              <Select
                options={SPEED_OPTIONS.map((value) => ({ value, label: `×${value}` }))}
                value={speed}
                onChange={setSpeed}
                disabled={running}
              />
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" disabled={busy || running || !hasScript || !voicevox?.available || !speaker} onClick={() => void run()}>
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
          {script?.voice ? (
            <p className="text-xs text-warning">{t('channelVideo.voice.rescenes')}</p>
          ) : null}
        </div>
      ) : null}

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
