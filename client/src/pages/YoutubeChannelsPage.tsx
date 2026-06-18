import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchYoutubeChannels, fetchYoutubeChannelStats } from '../api/youtubeChannels';
import { MailAccountsPagination } from '../components/mail-accounts/MailAccountsPagination';
import { AddYoutubeChannelModal } from '../components/youtube-channels/AddYoutubeChannelModal';
import { YoutubeChannelStatCards } from '../components/youtube-channels/YoutubeChannelStatCards';
import { YoutubeChannelsTable } from '../components/youtube-channels/YoutubeChannelsTable';
import { YoutubeChannelsToolbar } from '../components/youtube-channels/YoutubeChannelsToolbar';
import { useAbortableEffect, useDebouncedValue, usePaginatedList, useTaskQueue } from '../hooks';
import type {
  YoutubeChannelStats,
  YoutubeChannelTypeFilter,
  YoutubeMonetizationFilter,
} from '../types/youtubeChannel';
import { isStoredReupChannelType } from '../types/youtubeChannel';

const LIMIT = 20;
const SEARCH_DEBOUNCE_MS = 300;

export function YoutubeChannelsPage() {
  const navigate = useNavigate();
  const { enqueueTask } = useTaskQueue();
  const [stats, setStats] = useState<YoutubeChannelStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [typeFilter, setTypeFilter] = useState<YoutubeChannelTypeFilter>('all');
  const [monetizationFilter, setMonetizationFilter] = useState<YoutubeMonetizationFilter>('all');
  const [search, setSearch] = useState('');
  const [channelsRefreshKey, setChannelsRefreshKey] = useState(0);
  const [showAddModal, setShowAddModal] = useState(false);

  const debouncedSearch = useDebouncedValue(search, SEARCH_DEBOUNCE_MS);

  const list = usePaginatedList({
    fetcher: ({ type, monetization, query, page, limit, signal }) =>
      fetchYoutubeChannels(type, monetization, query, page, limit, { signal }),
    query: {
      type: typeFilter,
      monetization: monetizationFilter,
      query: debouncedSearch,
    },
    limit: LIMIT,
    refreshKey: channelsRefreshKey,
  });

  const selectedChannel =
    selectedIds.size === 1
      ? list.items.find((channel) => selectedIds.has(channel.id)) ?? null
      : null;
  const canClickCreateVideo = selectedChannel !== null;
  const canCreateVideo =
    canClickCreateVideo && isStoredReupChannelType(selectedChannel.type);

  useAbortableEffect(async (signal) => {
    setStatsLoading(true);

    try {
      const data = await fetchYoutubeChannelStats({ signal });
      setStats(data);
    } catch {
      if (signal.aborted) return;
      setStats(null);
    } finally {
      if (!signal.aborted) setStatsLoading(false);
    }
  }, []);

  function clearSelection() {
    setSelectedIds(new Set());
  }

  function handleTypeFilterChange(next: YoutubeChannelTypeFilter) {
    list.markLoading();
    setTypeFilter(next);
    list.resetPage();
    clearSelection();
  }

  function handleMonetizationFilterChange(next: YoutubeMonetizationFilter) {
    list.markLoading();
    setMonetizationFilter(next);
    list.resetPage();
    clearSelection();
  }

  function handleSearchChange(value: string) {
    list.markLoading();
    setSearch(typeof value === 'string' ? value : '');
    list.resetPage();
    clearSelection();
  }

  function handlePageChange(nextPage: number) {
    list.markLoading();
    list.setPage(nextPage);
    clearSelection();
  }

  function handleSelect(id: string) {
    navigate(`/youtube-channels/${id}`);
  }

  function handleToggleRow(id: string) {
    setSelectedIds((prev) => {
      if (prev.has(id) && prev.size === 1) return new Set();
      return new Set([id]);
    });
  }

  function handleToggleAll() {
    if (selectedIds.size === list.items.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(list.items.map((c) => c.id)));
    }
  }

  function handleAddSuccess() {
    setShowAddModal(false);
    list.markLoading();
    list.resetPage();
    setChannelsRefreshKey((key) => key + 1);

    void fetchYoutubeChannelStats()
      .then(setStats)
      .catch(() => setStats(null));
  }

  function handleCreateVideo() {
    if (!selectedChannel) return;
    if (!isStoredReupChannelType(selectedChannel.type)) return;

    void enqueueTask({
      type: 'create_video',
      title: `Creating video: ${selectedChannel.name}`,
      subtitle: selectedChannel.handle,
      payload: {
        channelId: selectedChannel.id,
        channelName: selectedChannel.name,
        channelHandle: selectedChannel.handle,
      },
    });
  }

  return (
    <div className="-m-6 flex h-[calc(100svh-3.5rem)] flex-col">
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto p-6">
          <YoutubeChannelStatCards data={stats} loading={statsLoading} />
          <div className="mt-4 border-b border-border pb-4">
            <YoutubeChannelsToolbar
              typeFilter={typeFilter}
              monetizationFilter={monetizationFilter}
              search={search}
              canCreateVideo={canCreateVideo}
              createVideoDisabledReason={
                !canClickCreateVideo
                  ? 'Select one channel using the checkbox'
                  : !canCreateVideo
                    ? 'Only Reup Audio or Reup Video channels can create videos'
                    : undefined
              }
              onTypeFilterChange={handleTypeFilterChange}
              onMonetizationFilterChange={handleMonetizationFilterChange}
              onSearchChange={handleSearchChange}
              onAddChannel={() => setShowAddModal(true)}
              onCreateVideo={handleCreateVideo}
            />
          </div>
          {list.error ? (
            <p className="mt-2 text-xs text-danger">{list.error}</p>
          ) : null}
          <div className="mt-4 card-surface px-5 pt-3 pb-4">
            <YoutubeChannelsTable
              channels={list.items}
              selectedIds={selectedIds}
              loading={list.loading}
              onSelect={handleSelect}
              onToggleRow={handleToggleRow}
              onToggleAll={handleToggleAll}
            />
            <MailAccountsPagination
              page={list.page}
              limit={list.limit}
              total={list.total}
              totalPages={list.totalPages}
              onPageChange={handlePageChange}
            />
          </div>
        </div>
      </div>

      <AddYoutubeChannelModal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSuccess={handleAddSuccess}
      />
    </div>
  );
}
