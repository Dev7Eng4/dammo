import { useState } from 'react';
import {
  archiveProxy,
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
import { ProxyExpiryWarningModal } from '../components/proxy-manager/ProxyExpiryWarningModal';
import { ProxyPageHeader } from '../components/proxy-manager/ProxyPageHeader';
import { ProxyProvidersTab } from '../components/proxy-manager/ProxyProvidersTab';
import { ProxiesTable } from '../components/proxy-manager/ProxiesTable';
import { ProxiesToolbar } from '../components/proxy-manager/ProxiesToolbar';
import { ProxyStatCards } from '../components/proxy-manager/ProxyStatCards';
import { Button, Input, Modal, useToast } from '../components/ui';
import { useAbortableEffect, usePaginatedList } from '../hooks';
import type { Proxy, ProxyFilter, ProxyStats, ProxyTab } from '../types/proxy';

function getExpiryEndMs(expiresAt?: string): number | null {
  if (!expiresAt) return null;
  const end = new Date(`${expiresAt}T23:59:59.999`);
  const ms = end.getTime();
  return Number.isNaN(ms) ? null : ms;
}

function isProxyExpired(proxy: Proxy, nowMs = Date.now()): boolean {
  if (proxy.status === 'expired') return true;
  const expireEndMs = getExpiryEndMs(proxy.expiresAt);
  return expireEndMs != null && expireEndMs < nowMs;
}

/** Deletable when unassigned, or already past expiry (even if still bound to profiles). */
function canDeleteProxy(proxy: Proxy, nowMs = Date.now()): boolean {
  return proxy.assignedProfileIds.length === 0 || isProxyExpired(proxy, nowMs);
}

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
  const [showDeleteSelectedModal, setShowDeleteSelectedModal] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [removingFailed, setRemovingFailed] = useState(false);
  const [deletingSelected, setDeletingSelected] = useState(false);
  const [pingingIds, setPingingIds] = useState<Set<string>>(new Set());
  const [extendTargetId, setExtendTargetId] = useState<string | null>(null);
  const [extendDays, setExtendDays] = useState('');
  const [extending, setExtending] = useState(false);
  const [listRefreshKey, setListRefreshKey] = useState(0);
  const [limit, setLimit] = useState(20);

  const list = usePaginatedList({
    fetcher: ({ filter: currentFilter, page, limit: pageLimit, signal }) => fetchProxies(currentFilter, '', page, pageLimit, { signal }),
    query: { filter },
    limit,
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

  function handleLimitChange(nextLimit: number) {
    list.markLoading();
    setLimit(nextLimit);
    list.setPage(1);
    clearSelection();
  }

  function handleAddSuccess() {
    list.markLoading();
    list.resetPage();
    refreshAll();
    toast.success('Thêm proxy thành công');
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
      toast.success('Xuất Excel thành công');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Xuất Excel thất bại');
    } finally {
      setExporting(false);
    }
  }

  async function handleImportExcel(file: File) {
    setImporting(true);
    try {
      const result = await importProxiesExcel(file);
      refreshAll();
      toast.success(`Đã nhập ${result.created} proxy (bỏ qua ${result.skipped})`);
      if (result.errors.length > 0) {
        toast.error(result.errors[0] ?? 'Một số dòng đã bị bỏ qua');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Nhập Excel thất bại');
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
      toast.success(`Đã xóa ${result.removed} proxy thất bại`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Xóa thất bại');
    } finally {
      setRemovingFailed(false);
    }
  }

  async function handleDeleteSelected() {
    const targets = list.items.filter(proxy => selectedIds.has(proxy.id) && canDeleteProxy(proxy));
    if (targets.length === 0 || deletingSelected) return;

    setDeletingSelected(true);
    try {
      let removed = 0;
      const errors: string[] = [];
      for (const proxy of targets) {
        try {
          await archiveProxy(proxy.id);
          removed += 1;
        } catch (err) {
          errors.push(
            `${proxy.host}:${proxy.port} — ${err instanceof Error ? err.message : 'Xóa thất bại'}`,
          );
        }
      }
      setShowDeleteSelectedModal(false);
      clearSelection();
      refreshAll();
      if (removed > 0) {
        toast.success(`Đã xóa ${removed} proxy`);
      }
      if (errors.length > 0) {
        toast.error(errors[0] ?? 'Một số proxy không xóa được');
      }
    } finally {
      setDeletingSelected(false);
    }
  }

  async function handlePingRow(id: string) {
    if (pingingIds.has(id)) return;
    setPingingIds(prev => new Set(prev).add(id));
    try {
      const result = await testProxy(id);
      refreshAll();
      if (result.status === 'failed') {
        toast.error(result.error ?? 'Ping thất bại');
      } else {
        toast.success(`Ping OK — ${result.latencyMs ?? 0}ms`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Ping thất bại');
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
      toast.error('Nhập số ngày hợp lệ (tối thiểu 1)');
      return;
    }

    setExtending(true);
    try {
      const { item } = await extendProxy(extendTargetId, days);
      refreshAll();
      handleCloseExtend();
      toast.success(`Đã gia hạn đến ${item.expiresAt ?? 'ngày mới'}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gia hạn proxy thất bại');
    } finally {
      setExtending(false);
    }
  }

  const extendTarget = list.items.find(proxy => proxy.id === extendTargetId) ?? null;
  const selectedProxies = list.items.filter(proxy => selectedIds.has(proxy.id));
  const canDeleteSelected =
    selectedProxies.length > 0 && selectedProxies.every(proxy => canDeleteProxy(proxy));

  function handleTabChange(tab: ProxyTab) {
    setActiveTab(tab);
    clearSelection();
  }

  return (
    <div className='-m-6 flex h-svh flex-col'>
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
                onDeleteSelected={() => setShowDeleteSelectedModal(true)}
                onRemoveFailed={() => setShowRemoveFailedModal(true)}
                canDeleteSelected={canDeleteSelected}
                deletingSelected={deletingSelected}
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
                  rowNumberStart={(list.page - 1) * list.limit + 1}
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
                  onLimitChange={handleLimitChange}
                  locale="vi"
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
        title='Gia hạn Proxy'
        footer={
          <>
            <Button variant='outlined' size='sm' className='rounded-lg' onClick={handleCloseExtend} disabled={extending}>
              Hủy
            </Button>
            <Button size='sm' className='rounded-lg' disabled={extending} onClick={handleConfirmExtend}>
              {extending ? 'Đang lưu…' : 'Lưu'}
            </Button>
          </>
        }
      >
        {extendTarget ? (
          <div className='space-y-4'>
            <p className='text-sm text-neutral-300'>
              Gia hạn cho{' '}
              <span className='font-mono text-neutral-100'>
                {extendTarget.host}:{extendTarget.port}
              </span>
              {extendTarget.expiresAt ? (
                <> (hiện tại: {new Date(extendTarget.expiresAt).toLocaleDateString('vi-VN')})</>
              ) : (
                ' (chưa đặt ngày hết hạn)'
              )}
            </p>
            <div>
              <label htmlFor='extend-days' className='mb-1.5 block text-xs font-medium text-neutral-400'>
                Số ngày gia hạn
              </label>
              <Input
                id='extend-days'
                type='number'
                min={1}
                step={1}
                placeholder='vd. 30'
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
        open={showDeleteSelectedModal}
        onClose={() => !deletingSelected && setShowDeleteSelectedModal(false)}
        title='Xóa proxy đã chọn'
        footer={
          <>
            <Button
              variant='outlined'
              size='sm'
              className='rounded-lg'
              onClick={() => setShowDeleteSelectedModal(false)}
              disabled={deletingSelected}
            >
              Hủy
            </Button>
            <Button size='sm' className='rounded-lg' disabled={deletingSelected} onClick={handleDeleteSelected}>
              {deletingSelected ? 'Đang xóa...' : `Xóa ${selectedProxies.length} proxy`}
            </Button>
          </>
        }
      >
        <p className='text-sm text-neutral-300'>
          Lưu trữ {selectedProxies.length} proxy đã chọn (không gắn profile hoặc đã hết hạn)? Không thể hoàn tác
          thao tác này từ giao diện.
        </p>
      </Modal>

      <Modal
        open={showRemoveFailedModal}
        onClose={() => setShowRemoveFailedModal(false)}
        title='Xóa proxy thất bại'
        footer={
          <>
            <Button
              variant='outlined'
              size='sm'
              className='rounded-lg'
              onClick={() => setShowRemoveFailedModal(false)}
              disabled={removingFailed}
            >
              Hủy
            </Button>
            <Button size='sm' className='rounded-lg' disabled={removingFailed} onClick={handleRemoveFailed}>
              {removingFailed ? 'Đang xóa...' : 'Xóa tất cả thất bại'}
            </Button>
          </>
        }
      >
        <p className='text-sm text-neutral-300'>
          Lưu trữ tất cả proxy có trạng thái Thất bại? Không thể hoàn tác thao tác này từ giao diện.
        </p>
      </Modal>

      <ProxyExpiryWarningModal />
    </div>
  );
}
