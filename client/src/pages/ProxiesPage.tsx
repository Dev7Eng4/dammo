import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  archiveProxy,
  exportProxiesExcel,
  extendProxy,
  fetchProxies,
  importProxiesExcel,
  removeFailedProxies,
  testProxy,
} from '../api/proxies';
import { PageShell } from '../components/layout';
import { AddProxyModal } from '../components/proxy-manager/AddProxyModal';
import { MailAccountsPagination } from '../components/mail-accounts/MailAccountsPagination';
import { ProxyExpiryWarningModal } from '../components/proxy-manager/ProxyExpiryWarningModal';
import { ProxyPageHeader } from '../components/proxy-manager/ProxyPageHeader';
import { ProxyProvidersTab } from '../components/proxy-manager/ProxyProvidersTab';
import { ProxiesTable } from '../components/proxy-manager/ProxiesTable';
import { ProxiesToolbar } from '../components/proxy-manager/ProxiesToolbar';
import { Button, Input, Modal, useToast } from '../components/ui';
import { usePaginatedList } from '../hooks';
import type { Proxy, ProxyFilter, ProxyTab } from '../types/proxy';

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
  const { t, i18n } = useTranslation(['browser', 'common']);
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<ProxyTab>('monitoring');
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
  const [extendDays, setExtendDays] = useState('30');
  const [extending, setExtending] = useState(false);
  const [listRefreshKey, setListRefreshKey] = useState(0);
  const [limit, setLimit] = useState(20);
  const dateLocale = i18n.language === 'en' ? 'en-US' : 'vi-VN';
  const paginationLocale = i18n.language === 'en' ? 'en' : 'vi';

  const list = usePaginatedList({
    fetcher: ({ filter: currentFilter, page, limit: pageLimit, signal }) => fetchProxies(currentFilter, '', page, pageLimit, { signal }),
    query: { filter },
    limit,
    refreshKey: listRefreshKey,
    onFetched: () => setSelectedIds(new Set()),
  });

  function refreshAll() {
    setListRefreshKey(key => key + 1);
    list.refresh();
  }

  function handleFilterChange(nextFilter: ProxyFilter) {
    list.markLoading();
    setFilter(nextFilter);
    list.resetPage();
  }

  function handlePageChange(nextPage: number) {
    list.markLoading();
    list.setPage(nextPage);
  }

  function handleLimitChange(nextLimit: number) {
    list.markLoading();
    setLimit(nextLimit);
    list.setPage(1);
  }

  function handleAddSuccess() {
    list.markLoading();
    list.resetPage();
    refreshAll();
    toast.success(t('proxy.toast.addSuccess'));
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
      toast.success(t('proxy.toast.exportSuccess'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('proxy.toast.exportError'));
    } finally {
      setExporting(false);
    }
  }

  async function handleImportExcel(file: File) {
    setImporting(true);
    try {
      const result = await importProxiesExcel(file);
      refreshAll();
      toast.success(t('proxy.toast.importSuccess', { created: result.created, skipped: result.skipped }));
      if (result.errors.length > 0) {
        toast.error(result.errors[0] ?? t('proxy.toast.importPartial'));
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('proxy.toast.importError'));
    } finally {
      setImporting(false);
    }
  }

  async function handleRemoveFailed() {
    setRemovingFailed(true);
    try {
      const result = await removeFailedProxies();
      setShowRemoveFailedModal(false);
      refreshAll();
      toast.success(t('proxy.toast.removeFailedSuccess', { count: result.removed }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('proxy.toast.removeFailedError'));
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
            `${proxy.host}:${proxy.port} — ${err instanceof Error ? err.message : t('proxy.toast.removeFailedError')}`,
          );
        }
      }
      setShowDeleteSelectedModal(false);
      refreshAll();
      if (removed > 0) {
        toast.success(t('proxy.toast.deleteSuccess', { count: removed }));
      }
      if (errors.length > 0) {
        toast.error(errors[0] ?? t('proxy.toast.deletePartial'));
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
        toast.error(result.error ?? t('proxy.toast.pingFailed'));
      } else {
        toast.success(t('proxy.toast.pingOk', { ms: result.latencyMs ?? 0 }));
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('proxy.toast.pingFailed'));
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
    setExtendDays('30');
  }

  function handleCloseExtend() {
    setExtendTargetId(null);
    setExtendDays('30');
  }

  async function handleConfirmExtend() {
    if (!extendTargetId || extending) return;
    const days = Number(extendDays);
    if (!Number.isInteger(days) || days < 1) {
      toast.error(t('proxy.extend.daysInvalid'));
      return;
    }

    setExtending(true);
    try {
      const { item } = await extendProxy(extendTargetId, days);
      refreshAll();
      handleCloseExtend();
      toast.success(
        t('proxy.extend.success', {
          date: item.expiresAt ?? t('proxy.extend.successFallback'),
        }),
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('proxy.extend.error'));
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
  }

  return (
    <PageShell fullBleed>
      <div className='flex min-w-0 flex-1 flex-col overflow-hidden'>
        <div className='shrink-0'>
          <ProxyPageHeader activeTab={activeTab} onTabChange={handleTabChange} />
        </div>

        {activeTab === 'monitoring' ? (
          <>
            <div className='shrink-0'>
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
            </div>
            <div className='mt-4 flex min-h-0 flex-1 flex-col overflow-hidden card-surface px-5 pt-3 pb-4'>
              <div className='min-h-0 flex-1 overflow-auto'>
                <ProxiesTable
                  proxies={list.items}
                  selectedIds={selectedIds}
                  loading={list.loading}
                  rowNumberStart={(list.page - 1) * list.limit + 1}
                  pingingIds={pingingIds}
                  onToggleRow={handleToggleRow}
                  onToggleAll={handleToggleAll}
                  onPing={handlePingRow}
                  onExtend={handleOpenExtend}
                />
              </div>
              <div className='shrink-0'>
                <MailAccountsPagination
                  page={list.page}
                  limit={list.limit}
                  total={list.total}
                  totalPages={list.totalPages}
                  onPageChange={handlePageChange}
                  onLimitChange={handleLimitChange}
                  locale={paginationLocale}
                />
              </div>
            </div>
          </>
        ) : null}

        {activeTab === 'providers' ? (
          <div className='flex min-h-0 flex-1 flex-col overflow-hidden'>
            <ProxyProvidersTab />
          </div>
        ) : null}
      </div>

      <AddProxyModal open={showAddModal} onClose={() => setShowAddModal(false)} onSuccess={handleAddSuccess} />

      <Modal
        open={extendTargetId !== null}
        onClose={handleCloseExtend}
        title={t('proxy.extend.title')}
        footer={
          <>
            <Button variant='outlined' size='sm' className='rounded-lg' onClick={handleCloseExtend} disabled={extending}>
              {t('common:actions.cancel')}
            </Button>
            <Button size='sm' className='rounded-lg' disabled={extending} onClick={handleConfirmExtend}>
              {extending ? t('common:actions.saving') : t('common:actions.save')}
            </Button>
          </>
        }
      >
        {extendTarget ? (
          <div className='space-y-4'>
            <p className='text-sm text-neutral-300'>
              {t('proxy.extend.body')}{' '}
              <span className='font-mono text-neutral-100'>
                {extendTarget.host}:{extendTarget.port}
              </span>
              {extendTarget.expiresAt ? (
                <>
                  {' '}
                  {t('proxy.extend.currentExpiry', {
                    date: new Date(extendTarget.expiresAt).toLocaleDateString(dateLocale),
                  })}
                </>
              ) : (
                ` ${t('proxy.extend.noExpiry')}`
              )}
            </p>
            <div>
              <label htmlFor='extend-days' className='mb-1.5 block text-xs font-medium text-neutral-400'>
                {t('proxy.extend.daysLabel')}
              </label>
              <Input
                id='extend-days'
                type='number'
                min={1}
                step={1}
                placeholder={t('proxy.extend.daysPlaceholder')}
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
        title={t('proxy.deleteSelected.title')}
        footer={
          <>
            <Button
              variant='outlined'
              size='sm'
              className='rounded-lg'
              onClick={() => setShowDeleteSelectedModal(false)}
              disabled={deletingSelected}
            >
              {t('common:actions.cancel')}
            </Button>
            <Button size='sm' className='rounded-lg' disabled={deletingSelected} onClick={handleDeleteSelected}>
              {deletingSelected
                ? t('proxy.toolbar.deleting')
                : t('proxy.deleteSelected.confirm', { count: selectedProxies.length })}
            </Button>
          </>
        }
      >
        <p className='text-sm text-neutral-300'>
          {t('proxy.deleteSelected.body', { count: selectedProxies.length })}
        </p>
      </Modal>

      <Modal
        open={showRemoveFailedModal}
        onClose={() => setShowRemoveFailedModal(false)}
        title={t('proxy.removeFailedModal.title')}
        footer={
          <>
            <Button
              variant='outlined'
              size='sm'
              className='rounded-lg'
              onClick={() => setShowRemoveFailedModal(false)}
              disabled={removingFailed}
            >
              {t('common:actions.cancel')}
            </Button>
            <Button size='sm' className='rounded-lg' disabled={removingFailed} onClick={handleRemoveFailed}>
              {removingFailed ? t('proxy.toolbar.deleting') : t('proxy.removeFailedModal.confirm')}
            </Button>
          </>
        }
      >
        <p className='text-sm text-neutral-300'>{t('proxy.removeFailedModal.body')}</p>
      </Modal>

      <ProxyExpiryWarningModal />
    </PageShell>
  );
}
