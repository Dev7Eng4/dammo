import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchSourceChannels, updateSourceChannel, deleteSourceChannel } from '../api/sourceChannels';
import { MailAccountsPagination } from '../components/mail-accounts/MailAccountsPagination';
import { AddSourceChannelModal } from '../components/source-channels/AddSourceChannelModal';
import { SourceChannelsTable } from '../components/source-channels/SourceChannelsTable';
import { SourceChannelsToolbar } from '../components/source-channels/SourceChannelsToolbar';
import { useToast } from '../components/ui';
import { useTaskQueue } from '../hooks/useTaskQueue';
import { useDebouncedValue, usePaginatedList } from '../hooks';
import type {
  CreateSourceChannelPayload,
  SourcePlatformFilter,
  SourcePurposeFilter,
  SourceRiskFilter,
} from '../types/sourceChannel';

const LIMIT = 20;
const SEARCH_DEBOUNCE_MS = 300;

export function SourceChannelsPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { enqueueTask } = useTaskQueue();
  const [platformFilter, setPlatformFilter] = useState<SourcePlatformFilter>('all');
  const [purposeFilter, setPurposeFilter] = useState<SourcePurposeFilter>('all');
  const [riskFilter, setRiskFilter] = useState<SourceRiskFilter>('all');
  const [search, setSearch] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [bumpingRiskId, setBumpingRiskId] = useState<string | null>(null);
  const [savingNotesId, setSavingNotesId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const debouncedSearch = useDebouncedValue(search, SEARCH_DEBOUNCE_MS);

  const list = usePaginatedList({
    fetcher: ({ platform, purpose, risk, query, page, limit, signal }) =>
      fetchSourceChannels(platform, purpose, risk, query, page, limit, { signal }),
    query: {
      platform: platformFilter,
      purpose: purposeFilter,
      risk: riskFilter,
      query: debouncedSearch,
    },
    limit: LIMIT,
  });

  function handlePlatformFilterChange(next: SourcePlatformFilter) {
    list.markLoading();
    setPlatformFilter(next);
    list.resetPage();
  }

  function handlePurposeFilterChange(next: SourcePurposeFilter) {
    list.markLoading();
    setPurposeFilter(next);
    list.resetPage();
  }

  function handleRiskFilterChange(next: SourceRiskFilter) {
    list.markLoading();
    setRiskFilter(next);
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
    navigate(`/source-channels/${id}`);
  }

  function handleAddSource(payload: CreateSourceChannelPayload) {
    void enqueueTask(
      {
        type: 'add_source',
        title: `Importing: ${payload.url}`,
        subtitle: payload.purpose,
        payload: {
          url: payload.url,
          purpose: payload.purpose,
        },
      },
      {
        onComplete: () => {
          list.markLoading();
          list.resetPage();
          list.refresh();
        },
        onFail: (job) => {
          const err = job.error ?? '';
          if (err.includes('already exists')) {
            toast.error('Source đã tồn tại');
          } else {
            toast.error(err || 'Không thể thêm source');
          }
        },
      },
    ).catch((err) => {
      console.error(err);
    });
  }

  async function handleBumpRisk(id: string) {
    setBumpingRiskId(id);
    try {
      await updateSourceChannel(id, { bumpRisk: true });
      list.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to increase risk level');
    } finally {
      setBumpingRiskId(null);
    }
  }

  async function handleNotesChange(id: string, notes: string) {
    const source = list.items.find((item) => item.id === id);
    if (!source || (source.notes ?? '') === notes) return;

    setSavingNotesId(id);
    try {
      await updateSourceChannel(id, { notes });
      list.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save note');
    } finally {
      setSavingNotesId(null);
    }
  }

  async function handleDelete(id: string) {
    const source = list.items.find((item) => item.id === id);
    if (!source) return;

    setDeletingId(id);
    try {
      await deleteSourceChannel(id);
      toast.success(`Deleted source "${source.name}"`);
      list.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete source');
    } finally {
      setDeletingId(null);
    }
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
          {list.error ? (
            <p className="mt-2 text-xs text-danger">{list.error}</p>
          ) : null}
          <div className="mt-4 card-surface px-5 pt-3 pb-4">
            <SourceChannelsTable
              sources={list.items}
              loading={list.loading}
              bumpingRiskId={bumpingRiskId}
              savingNotesId={savingNotesId}
              deletingId={deletingId}
              onSelect={handleSelect}
              onBumpRisk={handleBumpRisk}
              onNotesChange={handleNotesChange}
              onDelete={handleDelete}
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

      <AddSourceChannelModal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        onAdd={handleAddSource}
      />
    </div>
  );
}
