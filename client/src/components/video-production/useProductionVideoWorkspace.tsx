import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  fetchProductionCharacters,
  fetchProductionMetadata,
  fetchProductionScenes,
  fetchProductionTranscript,
  regenerateMissingProductionSceneImages,
} from '../../api/videoProduction';
import { useAbortableEffect, useTaskQueue } from '../../hooks';
import type { CreateVideoTaskPayload } from '../../types/taskQueue';
import type {
  ProductionCharactersResponse,
  ProductionDetailTab,
  ProductionMetadataResponse,
  ProductionScenesResponse,
  ProductionTranscriptResponse,
  ProductionVideoListItem,
} from '../../types/videoProductionScenes';
import { RegenerateMetadataConfirmModal } from '../youtube-channels/RegenerateMetadataConfirmModal';
import { Button, useToast } from '../ui';
import { CreateVideoConfirmModal, CreateVideoErrorModal } from './CreateVideoModals';
import { PRODUCTION_METADATA_FORM_ID } from './MetadataPanel';
import { RegenerateScenesConfirmModal } from './RegenerateScenesConfirmModal';
import { VideoProductionDetailPanel } from './VideoProductionDetailPanel';

type JobFlag = 'regenerateMetadata' | 'assembleOnly' | 'regenerateScenes';

