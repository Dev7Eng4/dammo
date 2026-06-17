import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchYoutubeChannels, fetchYoutubeChannelStats } from '../api/youtubeChannels';
import { MailAccountsPagination } from '../components/mail-accounts/MailAccountsPagination';
import { AddYoutubeChannelModal } from '../components/youtube-channels/AddYoutubeChannelModal';
import { YoutubeChannelStatCards } from '../components/youtube-channels/YoutubeChannelStatCards';
import { YoutubeChannelsTable } from '../components/youtube-channels/YoutubeChannelsTable';
import { YoutubeChannelsToolbar } from '../components/youtube-channels/YoutubeChannelsToolbar';
import { useAbortableEffect, useDebouncedValue, usePaginatedList } from '../hooks';
import type {
  YoutubeChannelStats,
  YoutubeChannelTypeFilter,
  YoutubeMonetizationFilter,
} from '../types/youtubeChannel';

const LIMIT = 20;
const SEARCH_DEBOUNCE_MS = 300;

export function YoutubeChannelsPage() {
  const navigate = useNavigate();
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
    onFetched: () => setSelectedIds(new Set()),
  });

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

  function handleTypeFilterChange(next: YoutubeChannelTypeFilter) {
    list.markLoading();
    setTypeFilter(next);
    list.resetPage();
  }

  function handleMonetizationFilterChange(next: YoutubeMonetizationFilter) {
    list.markLoading();
    setMonetizationFilter(next);
    list.resetPage();
  }

  function handleSearchChange(value: string) {
    list.markLoading();
    setSearch(typeof value === 'string' ? value : '');
    list.resetPage();
  }

  function handlePageChange(nextPage: number) {
    list.markLoading();
    list.setPage(nextPage);
  }

  function handleSelect(id: string) {
    navigate(`/youtube-channels/${id}`);
  }

  function handleToggleRow(id: string) {
    setSelectedIds((prev) => {
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
              onTypeFilterChange={handleTypeFilterChange}
              onMonetizationFilterChange={handleMonetizationFilterChange}
              onSearchChange={handleSearchChange}
              onAddChannel={() => setShowAddModal(true)}
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
