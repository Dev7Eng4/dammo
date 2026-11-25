import { useEffect, useState } from 'react';
import {
  channelVideoSceneClipUrl,
  channelVideoSceneImageUrl,
  fetchChannelVideoMotion,
  generateChannelVideoClips,
  removeChannelVideoClip,
  replaceChannelVideoClip,
  type ChannelVideoMotionState,
} from '../../api/videoProduction';
import { useAbortableEffect } from '../../hooks';
import { cn } from '../../lib/cn';
import { MotionStep } from '../manual-video/MotionStep';
import { useToast } from '../ui';
import { useTranslation } from 'react-i18next';

const POLL_MS = 4000;

interface ChannelVideoMotionStepProps {
  channelId: string;
  videoId: string;
}

/**
 * "Ảnh → video" tab of a prepared/created channel video: same picker as a manual project
 * (intro / every scene / hand-picked), clips made through Google Flow in the background.
 */
export function ChannelVideoMotionStep({ channelId, videoId }: ChannelVideoMotionStepProps) {
  const { t } = useTranslation('manual');
  const { toast } = useToast();
  const [state, setState] = useState<ChannelVideoMotionState | null>(null);
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);

  useAbortableEffect(
    async (signal) => {
      const next = await fetchChannelVideoMotion(channelId, videoId, { signal });
      if (!signal.aborted) setState(next);
    },
    [channelId, videoId, reload],
  );

  const running = state?.job?.status === 'running';

  // Poll while clips are being made; the list reloads once the job ends.
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => {
      void fetchChannelVideoMotion(channelId, videoId)
        .then((next) => {
          setState(next);
          if (next.job?.status === 'done' && next.job.message) toast.success(next.job.message);
          if (next.job?.status === 'failed' && next.job.error) toast.error(next.job.error);
        })
        .catch(() => undefined);
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [running, channelId, videoId, toast]);

  async function act(action: () => Promise<ChannelVideoMotionState>) {
    setBusy(true);
    try {
      setState(await action());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  if (!state) return <div className="m-4 h-24 animate-pulse rounded-lg bg-muted" />;

  const job = state.job;
  const reloadKey = `${channelId}-${videoId}-${reload}-${running ? 'run' : 'idle'}-${state.scenes.map((s) => s.clipVersion).join('.')}`;

  return (
    <div className="space-y-3 px-4 py-4">
      {job?.message || job?.error ? (
        <p className={cn('text-xs', job.status === 'failed' ? 'text-danger' : job.status === 'running' ? 'text-info' : 'text-muted-foreground')}>
          {job.status === 'failed' ? job.error : job.message}
        </p>
      ) : null}
      <MotionStep
        loadScenes={async () => state.scenes}
        imageUrl={(scene) => channelVideoSceneImageUrl(channelId, videoId, scene)}
        clipUrl={(scene) => channelVideoSceneClipUrl(channelId, videoId, scene)}
        reloadKey={reloadKey}
        motionDefault={state.motionDefault === 'scenes' ? 'intro' : state.motionDefault}
        working={running}
        disabled={busy || running}
        onGenerate={(mode, indexes) => void act(() => generateChannelVideoClips(channelId, videoId, mode, indexes))}
        onRemove={(index) =>
          void act(async () => {
            const next = await removeChannelVideoClip(channelId, videoId, index);
            setReload((value) => value + 1);
            return next;
          })
        }
        onReplace={(index, file) =>
          void act(async () => {
            const next = await replaceChannelVideoClip(channelId, videoId, index, file);
            toast.success(t('motion.replaced', { index: index + 1 }));
            setReload((value) => value + 1);
            return next;
          })
        }
      />
    </div>
  );
}
