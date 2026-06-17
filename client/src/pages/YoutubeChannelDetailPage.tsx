import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { isAbortError } from '../api/http';
import {
  fetchYoutubeChannel,
  fetchYoutubeChannelVideos,
  syncYoutubeChannelVideos,
} from '../api/youtubeChannels';
import { MailAccountsPagination } from '../components/mail-accounts/MailAccountsPagination';
import { EditYoutubeChannelModal } from '../components/youtube-channels/EditYoutubeChannelModal';
import {
  YoutubeChannelDetailHeader,
  YoutubeChannelDetailHeaderSkeleton,
} from '../components/youtube-channels/YoutubeChannelDetailHeader';
import { YoutubeChannelVideosTable } from '../components/youtube-channels/YoutubeChannelVideosTable';
import { VideoCommentsDrawer } from '../components/youtube-channels/VideoCommentsDrawer';
import { useAbortableEffect, useClientPaginatedList } from '../hooks';
import type { YoutubeChannel, YoutubeChannelVideo } from '../types/youtubeChannel';

const VIDEO_LIMIT = 20;

export function YoutubeChannelDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [channel, setChannel] = useState<YoutubeChannel | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(!id);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [allVideos, setAllVideos] = useState<YoutubeChannelVideo[]>([]);
  const [videosLoading, setVideosLoading] = useState(true);
  const [videosError, setVideosError] = useState<string | null>(null);
  const [videoResetKey, setVideoResetKey] = useState(0);
  const [selectedVideo, setSelectedVideo] = useState<YoutubeChannelVideo | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  const videos = useClientPaginatedList(allVideos, {
    limit: VIDEO_LIMIT,
    resetKey: videoResetKey,
  });

  useAbortableEffect(
    async (signal) => {
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
    async (signal) => {
      if (!id) return;

      setVideosLoading(true);
      setVideosError(null);

      try {
        const data = await fetchYoutubeChannelVideos(id, { signal });
        setAllVideos(data.items);
        setVideoResetKey((key) => key + 1);
      } catch (err) {
        if (isAbortError(err)) return;
        setAllVideos([]);
        setVideosError(err instanceof Error ? err.message : 'Failed to load videos');
      } finally {
        if (!signal.aborted) setVideosLoading(false);
      }
    },
    [id],
    { enabled: Boolean(id) },
  );

  async function handleSyncVideos() {
    if (!id) return;

    setSyncing(true);
    setSyncError(null);
    setVideosLoading(true);
    setVideosError(null);

    try {
      const { item, videos: syncedVideos } = await syncYoutubeChannelVideos(id);
      setChannel(item);
      setAllVideos(syncedVideos);
      setVideoResetKey((key) => key + 1);
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : 'Failed to sync videos');
    } finally {
      setSyncing(false);
      setVideosLoading(false);
    }
  }

  if (!id || notFound) {
    return (
      <div className="-m-6 flex h-[calc(100svh-3.5rem)] flex-col">
        <div className="flex flex-1 flex-col items-center justify-center p-6 text-center">
          <p className="text-sm text-neutral-400">YouTube channel not found.</p>
          <Link to="/youtube-channels" className="mt-3 text-sm text-secondary-400 hover:text-secondary-300">
            Back to YouTube Channels
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="-m-6 flex h-[calc(100svh-3.5rem)] flex-col lg:flex-row">
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto p-6">
          {loading || !channel ? (
            <YoutubeChannelDetailHeaderSkeleton />
          ) : (
            <YoutubeChannelDetailHeader
              channel={channel}
              syncing={syncing}
              syncError={syncError}
              onSync={handleSyncVideos}
              onEdit={() => setEditOpen(true)}
            />
          )}

          {channel ? (
            <EditYoutubeChannelModal
              open={editOpen}
              channel={channel}
              onClose={() => setEditOpen(false)}
              onSuccess={async (updated) => {
                try {
                  const live = await fetchYoutubeChannel(id);
                  setChannel(live);
                } catch {
                  setChannel((current) =>
                    current ? { ...current, ...updated } : updated,
                  );
                }
              }}
            />
          ) : null}

          <div className="mt-4 card-surface px-5 pt-3 pb-4">
            <YoutubeChannelVideosTable
              videos={videos.pageItems}
              loading={videosLoading}
              error={videosError}
              onCommentClick={setSelectedVideo}
            />
            <MailAccountsPagination
              page={videos.page}
              limit={videos.limit}
              total={videos.total}
              totalPages={videos.totalPages}
              onPageChange={videos.setPage}
            />
          </div>
        </div>
      </div>

      {selectedVideo ? (
        <div className="fixed inset-y-0 right-0 z-50 flex lg:static lg:z-auto">
          <VideoCommentsDrawer
            open={Boolean(selectedVideo)}
            channelId={id}
            video={selectedVideo}
            onClose={() => setSelectedVideo(null)}
          />
        </div>
      ) : null}
    </div>
  );
}
