import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  fetchSourceChannel,
  fetchSourceChannelVideos,
  refreshSourceChannel,
} from '../api/sourceChannels';
import { MailAccountsPagination } from '../components/mail-accounts/MailAccountsPagination';
import {
  SourceChannelDetailHeader,
  SourceChannelDetailHeaderSkeleton,
} from '../components/source-channels/SourceChannelDetailHeader';
import { SourceChannelVideosTable } from '../components/source-channels/SourceChannelVideosTable';
import { SourceChannelVideosToolbar } from '../components/source-channels/SourceChannelVideosToolbar';
import type { SourceChannel, SourceChannelVideo, SourceVideoDurationFilter } from '../types/sourceChannel';

const VIDEO_LIMIT = 20;

export function SourceChannelDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [source, setSource] = useState<SourceChannel | null>(null);
  const [videos, setVideos] = useState<SourceChannelVideo[]>([]);
  const [videoPage, setVideoPage] = useState(1);
  const [videoTotal, setVideoTotal] = useState(0);
  const [videoTotalPages, setVideoTotalPages] = useState(1);
  const [durationFilter, setDurationFilter] = useState<SourceVideoDurationFilter>('all');
  const [loading, setLoading] = useState(true);
  const [videosLoading, setVideosLoading] = useState(true);
  const [videosError, setVideosError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      setNotFound(true);
      setLoading(false);
      return;
    }

    let cancelled = false;

    setLoading(true);
    setNotFound(false);
    setRefreshError(null);

    fetchSourceChannel(id)
      .then((data) => {
        if (!cancelled) setSource(data);
      })
      .catch(() => {
        if (!cancelled) {
          setSource(null);
          setNotFound(true);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    if (!id) return;

    let cancelled = false;

    setVideosLoading(true);
    setVideosError(null);

    fetchSourceChannelVideos(id, videoPage, VIDEO_LIMIT, durationFilter)
      .then((data) => {
        if (!cancelled) {
          setVideos(data.items);
          setVideoTotal(data.total);
          setVideoPage(data.page);
          setVideoTotalPages(data.totalPages);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setVideos([]);
          setVideoTotal(0);
          setVideoTotalPages(1);
          setVideosError(err instanceof Error ? err.message : 'Failed to load videos');
        }
      })
      .finally(() => {
        if (!cancelled) setVideosLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [id, videoPage, durationFilter]);

  async function handleRefreshSource() {
    if (!id) return;

    setRefreshing(true);
    setRefreshError(null);

    try {
      const { item } = await refreshSourceChannel(id);
      setSource(item);
      setVideoPage(1);
      const data = await fetchSourceChannelVideos(id, 1, VIDEO_LIMIT, durationFilter);
      setVideos(data.items);
      setVideoTotal(data.total);
      setVideoPage(data.page);
      setVideoTotalPages(data.totalPages);
    } catch (err) {
      setRefreshError(err instanceof Error ? err.message : 'Failed to update source');
    } finally {
      setRefreshing(false);
    }
  }

  function handleDurationFilterChange(next: SourceVideoDurationFilter) {
    setDurationFilter(next);
    setVideoPage(1);
  }

  if (notFound) {
    return (
      <div className="-m-6 flex h-[calc(100svh-3.5rem)] flex-col">
        <div className="flex flex-1 flex-col items-center justify-center p-6 text-center">
          <p className="text-sm text-neutral-400">Source channel not found.</p>
          <Link to="/source-channels" className="mt-3 text-sm text-secondary-400 hover:text-secondary-300">
            Back to Sources
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="-m-6 flex h-[calc(100svh-3.5rem)] flex-col">
      <div className="flex-1 overflow-y-auto p-6">
        {loading || !source ? (
          <SourceChannelDetailHeaderSkeleton />
        ) : (
          <SourceChannelDetailHeader
            source={source}
            refreshing={refreshing}
            refreshError={refreshError}
            onRefresh={handleRefreshSource}
          />
        )}

        <div className="mt-4 card-surface px-5 pt-3 pb-4">
          {source?.platform === 'youtube' || videosLoading ? (
            <>
              <SourceChannelVideosToolbar
                durationFilter={durationFilter}
                onDurationFilterChange={handleDurationFilterChange}
              />
              <SourceChannelVideosTable
                videos={videos}
                loading={videosLoading}
                error={videosError}
              />
              <MailAccountsPagination
                page={videoPage}
                limit={VIDEO_LIMIT}
                total={videoTotal}
                totalPages={videoTotalPages}
                onPageChange={setVideoPage}
              />
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <p className="text-sm text-neutral-400">Video list is only available for YouTube sources.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
