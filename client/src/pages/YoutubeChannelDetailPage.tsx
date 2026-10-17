import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useParams } from 'react-router-dom';
import { startGpmProfileByEmail } from '../api/gpm';
import { isAbortError } from '../api/http';
import { fetchYoutubeChannel, fetchYoutubeChannelVideos, fetchYoutubeChannelPendingVideos, syncYoutubeChannelVideos, deleteYoutubeChannelVideos, moveYoutubeChannelVideos } from '../api/youtubeChannels';
import { PageShell } from '../components/layout';
import { MailAccountsPagination } from '../components/mail-accounts/MailAccountsPagination';
import { AddYoutubeChannelModal } from '../components/youtube-channels/AddYoutubeChannelModal';
import { DeleteVideosConfirmModal } from '../components/youtube-channels/DeleteVideosConfirmModal';
import { MoveVideosChannelModal } from '../components/youtube-channels/MoveVideosChannelModal';
import { MoveVideosConfirmModal } from '../components/youtube-channels/MoveVideosConfirmModal';
import { YoutubeChannelDetailHeader, YoutubeChannelDetailHeaderSkeleton } from '../components/youtube-channels/YoutubeChannelDetailHeader';
import { PublishedVideoModal } from '../components/youtube-channels/PublishedVideoModal';
import { isYoutubePublishedVideo } from '../utils/youtubeVideo';
import { YoutubeChannelHero } from '../components/youtube-channels/YoutubeChannelHero';
import { YoutubeChannelVideoCards } from '../components/youtube-channels/YoutubeChannelVideoCards';
import { YoutubeChannelVideosToolbar } from '../components/youtube-channels/YoutubeChannelVideosToolbar';
import { VideoCommentsDrawer } from '../components/youtube-channels/VideoCommentsDrawer';
import { RecreateMetadataModal } from '../components/youtube-channels/RecreateMetadataModal';
import { VideoContentModal } from '../components/youtube-channels/VideoContentModal';
import { useToast } from '../components/ui';
import { useAbortableEffect, useClientPaginatedList, useDismissibleTarget, useTaskQueue } from '../hooks';
import type { YoutubeChannel, YoutubeChannelVideo, YoutubeChannelVideoStatusFilter } from '../types/youtubeChannel';
import { isStoredReupChannelType } from '../types/youtubeChannel';
import { filterYoutubeChannelVideosByStatus } from '../utils/youtubeChannelVideos';

function canOpenGpmProfile(linkedEmail: string): boolean {
  const normalized = linkedEmail.trim().toLowerCase();
  return normalized.length > 0 && normalized !== 'default';
}

function isDeletableVideoStatus(status: YoutubeChannelVideo['status']): boolean {
  return status != null && status !== 'Published' && status !== 'Pending';
}

function isMovableVideoStatus(status: YoutubeChannelVideo['status']): boolean {
  return status === 'Prepared' || status === 'Created';
}

