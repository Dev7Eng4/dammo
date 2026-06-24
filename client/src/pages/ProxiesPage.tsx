import { useState } from 'react';
import {
  archiveProxy,
  exportProxiesExcel,
  fetchProxy,
  fetchProxies,
  fetchProxyStats,
  importProxiesExcel,
  removeFailedProxies,
  testProxy,
} from '../api/proxies';
import { AddProxyModal } from '../components/proxy-manager/AddProxyModal';
import { EditProxyModal } from '../components/proxy-manager/EditProxyModal';
import { MailAccountsPagination } from '../components/mail-accounts/MailAccountsPagination';
import { ProxyDetailPanel } from '../components/proxy-manager/ProxyDetailPanel';
import { ProxyPageHeader } from '../components/proxy-manager/ProxyPageHeader';
import { ProxyProvidersTab } from '../components/proxy-manager/ProxyProvidersTab';
import { ProxiesTable } from '../components/proxy-manager/ProxiesTable';
import { ProxiesToolbar } from '../components/proxy-manager/ProxiesToolbar';
import { ProxyStatCards } from '../components/proxy-manager/ProxyStatCards';
import { Button, Modal, useToast } from '../components/ui';
import { useAbortableEffect, useFetchedItem, usePaginatedList } from '../hooks';
import type { ProxyFilter, ProxyStats, ProxyTab } from '../types/proxy';

const LIMIT = 20;

