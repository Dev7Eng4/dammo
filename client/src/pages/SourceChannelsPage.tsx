import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchSourceChannels } from '../api/sourceChannels';
import { MailAccountsPagination } from '../components/mail-accounts/MailAccountsPagination';
import { AddSourceChannelModal } from '../components/source-channels/AddSourceChannelModal';
import { SourceChannelsTable } from '../components/source-channels/SourceChannelsTable';
import { SourceChannelsToolbar } from '../components/source-channels/SourceChannelsToolbar';
import type {
  SourceChannel,
  SourcePlatformFilter,
  SourcePurposeFilter,
  SourceRiskFilter,
} from '../types/sourceChannel';

const LIMIT = 20;
const SEARCH_DEBOUNCE_MS = 300;

export function SourceChannelsPage() {
  const navigate = useNavigate();
  const [sources, setSources] = useState<SourceChannel[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [platformFilter, setPlatformFilter] = useState<SourcePlatformFilter>('all');
  const [purposeFilter, setPurposeFilter] = useState<SourcePurposeFilter>('all');
  const [riskFilter, setRiskFilter] = useState<SourceRiskFilter>('all');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search]);

  const loadSources = useCallback(
    async (
      platform: SourcePlatformFilter,
      purpose: SourcePurposeFilter,
      risk: SourceRiskFilter,
      query: string,
      currentPage: number,
    ) => {
      setLoading(true);
      try {
        const data = await fetchSourceChannels(platform, purpose, risk, query, currentPage, LIMIT);
        setSources(data.items);
        setTotal(data.total);
        setPage(data.page);
        setTotalPages(data.totalPages);
      } catch {
        setSources([]);
        setTotal(0);
        setTotalPages(1);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    loadSources(platformFilter, purposeFilter, riskFilter, debouncedSearch, page);
  }, [platformFilter, purposeFilter, riskFilter, debouncedSearch, page, loadSources]);

  function handlePlatformFilterChange(next: SourcePlatformFilter) {
    setPlatformFilter(next);
    setPage(1);
  }

  function handlePurposeFilterChange(next: SourcePurposeFilter) {
    setPurposeFilter(next);
    setPage(1);
  }

  function handleRiskFilterChange(next: SourceRiskFilter) {
    setRiskFilter(next);
    setPage(1);
  }

  function handleSearchChange(value: string) {
    setSearch(value);
    setPage(1);
  }

  function handlePageChange(nextPage: number) {
    setPage(nextPage);
  }

  function handleSelect(id: string) {
    navigate(`/source-channels/${id}`);
  }

  function handleAddSuccess() {
    setPage(1);
    loadSources(platformFilter, purposeFilter, riskFilter, debouncedSearch, 1);
  }

  return (
    <div className="-m-6 flex h-[calc(100svh-3.5rem)] flex-col">
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto p-6">
          <SourceChannelsToolbar
            platformFilter={platformFilter}
            purposeFilter={purposeFilter}
            riskFilter={riskFilter}
            search={search}
            onPlatformFilterChange={handlePlatformFilterChange}
            onPurposeFilterChange={handlePurposeFilterChange}
            onRiskFilterChange={handleRiskFilterChange}
            onSearchChange={handleSearchChange}
            onAddSource={() => setShowAddModal(true)}
          />
          <div className="mt-4 card-surface px-5 pt-3 pb-4">
            <SourceChannelsTable sources={sources} loading={loading} onSelect={handleSelect} />
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

      <AddSourceChannelModal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSuccess={handleAddSuccess}
      />
    </div>
  );
}
