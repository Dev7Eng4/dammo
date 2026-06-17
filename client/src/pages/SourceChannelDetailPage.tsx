import { useState } from 'react';
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
import { useAbortableEffect, usePaginatedList } from '../hooks';
import type { SourceChannel, SourceVideoDurationFilter } from '../types/sourceChannel';

const VIDEO_LIMIT = 20;

export function SourceChannelDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [source, setSource] = useState<SourceChannel | null>(null);
  const [durationFilter, setDurationFilter] = useState<SourceVideoDurationFilter>('all');
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(!id);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  const videos = usePaginatedList({
    fetcher: ({ page, limit, duration, signal }) =>
      fetchSourceChannelVideos(id!, page, limit, duration, { signal }),
    query: { duration: durationFilter },
    limit: VIDEO_LIMIT,
    enabled: Boolean(id),
  });

  useAbortableEffect(
    async (signal) => {
      if (!id) return;

      setLoading(true);
      setNotFound(false);

      try {
        const data = await fetchSourceChannel(id, { signal });
        setSource(data);
      } catch {
        if (signal.aborted) return;
        setSource(null);
        setNotFound(true);
      } finally {
        if (!signal.aborted) setLoading(false);
      }
    },
    [id],
    { enabled: Boolean(id) },
  );

  async function handleRefreshSource() {
    if (!id) return;

    setRefreshing(true);
    setRefreshError(null);

    try {
      const { item } = await refreshSourceChannel(id);
      setSource(item);
      videos.markLoading();
      videos.resetPage();
      videos.refresh();
    } catch (err) {
      setRefreshError(err instanceof Error ? err.message : 'Failed to update source');
    } finally {
      setRefreshing(false);
    }
  }

  function handleDurationFilterChange(next: SourceVideoDurationFilter) {
    videos.markLoading();
    setDurationFilter(next);
    videos.resetPage();
  }

  if (!id || notFound) {
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
          {source?.platform === 'youtube' || videos.loading ? (
            <>
              <SourceChannelVideosToolbar
                durationFilter={durationFilter}
                onDurationFilterChange={handleDurationFilterChange}
              />
              <SourceChannelVideosTable
                videos={videos.items}
                loading={videos.loading}
                error={videos.error}
              />
              <MailAccountsPagination
                page={videos.page}
                limit={videos.limit}
                total={videos.total}
                totalPages={videos.totalPages}
                onPageChange={(nextPage) => {
                  videos.markLoading();
                  videos.setPage(nextPage);
                }}
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
