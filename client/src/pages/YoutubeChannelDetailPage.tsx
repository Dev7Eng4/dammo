import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { startGpmProfileByEmail } from '../api/gpm';
import { isAbortError } from '../api/http';
import { fetchYoutubeChannel, fetchYoutubeChannelVideos, fetchYoutubeChannelPendingVideos, syncYoutubeChannelVideos, deleteYoutubeChannelVideos } from '../api/youtubeChannels';
import { MailAccountsPagination } from '../components/mail-accounts/MailAccountsPagination';
import { AddYoutubeChannelModal } from '../components/youtube-channels/AddYoutubeChannelModal';
import { DeleteVideosConfirmModal } from '../components/youtube-channels/DeleteVideosConfirmModal';
import { YoutubeChannelDetailHeader, YoutubeChannelDetailHeaderSkeleton } from '../components/youtube-channels/YoutubeChannelDetailHeader';
import { YoutubeChannelVideosTable } from '../components/youtube-channels/YoutubeChannelVideosTable';
import { YoutubeChannelVideosToolbar } from '../components/youtube-channels/YoutubeChannelVideosToolbar';
import { VideoCommentsDrawer } from '../components/youtube-channels/VideoCommentsDrawer';
import { VideoContentModal } from '../components/youtube-channels/VideoContentModal';
import { useToast } from '../components/ui';
import { useAbortableEffect, useClientPaginatedList, useTaskQueue } from '../hooks';
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

