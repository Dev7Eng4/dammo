import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Clapperboard } from 'lucide-react';
import {
  fetchProductionCharacters,
  fetchProductionMetadata,
  fetchProductionScenes,
  fetchProductionTranscript,
  fetchProductionVideos,
} from '../api/videoProduction';
import { PageHeader, PageShell } from '../components/layout';
import { VideoProductionDetailPanel } from '../components/video-production/VideoProductionDetailPanel';
import { VideoProductionList } from '../components/video-production/VideoProductionList';
import { PRODUCTION_METADATA_FORM_ID } from '../components/video-production/MetadataPanel';
import {
  VideoProductionToolbar,
} from '../components/video-production/VideoProductionToolbar';
import { RegenerateScenesConfirmModal } from '../components/video-production/RegenerateScenesConfirmModal';
import { RegenerateMetadataConfirmModal } from '../components/youtube-channels/RegenerateMetadataConfirmModal';
import { Button, useToast } from '../components/ui';
import { useAbortableEffect, useTaskQueue } from '../hooks';
import type { CreateVideoTaskPayload } from '../types/taskQueue';
import {
  productionVideoKey,
  type ProductionCharactersResponse,
  type ProductionMetadataResponse,
  type ProductionScenesResponse,
  type ProductionTranscriptResponse,
  type ProductionVideoListItem,
} from '../types/videoProductionScenes';

function isRegenerateMetadataJobForVideo(
  payload: CreateVideoTaskPayload | undefined,
  channelId: string,
  videoId: string,
): boolean {
  if (!payload || payload.regenerateMetadata !== true) return false;
  if (payload.channelId !== channelId) return false;
  return Boolean(payload.videoIds?.includes(videoId));
}

function isRegenerateScenesJobForVideo(
  payload: CreateVideoTaskPayload | undefined,
  channelId: string,
  videoId: string,
): boolean {
  if (!payload || payload.regenerateScenes !== true) return false;
  if (payload.channelId !== channelId) return false;
  return Boolean(payload.videoIds?.includes(videoId));
}

