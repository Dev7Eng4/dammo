import { useState } from 'react';
import { deleteProxyProvider, fetchProxyProviders } from '../../api/proxies';
import { AddProxyProviderModal } from './AddProxyProviderModal';
import { EditProxyProviderModal } from './EditProxyProviderModal';
import { ProxyProvidersTable } from './ProxyProvidersTable';
import { Button, Modal, useToast } from '../ui';
import { useAbortableEffect } from '../../hooks';
import type { ProxyProvider } from '../../types/proxy';

export function ProxyProvidersTab() {
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
      toast.success('Đã xóa nhà cung cấp');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Xóa thất bại');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        <span className="text-sm text-neutral-400">
          {providers.length.toLocaleString()} nhà cung cấp
        </span>
        <Button size="sm" className="rounded-lg" onClick={() => setShowAddModal(true)}>
          + Thêm nhà cung cấp
        </Button>
      </div>

      <div className="mt-4 card-surface px-5 pt-3 pb-4">
        <ProxyProvidersTable
          providers={providers}
          loading={loading}
          onEdit={handleEdit}
          onDelete={handleDeleteClick}
        />
      </div>

      <AddProxyProviderModal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSuccess={() => {
          refresh();
          toast.success('Đã thêm nhà cung cấp');
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
          toast.success('Đã cập nhật nhà cung cấp');
        }}
      />

      <Modal
        open={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        title="Xóa nhà cung cấp"
        footer={
          <>
            <Button
              variant="outlined"
              size="sm"
              className="rounded-lg"
              onClick={() => setShowDeleteModal(false)}
              disabled={deleting}
            >
              Hủy
            </Button>
            <Button size="sm" className="rounded-lg" disabled={deleting} onClick={handleConfirmDelete}>
              {deleting ? 'Đang xóa...' : 'Xóa'}
            </Button>
          </>
        }
      >
        <p className="text-sm text-neutral-300">
          Xóa nhà cung cấp <strong className="text-neutral-100">{selectedProvider?.name}</strong>?
        </p>
      </Modal>
    </>
  );
}