export function YoutubeChannelDetailPage() {
  const { id } = useParams<{ id: string }>();
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
  const [contentVideo, setContentVideo] = useState<YoutubeChannelVideo | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<YoutubeChannelVideoStatusFilter>('all');
  const [openingProfile, setOpeningProfile] = useState(false);
  const [selectedVideoIds, setSelectedVideoIds] = useState<Set<string>>(() => new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletingVideos, setDeletingVideos] = useState(false);
  const [pendingVideos, setPendingVideos] = useState<YoutubeChannelVideo[]>([]);
  const [pendingLoading, setPendingLoading] = useState(false);
  const [pendingError, setPendingError] = useState<string | null>(null);
  const [pendingResetKey, setPendingResetKey] = useState(0);
  const [limit, setLimit] = useState(20);

  const isPendingFilter = statusFilter === 'Pending';

  const filteredVideos = useMemo(() => {
    if (isPendingFilter) return pendingVideos;
    return filterYoutubeChannelVideosByStatus(allVideos, statusFilter);
  }, [allVideos, statusFilter, isPendingFilter, pendingVideos]);

  const videos = useClientPaginatedList(filteredVideos, {
    limit,
    resetKey: `${isPendingFilter ? pendingResetKey : videoResetKey}:${statusFilter}`,
  });

  const videosEmptyMessage = statusFilter !== 'all' ? 'Không có video nào khớp với trạng thái đã chọn.' : 'Không tìm thấy video nào.';
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
  const uploadDisabledReason =
    isPendingFilter
      ? 'Chuyển sang bộ lọc khác để tải video lên'
      : channel != null && !isStoredReupChannelType(channel.type)
        ? 'Chỉ kênh Reup âm thanh hoặc Reup video mới có thể tải video lên'
        : selectedVideoIds.size === 0
          ? 'Chọn video trạng thái Đã tạo để tải lên'
          : selectedVideos.some(video => video.status !== 'Created')
            ? 'Chỉ video trạng thái Đã tạo mới có thể tải lên'
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
        setVideosError(err instanceof Error ? err.message : 'Không thể tải video');
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
        setPendingError(err instanceof Error ? err.message : 'Không thể tải video chưa xử lý');
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
        ? `Đang chuẩn bị video: ${channel.name}`
        : `Đang tạo video: ${channel.name}`,
      subtitle: `${channel.handle} · ${videoIds.length} video đã chọn`,
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
      title: `Đang tải lên: ${channel.name}`,
      subtitle: `${channel.handle} · ${videoIds.length} video đã chọn`,
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
      setSyncError(err instanceof Error ? err.message : 'Không thể đồng bộ video');
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
          ? `Đã mở profile GPM cho ${channel.linkedEmail} — debug ${debugInfo}`
          : `Đã mở profile GPM cho ${channel.linkedEmail}`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Không thể mở profile GPM');
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

  function handleToggleAllVideos() {
    const pageIds = videos.pageItems.map(video => video.id);
    const allPageSelected = pageIds.length > 0 && pageIds.every(videoId => selectedVideoIds.has(videoId));
    setSelectedVideoIds(prev => {
      const next = new Set(prev);
      if (allPageSelected) {
        for (const videoId of pageIds) next.delete(videoId);
      } else {
        for (const videoId of pageIds) next.add(videoId);
      }
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
      toast.success(deleted.length === 1 ? 'Đã xóa 1 video' : `Đã xóa ${deleted.length} video`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Không thể xóa video');
    } finally {
      setDeletingVideos(false);
    }
  }

  if (!id || notFound) {
    return (
      <div className='-m-6 flex h-[calc(100svh-3.5rem)] flex-col'>
        <div className='flex flex-1 flex-col items-center justify-center p-6 text-center'>
          <p className='text-sm text-neutral-400'>Không tìm thấy kênh YouTube.</p>
          <Link to='/youtube-channels' className='mt-3 text-sm text-secondary-400 hover:text-secondary-300'>
            Quay lại danh sách kênh YouTube
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className='-m-6 flex h-[calc(100svh-3.5rem)] flex-col lg:flex-row'>
      <div className='flex min-w-0 flex-1 flex-col overflow-hidden'>
        <div className='flex-1 overflow-y-auto p-6'>
          {loading || !channel ? (
            <YoutubeChannelDetailHeaderSkeleton />
          ) : (
            <YoutubeChannelDetailHeader
              channel={channel}
              syncing={syncing}
              syncError={syncError}
              videosFetchedAt={videosFetchedAt}
              canCreateFromSelection={canCreateFromSelection}
              openingProfile={openingProfile}
              canDeleteVideos={canDeleteVideos}
              deletingVideos={deletingVideos}
              canUploadVideos={canUploadFromSelection}
              uploadDisabledReason={uploadDisabledReason}
              onSync={handleSyncVideos}
              onEdit={() => setEditOpen(true)}
              onCreateVideo={() => enqueueSelectedVideos(false)}
              onPrepareVideo={() => enqueueSelectedVideos(true)}
              onUploadVideos={handleUploadSelected}
              onDeleteVideos={() => setShowDeleteConfirm(true)}
              onOpenProfile={handleOpenProfile}
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

          <div className='mt-4 flex flex-wrap items-end justify-between gap-3'>
            {/* <YoutubeChannelVideoSummary videos={allVideos} loading={videosLoading} /> */}
            <YoutubeChannelVideosToolbar
              statusFilter={statusFilter}
              onStatusFilterChange={next => {
                setStatusFilter(next);
                setSelectedVideoIds(new Set());
              }}
              nextUploadAt={channel?.nextUploadAt}
            />
          </div>

          <div className='mt-3 card-surface px-5 pt-3 pb-4'>
            <YoutubeChannelVideosTable
              videos={videos.pageItems}
              loading={tableLoading}
              error={tableError}
              emptyMessage={videosEmptyMessage}
              rowNumberStart={(videos.page - 1) * videos.limit + 1}
              enableRowSelection
              selectedIds={selectedVideoIds}
              onToggleRow={handleToggleVideoRow}
              onToggleAll={handleToggleAllVideos}
              onCommentClick={isPendingFilter ? undefined : setSelectedVideo}
              onTitleClick={isPendingFilter ? undefined : setContentVideo}
            />
            <MailAccountsPagination
              page={videos.page}
              limit={videos.limit}
              total={videos.total}
              totalPages={videos.totalPages}
              onPageChange={videos.setPage}
              onLimitChange={setLimit}
              locale='vi'
            />
          </div>
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

      {selectedVideo ? (
        <div className='fixed inset-y-0 right-0 z-50 flex lg:static lg:z-auto'>
          <VideoCommentsDrawer open={Boolean(selectedVideo)} channelId={id} video={selectedVideo} onClose={() => setSelectedVideo(null)} />
        </div>
      ) : null}

      {contentVideo ? (
        <VideoContentModal
          key={contentVideo.id}
          open
          channelId={id}
          video={contentVideo}
          onClose={() => setContentVideo(null)}
          onSaved={content => {
            setAllVideos(current => current.map(video => (video.id === contentVideo.id ? { ...video, title: content.title } : video)));
          }}
          onMarkedUploaded={videoId => {
            setAllVideos(current => current.map(video => (video.id === videoId ? { ...video, status: 'Uploaded' } : video)));
            void fetchYoutubeChannel(id)
              .then(live => setChannel(live))
              .catch(() => undefined);
          }}
        />
      ) : null}
    </div>
  );
}