function withCacheBust(url: string | null, version: number): string | null {
  if (!url) return null;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}v=${version}`;
}

function withSceneCacheBust(data: ProductionScenesResponse): ProductionScenesResponse {
  const bust = Date.now();
  return {
    ...data,
    scenes: data.scenes.map((scene) => ({
      ...scene,
      imageUrl: withCacheBust(scene.imageUrl, bust),
    })),
  };
}

export function VideoProductionPage() {
  const { t } = useTranslation('factory');
  const toast = useToast();
  const { jobs, enqueueTask } = useTaskQueue();
  const [searchParams, setSearchParams] = useSearchParams();
  const mountedRef = useRef(true);

  const [videos, setVideos] = useState<ProductionVideoListItem[]>([]);
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scenesData, setScenesData] = useState<ProductionScenesResponse | null>(null);
  const [scenesLoading, setScenesLoading] = useState(false);
  const [scenesError, setScenesError] = useState<string | null>(null);
  const [transcriptData, setTranscriptData] = useState<ProductionTranscriptResponse | null>(null);
  const [transcriptLoading, setTranscriptLoading] = useState(false);
  const [transcriptError, setTranscriptError] = useState<string | null>(null);
  const [charactersData, setCharactersData] = useState<ProductionCharactersResponse | null>(null);
  const [charactersLoading, setCharactersLoading] = useState(false);
  const [charactersError, setCharactersError] = useState<string | null>(null);
  const [metadataData, setMetadataData] = useState<ProductionMetadataResponse | null>(null);
  const [metadataLoading, setMetadataLoading] = useState(false);
  const [metadataError, setMetadataError] = useState<string | null>(null);
  const [metadataCanSave, setMetadataCanSave] = useState(false);
  const [metadataSaving, setMetadataSaving] = useState(false);
  const [selectedSceneIndex, setSelectedSceneIndex] = useState<number | null>(null);
  const [confirmRegenerateOpen, setConfirmRegenerateOpen] = useState(false);
  const [enqueueingRegenerate, setEnqueueingRegenerate] = useState(false);
  const [confirmRegenerateScenesOpen, setConfirmRegenerateScenesOpen] = useState(false);
  const [enqueueingRegenerateScenes, setEnqueueingRegenerateScenes] = useState(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useAbortableEffect(async (signal) => {
    setLoading(true);
    setError(null);
    try {
      const items = await fetchProductionVideos({ signal });
      setVideos(items);
      setSelectedChannelId((current) => {
        if (current && items.some((item) => item.channelId === current)) {
          return current;
        }
        return null;
      });
      setSelectedKey((current) => {
        if (current && items.some((item) => productionVideoKey(item) === current)) {
          return current;
        }
        return null;
      });
    } catch (err) {
      if (signal.aborted) return;
      setError(err instanceof Error ? err.message : t('production.loadVideosError'));
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, []);

  const channels = useMemo(() => {
    const map = new Map<string, { id: string; name: string; videoCount: number }>();
    for (const video of videos) {
      const existing = map.get(video.channelId);
      if (existing) {
        existing.videoCount += 1;
      } else {
        map.set(video.channelId, {
          id: video.channelId,
          name: video.channelName,
          videoCount: 1,
        });
      }
    }
    return [...map.values()].sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
    );
  }, [videos]);

  useEffect(() => {
    const channelIdFromQuery = searchParams.get('channelId')?.trim() ?? '';
    if (!channelIdFromQuery || loading) return;

    if (channels.some((channel) => channel.id === channelIdFromQuery)) {
      setSelectedChannelId(channelIdFromQuery);
      setSelectedKey(null);
    }

    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('channelId');
    setSearchParams(nextParams, { replace: true });
  }, [loading, channels, searchParams, setSearchParams]);

  const filteredVideos = useMemo(() => {
    if (!selectedChannelId) return [];
    return videos.filter((video) => video.channelId === selectedChannelId);
  }, [videos, selectedChannelId]);

  const selectedVideo = useMemo(
    () => videos.find((video) => productionVideoKey(video) === selectedKey) ?? null,
    [videos, selectedKey],
  );

  const regenerateInProgress = Boolean(
    selectedVideo &&
      jobs.some(
        (job) =>
          (job.status === 'queued' || job.status === 'running') &&
          isRegenerateMetadataJobForVideo(
            job.payload as CreateVideoTaskPayload,
            selectedVideo.channelId,
            selectedVideo.videoId,
          ),
      ),
  );

  const regenerateScenesInProgress = Boolean(
    selectedVideo &&
      jobs.some(
        (job) =>
          (job.status === 'queued' || job.status === 'running') &&
          isRegenerateScenesJobForVideo(
            job.payload as CreateVideoTaskPayload,
            selectedVideo.channelId,
            selectedVideo.videoId,
          ),
      ),
  );

  const toolbarBusy =
    metadataLoading ||
    metadataSaving ||
    enqueueingRegenerate ||
    regenerateInProgress ||
    enqueueingRegenerateScenes ||
    regenerateScenesInProgress;

  useAbortableEffect(
    async (signal) => {
      if (!selectedVideo) {
        setScenesData(null);
        setScenesError(null);
        setTranscriptData(null);
        setTranscriptError(null);
        setCharactersData(null);
        setCharactersError(null);
        setMetadataData(null);
        setMetadataError(null);
        setSelectedSceneIndex(null);
        return;
      }

      const { channelId, videoId } = selectedVideo;

      setScenesLoading(true);
      setScenesError(null);
      setTranscriptLoading(true);
      setTranscriptError(null);
      setCharactersLoading(true);
      setCharactersError(null);
      setMetadataLoading(true);
      setMetadataError(null);
      setSelectedSceneIndex(null);

      const scenesPromise = fetchProductionScenes(channelId, videoId, { signal })
        .then((data) => {
          if (signal.aborted) return;
          setScenesData(data);
          setSelectedSceneIndex(data.scenes[0]?.index ?? null);
        })
        .catch((err) => {
          if (signal.aborted) return;
          setScenesData(null);
          setScenesError(err instanceof Error ? err.message : t('production.loadScenesError'));
        })
        .finally(() => {
          if (!signal.aborted) setScenesLoading(false);
        });

      const transcriptPromise = fetchProductionTranscript(channelId, videoId, { signal })
        .then((data) => {
          if (signal.aborted) return;
          setTranscriptData(data);
        })
        .catch((err) => {
          if (signal.aborted) return;
          setTranscriptData(null);
          setTranscriptError(
            err instanceof Error ? err.message : t('production.loadTranscriptError'),
          );
        })
        .finally(() => {
          if (!signal.aborted) setTranscriptLoading(false);
        });

      const charactersPromise = fetchProductionCharacters(channelId, videoId, { signal })
        .then((data) => {
          if (signal.aborted) return;
          setCharactersData(data);
        })
        .catch((err) => {
          if (signal.aborted) return;
          setCharactersData(null);
          setCharactersError(
            err instanceof Error ? err.message : t('production.loadCharactersError'),
          );
        })
        .finally(() => {
          if (!signal.aborted) setCharactersLoading(false);
        });

      const metadataPromise = fetchProductionMetadata(channelId, videoId, { signal })
        .then((data) => {
          if (signal.aborted) return;
          setMetadataData(data);
        })
        .catch((err) => {
          if (signal.aborted) return;
          setMetadataData(null);
          setMetadataError(
            err instanceof Error ? err.message : t('production.loadMetadataError'),
          );
        })
        .finally(() => {
          if (!signal.aborted) setMetadataLoading(false);
        });

      await Promise.all([scenesPromise, transcriptPromise, charactersPromise, metadataPromise]);
    },
    [selectedVideo?.channelId, selectedVideo?.videoId],
  );

  function clearDetailState() {
    setScenesData(null);
    setScenesError(null);
    setTranscriptData(null);
    setTranscriptError(null);
    setCharactersData(null);
    setCharactersError(null);
    setMetadataData(null);
    setMetadataError(null);
    setSelectedSceneIndex(null);
  }

  function handleChannelChange(channelId: string | null) {
    setSelectedChannelId(channelId);
    setSelectedKey(null);
    clearDetailState();
  }

  function handleSelectVideo(video: ProductionVideoListItem) {
    setSelectedKey(productionVideoKey(video));
  }

  function handleMetadataSaved(metadata: ProductionMetadataResponse) {
    setMetadataData(metadata);
    setVideos((current) =>
      current.map((video) => {
        if (video.channelId !== metadata.channelId || video.videoId !== metadata.videoId) {
          return video;
        }
        return {
          ...video,
          title: metadata.title || video.title,
          thumbnailUrl: metadata.thumbnailUrl,
        };
      }),
    );
  }

  function handleScenesUpdated(data: ProductionScenesResponse) {
    setScenesData(data);
    setScenesError(null);
  }

  function handleMetadataSaveStateChange(state: { canSave: boolean; saving: boolean }) {
    setMetadataCanSave(state.canSave);
    setMetadataSaving(state.saving);
  }

  async function reloadMetadataAfterRegen(channelId: string, videoId: string) {
    const metadata = await fetchProductionMetadata(channelId, videoId);
    if (!mountedRef.current) return;
    handleMetadataSaved({
      ...metadata,
      thumbnailUrl: withCacheBust(metadata.thumbnailUrl, Date.now()),
    });
  }

  async function handleConfirmRegenerate() {
    if (!selectedVideo || toolbarBusy) return;

    const { channelId, videoId, title } = selectedVideo;
    setEnqueueingRegenerate(true);
    try {
      await enqueueTask(
        {
          type: 'create_video',
          title: t('production.metadata.regenJobTitle', { title: title || videoId }),
          subtitle: videoId,
          payload: {
            channelId,
            videoIds: [videoId],
            regenerateMetadata: true,
          },
        },
        {
          onComplete: () => {
            void reloadMetadataAfterRegen(channelId, videoId)
              .then(() => {
                if (mountedRef.current) toast.success(t('production.metadata.regenSuccess'));
              })
              .catch((err) => {
                const message =
                  err instanceof Error ? err.message : t('production.metadata.regenReloadError');
                toast.error(message);
              });
          },
          onFail: (job) => {
            toast.error(job.error ?? t('production.metadata.regenFailed'));
          },
        },
      );
      setConfirmRegenerateOpen(false);
      toast.success(t('production.metadata.regenQueued'));
    } catch {
      // enqueueTask already toasts
    } finally {
      setEnqueueingRegenerate(false);
    }
  }

  async function reloadScenesAfterRegen(channelId: string, videoId: string) {
    const [scenes, characters] = await Promise.all([
      fetchProductionScenes(channelId, videoId),
      fetchProductionCharacters(channelId, videoId),
    ]);
    if (!mountedRef.current) return;
    const busted = withSceneCacheBust(scenes);
    setScenesData(busted);
    setScenesError(null);
    setSelectedSceneIndex(busted.scenes[0]?.index ?? null);
    setCharactersData(characters);
    setCharactersError(null);
  }

  async function handleConfirmRegenerateScenes() {
    if (!selectedVideo || toolbarBusy) return;

    const { channelId, videoId, title } = selectedVideo;
    setEnqueueingRegenerateScenes(true);
    try {
      await enqueueTask(
        {
          type: 'create_video',
          title: t('production.scenes.regenJobTitle', { title: title || videoId }),
          subtitle: videoId,
          payload: {
            channelId,
            videoIds: [videoId],
            regenerateScenes: true,
          },
        },
        {
          onComplete: () => {
            void reloadScenesAfterRegen(channelId, videoId)
              .then(() => {
                if (mountedRef.current) toast.success(t('production.scenes.regenSuccess'));
              })
              .catch((err) => {
                const message =
                  err instanceof Error ? err.message : t('production.scenes.regenReloadError');
                toast.error(message);
              });
          },
          onFail: (job) => {
            toast.error(job.error ?? t('production.scenes.regenFailed'));
          },
        },
      );
      setConfirmRegenerateScenesOpen(false);
      toast.success(t('production.scenes.regenQueued'));
    } catch {
      // enqueueTask already toasts
    } finally {
      setEnqueueingRegenerateScenes(false);
    }
  }

  if (error) {
    return (
      <PageShell>
        <div className="card-surface p-6 text-center">
          <p className="text-danger">{error}</p>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell fullBleed>
      <div className="shrink-0">
        <PageHeader
          title={t('production.page.title')}
          subtitle={t('production.page.subtitle')}
          icon={Clapperboard}
          className="mb-4"
        />
        <div className="border-b border-border pb-4">
          <VideoProductionToolbar
            channels={channels}
            selectedChannelId={selectedChannelId}
            onChannelChange={handleChannelChange}
            total={filteredVideos.length}
            channelLoading={loading}
            trailing={
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outlined"
                  disabled={!selectedVideo || toolbarBusy}
                  onClick={() => setConfirmRegenerateScenesOpen(true)}
                >
                  {regenerateScenesInProgress
                    ? t('production.scenes.regenerating')
                    : t('production.scenes.regenerate')}
                </Button>
                <Button
                  type="button"
                  variant="outlined"
                  disabled={!selectedVideo || toolbarBusy || !metadataData}
                  onClick={() => setConfirmRegenerateOpen(true)}
                >
                  {regenerateInProgress
                    ? t('production.metadata.regenerating')
                    : t('production.metadata.regenerate')}
                </Button>
                <Button
                  type="submit"
                  form={PRODUCTION_METADATA_FORM_ID}
                  disabled={!selectedVideo || !metadataCanSave || toolbarBusy}
                >
                  {metadataSaving ? t('production.metadata.saving') : t('production.metadata.save')}
                </Button>
              </div>
            }
          />
        </div>
      </div>

      <div className="mt-4 flex min-h-0 flex-1 flex-col overflow-hidden md:flex-row">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden card-surface px-2 pt-2 pb-2 sm:px-3 md:max-w-sm lg:max-w-md xl:max-w-lg">
          <div className="min-h-0 flex-1 overflow-auto">
            <VideoProductionList
              videos={filteredVideos}
              selectedKey={selectedKey}
              loading={loading}
              hasChannel={Boolean(selectedChannelId)}
              onSelect={handleSelectVideo}
            />
          </div>
        </div>

        <div className="mt-3 flex min-h-0 min-w-0 flex-1 overflow-hidden md:mt-0">
          <VideoProductionDetailPanel
            video={selectedVideo}
            scenesData={scenesData}
            scenesLoading={scenesLoading}
            scenesError={scenesError}
            transcriptData={transcriptData}
            transcriptLoading={transcriptLoading}
            transcriptError={transcriptError}
            charactersData={charactersData}
            charactersLoading={charactersLoading}
            charactersError={charactersError}
            metadataData={metadataData}
            metadataLoading={metadataLoading}
            metadataError={metadataError}
            selectedSceneIndex={selectedSceneIndex}
            onSelectScene={setSelectedSceneIndex}
            onScenesUpdated={handleScenesUpdated}
            onMetadataSaved={handleMetadataSaved}
            onMetadataSaveStateChange={handleMetadataSaveStateChange}
          />
        </div>
      </div>

      <RegenerateMetadataConfirmModal
        open={confirmRegenerateOpen}
        regenerating={enqueueingRegenerate}
        onClose={() => setConfirmRegenerateOpen(false)}
        onConfirm={() => void handleConfirmRegenerate()}
      />
      <RegenerateScenesConfirmModal
        open={confirmRegenerateScenesOpen}
        regenerating={enqueueingRegenerateScenes}
        onClose={() => setConfirmRegenerateScenesOpen(false)}
        onConfirm={() => void handleConfirmRegenerateScenes()}
      />
    </PageShell>
  );
}