export function YoutubeChannelDetailPage() {
  const { t, i18n } = useTranslation('youtube');
  const { id } = useParams<{ id: string }>();
  const { state } = useLocation();
  const requestedReturn =
    state && typeof state === 'object' && 'returnTo' in state && typeof state.returnTo === 'string'
      ? state.returnTo
      : '';
  const returnTo =
    requestedReturn === '/youtube-channels' || requestedReturn.startsWith('/youtube-channels?')
      ? requestedReturn
      : '/youtube-channels';
  const { toast } = useToast();
  const { enqueueTask } = useTaskQueue();
  const [channel, setChannel] = useState<YoutubeChannel | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(!id);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [allVideos, setAllVideos] = useState<YoutubeChannelVideo[]>([]);
  const [videosFetchedAt, setVideosFetchedAt] = useState<string | null>(null);
  const [videosLoading, setVideosLoading] = useState(true);
  const [videosError, setVideosError] = useState<string | null>(null);
  const [videoResetKey, setVideoResetKey] = useState(0);
  const [selectedVideo, setSelectedVideo] = useState<YoutubeChannelVideo | null>(null);
  const contentModal = useDismissibleTarget<YoutubeChannelVideo>();
  const contentVideo = contentModal.target;
  const setContentVideo = contentModal.setTarget; // in-place updates only; open/close go through show/hide
  const [editOpen, setEditOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<YoutubeChannelVideoStatusFilter>('all');
  const [openingProfile, setOpeningProfile] = useState(false);
  const [selectedVideoIds, setSelectedVideoIds] = useState<Set<string>>(() => new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletingVideos, setDeletingVideos] = useState(false);
  const [showMoveChannelModal, setShowMoveChannelModal] = useState(false);
  const [showMoveConfirm, setShowMoveConfirm] = useState(false);
  const [movingVideos, setMovingVideos] = useState(false);
  const [moveVideoIds, setMoveVideoIds] = useState<string[]>([]);
  const [moveTargetChannel, setMoveTargetChannel] = useState<YoutubeChannel | null>(null);
  const [pendingVideos, setPendingVideos] = useState<YoutubeChannelVideo[]>([]);
  const [pendingLoading, setPendingLoading] = useState(false);
  const [pendingError, setPendingError] = useState<string | null>(null);
  const [pendingResetKey, setPendingResetKey] = useState(0);
  const [limit, setLimit] = useState(20);
  const [recreateMetadataOpen, setRecreateMetadataOpen] = useState(false);
  const publishedModal = useDismissibleTarget<YoutubeChannelVideo>();
  const publishedVideo = publishedModal.target;

  function handleOpenVideo(video: YoutubeChannelVideo) {
    if (isYoutubePublishedVideo(video)) publishedModal.show(video);
    else contentModal.show(video);
  }

  const isPendingFilter = statusFilter === 'Pending';
  const canRecreateMetadata =
    channel != null && channel.language === 'ja' && isStoredReupChannelType(channel.type);
  const paginationLocale = i18n.language === 'vi' ? 'vi' : 'en';

  const filteredVideos = useMemo(() => {
    if (isPendingFilter) return pendingVideos;
    return filterYoutubeChannelVideosByStatus(allVideos, statusFilter);
  }, [allVideos, statusFilter, isPendingFilter, pendingVideos]);

  const videos = useClientPaginatedList(filteredVideos, {
    limit,
    resetKey: `${isPendingFilter ? pendingResetKey : videoResetKey}:${statusFilter}`,
  });

  const videosEmptyMessage =
    statusFilter !== 'all' ? t('videos.emptyFiltered') : t('videos.empty');
  const tableLoading = isPendingFilter ? pendingLoading : videosLoading;
  const tableError = isPendingFilter ? pendingError : videosError;

  const selectedVideos = useMemo(
    () => filteredVideos.filter(video => selectedVideoIds.has(video.id)),
    [filteredVideos, selectedVideoIds],
  );
  const canCreateFromSelection =
    isPendingFilter &&
    selectedVideoIds.size > 0 &&
    channel != null &&
    isStoredReupChannelType(channel.type);
  const canDeleteVideos =
    !isPendingFilter &&
    selectedVideos.length > 0 &&
    selectedVideos.every(video => isDeletableVideoStatus(video.status));
  const canUploadFromSelection =
    !isPendingFilter &&
    selectedVideoIds.size > 0 &&
    channel != null &&
    isStoredReupChannelType(channel.type) &&
    selectedVideos.every(video => video.status === 'Created');
  const movableVideos = useMemo(
    () => allVideos.filter(video => isMovableVideoStatus(video.status)),
    [allVideos],
  );
  const selectedMovableVideos = useMemo(
    () => selectedVideos.filter(video => isMovableVideoStatus(video.status)),
    [selectedVideos],
  );
  const canMoveVideos = !isPendingFilter && movableVideos.length > 0;
  const uploadDisabledReason =
    isPendingFilter
      ? t('hint.uploadSwitchFilter')
      : channel != null && !isStoredReupChannelType(channel.type)
        ? t('hint.uploadNeedReup')
        : selectedVideoIds.size === 0
          ? t('hint.uploadSelectCreated')
          : selectedVideos.some(video => video.status !== 'Created')
            ? t('hint.uploadOnlyCreated')
            : undefined;

  useAbortableEffect(
    async signal => {
      if (!id) return;

      setLoading(true);
      setNotFound(false);

      try {
        const data = await fetchYoutubeChannel(id, { signal });
        setChannel(data);
      } catch {
        if (signal.aborted) return;
        setChannel(null);
        setNotFound(true);
      } finally {
        if (!signal.aborted) setLoading(false);
      }
    },
    [id],
    { enabled: Boolean(id) },
  );

  useAbortableEffect(
    async signal => {
      if (!id) return;

      setVideosLoading(true);
      setVideosError(null);

      try {
        const data = await fetchYoutubeChannelVideos(id, { signal });
        setAllVideos(data.items);
        setVideosFetchedAt(data.fetchedAt ?? null);
        setVideoResetKey(key => key + 1);
      } catch (err) {
        if (isAbortError(err)) return;
        setAllVideos([]);
        setVideosError(err instanceof Error ? err.message : t('videos.loadError'));
      } finally {
        if (!signal.aborted) setVideosLoading(false);
      }
    },
    [id],
    { enabled: Boolean(id) },
  );

  useAbortableEffect(
    async signal => {
      if (!id) return;

      setPendingLoading(true);
      setPendingError(null);

      try {
        const data = await fetchYoutubeChannelPendingVideos(id, { signal });
        setPendingVideos(data.items);
        setPendingResetKey(key => key + 1);
      } catch (err) {
        if (isAbortError(err)) return;
        setPendingVideos([]);
        setPendingError(err instanceof Error ? err.message : t('videos.pendingLoadError'));
      } finally {
        if (!signal.aborted) setPendingLoading(false);
      }
    },
    [id, statusFilter],
    { enabled: Boolean(id) && isPendingFilter },
  );

  function enqueueSelectedVideos(prepareOnly: boolean) {
    if (!id || !channel || !canCreateFromSelection) return;

    const videoIds = Array.from(selectedVideoIds);
    void enqueueTask({
      type: 'create_video',
      title: prepareOnly
        ? t('job.prepareOne', { name: channel.name })
        : t('job.createOne', { name: channel.name }),
      subtitle: t('job.detailSelected', { handle: channel.handle, count: videoIds.length }),
      payload: {
        channelId: id,
        channelName: channel.name,
        channelHandle: channel.handle,
        videoIds,
        ...(prepareOnly ? { prepareOnly: true } : {}),
      },
    });
    setSelectedVideoIds(new Set());
  }

  function handleUploadSelected() {
    if (!id || !channel || !canUploadFromSelection) return;

    const videoIds = Array.from(selectedVideoIds);
    void enqueueTask({
      type: 'upload_video',
      title: t('job.uploadOne', { name: channel.name }),
      subtitle: t('job.detailSelected', { handle: channel.handle, count: videoIds.length }),
      payload: { channelId: id, videoIds },
    });
    setSelectedVideoIds(new Set());
  }

  async function handleSyncVideos() {
    if (!id) return;

    setSyncing(true);
    setSyncError(null);
    setVideosLoading(true);
    setVideosError(null);

    try {
      const { item, videos: syncedVideos, fetchedAt } = await syncYoutubeChannelVideos(id);
      setChannel(item);
      setAllVideos(syncedVideos);
      setVideosFetchedAt(fetchedAt);
      setVideoResetKey(key => key + 1);
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : t('sync.error'));
    } finally {
      setSyncing(false);
      setVideosLoading(false);
    }
  }

  async function handleOpenProfile() {
    if (!channel || !canOpenGpmProfile(channel.linkedEmail) || openingProfile) return;

    setOpeningProfile(true);
    try {
      const { item } = await startGpmProfileByEmail(channel.linkedEmail);
      const debugInfo =
        item.remote_debugging_address ??
        (item.remote_debugging_port ? `127.0.0.1:${item.remote_debugging_port}` : null);
      toast.success(
        debugInfo
          ? t('gpm.openSuccessDebug', { email: channel.linkedEmail, debug: debugInfo })
          : t('gpm.openSuccess', { email: channel.linkedEmail }),
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('gpm.openError'));
    } finally {
      setOpeningProfile(false);
    }
  }

  function handleToggleVideoRow(videoId: string) {
    setSelectedVideoIds(prev => {
      const next = new Set(prev);
      if (next.has(videoId)) next.delete(videoId);
      else next.add(videoId);
      return next;
    });
  }

  async function handleConfirmDeleteVideos() {
    if (!id || !canDeleteVideos || deletingVideos) return;

    setDeletingVideos(true);
    try {
      const { deleted } = await deleteYoutubeChannelVideos(id, Array.from(selectedVideoIds));
      const deletedSet = new Set(deleted);
      setAllVideos(current => current.filter(video => !deletedSet.has(video.id)));
      setSelectedVideoIds(new Set());
      setShowDeleteConfirm(false);
      toast.success(
        deleted.length === 1
          ? t('deleteVideos.toastSuccessOne')
          : t('deleteVideos.toastSuccessMany', { count: deleted.length }),
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('deleteVideos.toastError'));
    } finally {
      setDeletingVideos(false);
    }
  }

  function handleOpenMoveVideos() {
    if (!canMoveVideos) return;
    const ids =
      selectedMovableVideos.length > 0
        ? selectedMovableVideos.map(video => video.id)
        : movableVideos.map(video => video.id);
    if (ids.length === 0) return;
    setMoveVideoIds(ids);
    setMoveTargetChannel(null);
    setShowMoveConfirm(false);
    setShowMoveChannelModal(true);
  }

  function handleMoveChannelSelected(target: YoutubeChannel) {
    setMoveTargetChannel(target);
    setShowMoveChannelModal(false);
    setShowMoveConfirm(true);
  }

  async function handleConfirmMoveVideos() {
    if (!id || !moveTargetChannel || moveVideoIds.length === 0 || movingVideos) return;

    setMovingVideos(true);
    try {
      const { moved } = await moveYoutubeChannelVideos(id, {
        targetChannelId: moveTargetChannel.id,
        videoIds: moveVideoIds,
      });
      const movedSet = new Set(moved);
      setAllVideos(current => current.filter(video => !movedSet.has(video.id)));
      setSelectedVideoIds(new Set());
      setShowMoveConfirm(false);
      setMoveTargetChannel(null);
      setMoveVideoIds([]);
      setVideoResetKey(key => key + 1);
      toast.success(
        moved.length === 1
          ? t('moveVideos.toastSuccessOne')
          : t('moveVideos.toastSuccessMany', { count: moved.length }),
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('moveVideos.toastError'));
    } finally {
      setMovingVideos(false);
    }
  }

  if (!id || notFound) {
    return (
      <PageShell fullBleed>
        <div className='flex flex-1 flex-col items-center justify-center text-center'>
          <p className='text-sm text-neutral-400'>{t('page.notFound')}</p>
          <Link to={returnTo} className='mt-3 text-sm text-secondary-400 hover:text-secondary-300'>
            {t('page.backToList')}
          </Link>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell fullBleed className='lg:flex-row'>
      <div className='scrollbar-thin flex min-w-0 flex-1 flex-col overflow-y-auto overscroll-contain pr-1'>
        <div className='shrink-0'>
          {loading || !channel ? (
            <YoutubeChannelDetailHeaderSkeleton />
          ) : (
            <YoutubeChannelDetailHeader
              channel={channel}
              hero={<YoutubeChannelHero channel={channel} videos={allVideos} />}
              toolbar={
                <YoutubeChannelVideosToolbar
                  statusFilter={statusFilter}
                  onStatusFilterChange={next => {
                    setStatusFilter(next);
                    setSelectedVideoIds(new Set());
                  }}
                  nextUploadAt={channel?.nextUploadAt}
                />
              }
              syncing={syncing}
              syncError={syncError}
              videosFetchedAt={videosFetchedAt}
              canCreateFromSelection={canCreateFromSelection}
              openingProfile={openingProfile}
              canDeleteVideos={canDeleteVideos}
              deletingVideos={deletingVideos}
              canUploadVideos={canUploadFromSelection}
              uploadDisabledReason={uploadDisabledReason}
              canMoveVideos={canMoveVideos}
              movingVideos={movingVideos}
              onSync={handleSyncVideos}
              onEdit={() => setEditOpen(true)}
              onCreateVideo={() => enqueueSelectedVideos(false)}
              onPrepareVideo={() => enqueueSelectedVideos(true)}
              onUploadVideos={handleUploadSelected}
              onMoveVideos={handleOpenMoveVideos}
              onDeleteVideos={() => setShowDeleteConfirm(true)}
              onOpenProfile={handleOpenProfile}
              onRecreateMetadata={canRecreateMetadata ? () => setRecreateMetadataOpen(true) : undefined}
            />
          )}

          {channel ? (
            <AddYoutubeChannelModal
              open={editOpen}
              channel={channel}
              onClose={() => setEditOpen(false)}
              onSuccess={async updated => {
                try {
                  const live = await fetchYoutubeChannel(id);
                  setChannel(live);
                } catch {
                  setChannel(current => (current ? { ...current, ...updated } : updated));
                }
              }}
            />
          ) : null}
        </div>

          <div className='mt-3 pb-2'>
            {id ? (
              <YoutubeChannelVideoCards
                channelId={id}
                videos={videos.pageItems}
                loading={tableLoading}
                error={tableError}
                emptyMessage={videosEmptyMessage}
                selectedIds={selectedVideoIds}
                onToggleRow={handleToggleVideoRow}
                onCommentClick={isPendingFilter ? undefined : setSelectedVideo}
                onTitleClick={isPendingFilter ? undefined : handleOpenVideo}
              />
            ) : null}
          </div>
          <div className='shrink-0'>
            <MailAccountsPagination
              page={videos.page}
              limit={videos.limit}
              total={videos.total}
              totalPages={videos.totalPages}
              onPageChange={videos.setPage}
              onLimitChange={setLimit}
              locale={paginationLocale}
            />
          </div>
      </div>

      <DeleteVideosConfirmModal
        open={showDeleteConfirm}
        count={selectedVideos.length}
        deleting={deletingVideos}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={() => {
          void handleConfirmDeleteVideos();
        }}
      />

      {id ? (
        <MoveVideosChannelModal
          open={showMoveChannelModal}
          currentChannelId={id}
          videoCount={moveVideoIds.length}
          onClose={() => {
            setShowMoveChannelModal(false);
            setMoveVideoIds([]);
          }}
          onSave={handleMoveChannelSelected}
        />
      ) : null}

      <MoveVideosConfirmModal
        open={showMoveConfirm}
        count={moveVideoIds.length}
        channelName={moveTargetChannel?.name ?? ''}
        moving={movingVideos}
        onClose={() => {
          if (movingVideos) return;
          setShowMoveConfirm(false);
          setMoveTargetChannel(null);
          setMoveVideoIds([]);
        }}
        onConfirm={() => {
          void handleConfirmMoveVideos();
        }}
      />

      {selectedVideo ? (
        <div className='fixed inset-y-0 right-0 z-50 flex lg:static lg:z-auto'>
          <VideoCommentsDrawer open={Boolean(selectedVideo)} channelId={id} video={selectedVideo} onClose={() => setSelectedVideo(null)} />
        </div>
      ) : null}

      {publishedVideo && id ? (
        <PublishedVideoModal
          key={publishedVideo.id}
          open={publishedModal.open}
          channelId={id}
          video={publishedVideo}
          onClose={publishedModal.hide}
        />
      ) : null}

      {contentVideo ? (
        <VideoContentModal
          key={contentVideo.id}
          open={contentModal.open}
          channelId={id}
          video={contentVideo}
          canRegenerateMetadata={channel?.language === 'ja'}
          onClose={contentModal.hide}
          onSaved={content => {
            setAllVideos(current =>
              current.map(video => (video.id === contentVideo.id ? { ...video, title: content.title } : video)),
            );
            setContentVideo(current => (current ? { ...current, title: content.title } : current));
          }}
          onMarkedUploaded={() => {
            void fetchYoutubeChannelVideos(id)
              .then(data => {
                setAllVideos(data.items);
                setVideosFetchedAt(data.fetchedAt ?? null);
                setVideoResetKey(key => key + 1);
              })
              .catch(() => undefined);
            void fetchYoutubeChannel(id)
              .then(live => setChannel(live))
              .catch(() => undefined);
          }}
          onVideoCreated={videoId => {
            setAllVideos(current =>
              current.map(video => (video.id === videoId ? { ...video, status: 'Created' } : video)),
            );
            setContentVideo(current => (current?.id === videoId ? { ...current, status: 'Created' } : current));
            void fetchYoutubeChannel(id)
              .then(live => setChannel(live))
              .catch(() => undefined);
          }}
        />
      ) : null}

      {id && channel && canRecreateMetadata ? (
        <RecreateMetadataModal
          open={recreateMetadataOpen}
          channelId={id}
          onClose={() => setRecreateMetadataOpen(false)}
        />
      ) : null}
    </PageShell>
  );
}
