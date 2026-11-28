import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Clapperboard, ExternalLink } from 'lucide-react';
import {
  fetchProductionCharacters,
  productionOutputVideoUrl,
  uploadProductionCharacterImage,
} from '../../api/videoProduction';
import { uploadYoutubeChannelMascotImage } from '../../api/youtubeChannels';
import { useToast } from '../ui';
import { PageTabs } from '../ui';
import type {
  ProductionCharacterItem,
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
import { ChannelVideoScriptStep } from './ChannelVideoScriptStep';
import { ChannelVideoMotionStep } from './ChannelVideoMotionStep';
import { ChannelVideoVoiceStep } from './ChannelVideoVoiceStep';
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
  /** A remake narration replaced the audio: transcript and scenes should be reloaded. */
  onVoiced?: () => void;
  /** New character list after an image was replaced. */
  onCharactersUpdated?: (data: ProductionCharactersResponse) => void;
  /** Buttons for the open tab (Tạo video, Lưu metadata…), shown at the bottom of the content box. */
  actions?: ReactNode;
  /** Buttons shown at the top of the content box (Tạo ảnh còn thiếu…). */
  topActions?: ReactNode;
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
  onVoiced,
  onCharactersUpdated,
  actions,
  topActions,
}: VideoProductionDetailPanelProps) {
  const { t } = useTranslation('factory');
  const { toast } = useToast();
  const { t: tm } = useTranslation('manual');

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
        <p className="max-w-xs text-sm text-muted-foreground">{t('production.detail.selectVideo')}</p>
      </aside>
    );
  }

  const scenes = scenesData?.scenes ?? [];
  const cues = transcriptData?.cues ?? [];
  const characters = charactersData?.characters ?? [];

  const remake = video.channelType === 'remake_video';
  const tabs: { id: ProductionDetailTab; label: string }[] = [
    { id: 'source', label: tm('step.source.title') },
    { id: 'script', label: tm('step.script.title') },
    { id: 'voice', label: tm('step.voice.title') },
    { id: 'characters', label: tm('channelVideo.tabs.characters') },
    { id: 'scenes', label: tm('step.scenes.title') },
    { id: 'motion', label: tm('step.motion.title') },
    { id: 'video', label: tm('step.video.title') },
    { id: 'metadata', label: tm('step.metadata.title') },
  ];
  const sourceUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(video.videoId)}`;

  /**
   * Reference images belong to this video; the mascot is the channel's own image, shared by every
   * video of the channel, so replacing it asks first.
   */
  async function replaceCharacterImage(character: ProductionCharacterItem, file: File) {
    if (!video) return;
    if (character.isMascot && !window.confirm(t('production.characters.mascotReplaceConfirm'))) return;
    try {
      const data = character.isMascot
        ? (await uploadYoutubeChannelMascotImage(video.channelId, file),
          await fetchProductionCharacters(video.channelId, video.videoId))
        : await uploadProductionCharacterImage(video.channelId, video.videoId, character.id, file);
      // Image URLs do not change with the file, so bust the browser cache.
      const bust = Date.now();
      onCharactersUpdated?.({
        ...data,
        characters: data.characters.map((item) =>
          item.imageUrl
            ? {
                ...item,
                imageUrl: `${item.imageUrl}${item.imageUrl.includes('?') ? '&' : '?'}v=${bust}`,
              }
            : item,
        ),
      });
      toast.success(t('production.characters.replaced'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <aside className="flex w-full flex-col gap-3">
      <div className="shrink-0">
        <PageTabs
          value={activeTab}
          onValueChange={(value) => onActiveTabChange(value as ProductionDetailTab)}
          items={tabs.map((tab, index) => ({
            id: tab.id,
            label: `${index + 1}. ${tab.label}`,
          }))}
        />
      </div>

      {/* Grows with its content and scrolls with the page, like a manual project's step card. */}
      <div className="card-surface">
        {topActions ? (
          <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">{topActions}</div>
        ) : null}
        <div>
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

          {activeTab === 'source' ? (
            <div className="space-y-3 px-4 py-4 text-sm">
              <p className="text-xs text-muted-foreground">{tm('channelVideo.source.hint')}</p>
              <a
                className="inline-flex items-center gap-1.5 break-all text-secondary-400 hover:text-secondary-300"
                href={sourceUrl}
                target="_blank"
                rel="noreferrer"
              >
                <ExternalLink className="size-4 shrink-0" />
                {sourceUrl}
              </a>
              {video.videoFolderPath ? (
                <div className="space-y-1">
                  <span className="section-label">{tm('detail.storedAt')}</span>
                  <p className="font-mono text-xs break-all text-foreground/90">{video.videoFolderPath}</p>
                </div>
              ) : null}
            </div>
          ) : null}

          {activeTab === 'script' ? (
            remake ? (
              <ChannelVideoScriptStep channelId={video.channelId} videoId={video.videoId} />
            ) : (
              <TranscriptPanel cues={cues} loading={transcriptLoading} error={transcriptError} />
            )
          ) : null}

          {activeTab === 'voice' ? (
            <ChannelVideoVoiceStep
              channelId={video.channelId}
              videoId={video.videoId}
              remake={remake}
              onVoiced={onVoiced}
            />
          ) : null}

          {activeTab === 'motion' ? (
            <ChannelVideoMotionStep channelId={video.channelId} videoId={video.videoId} />
          ) : null}

          {activeTab === 'video' ? (
            <OutputVideoPanel channelId={video.channelId} videoId={video.videoId} playbackVersion={playbackVersion} />
          ) : null}

          {activeTab === 'scenes' ? (
            scenesLoading ? (
              <p className="px-4 py-6 text-sm text-muted-foreground">{t('production.detail.loadingScenes')}</p>
            ) : scenesError ? (
              <p className="px-4 py-6 text-sm text-danger">{scenesError}</p>
            ) : scenes.length === 0 ? (
              <p className="px-4 py-6 text-sm text-muted-foreground">{t('production.detail.noScenes')}</p>
            ) : (
              <SceneTable
                channelId={video.channelId}
                videoId={video.videoId}
                scenes={scenes}
                characters={characters}
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
              onReplaceImage={onCharactersUpdated ? replaceCharacterImage : undefined}
            />
          ) : null}
        </div>
        {actions ? (
          // After the tab's content, at the very bottom of the box.
          <div className="flex flex-wrap items-center gap-2 border-t border-border px-4 py-3">
            {actions}
          </div>
        ) : null}
      </div>
    </aside>
  );
}
