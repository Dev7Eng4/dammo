import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchSourceChannels } from '../api/sourceChannels';
import { fetchYoutubeChannels, fetchYoutubeChannelStats } from '../api/youtubeChannels';
import { MailAccountsPagination } from '../components/mail-accounts/MailAccountsPagination';
import { AddYoutubeChannelModal } from '../components/youtube-channels/AddYoutubeChannelModal';
import { EditYoutubeChannelModal } from '../components/youtube-channels/EditYoutubeChannelModal';
import { YoutubeChannelStatCards } from '../components/youtube-channels/YoutubeChannelStatCards';
import { YoutubeChannelsTable } from '../components/youtube-channels/YoutubeChannelsTable';
import { YoutubeChannelsToolbar } from '../components/youtube-channels/YoutubeChannelsToolbar';
import { useAbortableEffect, useDebouncedValue, usePaginatedList, useTaskQueue } from '../hooks';
import type { YoutubeChannel, YoutubeChannelStats, YoutubeChannelTypeFilter, YoutubeMonetizationFilter } from '../types/youtubeChannel';
import type { SourceChannel } from '../types/sourceChannel';
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
  const [showEditModal, setShowEditModal] = useState(false);
  const [sources, setSources] = useState<SourceChannel[]>([]);

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

  const selectedChannels = list.items.filter(channel => selectedIds.has(channel.id));
  const selectedChannel = selectedIds.size === 1 ? selectedChannels[0] ?? null : null;
  const isBulkCreate = selectedIds.size === 0;
  const allSelectedAreReup = selectedChannels.length > 0 && selectedChannels.every(channel => isStoredReupChannelType(channel.type));
  const canCreateVideo =
    isBulkCreate ||
    (selectedIds.size === 1 && selectedChannel !== null && isStoredReupChannelType(selectedChannel.type)) ||
    (selectedIds.size > 1 && allSelectedAreReup);
  const canUpload = canCreateVideo;
  const createVideoDisabledReason =
    selectedIds.size > 1 && !allSelectedAreReup
      ? 'All selected channels must be Reup Audio or Reup Video'
      : selectedIds.size === 1 && selectedChannel && !isStoredReupChannelType(selectedChannel.type)
      ? 'Only Reup Audio or Reup Video channels can create videos'
      : isBulkCreate
      ? 'Tạo video cho tất cả reup channels'
      : selectedIds.size > 1
      ? `Tạo video cho ${selectedIds.size} kênh đã chọn`
      : undefined;
  const uploadDisabledReason =
    selectedIds.size > 1 && !allSelectedAreReup
      ? 'All selected channels must be Reup Audio or Reup Video'
      : selectedIds.size === 1 && selectedChannel && !isStoredReupChannelType(selectedChannel.type)
      ? 'Only Reup Audio or Reup Video channels can upload videos'
      : isBulkCreate
      ? 'Upload videos for all reup channels'
      : selectedIds.size > 1
      ? `Upload videos for ${selectedIds.size} selected channels`
      : undefined;
  const canEdit = selectedIds.size === 1;
  const editDisabledReason =
    selectedIds.size === 0 ? 'Select a channel to edit' : selectedIds.size > 1 ? 'Select exactly one channel to edit' : undefined;

  useAbortableEffect(async signal => {
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

  useAbortableEffect(
    async signal => {
      try {
        const data = await fetchSourceChannels('all', 'all', 'all', '', 1, 100, { signal });
        setSources(data.items);
      } catch {
        if (signal.aborted) return;
        setSources([]);
      }
    },
    [channelsRefreshKey]
  );

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
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleToggleAll() {
    if (selectedIds.size === list.items.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(list.items.map(c => c.id)));
    }
  }

  function handleAddSuccess() {
    setShowAddModal(false);
    list.markLoading();
    list.resetPage();
    setChannelsRefreshKey(key => key + 1);

    void fetchYoutubeChannelStats()
      .then(setStats)
      .catch(() => setStats(null));
  }

  function handleEditSuccess(_updated?: YoutubeChannel) {
    setShowEditModal(false);
    list.markLoading();
    setChannelsRefreshKey(key => key + 1);

    void fetchYoutubeChannelStats()
      .then(setStats)
      .catch(() => setStats(null));
  }

  function handleCreateVideo() {
    if (selectedIds.size === 0) {
      void enqueueTask({
        type: 'create_video',
        title: 'Creating videos for all reup channels',
        subtitle: 'Bulk reup run',
        payload: { allReupChannels: true },
      });
      return;
    }

    if (selectedIds.size > 1) {
      if (!allSelectedAreReup) return;

      void enqueueTask({
        type: 'create_video',
        title: `Creating videos for ${selectedIds.size} channels`,
        subtitle: `${selectedIds.size} selected channels`,
        payload: { channelIds: Array.from(selectedIds) },
      });
      return;
    }

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

  function handleUpload() {
    if (selectedIds.size === 0) {
      void enqueueTask({
        type: 'upload_video',
        title: 'Uploading videos for all reup channels',
        subtitle: 'Bulk upload run',
        payload: { allReupChannels: true },
      });
      return;
    }

    if (selectedIds.size > 1) {
      if (!allSelectedAreReup) return;

      void enqueueTask({
        type: 'upload_video',
        title: `Uploading videos for ${selectedIds.size} channels`,
        subtitle: `${selectedIds.size} selected channels`,
        payload: { channelIds: Array.from(selectedIds) },
      });
      return;
    }

    if (!selectedChannel) return;
    if (!isStoredReupChannelType(selectedChannel.type)) return;

    void enqueueTask({
      type: 'upload_video',
      title: `Uploading: ${selectedChannel.name}`,
      subtitle: selectedChannel.handle,
      payload: { channelId: selectedChannel.id },
    });
  }

  return (
    <div className='-m-6 flex h-[calc(100svh-3.5rem)] flex-col'>
      <div className='flex min-w-0 flex-1 flex-col overflow-hidden'>
        <div className='flex-1 overflow-y-auto p-6'>
          {/* <YoutubeChannelStatCards data={stats} loading={statsLoading} /> */}
          <div className='mt-4 border-b border-border pb-4'>
            <YoutubeChannelsToolbar
              typeFilter={typeFilter}
              monetizationFilter={monetizationFilter}
              search={search}
              canCreateVideo={canCreateVideo}
              createVideoDisabledReason={createVideoDisabledReason}
              onTypeFilterChange={handleTypeFilterChange}
              onMonetizationFilterChange={handleMonetizationFilterChange}
              onSearchChange={handleSearchChange}
              onAddChannel={() => setShowAddModal(true)}
              onCreateVideo={handleCreateVideo}
              canUpload={canUpload}
              uploadDisabledReason={uploadDisabledReason}
              onUpload={handleUpload}
              canEdit={canEdit}
              editDisabledReason={editDisabledReason}
              onEdit={() => setShowEditModal(true)}
            />
          </div>
          {list.error ? <p className='mt-2 text-xs text-danger'>{list.error}</p> : null}
          <div className='mt-4 card-surface px-5 pt-3 pb-4'>
            <YoutubeChannelsTable
              channels={list.items}
              sources={sources}
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

      <AddYoutubeChannelModal open={showAddModal} onClose={() => setShowAddModal(false)} onSuccess={handleAddSuccess} />

      {selectedChannel ? (
        <EditYoutubeChannelModal
          open={showEditModal}
          channel={selectedChannel}
          onClose={() => setShowEditModal(false)}
          onSuccess={handleEditSuccess}
        />
      ) : null}
    </div>
  );
}