export function ProxiesPage() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<ProxyTab>('monitoring');
  const [stats, setStats] = useState<ProxyStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsRefreshKey, setStatsRefreshKey] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<ProxyFilter>('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showRemoveFailedModal, setShowRemoveFailedModal] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [removingFailed, setRemovingFailed] = useState(false);
  const [testing, setTesting] = useState(false);
  const [listRefreshKey, setListRefreshKey] = useState(0);

  const list = usePaginatedList({
    fetcher: ({ filter: currentFilter, page, limit, signal }) =>
      fetchProxies(currentFilter, '', page, limit, { signal }),
    query: { filter },
    limit: LIMIT,
    refreshKey: listRefreshKey,
    onFetched: () => setSelectedIds(new Set()),
  });

  const detail = useFetchedItem((id, signal) => fetchProxy(id, { signal }));

  useAbortableEffect(
    async (signal) => {
      setStatsLoading(true);
      try {
        const data = await fetchProxyStats({ signal });
        setStats(data);
      } catch {
        setStats(null);
      } finally {
        if (!signal.aborted) setStatsLoading(false);
      }
    },
    [statsRefreshKey],
  );

  function refreshAll() {
    setListRefreshKey((key) => key + 1);
    setStatsRefreshKey((key) => key + 1);
    list.refresh();
  }

  function clearSelection() {
    setSelectedId(null);
    detail.clear();
  }

  function handleFilterChange(nextFilter: ProxyFilter) {
    list.markLoading();
    setFilter(nextFilter);
    list.resetPage();
    clearSelection();
  }

  function handlePageChange(nextPage: number) {
    list.markLoading();
    list.setPage(nextPage);
    clearSelection();
  }

  function handleAddSuccess() {
    list.markLoading();
    list.resetPage();
    refreshAll();
    toast.success('Proxy added successfully');
  }

  function handleSelect(id: string) {
    setSelectedId(id);
    detail.load(id);
  }

  function handleClosePanel() {
    clearSelection();
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
      setSelectedIds(new Set(list.items.map((proxy) => proxy.id)));
    }
  }

  async function handleExportExcel() {
    setExporting(true);
    try {
      const ids = selectedIds.size > 0 ? Array.from(selectedIds) : undefined;
      await exportProxiesExcel(filter, '', ids);
      toast.success('Export completed');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setExporting(false);
    }
  }

  async function handleImportExcel(file: File) {
    setImporting(true);
    try {
      const result = await importProxiesExcel(file);
      refreshAll();
      toast.success(`Imported ${result.created} proxies (${result.skipped} skipped)`);
      if (result.errors.length > 0) {
        toast.error(result.errors[0] ?? 'Some rows were skipped');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setImporting(false);
    }
  }

  async function handleRemoveFailed() {
    setRemovingFailed(true);
    try {
      const result = await removeFailedProxies();
      setShowRemoveFailedModal(false);
      clearSelection();
      refreshAll();
      toast.success(`Removed ${result.removed} failed proxies`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Remove failed');
    } finally {
      setRemovingFailed(false);
    }
  }

  async function handleTest() {
    if (!selectedId) return;
    setTesting(true);
    try {
      const result = await testProxy(selectedId);
      detail.load(selectedId);
      refreshAll();
      if (result.status === 'failed') {
        toast.error(result.error ?? 'Connection test failed');
      } else {
        toast.success(`Connection OK — ${result.latencyMs ?? 0}ms`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Test failed');
    } finally {
      setTesting(false);
    }
  }

  async function handleArchive() {
    if (!selectedId) return;
    try {
      await archiveProxy(selectedId);
      clearSelection();
      refreshAll();
      toast.success('Proxy archived');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Archive failed');
    }
  }

  function handleEditSuccess() {
    if (selectedId) detail.load(selectedId);
    refreshAll();
    toast.success('Proxy updated');
  }

  function handleTabChange(tab: ProxyTab) {
    setActiveTab(tab);
    clearSelection();
  }

  return (
    <div className="-m-6 flex h-[calc(100svh-3.5rem)] flex-col">
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto p-6">
          <ProxyPageHeader activeTab={activeTab} onTabChange={handleTabChange} />

          {activeTab === 'monitoring' ? (
            <>
              <ProxyStatCards data={stats} loading={statsLoading} />
              <ProxiesToolbar
                total={list.total}
                filter={filter}
                onFilterChange={handleFilterChange}
                onAddProxy={() => setShowAddModal(true)}
                onImportExcel={handleImportExcel}
                onExportExcel={handleExportExcel}
                onRemoveFailed={() => setShowRemoveFailedModal(true)}
                exporting={exporting}
                importing={importing}
                removingFailed={removingFailed}
              />
              {list.error ? <p className="mt-2 text-xs text-danger">{list.error}</p> : null}
              <div className="mt-4 card-surface px-5 pt-3 pb-4">
                <ProxiesTable
                  proxies={list.items}
                  selectedId={selectedId}
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
            </>
          ) : null}

          {activeTab === 'providers' ? <ProxyProvidersTab /> : null}
        </div>
      </div>

      {activeTab === 'monitoring' && (selectedId || detail.loading) ? (
        <>
          <button
            type="button"
            aria-label="Close detail panel"
            onClick={handleClosePanel}
            className="fixed inset-0 z-40 bg-black/50"
          />
          <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-sm shadow-2xl">
            <ProxyDetailPanel
              proxy={detail.item}
              loading={detail.loading}
              testing={testing}
              onClose={handleClosePanel}
              onTest={handleTest}
              onEdit={() => setShowEditModal(true)}
              onArchive={handleArchive}
            />
          </div>
        </>
      ) : null}

      <AddProxyModal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSuccess={handleAddSuccess}
      />

      <EditProxyModal
        open={showEditModal}
        proxy={detail.item}
        onClose={() => setShowEditModal(false)}
        onSuccess={handleEditSuccess}
      />

      <Modal
        open={showRemoveFailedModal}
        onClose={() => setShowRemoveFailedModal(false)}
        title="Remove Failed Proxies"
        footer={
          <>
            <Button
              variant="outlined"
              size="sm"
              className="rounded-lg"
              onClick={() => setShowRemoveFailedModal(false)}
              disabled={removingFailed}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="rounded-lg"
              disabled={removingFailed}
              onClick={handleRemoveFailed}
            >
              {removingFailed ? 'Removing...' : 'Remove All Failed'}
            </Button>
          </>
        }
      >
        <p className="text-sm text-neutral-300">
          Archive all proxies with Failed status? This action cannot be undone from the UI.
        </p>
      </Modal>
    </div>
  );
}
