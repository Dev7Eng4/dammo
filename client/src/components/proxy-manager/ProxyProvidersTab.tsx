import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { deleteProxyProvider, fetchProxyProviders } from '../../api/proxies';
import { AddProxyProviderModal } from './AddProxyProviderModal';
import { EditProxyProviderModal } from './EditProxyProviderModal';
import { ProxyProvidersTable } from './ProxyProvidersTable';
import { Button, Modal, useToast } from '../ui';
import { useAbortableEffect } from '../../hooks';
import type { ProxyProvider } from '../../types/proxy';

export function ProxyProvidersTab() {
  const { t } = useTranslation(['browser', 'common']);
  const { toast } = useToast();
  const [providers, setProviders] = useState<ProxyProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<ProxyProvider | null>(null);
  const [deleting, setDeleting] = useState(false);

  useAbortableEffect(
    async (signal) => {
      setLoading(true);
      try {
        const data = await fetchProxyProviders({ signal });
        setProviders(data.items);
      } catch {
        setProviders([]);
      } finally {
        if (!signal.aborted) setLoading(false);
      }
    },
    [refreshKey],
  );

  function refresh() {
    setRefreshKey((key) => key + 1);
  }

  function handleEdit(provider: ProxyProvider) {
    setSelectedProvider(provider);
    setShowEditModal(true);
  }

  function handleDeleteClick(provider: ProxyProvider) {
    setSelectedProvider(provider);
    setShowDeleteModal(true);
  }

  async function handleConfirmDelete() {
    if (!selectedProvider) return;
    setDeleting(true);
    try {
      await deleteProxyProvider(selectedProvider.id);
      setShowDeleteModal(false);
      setSelectedProvider(null);
      refresh();
      toast.success(t('proxy.providers.toast.deleted'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('proxy.providers.toast.deleteError'));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="shrink-0 flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        <span className="text-sm text-neutral-400">
          {t('proxy.providers.count', { count: providers.length.toLocaleString() })}
        </span>
        <Button size="sm" className="rounded-lg" onClick={() => setShowAddModal(true)}>
          {t('proxy.providers.add')}
        </Button>
      </div>

      <div className="mt-4 flex min-h-0 flex-1 flex-col overflow-hidden card-surface px-5 pt-3 pb-4">
        <div className="min-h-0 flex-1 overflow-auto">
          <ProxyProvidersTable
            providers={providers}
            loading={loading}
            onEdit={handleEdit}
            onDelete={handleDeleteClick}
          />
        </div>
      </div>

      <AddProxyProviderModal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSuccess={() => {
          refresh();
          toast.success(t('proxy.providers.toast.added'));
        }}
      />

      <EditProxyProviderModal
        open={showEditModal}
        provider={selectedProvider}
        onClose={() => {
          setShowEditModal(false);
          setSelectedProvider(null);
        }}
        onSuccess={() => {
          refresh();
          toast.success(t('proxy.providers.toast.updated'));
        }}
      />

      <Modal
        open={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        title={t('proxy.providers.deleteModal.title')}
        footer={
          <>
            <Button
              variant="outlined"
              size="sm"
              className="rounded-lg"
              onClick={() => setShowDeleteModal(false)}
              disabled={deleting}
            >
              {t('common:actions.cancel')}
            </Button>
            <Button size="sm" className="rounded-lg" disabled={deleting} onClick={handleConfirmDelete}>
              {deleting ? t('proxy.toolbar.deleting') : t('common:actions.delete')}
            </Button>
          </>
        }
      >
        <p className="text-sm text-neutral-300">
          {t('proxy.providers.deleteModal.body', { name: selectedProvider?.name })}
        </p>
      </Modal>
    </div>
  );
}
