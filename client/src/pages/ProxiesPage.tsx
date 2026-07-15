import { useState } from 'react';
import {
  exportProxiesExcel,
  extendProxy,
  fetchProxies,
  fetchProxyStats,
  importProxiesExcel,
  removeFailedProxies,
  testProxy,
} from '../api/proxies';
import { AddProxyModal } from '../components/proxy-manager/AddProxyModal';
import { MailAccountsPagination } from '../components/mail-accounts/MailAccountsPagination';
import { ProxyPageHeader } from '../components/proxy-manager/ProxyPageHeader';
import { ProxyProvidersTab } from '../components/proxy-manager/ProxyProvidersTab';
import { ProxiesTable } from '../components/proxy-manager/ProxiesTable';
import { ProxiesToolbar } from '../components/proxy-manager/ProxiesToolbar';
import { ProxyStatCards } from '../components/proxy-manager/ProxyStatCards';
import { Button, Input, Modal, useToast } from '../components/ui';
import { useAbortableEffect, usePaginatedList } from '../hooks';
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
  const [showRemoveFailedModal, setShowRemoveFailedModal] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [removingFailed, setRemovingFailed] = useState(false);
  const [pingingIds, setPingingIds] = useState<Set<string>>(new Set());
  const [extendTargetId, setExtendTargetId] = useState<string | null>(null);
  const [extendDays, setExtendDays] = useState('');
  const [extending, setExtending] = useState(false);
  const [listRefreshKey, setListRefreshKey] = useState(0);

  const list = usePaginatedList({
    fetcher: ({ filter: currentFilter, page, limit, signal }) => fetchProxies(currentFilter, '', page, limit, { signal }),
    query: { filter },
    limit: LIMIT,
    refreshKey: listRefreshKey,
    onFetched: () => setSelectedIds(new Set()),
  });

  useAbortableEffect(
    async signal => {
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
    setListRefreshKey(key => key + 1);
    setStatsRefreshKey(key => key + 1);
    list.refresh();
  }

  function clearSelection() {
    setSelectedId(null);
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
      setSelectedIds(new Set(list.items.map(proxy => proxy.id)));
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

  async function handlePingRow(id: string) {
    if (pingingIds.has(id)) return;
    setPingingIds(prev => new Set(prev).add(id));
    try {
      const result = await testProxy(id);
      refreshAll();
      if (result.status === 'failed') {
        toast.error(result.error ?? 'Ping failed');
      } else {
        toast.success(`Ping OK — ${result.latencyMs ?? 0}ms`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Ping failed');
    } finally {
      setPingingIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  function handleOpenExtend(id: string) {
    setExtendTargetId(id);
    setExtendDays('');
  }

  function handleCloseExtend() {
    setExtendTargetId(null);
    setExtendDays('');
  }

  async function handleConfirmExtend() {
    if (!extendTargetId || extending) return;
    const days = Number(extendDays);
    if (!Number.isInteger(days) || days < 1) {
      toast.error('Enter a valid number of days (at least 1)');
      return;
    }

    setExtending(true);
    try {
      const { item } = await extendProxy(extendTargetId, days);
      refreshAll();
      handleCloseExtend();
      toast.success(`Extended expiry to ${item.expiresAt ?? 'updated date'}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to extend proxy');
    } finally {
      setExtending(false);
    }
  }

  const extendTarget = list.items.find(proxy => proxy.id === extendTargetId) ?? null;

  function handleTabChange(tab: ProxyTab) {
    setActiveTab(tab);
    clearSelection();
  }

  return (
    <div className='-m-6 flex h-[calc(100svh-3.5rem)] flex-col'>
      <div className='flex min-w-0 flex-1 flex-col overflow-hidden'>
        <div className='flex-1 overflow-y-auto p-6'>
          <ProxyPageHeader activeTab={activeTab} onTabChange={handleTabChange} />

          {activeTab === 'monitoring' ? (
            <>
              {/* <ProxyStatCards data={stats} loading={statsLoading} /> */}
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
              {list.error ? <p className='mt-2 text-xs text-danger'>{list.error}</p> : null}
              <div className='mt-4 card-surface px-5 pt-3 pb-4'>
                <ProxiesTable
                  proxies={list.items}
                  selectedId={selectedId}
                  selectedIds={selectedIds}
                  loading={list.loading}
                  pingingIds={pingingIds}
                  onSelect={handleSelect}
                  onToggleRow={handleToggleRow}
                  onToggleAll={handleToggleAll}
                  onPing={handlePingRow}
                  onExtend={handleOpenExtend}
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

      <AddProxyModal open={showAddModal} onClose={() => setShowAddModal(false)} onSuccess={handleAddSuccess} />

      <Modal
        open={extendTargetId !== null}
        onClose={handleCloseExtend}
        title='Extend Proxy'
        footer={
          <>
            <Button variant='outlined' size='sm' className='rounded-lg' onClick={handleCloseExtend} disabled={extending}>
              Cancel
            </Button>
            <Button size='sm' className='rounded-lg' disabled={extending} onClick={handleConfirmExtend}>
              {extending ? 'Saving…' : 'Save'}
            </Button>
          </>
        }
      >
        {extendTarget ? (
          <div className='space-y-4'>
            <p className='text-sm text-neutral-300'>
              Extend expiry for{' '}
              <span className='font-mono text-neutral-100'>
                {extendTarget.host}:{extendTarget.port}
              </span>
              {extendTarget.expiresAt ? (
                <> (current: {new Date(extendTarget.expiresAt).toLocaleDateString('en-GB')})</>
              ) : (
                ' (no expiry set)'
              )}
            </p>
            <div>
              <label htmlFor='extend-days' className='mb-1.5 block text-xs font-medium text-neutral-400'>
                Days to extend
              </label>
              <Input
                id='extend-days'
                type='number'
                min={1}
                step={1}
                placeholder='e.g. 30'
                value={extendDays}
                onChange={e => setExtendDays(e.target.value)}
                className='h-10 rounded-lg text-sm'
                disabled={extending}
              />
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={showRemoveFailedModal}
        onClose={() => setShowRemoveFailedModal(false)}
        title='Remove Failed Proxies'
        footer={
          <>
            <Button
              variant='outlined'
              size='sm'
              className='rounded-lg'
              onClick={() => setShowRemoveFailedModal(false)}
              disabled={removingFailed}
            >
              Cancel
            </Button>
            <Button size='sm' className='rounded-lg' disabled={removingFailed} onClick={handleRemoveFailed}>
              {removingFailed ? 'Removing...' : 'Remove All Failed'}
            </Button>
          </>
        }
      >
        <p className='text-sm text-neutral-300'>Archive all proxies with Failed status? This action cannot be undone from the UI.</p>
      </Modal>
    </div>
  );
}
