import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { deleteMascot, fetchMascots, mascotImageUrl } from '../../api/mascots';
import { useAbortableEffect } from '../../hooks';
import type { MascotListItem } from '../../types/mascot';
import { Button, Modal, useToast } from '../ui';
import { MascotModal } from './MascotModal';

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2'>
      <path d='M3 6h18' />
      <path d='M8 6V4h8v2' />
      <path d='M19 6l-1 14H6L5 6' />
      <path d='M10 11v6' />
      <path d='M14 11v6' />
    </svg>
  );
}

function CopyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2'>
      <rect x='9' y='9' width='11' height='11' rx='2' />
      <path d='M5 15V6a2 2 0 0 1 2-2h9' />
    </svg>
  );
}

export function MascotsPanel() {
  const { t, i18n } = useTranslation(['content', 'common']);
  const { toast } = useToast();
  const [items, setItems] = useState<MascotListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<MascotListItem | null>(null);
  const [pendingDelete, setPendingDelete] = useState<MascotListItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  useAbortableEffect(
    async signal => {
      setLoading(true);
      try {
        const data = await fetchMascots({ signal });
        setItems(data.items);
      } catch {
        if (signal.aborted) return;
        setItems([]);
      } finally {
        if (!signal.aborted) setLoading(false);
      }
    },
    [refreshKey],
  );

  function refresh() {
    setRefreshKey(key => key + 1);
  }

  function openCreate() {
    setEditing(null);
    setModalOpen(true);
  }

  function openEdit(item: MascotListItem) {
    setEditing(item);
    setModalOpen(true);
  }

  async function copyPrompt(prompt: string) {
    try {
      await navigator.clipboard.writeText(prompt);
      toast.success(t('assets.mascots.toast.copied'));
    } catch {
      toast.error(t('assets.mascots.toast.copyError'));
    }
  }

  async function handleConfirmDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await deleteMascot(pendingDelete.id);
      setPendingDelete(null);
      refresh();
      toast.success(t('assets.mascots.toast.deleted'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('assets.mascots.toast.deleteError'));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className='space-y-4'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <span className='text-sm text-neutral-400'>
          {t('assets.mascots.count', {
            count: items.length.toLocaleString(i18n.language === 'en' ? 'en-US' : 'vi-VN'),
          })}
        </span>
        <Button size='sm' className='rounded-lg' onClick={openCreate}>
          {t('assets.mascots.add')}
        </Button>
      </div>

      <div className='card-surface p-5'>
        {loading ? (
          <p className='py-10 text-center text-sm text-neutral-500'>{t('assets.mascots.loading')}</p>
        ) : items.length === 0 ? (
          <p className='py-10 text-center text-sm text-neutral-500'>{t('assets.mascots.empty')}</p>
        ) : (
          <div className='grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3'>
            {items.map(item => (
              <div
                key={item.id}
                className='flex gap-3 rounded-xl border border-border bg-surface-elevated/40 p-3 transition hover:border-neutral-600'
              >
                <button
                  type='button'
                  className='flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-neutral-800 bg-neutral-950'
                  onClick={() => openEdit(item)}
                >
                  {item.hasImage ? (
                    <img
                      src={mascotImageUrl(item.id, item.updatedAt)}
                      alt={item.name}
                      className='h-full w-full object-contain'
                    />
                  ) : (
                    <span className='px-1 text-center text-[10px] text-neutral-500'>
                      {t('assets.mascots.noImage')}
                    </span>
                  )}
                </button>
                <div className='flex min-w-0 flex-1 flex-col'>
                  <button type='button' className='min-w-0 text-left' onClick={() => openEdit(item)}>
                    <p className='truncate text-sm font-medium text-neutral-100'>{item.name}</p>
                    <p className='mt-1 line-clamp-3 text-xs text-neutral-500'>{item.prompt}</p>
                  </button>
                  <div className='mt-auto flex items-center gap-1 pt-2'>
                    <button
                      type='button'
                      title={t('assets.mascots.copyPrompt')}
                      className='rounded-md p-1.5 text-neutral-500 hover:bg-neutral-800 hover:text-neutral-100'
                      onClick={() => void copyPrompt(item.prompt)}
                    >
                      <CopyIcon className='size-4' />
                    </button>
                    <button
                      type='button'
                      title={t('common:actions.delete')}
                      className='rounded-md p-1.5 text-neutral-500 hover:bg-neutral-800 hover:text-rose-400'
                      onClick={() => setPendingDelete(item)}
                    >
                      <TrashIcon className='size-4' />
                    </button>
                    {!item.hasImage ? (
                      <span className='ml-auto text-[10px] text-amber-400'>
                        {t('assets.mascots.needsImage')}
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <MascotModal
        open={modalOpen}
        mascot={editing}
        onClose={() => setModalOpen(false)}
        onSuccess={() => {
          refresh();
          toast.success(editing ? t('assets.mascots.toast.saved') : t('assets.mascots.toast.added'));
        }}
      />

      <Modal
        open={Boolean(pendingDelete)}
        onClose={deleting ? () => undefined : () => setPendingDelete(null)}
        title={t('assets.mascots.deleteTitle')}
        footer={
          <>
            <Button
              variant='outlined'
              size='sm'
              className='rounded-lg'
              onClick={() => setPendingDelete(null)}
              disabled={deleting}
            >
              {t('common:actions.cancel')}
            </Button>
            <Button size='sm' className='rounded-lg' disabled={deleting} onClick={() => void handleConfirmDelete()}>
              {deleting ? t('common:actions.deleting') : t('common:actions.delete')}
            </Button>
          </>
        }
      >
        <p className='text-sm text-neutral-300'>
          {t('assets.mascots.deleteBody', { name: pendingDelete?.name ?? '' })}
        </p>
      </Modal>
    </div>
  );
}
