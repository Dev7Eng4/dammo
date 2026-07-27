import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { startGpmProfileByEmail } from '../api/gpm';
import { isAbortError } from '../api/http';
import { fetchYoutubeChannel, fetchYoutubeChannelVideos, syncYoutubeChannelVideos, deleteYoutubeChannelVideos } from '../api/youtubeChannels';
import { MailAccountsPagination } from '../components/mail-accounts/MailAccountsPagination';
import { AddYoutubeChannelModal } from '../components/youtube-channels/AddYoutubeChannelModal';
import { CreateVideoCountModal } from '../components/youtube-channels/CreateVideoCountModal';
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

const VIDEO_LIMIT = 20;

function canOpenGpmProfile(linkedEmail: string): boolean {
  const normalized = linkedEmail.trim().toLowerCase();
  return normalized.length > 0 && normalized !== 'default';
}

function isDeletableVideoStatus(status: YoutubeChannelVideo['status']): boolean {
  return status != null && status !== 'Published';
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
  const [videoCountAction, setVideoCountAction] = useState<'create' | 'prepare' | null>(null);
  const [statusFilter, setStatusFilter] = useState<YoutubeChannelVideoStatusFilter>('all');
  const [openingProfile, setOpeningProfile] = useState(false);
  const [selectedVideoIds, setSelectedVideoIds] = useState<Set<string>>(() => new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletingVideos, setDeletingVideos] = useState(false);

  const filteredVideos = useMemo(() => filterYoutubeChannelVideosByStatus(allVideos, statusFilter), [allVideos, statusFilter]);

  const videos = useClientPaginatedList(filteredVideos, {
    limit: VIDEO_LIMIT,
    resetKey: `${videoResetKey}:${statusFilter}`,
  });

  const videosEmptyMessage = statusFilter !== 'all' ? 'Không có video nào khớp với trạng thái đã chọn.' : 'Không tìm thấy video nào.';

  const selectedVideos = useMemo(
    () => allVideos.filter(video => selectedVideoIds.has(video.id)),
    [allVideos, selectedVideoIds],
  );
  const canDeleteVideos =
    selectedVideos.length > 0 && selectedVideos.every(video => isDeletableVideoStatus(video.status));

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

  function handleVideoCountConfirm(count: number) {
    if (!id || !channel || !isStoredReupChannelType(channel.type)) return;

    const isPrepare = videoCountAction === 'prepare';
    setVideoCountAction(null);
    void enqueueTask({
      type: 'create_video',
      title: isPrepare
        ? `Đang chuẩn bị video: ${channel.name}`
        : `Đang tạo video: ${channel.name}`,
      subtitle: `${channel.handle} · ${count} video`,
      payload: {
        channelId: id,
        channelName: channel.name,
        channelHandle: channel.handle,
        videoCount: count,
        ...(isPrepare ? { prepareOnly: true } : {}),
      },
    });
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
              canCreateVideo={isStoredReupChannelType(channel.type)}
              openingProfile={openingProfile}
              canDeleteVideos={canDeleteVideos}
              deletingVideos={deletingVideos}
              onSync={handleSyncVideos}
              onEdit={() => setEditOpen(true)}
              onCreateVideo={() => setVideoCountAction('create')}
              onPrepareVideo={() => setVideoCountAction('prepare')}
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

          <CreateVideoCountModal
            open={videoCountAction !== null}
            onClose={() => setVideoCountAction(null)}
            onConfirm={handleVideoCountConfirm}
            title={
              videoCountAction === 'prepare'
                ? 'Số lượng video cần chuẩn bị'
                : 'Số lượng video cần tạo'
            }
            description={
              channel
                ? videoCountAction === 'prepare'
                  ? `Chuẩn bị video cho kênh ${channel.name}`
                  : `Tạo video cho kênh ${channel.name}`
                : undefined
            }
          />

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
              loading={videosLoading}
              error={videosError}
              emptyMessage={videosEmptyMessage}
              enableRowSelection
              selectedIds={selectedVideoIds}
              onToggleRow={handleToggleVideoRow}
              onToggleAll={handleToggleAllVideos}
              onCommentClick={setSelectedVideo}
              onTitleClick={setContentVideo}
            />
            <MailAccountsPagination
              page={videos.page}
              limit={videos.limit}
              total={videos.total}
              totalPages={videos.totalPages}
              onPageChange={videos.setPage}
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
