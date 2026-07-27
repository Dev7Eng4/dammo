import { useState } from 'react';
import { deleteVisualStyle, fetchVisualStyles } from '../api/visualStyles';
import { AddVisualStyleModal } from '../components/visual-styles/AddVisualStyleModal';
import { EditVisualStyleModal } from '../components/visual-styles/EditVisualStyleModal';
import { VisualStylesTable } from '../components/visual-styles/VisualStylesTable';
import { Button, Modal, useToast } from '../components/ui';
import { useAbortableEffect } from '../hooks';
import type { VisualStyle } from '../types/visualStyle';

export function VisualStylesPage() {
  const { toast } = useToast();
  const [styles, setStyles] = useState<VisualStyle[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedStyle, setSelectedStyle] = useState<VisualStyle | null>(null);
  const [deleting, setDeleting] = useState(false);

  useAbortableEffect(
    async (signal) => {
      setLoading(true);
      try {
        const data = await fetchVisualStyles({ signal });
        setStyles(data.items);
      } catch {
        setStyles([]);
      } finally {
        if (!signal.aborted) setLoading(false);
      }
    },
    [refreshKey],
  );

  function refresh() {
    setRefreshKey((key) => key + 1);
  }

  function handleEdit(style: VisualStyle) {
    setSelectedStyle(style);
    setShowEditModal(true);
  }

  function handleDeleteClick(style: VisualStyle) {
    setSelectedStyle(style);
    setShowDeleteModal(true);
  }

  async function handleConfirmDelete() {
    if (!selectedStyle) return;
    setDeleting(true);
    try {
      await deleteVisualStyle(selectedStyle.id);
      setShowDeleteModal(false);
      setSelectedStyle(null);
      refresh();
      toast.success('Đã xóa phong cách hình ảnh');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Xóa thất bại');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-neutral-100">Phong cách hình ảnh</h1>
        <p className="mt-1 text-sm text-neutral-400">
          Quản lý preset phong cách hình ảnh (anime, chibi, cinematic, ...).
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        <span className="text-sm text-neutral-400">
          {styles.length.toLocaleString()} phong cách
        </span>
        <Button size="sm" className="rounded-lg" onClick={() => setShowAddModal(true)}>
          + Thêm phong cách
        </Button>
      </div>

      <div className="card-surface px-5 pt-3 pb-4">
        <VisualStylesTable
          styles={styles}
          loading={loading}
          onEdit={handleEdit}
          onDelete={handleDeleteClick}
        />
      </div>

      <AddVisualStyleModal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSuccess={() => {
          refresh();
          toast.success('Đã thêm phong cách hình ảnh');
        }}
      />

      <EditVisualStyleModal
        open={showEditModal}
        style={selectedStyle}
        onClose={() => {
          setShowEditModal(false);
          setSelectedStyle(null);
        }}
        onSuccess={() => {
          refresh();
          toast.success('Đã cập nhật phong cách hình ảnh');
        }}
      />

      <Modal
        open={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        title="Xóa phong cách hình ảnh"
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
          Xóa phong cách hình ảnh <strong className="text-neutral-100">{selectedStyle?.name}</strong>?
        </p>
      </Modal>
    </div>
  );
}
