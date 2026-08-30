import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { fetchNiches } from '../api/niches';
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
import { useTaskQueue } from '../hooks/useTaskQueue';
import type { Niche } from '../types/niche';
import type { SourceChannel, SourceVideoDurationFilter } from '../types/sourceChannel';

export function SourceChannelDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { enqueueTask } = useTaskQueue();
  const [source, setSource] = useState<SourceChannel | null>(null);
  const [niches, setNiches] = useState<Niche[]>([]);
  const [durationFilter, setDurationFilter] = useState<SourceVideoDurationFilter>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(!id);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [limit, setLimit] = useState(20);

  const videos = usePaginatedList({
    fetcher: ({ page, limit: pageLimit, duration, signal }) =>
      fetchSourceChannelVideos(id!, page, pageLimit, duration, { signal }),
    query: { duration: durationFilter },
    limit,
    enabled: Boolean(id),
  });

  useAbortableEffect(async (signal) => {
    try {
      const data = await fetchNiches({ signal });
      setNiches(data.items);
    } catch {
      if (signal.aborted) return;
      setNiches([]);
    }
  }, []);

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

  const canDownload =
    selectedIds.size > 0 &&
    source != null &&
    source.platform === 'youtube' &&
    (source.purpose === 'reup' || source.purpose === 'background_footage');

  const downloadDisabledReason =
    selectedIds.size === 0
      ? 'Chọn video để tải xuống'
      : source == null
        ? undefined
        : source.platform !== 'youtube'
          ? 'Chỉ hỗ trợ tải xuống cho nguồn YouTube'
          : source.purpose !== 'reup' && source.purpose !== 'background_footage'
            ? 'Chỉ hỗ trợ tải cho nguồn Reup hoặc Footage nền'
            : undefined;

  function clearSelection() {
    setSelectedIds(new Set());
  }

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
      clearSelection();
    } catch (err) {
      setRefreshError(err instanceof Error ? err.message : 'Không thể cập nhật nguồn');
    } finally {
      setRefreshing(false);
    }
  }

  function handleDurationFilterChange(next: SourceVideoDurationFilter) {
    videos.markLoading();
    setDurationFilter(next);
    videos.resetPage();
    clearSelection();
  }

  function handleToggleRow(videoId: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(videoId)) next.delete(videoId);
      else next.add(videoId);
      return next;
    });
  }

  function handleToggleAll() {
    if (selectedIds.size === videos.items.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(videos.items.map(video => video.id)));
    }
  }

  function handleDownload() {
    if (!source || selectedIds.size === 0 || !canDownload) return;

    void enqueueTask({
      type: 'download_source',
      title: `Đang tải: ${source.name}`,
      subtitle: `${selectedIds.size} video đã chọn`,
      payload: {
        sourceId: source.id,
        sourceName: source.name,
        videoIds: Array.from(selectedIds),
      },
    });
  }

  if (!id || notFound) {
    return (
      <div className="-m-6 flex h-svh flex-col">
        <div className="flex flex-1 flex-col items-center justify-center p-6 text-center">
          <p className="text-sm text-neutral-400">Không tìm thấy kênh nguồn.</p>
          <Link to="/source-channels" className="mt-3 text-sm text-secondary-400 hover:text-secondary-300">
            Quay lại nguồn
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="-m-6 flex h-svh flex-col">
      <div className="flex-1 overflow-y-auto p-6">
        {loading || !source ? (
          <SourceChannelDetailHeaderSkeleton />
        ) : (
          <SourceChannelDetailHeader
            source={source}
            niches={niches}
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
                canDownload={canDownload}
                downloadDisabledReason={downloadDisabledReason}
                onDownload={handleDownload}
              />
              <SourceChannelVideosTable
                videos={videos.items}
                loading={videos.loading}
                error={videos.error}
                rowNumberStart={(videos.page - 1) * videos.limit + 1}
                selectedIds={selectedIds}
                onToggleRow={handleToggleRow}
                onToggleAll={handleToggleAll}
              />
              <MailAccountsPagination
                page={videos.page}
                limit={videos.limit}
                total={videos.total}
                totalPages={videos.totalPages}
                onPageChange={(nextPage) => {
                  videos.markLoading();
                  videos.setPage(nextPage);
                  clearSelection();
                }}
                onLimitChange={(nextLimit) => {
                  videos.markLoading();
                  setLimit(nextLimit);
                  videos.setPage(1);
                  clearSelection();
                }}
                locale="vi"
              />
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <p className="text-sm text-neutral-400">Danh sách video chỉ khả dụng cho nguồn YouTube.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
