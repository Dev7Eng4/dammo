import { useCallback, useEffect, useState } from 'react';
import { fetchYoutubeChannel, fetchYoutubeChannels, fetchYoutubeChannelStats } from '../api/youtubeChannels';
import { MailAccountsPagination } from '../components/mail-accounts/MailAccountsPagination';
import { AddYoutubeChannelModal } from '../components/youtube-channels/AddYoutubeChannelModal';
import { YoutubeChannelDetailPanel } from '../components/youtube-channels/YoutubeChannelDetailPanel';
import { YoutubeChannelStatCards } from '../components/youtube-channels/YoutubeChannelStatCards';
import { YoutubeChannelsTable } from '../components/youtube-channels/YoutubeChannelsTable';
import { YoutubeChannelsToolbar } from '../components/youtube-channels/YoutubeChannelsToolbar';
import type {
  YoutubeChannel,
  YoutubeChannelStats,
  YoutubeChannelTypeFilter,
  YoutubeMonetizationFilter,
} from '../types/youtubeChannel';

const LIMIT = 20;
const SEARCH_DEBOUNCE_MS = 300;

export function YoutubeChannelsPage() {
  const [channels, setChannels] = useState<YoutubeChannel[]>([]);
  const [stats, setStats] = useState<YoutubeChannelStats | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedChannel, setSelectedChannel] = useState<YoutubeChannel | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [typeFilter, setTypeFilter] = useState<YoutubeChannelTypeFilter>('all');
  const [monetizationFilter, setMonetizationFilter] = useState<YoutubeMonetizationFilter>('all');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search]);

  const loadStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const data = await fetchYoutubeChannelStats();
      setStats(data);
    } catch {
      setStats(null);
    } finally {
      setStatsLoading(false);
    }
  }, []);

  const loadChannels = useCallback(
    async (
      type: YoutubeChannelTypeFilter,
      monetization: YoutubeMonetizationFilter,
      query: string,
      currentPage: number,
    ) => {
      setLoading(true);
      try {
        const data = await fetchYoutubeChannels(type, monetization, query, currentPage, LIMIT);
        setChannels(data.items);
        setTotal(data.total);
        setPage(data.page);
        setTotalPages(data.totalPages);
        setSelectedIds(new Set());
      } catch {
        setChannels([]);
        setTotal(0);
        setTotalPages(1);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  useEffect(() => {
    loadChannels(typeFilter, monetizationFilter, debouncedSearch, page);
  }, [typeFilter, monetizationFilter, debouncedSearch, page, loadChannels]);

  useEffect(() => {
    if (!selectedId) {
      setSelectedChannel(null);
      return;
    }

    setDetailLoading(true);
    fetchYoutubeChannel(selectedId)
      .then(setSelectedChannel)
      .catch(() => setSelectedChannel(null))
      .finally(() => setDetailLoading(false));
  }, [selectedId]);

  function handleTypeFilterChange(next: YoutubeChannelTypeFilter) {
    setTypeFilter(next);
    setPage(1);
    setSelectedId(null);
    setSelectedChannel(null);
  }

  function handleMonetizationFilterChange(next: YoutubeMonetizationFilter) {
    setMonetizationFilter(next);
    setPage(1);
    setSelectedId(null);
    setSelectedChannel(null);
  }

  function handleSearchChange(value: string) {
    setSearch(value);
    setPage(1);
    setSelectedId(null);
    setSelectedChannel(null);
  }

  function handlePageChange(nextPage: number) {
    setPage(nextPage);
    setSelectedId(null);
    setSelectedChannel(null);
  }

  function handleSelect(id: string) {
    setSelectedId(id);
  }

  function handleClosePanel() {
    setSelectedId(null);
    setSelectedChannel(null);
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
    if (selectedIds.size === channels.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(channels.map((c) => c.id)));
    }
  }

  function handleAddSuccess() {
    setShowAddModal(false);
    setPage(1);
    loadStats();
    loadChannels(typeFilter, monetizationFilter, debouncedSearch, 1);
  }

  return (
    <div className="-m-6 flex h-[calc(100svh-3.5rem)] flex-col lg:flex-row">
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
          <div className="mt-4 card-surface px-5 pt-3 pb-4">
            <YoutubeChannelsTable
              channels={channels}
              selectedId={selectedId}
              selectedIds={selectedIds}
              loading={loading}
              onSelect={handleSelect}
              onToggleRow={handleToggleRow}
              onToggleAll={handleToggleAll}
            />
            <MailAccountsPagination
              page={page}
              limit={LIMIT}
              total={total}
              totalPages={totalPages}
              onPageChange={handlePageChange}
            />
          </div>
        </div>
      </div>

      {(selectedId || detailLoading) ? (
        <>
          <button
            type="button"
            aria-label="Close detail panel"
            onClick={handleClosePanel}
            className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          />
          <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-sm lg:static lg:z-auto lg:max-w-none">
            <YoutubeChannelDetailPanel
              channel={selectedChannel}
              loading={detailLoading}
              onClose={handleClosePanel}
            />
          </div>
        </>
      ) : null}

      <AddYoutubeChannelModal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSuccess={handleAddSuccess}
      />
    </div>
  );
}
