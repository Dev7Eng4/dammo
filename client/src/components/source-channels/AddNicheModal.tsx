import { useForm } from 'react-hook-form';
import { useEffect, useState } from 'react';
import { createNiche, fetchNiches } from '../../api/niches';
import { Button, Input, Modal } from '../ui';
import type { AddNicheFormValues, Niche } from '../../types/niche';

interface AddNicheModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function AddNicheModal({ open, onClose, onSuccess }: AddNicheModalProps) {
  const [apiError, setApiError] = useState<string | null>(null);
  const [niches, setNiches] = useState<Niche[]>([]);
  const [nichesLoading, setNichesLoading] = useState(false);
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
    onClose();
  }

  async function onSubmit(values: AddNicheFormValues) {
    setApiError(null);
    try {
      const { item } = await createNiche({ label: values.label.trim() });
      reset({ label: '' });
      setNiches((prev) => [item, ...prev.filter((n) => n.key !== item.key)]);
      onSuccess?.();
    } catch (err) {
      setApiError(err instanceof Error ? err.message : 'Không thể tạo niche');
    }
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Thêm niche"
      footer={
        <>
          <Button
            variant="outlined"
            size="sm"
            className="rounded-lg"
            onClick={handleClose}
            disabled={isSubmitting}
          >
            Hủy
          </Button>
          <Button
            size="sm"
            className="rounded-lg"
            disabled={isSubmitting}
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
            Tên niche (tiếng Anh)
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
                {niches.map((niche) => (
                  <li key={niche.key} className="flex items-baseline justify-between gap-3 px-3 py-2">
                    <span className="text-sm text-neutral-200">{niche.label}</span>
                    <span className="shrink-0 font-mono text-[11px] text-neutral-500">{niche.key}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </form>
    </Modal>
  );
}
