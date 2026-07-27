import { useEffect, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { createGpmProfile } from '../../api/gpm';
import { fetchProxies, setProfileProxy } from '../../api/proxies';
import { fetchMailAccounts } from '../../api/mailAccounts';
import { buildRawProxy, formatProxyOptionLabel } from '../../lib/proxy-format';
import type { AddGpmProfileFormValues, GpmGroup } from '../../types/gpm';
import type { MailAccount } from '../../types/mailAccount';
import type { Proxy } from '../../types/proxy';
import { Button, Modal, Select, Textarea } from '../ui';

interface AddGpmProfileModalProps {
  open: boolean;
  groups: GpmGroup[];
  usedEmails: string[];
  onClose: () => void;
  onSuccess: () => void;
}

const defaultValues: AddGpmProfileFormValues = {
  name: '',
  group_id: '',
  proxyId: '',
  note: '',
};

export function AddGpmProfileModal({ open, groups, usedEmails, onClose, onSuccess }: AddGpmProfileModalProps) {
  const [apiError, setApiError] = useState<string | null>(null);
  const [proxies, setProxies] = useState<Proxy[]>([]);
  const [proxiesLoading, setProxiesLoading] = useState(false);
  const [mailAccounts, setMailAccounts] = useState<MailAccount[]>([]);
  const [mailAccountsLoading, setMailAccountsLoading] = useState(false);

  const usedEmailsSet = useMemo(
    () => new Set(usedEmails.map((email) => email.trim().toLowerCase()).filter(Boolean)),
    [usedEmails],
  );

  const emailOptions = useMemo(() => {
    const seen = new Set<string>();
    return mailAccounts
      .map((account) => account.email)
      .filter(Boolean)
      .filter((email) => {
        const normalized = email.trim().toLowerCase();
        if (!normalized) return false;
        if (seen.has(normalized)) return false;
        seen.add(normalized);
        return !usedEmailsSet.has(normalized);
      })
      .map((email) => ({ value: email, label: email }));
  }, [mailAccounts, usedEmailsSet]);

  const groupOptions = useMemo(
    () => [
      { value: '', label: 'Không nhóm' },
      ...groups.map((group) => ({ value: group.id, label: group.name })),
    ],
    [groups],
  );

  const proxyOptions = useMemo(
    () => [
      { value: '', label: 'Không proxy' },
      ...proxies.map((proxy) => ({
        value: proxy.id,
        label: formatProxyOptionLabel(proxy),
      })),
    ],
    [proxies],
  );

  const {
    register,
    handleSubmit,
    reset,
    control,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<AddGpmProfileFormValues>({
    defaultValues,
  });

  const groupId = watch('group_id');
  const proxyId = watch('proxyId');

  useEffect(() => {
    if (!open) return;
    reset(defaultValues);
    setApiError(null);
  }, [open, reset]);

  useEffect(() => {
    if (!open) return;

    const controller = new AbortController();
    setProxiesLoading(true);

    fetchProxies('all', '', 1, 100, { signal: controller.signal })
      .then((response) => setProxies(response.items))
      .catch((err) => {
        if (!controller.signal.aborted) {
          setProxies([]);
          setApiError(err instanceof Error ? err.message : 'Không tải được danh sách proxy');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setProxiesLoading(false);
      });

    return () => controller.abort();
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const controller = new AbortController();
    setMailAccountsLoading(true);

    fetchMailAccounts('', 1, 100, { signal: controller.signal })
      .then((res) => {
        setMailAccounts(res.items);

        const available = res.items
          .map((a) => a.email)
          .filter((email) => {
            const normalized = email.trim().toLowerCase();
            return normalized && !usedEmailsSet.has(normalized);
          });

        setValue('name', available[0] ?? '');
      })
      .catch((err) => {
        if (!controller.signal.aborted) {
          setMailAccounts([]);
          setApiError(err instanceof Error ? err.message : 'Không tải được danh sách email');
          setValue('name', '');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setMailAccountsLoading(false);
      });

    return () => controller.abort();
  }, [open, setValue, usedEmailsSet]);

  function handleClose() {
    reset(defaultValues);
    setApiError(null);
    onClose();
  }

  async function onSubmit(values: AddGpmProfileFormValues) {
    setApiError(null);
    try {
      const selectedProxy = values.proxyId
        ? proxies.find((proxy) => proxy.id === values.proxyId)
        : undefined;

      const { item } = await createGpmProfile({
        name: values.name.trim(),
        group_id: values.group_id || null,
        raw_proxy: selectedProxy ? buildRawProxy(selectedProxy) : undefined,
        note: values.note.trim() || null,
      });

      if (values.proxyId) {
        await setProfileProxy(item.id, values.proxyId);
      }

      reset(defaultValues);
      onSuccess();
      onClose();
    } catch (err) {
      setApiError(err instanceof Error ? err.message : 'Tạo profile thất bại');
    }
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Thêm GPM Profile"
      footer={
        <>
          <Button variant="outlined" size="sm" className="rounded-lg" onClick={handleClose} disabled={isSubmitting}>
            Hủy
          </Button>
          <Button
            size="sm"
            className="rounded-lg"
            disabled={isSubmitting || proxiesLoading || mailAccountsLoading || emailOptions.length === 0}
            form="add-gpm-profile-form"
            type="submit"
          >
            {isSubmitting ? 'Đang tạo…' : 'Thêm Profile'}
          </Button>
        </>
      }
    >
      <form id="add-gpm-profile-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label htmlFor="gpm-profile-email" className="mb-1.5 block text-xs font-medium text-neutral-400">
            Email
          </label>
          <Controller
            name="name"
            control={control}
            rules={{ required: 'Email là bắt buộc' }}
            render={({ field }) => (
              <Select
                id="gpm-profile-email"
                options={emailOptions}
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                placeholder={
                  mailAccountsLoading
                    ? 'Đang tải email...'
                    : emailOptions.length === 0
                      ? 'Không còn email trống'
                      : 'Chọn email'
                }
                searchable
                searchPlaceholder="Tìm kiếm email..."
                disabled={isSubmitting || mailAccountsLoading || emailOptions.length === 0}
                triggerClassName="h-10 rounded-lg text-sm"
              />
            )}
          />
          {errors.name ? <p className="mt-1 text-xs text-danger">{errors.name.message}</p> : null}
        </div>

        <div>
          <label htmlFor="gpm-profile-group" className="mb-1.5 block text-xs font-medium text-neutral-400">
            Nhóm
          </label>
          <Select
            id="gpm-profile-group"
            value={groupId}
            onChange={(value) => setValue('group_id', value)}
            options={groupOptions}
            disabled={isSubmitting}
            triggerClassName="h-10 rounded-lg text-sm"
          />
        </div>

        <div>
          <label htmlFor="gpm-profile-proxy" className="mb-1.5 block text-xs font-medium text-neutral-400">
            Proxy
          </label>
          <Select
            id="gpm-profile-proxy"
            value={proxyId}
            onChange={(value) => setValue('proxyId', value)}
            options={proxyOptions}
            disabled={isSubmitting || proxiesLoading}
            triggerClassName="h-10 rounded-lg font-mono text-sm"
          />
          {proxiesLoading ? (
            <p className="mt-1 text-xs text-neutral-500">Đang tải proxy…</p>
          ) : null}
        </div>

        <div>
          <label htmlFor="gpm-profile-note" className="mb-1.5 block text-xs font-medium text-neutral-400">
            Ghi chú
          </label>
          <Textarea
            id="gpm-profile-note"
            rows={3}
            placeholder="Ghi chú tùy chọn"
            disabled={isSubmitting}
            {...register('note')}
          />
        </div>

        {apiError ? <p className="text-xs text-danger">{apiError}</p> : null}
      </form>
    </Modal>
  );
}
