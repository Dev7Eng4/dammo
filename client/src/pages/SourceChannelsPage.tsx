import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchNiches } from '../api/niches';
import {
  fetchSourceChannels,
  updateSourceChannel,
  deleteSourceChannel,
  fetchSourceChannelUsage,
} from '../api/sourceChannels';
import { MailAccountsPagination } from '../components/mail-accounts/MailAccountsPagination';
import { AddNicheModal } from '../components/source-channels/AddNicheModal';
import { AddSourceChannelModal } from '../components/source-channels/AddSourceChannelModal';
import { DeleteSourceChannelModal } from '../components/source-channels/DeleteSourceChannelModal';
import { SourceChannelsTable } from '../components/source-channels/SourceChannelsTable';
import { SourceChannelsToolbar } from '../components/source-channels/SourceChannelsToolbar';
import { useToast } from '../components/ui';
import { useAbortableEffect, useDebouncedValue, usePaginatedList } from '../hooks';
import { useTaskQueue } from '../hooks/useTaskQueue';
import type { Niche } from '../types/niche';
import type {
  CreateSourceChannelPayload,
  SourceChannel,
  SourceChannelUsage,
  SourceLanguageFilter,
  SourcePlatformFilter,
  SourcePurposeFilter,
} from '../types/sourceChannel';

const SEARCH_DEBOUNCE_MS = 300;

