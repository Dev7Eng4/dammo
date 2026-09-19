import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Clapperboard } from 'lucide-react';
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
  onSelectScene: (index: number) => void;
  onScenesUpdated: (data: ProductionScenesResponse) => void;
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
  onSelectScene,
  onScenesUpdated,
  onMetadataSaved,
  onMetadataSaveStateChange,
}: VideoProductionDetailPanelProps) {
  const { t } = useTranslation('factory');
  const [activeTab, setActiveTab] = useState<ProductionDetailTab>('metadata');

  useEffect(() => {
    setActiveTab('metadata');
  }, [video?.channelId, video?.videoId]);

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
          onValueChange={(value) => setActiveTab(value as ProductionDetailTab)}
          items={[
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
