import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Clapperboard } from 'lucide-react';
import { productionOutputVideoUrl } from '../../api/videoProduction';
import { PageTabs } from '../ui';
import type {
  ProductionCharactersResponse,
  ProductionDetailTab,
  ProductionMetadataResponse,
  ProductionScenesResponse,
  ProductionTranscriptResponse,
  ProductionVideoListItem,
} from '../../types/videoProductionScenes';
import { CharactersPanel } from './CharactersPanel';
import { MetadataPanel } from './MetadataPanel';
import { SceneTable } from './SceneTable';
import { TranscriptPanel } from './TranscriptPanel';

function OutputVideoPanel({
  channelId,
  videoId,
  playbackVersion,
}: {
  channelId: string;
  videoId: string;
  playbackVersion: number;
}) {
  const { t } = useTranslation('factory');
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [channelId, videoId, playbackVersion]);

  if (failed) {
    return (
      <div className="px-4 py-6">
        <div className="flex aspect-video items-center justify-center rounded-xl border border-border bg-black px-4 text-center text-sm text-muted-foreground">
          {t('production.outputVideo.missing')}
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 py-6">
      <video
        key={`${channelId}:${videoId}:${playbackVersion}`}
        src={`${productionOutputVideoUrl(channelId, videoId)}?v=${playbackVersion}`}
        controls
        preload="metadata"
        className="aspect-video w-full rounded-xl border border-border bg-black object-contain"
        onError={() => setFailed(true)}
      >
        {t('production.outputVideo.unsupported')}
      </video>
    </div>
  );
}

interface VideoProductionDetailPanelProps {
  video: ProductionVideoListItem | null;
  scenesData: ProductionScenesResponse | null;
  scenesLoading: boolean;
  scenesError: string | null;
  transcriptData: ProductionTranscriptResponse | null;
  transcriptLoading: boolean;
  transcriptError: string | null;
  charactersData: ProductionCharactersResponse | null;
  charactersLoading: boolean;
  charactersError: string | null;
  metadataData: ProductionMetadataResponse | null;
  metadataLoading: boolean;
  metadataError: string | null;
  selectedSceneIndex: number | null;
  activeTab: ProductionDetailTab;
  onActiveTabChange: (tab: ProductionDetailTab) => void;
  playbackVersion: number;
  onSelectScene: (index: number) => void;
  onScenesUpdated: (data: ProductionScenesResponse) => void;
  regeneratingMissing?: boolean;
  onMetadataSaved: (metadata: ProductionMetadataResponse) => void;
  onMetadataSaveStateChange?: (state: { canSave: boolean; saving: boolean }) => void;
}

export function VideoProductionDetailPanel({
  video,
  scenesData,
  scenesLoading,
  scenesError,
  transcriptData,
  transcriptLoading,
  transcriptError,
  charactersData,
  charactersLoading,
  charactersError,
  metadataData,
  metadataLoading,
  metadataError,
  selectedSceneIndex,
  activeTab,
  onActiveTabChange,
  playbackVersion,
  onSelectScene,
  onScenesUpdated,
  regeneratingMissing,
  onMetadataSaved,
  onMetadataSaveStateChange,
}: VideoProductionDetailPanelProps) {
  const { t } = useTranslation('factory');

  const handleSaveStateChange = useCallback(
    (state: { canSave: boolean; saving: boolean }) => {
      onMetadataSaveStateChange?.(state);
    },
    [onMetadataSaveStateChange],
  );

  useEffect(() => {
    if (!video) {
      onMetadataSaveStateChange?.({ canSave: false, saving: false });
    }
  }, [video, onMetadataSaveStateChange]);

  if (!video) {
    return (
      <aside className="flex h-full w-full flex-col items-center justify-center gap-3 bg-background px-6 text-center">
        <Clapperboard className="size-10 text-muted-foreground/50" aria-hidden="true" />
        <p className="max-w-xs text-sm text-muted-foreground">
          {t('production.detail.selectVideo')}
        </p>
      </aside>
    );
  }

  const scenes = scenesData?.scenes ?? [];
  const cues = transcriptData?.cues ?? [];
  const characters = charactersData?.characters ?? [];

  return (
    <aside className="flex h-full w-full flex-col bg-background">
      <div className="shrink-0 px-4 pt-1">
        <PageTabs
          variant="underline"
          value={activeTab}
          onValueChange={(value) => onActiveTabChange(value as ProductionDetailTab)}
          items={[
            { id: 'video', label: t('production.tabs.video') },
            { id: 'metadata', label: t('production.tabs.metadata') },
            { id: 'transcript', label: t('production.tabs.transcript') },
            { id: 'scenes', label: t('production.tabs.scenes') },
            { id: 'characters', label: t('production.tabs.characters') },
          ]}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <div className={activeTab === 'metadata' ? 'contents' : 'hidden'}>
          <MetadataPanel
            channelId={video.channelId}
            videoId={video.videoId}
            data={metadataData}
            loading={metadataLoading}
            error={metadataError}
            onSaved={onMetadataSaved}
            onSaveStateChange={handleSaveStateChange}
          />
        </div>

        {activeTab === 'video' ? (
          <OutputVideoPanel
            channelId={video.channelId}
            videoId={video.videoId}
            playbackVersion={playbackVersion}
          />
        ) : null}

        {activeTab === 'transcript' ? (
          <TranscriptPanel cues={cues} loading={transcriptLoading} error={transcriptError} />
        ) : null}

        {activeTab === 'scenes' ? (
          scenesLoading ? (
            <p className="px-4 py-6 text-sm text-muted-foreground">
              {t('production.detail.loadingScenes')}
            </p>
          ) : scenesError ? (
            <p className="px-4 py-6 text-sm text-danger">{scenesError}</p>
          ) : scenes.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground">
              {t('production.detail.noScenes')}
            </p>
          ) : (
            <SceneTable
              channelId={video.channelId}
              videoId={video.videoId}
              scenes={scenes}
              selectedIndex={selectedSceneIndex}
              onSelect={onSelectScene}
              onScenesUpdated={onScenesUpdated}
              regeneratingMissing={regeneratingMissing}
            />
          )
        ) : null}

        {activeTab === 'characters' ? (
          <CharactersPanel
            characters={characters}
            loading={charactersLoading}
            error={charactersError}
          />
        ) : null}
      </div>
    </aside>
  );
}
