import { useForm } from 'react-hook-form';
import { useEffect, useState } from 'react';
import { createNiche, deleteNiche, fetchNicheUsage, fetchNiches, updateNiche } from '../../api/niches';
import { Button, Input, Modal } from '../ui';
import type { AddNicheFormValues, Niche, NicheMutationAction, NicheUsage } from '../../types/niche';
import { NicheInUseModal } from './NicheInUseModal';

interface AddNicheModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: (action: NicheMutationAction) => void;
}

function PencilIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 6h18" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

export function AddNicheModal({ open, onClose, onSuccess }: AddNicheModalProps) {
  const [apiError, setApiError] = useState<string | null>(null);
  const [niches, setNiches] = useState<Niche[]>([]);
  const [nichesLoading, setNichesLoading] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState('');
  const [rowBusyKey, setRowBusyKey] = useState<string | null>(null);
  const [inUseWarning, setInUseWarning] = useState<{ label: string; usage: NicheUsage } | null>(
    null,
  );
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<AddNicheFormValues>({
    defaultValues: { label: '' },
  });

  useEffect(() => {
    if (!open) return;

    const controller = new AbortController();
    setNichesLoading(true);
    setEditingKey(null);
    setEditingLabel('');
    setRowBusyKey(null);
    setInUseWarning(null);
    setApiError(null);

    fetchNiches({ signal: controller.signal })
      .then((data) => {
        setNiches(data.items);
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setNiches([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) setNichesLoading(false);
      });

    return () => controller.abort();
  }, [open]);

  function handleClose() {
    reset({ label: '' });
    setApiError(null);
    setEditingKey(null);
    setEditingLabel('');
    setRowBusyKey(null);
    setInUseWarning(null);
    onClose();
  }

  async function onSubmit(values: AddNicheFormValues) {
    setApiError(null);
    try {
      const { item } = await createNiche({ label: values.label.trim() });
      reset({ label: '' });
      setNiches((prev) => [item, ...prev.filter((n) => n.key !== item.key)]);
      onSuccess?.('create');
    } catch (err) {
      setApiError(err instanceof Error ? err.message : 'Không thể tạo niche');
    }
  }

  function startEdit(niche: Niche) {
    setApiError(null);
    setEditingKey(niche.key);
    setEditingLabel(niche.label);
  }

  function cancelEdit() {
    setEditingKey(null);
    setEditingLabel('');
  }

  async function saveEdit(key: string) {
    const label = editingLabel.trim();
    if (!label) {
      setApiError('Tên niche là bắt buộc');
      return;
    }

    setApiError(null);
    setRowBusyKey(key);
    try {
      const { item } = await updateNiche(key, { label });
      setNiches((prev) => prev.map((n) => (n.key === key ? item : n)));
      setEditingKey(null);
      setEditingLabel('');
      onSuccess?.('update');
    } catch (err) {
      setApiError(err instanceof Error ? err.message : 'Không thể cập nhật niche');
    } finally {
      setRowBusyKey(null);
    }
  }

  async function handleDelete(niche: Niche) {
    setApiError(null);
    setRowBusyKey(niche.key);
    try {
      const { usage } = await fetchNicheUsage(niche.key);
      if (usage.inUse) {
        setInUseWarning({ label: niche.label, usage });
        return;
      }

      await deleteNiche(niche.key);
      setNiches((prev) => prev.filter((n) => n.key !== niche.key));
      if (editingKey === niche.key) {
        setEditingKey(null);
        setEditingLabel('');
      }
      onSuccess?.('delete');
    } catch (err) {
      setApiError(err instanceof Error ? err.message : 'Không thể xóa niche');
    } finally {
      setRowBusyKey(null);
    }
  }

  const listBusy = isSubmitting || rowBusyKey !== null;

  return (
    <>
      <Modal
        open={open}
        onClose={() => {
          if (inUseWarning !== null) return;
          handleClose();
        }}
        title="Thêm niche"
        footer={
          <>
            <Button
              variant="outlined"
              size="sm"
              className="rounded-lg"
              onClick={handleClose}
              disabled={listBusy}
            >
              Hủy
            </Button>
            <Button
              size="sm"
              className="rounded-lg"
              disabled={listBusy}
              form="add-niche-form"
              type="submit"
            >
              {isSubmitting ? 'Đang lưu...' : 'Thêm niche'}
            </Button>
          </>
        }
      >
        <form id="add-niche-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label htmlFor="niche-label" className="mb-1.5 block text-xs font-medium text-neutral-400">
              Tên niche
            </label>
            <Input
              id="niche-label"
              placeholder="Senior Health"
              className="h-10 rounded-lg"
              {...register('label', { required: 'Tên niche là bắt buộc' })}
            />
            {errors.label ? <p className="mt-1 text-xs text-danger">{errors.label.message}</p> : null}
          </div>
          {apiError ? <p className="text-xs text-danger">{apiError}</p> : null}

          <div>
            <p className="mb-1.5 text-xs font-medium text-neutral-400">
              Niche hiện có
              {!nichesLoading && niches.length > 0 ? (
                <span className="ml-1 font-normal text-neutral-500">({niches.length})</span>
              ) : null}
            </p>
            <div className="max-h-48 overflow-y-auto rounded-lg border border-neutral-700 bg-neutral-900">
              {nichesLoading ? (
                <p className="px-3 py-2.5 text-xs text-neutral-500">Đang tải...</p>
              ) : niches.length === 0 ? (
                <p className="px-3 py-2.5 text-xs text-neutral-500">Chưa có niche</p>
              ) : (
                <ul className="divide-y divide-neutral-800">
                  {niches.map((niche) => {
                    const isEditing = editingKey === niche.key;
                    const isBusy = rowBusyKey === niche.key;

                    return (
                      <li key={niche.key} className="flex items-center gap-2 px-3 py-2">
                        {isEditing ? (
                          <Input
                            value={editingLabel}
                            onChange={(e) => setEditingLabel(e.target.value)}
                            className="h-8 min-w-0 flex-1 rounded-lg"
                            disabled={isBusy}
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                void saveEdit(niche.key);
                              }
                              if (e.key === 'Escape') {
                                e.preventDefault();
                                cancelEdit();
                              }
                            }}
                          />
                        ) : (
                          <span className="min-w-0 flex-1 truncate text-sm text-neutral-200">
                            {niche.label}
                          </span>
                        )}

                        <div className="flex shrink-0 items-center gap-1">
                          {isEditing ? (
                            <>
                              <Button
                                type="button"
                                variant="outlined"
                                size="sm"
                                className="size-7 rounded-md p-0"
                                disabled={isBusy}
                                title="Lưu"
                                aria-label="Lưu"
                                onClick={() => void saveEdit(niche.key)}
                              >
                                <CheckIcon className="size-3.5" />
                              </Button>
                              <Button
                                type="button"
                                variant="outlined"
                                size="sm"
                                className="size-7 rounded-md p-0"
                                disabled={isBusy}
                                title="Hủy"
                                aria-label="Hủy"
                                onClick={cancelEdit}
                              >
                                <XIcon className="size-3.5" />
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button
                                type="button"
                                variant="outlined"
                                size="sm"
                                className="size-7 rounded-md p-0"
                                disabled={listBusy}
                                title="Sửa"
                                aria-label={`Sửa ${niche.label}`}
                                onClick={() => startEdit(niche)}
                              >
                                <PencilIcon className="size-3.5" />
                              </Button>
                              <Button
                                type="button"
                                variant="danger"
                                size="sm"
                                className="size-7 rounded-md p-0"
                                disabled={listBusy}
                                title="Xóa"
                                aria-label={`Xóa ${niche.label}`}
                                onClick={() => void handleDelete(niche)}
                              >
                                <TrashIcon className="size-3.5" />
                              </Button>
                            </>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </form>
      </Modal>

      <NicheInUseModal
        open={inUseWarning !== null}
        nicheLabel={inUseWarning?.label ?? ''}
        usage={inUseWarning?.usage ?? null}
        onClose={() => setInUseWarning(null)}
      />
    </>
  );
}