export function SourceChannelsPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { enqueueTask } = useTaskQueue();
  const [platformFilter, setPlatformFilter] = useState<SourcePlatformFilter>('all');
  const [purposeFilter, setPurposeFilter] = useState<SourcePurposeFilter>('reup');
  const [languageFilter, setLanguageFilter] = useState<SourceLanguageFilter>('all');
  const [nicheFilter, setNicheFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showAddModal, setShowAddModal] = useState(false);
  const [showAddNicheModal, setShowAddNicheModal] = useState(false);
  const [niches, setNiches] = useState<Niche[]>([]);
  const [bumpingRiskId, setBumpingRiskId] = useState<string | null>(null);
  const [savingNotesId, setSavingNotesId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteModalSources, setDeleteModalSources] = useState<SourceChannel[]>([]);
  const [deleteModalUsages, setDeleteModalUsages] = useState<SourceChannelUsage[]>([]);
  const [confirmDeleting, setConfirmDeleting] = useState(false);
  const [checkingDelete, setCheckingDelete] = useState(false);
  const [limit, setLimit] = useState(20);

  const debouncedSearch = useDebouncedValue(search, SEARCH_DEBOUNCE_MS);

  const list = usePaginatedList({
    fetcher: ({ platform, purpose, language, niche, query, page, limit: pageLimit, signal }) =>
      fetchSourceChannels(platform, purpose, language, page, pageLimit, {
        signal,
        ...(niche !== 'all' ? { niche } : {}),
        ...(query.trim() ? { q: query } : {}),
      }),
    query: {
      platform: platformFilter,
      purpose: purposeFilter,
      language: languageFilter,
      niche: nicheFilter,
      query: debouncedSearch,
    },
    limit,
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

  const selectedSources = list.items.filter(source => selectedIds.has(source.id));
  const selectedSource = selectedSources.length === 1 ? selectedSources[0] : null;
  const canDownload =
    selectedIds.size > 0 &&
    selectedSources.every(
      source =>
        source.platform === 'youtube' &&
        (source.purpose === 'reup' || source.purpose === 'background_footage'),
    );

  const downloadDisabledReason =
    selectedIds.size === 0
      ? 'Chọn nguồn để tải xuống'
      : !canDownload
        ? selectedSources.some(source => source.platform !== 'youtube')
          ? 'Chỉ hỗ trợ tải xuống cho nguồn YouTube'
          : 'Chỉ hỗ trợ tải cho nguồn Reup hoặc Footage nền'
        : undefined;

  function clearSelection() {
    setSelectedIds(new Set());
  }

  function handlePlatformFilterChange(next: SourcePlatformFilter) {
    list.markLoading();
    setPlatformFilter(next);
    list.resetPage();
    clearSelection();
  }

  function handlePurposeFilterChange(next: SourcePurposeFilter) {
    list.markLoading();
    setPurposeFilter(next);
    list.resetPage();
    clearSelection();
  }

  function handleLanguageFilterChange(next: SourceLanguageFilter) {
    list.markLoading();
    setLanguageFilter(next);
    list.resetPage();
    clearSelection();
  }

  function handleNicheFilterChange(next: string) {
    list.markLoading();
    setNicheFilter(next);
    list.resetPage();
    clearSelection();
  }

  function handleSearchChange(next: string) {
    list.markLoading();
    setSearch(next);
    list.resetPage();
    clearSelection();
  }

  function handlePageChange(nextPage: number) {
    list.markLoading();
    list.setPage(nextPage);
    clearSelection();
  }

  function handleLimitChange(nextLimit: number) {
    list.markLoading();
    setLimit(nextLimit);
    list.setPage(1);
    clearSelection();
  }

  function handleSelect(id: string) {
    navigate(`/source-channels/${id}`);
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
      setSelectedIds(new Set(list.items.map(source => source.id)));
    }
  }

  function handleDownload() {
    if (selectedIds.size === 0 || !canDownload) return;

    if (selectedIds.size > 1) {
      void enqueueTask({
        type: 'download_source',
        title: `Đang tải video cho ${selectedIds.size} nguồn`,
        subtitle: `${selectedIds.size} nguồn đã chọn`,
        payload: { sourceIds: Array.from(selectedIds) },
      });
      return;
    }

    if (!selectedSource) return;
    if (selectedSource.platform !== 'youtube') return;

    void enqueueTask({
      type: 'download_source',
      title: `Đang tải: ${selectedSource.name}`,
      subtitle: selectedSource.url,
      payload: {
        sourceId: selectedSource.id,
        sourceName: selectedSource.name,
      },
    });
  }

  function handleAddSource(payloads: CreateSourceChannelPayload[]) {
    for (const payload of payloads) {
      void enqueueTask(
        {
          type: 'add_source',
          title: `Đang nhập: ${payload.url}`,
          subtitle: payload.purpose,
          payload: {
            url: payload.url,
            purpose: payload.purpose,
            language: payload.language,
            ...(payload.niche ? { niche: payload.niche } : {}),
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
              toast.error(`Đã tồn tại: ${payload.url}`);
            } else {
              toast.error(err || `Không thể thêm: ${payload.url}`);
            }
          },
        },
      ).catch((err) => {
        console.error(err);
      });
    }
  }

  async function refreshNiches() {
    try {
      const data = await fetchNiches();
      setNiches(data.items);
      setNicheFilter((current) =>
        current === 'all' || data.items.some((item) => item.key === current) ? current : 'all',
      );
    } catch {
      // keep existing niches on refresh failure
    }
  }

  async function handleBumpRisk(id: string) {
    setBumpingRiskId(id);
    try {
      await updateSourceChannel(id, { bumpRisk: true });
      list.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Không thể tăng mức rủi ro');
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
      toast.error(err instanceof Error ? err.message : 'Không thể lưu ghi chú');
    } finally {
      setSavingNotesId(null);
    }
  }

  function closeDeleteModal() {
    setDeleteModalSources([]);
    setDeleteModalUsages([]);
    setConfirmDeleting(false);
  }

  async function openDeleteModal(sources: SourceChannel[]) {
    if (sources.length === 0) return;

    setCheckingDelete(true);
    try {
      const usages = await Promise.all(sources.map(source => fetchSourceChannelUsage(source.id)));
      setDeleteModalSources(sources);
      setDeleteModalUsages(usages);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Không thể kiểm tra nguồn đang được sử dụng');
    } finally {
      setCheckingDelete(false);
    }
  }

  async function handleDelete(id: string) {
    const source = list.items.find((item) => item.id === id);
    if (!source) return;

    setDeletingId(id);
    try {
      await openDeleteModal([source]);
    } finally {
      setDeletingId(null);
    }
  }

  function handleBulkDelete() {
    if (selectedSources.length === 0) return;
    void openDeleteModal(selectedSources);
  }

  async function handleConfirmDelete() {
    if (deleteModalSources.length === 0) return;
    if (deleteModalUsages.some(usage => usage.inUse)) return;

    setConfirmDeleting(true);
    try {
      for (const source of deleteModalSources) {
        await deleteSourceChannel(source.id);
      }

      const count = deleteModalSources.length;
      toast.success(
        count === 1
          ? `Đã xóa nguồn "${deleteModalSources[0]?.name ?? ''}"`
          : `Đã xóa ${count} kênh nguồn`,
      );
      closeDeleteModal();
      list.refresh();
      clearSelection();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Không thể xóa nguồn');
    } finally {
      setConfirmDeleting(false);
    }
  }

  return (
    <div className="-m-6 flex h-svh flex-col">
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto p-6">
          <SourceChannelsToolbar
            platformFilter={platformFilter}
            purposeFilter={purposeFilter}
            languageFilter={languageFilter}
            nicheFilter={nicheFilter}
            search={search}
            niches={niches}
            canDownload={canDownload}
            downloadDisabledReason={downloadDisabledReason}
            onPlatformFilterChange={handlePlatformFilterChange}
            onPurposeFilterChange={handlePurposeFilterChange}
            onLanguageFilterChange={handleLanguageFilterChange}
            onNicheFilterChange={handleNicheFilterChange}
            onSearchChange={handleSearchChange}
            onAddSource={() => setShowAddModal(true)}
            onAddNiche={() => setShowAddNicheModal(true)}
            onDownload={handleDownload}
            onDelete={handleBulkDelete}
            canDelete={selectedIds.size > 0 && !checkingDelete}
          />
          {list.error ? (
            <p className="mt-2 text-xs text-danger">{list.error}</p>
          ) : null}
          <div className="mt-4 card-surface px-5 pt-3 pb-4">
            <SourceChannelsTable
              sources={list.items}
              niches={niches}
              loading={list.loading}
              rowNumberStart={(list.page - 1) * list.limit + 1}
              selectedIds={selectedIds}
              bumpingRiskId={bumpingRiskId}
              savingNotesId={savingNotesId}
              deletingId={deletingId}
              onSelect={handleSelect}
              onToggleRow={handleToggleRow}
              onToggleAll={handleToggleAll}
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
              onLimitChange={handleLimitChange}
              locale="vi"
            />
          </div>
        </div>
      </div>

      <AddSourceChannelModal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        onAdd={handleAddSource}
      />

      <AddNicheModal
        open={showAddNicheModal}
        onClose={() => setShowAddNicheModal(false)}
        onSuccess={(action) => {
          void refreshNiches();
          if (action === 'create') toast.success('Đã thêm niche');
          else if (action === 'update') toast.success('Đã cập nhật niche');
          else toast.success('Đã xóa niche');
        }}
      />

      <DeleteSourceChannelModal
        open={deleteModalSources.length > 0}
        sources={deleteModalSources}
        usages={deleteModalUsages}
        deleting={confirmDeleting}
        onClose={closeDeleteModal}
        onConfirmDelete={handleConfirmDelete}
      />
    </div>
  );
}
