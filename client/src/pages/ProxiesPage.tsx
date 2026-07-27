import { useEffect, useState } from 'react';
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
import type { Proxy, ProxyFilter, ProxyStats, ProxyTab } from '../types/proxy';

const LIMIT = 20;
const DAY_MS = 24 * 60 * 60 * 1000;
const EXPIRY_WARNING_DAYS = 5;
const EXPIRY_MODAL_MAX_ITEMS = 10;

function getExpiryEndMs(expiresAt?: string): number | null {
  if (!expiresAt) return null;
  const end = new Date(`${expiresAt}T23:59:59.999`);
  const ms = end.getTime();
  return Number.isNaN(ms) ? null : ms;
}

function getExpiryWarningMeta(
  expiresAt: string | undefined,
  nowMs: number,
): null | { label: string; expired: boolean; expireEndMs: number } {
  const expireEndMs = getExpiryEndMs(expiresAt);
  if (expireEndMs == null) return null;

  // Inclusive: show when expiresAt <= now + 5 days (even if already expired).
  const isExpiring = expireEndMs <= nowMs + EXPIRY_WARNING_DAYS * DAY_MS;
  if (!isExpiring) return null;

  if (expireEndMs < nowMs) {
    return { label: 'Đã hết hạn', expired: true, expireEndMs };
  }

  const diffMs = expireEndMs - nowMs;
  const daysLeft = Math.ceil(diffMs / DAY_MS);
  return { label: `Còn ${daysLeft} ngày`, expired: false, expireEndMs };
}

interface ExpiringProxyItem {
  proxy: Proxy;
  label: string;
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
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [removingFailed, setRemovingFailed] = useState(false);
  const [pingingIds, setPingingIds] = useState<Set<string>>(new Set());
  const [extendTargetId, setExtendTargetId] = useState<string | null>(null);
  const [extendDays, setExtendDays] = useState('');
  const [extending, setExtending] = useState(false);
  const [listRefreshKey, setListRefreshKey] = useState(0);

  const [showExpiryWarning, setShowExpiryWarning] = useState(false);
  const [expiringProxies, setExpiringProxies] = useState<ExpiringProxyItem[]>([]);

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

  // Popup cảnh báo khi có proxy sắp hết hạn (<= 5 ngày).
  // Chạy khi trang mount và mỗi lần refreshAll() (thay đổi listRefreshKey).
  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    async function run() {
      try {
        const nowMs = Date.now();
        const expiring: Array<{ proxy: Proxy; expireEndMs: number; label: string }> = [];

        const limit = 100;
        const first = await fetchProxies('all', '', 1, limit, { signal: controller.signal });

        for (const proxy of first.items) {
          const meta = getExpiryWarningMeta(proxy.expiresAt, nowMs);
          if (meta) expiring.push({ proxy, expireEndMs: meta.expireEndMs, label: meta.label });
        }

        // Fetch additional pages (if any) to check all proxies in system.
        for (let page = 2; page <= first.totalPages; page++) {
          const res = await fetchProxies('all', '', page, limit, { signal: controller.signal });
          for (const proxy of res.items) {
            const meta = getExpiryWarningMeta(proxy.expiresAt, nowMs);
            if (meta) expiring.push({ proxy, expireEndMs: meta.expireEndMs, label: meta.label });
          }
        }

        if (cancelled) return;

        if (expiring.length > 0) {
          expiring.sort((a, b) => a.expireEndMs - b.expireEndMs);
          setExpiringProxies(expiring.map(({ proxy, label }) => ({ proxy, label })));
          setShowExpiryWarning(true);
        } else {
          setShowExpiryWarning(false);
          setExpiringProxies([]);
        }
      } catch {
        // Ignore abort/cancel errors; don't block the page due to warning.
      }
    }

    void run();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [listRefreshKey]);

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

      <Modal
        open={showExpiryWarning}
        onClose={() => setShowExpiryWarning(false)}
        title='Proxy sắp hết hạn (<= 5 ngày)'
        footer={
          <Button size='sm' className='rounded-lg' onClick={() => setShowExpiryWarning(false)}>
            Đã hiểu
          </Button>
        }
      >
        {expiringProxies.length > 0 ? (
          <div className='space-y-4'>
            <p className='text-sm text-neutral-300'>
              Có <span className='font-mono text-neutral-100'>{expiringProxies.length}</span> proxy sắp hết hạn hoặc đã hết hạn. Vui lòng
              kiểm tra và gia hạn trước khi hết hạn.
            </p>
            <div className='space-y-2'>
              {expiringProxies.slice(0, EXPIRY_MODAL_MAX_ITEMS).map(({ proxy, label }) => (
                <div key={proxy.id} className='flex items-center justify-between gap-4 rounded-lg border border-border px-3 py-2'>
                  <span className='font-mono text-xs text-neutral-300'>
                    {proxy.host}:{proxy.port}
                  </span>
                  <span className='text-xs text-neutral-500'>
                    {proxy.expiresAt ? `HẾT HẠN ${proxy.expiresAt}` : 'Không có hạn'} · {label}
                  </span>
                </div>
              ))}
            </div>
            {expiringProxies.length > EXPIRY_MODAL_MAX_ITEMS ? (
              <p className='text-xs text-neutral-500'>Hiển thị {EXPIRY_MODAL_MAX_ITEMS} proxy đầu tiên.</p>
            ) : null}
          </div>
        ) : (
          <p className='text-sm text-neutral-300'>Không có proxy sắp hết hạn.</p>
        )}
      </Modal>
    </div>
  );
}
