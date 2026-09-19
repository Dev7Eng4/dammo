import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { deleteVisualStyle, fetchVisualStyles } from '../api/visualStyles';
import { PageHeader, PageShell } from '../components/layout';
import { AddVisualStyleModal } from '../components/visual-styles/AddVisualStyleModal';
import { EditVisualStyleModal } from '../components/visual-styles/EditVisualStyleModal';
import { VisualStylesTable } from '../components/visual-styles/VisualStylesTable';
import { Button, Modal, useToast } from '../components/ui';
import { useAbortableEffect } from '../hooks';
import type { VisualStyle } from '../types/visualStyle';
import { Palette } from 'lucide-react';

export function VisualStylesPage() {
  const { t } = useTranslation(['content', 'common']);
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
      toast.success(t('visual.toast.deleted'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('visual.toast.deleteError'));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <PageShell fullBleed>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="shrink-0 space-y-4">
          <PageHeader
            title={t('visual.page.title')}
            subtitle={t('visual.page.subtitle')}
            icon={Palette}
          />

          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
            <span className="text-sm text-neutral-400">
              {t('visual.count', { count: styles.length.toLocaleString() })}
            </span>
            <Button size="sm" className="rounded-lg" onClick={() => setShowAddModal(true)}>
              {t('visual.add')}
            </Button>
          </div>
        </div>

        <div className="mt-4 flex min-h-0 flex-1 flex-col overflow-hidden card-surface px-5 pt-3 pb-4">
          <div className="min-h-0 flex-1 overflow-auto">
            <VisualStylesTable
              styles={styles}
              loading={loading}
              onEdit={handleEdit}
              onDelete={handleDeleteClick}
            />
          </div>
        </div>
      </div>

      <AddVisualStyleModal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSuccess={() => {
          refresh();
          toast.success(t('visual.toast.added'));
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
          toast.success(t('visual.toast.updated'));
        }}
      />

      <Modal
        open={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        title={t('visual.deleteTitle')}
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
              {deleting ? t('visual.deleteDeleting') : t('common:actions.delete')}
            </Button>
          </>
        }
      >
        <p className="text-sm text-neutral-300">
          {t('visual.deleteBody', { name: selectedStyle?.name })}
        </p>
      </Modal>
    </PageShell>
  );
}