function isJobForVideo(
  payload: CreateVideoTaskPayload | undefined,
  flag: JobFlag,
  channelId: string,
  videoId: string,
): boolean {
  if (!payload || payload[flag] !== true) return false;
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

export type ProductionVideoPatch = Partial<Pick<ProductionVideoListItem, 'title' | 'thumbnailUrl' | 'status'>>;

export interface ProductionVideoWorkspace {
  /** Buttons for the selected video (copy path, regenerate, save metadata, create video); null when nothing is selected. */
  toolbarActions: ReactNode;
  /** Scenes / transcript / characters / metadata / video tabs. Fills its parent's height. */
  detailPanel: ReactNode;
  /** Confirmation and error dialogs; render once anywhere on the page. */
  modals: ReactNode;
  /** Switch the detail panel back to its first tab (call when the user picks another video). */
  resetTab: () => void;
}

/**
 * Everything needed to inspect and work on one prepared/created channel video (scenes, transcript,
 * characters, metadata, assembled video). Used by the Video production page to open channel videos.
 */
export function useProductionVideoWorkspace(
  selectedVideo: ProductionVideoListItem | null,
  onVideoPatched: (channelId: string, videoId: string, patch: ProductionVideoPatch) => void,
): ProductionVideoWorkspace {
  const { t } = useTranslation('factory');
  const { toast } = useToast();
  const { jobs, enqueueTask } = useTaskQueue();
  const mountedRef = useRef(true);

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
  const [activeTab, setActiveTab] = useState<ProductionDetailTab>('scenes');
  const [confirmCreateVideoOpen, setConfirmCreateVideoOpen] = useState(false);
  const [enqueueingCreateVideo, setEnqueueingCreateVideo] = useState(false);
  const [createVideoError, setCreateVideoError] = useState<string | null>(null);
  const [playbackVersion, setPlaybackVersion] = useState(0);
  const [regeneratingMissing, setRegeneratingMissing] = useState(false);
  /** Bumped when a remake narration replaced the audio, to reload transcript and scenes. */
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const jobRunning = (flag: JobFlag) =>
    Boolean(
      selectedVideo &&
        jobs.some(
          (job) =>
            (job.status === 'queued' || job.status === 'running') &&
            isJobForVideo(job.payload as CreateVideoTaskPayload, flag, selectedVideo.channelId, selectedVideo.videoId),
        ),
    );
  const regenerateInProgress = jobRunning('regenerateMetadata');
  const regenerateScenesInProgress = jobRunning('regenerateScenes');
  const assembleInProgress = jobRunning('assembleOnly');

  const toolbarBusy =
    metadataLoading ||
    metadataSaving ||
    enqueueingRegenerate ||
    regenerateInProgress ||
    enqueueingRegenerateScenes ||
    regenerateScenesInProgress ||
    enqueueingCreateVideo ||
    assembleInProgress;

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
          setTranscriptError(err instanceof Error ? err.message : t('production.loadTranscriptError'));
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
          setCharactersError(err instanceof Error ? err.message : t('production.loadCharactersError'));
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
          setMetadataError(err instanceof Error ? err.message : t('production.loadMetadataError'));
        })
        .finally(() => {
          if (!signal.aborted) setMetadataLoading(false);
        });

      await Promise.all([scenesPromise, transcriptPromise, charactersPromise, metadataPromise]);
    },
    [selectedVideo?.channelId, selectedVideo?.videoId, reloadKey],
  );

  function createVideoBlockReason(): string | null {
    if (scenesLoading) return t('production.createVideo.scenesLoading');
    if (scenesError || !scenesData) return t('production.createVideo.scenesLoadError');
    if (scenesData.scenes.length === 0) return t('production.createVideo.noScenes');
    const missing = scenesData.scenes.filter((scene) => !scene.imageUrl).map((scene) => scene.index + 1);
    if (missing.length > 0) {
      return t('production.createVideo.missingImages', { scenes: missing.join(', ') });
    }
    return null;
  }

  function handleCreateVideoClick() {
    if (!selectedVideo || toolbarBusy) return;
    const reason = createVideoBlockReason();
    if (reason) {
      setCreateVideoError(reason);
      return;
    }
    setConfirmCreateVideoOpen(true);
  }

  function handleMetadataSaved(metadata: ProductionMetadataResponse) {
    setMetadataData(metadata);
    onVideoPatched(metadata.channelId, metadata.videoId, {
      ...(metadata.title ? { title: metadata.title } : {}),
      thumbnailUrl: metadata.thumbnailUrl,
    });
  }

  const missingImageCount = scenesData ? scenesData.scenes.filter((scene) => !scene.imageUrl).length : 0;

  async function handleGenerateMissingImages() {
    if (!selectedVideo || !scenesData || regeneratingMissing || toolbarBusy) return;

    const { channelId, videoId } = selectedVideo;
    const missingIndexes = new Set(scenesData.scenes.filter((scene) => !scene.imageUrl).map((scene) => scene.index));
    const previousByIndex = new Map(scenesData.scenes.map((scene) => [scene.index, scene]));
    setRegeneratingMissing(true);
    try {
      const data = await regenerateMissingProductionSceneImages(channelId, videoId);
      if (!mountedRef.current) return;
      const bust = Date.now();
      setScenesData({
        ...data,
        scenes: data.scenes.map((scene) => {
          if (missingIndexes.has(scene.index)) {
            return { ...scene, imageUrl: withCacheBust(scene.imageUrl, bust) };
          }
          const previousUrl = previousByIndex.get(scene.index)?.imageUrl;
          return scene.imageUrl && previousUrl ? { ...scene, imageUrl: previousUrl } : scene;
        }),
      });
      setScenesError(null);
    } catch (err) {
      toast.error(err instanceof Error && err.message.trim() ? err.message : t('production.scene.generateMissingError'));
    } finally {
      if (mountedRef.current) setRegeneratingMissing(false);
    }
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
          payload: { channelId, videoIds: [videoId], regenerateMetadata: true },
        },
        {
          onComplete: () => {
            void reloadMetadataAfterRegen(channelId, videoId)
              .then(() => {
                if (mountedRef.current) toast.success(t('production.metadata.regenSuccess'));
              })
              .catch((err) => {
                toast.error(err instanceof Error ? err.message : t('production.metadata.regenReloadError'));
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
          payload: { channelId, videoIds: [videoId], regenerateScenes: true },
        },
        {
          onComplete: () => {
            void reloadScenesAfterRegen(channelId, videoId)
              .then(() => {
                if (mountedRef.current) toast.success(t('production.scenes.regenSuccess'));
              })
              .catch((err) => {
                toast.error(err instanceof Error ? err.message : t('production.scenes.regenReloadError'));
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

  async function handleConfirmCreateVideo() {
    if (!selectedVideo || toolbarBusy) return;

    const { channelId, videoId, title } = selectedVideo;
    setEnqueueingCreateVideo(true);
    try {
      await enqueueTask(
        {
          type: 'create_video',
          title: t('production.createVideo.jobTitle', { title: title || videoId }),
          subtitle: videoId,
          payload: { channelId, videoIds: [videoId], assembleOnly: true },
        },
        {
          onComplete: () => {
            if (!mountedRef.current) return;
            setPlaybackVersion((current) => current + 1);
            onVideoPatched(channelId, videoId, { status: 'Created' });
            toast.success(t('production.createVideo.success'));
          },
          onFail: (job) => {
            toast.error(job.error ?? t('production.createVideo.failed'));
          },
        },
      );
      setConfirmCreateVideoOpen(false);
      toast.success(t('production.createVideo.queued'));
    } catch {
      // enqueueTask already toasts
    } finally {
      setEnqueueingCreateVideo(false);
    }
  }

  const tabActions =
    activeTab === 'metadata' ? (
      <>
        <Button
          type="button"
          variant="outlined"
          disabled={toolbarBusy || !metadataData}
          onClick={() => setConfirmRegenerateOpen(true)}
        >
          {regenerateInProgress ? t('production.metadata.regenerating') : t('production.metadata.regenerate')}
        </Button>
        <Button type="submit" form={PRODUCTION_METADATA_FORM_ID} disabled={!metadataCanSave || toolbarBusy}>
          {metadataSaving ? t('production.metadata.saving') : t('production.metadata.save')}
        </Button>
      </>
    ) : null;

  const toolbarActions = selectedVideo && tabActions ? tabActions : null;

  // Shown at the top of the box, so it is seen and reachable without scrolling past the player or every scene.
  const topActions = !selectedVideo ? null : activeTab === 'video' ? (
    <Button type="button" disabled={toolbarBusy} onClick={handleCreateVideoClick}>
      {assembleInProgress || enqueueingCreateVideo
        ? t('production.createVideo.creating')
        : t('production.createVideo.button')}
    </Button>
  ) : activeTab === 'scenes' && missingImageCount > 0 ? (
      <Button
        type="button"
        disabled={toolbarBusy || regeneratingMissing}
        onClick={() => void handleGenerateMissingImages()}
      >
        {regeneratingMissing
          ? t('production.scene.generatingMissing')
          : t('production.scene.generateMissingCount', { count: missingImageCount })}
      </Button>
    ) : null;

  const detailPanel = (
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
      activeTab={activeTab}
      onActiveTabChange={setActiveTab}
      playbackVersion={playbackVersion}
      regeneratingMissing={regeneratingMissing}
      onSelectScene={setSelectedSceneIndex}
      onScenesUpdated={handleScenesUpdated}
      onMetadataSaved={handleMetadataSaved}
      onMetadataSaveStateChange={handleMetadataSaveStateChange}
      onVoiced={() => setReloadKey((key) => key + 1)}
      actions={toolbarActions}
      topActions={topActions}
      onCharactersUpdated={(data) => {
        setCharactersData(data);
        setCharactersError(null);
      }}
    />
  );

  const modals = (
    <>
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
      <CreateVideoConfirmModal
        open={confirmCreateVideoOpen}
        creating={enqueueingCreateVideo}
        onClose={() => setConfirmCreateVideoOpen(false)}
        onConfirm={() => void handleConfirmCreateVideo()}
      />
      <CreateVideoErrorModal message={createVideoError} onClose={() => setCreateVideoError(null)} />
    </>
  );

  return { toolbarActions, detailPanel, modals, resetTab: () => setActiveTab('scenes') };
}
